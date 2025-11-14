import "./index.css";
import mapboxgl from "mapbox-gl";

type AircraftType = "mother" | "friendly" | "threat" | "self";

type Aircraft = {
  id: string;
  status: string;
  info: string;
  lat: number;
  lng: number;
  aircraftType: AircraftType;
  callSign: string;
  altitude: number;
  heading: number;
  speed: number;
  totalDistanceCovered?: number;
  lastPosition?: { lat: number; lng: number };
  isLocked?: boolean;
  isExecuted?: boolean;
};

class TacticalDisplayClient {
  private aircraft: Map<string, Aircraft> = new Map();
  private nodeId: string = "";
  private zoomLevel: number = 1;
  private zoomDisplay: HTMLElement | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private currentLat: number = 0;
  private currentLng: number = 0;
  private showOtherNodes: boolean = true;
  private messageCodesInterval: NodeJS.Timeout | null = null;
  private messageCodes: number[] = [101, 102, 103, 104, 105, 106, 122];
  private mapboxMap: mapboxgl.Map | null = null;
  private centerMode: "mother" | "self" = "mother";
  private mumbaiLocations = {
    Mumbai: {
      districts: [
        {
          name: "Mumbai City",
          places: [
            { name: "Colaba", lat: 18.9219, lng: 72.833 },
            { name: "Cuffe Parade", lat: 18.921, lng: 72.825 },
            { name: "Marine Drive", lat: 18.9432, lng: 72.8238 },
            { name: "Fort", lat: 18.932, lng: 72.8347 },
            { name: "Churchgate", lat: 18.9365, lng: 72.8308 },
            { name: "Byculla", lat: 18.9812, lng: 72.8312 },
            { name: "Mazgaon", lat: 18.972, lng: 72.835 },
            { name: "Breach Candy", lat: 18.9818, lng: 72.8216 },
            { name: "Parel", lat: 19.0044, lng: 72.8406 },
          ],
        },
        {
          name: "Mumbai Suburban",
          places: [
            { name: "Andheri", lat: 19.1196, lng: 72.8469 },
            { name: "Bandra", lat: 19.055, lng: 72.84 },
            { name: "Borivali", lat: 19.2293, lng: 72.8566 },
            { name: "Dahisar", lat: 19.2813, lng: 72.8599 },
            { name: "Goregaon", lat: 19.164, lng: 72.8493 },
            { name: "Jogeshwari", lat: 19.135, lng: 72.8496 },
            { name: "Juhu", lat: 19.0986, lng: 72.8266 },
            { name: "Kandivali", lat: 19.2184, lng: 72.8569 },
            { name: "Kurla", lat: 19.0666, lng: 72.8793 },
            { name: "Malad", lat: 19.1856, lng: 72.8486 },
            { name: "Mulund", lat: 19.164, lng: 72.9564 },
            { name: "Santacruz", lat: 19.0863, lng: 72.8433 },
            { name: "Vikhroli", lat: 19.1251, lng: 72.9279 },
            { name: "Chembur", lat: 19.0627, lng: 72.9007 },
            { name: "Bhandup", lat: 19.1425, lng: 72.9332 },
            { name: "Powai", lat: 19.1198, lng: 72.9106 },
            { name: "Sion", lat: 19.0597, lng: 72.8722 },
          ],
        },
      ],
    },
  };
  private showThreatDialog: boolean = true;
  private animationFrameId: number | null = null;
  private aircraftInterpolation: Map<
    string,
    {
      startLat: number;
      startLng: number;
      targetLat: number;
      targetLng: number;
      startTime: number;
      duration: number;
      startHeading: number;
      targetHeading: number;
    }
  > = new Map();
  private panOffset: { x: number; y: number } = { x: 0, y: 0 };
  private viewMode: "normal" | "self-only" = "normal";
  private isDragging: boolean = false;
  private lastMousePos: { x: number; y: number } = { x: 0, y: 0 };
  private viewAdjustmentThrottle: NodeJS.Timeout | null = null;
  private isZoomTransitioning: boolean = false;
  private lastDistanceUpdate: number = 0;
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
    this.initialize();
  }

  private initialize() {
    this.nodeId = this.generateId();

    this.currentLat = 19.0 + Math.random() * 0.2;
    this.currentLng = 72.8 + Math.random() * 0.2;

    const selfAircraft: Aircraft = {
      id: this.nodeId,
      status: "connected",
      info: "F-35 Lightning II Client",
      lat: this.currentLat,
      lng: this.currentLng,
      aircraftType: "self",
      callSign: `LIGHTNING-${Math.floor(Math.random() * 99) + 1}`,
      altitude: 25000 + Math.floor(Math.random() * 10000),
      heading: Math.floor(Math.random() * 360),
      speed: this.getAircraftSpeed("self"),
      totalDistanceCovered: 0,
      lastPosition: { lat: this.currentLat, lng: this.currentLng },
    };

    this.aircraft.set(this.nodeId, selfAircraft);
    this.updateUI();
  }

  private clampToIndiaBounds(value: number, type: "lat" | "lng"): number {
    if (type === "lat") {
      return Math.max(18.9, Math.min(19.3, value));
    } else {
      return Math.max(72.7, Math.min(73.1, value));
    }
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

  private getAircraftSpeed(aircraftType: AircraftType): number {
    switch (aircraftType) {
      case "mother":
        const motherMach = 1.5 + Math.random() * 0.5;
        return Math.round(motherMach * 661.5);
      case "self":
      case "friendly":
        const friendlyMach = 2.0 + Math.random() * 2.0;
        return Math.round(friendlyMach * 661.5);
      case "threat":
        const threatMach = 0.5 + Math.random() * 4.5;
        return Math.round(threatMach * 661.5);
      default:
        const defaultMach = 2.0 + Math.random() * 1.0;
        return Math.round(defaultMach * 661.5);
    }
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

  private createThreatDialog() {
    const existingDialog = document.getElementById("threat-dialog");
    if (existingDialog) {
      existingDialog.remove();
    }

    const threatDialog = document.createElement("div");
    threatDialog.id = "threat-dialog";
    threatDialog.style.cssText = `
      position: fixed;
      top: 50px;
      right: 80px;
      width: 280px;
      background: rgba(0, 0, 0, 0.9);
      border: 2px solid #ff4444;
      border-radius: 8px;
      padding: 12px;
      color: white;
      font-family: monospace;
      font-size: 12px;
      z-index: 150;
      box-shadow: 0 0 20px rgba(255, 68, 68, 0.5);
    `;

    const header = document.createElement("div");
    header.style.cssText = `
      color: #ff4444;
      font-weight: bold;
      font-size: 14px;
      margin-bottom: 8px;
      text-align: center;
      border-bottom: 1px solid #ff4444;
      padding-bottom: 4px;
    `;
    header.textContent = "⚠️ NEAREST THREATS";
    threatDialog.appendChild(header);

    const threatList = document.createElement("div");
    threatList.id = "threat-list";
    threatList.style.cssText = `
      max-height: 200px;
      overflow-y: auto;
    `;
    threatDialog.appendChild(threatList);

    document.body.appendChild(threatDialog);
    return threatDialog;
  }

  private updateThreatDialog() {
    if (!this.showThreatDialog) return;

    let centerAircraft: Aircraft | null = null;
    if (this.centerMode === "mother") {
      // centerAircraft = this.motherAircraft || this.aircraft.get(this.nodeId);
    } else {
      //  centerAircraft = this.aircraft.get(this.nodeId) || this.motherAircraft;
    }

    if (!centerAircraft) return;

    const nearestThreats = this.getNearestThreats(centerAircraft, 5);
    const threatList = document.getElementById("threat-list");

    if (!threatList) {
      this.createThreatDialog();
      this.updateThreatDialog();
      return;
    }

    threatList.innerHTML = "";

    if (nearestThreats.length === 0) {
      const noThreats = document.createElement("div");
      noThreats.style.cssText = `
        color: #44ff44;
        text-align: center;
        padding: 10px;
        font-style: italic;
      `;
      noThreats.textContent = "✅ NO THREATS DETECTED";
      threatList.appendChild(noThreats);
    } else {
      nearestThreats.forEach((threat, index) => {
        const threatItem = document.createElement("div");
        threatItem.style.cssText = `
          padding: 8px;
          margin: 4px 0;
          background: rgba(255, 68, 68, 0.1);
          border-left: 3px solid #ff4444;
          border-radius: 3px;
        `;

        const topRow = document.createElement("div");
        topRow.style.cssText = `
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
        `;

        const callSign = document.createElement("div");
        callSign.style.cssText = `
          font-weight: bold;
          color: #ff4444;
        `;
        callSign.textContent = threat.aircraft.callSign;

        const distance = document.createElement("div");
        distance.style.cssText = `
          font-weight: bold;
          color: #ffaa44;
          font-size: 14px;
        `;
        distance.textContent = `${threat.distanceNM.toFixed(1)}NM`;

        topRow.appendChild(callSign);
        topRow.appendChild(distance);

        const details = document.createElement("div");
        details.style.cssText = `
          font-size: 10px;
          color: #cccccc;
          margin-bottom: 6px;
        `;
        details.textContent = `${threat.aircraft.altitude}ft | ${threat.aircraft.speed}kts | Hdg ${threat.aircraft.heading}°`;

        const actionsRow = document.createElement("div");
        actionsRow.style.cssText = `
          display: flex;
          gap: 5px;
        `;

        const lockBtn = document.createElement("button");
        lockBtn.style.cssText = `
          background: #ff8800;
          color: white;
          border: none;
          padding: 5px 10px;
          border-radius: 3px;
          cursor: pointer;
          font-size: 10px;
          font-weight: bold;
          flex: 1;
          transition: all 0.2s;
        `;
        lockBtn.textContent = "🎯 LOCK";
        lockBtn.addEventListener("mouseenter", () => {
          lockBtn.style.background = "#ffaa00";
        });
        lockBtn.addEventListener("mouseleave", () => {
          lockBtn.style.background = "#ff8800";
        });
        lockBtn.addEventListener("click", () => {
          this.lockThreat(threat.aircraft);
        });

        const executeBtn = document.createElement("button");
        executeBtn.style.cssText = `
          background: #ff0000;
          color: white;
          border: none;
          padding: 5px 10px;
          border-radius: 3px;
          cursor: pointer;
          font-size: 10px;
          font-weight: bold;
          flex: 1;
          transition: all 0.2s;
        `;
        executeBtn.textContent = "💥 EXECUTE";
        executeBtn.addEventListener("mouseenter", () => {
          executeBtn.style.background = "#ff3333";
        });
        executeBtn.addEventListener("mouseleave", () => {
          executeBtn.style.background = "#ff0000";
        });
        executeBtn.addEventListener("click", () => {
          this.executeThreat(threat.aircraft);
        });

        actionsRow.appendChild(lockBtn);
        actionsRow.appendChild(executeBtn);

        threatItem.appendChild(topRow);
        threatItem.appendChild(details);
        threatItem.appendChild(actionsRow);
        threatList.appendChild(threatItem);
      });
    }

    const header = document.querySelector("#threat-dialog > div:first-child");
    if (header) {
      header.textContent = `⚠️ NEAREST THREATS (${nearestThreats.length})`;
    }
  }

  private toggleThreatDialog() {
    this.showThreatDialog = !this.showThreatDialog;
    console.log(
      `Threat dialog visibility: ${this.showThreatDialog ? "SHOW" : "HIDE"}`
    );

    const threatDialog = document.getElementById("threat-dialog");
    if (threatDialog) {
      threatDialog.style.display = this.showThreatDialog ? "block" : "none";
    } else if (this.showThreatDialog) {
      this.createThreatDialog();
      this.updateThreatDialog();
    }

    const buttons = document.querySelectorAll("button");
    buttons.forEach((button) => {
      if (button.textContent === "THRT") {
        button.style.background = this.showThreatDialog ? "#ff4444" : "#333";
        button.style.opacity = this.showThreatDialog ? "1" : "0.5";
      }
    });
  }

  private createLocationDisplay() {
    let locationDisplay = document.getElementById("location-display");
    if (locationDisplay) {
      return;
    }

    locationDisplay = document.createElement("div");
    locationDisplay.id = "location-display";
    locationDisplay.style.cssText = `
      position: fixed;
      top: 120px;
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

    console.log(
      "📍 Location display created and periodic update interval started (100ms checks)"
    );
  }

  private getLocationInfo(
    lat: number,
    lng: number
  ): { country: string; state: string; place: string } {
    let country = "Unknown";
    let state = "Unknown";
    let place = "Unknown";

    if (lat >= 24 && lat <= 49 && lng >= -125 && lng <= -66) {
      country = "United States";
      if (lat >= 32 && lat <= 42 && lng >= -125 && lng <= -114) {
        state = "California";
        place = lat >= 34 ? "Northern California" : "Southern California";
      } else if (lat >= 25 && lat <= 31 && lng >= -97 && lng <= -80) {
        state = "Florida";
        place = "Sunshine State";
      } else if (lat >= 25 && lat <= 37 && lng >= -107 && lng <= -93) {
        state = "Texas";
        place = "Lone Star State";
      } else if (lat >= 36 && lat <= 42 && lng >= -80 && lng <= -71) {
        state = "New York";
        place = "Empire State";
      } else if (lat >= 35 && lat <= 42 && lng >= -120 && lng <= -114) {
        state = "Nevada";
        place = "Silver State";
      } else {
        state = "Continental US";
        place = "United States";
      }
    } else if (lat >= 36 && lat <= 44 && lng >= -10 && lng <= 4) {
      country = "Spain";
      state = "Kingdom of Spain";
      place = "Iberian Peninsula";
    } else if (lat >= 42 && lat <= 51 && lng >= -5 && lng <= 10) {
      country = "France";
      state = "French Republic";
      place = "Western Europe";
    } else if (lat >= 47 && lat <= 55 && lng >= 6 && lng <= 15) {
      country = "Germany";
      state = "Federal Republic";
      place = "Central Europe";
    } else if (lat >= 36 && lat <= 47 && lng >= 6 && lng <= 19) {
      country = "Italy";
      state = "Italian Republic";
      place = "Italian Peninsula";
    } else if (lat >= 49 && lat <= 61 && lng >= -8 && lng <= 2) {
      country = "United Kingdom";
      state = "Great Britain";
      place = "British Isles";
    } else if (lat >= 49 && lat <= 55 && lng >= 14 && lng <= 24) {
      country = "Poland";
      state = "Republic of Poland";
      place = "Eastern Europe";
    } else if (lat >= 36 && lat <= 42 && lng >= 26 && lng <= 45) {
      country = "Turkey";
      state = "Turkish Republic";
      place = "Anatolia";
    } else if (lat >= 16 && lat <= 32 && lng >= 34 && lng <= 56) {
      country = "Saudi Arabia";
      state = "Kingdom of Saudi Arabia";
      place = "Arabian Peninsula";
    } else if (lat >= 22 && lat <= 26 && lng >= 51 && lng <= 57) {
      country = "United Arab Emirates";
      state = "UAE";
      place = "Persian Gulf";
    } else if (lat >= 22 && lat <= 32 && lng >= 24 && lng <= 37) {
      country = "Egypt";
      state = "Arab Republic of Egypt";
      place = "Nile Region";
    } else if (lat >= 8 && lat <= 35 && lng >= 68 && lng <= 97) {
      country = "India";
      state = "Maharashtra";

      if (lat >= 18.9 && lat <= 19.3 && lng >= 72.7 && lng <= 73.1) {
        place = this.findNearestMumbaiLocation(lat, lng);
      } else {
        place = "Indian Subcontinent";
      }
    } else if (lat >= 18 && lat <= 54 && lng >= 73 && lng <= 135) {
      country = "China";
      state = "People's Republic";
      place = "East Asia";
    } else if (lat >= 24 && lat <= 46 && lng >= 123 && lng <= 146) {
      country = "Japan";
      state = "Japanese Islands";
      place = "East Asia";
    } else if (lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132) {
      country = "South Korea";
      state = "Republic of Korea";
      place = "Korean Peninsula";
    } else if (lat >= 5 && lat <= 21 && lng >= 97 && lng <= 106) {
      country = "Thailand";
      state = "Kingdom of Thailand";
      place = "Southeast Asia";
    } else if (lat >= -44 && lat <= -10 && lng >= 113 && lng <= 154) {
      country = "Australia";
      state = "Commonwealth of Australia";
      place = "Australian Continent";
    } else if (lat >= -35 && lat <= -22 && lng >= 16 && lng <= 33) {
      country = "South Africa";
      state = "Republic of South Africa";
      place = "Southern Africa";
    } else if (lat >= -34 && lat <= 5 && lng >= -74 && lng <= -34) {
      country = "Brazil";
      state = "Federative Republic";
      place = "South America";
    } else if (lat >= -55 && lat <= -21 && lng >= -74 && lng <= -53) {
      country = "Argentina";
      state = "Argentine Republic";
      place = "South America";
    } else if (lat >= 41 && lat <= 84 && lng >= -141 && lng <= -52) {
      country = "Canada";
      state = "Canadian Territory";
      place = "North America";
    } else if (lat >= 41 && lat <= 82 && lng >= 19 && lng <= 180) {
      country = "Russia";
      state = "Russian Federation";
      place = "Eurasia";
    } else {
      country = "International Airspace";
      state = "Unidentified Region";
      place = "Remote Area";
    }

    return { country, state, place };
  }
  private updateUI() {
    const container = document.getElementById("nodes-container");
    if (!container) return;

    this.panOffset = { x: 0, y: 0 };

    container.innerHTML = "";

    let centerAircraft: Aircraft | null = null;

    this.createRightSidebar(container);

    const visualizationArea = document.createElement("div");
    visualizationArea.id = "visualization-area";
    visualizationArea.style.cssText = `
      position: relative;
      width: calc(100% - 60px);
      height: calc(100vh - 60px);
      background: black;
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

    this.createAdaptiveRadarCircles(visualizationArea);

    const centerElement = this.createAircraftElement(centerAircraft, true);

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

      const aircraftElement = this.createAircraftElement(aircraft, false);

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

    this.createBottomBar(container);

    this.addDebugInfo(container);

    this.checkWarnings();

    if (this.showThreatDialog) {
      this.createThreatDialog();
      this.updateThreatDialog();
    }

    let locationDisplay = document.getElementById("location-display");
    if (!locationDisplay) {
      this.createLocationDisplay();
    } else {
    }
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
    const messageCodesDisplay = document.createElement("div");
    messageCodesDisplay.id = "message-codes-display";
    messageCodesDisplay.style.cssText = `
      position: fixed;
      top: 10px;
      right: 70px;
      color: #00ff00;
      font-family: monospace;
      font-size: 14px;
      font-weight: bold;
      background: rgba(0, 0, 0, 0.8);
      padding: 8px 15px;
      border-radius: 4px;
      border: 1px solid #00ff00;
      z-index: 200;
      text-shadow: 0 0 5px #00ff00;
    `;

    container.appendChild(messageCodesDisplay);

    this.startMessageCodesDisplay();
  }

  private startMessageCodesDisplay() {
    if (this.messageCodesInterval) {
      clearInterval(this.messageCodesInterval);
    }

    const updateMessageCodes = () => {
      const messageDisplay = document.getElementById("message-codes-display");
      if (messageDisplay) {
        const numCodes = Math.floor(Math.random() * 3) + 1;
        const selectedCodes: number[] = [];

        for (let i = 0; i < numCodes; i++) {
          const randomIndex = Math.floor(
            Math.random() * this.messageCodes.length
          );
          const code = this.messageCodes[randomIndex];
          if (!selectedCodes.includes(code)) {
            selectedCodes.push(code);
          }
        }

        messageDisplay.textContent = `MSG: ${selectedCodes.join(", ")}`;

        const nextInterval = 1000 + Math.random() * 2000;
        this.messageCodesInterval = setTimeout(
          updateMessageCodes,
          nextInterval
        );
      }
    };

    updateMessageCodes();
  }

  private createRightSidebar(container: HTMLElement) {
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

    this.zoomDisplay = zoomDisplay;

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

  private createBottomBar(container: HTMLElement) {
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

  private zoomIn() {
    console.log(
      "Zoom In (+) clicked - Making nodes smaller, current level:",
      this.zoomLevel
    );
    if (this.zoomLevel < 1.5) {
      this.zoomLevel += 0.2;
      this.updateZoomDisplay();

      this.updateUI();
    } else {
    }
  }

  private zoomOut() {
    console.log(
      "Zoom Out (-) clicked - Making nodes larger, current level:",
      this.zoomLevel
    );
    if (this.zoomLevel > 0.3) {
      this.zoomLevel -= 0.2;
      this.updateZoomDisplay();

      this.updateUI();
    } else {
    }
  }

  private updateZoomDisplay() {
    if (this.zoomDisplay) {
      this.zoomDisplay.textContent = `${Math.round(this.zoomLevel * 100)}%`;
    } else {
    }
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

  private createAircraftElement(aircraft: Aircraft, isCenter: boolean) {
    const aircraftElement = document.createElement("div");
    aircraftElement.className = "aircraft-marker";

    const fixedSize = aircraft.aircraftType === "threat" ? 24 : 20;
    const glowSize = fixedSize + 6;

    aircraftElement.style.cssText = `
      width: ${fixedSize}px;
      height: ${fixedSize}px;
      transition: none !important;
      cursor: pointer;
      position: absolute;
      display: flex !important;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      outline: none;
      visibility: visible !important;
      opacity: 1 !important;
      z-index: 100;
    `;

    console.log(
      `🎨 Creating aircraft icon for ${aircraft.callSign} (${aircraft.aircraftType}) with size ${fixedSize}px`
    );
    this.createAircraftIcon(
      aircraftElement,
      aircraft.aircraftType,
      fixedSize,
      aircraft
    );

    const glowInfo = {
      aircraftType: aircraft.aircraftType,
      glowSize: glowSize,
    };
    aircraftElement.setAttribute("data-glow-info", JSON.stringify(glowInfo));

    const callSignLabel = document.createElement("div");
    callSignLabel.style.cssText = `
      position: absolute;
      top: ${fixedSize + 2}px;
      left: 50%;
      transform: translateX(-50%);
      color: white;
      font-family: monospace;
      font-size: 10px;
      font-weight: bold;
      text-shadow: 0 0 3px black;
      white-space: nowrap;
      pointer-events: none;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
    `;
    callSignLabel.textContent = aircraft.callSign;
    aircraftElement.appendChild(callSignLabel);

    aircraftElement.addEventListener("click", () => {
      this.showAircraftDetails(aircraft);
    });

    return aircraftElement;
  }

  private createAircraftIcon(
    container: HTMLElement,
    aircraftType: AircraftType,
    size: number,
    aircraft?: Aircraft
  ) {
    this.createFallbackIcon(container, aircraftType, size, aircraft);

    let iconFile = "";
    if (aircraft?.isLocked) {
      iconFile = "alert.svg";
    } else {
      switch (aircraftType) {
        case "mother":
          iconFile = "mother-aircraft.svg";
          break;
        case "self":
          iconFile = "friendly_aircraft.svg";
          break;
        case "friendly":
          iconFile = "friendly_aircraft.svg";
          break;
        case "threat":
          iconFile = "hostile_aircraft.svg";
          break;
        default:
          iconFile = "unknown_aircraft.svg";
          break;
      }
    }

    const iconElement = document.createElement("img");
    iconElement.src = `icons/${iconFile}`;
    iconElement.alt = `${aircraftType} aircraft`;

    let glowFilter = "";
    if (aircraft?.isLocked) {
      glowFilter = `drop-shadow(0 0 8px #ffaa00) drop-shadow(0 0 16px #ff8800)`;
    } else if (aircraftType === "mother") {
      glowFilter = `drop-shadow(0 0 6px #0080ff) drop-shadow(0 0 12px #0080ff)`;
    } else if (aircraftType === "self") {
      glowFilter = `drop-shadow(0 0 6px #FFD700) drop-shadow(0 0 12px #FFA500)`;
    } else if (aircraftType === "threat") {
      glowFilter = `drop-shadow(0 0 6px #ff0000) drop-shadow(0 0 12px #ff0000)`;
    } else {
      glowFilter = `drop-shadow(0 0 5px rgba(0, 255, 0, 1)) drop-shadow(0 0 10px rgba(0, 255, 0, 0.8))`;
    }

    iconElement.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: ${size}px;
      height: ${size}px;
      pointer-events: none;
      filter: ${glowFilter};
      display: block;
      visibility: visible;
      opacity: 1;
      z-index: 6;
      object-fit: contain;
    `;

    iconElement.onload = () => {
      console.log(
        `✅ Loaded SVG aircraft icon: ${iconFile} for ${aircraftType}`
      );
    };

    iconElement.onerror = () => {
      console.warn(
        `⚠️ SVG icon not available: ${iconFile} for ${aircraftType}, using fallback`
      );

      if (iconElement.parentNode) {
        iconElement.parentNode.removeChild(iconElement);
      }
    };

    container.appendChild(iconElement);

    console.log(
      `✅ Created aircraft icon system for ${aircraftType} with fallback + SVG (size ${size}px)`
    );
  }

  private createFallbackIcon(
    container: HTMLElement,
    aircraftType: AircraftType,
    size: number,
    aircraft?: Aircraft
  ) {
    const fallbackElement = document.createElement("div");
    const color = this.getAircraftColor(aircraftType);

    fallbackElement.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: ${size}px;
      height: ${size}px;
      background: transparent;
      border: none;
      display: flex !important;
      align-items: center;
      justify-content: center;
      color: ${color};
      font-family: monospace;
      font-weight: bold;
      font-size: ${Math.max(10, size * 0.5)}px;
      pointer-events: none;
      z-index: 5;
      text-shadow: 0 0 10px ${color}, 0 0 20px ${color}, 1px 1px 3px rgba(0, 0, 0, 1);
      visibility: visible !important;
      opacity: 1 !important;
    `;

    if (aircraft?.isLocked) {
      const alertIcon = document.createElement("img");
      alertIcon.src = "icons/alert.svg";
      alertIcon.alt = "Locked aircraft";
      alertIcon.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: ${size}px;
        height: ${size}px;
        pointer-events: none;
        z-index: 7;
        object-fit: contain;
      `;
      container.appendChild(alertIcon);
      fallbackElement.setAttribute("data-icon-type", "locked");
      fallbackElement.style.background = "transparent";
    } else {
      switch (aircraftType) {
        case "mother":
          fallbackElement.textContent = "M";
          fallbackElement.setAttribute("data-icon-type", "mother");
          break;
        case "self":
          fallbackElement.textContent = "★";
          fallbackElement.setAttribute("data-icon-type", "self");
          break;
        case "friendly":
          fallbackElement.textContent = "F";
          fallbackElement.setAttribute("data-icon-type", "friendly");
          break;
        case "threat":
          fallbackElement.textContent = "⚠";
          fallbackElement.setAttribute("data-icon-type", "threat");
          break;
        default:
          fallbackElement.textContent = "?";
          fallbackElement.setAttribute("data-icon-type", "unknown");
          break;
      }
    }

    container.appendChild(fallbackElement);
    console.log(
      `✅ Created fallback icon for ${aircraftType}, symbol: "${fallbackElement.textContent}", color: ${color}`
    );
  }

  private getAircraftColor(aircraftType: AircraftType): string {
    switch (aircraftType) {
      case "mother":
        return "#0080ff";
      case "self":
        return "#FFD700";
      case "friendly":
        return "#00ff00";
      case "threat":
        return "#ff0000";
      default:
        return "#ffff00";
    }
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

      this.updateAircraftIcon(aircraftElement, aircraft);
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

  private createAdaptiveRadarCircles(visualizationArea: HTMLElement) {
    let centerAircraft: Aircraft | null = null;

    if (!centerAircraft) return;

    let maxDistance = 0;
    this.aircraft.forEach((aircraft, id) => {
      if (id === centerAircraft.id) return;

      const relativeLat = aircraft.lat - centerAircraft.lat;
      const relativeLng = aircraft.lng - centerAircraft.lng;
      const cartesianCoords = this.convertToCartesian(relativeLat, relativeLng);

      const distance = Math.sqrt(
        cartesianCoords.x * cartesianCoords.x +
          cartesianCoords.y * cartesianCoords.y
      );
      maxDistance = Math.max(maxDistance, Math.abs(distance));
    });

    console.log(
      `📡 Maximum aircraft distance: ${maxDistance.toFixed(2)} units`
    );

    const minRadarRange = 20;
    const bufferFactor = 1.5;
    const adaptiveRange = Math.max(minRadarRange, maxDistance * bufferFactor);
    const viewportWidth = window.innerWidth - 60;
    const viewportHeight = window.innerHeight - 60;
    const minDimension = Math.min(viewportWidth, viewportHeight);

    const numCircles = 3;

    for (let i = 1; i <= numCircles; i++) {
      const circle = document.createElement("div");

      const rangeRatio = adaptiveRange / 50;
      const baseRadius = i * ((minDimension * 0.35 * rangeRatio) / numCircles);
      const radius = baseRadius / this.zoomLevel;

      const minRadius = 30;
      const maxRadius = minDimension * 0.4;
      const clampedRadius = Math.max(minRadius, Math.min(maxRadius, radius));

      circle.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        width: ${clampedRadius * 2}px;
        height: ${clampedRadius * 2}px;
        margin-top: -${clampedRadius}px;
        margin-left: -${clampedRadius}px;
        border: 2px solid #00ff00;
        border-radius: 50%;
        pointer-events: none;
        box-sizing: border-box;
        opacity: 0.7;
      `;

      const rangeLabel = document.createElement("div");
      const estimatedNM = Math.round((clampedRadius / minDimension) * 400);
      rangeLabel.textContent = `${estimatedNM}NM`;
      rangeLabel.style.cssText = `
        position: absolute;
        top: 50%;
        left: ${50 + (clampedRadius / minDimension) * 100}%;
        color: #00ff00;
        font-family: monospace;
        font-size: 10px;
        background: rgba(0, 0, 0, 0.7);
        padding: 2px 4px;
        border-radius: 2px;
        transform: translateY(-50%);
        z-index: 2;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        text-rendering: optimizeLegibility;
      `;

      visualizationArea.appendChild(circle);
      visualizationArea.appendChild(rangeLabel);

      console.log(
        `📡 Created radar circle ${i}: radius=${clampedRadius.toFixed(1)}px, range≈${estimatedNM}NM`
      );
    }

    this.updateRangeInfo(adaptiveRange, maxDistance);
  }

  private updateRangeInfo(adaptiveRange: number, maxDistance: number) {
    const rangeInfo = document.getElementById("adaptive-range-info");
    if (rangeInfo) {
      const aircraftCount = this.aircraft.size - 1;
      const maxRangeNM = Math.round((adaptiveRange / 50) * 200);
      rangeInfo.textContent = `AUTO-ZOOM: ${(this.zoomLevel * 100).toFixed(0)}% | ${aircraftCount} AIRCRAFT | MAX DIST: ${maxDistance.toFixed(1)}`;
    }
  }

  private findNearestMumbaiLocation(lat: number, lng: number): string {
    let nearestLocation = "Mumbai";
    let minDistance = Infinity;

    const mumbaiData = this.mumbaiLocations.Mumbai;

    mumbaiData.districts.forEach((district) => {
      district.places.forEach((place) => {
        const distance = Math.sqrt(
          Math.pow(lat - place.lat, 2) + Math.pow(lng - place.lng, 2)
        );

        if (distance < minDistance) {
          minDistance = distance;
          nearestLocation = place.name;
        }
      });
    });

    return nearestLocation;
  }

  private updateAircraftIcon(aircraftElement: HTMLElement, aircraft: Aircraft) {
    const existingIcons = aircraftElement.querySelectorAll("[data-icon-type]");
    existingIcons.forEach((icon) => icon.remove());

    const size = aircraft.aircraftType === "threat" ? 24 : 20;

    this.createAircraftIcon(
      aircraftElement,
      aircraft.aircraftType,
      size,
      aircraft
    );
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
