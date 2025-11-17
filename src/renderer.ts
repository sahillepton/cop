import "./index.css";
import { MapManager } from "./map";
import { Aircraft, AircraftType } from "./types";
import { LocationDisplay } from "./components/LocationDisplay";
import { ThreatDialog } from "./components/ThreatDialog";
import { RightSidebar } from "./components/RightSidebar";
import { BottomBar } from "./components/BottomBar";
import { DebugInfo } from "./components/DebugInfo";
import { AdaptiveRadarCircles } from "./components/AdaptiveRadarCircles";
import { AircraftRenderer } from "./components/AircraftRenderer";

class TacticalDisplayClient {
  private aircraft: Map<string, Aircraft> = new Map();
  private nodeId: string = "";
  private zoomLevel: number = 1;
  private showOtherNodes: boolean = true;
  private messageCodesInterval: NodeJS.Timeout | null = null;
  private messageCodes: number[] = [101, 102, 103, 104, 105, 106, 122];
  private mapManager: MapManager | null = null;
  private centerMode: "mother" | "self" = "mother";
  private viewMode: "normal" | "self-only" = "normal";

  // Components
  private locationDisplay: LocationDisplay;
  private threatDialog: ThreatDialog;
  private rightSidebar: RightSidebar;
  private bottomBar: BottomBar;
  private debugInfo: DebugInfo;
  private adaptiveRadarCircles: AdaptiveRadarCircles;
  private aircraftRenderer: AircraftRenderer;
  private simulationSystem: {
    isRunning: boolean;
    startTime: number;
    duration: number;
    phase: "warmup" | "engagement" | "maneuver" | "resolution";
    lastPhaseChange: number;
    threatSpawnTimer: number;
    lastThreatSpawn: number;
    activeThreats: Set<string>;
    engagementCount: number;
    lastMapJump: number;
    mapJumpInterval: number;
  } = {
    isRunning: false,
    startTime: 0,
    duration: 150000,
    phase: "warmup",
    lastPhaseChange: 0,
    threatSpawnTimer: 0,
    lastThreatSpawn: 0,
    activeThreats: new Set(),
    engagementCount: 0,
    lastMapJump: 0,
    mapJumpInterval: 20000,
  };
  private warningSystem: {
    threatProximityThreshold: number;
    motherDistanceThreshold: number;
    activeWarnings: Set<string>;
    lastWarningCheck: number;
  } = {
    threatProximityThreshold: 0.02,
    motherDistanceThreshold: 0.05,
    activeWarnings: new Set(),
    lastWarningCheck: 0,
  };

  constructor() {
    // Initialize components
    this.locationDisplay = new LocationDisplay(this.mapManager);
    this.threatDialog = new ThreatDialog(
      (aircraft) => this.lockThreat(aircraft),
      (aircraft) => this.executeThreat(aircraft)
    );
    this.rightSidebar = new RightSidebar();
    this.bottomBar = new BottomBar();
    this.debugInfo = new DebugInfo();
    this.adaptiveRadarCircles = new AdaptiveRadarCircles();
    this.aircraftRenderer = new AircraftRenderer((aircraft) =>
      this.showAircraftDetails(aircraft)
    );

    this.initialize();
  }

  private initialize() {
    this.nodeId = this.generateId();

    // Handle window resize to update map
    window.addEventListener("resize", () => {
      if (this.mapManager) {
        this.mapManager.resize();
      }
    });

    // Listen for map center changes
    window.addEventListener("map-center-changed", () => {
      this.locationDisplay.update();
    });

    // Listen for map zoom changes
    window.addEventListener("map-zoom-changed", () => {
      this.updateZoomDisplay();
    });

    this.updateUI();
  }

  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 3440.065;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return distance;
  }

  private getThreatCount(): number {
    return Array.from(this.aircraft.values()).filter(
      (aircraft) => aircraft.aircraftType === "threat"
    ).length;
  }

  private getNearestThreats(
    centerAircraft: Aircraft,
    maxThreats: number = 3
  ): Array<{ aircraft: Aircraft; distance: number; distanceNM: number }> {
    const threats: Array<{
      aircraft: Aircraft;
      distance: number;
      distanceNM: number;
    }> = [];

    this.aircraft.forEach((aircraft, id) => {
      if (aircraft.aircraftType === "threat") {
        const distance = this.calculateDistanceBetweenAircraft(
          centerAircraft,
          aircraft
        );
        const distanceNM = distance;
        threats.push({ aircraft, distance, distanceNM });
      }
    });

    return threats.sort((a, b) => a.distance - b.distance).slice(0, maxThreats);
  }

  private toggleThreatDialog() {
    this.threatDialog.toggle();
  }

  private updateUI() {
    const container = document.getElementById("nodes-container");
    if (!container) return;

    container.innerHTML = "";

    let centerAircraft: Aircraft | null = null;

    const mapZoom = this.mapManager?.getZoom() || 7;
    this.rightSidebar.create(
      container,
      this.viewMode,
      mapZoom,
      this.showOtherNodes,
      this.centerMode,
      this.mapManager,
      (mode) => this.setViewMode(mode),
      () => this.zoomIn(),
      () => this.zoomOut(),
      () => this.toggleOtherNodesVisibility(),
      () => {
        if (this.mapManager) {
          this.mapManager.toggleMapVisibility();
        }
      },
      () => this.toggleCenterMode(),
      () => this.toggleThreatDialog()
    );

    const visualizationArea = document.createElement("div");
    visualizationArea.id = "visualization-area";
    visualizationArea.style.cssText = `
      position: relative;
      width: calc(100% - 60px);
      height: calc(100vh - 60px);
      background: transparent;
      overflow: hidden;
      margin: 0;
      padding: 0;
      margin-right: 60px;
      margin-bottom: 60px;
      box-sizing: border-box;
      cursor: default;
      user-select: none;
    `;

    container.appendChild(visualizationArea);

    // Determine center aircraft (for rendering, not for map center)
    if (this.aircraft.size > 0) {
      const aircraftArray = Array.from(this.aircraft.values());
      if (this.centerMode === "mother") {
        centerAircraft =
          aircraftArray.find((a) => a.aircraftType === "mother") ||
          aircraftArray[0];
      } else {
        centerAircraft = this.aircraft.get(this.nodeId) || aircraftArray[0];
      }
    }

    // Create map using MapManager - always center on Mumbai
    const mumbaiLat = 19.076;
    const mumbaiLng = 72.8777;

    if (!this.mapManager) {
      this.mapManager = new MapManager(visualizationArea, mumbaiLat, mumbaiLng);
      this.locationDisplay.setMapManager(this.mapManager);

      // Update location display after map is created
      setTimeout(() => {
        this.locationDisplay.update();
      }, 300);
    } else {
      // Ensure map is always centered on Mumbai
      this.mapManager.updateCenter(mumbaiLat, mumbaiLng, 7);
    }

    const svgOverlay = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg"
    );
    svgOverlay.id = "connection-lines-svg";
    svgOverlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1;
    `;
    visualizationArea.appendChild(svgOverlay);

    if (centerAircraft) {
      this.adaptiveRadarCircles.create(
        visualizationArea,
        centerAircraft,
        this.aircraft,
        this.zoomLevel,
        (deltaLat, deltaLng) => this.convertToCartesian(deltaLat, deltaLng),
        (adaptiveRange, maxDistance) => {
          this.bottomBar.updateRangeInfo(
            this.zoomLevel,
            this.aircraft.size - 1,
            maxDistance
          );
        }
      );
    }

    if (!centerAircraft) {
      // No center aircraft available, skip rendering
      this.bottomBar.create(container);
      this.debugInfo.create(container, this.aircraft, this.nodeId);
      // Update location display with map center

      this.locationDisplay.update();

      return;
    }

    // Map is always centered on Mumbai, no need to update based on aircraft

    const centerElement = this.aircraftRenderer.createAircraftElement(
      centerAircraft,
      true
    );

    const aircraftSize = 20;
    const halfSize = aircraftSize / 2;

    centerElement.style.cssText = `
      position: absolute !important;
      top: 50% !important;
      left: 50% !important;
      margin-top: -${halfSize}px !important;
      margin-left: -${halfSize}px !important;
      z-index: 10;
      transform: none !important;
      transition: none;
    `;

    centerElement.setAttribute("data-aircraft-id", centerAircraft.id);
    visualizationArea.appendChild(centerElement);

    console.log(
      `🎯 Center aircraft positioned: ${centerAircraft.callSign} (${centerAircraft.aircraftType}) at screen center`
    );
    console.log(
      `🎯 Aircraft size: ${aircraftSize}px, half-size: ${halfSize}px`
    );
    console.log(
      `🎯 Positioning: top: 50%, left: 50%, margin-top: -${halfSize}px, margin-left: -${halfSize}px`
    );

    console.log(
      `🎨 Rendering ${this.aircraft.size} aircraft (center: ${centerAircraft.callSign})`
    );
    this.aircraft.forEach((aircraft, id) => {
      console.log(
        `🎨 Processing aircraft: ${aircraft.callSign} (${aircraft.aircraftType})`
      );
      if (id === centerAircraft.id) {
        return;
      }

      if (this.viewMode === "self-only" && aircraft.aircraftType !== "self") {
        console.log(
          `🎨 Skipping non-self aircraft in self-only mode: ${aircraft.callSign}`
        );
        return;
      }

      console.log(
        `🎨 Rendering aircraft: ${aircraft.callSign} (${aircraft.aircraftType}) with fixed 20px icon`
      );

      const aircraftElement = this.aircraftRenderer.createAircraftElement(
        aircraft,
        false
      );

      const relativeLat = aircraft.lat - centerAircraft.lat;
      const relativeLng = aircraft.lng - centerAircraft.lng;

      const cartesianCoords = this.convertToCartesian(relativeLat, relativeLng);
      const x = cartesianCoords.x + 50;
      const y = cartesianCoords.y + 50;

      console.log(
        `🎨 Aircraft ${aircraft.callSign} position: x=${x.toFixed(1)}%, y=${y.toFixed(1)}%`
      );

      aircraftElement.style.position = "absolute";
      aircraftElement.style.top = `${y}%`;
      aircraftElement.style.left = `${x}%`;
      aircraftElement.style.transform = "translate(-50%, -50%)";
      aircraftElement.setAttribute("data-aircraft-id", id);

      if (aircraft.aircraftType === "threat") {
        aircraftElement.style.filter = "brightness(1.5)";
        const iconContainer = aircraftElement.querySelector(
          '[data-icon-type="threat"]'
        ) as HTMLElement;
        if (iconContainer) {
          iconContainer.style.animation = "pulse 1s infinite";
        }
      }

      visualizationArea.appendChild(aircraftElement);
    });

    this.bottomBar.create(container);

    this.debugInfo.create(container, this.aircraft, this.nodeId);

    this.checkWarnings();

    if (this.threatDialog.isVisible()) {
      this.threatDialog.create();
      let centerAircraft: Aircraft | null = null;
      if (this.aircraft.size > 0) {
        const aircraftArray = Array.from(this.aircraft.values());
        if (this.centerMode === "mother") {
          centerAircraft =
            aircraftArray.find((a) => a.aircraftType === "mother") ||
            aircraftArray[0];
        } else {
          centerAircraft = this.aircraft.get(this.nodeId) || aircraftArray[0];
        }
      }
      if (centerAircraft) {
        const nearestThreats = this.getNearestThreats(centerAircraft, 5);
        this.threatDialog.update(nearestThreats);
      }
    }

    this.locationDisplay.create();
    this.locationDisplay.update();
  }

  private addDebugInfo(container: HTMLElement) {
    const debugInfo = document.createElement("div");
    debugInfo.id = "debug-info";
    debugInfo.style.cssText = `
      position: fixed;
      top: 10px;
      left: 70px;
      color: white;
      font-family: monospace;
      font-size: 12px;
      background: rgba(0, 0, 0, 0.7);
      padding: 5px 10px;
      border-radius: 4px;
      z-index: 200;
    `;

    const selfAircraft = this.aircraft.get(this.nodeId);
    const threatCount = this.getThreatCount();
    const motherCount = Array.from(this.aircraft.values()).filter(
      (a) => a.aircraftType === "mother"
    ).length;
    const friendlyCount = Array.from(this.aircraft.values()).filter(
      (a) => a.aircraftType === "friendly"
    ).length;

    container.appendChild(debugInfo);

    this.addMessageCodesDisplay(container);
  }

  private addMessageCodesDisplay(container: HTMLElement) {
    // Message codes display removed - no sample data
  }

  private startMessageCodesDisplay() {
    // Message codes display removed - no sample data
  }

  // Old sidebar method removed - using RightSidebar component now
  private _createRightSidebarOld(container: HTMLElement) {
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
      background: ${this.viewMode === "normal" ? "#44ff44" : "#333"};
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

    button101.addEventListener("click", () => {
      this.setViewMode("normal");
    });

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
      background: ${this.viewMode === "self-only" ? "#ff8844" : "#333"};
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

    button102.addEventListener("click", () => {
      this.setViewMode("self-only");
    });

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

    zoomOutButton.addEventListener("click", () => {
      this.zoomOut();
    });

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
    zoomDisplay.textContent = `${Math.round(this.zoomLevel * 100)}%`;

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

    zoomInButton.addEventListener("click", () => {
      this.zoomIn();
    });

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
    toggleNodesButton.textContent = this.showOtherNodes ? "HIDE" : "SHOW";
    toggleNodesButton.style.cssText = `
      width: 40px;
      height: 30px;
      background: ${this.showOtherNodes ? "#ff4444" : "#44ff44"};
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

    toggleNodesButton.addEventListener("click", () => {
      this.toggleOtherNodesVisibility();
    });

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
      background: ${this.mapManager?.getMapboxMap() ? "#4488ff" : "#333"};
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
      if (this.mapManager) {
        const isVisible = this.mapManager.toggleMapVisibility();
        toggleMapButton.style.background = isVisible ? "#4488ff" : "#333";
      }
    });

    toggleMapButton.addEventListener("mouseenter", () => {
      toggleMapButton.style.opacity = "0.8";
    });

    toggleMapButton.addEventListener("mouseleave", () => {
      toggleMapButton.style.opacity = "1";
    });

    const centerModeButton = document.createElement("button");
    centerModeButton.textContent =
      this.centerMode === "mother" ? "MTR" : "SELF";
    centerModeButton.style.cssText = `
      width: 40px;
      height: 30px;
      background: ${this.centerMode === "mother" ? "#4488ff" : "#ff8844"};
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

    centerModeButton.addEventListener("click", () => {
      this.toggleCenterMode();
    });

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

    threatDialogButton.addEventListener("click", () => {
      this.toggleThreatDialog();
    });

    threatDialogButton.addEventListener("mouseenter", () => {
      threatDialogButton.style.opacity = "0.8";
    });

    threatDialogButton.addEventListener("mouseleave", () => {
      threatDialogButton.style.opacity = "1";
    });

    console.log("Creating zoom controls:", {
      zoomOutButton: zoomOutButton,
      zoomInButton: zoomInButton,
      zoomDisplay: zoomDisplay,
      currentZoom: this.zoomLevel,
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
  }

  private setViewMode(mode: "normal" | "self-only") {
    this.viewMode = mode;

    this.updateUI();

    const button101 = document.querySelector(
      'button[data-view-mode="101"]'
    ) as HTMLElement;
    const button102 = document.querySelector(
      'button[data-view-mode="102"]'
    ) as HTMLElement;

    if (button101) {
      button101.style.background = mode === "normal" ? "#44ff44" : "#333";
    }
    if (button102) {
      button102.style.background = mode === "self-only" ? "#ff8844" : "#333";
    }
  }

  private zoomIn() {
    if (!this.mapManager) return;
    const currentZoom = this.mapManager.getZoom();
    if (currentZoom !== null && currentZoom < 13) {
      const newZoom = currentZoom + 1;
      const mumbaiLat = 19.076;
      const mumbaiLng = 72.8777;
      this.mapManager.updateCenter(mumbaiLat, mumbaiLng, newZoom);
      this.updateZoomDisplay();
    }
  }

  private zoomOut() {
    if (!this.mapManager) return;
    const currentZoom = this.mapManager.getZoom();
    if (currentZoom !== null && currentZoom > 1) {
      const newZoom = currentZoom - 1;
      const mumbaiLat = 19.076;
      const mumbaiLng = 72.8777;
      this.mapManager.updateCenter(mumbaiLat, mumbaiLng, newZoom);
      this.updateZoomDisplay();
    }
  }

  private updateZoomDisplay() {
    const mapZoom = this.mapManager?.getZoom() || 7;
    this.rightSidebar.updateZoomDisplay(mapZoom);
  }

  private toggleOtherNodesVisibility() {
    this.showOtherNodes = !this.showOtherNodes;
    console.log(
      `Other nodes visibility: ${this.showOtherNodes ? "SHOW" : "HIDE"}`
    );

    const buttons = document.querySelectorAll("button");
    buttons.forEach((button) => {
      if (button.textContent === "HIDE" || button.textContent === "SHOW") {
        button.textContent = this.showOtherNodes ? "HIDE" : "SHOW";
        button.style.background = this.showOtherNodes ? "#ff4444" : "#44ff44";
      }
    });

    this.updateUI();
  }

  private checkWarnings() {
    const selfAircraft = this.aircraft.get(this.nodeId);
    if (!selfAircraft) return;

    this.warningSystem.activeWarnings.clear();

    this.checkThreatProximity(selfAircraft);

    this.updateWarningDisplay();
  }

  private checkThreatProximity(selfAircraft: Aircraft) {
    this.aircraft.forEach((aircraft, id) => {
      if (id === this.nodeId || aircraft.aircraftType !== "threat") return;

      const distance = this.calculateDistanceBetweenAircraft(
        selfAircraft,
        aircraft
      );

      if (distance <= this.warningSystem.threatProximityThreshold * 54) {
        const warningId = `THREAT_PROXIMITY_${id}`;
        this.warningSystem.activeWarnings.add(warningId);
        console.log(
          `⚠️ THREAT WARNING: ${aircraft.callSign} at ${(distance * 54).toFixed(1)}NM`
        );
      }
    });
  }

  private calculateDistanceBetweenAircraft(
    aircraft1: Aircraft,
    aircraft2: Aircraft
  ): number {
    return this.calculateDistance(
      aircraft1.lat,
      aircraft1.lng,
      aircraft2.lat,
      aircraft2.lng
    );
  }

  private updateWarningDisplay() {
    const existingWarning = document.getElementById("warning-display");
    if (existingWarning) {
      existingWarning.remove();
    }

    if (this.warningSystem.activeWarnings.size > 0) {
      console.log(
        `⚠️ Active warnings: ${Array.from(this.warningSystem.activeWarnings).join(", ")}`
      );
    }
  }

  private toggleCenterMode() {
    this.centerMode = this.centerMode === "mother" ? "self" : "mother";
    const selfAircraft = this.aircraft.get(this.nodeId);
    if (this.centerMode === "self" && !selfAircraft) {
      console.warn(
        "⚠️ Cannot switch to self-centered mode: self aircraft not found"
      );
      this.centerMode = "mother";
      return;
    }

    const centerButtons = document.querySelectorAll("button");
    centerButtons.forEach((button) => {
      if (button.textContent === "MTR" || button.textContent === "SELF") {
        button.textContent = this.centerMode === "mother" ? "MTR" : "SELF";
        button.style.background =
          this.centerMode === "mother" ? "#4488ff" : "#ff8844";
        console.log(
          `🎯 Updated center button to: ${button.textContent} (${this.centerMode === "mother" ? "blue" : "orange"})`
        );
      }
    });
    this.updateUI();
  }

  private showAircraftDetails(aircraft: Aircraft) {
    const details = document.createElement("div");
    details.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #222;
      border: 2px solid #555;
      border-radius: 10px;
      padding: 20px;
      color: white;
      font-family: monospace;
      z-index: 1000;
      min-width: 350px;
    `;

    const typeColor =
      aircraft.aircraftType === "threat"
        ? "#ff4444"
        : aircraft.aircraftType === "mother"
          ? "#4488ff"
          : aircraft.aircraftType === "self"
            ? "#FFD700"
            : "#44ff44";

    const totalDistance = aircraft.totalDistanceCovered || 0;
    const distanceMach = aircraft.speed / 661.5;

    const threatActions =
      aircraft.aircraftType === "threat"
        ? `
      <hr style="border: 1px solid #555; margin: 15px 0;">
      <div style="background: rgba(255, 68, 68, 0.2); padding: 10px; border-radius: 5px; border: 1px solid #ff4444;">
        <div style="color: #ff4444; font-weight: bold; margin-bottom: 10px;">⚠️ THREAT ACTIONS</div>
        <div style="display: flex; gap: 10px;">
          <button id="lock-threat-btn" style="
            background: #ff8800;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            flex: 1;
            transition: all 0.3s;
          ">🎯 LOCK TARGET</button>
          <button id="execute-threat-btn" style="
            background: #ff0000;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            flex: 1;
            transition: all 0.3s;
          ">💥 EXECUTE</button>
        </div>
      </div>
    `
        : "";

    details.innerHTML = `
      <h3 style="margin-top: 0; color: ${typeColor};">Aircraft Details</h3>
      <div><strong>Call Sign:</strong> ${aircraft.callSign}</div>
      <div><strong>Type:</strong> <span style="color: ${typeColor}">${aircraft.aircraftType.toUpperCase()}</span></div>
      <div><strong>Status:</strong> <span style="color: ${aircraft.status === "connected" ? "#4CAF50" : "#F44336"}">${aircraft.status.toUpperCase()}</span></div>
      <div><strong>Aircraft:</strong> ${aircraft.info}</div>
      <hr style="border: 1px solid #555; margin: 15px 0;">
      <div><strong>Position:</strong></div>
      <div style="margin-left: 20px;">Latitude: ${aircraft.lat.toFixed(6)}</div>
      <div style="margin-left: 20px;">Longitude: ${aircraft.lng.toFixed(6)}</div>
      <div><strong>Altitude:</strong> ${aircraft.altitude.toLocaleString()} ft</div>
      <div><strong>Heading:</strong> ${aircraft.heading}°</div>
      <div><strong>Speed:</strong> ${aircraft.speed} kts (Mach ${distanceMach.toFixed(2)})</div>
      <hr style="border: 1px solid #555; margin: 15px 0;">
      <div><strong style="color: #ffaa00;">Total Distance Covered:</strong></div>
      <div style="margin-left: 20px; color: #ffaa00; font-size: 16px; font-weight: bold;">
        ${totalDistance.toFixed(2)} NM
      </div>
      <div style="margin-left: 20px; color: #aaa; font-size: 12px;">
        (${(totalDistance * 1.151).toFixed(2)} miles / ${(totalDistance * 1.852).toFixed(2)} km)
      </div>
      ${threatActions}
      <button onclick="this.parentElement.remove()" style="
        background: #555;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        margin-top: 15px;
      ">Close</button>
    `;

    document.body.appendChild(details);

    if (aircraft.aircraftType === "threat") {
      const lockBtn = document.getElementById("lock-threat-btn");
      const executeBtn = document.getElementById("execute-threat-btn");

      if (lockBtn) {
        lockBtn.addEventListener("mouseenter", () => {
          lockBtn.style.background = "#ffaa00";
          lockBtn.style.transform = "scale(1.05)";
        });
        lockBtn.addEventListener("mouseleave", () => {
          lockBtn.style.background = "#ff8800";
          lockBtn.style.transform = "scale(1)";
        });
        lockBtn.addEventListener("click", () => {
          this.lockThreat(aircraft);
          details.remove();
        });
      }

      if (executeBtn) {
        executeBtn.addEventListener("mouseenter", () => {
          executeBtn.style.background = "#ff3333";
          executeBtn.style.transform = "scale(1.05)";
        });
        executeBtn.addEventListener("mouseleave", () => {
          executeBtn.style.background = "#ff0000";
          executeBtn.style.transform = "scale(1)";
        });
        executeBtn.addEventListener("click", () => {
          this.executeThreat(aircraft);
          details.remove();
        });
      }
    }
  }

  private lockThreat(aircraft: Aircraft) {
    aircraft.isLocked = true;

    const lockButtons = document.querySelectorAll("button");
    lockButtons.forEach((button) => {
      if (button.textContent?.includes("LOCK")) {
        button.textContent = "🔒 LOCKED";
        button.style.background = "#00ff00";
        button.style.color = "#000000";
        button.style.fontWeight = "bold";

        setTimeout(() => {
          button.textContent = "🎯 LOCK";
          button.style.background = "#ff8800";
          button.style.color = "#ffffff";
          button.style.fontWeight = "normal";
        }, 3000);
      }
    });

    const notification = document.createElement("div");
    notification.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(255, 136, 0, 0.95);
      color: white;
      padding: 20px 30px;
      border-radius: 8px;
      border: 2px solid #ffaa00;
      font-family: monospace;
      font-size: 16px;
      font-weight: bold;
      z-index: 2000;
      text-align: center;
      box-shadow: 0 0 20px rgba(255, 136, 0, 0.5);
    `;
    notification.innerHTML = `
      🎯 TARGET LOCKED<br>
      <span style="font-size: 14px;">${aircraft.callSign}</span><br>
      <span style="font-size: 12px; color: #ffff00;">Tracking active</span>
    `;
    document.body.appendChild(notification);

    const aircraftElement = document.querySelector(
      `[data-aircraft-id="${aircraft.id}"]`
    ) as HTMLElement;
    if (aircraftElement) {
      aircraftElement.style.boxShadow = "0 0 30px #ffaa00, 0 0 50px #ff8800";
      aircraftElement.style.border = "3px solid #ffaa00";

      this.aircraftRenderer.updateAircraftIcon(aircraftElement, aircraft);
    }

    setTimeout(() => {
      notification.remove();
    }, 2000);
  }

  private executeThreat(aircraft: Aircraft) {
    aircraft.isExecuted = true;

    const executeButtons = document.querySelectorAll("button");
    executeButtons.forEach((button) => {
      if (button.textContent?.includes("EXECUTE")) {
        button.textContent = "✅ EXECUTED";
        button.style.background = "#00ff00";
        button.style.color = "#000000";
        button.style.fontWeight = "bold";

        setTimeout(() => {
          button.textContent = "💥 EXECUTE";
          button.style.background = "#ff0000";
          button.style.color = "#ffffff";
          button.style.fontWeight = "normal";
        }, 3000);
      }
    });

    const notification = document.createElement("div");
    notification.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(255, 0, 0, 0.95);
      color: white;
      padding: 20px 30px;
      border-radius: 8px;
      border: 2px solid #ff0000;
      font-family: monospace;
      font-size: 16px;
      font-weight: bold;
      z-index: 2000;
      text-align: center;
      box-shadow: 0 0 20px rgba(255, 0, 0, 0.5);
      animation: pulse 0.5s ease-in-out;
    `;
    notification.innerHTML = `
      💥 TARGET ELIMINATED<br>
      <span style="font-size: 14px;">${aircraft.callSign}</span><br>
      <span style="font-size: 12px; color: #ffff00;">Threat neutralized</span>
    `;
    document.body.appendChild(notification);

    const aircraftElement = document.querySelector(
      `[data-aircraft-id="${aircraft.id}"]`
    ) as HTMLElement;
    if (aircraftElement) {
      aircraftElement.style.boxShadow = "0 0 30px #ff0000, 0 0 50px #ff0000";
      aircraftElement.style.border = "3px solid #ff0000";
      aircraftElement.style.background = "#ff0000";
      aircraftElement.style.opacity = "0.8";

      setTimeout(() => {
        aircraftElement.remove();
      }, 1000);
    }

    this.aircraft.delete(aircraft.id);
    this.simulationSystem.activeThreats.delete(aircraft.id);
    this.simulationSystem.engagementCount++;

    setTimeout(() => {
      this.updateUI();
    }, 600);

    setTimeout(() => {
      notification.remove();
    }, 2000);
  }

  private convertToCartesian(
    deltaLat: number,
    deltaLng: number
  ): { x: number; y: number } {
    const scale = 100;

    const rawX = deltaLng * scale;
    const rawY = -deltaLat * scale;

    const zoomedX = rawX * this.zoomLevel;
    const zoomedY = rawY * this.zoomLevel;

    console.log(
      `📍 Coord conversion: ΔLat=${deltaLat.toFixed(6)}, ΔLng=${deltaLng.toFixed(6)} | Raw: X=${rawX.toFixed(2)}, Y=${rawY.toFixed(2)} | Zoomed: X=${zoomedX.toFixed(2)}, Y=${zoomedY.toFixed(2)}`
    );

    return { x: zoomedX, y: zoomedY };
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  public sendMessage(message: string) {
    const messageData = {
      type: "message",
      payload: {
        id: this.nodeId,
        message: message,
      },
    };
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const tacticalClient = new TacticalDisplayClient();
});
