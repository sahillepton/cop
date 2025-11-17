import mapboxgl from "mapbox-gl";

export type Aircraft = {
  id: string;
  lat: number;
  lng: number;
  callSign: string;
  aircraftType: "mother" | "friendly" | "threat" | "self";
  isLocked?: boolean;
  isExecuted?: boolean;
};

/**
 * MapManager: Simple map manager for displaying map tiles.
 */
export class MapManager {
  private mapboxMap: mapboxgl.Map | null = null;
  private mapElement: HTMLElement | null = null;

  /**
   * Constructor: Creates and adds the map to the document.
   */
  constructor(container: HTMLElement, lat: number, lng: number) {
    // Set Mapbox access token
    mapboxgl.accessToken =
      "pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw";

    // Create map container
    const mapContainer = document.createElement("div");
    mapContainer.id = "map-background";
    mapContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 0;
      opacity: 1;
      pointer-events: none;
      display: block;
      visibility: visible;
    `;

    container.appendChild(mapContainer);
    this.mapElement = mapContainer;

    // Ensure container has minimum dimensions
    if (mapContainer.clientWidth === 0 || mapContainer.clientHeight === 0) {
      mapContainer.style.width = "100%";
      mapContainer.style.height = "100%";
      mapContainer.style.minWidth = "100px";
      mapContainer.style.minHeight = "100px";
    }

    // Create Mapbox GL map
    this.mapboxMap = new mapboxgl.Map({
      container: mapContainer,
      style: {
        version: 8,
        sources: {
          "local-tiles": {
            type: "raster",
            tiles: ["/tile-final/{z}/{x}/{y}.png"],
            tileSize: 256,
            minzoom: 1,
            maxzoom: 13,
          },
        },
        layers: [
          {
            id: "local-tiles-layer",
            type: "raster",
            source: "local-tiles",
            paint: {
              "raster-opacity": 1.0,
            },
          },
        ],
      },
      center: [lng, lat],
      zoom: 7,
      maxZoom: 13,
      minZoom: 1,
      interactive: false,
      attributionControl: false,
      preserveDrawingBuffer: true,
    });

    // Wait for map to load
    this.mapboxMap.on("load", () => {
      console.log("🗺️ Mapbox GL map loaded successfully");
      setTimeout(() => {
        this.mapboxMap?.resize();
      }, 100);
    });

    // Listen for map move events to update location display
    this.mapboxMap.on("moveend", () => {
      const event = new CustomEvent("map-center-changed");
      window.dispatchEvent(event);
    });

    // Listen for zoom changes to update zoom display
    this.mapboxMap.on("zoomend", () => {
      const event = new CustomEvent("map-zoom-changed");
      window.dispatchEvent(event);
    });

    // Suppress tile loading errors for missing tiles
    this.mapboxMap.on("error", (e: any) => {
      if (
        e.error &&
        e.error.message &&
        e.error.message.includes("Could not load image")
      ) {
        return; // Silently ignore missing tile errors
      }
      console.error("🗺️ Mapbox GL map error:", e);
    });

    // Disable all interactions
    this.mapboxMap.dragPan.disable();
    this.mapboxMap.scrollZoom.disable();
    this.mapboxMap.boxZoom.disable();
    this.mapboxMap.dragRotate.disable();
    this.mapboxMap.keyboard.disable();
    this.mapboxMap.doubleClickZoom.disable();
    this.mapboxMap.touchZoomRotate.disable();
  }

  public updateCenter(lat: number, lng: number, zoom?: number): void {
    if (!this.mapboxMap) return;
    const jumpOptions: mapboxgl.CameraOptions = {
      center: [lng, lat],
    };
    if (typeof zoom === "number" && Number.isFinite(zoom)) {
      jumpOptions.zoom = zoom;
    }
    this.mapboxMap.jumpTo(jumpOptions);
  }

  /**
   * Get current center of the map.
   */
  public getCenter(): { lat: number; lng: number } | null {
    if (!this.mapboxMap) return null;
    const center = this.mapboxMap.getCenter();
    return {
      lat: center.lat,
      lng: center.lng,
    };
  }

  /**
   * Get current zoom level of the map.
   */
  public getZoom(): number | null {
    if (!this.mapboxMap) return null;
    return this.mapboxMap.getZoom();
  }

  /**
   * Set zoom level of the map.
   */
  public setZoom(zoom: number): void {
    if (!this.mapboxMap) return;
    this.mapboxMap.setZoom(zoom);
  }

  /**
   * Get the mapbox map instance (for resize, etc.).
   */
  public getMapboxMap(): mapboxgl.Map | null {
    return this.mapboxMap;
  }

  /**
   * Resize the map.
   */
  public resize(): void {
    this.mapboxMap?.resize();
  }

  /**
   * Toggle map visibility.
   */
  public toggleMapVisibility(): boolean {
    if (this.mapElement) {
      const isVisible = this.mapElement.style.display !== "none";
      this.mapElement.style.display = isVisible ? "none" : "block";
      return !isVisible;
    }
    return false;
  }
}
