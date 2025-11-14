import './index.css';
import { MapManager } from './map';

type NetworkNode = {
  globalId: number;
  latitude: number;
  longitude: number;
  altitude: number;
};

type UdpBridge = {
  onDataFromMain(callback: (data: unknown) => void): void;
};

type UdpRequest = {
  requestLatest(): Promise<unknown>;
};

type AircraftLike = {
  id: string;
  lat: number;
  lng: number;
  callSign: string;
  aircraftType: 'mother' | 'friendly' | 'threat' | 'self';
  isLocked?: boolean;
  isExecuted?: boolean;
};

declare global {
  interface Window {
    udp?: UdpBridge;
    udpRequest?: UdpRequest;
  }
}

class NodeVisualizer {
  private nodes: NetworkNode[] = [];
  private readonly visualizationArea: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly statusEl: HTMLDivElement;
  private readonly mapManager: MapManager;

  constructor(private readonly container: HTMLElement) {
    this.visualizationArea = document.createElement('div');
    this.visualizationArea.style.position = 'relative';
    this.visualizationArea.style.width = '100%';
    this.visualizationArea.style.height = '100%';

    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.zIndex = '1';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.backgroundColor = 'transparent';

    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Unable to acquire 2D rendering context');
    }
    this.ctx = ctx;

    this.statusEl = document.createElement('div');
    this.statusEl.style.position = 'absolute';
    this.statusEl.style.top = '16px';
    this.statusEl.style.left = '20px';
    this.statusEl.style.padding = '6px 12px';
    this.statusEl.style.background = 'rgba(0, 0, 0, 0.6)';
    this.statusEl.style.borderRadius = '6px';
    this.statusEl.style.fontFamily = 'monospace';
    this.statusEl.style.fontSize = '12px';
    this.statusEl.style.color = '#e0e0e0';

    this.mapManager = new MapManager();

    this.visualizationArea.appendChild(this.canvas);

    this.container.innerHTML = '';
    this.container.style.position = 'relative';
    this.container.appendChild(this.visualizationArea);
    this.container.appendChild(this.statusEl);

    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());
    this.setStatus('Waiting for live tracks…');
    this.render();
  }

  public updateNodes(nodes: NetworkNode[]): void {
    this.nodes = nodes;
    if (!nodes.length) {
      this.setStatus('No tracks detected');
    } else {
      this.setStatus(`Tracks: ${nodes.length}`);
    }
    this.ensureMapBackground();
    this.render();
  }

  public setStatus(message: string): void {
    this.statusEl.textContent = message;
  }

  private handleResize(): void {
    const { clientWidth, clientHeight } = this.visualizationArea;
    this.canvas.width = clientWidth;
    this.canvas.height = clientHeight;
    this.mapManager.resize();
    this.render();
  }

  private render(): void {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const hasLiveMap = Boolean(this.mapManager.getMapboxMap());
    if (!hasLiveMap) {
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, '#050505');
      gradient.addColorStop(1, '#000000');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (!this.nodes.length) {
      this.drawHint('Awaiting UDP data…');
      return;
    }

    const bounds = this.computeBounds(this.nodes);
    this.nodes.forEach((node, index) => {
      const { x, y } = this.projectToCanvas(node, bounds);
      const isPrimary = index === 0;
      this.drawNode(x, y, isPrimary);
    });
  }

  private computeBounds(nodes: NetworkNode[]) {
    const latitudes = nodes.map((n) => n.latitude);
    const longitudes = nodes.map((n) => n.longitude);
    const latMin = Math.min(...latitudes);
    const latMax = Math.max(...latitudes);
    const lonMin = Math.min(...longitudes);
    const lonMax = Math.max(...longitudes);

    return {
      latMin,
      latRange: Math.max(latMax - latMin, 0.0001),
      lonMin,
      lonRange: Math.max(lonMax - lonMin, 0.0001),
    };
  }

  private projectToCanvas(
    node: NetworkNode,
    bounds: { latMin: number; latRange: number; lonMin: number; lonRange: number },
  ) {
    const padding = Math.min(this.canvas.width, this.canvas.height) * 0.08;
    const usableWidth = this.canvas.width - padding * 2;
    const usableHeight = this.canvas.height - padding * 2;

    const normalizedLon = (node.longitude - bounds.lonMin) / bounds.lonRange;
    const normalizedLat = (node.latitude - bounds.latMin) / bounds.latRange;

    const x = padding + (isFinite(normalizedLon) ? normalizedLon : 0.5) * usableWidth;
    const y = padding + (1 - (isFinite(normalizedLat) ? normalizedLat : 0.5)) * usableHeight;

    return { x, y };
  }

  private drawNode(x: number, y: number, isPrimary: boolean): void {
    const radius = isPrimary ? 6 : 4;

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fillStyle = isPrimary ? '#ffffff' : 'rgba(255, 255, 255, 0.85)';
    this.ctx.shadowColor = '#ffffff';
    this.ctx.shadowBlur = isPrimary ? 16 : 8;
    this.ctx.fill();
    this.ctx.restore();
  }

  private drawHint(text: string): void {
    this.ctx.save();
    this.ctx.font = '14px monospace';
    this.ctx.fillStyle = '#888';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(text, this.canvas.width / 2, this.canvas.height / 2);
    this.ctx.restore();
  }

  private ensureMapBackground(): void {
    if (!this.nodes.length) return;
    const leadNode = this.nodes[0];
    const aircraft = this.toAircraft(leadNode);
    this.mapManager.createMapBackground(this.visualizationArea, aircraft as any);
    this.mapManager.updateCenter(aircraft.lat, aircraft.lng, this.calculateZoom());
  }

  private toAircraft(node: NetworkNode): AircraftLike {
    return {
      id: node.globalId.toString(),
      lat: node.latitude || 0,
      lng: node.longitude || 0,
      callSign: `Node-${node.globalId}`,
      aircraftType: 'friendly',
    };
  }

  private calculateZoom(): number {
    const population = Math.max(1, this.nodes.length);
    return Math.min(10, Math.max(2, 8 - Math.log10(population)));
  }
}

class NodeStream {
  constructor(private readonly visualizer: NodeVisualizer) {
    this.attachListeners();
  }

  private attachListeners(): void {
    const bridge = window.udp;
    const requester = window.udpRequest;

    if (bridge?.onDataFromMain) {
      bridge.onDataFromMain((payload) => this.handleIncomingPayload(payload));
      this.visualizer.setStatus('Listening for UDP data…');
    } else {
      this.visualizer.setStatus('UDP bridge unavailable');
      console.warn('udp bridge not found on window');
    }

    requester
      ?.requestLatest?.()
      .then((payload) => this.handleIncomingPayload(payload))
      .catch((err) => console.warn('Failed to retrieve latest nodes', err));
  }

  private handleIncomingPayload(payload: unknown): void {
    const nodes = this.normalizePayload(payload);
    this.visualizer.updateNodes(nodes);
  }

  private normalizePayload(payload: unknown): NetworkNode[] {
    if (!Array.isArray(payload)) {
      return [];
    }

    return payload
      .map((entry) => this.toNode(entry))
      .filter((node): node is NetworkNode => Boolean(node));
  }

  private toNode(entry: any): NetworkNode | null {
    const globalId = Number(entry?.globalId);
    const latitude = Number(entry?.latitude);
    const longitude = Number(entry?.longitude);
    const altitude = Number(entry?.altitude ?? 0);

    if ([globalId, latitude, longitude, altitude].some((value) => Number.isNaN(value))) {
      return null;
    }

    return { globalId, latitude, longitude, altitude };
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('nodes-container');
  if (!container) {
    console.warn('nodes-container element not found');
    return;
  }

  const visualizer = new NodeVisualizer(container);
  new NodeStream(visualizer);
});

