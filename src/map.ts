import mapboxgl from 'mapbox-gl';

 export type Aircraft = {
  id: string;
  lat: number;
  lng: number;
  callSign: string;
  aircraftType: 'mother' | 'friendly' | 'threat' | 'self';
  isLocked?: boolean;
  isExecuted?: boolean;
};

/**
 * MapManager: Manages all map-related operations including rendering, pan/zoom, and overlays.
 */
export class MapManager {
  private mapboxMap: mapboxgl.Map | null = null;
  private mapElement: HTMLElement | null = null;
  private panOffset: { x: number; y: number } = { x: 0, y: 0 };
  private zoomLevel: number = 1;
  private isDragging: boolean = false;
  private lastMousePos: { x: number; y: number } = { x: 0, y: 0 };
  private showMap: boolean = true;

  constructor(container: HTMLElement | null = null) {
    // Map will be initialized on demand when createMapBackground is called
  }

  /**
   * Initialize the Mapbox GL map in the given container.
   */
  public initializeMapboxMap(container: HTMLElement, lat: number, lng: number) {
    // Set Mapbox access token
    mapboxgl.accessToken = 'pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw';

    // Create Mapbox GL map
    this.mapboxMap = new mapboxgl.Map({
      container: container,
      style: {
        version: 8,
        sources: {
          'local-tiles': {
            type: 'raster',
            tiles: ['./tiles-map/{z}/{x}/{y}.png'],
            tileSize: 256,
            minzoom: 1,
            maxzoom: 18
          }
        },
        layers: [
          {
            id: 'local-tiles-layer',
            type: 'raster',
            source: 'local-tiles',
            paint: {
              'raster-opacity': 0.8
            }
          }
        ]
      },
      center: [lng, lat],
      zoom: 10,
      maxZoom: 18,
      minZoom: 1,
      interactive: false, // Disable user interaction
      attributionControl: false
    });

    // Wait for map to load
    this.mapboxMap.on('load', () => {
      console.log('🗺️ Mapbox GL map loaded successfully with local tiles');
    });

    // Handle map errors
    this.mapboxMap.on('error', (e) => {
      console.error('🗺️ Mapbox GL map error:', e);
    });
  }

  /**
   * Create the map background and insert it into the visualization area.
   */
  public createMapBackground(visualizationArea: HTMLElement, centerAircraft: Aircraft | null): void {
    if (!centerAircraft) return;

    // Check if map already exists - don't recreate
    const existingMap = visualizationArea.querySelector('#map-background') as HTMLElement;
    if (existingMap) {
      return;
    }

    const mapContainer = document.createElement('div');
    mapContainer.id = 'map-background';

    // Use live coordinates from network data
    const lat = centerAircraft.lat;
    const lng = centerAircraft.lng;

    console.log(`🗺️ Creating Mapbox GL map centered on: ${centerAircraft.callSign} at ${lat.toFixed(6)}, ${lng.toFixed(6)}`);

    mapContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 0;
      opacity: 0.8;
      pointer-events: none;
    `;

    visualizationArea.appendChild(mapContainer);
    this.mapElement = mapContainer;

    // Initialize Mapbox GL map
    this.initializeMapboxMap(mapContainer, lat, lng);
    // Disable interaction entirely to avoid Mapbox event handlers firing without pointer events
    this.mapboxMap?.dragPan.disable();
    this.mapboxMap?.scrollZoom.disable();
    this.mapboxMap?.boxZoom.disable();
    this.mapboxMap?.dragRotate.disable();
    this.mapboxMap?.keyboard.disable();
    this.mapboxMap?.doubleClickZoom.disable();
    this.mapboxMap?.touchZoomRotate.disable();
  }

  /**
   * Update map center/zoom without recreating the canvas.
   */
  public updateCenter(lat: number, lng: number, zoom?: number): void {
    if (!this.mapboxMap) return;
    const jumpOptions: mapboxgl.CameraOptions = {
      center: [lng, lat],
    };
    if (typeof zoom === 'number' && Number.isFinite(zoom)) {
      jumpOptions.zoom = zoom;
    }
    this.mapboxMap.jumpTo(jumpOptions);
  }

  /**
   * Resize the underlying Mapbox canvas (should be called when container size changes).
   */
  public resize(): void {
    this.mapboxMap?.resize();
  }

  /**
   * Get the current mapbox map instance.
   */
  public getMapboxMap(): mapboxgl.Map | null {
    return this.mapboxMap;
  }

  /**
   * Update map geographic pan based on pixel offset.
   */
  public updateMapGeographicPan(visualizationArea: HTMLElement, centerAircraft: Aircraft | null, panOffset: { x: number; y: number }): void {
    const mapBackground = visualizationArea.querySelector('#map-background') as HTMLElement;
    if (!mapBackground || !this.showMap || !centerAircraft) return;

    // Convert pixel pan offset to geographic offset
    const zoom = Math.max(1, Math.min(18, 6 - Math.log2(this.zoomLevel)));
    const scale = Math.pow(2, zoom);
    const tileSize = 256;

    // Calculate pixels per degree at current latitude
    const pixelsPerDegreeLat = (scale * tileSize) / 360;
    const centerLatRad = (centerAircraft.lat * Math.PI) / 180;
    const pixelsPerDegreeLng = (scale * tileSize * Math.cos(centerLatRad)) / 360;

    // Convert pixel offset to geographic offset
    const geoOffsetLng = -panOffset.x / pixelsPerDegreeLng;
    const geoOffsetLat = panOffset.y / pixelsPerDegreeLat;

    // Apply smooth transform to the map background
    mapBackground.style.transition = 'transform 0.1s linear';
    mapBackground.style.transform = `translate(${geoOffsetLng * pixelsPerDegreeLng}px, ${-geoOffsetLat * pixelsPerDegreeLat}px)`;
  }

  /**
   * Apply pan offset to visualization elements.
   */
  public applyPanOffset(visualizationArea: HTMLElement, panOffset: { x: number; y: number }): void {
    const children = visualizationArea.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as HTMLElement;
      if (child.id !== 'connection-lines-svg' && child.id !== 'graph-grid' && child.id !== 'map-background') {
        const currentTransform = child.style.transform || '';
        const panTransform = `translate(${panOffset.x}px, ${panOffset.y}px)`;

        if (currentTransform.includes('rotate')) {
          child.style.transform = `${panTransform} ${currentTransform}`;
        } else {
          child.style.transform = panTransform;
        }

        child.style.display = 'block';
        child.style.visibility = 'visible';
        child.style.opacity = '1';
      }
    }

    // Apply pan offset to SVG overlay
    const svgOverlay = visualizationArea.querySelector('#connection-lines-svg') as SVGElement;
    if (svgOverlay) {
      svgOverlay.style.transform = `translate(${panOffset.x}px, ${panOffset.y}px)`;
    }

    // Apply pan offset to grid
    const grid = visualizationArea.querySelector('#graph-grid') as HTMLElement;
    if (grid) {
      grid.style.transform = `translate(${panOffset.x}px, ${panOffset.y}px)`;
    }
  }

  /**
   * Reset pan offset to (0, 0).
   */
  public resetPanOffset(): { x: number; y: number } {
    this.panOffset = { x: 0, y: 0 };
    return this.panOffset;
  }

  /**
   * Get current pan offset.
   */
  public getPanOffset(): { x: number; y: number } {
    return { ...this.panOffset };
  }

  /**
   * Update pan offset.
   */
  public setPanOffset(x: number, y: number): void {
    this.panOffset = { x, y };
  }

  /**
   * Add pan delta to current offset.
   */
  public addPanDelta(deltaX: number, deltaY: number): { x: number; y: number } {
    this.panOffset.x += deltaX;
    this.panOffset.y += deltaY;
    return { ...this.panOffset };
  }

  /**
   * Toggle map visibility.
   */
  public toggleMapVisibility(): boolean {
    this.showMap = !this.showMap;
    if (this.mapElement) {
      this.mapElement.style.display = this.showMap ? 'block' : 'none';
    }
    return this.showMap;
  }

  /**
   * Set zoom level.
   */
  public setZoomLevel(level: number): void {
    this.zoomLevel = Math.max(0.1, Math.min(level, 10));
  }

  /**
   * Get zoom level.
   */
  public getZoomLevel(): number {
    return this.zoomLevel;
  }

  /**
   * Check if currently dragging.
   */
  public getIsDragging(): boolean {
    return this.isDragging;
  }

  /**
   * Set dragging state.
   */
  public setIsDragging(isDragging: boolean): void {
    this.isDragging = isDragging;
  }

  /**
   * Get last mouse position.
   */
  public getLastMousePos(): { x: number; y: number } {
    return { ...this.lastMousePos };
  }

  /**
   * Set last mouse position.
   */
  public setLastMousePos(x: number, y: number): void {
    this.lastMousePos = { x, y };
  }

  /**
   * Cleanup: remove map resources.
   */
  public dispose(): void {
    if (this.mapboxMap) {
      try {
        this.mapboxMap.remove();
      } catch {}
      this.mapboxMap = null;
    }
    if (this.mapElement) {
      try {
        this.mapElement.remove();
      } catch {}
      this.mapElement = null;
    }
  }
}