import { MapManager } from "../map";

export class RightSidebar {
  private zoomDisplay: HTMLElement | null = null;

  public create(
    container: HTMLElement,
    viewMode: "normal" | "self-only",
    zoomLevel: number,
    showOtherNodes: boolean,
    centerMode: "mother" | "self",
    mapManager: MapManager | null,
    onViewModeChange: (mode: "normal" | "self-only") => void,
    onZoomIn: () => void,
    onZoomOut: () => void,
    onToggleNodes: () => void,
    onToggleMap: () => void,
    onToggleCenterMode: () => void,
    onToggleThreatDialog: () => void
  ): HTMLElement {
    const sidebar = document.createElement("div");
    sidebar.style.cssText = `
      position: fixed;
      right: 0;
      top: 0;
      width: 60px;
      height: 100vh;
      background: #111;
      border-left: 1px solid #333;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 20px 0;
      gap: 10px;
      z-index: 100;
    `;

    const button101 = document.createElement("button");
    button101.textContent = "101";
    button101.style.cssText = `
      width: 40px;
      height: 30px;
      background: ${viewMode === "normal" ? "#44ff44" : "#333"};
      color: white;
      border: 1px solid #555;
      border-radius: 4px;
      cursor: pointer;
      font-family: monospace;
      font-size: 10px;
      font-weight: bold;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 5px;
    `;
    button101.addEventListener("click", () => onViewModeChange("normal"));
    button101.addEventListener("mouseenter", () => {
      button101.style.opacity = "0.8";
    });
    button101.addEventListener("mouseleave", () => {
      button101.style.opacity = "1";
    });
    button101.setAttribute("data-view-mode", "101");

    const button102 = document.createElement("button");
    button102.textContent = "102";
    button102.style.cssText = `
      width: 40px;
      height: 30px;
      background: ${viewMode === "self-only" ? "#ff8844" : "#333"};
      color: white;
      border: 1px solid #555;
      border-radius: 4px;
      cursor: pointer;
      font-family: monospace;
      font-size: 10px;
      font-weight: bold;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 10px;
    `;
    button102.addEventListener("click", () => onViewModeChange("self-only"));
    button102.addEventListener("mouseenter", () => {
      button102.style.opacity = "0.8";
    });
    button102.addEventListener("mouseleave", () => {
      button102.style.opacity = "1";
    });
    button102.setAttribute("data-view-mode", "102");

    const zoomOutButton = document.createElement("button");
    zoomOutButton.textContent = "−";
    zoomOutButton.style.cssText = `
      width: 40px;
      height: 30px;
      background: #333;
      color: white;
      border: 1px solid #555;
      border-radius: 4px;
      cursor: pointer;
      font-family: monospace;
      font-size: 16px;
      font-weight: bold;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    zoomOutButton.addEventListener("click", onZoomOut);
    zoomOutButton.addEventListener("mouseenter", () => {
      zoomOutButton.style.background = "#555";
    });
    zoomOutButton.addEventListener("mouseleave", () => {
      zoomOutButton.style.background = "#333";
    });

    const zoomDisplay = document.createElement("div");
    zoomDisplay.style.cssText = `
      color: white;
      font-family: monospace;
      font-size: 9px;
      text-align: center;
      writing-mode: vertical-rl;
      text-orientation: mixed;
      min-height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    zoomDisplay.textContent = `Z${Math.round(zoomLevel)}`;
    this.zoomDisplay = zoomDisplay;

    const zoomInButton = document.createElement("button");
    zoomInButton.textContent = "+";
    zoomInButton.style.cssText = `
      width: 40px;
      height: 30px;
      background: #333;
      color: white;
      border: 1px solid #555;
      border-radius: 4px;
      cursor: pointer;
      font-family: monospace;
      font-size: 16px;
      font-weight: bold;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    zoomInButton.addEventListener("click", onZoomIn);
    zoomInButton.addEventListener("mouseenter", () => {
      zoomInButton.style.background = "#555";
    });
    zoomInButton.addEventListener("mouseleave", () => {
      zoomInButton.style.background = "#333";
    });

    const fullscreenButton = document.createElement("button");
    fullscreenButton.textContent = "⛶";
    fullscreenButton.style.cssText = `
      width: 40px;
      height: 30px;
      background: #333;
      color: white;
      border: 1px solid #555;
      border-radius: 4px;
      cursor: pointer;
      font-family: monospace;
      font-size: 14px;
      font-weight: bold;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    fullscreenButton.addEventListener("click", () => {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        document.documentElement.requestFullscreen();
      }
    });
    fullscreenButton.addEventListener("mouseenter", () => {
      fullscreenButton.style.background = "#555";
    });
    fullscreenButton.addEventListener("mouseleave", () => {
      fullscreenButton.style.background = "#333";
    });

    const toggleNodesButton = document.createElement("button");
    toggleNodesButton.textContent = showOtherNodes ? "HIDE" : "SHOW";
    toggleNodesButton.style.cssText = `
      width: 40px;
      height: 30px;
      background: ${showOtherNodes ? "#ff4444" : "#44ff44"};
      color: white;
      border: 1px solid #555;
      border-radius: 4px;
      cursor: pointer;
      font-family: monospace;
      font-size: 8px;
      font-weight: bold;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 10px;
    `;
    toggleNodesButton.addEventListener("click", onToggleNodes);
    toggleNodesButton.addEventListener("mouseenter", () => {
      toggleNodesButton.style.opacity = "0.8";
    });
    toggleNodesButton.addEventListener("mouseleave", () => {
      toggleNodesButton.style.opacity = "1";
    });

    const toggleMapButton = document.createElement("button");
    toggleMapButton.textContent = "MAP";
    toggleMapButton.style.cssText = `
      width: 40px;
      height: 30px;
      background: ${mapManager?.getMapboxMap() ? "#4488ff" : "#333"};
      color: white;
      border: 1px solid #555;
      border-radius: 4px;
      cursor: pointer;
      font-family: monospace;
      font-size: 8px;
      font-weight: bold;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 5px;
    `;
    toggleMapButton.addEventListener("click", () => {
      onToggleMap();
      const isVisible = mapManager?.getMapboxMap() ? true : false;
      toggleMapButton.style.background = isVisible ? "#4488ff" : "#333";
    });
    toggleMapButton.addEventListener("mouseenter", () => {
      toggleMapButton.style.opacity = "0.8";
    });
    toggleMapButton.addEventListener("mouseleave", () => {
      toggleMapButton.style.opacity = "1";
    });

    const centerModeButton = document.createElement("button");
    centerModeButton.textContent = centerMode === "mother" ? "MTR" : "SELF";
    centerModeButton.style.cssText = `
      width: 40px;
      height: 30px;
      background: ${centerMode === "mother" ? "#4488ff" : "#ff8844"};
      color: white;
      border: 1px solid #555;
      border-radius: 4px;
      cursor: pointer;
      font-family: monospace;
      font-size: 8px;
      font-weight: bold;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 5px;
    `;
    centerModeButton.addEventListener("click", onToggleCenterMode);
    centerModeButton.addEventListener("mouseenter", () => {
      centerModeButton.style.opacity = "0.8";
    });
    centerModeButton.addEventListener("mouseleave", () => {
      centerModeButton.style.opacity = "1";
    });

    const threatDialogButton = document.createElement("button");
    threatDialogButton.textContent = "THRT";
    threatDialogButton.style.cssText = `
      width: 40px;
      height: 30px;
      background: #ff4444;
      color: white;
      border: 1px solid #555;
      border-radius: 4px;
      cursor: pointer;
      font-family: monospace;
      font-size: 8px;
      font-weight: bold;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 5px;
    `;
    threatDialogButton.addEventListener("click", onToggleThreatDialog);
    threatDialogButton.addEventListener("mouseenter", () => {
      threatDialogButton.style.opacity = "0.8";
    });
    threatDialogButton.addEventListener("mouseleave", () => {
      threatDialogButton.style.opacity = "1";
    });

    sidebar.appendChild(button101);
    sidebar.appendChild(button102);
    sidebar.appendChild(zoomOutButton);
    sidebar.appendChild(zoomDisplay);
    sidebar.appendChild(zoomInButton);
    sidebar.appendChild(fullscreenButton);
    sidebar.appendChild(toggleNodesButton);
    sidebar.appendChild(toggleMapButton);
    sidebar.appendChild(centerModeButton);
    sidebar.appendChild(threatDialogButton);

    container.appendChild(sidebar);
    return sidebar;
  }

  public updateZoomDisplay(zoomLevel: number): void {
    if (this.zoomDisplay) {
      this.zoomDisplay.textContent = `Z${Math.round(zoomLevel)}`;
    }
  }
}
