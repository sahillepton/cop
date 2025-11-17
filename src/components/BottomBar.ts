export class BottomBar {
  public create(container: HTMLElement): void {
    const bottomBar = document.createElement("div");
    bottomBar.style.cssText = `
      position: fixed;
      bottom: 0;
      left: 0;
      right: 60px;
      height: 60px;
      background: #111;
      border-top: 1px solid #333;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 20px;
      z-index: 100;
    `;

    const rangeInfo = document.createElement("div");
    rangeInfo.id = "adaptive-range-info";
    rangeInfo.style.cssText = `
      color: #00ff00;
      font-family: monospace;
      font-size: 14px;
      text-align: center;
      background: rgba(0, 0, 0, 0.7);
      padding: 8px 16px;
      border-radius: 4px;
      border: 1px solid #00ff00;
    `;
    rangeInfo.textContent = "ADAPTIVE RADAR RANGE";

    bottomBar.appendChild(rangeInfo);
    container.appendChild(bottomBar);
  }

  public updateRangeInfo(
    zoomLevel: number,
    aircraftCount: number,
    maxDistance: number
  ): void {
    const rangeInfo = document.getElementById("adaptive-range-info");
    if (rangeInfo) {
      rangeInfo.textContent = `AUTO-ZOOM: ${(zoomLevel * 100).toFixed(0)}% | ${aircraftCount} AIRCRAFT | MAX DIST: ${maxDistance.toFixed(1)}`;
    }
  }
}
