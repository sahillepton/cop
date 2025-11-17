import { MapManager } from "../map";

export class LocationDisplay {
  private mapManager: MapManager | null;

  constructor(mapManager: MapManager | null) {
    this.mapManager = mapManager;
  }

  public create(): void {
    let locationDisplay = document.getElementById("location-display");
    if (locationDisplay) {
      return;
    }

    locationDisplay = document.createElement("div");
    locationDisplay.id = "location-display";
    locationDisplay.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      background: rgba(0, 0, 0, 0.9);
      color: #00ff00;
      font-family: monospace;
      font-size: 12px;
      padding: 10px 15px;
      border-radius: 4px;
      border: 1px solid #00ff00;
      z-index: 250;
      min-width: 250px;
      box-shadow: 0 0 10px rgba(0, 255, 0, 0.3);
    `;
    document.body.appendChild(locationDisplay);

    console.log("📍 Location display created");
  }

  public update(): void {
    const locationDisplay = document.getElementById("location-display");
    if (!locationDisplay) {
      this.create();
    }

    // Get map center from MapManager
    const center = this.mapManager?.getCenter();
    if (center) {
      if (locationDisplay) {
        locationDisplay.innerHTML = `
          <div style="font-weight: bold; margin-bottom: 5px; color: #00ff00;">📍 MAP CENTER</div>
          <div style="color: #ffffff;">Lat: <span style="color: #00ff00;">${center.lat.toFixed(6)}</span></div>
          <div style="color: #ffffff;">Lng: <span style="color: #00ff00;">${center.lng.toFixed(6)}</span></div>
        `;
      }
    } else {
      // Map not yet initialized, show default or empty
      if (locationDisplay) {
        locationDisplay.innerHTML = `
          <div style="font-weight: bold; margin-bottom: 5px; color: #00ff00;">📍 MAP CENTER</div>
          <div style="color: #888888;">Initializing...</div>
        `;
      }
    }
  }

  public setMapManager(mapManager: MapManager | null): void {
    this.mapManager = mapManager;
  }
}
