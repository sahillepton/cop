import './index.css';

console.log(
  '👋 This message is being logged by "renderer.ts", included via Vite',
);

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
  totalDistanceCovered?: number; // Total distance in nautical miles
  lastPosition?: { lat: number; lng: number }; // Last known position for distance calculation
};

// WebSocket client
class WebSocketClient {
  private ws: WebSocket | null = null;
  private aircraft: Map<string, Aircraft> = new Map();
  private nodeId: string = '';
  private selectedRange: string = '200NM'; // Default range
  private zoomLevel: number = 1; // Default zoom level
  private zoomDisplay: HTMLElement | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private currentLat: number = 0;
  private currentLng: number = 0;
  private showOtherNodes: boolean = true; // Toggle visibility of other nodes
  private messageCodesInterval: NodeJS.Timeout | null = null; // Track message codes display interval
  private messageCodes: number[] = [101, 102, 103, 104, 105, 106, 122]; // Available message codes
  private mapUpdateInterval: NodeJS.Timeout | null = null; // Track periodic map updates
  private motherAircraft: Aircraft | null = null; // Reference to mother aircraft for centering
  private showMap: boolean = false; // Toggle visibility of background map
  private mapElement: HTMLElement | null = null; // Reference to map container
  private centerMode: 'mother' | 'self' = 'mother'; // Toggle between mother-centered and self-centered view
  private showThreatDialog: boolean = true; // Toggle visibility of threat dialog
  private animationFrameId: number | null = null; // Track requestAnimationFrame ID
  private aircraftInterpolation: Map<string, {
    startLat: number;
    startLng: number;
    targetLat: number;
    targetLng: number;
    startTime: number;
    duration: number;
    startHeading: number;
    targetHeading: number;
  }> = new Map(); // Track interpolation data for each aircraft
  private panOffset: { x: number; y: number } = { x: 0, y: 0 }; // Track pan offset
  private isDragging: boolean = false; // Track if currently dragging
  private lastMousePos: { x: number; y: number } = { x: 0, y: 0 }; // Last mouse position for dragging
  private viewAdjustmentThrottle: NodeJS.Timeout | null = null; // Throttle view adjustments
  private isZoomTransitioning: boolean = false; // Track if zoom transition is in progress
  private lastDistanceUpdate: number = 0; // Track last time distances were updated
  private simulationSystem: {
    isRunning: boolean;
    startTime: number;
    duration: number; // Duration in milliseconds (2-3 minutes)
    phase: 'warmup' | 'engagement' | 'maneuver' | 'resolution';
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
    duration: 150000, // 2.5 minutes (150 seconds)
    phase: 'warmup',
    lastPhaseChange: 0,
    threatSpawnTimer: 0,
    lastThreatSpawn: 0,
    activeThreats: new Set(),
    engagementCount: 0,
    lastMapJump: 0,
    mapJumpInterval: 20000 // Jump map every 20 seconds
  };
  private warningSystem: {
    threatProximityThreshold: number; // Distance threshold for threat warnings
    motherDistanceThreshold: number; // Distance threshold for mother separation warnings
    activeWarnings: Set<string>; // Track active warnings
    lastWarningCheck: number; // Timestamp of last warning check
  } = {
    threatProximityThreshold: 0.02, // ~2NM equivalent
    motherDistanceThreshold: 0.05, // ~5NM equivalent  
    activeWarnings: new Set(),
    lastWarningCheck: 0
  };

  constructor() {
    this.connect();
  }

  private connect() {
    try {
      this.ws = new WebSocket('ws://localhost:8080');
      
      this.ws.onopen = () => {
        console.log('🔗 Connected to WebSocket server');
        console.log('🔗 WebSocket ready state:', this.ws?.readyState);
        this.sendConnection();
      };

      this.ws.onmessage = (event) => {
        console.log('🔄 Raw WebSocket message received:', event.data);
        try {
        const data = JSON.parse(event.data);
          console.log('🔄 Parsed message data:', data);
        this.handleMessage(data);     
        } catch (error) {
          console.error('❌ Failed to parse WebSocket message:', error);
          console.error('❌ Raw data:', event.data);
        }
      };

      this.ws.onclose = () => {
        console.log('❌ WebSocket connection closed. Attempting to reconnect...');
        setTimeout(() => this.connect(), 3000);
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to connect to WebSocket:', error);
      setTimeout(() => this.connect(), 3000);
    }
  }

  private sendConnection() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.nodeId = this.generateId();
      // Set initial realistic location (somewhere in a reasonable area, closer to center)
      this.currentLat = 40.7128 + (Math.random() - 0.5) * 0.05; // Near NYC with moderate variation
      this.currentLng = -74.0060 + (Math.random() - 0.5) * 0.05;
      
      const connectionData = {
        type: 'connection',
        payload: {
          id: this.nodeId,
          status: 'connected',
          info: 'F-35 Lightning II Client',
          lat: this.currentLat,
          lng: this.currentLng,
          aircraftType: 'self', // Self aircraft marked as 'self' type
          callSign: `LIGHTNING-${Math.floor(Math.random() * 99) + 1}`,
          altitude: 25000 + Math.floor(Math.random() * 10000),
          heading: Math.floor(Math.random() * 360),
          speed: this.getAircraftSpeed('self')
        }
      };
      
      // Add self aircraft to the aircraft map immediately
      this.aircraft.set(this.nodeId, connectionData.payload as Aircraft);
      
      this.ws.send(JSON.stringify(connectionData));
      console.log('📤 Sent connection data:', connectionData);
      console.log('📤 Waiting for server to send existing aircraft...');
      
      // Start heartbeat to maintain connection
      this.startHeartbeat();
      
      // Start sending location updates
      this.startLocationUpdates();
      
      // Start periodic map updates
      this.startPeriodicMapUpdates();
      
      // Start continuous movement system
      this.startContinuousMovement();
      
      // Start tactical simulation
      this.startTacticalSimulation();
      
      // Update UI to show self aircraft immediately
      this.updateUI();
    }
  }

  private handleMessage(data: any) {
    console.log('📨 Received message:', data);
    
    switch (data.type) {
      case 'connection':
        // Always add/update the aircraft
        console.log(`🛩️ Connection message for aircraft: ${data.payload.callSign || data.payload.id} (${data.payload.aircraftType || 'unknown'})`);
        this.addAircraft(data.payload);
        if (data.payload.id !== this.nodeId) {
          console.log(`✅ Added external aircraft: ${data.payload.callSign || data.payload.id} (${data.payload.aircraftType})`);
        }
        break;
      case 'message':
        console.log(`💬 Message from ${data.payload.id}:`, data.payload.message);
        break;
      case 'update':
        console.log(`🔄 Update message:`, data.payload);
        this.updateAircraft(data.payload);
        break;
      case 'location':
        console.log(`📍 Location update for ${data.payload.id}:`, data.payload);
        this.updateAircraftLocation(data.payload);
        break;
      default:
        console.log(`❓ Unknown message type: ${data.type}`, data);
    }
    this.updateUI();
  }

  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    // Haversine formula to calculate distance between two lat/lng points
    // Returns distance in nautical miles
    const R = 3440.065; // Earth's radius in nautical miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return distance;
  }

  private getAircraftSpeed(aircraftType: AircraftType): number {
    switch (aircraftType) {
      case 'mother':
        // Mother aircraft: 1.5-2 Mach (slower, command aircraft)
        const motherMach = 1.5 + Math.random() * 0.5; // 1.5-2.0 Mach
        return Math.round(motherMach * 661.5); // Convert Mach to knots (1 Mach = 661.5 knots at sea level)
      case 'self':
      case 'friendly':
        // Friendly/Self aircraft: 2-4 Mach (high-performance fighters)
        const friendlyMach = 2.0 + Math.random() * 2.0; // 2.0-4.0 Mach
        return Math.round(friendlyMach * 661.5); // Convert Mach to knots
      case 'threat':
        // Threat aircraft: Random speeds (unpredictable)
        const threatMach = 0.5 + Math.random() * 4.5; // 0.5-5.0 Mach (very random)
        return Math.round(threatMach * 661.5); // Convert Mach to knots
      default:
        // Default: 2-3 Mach
        const defaultMach = 2.0 + Math.random() * 1.0; // 2.0-3.0 Mach
        return Math.round(defaultMach * 661.5); // Convert Mach to knots
    }
  }

  private addAircraft(aircraftData: any) {
    console.log(`🔧 Processing aircraft data:`, aircraftData);
    
    const aircraft: Aircraft = {
      id: aircraftData.id,
      status: aircraftData.status,
      info: aircraftData.info,
      lat: aircraftData.lat,
      lng: aircraftData.lng,
      aircraftType: aircraftData.aircraftType || 'friendly',
      callSign: aircraftData.callSign || `UNKNOWN-${aircraftData.id}`,
      altitude: aircraftData.altitude || 25000,
      heading: aircraftData.heading || 0,
      speed: aircraftData.speed || this.getAircraftSpeed(aircraftData.aircraftType || 'friendly'),
      totalDistanceCovered: 0, // Initialize distance tracker
      lastPosition: { lat: aircraftData.lat, lng: aircraftData.lng } // Store initial position
    };
    
    console.log(`🔧 Created aircraft object:`, aircraft);
    
    this.aircraft.set(aircraftData.id, aircraft);
    console.log(`🔧 Aircraft map now has ${this.aircraft.size} aircraft`);
    
    // Aircraft will move naturally based on real position updates
    
    // If this is the mother aircraft, set it as reference
    if (aircraft.aircraftType === 'mother') {
      this.motherAircraft = aircraft;
      console.log(`🎯 MOTHER AIRCRAFT FOUND: ${aircraft.callSign} - setting as center reference`);
      console.log(`🎯 Mother aircraft details:`, aircraft);
          } else {
      console.log(`✈️ Non-mother aircraft: ${aircraft.callSign} (${aircraft.aircraftType})`);
    }
    
    console.log(`✈️ Aircraft added/updated: ${aircraft.callSign} (${aircraft.aircraftType}) at ${aircraft.lat.toFixed(4)}, ${aircraft.lng.toFixed(4)}`);
    console.log(`📊 Total aircraft in map: ${this.aircraft.size}`);
    
    // List all aircraft in the map
    console.log(`📋 All aircraft:`);
    this.aircraft.forEach((a, id) => {
      console.log(`  - ${a.callSign} (${a.aircraftType}) [${id}]`);
    });
    
    this.updateDebugInfo();
  }

  // Aircraft movement is now handled by the server, so this method is removed

  private updateAircraft(aircraftData: { id: string; status: string }) {
    const aircraft = this.aircraft.get(aircraftData.id);
    if (aircraft) {
      aircraft.status = aircraftData.status;
      this.aircraft.set(aircraftData.id, aircraft);
      console.log(`Aircraft updated: ${aircraft.callSign} -> ${aircraftData.status}`);
    }
  }

  private updateAircraftLocation(locationData: any) {
    const aircraft = this.aircraft.get(locationData.id);
    if (aircraft) {
      // Store current position as start point for interpolation
      const startLat = aircraft.lat;
      const startLng = aircraft.lng;
      const startHeading = aircraft.heading;
      
      // Update target position
      const targetLat = locationData.lat;
      const targetLng = locationData.lng;
      const targetHeading = locationData.heading !== undefined ? locationData.heading : aircraft.heading;
      
      // Update additional flight data if provided
      if (locationData.altitude !== undefined) aircraft.altitude = locationData.altitude;
      if (locationData.speed !== undefined) aircraft.speed = locationData.speed;
      
      this.aircraft.set(locationData.id, aircraft);
      console.log(`✈️ ${aircraft.callSign} location updated: ${targetLat.toFixed(4)}, ${targetLng.toFixed(4)} | Alt: ${aircraft.altitude}ft, Hdg: ${targetHeading}°, Spd: ${aircraft.speed}kts`);
      this.updateDebugInfo();
      
      // Calculate interpolation duration based on distance and speed (very fast for highly visible movement)
      const distance = Math.sqrt(Math.pow(targetLat - startLat, 2) + Math.pow(targetLng - startLng, 2));
      const speedKnots = aircraft.speed;
      const duration = Math.max(100, Math.min(800, (distance * 111000) / (speedKnots * 0.514) * 200)); // Very fast movement for highly visible changes
      
      // Set up interpolation
      this.aircraftInterpolation.set(locationData.id, {
        startLat,
        startLng,
        targetLat,
        targetLng,
        startTime: Date.now(),
        duration,
        startHeading,
        targetHeading
      });
      
      // Map updates are handled automatically by periodic smooth updates
      // No need to force immediate updates here
      
      // Check for warnings after position update (throttled)
      this.throttledWarningCheck();
      
      // Update threat dialog when aircraft positions change
      this.updateThreatDialog();
    }
  }

  private updateAircraftVisualPosition(aircraftId: string) {
    const aircraft = this.aircraft.get(aircraftId);
    if (!aircraft) return;

    // Use mother aircraft as center reference, or fallback to self aircraft
    const centerAircraft = this.motherAircraft || this.aircraft.get(this.nodeId);
    if (!centerAircraft) return;

    // Calculate new position relative to center aircraft
    const relativeLat = aircraft.lat - centerAircraft.lat;
    const relativeLng = aircraft.lng - centerAircraft.lng;
    
    // Convert lat/lng degrees to Cartesian coordinates for 2D graph
    const cartesianCoords = this.convertToCartesian(relativeLat, relativeLng);
    const x = cartesianCoords.x + 50; // 50% is center (origin)
    const y = cartesianCoords.y + 50; // 50% is center (origin)
    
    // Always display all aircraft - no visibility restrictions
    const isVisible = true; // Always show all aircraft

    // Find the existing aircraft element and update its position smoothly
    const aircraftElement = document.querySelector(`[data-aircraft-id="${aircraftId}"]`) as HTMLElement;
    if (aircraftElement) {
      // INSTANT position change for continuous movement (no transition delays)
      aircraftElement.style.transition = 'none';
      aircraftElement.style.top = `${y}%`;
      aircraftElement.style.left = `${x}%`;
      aircraftElement.style.display = 'block';
      aircraftElement.style.visibility = 'visible';
      aircraftElement.style.opacity = '1';
      aircraftElement.style.zIndex = '10';
      aircraftElement.style.width = '20px';
      aircraftElement.style.height = '20px';
      
      // Rotate aircraft based on heading for more realistic movement
      const rotation = aircraft.heading;
      const iconElement = aircraftElement.querySelector('img');
      if (iconElement) {
        iconElement.style.transition = 'none';
        iconElement.style.transform = `rotate(${rotation}deg)`;
      }
    } else {
      // If element doesn't exist, update the entire UI
      this.updateUI();
    }
  }

  private updateAircraftPosition(aircraftId: string) {
    // This method is now used for initial positioning and major updates
    // Continuous movement is handled by updateAircraftVisualPosition
    this.updateAircraftVisualPosition(aircraftId);
  }

  private createMovementTrail(aircraftElement: HTMLElement, newX: number, newY: number) {
    // Get current position
    const currentTop = parseFloat(aircraftElement.style.top) || 50;
    const currentLeft = parseFloat(aircraftElement.style.left) || 50;
    
    // Only create trail if aircraft moved significantly
    const distance = Math.sqrt(Math.pow(newX - currentLeft, 2) + Math.pow(newY - currentTop, 2));
    if (distance < 1) return; // Don't create trail for tiny movements
    
    // Create trail element
    const trail = document.createElement('div');
    trail.style.cssText = `
      position: absolute;
      top: ${currentTop}%;
      left: ${currentLeft}%;
      width: 8px;
      height: 8px;
      background: rgba(0, 255, 0, 0.6);
      border-radius: 50%;
      pointer-events: none;
      z-index: 1;
      animation: movementTrail 1s ease-out forwards;
    `;
    
    // Add trail to visualization area
    const visualizationArea = document.getElementById('visualization-area');
    if (visualizationArea) {
      visualizationArea.appendChild(trail);
      
      // Remove trail after animation completes
      setTimeout(() => {
        if (trail.parentNode) {
          trail.parentNode.removeChild(trail);
        }
      }, 1000);
    }
  }

  private isAircraftThreat(aircraft: Aircraft): boolean {
    return aircraft.aircraftType === 'threat';
  }

  private updateAircraftThreatStatus(aircraftElement: HTMLElement, aircraft: Aircraft) {
    if (aircraft.aircraftType === 'threat') {
      // Threat aircraft - red with static glow (no blinking)
      aircraftElement.style.background = '#ff0000';
      aircraftElement.style.boxShadow = '0 0 20px #ff0000, 0 0 30px #ff0000';
      aircraftElement.style.animation = 'none';
      
      // Add threat indicator (no blinking)
      let threatIndicator = aircraftElement.querySelector('.threat-indicator') as HTMLElement;
      if (!threatIndicator) {
        threatIndicator = document.createElement('div');
        threatIndicator.className = 'threat-indicator';
        threatIndicator.style.cssText = `
          position: absolute;
          top: -8px;
          right: -8px;
          width: 12px;
          height: 12px;
          background: #ff0000;
          border: 2px solid #ffffff;
          border-radius: 50%;
          animation: none;
        `;
        aircraftElement.appendChild(threatIndicator);
      }
    } else if (aircraft.aircraftType === 'mother') {
      // Mother aircraft - blue with static glow (no pulsing)
      aircraftElement.style.background = '#0080ff';
      aircraftElement.style.boxShadow = '0 0 25px #0080ff, 0 0 40px #0080ff';
      aircraftElement.style.animation = 'none';
    } else if (aircraft.aircraftType === 'self') {
      // Self aircraft - yellow/gold with distinct glow
      aircraftElement.style.background = '#FFD700';
      aircraftElement.style.boxShadow = '0 0 20px #FFD700, 0 0 35px #FFA500';
      aircraftElement.style.animation = 'none';
      
      // Remove threat indicator if exists
      const threatIndicator = aircraftElement.querySelector('.threat-indicator');
      if (threatIndicator) {
        threatIndicator.remove();
      }
    } else {
      // Friendly aircraft - green
      aircraftElement.style.background = '#00ff00';
      aircraftElement.style.boxShadow = '0 0 15px rgba(0, 255, 0, 0.8)';
      aircraftElement.style.animation = 'none';
      
      // Remove threat indicator if exists
      const threatIndicator = aircraftElement.querySelector('.threat-indicator');
      if (threatIndicator) {
        threatIndicator.remove();
      }
    }
  }

  private updateDebugInfo() {
    const debugInfo = document.getElementById('debug-info');
    if (debugInfo) {
      const selfAircraft = this.aircraft.get(this.nodeId);
      const threatCount = this.getThreatCount();
      const motherCount = Array.from(this.aircraft.values()).filter(a => a.aircraftType === 'mother').length;
      const friendlyCount = Array.from(this.aircraft.values()).filter(a => a.aircraftType === 'friendly').length;
      
      const centerRef = this.centerMode === 'mother' 
        ? (this.motherAircraft ? `Mother: ${this.motherAircraft.callSign}` : 'Self (fallback)')
        : (selfAircraft ? `Self: ${selfAircraft.callSign}` : 'Mother (fallback)');
      
      const warningStatus = this.warningSystem.activeWarnings.size > 0 ? `⚠️ WARNINGS: ${this.warningSystem.activeWarnings.size}` : '✅ ALL CLEAR';
      
      if (selfAircraft) {
        debugInfo.textContent = `Aircraft: ${this.aircraft.size} | Mother: ${motherCount} | Friendly: ${friendlyCount} | Threats: ${threatCount} | Mode: ${this.centerMode.toUpperCase()} | ${warningStatus}`;
      } else {
        debugInfo.textContent = `Aircraft: ${this.aircraft.size} | Mother: ${motherCount} | Friendly: ${friendlyCount} | Threats: ${threatCount} | Mode: ${this.centerMode.toUpperCase()} | ${warningStatus}`;
      }
    }
  }

  private getThreatCount(): number {
    return Array.from(this.aircraft.values()).filter(aircraft => aircraft.aircraftType === 'threat').length;
  }

  private getNearestThreats(centerAircraft: Aircraft, maxThreats: number = 3): Array<{aircraft: Aircraft, distance: number, distanceNM: number}> {
    const threats: Array<{aircraft: Aircraft, distance: number, distanceNM: number}> = [];
    
    this.aircraft.forEach((aircraft, id) => {
      if (aircraft.aircraftType === 'threat') {
        const distance = this.calculateDistanceBetweenAircraft(centerAircraft, aircraft);
        const distanceNM = distance; // Already in nautical miles from Haversine formula
        threats.push({ aircraft, distance, distanceNM });
      }
    });
    
    // Sort by distance (nearest first) and return top threats
    return threats.sort((a, b) => a.distance - b.distance).slice(0, maxThreats);
  }

  private createThreatDialog() {
    // Remove existing threat dialog if it exists
    const existingDialog = document.getElementById('threat-dialog');
    if (existingDialog) {
      existingDialog.remove();
    }

    const threatDialog = document.createElement('div');
    threatDialog.id = 'threat-dialog';
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

    // Add header
    const header = document.createElement('div');
    header.style.cssText = `
      color: #ff4444;
      font-weight: bold;
      font-size: 14px;
      margin-bottom: 8px;
      text-align: center;
      border-bottom: 1px solid #ff4444;
      padding-bottom: 4px;
    `;
    header.textContent = '⚠️ NEAREST THREATS';
    threatDialog.appendChild(header);

    // Add threat list container
    const threatList = document.createElement('div');
    threatList.id = 'threat-list';
    threatList.style.cssText = `
      max-height: 200px;
      overflow-y: auto;
    `;
    threatDialog.appendChild(threatList);

    document.body.appendChild(threatDialog);
    return threatDialog;
  }

  private updateThreatDialog() {
    if (!this.showThreatDialog) return; // Don't update if dialog is hidden
    
    let centerAircraft: Aircraft | null = null;
    if (this.centerMode === 'mother') {
      centerAircraft = this.motherAircraft || this.aircraft.get(this.nodeId);
    } else {
      centerAircraft = this.aircraft.get(this.nodeId) || this.motherAircraft;
    }

    if (!centerAircraft) return;

    const nearestThreats = this.getNearestThreats(centerAircraft, 5); // Show top 5 threats
    const threatList = document.getElementById('threat-list');
    
    if (!threatList) {
      // Create dialog if it doesn't exist
      this.createThreatDialog();
      this.updateThreatDialog(); // Recursive call to populate it
      return;
    }

    // Clear existing content
    threatList.innerHTML = '';

    if (nearestThreats.length === 0) {
      const noThreats = document.createElement('div');
      noThreats.style.cssText = `
        color: #44ff44;
        text-align: center;
        padding: 10px;
        font-style: italic;
      `;
      noThreats.textContent = '✅ NO THREATS DETECTED';
      threatList.appendChild(noThreats);
    } else {
      nearestThreats.forEach((threat, index) => {
        const threatItem = document.createElement('div');
        threatItem.style.cssText = `
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 6px 8px;
          margin: 2px 0;
          background: rgba(255, 68, 68, 0.1);
          border-left: 3px solid #ff4444;
          border-radius: 3px;
        `;

        const threatInfo = document.createElement('div');
        threatInfo.style.cssText = `
          flex: 1;
        `;

        const callSign = document.createElement('div');
        callSign.style.cssText = `
          font-weight: bold;
          color: #ff4444;
        `;
        callSign.textContent = threat.aircraft.callSign;

        const details = document.createElement('div');
        details.style.cssText = `
          font-size: 10px;
          color: #cccccc;
          margin-top: 2px;
        `;
        details.textContent = `${threat.aircraft.altitude}ft | ${threat.aircraft.speed}kts | Hdg ${threat.aircraft.heading}°`;

        threatInfo.appendChild(callSign);
        threatInfo.appendChild(details);

        const distance = document.createElement('div');
        distance.style.cssText = `
          font-weight: bold;
          color: #ffaa44;
          font-size: 14px;
          text-align: right;
        `;
        distance.textContent = `${threat.distanceNM.toFixed(1)}NM`;

        threatItem.appendChild(threatInfo);
        threatItem.appendChild(distance);
        threatList.appendChild(threatItem);
      });
    }

    // Update header with threat count
    const header = document.querySelector('#threat-dialog > div:first-child');
    if (header) {
      header.textContent = `⚠️ NEAREST THREATS (${nearestThreats.length})`;
    }
  }

  private toggleThreatDialog() {
    this.showThreatDialog = !this.showThreatDialog;
    console.log(`Threat dialog visibility: ${this.showThreatDialog ? 'SHOW' : 'HIDE'}`);
    
    const threatDialog = document.getElementById('threat-dialog');
    if (threatDialog) {
      threatDialog.style.display = this.showThreatDialog ? 'block' : 'none';
    } else if (this.showThreatDialog) {
      // Create dialog if it doesn't exist and we want to show it
      this.createThreatDialog();
      this.updateThreatDialog();
    }
    
    // Update button appearance
    const buttons = document.querySelectorAll('button');
    buttons.forEach(button => {
      if (button.textContent === 'THRT') {
        button.style.background = this.showThreatDialog ? '#ff4444' : '#333';
        button.style.opacity = this.showThreatDialog ? '1' : '0.5';
      }
    });
  }

  // Location updates are now handled by the server, so this method is removed

  private startHeartbeat() {
    // Send periodic heartbeat to maintain connection and let server know we're alive
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const heartbeatData = {
          type: 'heartbeat',
          payload: {
            id: this.nodeId,
            timestamp: Date.now(),
            status: 'connected'
          }
        };
        this.ws.send(JSON.stringify(heartbeatData));
        console.log('Sent heartbeat:', heartbeatData);
      }
    }, 5000); // Send heartbeat every 5 seconds
  }

  private startLocationUpdates() {
    // Send periodic location updates to server with variable frequency
    const sendLocationUpdate = () => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const selfAircraft = this.aircraft.get(this.nodeId);
        if (selfAircraft) {
          // Calculate movement based on current speed and heading
          const speedKnots = selfAircraft.speed;
          const headingRad = (selfAircraft.heading * Math.PI) / 180;
          
          // Convert speed from knots to degrees per second (very fast, highly visible movement)
          // 1 knot = 1.852 km/h = 0.514 m/s
          // At equator: 1 degree ≈ 111,320 meters
          // So 1 knot ≈ 0.514 / 111,320 ≈ 0.00000462 degrees per second
          // Multiply by 50 for very fast, highly visible movement
          const speedDegreesPerSecond = speedKnots * 0.00000462 * 50;
          
          // Calculate movement in lat/lng based on heading
          // For latitude: movement is directly proportional to cos(heading)
          // For longitude: movement is proportional to sin(heading) but also depends on latitude
          const latMovement = Math.cos(headingRad) * speedDegreesPerSecond;
          const lngMovement = Math.sin(headingRad) * speedDegreesPerSecond / Math.cos(selfAircraft.lat * Math.PI / 180);
          
          // Apply movement
          selfAircraft.lat += latMovement;
          selfAircraft.lng += lngMovement;
          
          // Add some random variation to make movement more realistic (larger movements for visibility)
          selfAircraft.lat += (Math.random() - 0.5) * 0.0002;
          selfAircraft.lng += (Math.random() - 0.5) * 0.0002;
          
          // Update heading and speed more frequently for larger movements
          if (Math.random() < 0.1) { // 10% chance for more frequent heading changes
            selfAircraft.heading = (selfAircraft.heading + (Math.random() - 0.5) * 20 + 360) % 360; // Larger heading changes
          }
          if (Math.random() < 0.05) { // 5% chance for more frequent speed changes
            selfAircraft.speed += (Math.random() - 0.5) * 50; // Larger speed changes
            selfAircraft.speed = Math.max(200, Math.min(800, selfAircraft.speed));
          }
          
          const locationData = {
            type: 'location',
            payload: {
              id: this.nodeId,
              lat: selfAircraft.lat,
              lng: selfAircraft.lng,
              altitude: selfAircraft.altitude,
              heading: selfAircraft.heading,
              speed: selfAircraft.speed
            }
          };
          
          this.ws.send(JSON.stringify(locationData));
          console.log(`📡 Sent self location update: ${selfAircraft.callSign} at ${selfAircraft.lat.toFixed(6)}, ${selfAircraft.lng.toFixed(6)} | Speed: ${selfAircraft.speed}kts, Hdg: ${selfAircraft.heading}°`);
        }
      }
      
      // Schedule next update with random interval between 100ms and 1s for realistic movement
      const nextInterval = 100 + Math.random() * 900; // 100ms to 1000ms
      setTimeout(sendLocationUpdate, nextInterval);
    };
    
    // Start the first update
    sendLocationUpdate();
  }

  private startPeriodicMapUpdates() {
    // Force map updates every 50ms for ultra-smooth tracking of center aircraft movement
    this.mapUpdateInterval = setInterval(() => {
      if (this.showMap) {
        const visualizationArea = document.getElementById('visualization-area');
        if (visualizationArea) {
          this.updateMapPositionSmooth(visualizationArea);
        }
      }
    }, 50); // Update every 50ms for ultra-smooth movement tracking
  }

  private startContinuousMovement() {
    // Use requestAnimationFrame for smooth, efficient movement updates
    const animate = () => {
      this.updateContinuousMovement();
      this.animationFrameId = requestAnimationFrame(animate);
    };
    this.animationFrameId = requestAnimationFrame(animate);
  }

  private startTacticalSimulation() {
    this.simulationSystem.isRunning = true;
    this.simulationSystem.startTime = Date.now();
    this.simulationSystem.lastPhaseChange = Date.now();
    this.simulationSystem.lastThreatSpawn = Date.now();
    
    console.log('🎯 Starting 2.5-minute tactical simulation');
    
    // Create simulation UI
    this.createSimulationUI();
    
    // Create location display
    this.createLocationDisplay();
    
    // Start simulation loop
    this.runSimulationLoop();
  }

  private runSimulationLoop() {
    if (!this.simulationSystem.isRunning) return;
    
    const now = Date.now();
    const elapsed = now - this.simulationSystem.startTime;
    const progress = elapsed / this.simulationSystem.duration;
    
    // Check for phase transitions
    this.checkPhaseTransitions(elapsed);
    
    // Execute phase-specific behaviors
    this.executePhaseBehavior(elapsed);
    
    // Random map location jumps
    this.checkRandomMapJump(elapsed);
    
    // Update simulation UI
    this.updateSimulationUI(elapsed, progress);
    
    // Update location display periodically (every 2 seconds)
    if (elapsed % 2000 < 100) {
      this.updateLocationDisplay();
    }
    
    // Continue simulation if not finished
    if (elapsed < this.simulationSystem.duration) {
      setTimeout(() => this.runSimulationLoop(), 100); // Update every 100ms
    } else {
      this.endSimulation();
    }
  }

  private checkPhaseTransitions(elapsed: number) {
    const currentPhase = this.simulationSystem.phase;
    let newPhase = currentPhase;
    
    if (elapsed < 30000 && currentPhase !== 'warmup') {
      newPhase = 'warmup';
    } else if (elapsed >= 30000 && elapsed < 90000 && currentPhase !== 'engagement') {
      newPhase = 'engagement';
    } else if (elapsed >= 90000 && elapsed < 120000 && currentPhase !== 'maneuver') {
      newPhase = 'maneuver';
    } else if (elapsed >= 120000 && currentPhase !== 'resolution') {
      newPhase = 'resolution';
    }
    
    if (newPhase !== currentPhase) {
      this.simulationSystem.phase = newPhase;
      this.simulationSystem.lastPhaseChange = Date.now();
      // Phase transitions happen silently - no console logs
      this.announcePhaseChange(newPhase);
    }
  }

  private announcePhaseChange(phase: 'warmup' | 'engagement' | 'maneuver' | 'resolution') {
    // All phase announcements disabled - only show location dialog
    // No console messages for phase changes
  }

  private executePhaseBehavior(elapsed: number) {
    const phase = this.simulationSystem.phase;
    
    switch (phase) {
      case 'warmup':
        this.executeWarmupBehavior(elapsed);
        break;
      case 'engagement':
        this.executeEngagementBehavior(elapsed);
        break;
      case 'maneuver':
        this.executeManeuverBehavior(elapsed);
        break;
      case 'resolution':
        this.executeResolutionBehavior(elapsed);
        break;
    }
  }

  private executeWarmupBehavior(elapsed: number) {
    // Gentle formation flying - slow speed changes, smooth turns
    if (elapsed - this.simulationSystem.lastPhaseChange > 5000) {
      // Occasionally spawn friendly aircraft for formation
      if (Math.random() < 0.1) {
        this.spawnFormationAircraft();
      }
    }
  }

  private executeEngagementBehavior(elapsed: number) {
    // Spawn threats and increase activity
    if (elapsed - this.simulationSystem.lastThreatSpawn > 8000) {
      this.spawnThreatAircraft();
      this.simulationSystem.lastThreatSpawn = elapsed;
    }
    
    // Increase speeds for engagement
    this.increaseAircraftSpeeds();
  }

  private executeManeuverBehavior(elapsed: number) {
    // High-speed maneuvers, rapid direction changes
    if (elapsed - this.simulationSystem.lastThreatSpawn > 5000) {
      this.spawnThreatAircraft();
      this.simulationSystem.lastThreatSpawn = elapsed;
    }
    
    // Maximum speeds and aggressive maneuvers
    this.executeAggressiveManeuvers();
  }

  private executeResolutionBehavior(elapsed: number) {
    // Slow down, return to formation
    this.reduceAircraftSpeeds();
    
    // Remove threats gradually
    if (elapsed - this.simulationSystem.lastThreatSpawn > 10000) {
      this.removeThreatAircraft();
    }
  }

  private spawnFormationAircraft() {
    // Spawn friendly aircraft in formation
    const aircraftId = `FRIENDLY-${Date.now()}`;
    const selfAircraft = this.aircraft.get(this.nodeId);
    if (!selfAircraft) return;
    
    // Position near self aircraft for formation
    const offsetLat = (Math.random() - 0.5) * 0.02; // ~1NM
    const offsetLng = (Math.random() - 0.5) * 0.02;
    
    const newAircraft: Aircraft = {
      id: aircraftId,
      status: 'connected',
      info: 'F-22 Raptor',
      lat: selfAircraft.lat + offsetLat,
      lng: selfAircraft.lng + offsetLng,
      aircraftType: 'friendly',
      callSign: `FALCON-${Math.floor(Math.random() * 99) + 1}`,
      altitude: 25000 + Math.floor(Math.random() * 5000),
      heading: selfAircraft.heading + (Math.random() - 0.5) * 30,
      speed: this.getAircraftSpeed('friendly')
    };
    
    this.aircraft.set(aircraftId, newAircraft);
    console.log(`✈️ Spawned formation aircraft: ${newAircraft.callSign}`);
    this.updateUI();
  }

  private spawnThreatAircraft() {
    // Spawn threat aircraft from random directions
    const aircraftId = `THREAT-${Date.now()}`;
    const selfAircraft = this.aircraft.get(this.nodeId);
    if (!selfAircraft) return;
    
    // Position threat at random distance and direction
    const distance = 0.1 + Math.random() * 0.15; // 5-15NM away
    const angle = Math.random() * 2 * Math.PI;
    
    const offsetLat = Math.cos(angle) * distance;
    const offsetLng = Math.sin(angle) * distance;
    
    const newAircraft: Aircraft = {
      id: aircraftId,
      status: 'connected',
      info: 'Unknown Hostile',
      lat: selfAircraft.lat + offsetLat,
      lng: selfAircraft.lng + offsetLng,
      aircraftType: 'threat',
      callSign: `BANDIT-${Math.floor(Math.random() * 99) + 1}`,
      altitude: 20000 + Math.floor(Math.random() * 15000),
      heading: Math.floor(Math.random() * 360),
      speed: this.getAircraftSpeed('threat')
    };
    
    this.aircraft.set(aircraftId, newAircraft);
    this.simulationSystem.activeThreats.add(aircraftId);
    console.log(`🚨 Spawned threat aircraft: ${newAircraft.callSign} at ${distance.toFixed(1)}NM`);
    this.updateUI();
  }

  private increaseAircraftSpeeds() {
    // Increase speeds for all aircraft during engagement
    this.aircraft.forEach((aircraft, id) => {
      if (aircraft.aircraftType === 'self' || aircraft.aircraftType === 'friendly') {
        // Boost friendly aircraft speeds to 3-4 Mach
        const boostMach = 3.0 + Math.random() * 1.0; // 3.0-4.0 Mach
        aircraft.speed = Math.round(boostMach * 661.5);
      }
    });
  }

  private executeAggressiveManeuvers() {
    // Execute aggressive maneuvers for all aircraft
    this.aircraft.forEach((aircraft, id) => {
      if (Math.random() < 0.3) { // 30% chance for maneuver
        // Rapid heading changes
        aircraft.heading = (aircraft.heading + (Math.random() - 0.5) * 60 + 360) % 360;
        
        // Speed changes
        if (aircraft.aircraftType === 'threat') {
          aircraft.speed = this.getAircraftSpeed('threat'); // Random threat speed
        } else {
          // Friendly aircraft at maximum speed
          const maxMach = 3.5 + Math.random() * 0.5; // 3.5-4.0 Mach
          aircraft.speed = Math.round(maxMach * 661.5);
        }
      }
    });
  }

  private reduceAircraftSpeeds() {
    // Reduce speeds for return to base
    this.aircraft.forEach((aircraft, id) => {
      if (aircraft.aircraftType === 'self' || aircraft.aircraftType === 'friendly') {
        // Reduce to cruise speed
        const cruiseMach = 1.8 + Math.random() * 0.4; // 1.8-2.2 Mach
        aircraft.speed = Math.round(cruiseMach * 661.5);
      }
    });
  }

  private removeThreatAircraft() {
    // Remove random threat aircraft
    const threatIds = Array.from(this.simulationSystem.activeThreats);
    if (threatIds.length > 0) {
      const randomThreat = threatIds[Math.floor(Math.random() * threatIds.length)];
      this.aircraft.delete(randomThreat);
      this.simulationSystem.activeThreats.delete(randomThreat);
      console.log(`✅ Removed threat aircraft: ${randomThreat}`);
      this.updateUI();
    }
  }

  private createSimulationUI() {
    // Create simulation status display
    const simUI = document.createElement('div');
    simUI.id = 'simulation-ui';
    simUI.style.cssText = `
      position: fixed;
      top: 50px;
      left: 10px;
      background: rgba(0, 0, 0, 0.9);
      color: #00ff00;
      font-family: monospace;
      font-size: 11px;
      padding: 8px 12px;
      border-radius: 4px;
      border: 1px solid #00ff00;
      z-index: 250;
      min-width: 200px;
    `;
    document.body.appendChild(simUI);
  }

  private updateSimulationUI(elapsed: number, progress: number) {
    const simUI = document.getElementById('simulation-ui');
    if (!simUI) return;
    
    const remaining = this.simulationSystem.duration - elapsed;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    const remainingMinutes = Math.floor(remaining / 60000);
    const remainingSeconds = Math.floor((remaining % 60000) / 1000);
    
    // Calculate next map jump countdown
    const timeSinceLastJump = elapsed - this.simulationSystem.lastMapJump;
    const nextJumpIn = this.simulationSystem.mapJumpInterval - timeSinceLastJump;
    const nextJumpSeconds = Math.max(0, Math.floor(nextJumpIn / 1000));
    
    const phaseColors = {
      'warmup': '#00ff00',
      'engagement': '#ff8800',
      'maneuver': '#ff4444',
      'resolution': '#4488ff'
    };
    
    // Calculate self aircraft distance
    const selfAircraft = this.aircraft.get(this.nodeId);
    const selfDistance = selfAircraft ? (selfAircraft.totalDistanceCovered || 0) : 0;
    
    simUI.innerHTML = `
      <div style="color: ${phaseColors[this.simulationSystem.phase]}; font-weight: bold;">
        🎯 ${this.simulationSystem.phase.toUpperCase()} PHASE
      </div>
      <div>Time: ${minutes}:${seconds.toString().padStart(2, '0')} / 2:30</div>
      <div>Remaining: ${remainingMinutes}:${remainingSeconds.toString().padStart(2, '0')}</div>
      <div>Progress: ${Math.round(progress * 100)}%</div>
      <div>Threats: ${this.simulationSystem.activeThreats.size}</div>
      <div>Engagements: ${this.simulationSystem.engagementCount}</div>
      <div style="color: #00ffff;">Next Map Jump: ${nextJumpSeconds}s</div>
      <hr style="border: 1px solid #333; margin: 5px 0;">
      <div style="color: #ffaa00; font-weight: bold;">
        📏 Distance: ${selfDistance.toFixed(1)} NM
      </div>
    `;
  }

  private checkRandomMapJump(elapsed: number) {
    // Check if it's time for a random map jump
    if (elapsed - this.simulationSystem.lastMapJump > this.simulationSystem.mapJumpInterval) {
      this.performRandomMapJump();
      this.simulationSystem.lastMapJump = elapsed;
      
      // Randomize next jump interval (15-30 seconds)
      this.simulationSystem.mapJumpInterval = 15000 + Math.random() * 15000;
    }
  }

  private performRandomMapJump() {
    if (!this.showMap) return;
    
    // Define precise land locations over actual countries (verified coordinates)
    const locations = [
      // USA - Major cities/states
      { name: 'Los Angeles, California', lat: 34.05, lng: -118.25 },
      { name: 'Dallas, Texas', lat: 32.78, lng: -96.80 },
      { name: 'Miami, Florida', lat: 25.76, lng: -80.19 },
      { name: 'Las Vegas, Nevada', lat: 36.17, lng: -115.14 },
      { name: 'New York', lat: 40.71, lng: -74.01 },
      
      // Europe
      { name: 'Madrid, Spain', lat: 40.42, lng: -3.70 },
      { name: 'Paris, France', lat: 48.86, lng: 2.35 },
      { name: 'Berlin, Germany', lat: 52.52, lng: 13.40 },
      { name: 'Rome, Italy', lat: 41.90, lng: 12.50 },
      { name: 'London, UK', lat: 51.51, lng: -0.13 },
      { name: 'Warsaw, Poland', lat: 52.23, lng: 21.01 },
      
      // Middle East
      { name: 'Istanbul, Turkey', lat: 41.01, lng: 28.98 },
      { name: 'Riyadh, Saudi Arabia', lat: 24.71, lng: 46.68 },
      { name: 'Dubai, UAE', lat: 25.20, lng: 55.27 },
      { name: 'Cairo, Egypt', lat: 30.04, lng: 31.24 },
      
      // Asia
      { name: 'Delhi, India', lat: 28.61, lng: 77.21 },
      { name: 'Beijing, China', lat: 39.90, lng: 116.41 },
      { name: 'Tokyo, Japan', lat: 35.68, lng: 139.65 },
      { name: 'Seoul, South Korea', lat: 37.57, lng: 126.98 },
      { name: 'Bangkok, Thailand', lat: 13.76, lng: 100.50 },
      
      // Oceania & South America
      { name: 'Sydney, Australia', lat: -33.87, lng: 151.21 },
      { name: 'Johannesburg, South Africa', lat: -26.20, lng: 28.05 },
      { name: 'Brasilia, Brazil', lat: -15.79, lng: -47.89 },
      { name: 'Buenos Aires, Argentina', lat: -34.60, lng: -58.38 },
      { name: 'Toronto, Canada', lat: 43.65, lng: -79.38 },
      { name: 'Moscow, Russia', lat: 55.76, lng: 37.62 }
    ];
    
    // Pick a random location
    const randomLocation = locations[Math.floor(Math.random() * locations.length)];
    
    // Move all aircraft to the new location
    this.aircraft.forEach((aircraft, id) => {
      // Add some random offset to keep aircraft spread out
      const offsetLat = (Math.random() - 0.5) * 0.1; // ±0.05 degrees
      const offsetLng = (Math.random() - 0.5) * 0.1;
      
      aircraft.lat = randomLocation.lat + offsetLat;
      aircraft.lng = randomLocation.lng + offsetLng;
      
      // Randomize heading and altitude for variety
      aircraft.heading = Math.floor(Math.random() * 360);
      aircraft.altitude = 20000 + Math.floor(Math.random() * 20000);
    });
    
    // Reset pan offset since we're jumping to a new location
    this.panOffset = { x: 0, y: 0 };
    
    // Force map rebuild at new location
    const visualizationArea = document.getElementById('visualization-area');
    if (visualizationArea) {
      const existingMap = visualizationArea.querySelector('#map-background') as HTMLElement;
      if (existingMap) {
        existingMap.remove();
      }
      this.createMapBackground(visualizationArea);
    }
    
    // Update UI to show new positions
    this.updateUI();
    
    // Update location display immediately after jump
    this.updateLocationDisplay();
    
    console.log(`🗺️ MAP JUMP: Relocated to ${randomLocation.name} (${randomLocation.lat.toFixed(2)}, ${randomLocation.lng.toFixed(2)})`);
    console.log(`🗺️ All aircraft repositioned to new theater of operations`);
  }

  private createLocationDisplay() {
    const locationDisplay = document.createElement('div');
    locationDisplay.id = 'location-display';
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
    
    // Update location immediately
    this.updateLocationDisplay();
  }

  private getLocationInfo(lat: number, lng: number): { country: string; state: string; place: string } {
    // Simple geographic region determination based on coordinates
    // This is a basic implementation - in production, you'd use a reverse geocoding API
    
    let country = 'Unknown';
    let state = 'Unknown';
    let place = 'Unknown';
    
    // Determine country/region based on lat/lng ranges
    if (lat >= 24 && lat <= 49 && lng >= -125 && lng <= -66) {
      country = 'United States';
      // Rough state determination
      if (lat >= 32 && lat <= 37 && lng >= -120 && lng <= -114) {
        state = 'California';
        place = 'Southern California';
      } else if (lat >= 30 && lat <= 37 && lng >= -107 && lng <= -93) {
        state = 'Texas';
        place = 'Texas Region';
      } else if (lat >= 36 && lat <= 42 && lng >= -80 && lng <= -74) {
        state = 'New York';
        place = 'NY Metro Area';
      } else {
        state = 'Continental US';
        place = 'Mainland';
      }
    } else if (lat >= 35 && lat <= 42 && lng >= -10 && lng <= 5) {
      country = 'Spain';
      state = 'Iberian Peninsula';
      place = 'Mediterranean Region';
    } else if (lat >= 41 && lat <= 51 && lng >= -5 && lng <= 2) {
      country = 'United Kingdom';
      state = 'Great Britain';
      place = 'British Isles';
    } else if (lat >= 35 && lat <= 45 && lng >= 10 && lng <= 20) {
      country = 'Italy';
      state = 'Mediterranean';
      place = 'Italian Peninsula';
    } else if (lat >= 20 && lat <= 35 && lng >= 25 && lng <= 45) {
      country = 'Middle East';
      state = 'Arabian Peninsula';
      place = 'Gulf Region';
    } else if (lat >= 5 && lat <= 25 && lng >= 100 && lng <= 120) {
      country = 'Southeast Asia';
      state = 'South China Sea';
      place = 'Maritime Asia';
    } else if (lat >= -40 && lat <= -10 && lng >= 110 && lng <= 155) {
      country = 'Australia';
      state = 'Australian Continent';
      place = 'Down Under';
    } else if (lat >= 60 && lat <= 80) {
      country = 'Arctic Region';
      state = 'Far North';
      place = 'Polar Area';
    } else if (lat >= -60 && lat <= -40) {
      country = 'Southern Ocean';
      state = 'Antarctic Waters';
      place = 'Far South';
    } else if (Math.abs(lat) < 10) {
      country = 'Equatorial Region';
      state = 'Tropics';
      place = 'Equator Area';
    } else if (lng >= -180 && lng <= -30 && lat >= -30 && lat <= 30) {
      country = 'Atlantic Ocean';
      state = 'Mid-Atlantic';
      place = 'Open Ocean';
    } else if (lng >= 30 && lng <= 180 && lat >= -30 && lat <= 30) {
      country = 'Pacific Ocean';
      state = 'Mid-Pacific';
      place = 'Open Ocean';
    } else {
      country = 'International Waters';
      state = 'Open Ocean';
      place = 'Remote Area';
    }
    
    return { country, state, place };
  }

  private updateLocationDisplay() {
    const locationDisplay = document.getElementById('location-display');
    if (!locationDisplay) return;
    
    // Get self aircraft position
    const selfAircraft = this.aircraft.get(this.nodeId);
    if (!selfAircraft) {
      locationDisplay.innerHTML = `
        <div style="color: #ff8800; font-weight: bold;">📍 LOCATION</div>
        <div>No aircraft data</div>
      `;
      return;
    }
    
    const location = this.getLocationInfo(selfAircraft.lat, selfAircraft.lng);
    
    locationDisplay.innerHTML = `
      <div style="color: #00ffff; font-weight: bold; margin-bottom: 5px;">📍 CURRENT LOCATION</div>
      <div><strong>Country:</strong> ${location.country}</div>
      <div><strong>State/Region:</strong> ${location.state}</div>
      <div><strong>Place:</strong> ${location.place}</div>
      <hr style="border: 1px solid #333; margin: 8px 0;">
      <div style="color: #aaa; font-size: 10px;">
        Position: ${selfAircraft.lat.toFixed(4)}°, ${selfAircraft.lng.toFixed(4)}°
      </div>
    `;
  }

  private endSimulation() {
    this.simulationSystem.isRunning = false;
    console.log('🎯 Simulation completed!');
    
    // Remove simulation UI
    const simUI = document.getElementById('simulation-ui');
    if (simUI) {
      simUI.remove();
    }
    
    // Remove location display
    const locationDisplay = document.getElementById('location-display');
    if (locationDisplay) {
      locationDisplay.remove();
    }
    
    // Announce completion
    console.log('📢 MISSION COMPLETE - All aircraft returning to base');
  }

  private updateContinuousMovement() {
    const now = Date.now();
    let anyAircraftMoved = false;
    
    this.aircraftInterpolation.forEach((interpolation, aircraftId) => {
      const aircraft = this.aircraft.get(aircraftId);
      if (!aircraft) return;

      const elapsed = now - interpolation.startTime;
      const progress = Math.min(elapsed / interpolation.duration, 1);
      
      // Use easing function for smooth movement
      const easedProgress = this.easeInOutCubic(progress);
      
      // Interpolate position
      const currentLat = interpolation.startLat + (interpolation.targetLat - interpolation.startLat) * easedProgress;
      const currentLng = interpolation.startLng + (interpolation.targetLng - interpolation.startLng) * easedProgress;
      
      // Interpolate heading
      const currentHeading = this.interpolateHeading(interpolation.startHeading, interpolation.targetHeading, easedProgress);
      
      // Calculate distance covered from last position
      if (aircraft.lastPosition) {
        const distanceMoved = this.calculateDistance(
          aircraft.lastPosition.lat, 
          aircraft.lastPosition.lng, 
          currentLat, 
          currentLng
        );
        aircraft.totalDistanceCovered = (aircraft.totalDistanceCovered || 0) + distanceMoved;
      }
      
      // Update aircraft position
      aircraft.lat = currentLat;
      aircraft.lng = currentLng;
      aircraft.heading = currentHeading;
      aircraft.lastPosition = { lat: currentLat, lng: currentLng };
      
      // Update visual position
      this.updateAircraftVisualPosition(aircraftId);
      
      anyAircraftMoved = true;
      
      // Apply current pan offset to maintain position during dragging
      const visualizationArea = document.getElementById('visualization-area');
      if (visualizationArea) {
        this.applyPanOffset(visualizationArea);
      }
      
      // Auto-adjust view to show all aircraft
      this.adjustViewForAllAircraft();
      
      // Map updates are handled by periodic smooth updates
      
      // Remove completed interpolations
      if (progress >= 1) {
        this.aircraftInterpolation.delete(aircraftId);
      }
    });
    
    // Update connection lines and distances periodically (every 100ms for smooth updates)
    if (anyAircraftMoved && (now - this.lastDistanceUpdate) > 100) {
      this.lastDistanceUpdate = now;
      const visualizationArea = document.getElementById('visualization-area');
      if (visualizationArea) {
        let centerAircraft: Aircraft | null = null;
        if (this.centerMode === 'mother') {
          centerAircraft = this.motherAircraft || this.aircraft.get(this.nodeId);
        } else {
          centerAircraft = this.aircraft.get(this.nodeId) || this.motherAircraft;
        }
        
        if (centerAircraft) {
          this.drawConnectionLines(visualizationArea, centerAircraft);
        }
      }
    }
  }

  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  private interpolateHeading(startHeading: number, targetHeading: number, progress: number): number {
    // Handle the 360-degree wraparound
    let diff = targetHeading - startHeading;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    
    let result = startHeading + diff * progress;
    if (result < 0) result += 360;
    if (result >= 360) result -= 360;
    
    return result;
  }

  private isCenterAircraft(aircraftId: string): boolean {
    let centerAircraft: Aircraft | null = null;
    if (this.centerMode === 'mother') {
      centerAircraft = this.motherAircraft || this.aircraft.get(this.nodeId);
    } else {
      centerAircraft = this.aircraft.get(this.nodeId) || this.motherAircraft;
    }
    return centerAircraft ? centerAircraft.id === aircraftId : false;
  }

  private updateMapPositionImmediately() {
    const visualizationArea = document.getElementById('visualization-area');
    if (visualizationArea) {
      this.updateMapPositionSmooth(visualizationArea);
    }
  }

  private updateMapPositionSmooth(visualizationArea: HTMLElement) {
    // Smooth map updates without recreating tiles - just translate the entire map
    let centerAircraft: Aircraft | null = null;
    if (this.centerMode === 'mother') {
      centerAircraft = this.motherAircraft || this.aircraft.get(this.nodeId);
    } else {
      centerAircraft = this.aircraft.get(this.nodeId) || this.motherAircraft;
    }
    if (!centerAircraft) return;

    const existingMap = visualizationArea.querySelector('#map-background') as HTMLElement;
    
    if (!existingMap) {
      // Create map for the first time if it doesn't exist
      this.createMapBackground(visualizationArea);
      return;
    }

    // Get stored center position (the original center when map was created)
    const storedLat = parseFloat(existingMap.getAttribute('data-center-lat') || centerAircraft.lat.toString());
    const storedLng = parseFloat(existingMap.getAttribute('data-center-lng') || centerAircraft.lng.toString());
    
    // If no stored position, set it now
    if (!existingMap.getAttribute('data-center-lat')) {
      existingMap.setAttribute('data-center-lat', centerAircraft.lat.toString());
      existingMap.setAttribute('data-center-lng', centerAircraft.lng.toString());
      return;
    }
    
    // Calculate how much the center aircraft has moved in degrees
    const latDiff = centerAircraft.lat - storedLat;
    const lngDiff = centerAircraft.lng - storedLng;
    
    // Convert degree movement to pixel movement (Web Mercator projection)
    const zoom = Math.max(1, Math.min(18, 6 - Math.log2(this.zoomLevel)));
    const scale = Math.pow(2, zoom);
    const tileSize = 256;
    
    // Calculate pixel offset for smooth panning
    // Web Mercator: pixels per degree varies with latitude
    const pixelsPerDegreeLat = (scale * tileSize) / 360;
    const centerLatRad = (centerAircraft.lat * Math.PI) / 180;
    const pixelsPerDegreeLng = (scale * tileSize * Math.cos(centerLatRad)) / 360;
    
    // Calculate pixel offsets (inverted because we move map opposite to aircraft movement)
    const pixelOffsetX = -lngDiff * pixelsPerDegreeLng;
    const pixelOffsetY = latDiff * pixelsPerDegreeLat; // Positive because screen Y is inverted
    
    // Log significant movements for debugging
    if (Math.abs(pixelOffsetX) > 1 || Math.abs(pixelOffsetY) > 1) {
      console.log(`🗺️ Map tracking: Aircraft at ${centerAircraft.lat.toFixed(6)}, ${centerAircraft.lng.toFixed(6)} | Offset: ${pixelOffsetX.toFixed(1)}px, ${pixelOffsetY.toFixed(1)}px`);
    }
    
    // Apply smooth CSS transform to shift the map
    existingMap.style.transition = 'transform 0.05s linear';
    existingMap.style.transform = `translate(${pixelOffsetX}px, ${pixelOffsetY}px)`;
    
    // Rebuild map if aircraft moved significantly (threshold ~500 meters)
    const distanceMoved = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
    const rebuildThreshold = 0.005; // ~500 meters = 0.005 degrees
    
    if (distanceMoved > rebuildThreshold) {
      console.log(`🗺️ Aircraft moved ${(distanceMoved * 111000).toFixed(0)}m, rebuilding map at new center`);
      // Reset transform and rebuild map at new center
      existingMap.style.transition = 'none';
      existingMap.style.transform = 'translate(0, 0)';
      existingMap.remove();
      this.createMapBackground(visualizationArea);
    }
  }

  // Removed artificial continuous movement - aircraft now move naturally based on real position updates

  private updateMapTilesOnly(visualizationArea: HTMLElement, centerAircraft: Aircraft) {
    // For small movements, just update the tile positions without recreating the entire map
    const existingMap = visualizationArea.querySelector('#map-background') as HTMLElement;
    if (!existingMap) return;

    // Calculate new tile positions based on current aircraft position
    const zoomLevel = Math.max(1, Math.min(8, 6 - Math.log2(this.zoomLevel)));
    const lat = centerAircraft.lat;
    const lng = centerAircraft.lng;
    
    // Update tile positions smoothly
    const tiles = existingMap.querySelectorAll('div');
    tiles.forEach(tile => {
      if (tile.style.backgroundImage) {
        // Calculate new position for this tile
        const tileX = parseFloat(tile.style.left) || 0;
        const tileY = parseFloat(tile.style.top) || 0;
        
        // Apply position adjustments based on aircraft movement (larger multiplier for more responsive updates)
        const adjustmentX = (lng - parseFloat(existingMap.getAttribute('data-center-lng') || '0')) * 2000000;
        const adjustmentY = (lat - parseFloat(existingMap.getAttribute('data-center-lat') || '0')) * 2000000;
        
        tile.style.left = `${tileX + adjustmentX}px`;
        tile.style.top = `${tileY - adjustmentY}px`;
      }
    });
    
    // Update stored center position
    existingMap.setAttribute('data-center-lat', lat.toString());
    existingMap.setAttribute('data-center-lng', lng.toString());
  }

  private updateUI() {
    const container = document.getElementById('nodes-container');
    if (!container) return;

    // Reset pan offset when UI is updated
    this.panOffset = { x: 0, y: 0 };

    container.innerHTML = '';
    
    // Use center mode to determine which aircraft to center on
    let centerAircraft: Aircraft | null = null;
    if (this.centerMode === 'mother') {
      centerAircraft = this.motherAircraft || this.aircraft.get(this.nodeId);
    } else {
      centerAircraft = this.aircraft.get(this.nodeId) || this.motherAircraft;
    }
    
    if (!centerAircraft) return;
    
    console.log(`🎯 Center mode: ${this.centerMode.toUpperCase()}`);
    console.log(`🎯 Center aircraft selected: ${centerAircraft.callSign} (${centerAircraft.aircraftType})`);
    console.log(`🎯 Mother aircraft available: ${this.motherAircraft ? this.motherAircraft.callSign : 'None'}`);

    // Create right sidebar
    this.createRightSidebar(container);

    // Create the main visualization area
    const visualizationArea = document.createElement('div');
    visualizationArea.id = 'visualization-area';
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
      cursor: grab;
      user-select: none;
    `;

    container.appendChild(visualizationArea);

    // Add drag functionality to visualization area
    this.addDragFunctionality(visualizationArea);

    // Create SVG overlay for connection lines
    const svgOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgOverlay.id = 'connection-lines-svg';
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

    // Create map background if enabled
    console.log(`🗺️ Map check: showMap=${this.showMap}`);
    if (this.showMap) {
      console.log(`🗺️ Creating map background...`);
      this.createMapBackground(visualizationArea);
    } else {
      console.log(`🗺️ Map disabled, skipping background creation`);
    }
    
    // Map updates are handled automatically by periodic smooth updates

    // Create 2D graph with grid lines and circles
    this.create2DGraph(visualizationArea);

    // Always create center aircraft element at screen center (same positioning as radar circles)
    const centerElement = this.createAircraftElement(centerAircraft, true);
    
    // Get the aircraft size to calculate proper centering margins - fixed size
    const aircraftSize = 20; // Fixed 20px size for center aircraft
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
    
    centerElement.setAttribute('data-aircraft-id', centerAircraft.id);
    visualizationArea.appendChild(centerElement);
    
    console.log(`🎯 Center aircraft positioned: ${centerAircraft.callSign} (${centerAircraft.aircraftType}) at screen center`);
    console.log(`🎯 Aircraft size: ${aircraftSize}px, half-size: ${halfSize}px`);
    console.log(`🎯 Positioning: top: 50%, left: 50%, margin-top: -${halfSize}px, margin-left: -${halfSize}px`);

    // Position other aircraft relative to center aircraft
    console.log(`🎨 Rendering ${this.aircraft.size} aircraft (center: ${centerAircraft.callSign})`);
    this.aircraft.forEach((aircraft, id) => {
      console.log(`🎨 Processing aircraft: ${aircraft.callSign} (${aircraft.aircraftType})`);
      if (id === centerAircraft.id) {
        console.log(`🎨 Skipping center aircraft: ${aircraft.callSign}`);
        return; // Skip center aircraft
      }
      
      // Always show all aircraft with fixed small icons
      console.log(`🎨 Rendering aircraft: ${aircraft.callSign} (${aircraft.aircraftType}) with fixed 20px icon`);

      const aircraftElement = this.createAircraftElement(aircraft, false);
      
      // Calculate relative position: other_aircraft - center_aircraft
      const relativeLat = aircraft.lat - centerAircraft.lat;
      const relativeLng = aircraft.lng - centerAircraft.lng;
      
      // Convert lat/lng degrees to Cartesian coordinates for 2D graph
      const cartesianCoords = this.convertToCartesian(relativeLat, relativeLng);
      const x = cartesianCoords.x + 50; // 50% is center (origin)
      const y = cartesianCoords.y + 50; // 50% is center (origin)
      
      console.log(`🎨 Aircraft ${aircraft.callSign} position: x=${x.toFixed(1)}%, y=${y.toFixed(1)}%`);
      
      // Set position without overriding the base styles
      aircraftElement.style.position = 'absolute';
      aircraftElement.style.top = `${y}%`;
      aircraftElement.style.left = `${x}%`;
      aircraftElement.style.transform = 'translate(-50%, -50%)';
      
      console.log(`🎨 Aircraft element styles:`, aircraftElement.style.cssText);
      console.log(`🎨 Aircraft element children:`, aircraftElement.children);
      
      // Add data attribute for updates
      aircraftElement.setAttribute('data-aircraft-id', id);
      
      // Apply aircraft-specific styling
      this.updateAircraftThreatStatus(aircraftElement, aircraft);
      
      visualizationArea.appendChild(aircraftElement);
    });

    // Draw connection lines to all aircraft
      this.drawConnectionLines(visualizationArea, centerAircraft);

    // Add bottom bar with range filter buttons
    this.createBottomBar(container);
    
    // Add debug info
    this.addDebugInfo(container);

    // Check for warnings
    this.checkWarnings();
    
    // Create and update threat dialog
    if (this.showThreatDialog) {
      this.createThreatDialog();
      this.updateThreatDialog();
    }
  }

  private addDebugInfo(container: HTMLElement) {
    const debugInfo = document.createElement('div');
    debugInfo.id = 'debug-info';
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
    const motherCount = Array.from(this.aircraft.values()).filter(a => a.aircraftType === 'mother').length;
    const friendlyCount = Array.from(this.aircraft.values()).filter(a => a.aircraftType === 'friendly').length;
    
    const centerRef = this.motherAircraft ? `Mother: ${this.motherAircraft.callSign}` : 'Self';
    
    if (selfAircraft) {
      debugInfo.textContent = `Aircraft: ${this.aircraft.size} | Mother: ${motherCount} | Friendly: ${friendlyCount} | Threats: ${threatCount} | Center: ${centerRef} | Self: ${selfAircraft.callSign}`;
    } else {
      debugInfo.textContent = `Aircraft: ${this.aircraft.size} | Mother: ${motherCount} | Friendly: ${friendlyCount} | Threats: ${threatCount} | Center: ${centerRef}`;
    }
    
    container.appendChild(debugInfo);
    
    // Add message codes display
    this.addMessageCodesDisplay(container);
  }

  private addMessageCodesDisplay(container: HTMLElement) {
    const messageCodesDisplay = document.createElement('div');
    messageCodesDisplay.id = 'message-codes-display';
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
    
    // Start displaying random message codes
    this.startMessageCodesDisplay();
  }

  private startMessageCodesDisplay() {
    // Clear any existing interval
    if (this.messageCodesInterval) {
      clearInterval(this.messageCodesInterval);
    }

    // Update message codes every 1-3 seconds randomly
    const updateMessageCodes = () => {
      const messageDisplay = document.getElementById('message-codes-display');
      if (messageDisplay) {
        // Pick 1-3 random message codes
        const numCodes = Math.floor(Math.random() * 3) + 1;
        const selectedCodes: number[] = [];
        
        for (let i = 0; i < numCodes; i++) {
          const randomIndex = Math.floor(Math.random() * this.messageCodes.length);
          const code = this.messageCodes[randomIndex];
          if (!selectedCodes.includes(code)) {
            selectedCodes.push(code);
          }
        }
        
        messageDisplay.textContent = `MSG: ${selectedCodes.join(', ')}`;
        
        // Schedule next update with random interval
        const nextInterval = 1000 + Math.random() * 2000; // 1-3 seconds
        this.messageCodesInterval = setTimeout(updateMessageCodes, nextInterval);
      }
    };
    
    // Start immediately
    updateMessageCodes();
  }

  private createRightSidebar(container: HTMLElement) {
    const sidebar = document.createElement('div');
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

    // Zoom out button
    const zoomOutButton = document.createElement('button');
    zoomOutButton.textContent = '−';
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

    zoomOutButton.addEventListener('click', () => {
      console.log('Zoom out button clicked');
      this.zoomOut();
    });

    zoomOutButton.addEventListener('mouseenter', () => {
      zoomOutButton.style.background = '#555';
    });

    zoomOutButton.addEventListener('mouseleave', () => {
      zoomOutButton.style.background = '#333';
    });

    // Zoom level display
    const zoomDisplay = document.createElement('div');
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

    // Zoom in button
    const zoomInButton = document.createElement('button');
    zoomInButton.textContent = '+';
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

    zoomInButton.addEventListener('click', () => {
      console.log('Zoom in button clicked');
      this.zoomIn();
    });

    zoomInButton.addEventListener('mouseenter', () => {
      zoomInButton.style.background = '#555';
    });

    zoomInButton.addEventListener('mouseleave', () => {
      zoomInButton.style.background = '#333';
    });

    // Fullscreen button
    const fullscreenButton = document.createElement('button');
    fullscreenButton.textContent = '⛶';
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

    fullscreenButton.addEventListener('click', () => {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        document.documentElement.requestFullscreen();
      }
    });

    fullscreenButton.addEventListener('mouseenter', () => {
      fullscreenButton.style.background = '#555';
    });

    fullscreenButton.addEventListener('mouseleave', () => {
      fullscreenButton.style.background = '#333';
    });

    // Toggle other nodes button
    const toggleNodesButton = document.createElement('button');
    toggleNodesButton.textContent = this.showOtherNodes ? 'HIDE' : 'SHOW';
    toggleNodesButton.style.cssText = `
      width: 40px;
      height: 30px;
      background: ${this.showOtherNodes ? '#ff4444' : '#44ff44'};
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

    toggleNodesButton.addEventListener('click', () => {
      this.toggleOtherNodesVisibility();
    });

    toggleNodesButton.addEventListener('mouseenter', () => {
      toggleNodesButton.style.opacity = '0.8';
    });

    toggleNodesButton.addEventListener('mouseleave', () => {
      toggleNodesButton.style.opacity = '1';
    });

    // Toggle map button
    const toggleMapButton = document.createElement('button');
    toggleMapButton.textContent = 'MAP';
    toggleMapButton.style.cssText = `
      width: 40px;
      height: 30px;
      background: ${this.showMap ? '#4488ff' : '#333'};
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

    toggleMapButton.addEventListener('click', () => {
      this.toggleMapVisibility();
    });

    toggleMapButton.addEventListener('mouseenter', () => {
      toggleMapButton.style.opacity = '0.8';
    });

    toggleMapButton.addEventListener('mouseleave', () => {
      toggleMapButton.style.opacity = '1';
    });

    // Center mode toggle button
    const centerModeButton = document.createElement('button');
    centerModeButton.textContent = this.centerMode === 'mother' ? 'MTR' : 'SELF';
    centerModeButton.style.cssText = `
      width: 40px;
      height: 30px;
      background: ${this.centerMode === 'mother' ? '#4488ff' : '#ff8844'};
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

    centerModeButton.addEventListener('click', () => {
      this.toggleCenterMode();
    });

    centerModeButton.addEventListener('mouseenter', () => {
      centerModeButton.style.opacity = '0.8';
    });

    centerModeButton.addEventListener('mouseleave', () => {
      centerModeButton.style.opacity = '1';
    });

    // Threat dialog toggle button
    const threatDialogButton = document.createElement('button');
    threatDialogButton.textContent = 'THRT';
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

    threatDialogButton.addEventListener('click', () => {
      this.toggleThreatDialog();
    });

    threatDialogButton.addEventListener('mouseenter', () => {
      threatDialogButton.style.opacity = '0.8';
    });

    threatDialogButton.addEventListener('mouseleave', () => {
      threatDialogButton.style.opacity = '1';
    });

    // Store reference for updates
    this.zoomDisplay = zoomDisplay;

    console.log('Creating zoom controls:', {
      zoomOutButton: zoomOutButton,
      zoomInButton: zoomInButton,
      zoomDisplay: zoomDisplay,
      currentZoom: this.zoomLevel
    });

    sidebar.appendChild(zoomOutButton);
    sidebar.appendChild(zoomDisplay);
    sidebar.appendChild(zoomInButton);
    sidebar.appendChild(fullscreenButton);
    sidebar.appendChild(toggleNodesButton);
    sidebar.appendChild(toggleMapButton);
    sidebar.appendChild(centerModeButton);
    sidebar.appendChild(threatDialogButton);

    container.appendChild(sidebar);
    
    console.log('Zoom controls added to sidebar');
  }

  // Removed static range selection - now using adaptive ranges based on aircraft positions

  private createBottomBar(container: HTMLElement) {
    const bottomBar = document.createElement('div');
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

    // Adaptive range info display
    const rangeInfo = document.createElement('div');
    rangeInfo.id = 'adaptive-range-info';
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
    rangeInfo.textContent = 'ADAPTIVE RADAR RANGE';

    bottomBar.appendChild(rangeInfo);
    container.appendChild(bottomBar);
  }

  private zoomIn() {
    console.log('Zoom In (+) clicked - Making nodes smaller, current level:', this.zoomLevel);
    if (this.zoomLevel < 1.5) { // Max zoom 1.5x to prevent extremely small icons
      this.zoomLevel += 0.2; // Smaller increments for smoother changes
      console.log('New zoom level (higher = smaller nodes):', this.zoomLevel);
      this.updateZoomDisplay();
      
      // Rebuild map with new zoom level relative to aircraft zoom
      if (this.showMap) {
        const visualizationArea = document.getElementById('visualization-area');
        if (visualizationArea) {
          const existingMap = visualizationArea.querySelector('#map-background') as HTMLElement;
          if (existingMap) {
            const mapZoomLevel = Math.max(1, Math.min(18, 6 + Math.log2(this.zoomLevel)));
            console.log(`🗺️ Zoom In: Updating map zoom to level ${mapZoomLevel.toFixed(1)} (aircraft zoom: ${this.zoomLevel})`);
            existingMap.remove();
          }
          this.createMapBackground(visualizationArea);
        }
      }
      
      this.updateUI();
    } else {
      console.log('Max zoom reached - nodes at smallest size');
    }
  }

  private zoomOut() {
    console.log('Zoom Out (-) clicked - Making nodes larger, current level:', this.zoomLevel);
    if (this.zoomLevel > 0.3) { // Min zoom 0.3x to prevent extremely large icons
      this.zoomLevel -= 0.2; // Smaller increments for smoother changes
      console.log('New zoom level (lower = larger nodes):', this.zoomLevel);
      this.updateZoomDisplay();
      
      // Rebuild map with new zoom level relative to aircraft zoom
      if (this.showMap) {
        const visualizationArea = document.getElementById('visualization-area');
        if (visualizationArea) {
          const existingMap = visualizationArea.querySelector('#map-background') as HTMLElement;
          if (existingMap) {
            const mapZoomLevel = Math.max(1, Math.min(18, 6 - Math.log2(this.zoomLevel)));
            console.log(`🗺️ Zoom Out: Updating map zoom to level ${mapZoomLevel.toFixed(1)} (aircraft zoom: ${this.zoomLevel})`);
            existingMap.remove();
          }
          this.createMapBackground(visualizationArea);
        }
      }
      
      this.updateUI();
    } else {
      console.log('Min zoom reached - nodes at largest size');
    }
  }

  private updateZoomDisplay() {
    console.log('Updating zoom display to:', this.zoomLevel);
    if (this.zoomDisplay) {
      this.zoomDisplay.textContent = `${Math.round(this.zoomLevel * 100)}%`;
      console.log('Zoom display updated to:', this.zoomDisplay.textContent);
    } else {
      console.log('Zoom display element not found');
    }
  }

  private toggleOtherNodesVisibility() {
    this.showOtherNodes = !this.showOtherNodes;
    console.log(`Other nodes visibility: ${this.showOtherNodes ? 'SHOW' : 'HIDE'}`);
    
    // Update all toggle buttons (find by text content)
    const buttons = document.querySelectorAll('button');
    buttons.forEach(button => {
      if (button.textContent === 'HIDE' || button.textContent === 'SHOW') {
        button.textContent = this.showOtherNodes ? 'HIDE' : 'SHOW';
        button.style.background = this.showOtherNodes ? '#ff4444' : '#44ff44';
      }
    });
    
    // Update the UI to show/hide nodes
    this.updateUI();
  }

  private throttledWarningCheck() {
    const now = Date.now();
    // Only check warnings every 2 seconds to avoid excessive UI updates
    if (now - this.warningSystem.lastWarningCheck > 2000) {
      this.warningSystem.lastWarningCheck = now;
      this.checkWarnings();
    }
  }

  private checkWarnings() {
    const selfAircraft = this.aircraft.get(this.nodeId);
    if (!selfAircraft) return;

    // Clear previous warnings
    this.warningSystem.activeWarnings.clear();

    // Check for nearby threats
    this.checkThreatProximity(selfAircraft);

    // Check distance from mother aircraft
    this.checkMotherDistance(selfAircraft);

    // Update warning display
    this.updateWarningDisplay();
  }

  private checkThreatProximity(selfAircraft: Aircraft) {
    this.aircraft.forEach((aircraft, id) => {
      if (id === this.nodeId || aircraft.aircraftType !== 'threat') return;

      const distance = this.calculateDistanceBetweenAircraft(selfAircraft, aircraft);
      
      if (distance <= this.warningSystem.threatProximityThreshold * 54) { // Convert threshold to NM
        const warningId = `THREAT_PROXIMITY_${id}`;
        this.warningSystem.activeWarnings.add(warningId);
        console.log(`⚠️ THREAT WARNING: ${aircraft.callSign} at ${(distance * 54).toFixed(1)}NM`);
      }
    });
  }

  private checkMotherDistance(selfAircraft: Aircraft) {
    if (!this.motherAircraft) return;

    const distance = this.calculateDistanceBetweenAircraft(selfAircraft, this.motherAircraft);
    
    if (distance >= this.warningSystem.motherDistanceThreshold * 54) { // Convert threshold to NM
      const warningId = `MOTHER_DISTANCE`;
      this.warningSystem.activeWarnings.add(warningId);
      console.log(`⚠️ SEPARATION WARNING: Distance from ${this.motherAircraft.callSign}: ${(distance * 54).toFixed(1)}NM`);
    }
  }

  private calculateDistanceBetweenAircraft(aircraft1: Aircraft, aircraft2: Aircraft): number {
    // Use the Haversine formula for accurate distance calculation
    return this.calculateDistance(aircraft1.lat, aircraft1.lng, aircraft2.lat, aircraft2.lng);
  }

  private updateWarningDisplay() {
    // Remove any existing warning dialog
    const existingWarning = document.getElementById('warning-display');
    if (existingWarning) {
      existingWarning.remove();
    }

    // Warning dialogs disabled - warnings only logged to console
    if (this.warningSystem.activeWarnings.size > 0) {
      console.log(`⚠️ Active warnings: ${Array.from(this.warningSystem.activeWarnings).join(', ')}`);
    }
  }

  // Warning sound disabled along with warning dialogs

  private toggleMapVisibility() {
    this.showMap = !this.showMap;
    console.log(`🗺️ Map visibility toggled: ${this.showMap ? 'ENABLED' : 'DISABLED'}`);
    console.log(`🗺️ Mother aircraft available: ${this.motherAircraft ? 'YES' : 'NO'}`);
    if (this.motherAircraft) {
      console.log(`🗺️ Mother aircraft position: ${this.motherAircraft.lat}, ${this.motherAircraft.lng}`);
    }
    
    // Update map button appearance
    const mapButtons = document.querySelectorAll('button');
    mapButtons.forEach(button => {
      if (button.textContent === 'MAP') {
        button.style.background = this.showMap ? '#4488ff' : '#333';
        console.log(`🗺️ Updated button color to: ${this.showMap ? 'blue' : 'gray'}`);
      }
    });
    
    // Update the UI to show/hide map
    console.log(`🗺️ Calling updateUI() to ${this.showMap ? 'show' : 'hide'} map`);
    this.updateUI();
  }

  private toggleCenterMode() {
    this.centerMode = this.centerMode === 'mother' ? 'self' : 'mother';
    console.log(`🎯 Center mode toggled to: ${this.centerMode.toUpperCase()}`);
    
    const selfAircraft = this.aircraft.get(this.nodeId);
    if (this.centerMode === 'self' && !selfAircraft) {
      console.warn('⚠️ Cannot switch to self-centered mode: self aircraft not found');
      this.centerMode = 'mother'; // Fallback to mother mode
      return;
    }
    
    if (this.centerMode === 'mother' && !this.motherAircraft) {
      console.warn('⚠️ Cannot switch to mother-centered mode: mother aircraft not found');
      this.centerMode = 'self'; // Fallback to self mode
      return;
    }
    
    // Update center mode button appearance
    const centerButtons = document.querySelectorAll('button');
    centerButtons.forEach(button => {
      if (button.textContent === 'MTR' || button.textContent === 'SELF') {
        button.textContent = this.centerMode === 'mother' ? 'MTR' : 'SELF';
        button.style.background = this.centerMode === 'mother' ? '#4488ff' : '#ff8844';
        console.log(`🎯 Updated center button to: ${button.textContent} (${this.centerMode === 'mother' ? 'blue' : 'orange'})`);
      }
    });
    
    // Update the UI to re-center on new reference
    console.log(`🎯 Re-centering display on ${this.centerMode} aircraft`);
    this.updateUI();
    
    // Force map rebuild when center mode changes
    if (this.showMap) {
      const visualizationArea = document.getElementById('visualization-area');
      if (visualizationArea) {
        const existingMap = visualizationArea.querySelector('#map-background') as HTMLElement;
        if (existingMap) {
          existingMap.remove();
        }
        this.createMapBackground(visualizationArea);
      }
    }
  }

  private createAircraftElement(aircraft: Aircraft, isCenter: boolean) {
    const aircraftElement = document.createElement('div');
    aircraftElement.className = 'aircraft-marker'; // Add class for easier styling
    
    // Fixed small size for all aircraft icons - no zoom scaling
    const fixedSize = 20; // Fixed 20px size for all aircraft icons
    const glowSize = fixedSize + 6;
    
    // Base styling for all aircraft - ensure visibility
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
    
    // Create aircraft icon using actual icon files
    console.log(`🎨 Creating aircraft icon for ${aircraft.callSign} (${aircraft.aircraftType}) with size ${fixedSize}px`);
    this.createAircraftIcon(aircraftElement, aircraft.aircraftType, fixedSize);
    
    // Store glow info to apply to SVG later
    const glowInfo = {
      aircraftType: aircraft.aircraftType,
      glowSize: glowSize
    };
    aircraftElement.setAttribute('data-glow-info', JSON.stringify(glowInfo));
    
    // Add call sign label below the icon
    const callSignLabel = document.createElement('div');
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
    `;
    callSignLabel.textContent = aircraft.callSign;
    aircraftElement.appendChild(callSignLabel);
    
    // Add click handler to show aircraft details
    aircraftElement.addEventListener('click', () => {
      this.showAircraftDetails(aircraft);
    });
    
    // SVG icon is created directly, no need for image loading
    
    return aircraftElement;
  }

  private createAircraftIcon(container: HTMLElement, aircraftType: AircraftType, size: number) {
    // Always create a fallback icon first as the primary icon
    // This ensures aircraft are always visible regardless of SVG loading issues
    this.createFallbackIcon(container, aircraftType, size);
    
    // Then try to load the SVG icon on top if available
    let iconFile = '';
    switch (aircraftType) {
      case 'mother':
        iconFile = 'mother-aircraft.svg';
        break;
      case 'self':
        iconFile = 'friendly_aircraft.svg';
        break;
      case 'friendly':
        iconFile = 'friendly_aircraft.svg';
        break;
      case 'threat':
        iconFile = 'hostile_aircraft.svg';
        break;
      default:
        iconFile = 'unknown_aircraft.svg';
        break;
    }
    
    // Create image element for the SVG icon
    const iconElement = document.createElement('img');
    iconElement.src = `icons/${iconFile}`;
    iconElement.alt = `${aircraftType} aircraft`;
    
    // Apply glow effects and styling
    let glowFilter = '';
    if (aircraftType === 'mother') {
      glowFilter = `drop-shadow(0 0 6px #0080ff) drop-shadow(0 0 12px #0080ff)`;
    } else if (aircraftType === 'self') {
      glowFilter = `drop-shadow(0 0 6px #FFD700) drop-shadow(0 0 12px #FFA500)`;
    } else if (aircraftType === 'threat') {
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
    
    // Handle image loading - if successful, it will appear over the fallback
    iconElement.onload = () => {
      console.log(`✅ Loaded SVG aircraft icon: ${iconFile} for ${aircraftType}`);
    };
    
    iconElement.onerror = () => {
      console.warn(`⚠️ SVG icon not available: ${iconFile} for ${aircraftType}, using fallback`);
      // Remove the failed image element
      if (iconElement.parentNode) {
        iconElement.parentNode.removeChild(iconElement);
      }
    };
    
    // Add the SVG icon element (will be on top of fallback if it loads)
    container.appendChild(iconElement);
    
    console.log(`✅ Created aircraft icon system for ${aircraftType} with fallback + SVG (size ${size}px)`);
  }
  
  private createFallbackIcon(container: HTMLElement, aircraftType: AircraftType, size: number) {
    // Create a simple fallback icon if the image fails to load
    const fallbackElement = document.createElement('div');
    const color = this.getAircraftColor(aircraftType);

    fallbackElement.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      border: 2px solid white;
      border-radius: 50%;
      display: flex !important;
      align-items: center;
      justify-content: center;
      color: white;
      font-family: monospace;
      font-weight: bold;
      font-size: ${Math.max(10, size * 0.5)}px;
      pointer-events: none;
      z-index: 5;
      box-shadow: 0 0 10px ${color}, 0 0 20px ${color};
      text-shadow: 1px 1px 3px rgba(0, 0, 0, 1);
      visibility: visible !important;
      opacity: 1 !important;
    `;
    
    // Add letter/symbol based on aircraft type
    switch (aircraftType) {
      case 'mother':
        fallbackElement.textContent = 'M';
        break;
      case 'self':
        fallbackElement.textContent = '★'; // Star for self aircraft
        break;
      case 'friendly':
        fallbackElement.textContent = 'F';
        break;
      case 'threat':
        fallbackElement.textContent = '⚠'; // Warning symbol for threats
        break;
      default:
        fallbackElement.textContent = '?';
        break;
    }

    container.appendChild(fallbackElement);
    console.log(`✅ Created fallback icon for ${aircraftType}`);
  }

  private getAircraftColor(aircraftType: AircraftType): string {
    switch (aircraftType) {
      case 'mother':
        return '#0080ff';
      case 'self':
        return '#FFD700'; // Gold/yellow for self
      case 'friendly':
        return '#00ff00';
      case 'threat':
        return '#ff0000';
      default:
        return '#ffff00';
    }
  }

  private showAircraftDetails(aircraft: Aircraft) {
    const details = document.createElement('div');
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
    
    const typeColor = aircraft.aircraftType === 'threat' ? '#ff4444' : 
                     aircraft.aircraftType === 'mother' ? '#4488ff' : 
                     aircraft.aircraftType === 'self' ? '#FFD700' : '#44ff44';
    
    const totalDistance = aircraft.totalDistanceCovered || 0;
    const distanceMach = aircraft.speed / 661.5; // Convert speed to Mach
    
    details.innerHTML = `
      <h3 style="margin-top: 0; color: ${typeColor};">Aircraft Details</h3>
      <div><strong>Call Sign:</strong> ${aircraft.callSign}</div>
      <div><strong>Type:</strong> <span style="color: ${typeColor}">${aircraft.aircraftType.toUpperCase()}</span></div>
      <div><strong>Status:</strong> <span style="color: ${aircraft.status === 'connected' ? '#4CAF50' : '#F44336'}">${aircraft.status.toUpperCase()}</span></div>
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
  }

  private create2DGraph(visualizationArea: HTMLElement) {
    // Create grid lines for 2D graph visualization
    const gridContainer = document.createElement('div');
    gridContainer.id = 'graph-grid';
    gridContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 0;
    `;

    // Create vertical grid lines (longitude lines)
    for (let i = 0; i <= 10; i++) {
      const line = document.createElement('div');
      const position = (i * 10); // Every 10%
      line.style.cssText = `
        position: absolute;
        left: ${position}%;
        top: 0;
        width: 1px;
        height: 100%;
        background: ${position === 50 ? '#00ff00' : '#333333'};
        opacity: ${position === 50 ? '0.8' : '0.3'};
      `;
      gridContainer.appendChild(line);
    }

    // Create horizontal grid lines (latitude lines)
    for (let i = 0; i <= 10; i++) {
      const line = document.createElement('div');
      const position = (i * 10); // Every 10%
      line.style.cssText = `
        position: absolute;
        top: ${position}%;
        left: 0;
        width: 100%;
        height: 1px;
        background: ${position === 50 ? '#00ff00' : '#333333'};
        opacity: ${position === 50 ? '0.8' : '0.3'};
      `;
      gridContainer.appendChild(line);
    }

    visualizationArea.appendChild(gridContainer);

    // Create concentric circles for radar ranges based on farthest aircraft
    this.createAdaptiveRadarCircles(visualizationArea);

    // Coordinate labels removed - only showing grid lines
  }

  private createAdaptiveRadarCircles(visualizationArea: HTMLElement) {
    let centerAircraft: Aircraft | null = null;
    if (this.centerMode === 'mother') {
      centerAircraft = this.motherAircraft || this.aircraft.get(this.nodeId);
    } else {
      centerAircraft = this.aircraft.get(this.nodeId) || this.motherAircraft;
    }
    if (!centerAircraft) return;

    // Calculate the maximum distance to any aircraft
    let maxDistance = 0;
    this.aircraft.forEach((aircraft, id) => {
      if (id === centerAircraft.id) return; // Skip center aircraft

      const relativeLat = aircraft.lat - centerAircraft.lat;
      const relativeLng = aircraft.lng - centerAircraft.lng;
      const cartesianCoords = this.convertToCartesian(relativeLat, relativeLng);
      
      // Calculate distance from center in screen coordinates
      const distance = Math.sqrt(cartesianCoords.x * cartesianCoords.x + cartesianCoords.y * cartesianCoords.y);
      maxDistance = Math.max(maxDistance, Math.abs(distance));
    });

    console.log(`📡 Maximum aircraft distance: ${maxDistance.toFixed(2)} units`);

    // Auto-adjust zoom level to show all aircraft
    this.adjustZoomForAllAircraft(maxDistance);

    // Set minimum radar range and add buffer
    const minRadarRange = 20; // Minimum radar range
    const bufferFactor = 1.5; // 50% buffer beyond farthest aircraft for better visibility
    const adaptiveRange = Math.max(minRadarRange, maxDistance * bufferFactor);

    console.log(`📡 Adaptive radar range: ${adaptiveRange.toFixed(2)} units`);

    const viewportWidth = window.innerWidth - 60;
    const viewportHeight = window.innerHeight - 60;
    const minDimension = Math.min(viewportWidth, viewportHeight);
    
    // Create 3 concentric circles based on adaptive range
    const numCircles = 3;
    
    for (let i = 1; i <= numCircles; i++) {
      const circle = document.createElement('div');
      
      // Scale circles based on adaptive range
      const rangeRatio = adaptiveRange / 50; // Normalize to screen scale
      const baseRadius = i * (minDimension * 0.35 * rangeRatio / numCircles);
      const radius = baseRadius / this.zoomLevel;
      
      // Ensure minimum and maximum radius bounds
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
      
      // Add range labels
      const rangeLabel = document.createElement('div');
      const estimatedNM = Math.round((clampedRadius / minDimension) * 400); // Rough NM estimate
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
      `;
      
      visualizationArea.appendChild(circle);
      visualizationArea.appendChild(rangeLabel);
      
      console.log(`📡 Created radar circle ${i}: radius=${clampedRadius.toFixed(1)}px, range≈${estimatedNM}NM`);
    }

    // Update the range info display
    this.updateRangeInfo(adaptiveRange, maxDistance);
  }

  private adjustViewForAllAircraft() {
    // Throttle view adjustments to avoid excessive updates
    if (!this.viewAdjustmentThrottle) {
      this.viewAdjustmentThrottle = setTimeout(() => {
        this.performViewAdjustment();
        this.viewAdjustmentThrottle = null;
      }, 500); // Adjust view every 500ms
    }
  }

  private performViewAdjustment() {
    let centerAircraft: Aircraft | null = null;
    if (this.centerMode === 'mother') {
      centerAircraft = this.motherAircraft || this.aircraft.get(this.nodeId);
    } else {
      centerAircraft = this.aircraft.get(this.nodeId) || this.motherAircraft;
    }
    if (!centerAircraft) return;

    // Calculate the maximum distance to any aircraft
    let maxDistance = 0;
    this.aircraft.forEach((aircraft, id) => {
      if (id === centerAircraft.id) return; // Skip center aircraft

      const relativeLat = aircraft.lat - centerAircraft.lat;
      const relativeLng = aircraft.lng - centerAircraft.lng;
      const cartesianCoords = this.convertToCartesian(relativeLat, relativeLng);
      
      // Calculate distance from center in screen coordinates
      const distance = Math.sqrt(cartesianCoords.x * cartesianCoords.x + cartesianCoords.y * cartesianCoords.y);
      maxDistance = Math.max(maxDistance, Math.abs(distance));
    });

    // Auto-adjust zoom level to show all aircraft
    this.adjustZoomForAllAircraft(maxDistance);
  }

  private adjustZoomForAllAircraft(maxDistance: number) {
    // Don't adjust zoom if already transitioning
    if (this.isZoomTransitioning) {
      return;
    }
    
    // Calculate optimal zoom level to show all aircraft
    const viewportWidth = window.innerWidth - 60;
    const viewportHeight = window.innerHeight - 60;
    const minDimension = Math.min(viewportWidth, viewportHeight);
    
    // Calculate required zoom to fit all aircraft with buffer
    const requiredZoom = Math.max(0.3, Math.min(1.5, (minDimension * 0.3) / (maxDistance * 2)));
    
    // Only adjust zoom if it's significantly different and within reasonable bounds
    const zoomDifference = Math.abs(this.zoomLevel - requiredZoom);
    if (zoomDifference > 0.2) { // Increased threshold to prevent frequent changes
      console.log(`🔍 Auto-adjusting zoom from ${this.zoomLevel.toFixed(2)} to ${requiredZoom.toFixed(2)} to show all aircraft`);
      
      // Smooth transition to prevent sudden size changes
      this.smoothZoomTransition(requiredZoom);
    }
  }

  private smoothZoomTransition(targetZoom: number) {
    this.isZoomTransitioning = true;
    const startZoom = this.zoomLevel;
    const duration = 1000; // 1 second transition
    const startTime = Date.now();
    
    const animateZoom = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Use easing function for smooth transition
      const easedProgress = this.easeInOutCubic(progress);
      
      // Interpolate zoom level
      this.zoomLevel = startZoom + (targetZoom - startZoom) * easedProgress;
      this.updateZoomDisplay();
      
      if (progress < 1) {
        requestAnimationFrame(animateZoom);
      } else {
        this.isZoomTransitioning = false;
      }
    };
    
    requestAnimationFrame(animateZoom);
  }

  private updateRangeInfo(adaptiveRange: number, maxDistance: number) {
    const rangeInfo = document.getElementById('adaptive-range-info');
    if (rangeInfo) {
      const aircraftCount = this.aircraft.size - 1; // Exclude center aircraft
      const maxRangeNM = Math.round((adaptiveRange / 50) * 200); // Rough NM conversion
      rangeInfo.textContent = `AUTO-ZOOM: ${(this.zoomLevel * 100).toFixed(0)}% | ${aircraftCount} AIRCRAFT | MAX DIST: ${maxDistance.toFixed(1)}`;
    }
  }

  private updateMapPosition(visualizationArea: HTMLElement) {
    // Remove existing map and recreate it with new center position
    const existingMap = visualizationArea.querySelector('#map-background') as HTMLElement;
    if (existingMap) {
      existingMap.remove();
    }
    
    // Recreate map with current center aircraft position
    this.createMapBackground(visualizationArea);
  }

  private createMapBackground(visualizationArea: HTMLElement) {
    let centerAircraft: Aircraft | null = null;
    if (this.centerMode === 'mother') {
      centerAircraft = this.motherAircraft || this.aircraft.get(this.nodeId);
    } else {
      centerAircraft = this.aircraft.get(this.nodeId) || this.motherAircraft;
    }
    if (!centerAircraft) return;

    // Check if map already exists - don't recreate, let smooth updates handle it
    const existingMap = visualizationArea.querySelector('#map-background') as HTMLElement;
    if (existingMap) {
      // Map exists, smooth updates will handle positioning
        return;
    }

    const mapContainer = document.createElement('div');
    mapContainer.id = 'map-background';
    
    // Calculate zoom level based on radar range (approximate)
    const zoomLevel = Math.max(1, Math.min(8, 6 - Math.log2(this.zoomLevel)));
    
    // Store the EXACT center position for smooth tracking
    const lat = centerAircraft.lat;
    const lng = centerAircraft.lng;
    
    console.log(`🗺️ Creating map centered on: ${centerAircraft.callSign} at ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    console.log(`🗺️ Center mode: ${this.centerMode}, Aircraft type: ${centerAircraft.aircraftType}`);
    
    // Store map parameters for smooth updates
    mapContainer.setAttribute('data-center-lat', lat.toString());
    mapContainer.setAttribute('data-center-lng', lng.toString());
    mapContainer.setAttribute('data-zoom-level', zoomLevel.toString());
    mapContainer.setAttribute('data-center-mode', this.centerMode);
    
    mapContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 0;
      opacity: 0.8;
      background-color: #2a2a2a;
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    `;
    
    console.log('🗺️ Creating new map container with dimensions:', {
      width: visualizationArea.offsetWidth,
      height: visualizationArea.offsetHeight,
      lat: lat,
      lng: lng,
      zoom: zoomLevel
    });
    
    // Create a tile-based map using light tiles (use exact lat/lng)
    this.createBlueMarbleTileMap(mapContainer, lat, lng, Math.floor(zoomLevel));
    
    console.log(`🗺️ Created light map centered at ${lat}, ${lng} with zoom ${zoomLevel}`);
    
    visualizationArea.appendChild(mapContainer);
    this.mapElement = mapContainer;
  }

  private createBlueMarbleTileMap(container: HTMLElement, centerLat: number, centerLng: number, zoom: number) {
    console.log(`🗺️ Creating light map: lat=${centerLat}, lng=${centerLng}, zoom=${zoom}`);
    
    // Use light map tiles with labels (states, cities, districts)
    const lightTileSources = [
      // CartoDB Positron with labels - shows state names, cities, and districts
      `https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/${zoom}/{x}/{y}.png`,
      `https://cartodb-basemaps-b.global.ssl.fastly.net/light_all/${zoom}/{x}/{y}.png`,
      `https://cartodb-basemaps-c.global.ssl.fastly.net/light_all/${zoom}/{x}/{y}.png`,
      // OpenStreetMap with full labels as fallback
      `https://tile.openstreetmap.org/${zoom}/{x}/{y}.png`,
      // Stamen Toner with labels
      `https://stamen-tiles.a.ssl.fastly.net/toner/${zoom}/{x}/{y}.png`
    ];
    
    // Calculate tile coordinates for the center
    const tileSize = 256;
    const n = Math.pow(2, zoom);
    const centerTileX = Math.floor(n * ((centerLng + 180) / 360));
    const centerTileY = Math.floor(n * (1 - (Math.log(Math.tan((centerLat * Math.PI) / 180) + 1 / Math.cos((centerLat * Math.PI) / 180)) / Math.PI)) / 2);
    
    // Get container dimensions
    const containerWidth = container.offsetWidth || window.innerWidth - 60;
    const containerHeight = container.offsetHeight || window.innerHeight - 60;
    
    // Calculate tiles needed for FULL screen coverage
    const tilesX = Math.ceil(containerWidth / tileSize) + 4; // Extra tiles for full coverage
    const tilesY = Math.ceil(containerHeight / tileSize) + 4; // Extra tiles for full coverage
    const halfTilesX = Math.floor(tilesX / 2);
    const halfTilesY = Math.floor(tilesY / 2);
    
    console.log(`🗺️ Container dimensions: ${containerWidth}x${containerHeight}`);
    console.log(`🗺️ Tile size: ${tileSize}, Required tiles: ${Math.ceil(containerWidth / tileSize)}x${Math.ceil(containerHeight / tileSize)}`);
    console.log(`🗺️ Creating extended grid: ${tilesX}x${tilesY} for full coverage`);
    
    console.log(`🗺️ Creating ${tilesX}x${tilesY} light tile grid`);
    
    // Calculate pixel offset to center the map properly
    const pixelX = (centerLng + 180) * n * tileSize / 360 - centerTileX * tileSize;
    const pixelY = (1 - Math.log(Math.tan(centerLat * Math.PI / 180) + 1 / Math.cos(centerLat * Math.PI / 180)) / Math.PI) * n * tileSize / 2 - centerTileY * tileSize;
    
    for (let dx = -halfTilesX; dx <= halfTilesX; dx++) {
      for (let dy = -halfTilesY; dy <= halfTilesY; dy++) {
        const tileX = centerTileX + dx;
        const tileY = centerTileY + dy;
        
        // Ensure tile coordinates are valid
        if (tileX >= 0 && tileX < n && tileY >= 0 && tileY < n) {
          const tile = document.createElement('div');
          
          // Position tiles to create seamless FULL coverage
          const leftPos = (containerWidth / 2) + (dx * tileSize) - pixelX;
          const topPos = (containerHeight / 2) + (dy * tileSize) - pixelY;
          
          tile.style.cssText = `
            position: absolute;
            width: ${tileSize}px;
            height: ${tileSize}px;
            left: ${leftPos}px;
            top: ${topPos}px;
            background-color: #001122;
            z-index: 1;
            border: none;
            opacity: 0;
            transition: opacity 0.3s ease-in;
          `;
          
          // Use light tile loading without callbacks (instant appearance)
          this.loadTileInstant(tile, tileX, tileY, zoom, lightTileSources);
          
          container.appendChild(tile);
        }
      }
    }
    
    // Add map attribution with feature info
    const attribution = document.createElement('div');
    attribution.style.cssText = `
      position: absolute;
      bottom: 5px;
      right: 5px;
      font-size: 8px;
      color: rgba(255, 255, 255, 0.9);
      background: rgba(0, 0, 0, 0.8);
      padding: 3px 6px;
      border-radius: 3px;
      z-index: 10;
      border: 1px solid rgba(76, 175, 80, 0.5);
    `;
    attribution.innerHTML = '🗺️ Map: States, Cities & Districts | <a href="https://carto.com" style="color: #4CAF50;">CartoDB</a> | <a href="https://osm.org" style="color: #4CAF50;">OSM</a>';
    container.appendChild(attribution);
    
    // Add zoom level info to show what labels are visible
    const labelInfo = document.createElement('div');
    labelInfo.style.cssText = `
      position: absolute;
      top: 5px;
      right: 5px;
      font-size: 9px;
      color: rgba(0, 255, 0, 0.9);
      background: rgba(0, 0, 0, 0.8);
      padding: 4px 8px;
      border-radius: 3px;
      z-index: 10;
      font-family: monospace;
      border: 1px solid rgba(0, 255, 0, 0.5);
    `;
    
    // Show what's visible at current zoom level
    let visibleFeatures = '';
    if (zoom <= 3) {
      visibleFeatures = 'COUNTRIES';
    } else if (zoom <= 5) {
      visibleFeatures = 'STATES / PROVINCES';
    } else if (zoom <= 8) {
      visibleFeatures = 'STATES + MAJOR CITIES';
    } else if (zoom <= 10) {
      visibleFeatures = 'DISTRICTS + CITIES';
    } else {
      visibleFeatures = 'ALL LABELS (Districts, Towns)';
    }
    
    labelInfo.textContent = `MAP ZOOM ${zoom} | ${visibleFeatures}`;
    container.appendChild(labelInfo);
    
    console.log(`🗺️ Map labels at zoom ${zoom}: ${visibleFeatures}`);
  }

  private loadTileInstant(tile: HTMLElement, tileX: number, tileY: number, zoom: number, sources: string[]) {
    // Load tile instantly without loading indicators
    this.tryLoadTileInstant(tile, tileX, tileY, zoom, sources, 0);
  }

  private tryLoadTileInstant(tile: HTMLElement, tileX: number, tileY: number, zoom: number, sources: string[], sourceIndex: number) {
    if (sourceIndex >= sources.length) {
      // All sources failed, show subtle gray background
      tile.style.backgroundColor = '#1a1a2e';
      tile.style.opacity = '1';
      return;
    }

    let tileUrl = sources[sourceIndex];
    
    // Handle different URL formats for light map sources
    if (tileUrl.includes('{q}')) {
      const quadKey = this.tileToQuadKey(tileX, tileY, zoom);
      tileUrl = tileUrl.replace('{q}', quadKey);
    } else {
      tileUrl = tileUrl.replace('{x}', tileX.toString()).replace('{y}', tileY.toString());
    }
    
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    // Shorter timeout for faster fallback
    const loadTimeout = setTimeout(() => {
      this.tryLoadTileInstant(tile, tileX, tileY, zoom, sources, sourceIndex + 1);
    }, 2000);
    
    img.onload = () => {
      clearTimeout(loadTimeout);
      tile.style.backgroundImage = `url('${img.src}')`;
      tile.style.backgroundSize = 'cover';
      tile.style.backgroundRepeat = 'no-repeat';
      tile.style.backgroundColor = 'transparent';
      tile.style.opacity = '1'; // Fade in smoothly
    };
    
    img.onerror = () => {
      clearTimeout(loadTimeout);
      this.tryLoadTileInstant(tile, tileX, tileY, zoom, sources, sourceIndex + 1);
    };
    
    img.src = tileUrl;
  }

  private loadTileOptimized(tile: HTMLElement, tileX: number, tileY: number, zoom: number, sources: string[], onSuccess: () => void) {
    // Try light map sources first, with fallback logic
    this.tryLoadTile(tile, tileX, tileY, zoom, sources, 0, onSuccess);
  }

  private tryLoadTile(tile: HTMLElement, tileX: number, tileY: number, zoom: number, sources: string[], sourceIndex: number, onSuccess: () => void) {
    if (sourceIndex >= sources.length) {
      console.warn(`🗺️ All light tile sources failed for: ${zoom}/${tileX}/${tileY}`);
      tile.style.backgroundColor = '#f0f0f0';
      onSuccess();
      return;
    }

    let tileUrl = sources[sourceIndex];
    
    // Handle different URL formats for light map sources
    if (tileUrl.includes('{q}')) {
      // Bing format - convert to quadkey
      const quadKey = this.tileToQuadKey(tileX, tileY, zoom);
      tileUrl = tileUrl.replace('{q}', quadKey);
    } else {
      // Standard format
      tileUrl = tileUrl.replace('{x}', tileX.toString()).replace('{y}', tileY.toString());
    }
    
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    // Set timeout for faster loading
    const loadTimeout = setTimeout(() => {
      console.warn(`🗺️ Light tile loading timeout for source ${sourceIndex}: ${zoom}/${tileX}/${tileY}`);
      // Try next source
      this.tryLoadTile(tile, tileX, tileY, zoom, sources, sourceIndex + 1, onSuccess);
    }, 3000); // 3 second timeout for light tiles
    
    img.onload = () => {
      clearTimeout(loadTimeout);
      tile.style.backgroundImage = `url('${img.src}')`;
      tile.style.backgroundSize = 'cover';
      tile.style.backgroundRepeat = 'no-repeat';
      tile.style.backgroundColor = 'transparent';
      console.log(`🗺️ Successfully loaded light tile from source ${sourceIndex}: ${zoom}/${tileX}/${tileY}`);
      onSuccess();
    };
    
    img.onerror = () => {
      clearTimeout(loadTimeout);
      console.warn(`🗺️ Failed to load light tile from source ${sourceIndex}: ${zoom}/${tileX}/${tileY}`);
      // Try next source
      this.tryLoadTile(tile, tileX, tileY, zoom, sources, sourceIndex + 1, onSuccess);
    };
    
    img.src = tileUrl;
  }

  private tileToQuadKey(tileX: number, tileY: number, zoom: number): string {
    let quadKey = '';
    for (let i = zoom; i > 0; i--) {
      let digit = 0;
      const mask = 1 << (i - 1);
      if ((tileX & mask) !== 0) digit++;
      if ((tileY & mask) !== 0) digit += 2;
      quadKey += digit.toString();
    }
    return quadKey;
  }


  private drawConnectionLines(visualizationArea: HTMLElement, centerAircraft: Aircraft) {
    const svgOverlay = visualizationArea.querySelector('#connection-lines-svg') as SVGElement;
    if (!svgOverlay) return;

    // Clear existing lines
    svgOverlay.innerHTML = '';

    const svgRect = svgOverlay.getBoundingClientRect();
    const svgWidth = svgRect.width || 800;
    const svgHeight = svgRect.height || 600;

    // Center aircraft is always at center (50%, 50%)
    const centerX = svgWidth * 0.5;
    const centerY = svgHeight * 0.5;

    // Get all friendly aircraft positions
    const friendlyAircraft: Array<{aircraft: Aircraft, x: number, y: number, screenX: number, screenY: number}> = [];

    this.aircraft.forEach((aircraft, id) => {
      if (id === centerAircraft.id) return; // Skip center aircraft

      // Calculate relative position and convert to Cartesian
      const relativeLat = aircraft.lat - centerAircraft.lat;
      const relativeLng = aircraft.lng - centerAircraft.lng;
      const cartesianCoords = this.convertToCartesian(relativeLat, relativeLng);

      // Convert to screen coordinates
      const x = cartesianCoords.x + 50; // 50% is center
      const y = cartesianCoords.y + 50; // 50% is center

      // Clamp coordinates like we do for aircraft positioning
      const clampedX = Math.max(5, Math.min(95, x));
      const clampedY = Math.max(5, Math.min(95, y));

      // Convert percentages to actual SVG coordinates
      const aircraftX = (clampedX / 100) * svgWidth;
      const aircraftY = (clampedY / 100) * svgHeight;

      // Store friendly aircraft positions for inter-friendly connections
      if (aircraft.aircraftType === 'friendly') {
        friendlyAircraft.push({
          aircraft,
          x: clampedX,
          y: clampedY,
          screenX: aircraftX,
          screenY: aircraftY
        });
      }

      // Calculate distance in nautical miles
      const distance = this.calculateDistanceBetweenAircraft(centerAircraft, aircraft);
      const distanceNM = distance.toFixed(1); // Already in nautical miles
      
      // Draw line from center to each aircraft
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', centerX.toString());
      line.setAttribute('y1', centerY.toString());
      line.setAttribute('x2', aircraftX.toString());
      line.setAttribute('y2', aircraftY.toString());
      
      // Different line colors for different aircraft types
      const lineColor = aircraft.aircraftType === 'threat' ? '#ff4444' : 
                       aircraft.aircraftType === 'mother' ? '#4488ff' : 
                       aircraft.aircraftType === 'self' ? '#FFD700' : '#44ff44';
      
      line.setAttribute('stroke', lineColor);
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-opacity', '0.5');
      line.setAttribute('stroke-dasharray', '5,5'); // Dashed line
      
      svgOverlay.appendChild(line);
      
      // Add distance label at the midpoint of the line
      const midX = (centerX + aircraftX) / 2;
      const midY = (centerY + aircraftY) / 2;
      
      const distanceLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      distanceLabel.setAttribute('x', midX.toString());
      distanceLabel.setAttribute('y', midY.toString());
      distanceLabel.setAttribute('text-anchor', 'middle');
      distanceLabel.setAttribute('dominant-baseline', 'middle');
      distanceLabel.setAttribute('fill', lineColor);
      distanceLabel.setAttribute('font-family', 'monospace');
      distanceLabel.setAttribute('font-size', '12');
      distanceLabel.setAttribute('font-weight', 'bold');
      distanceLabel.setAttribute('stroke', 'black');
      distanceLabel.setAttribute('stroke-width', '0.5');
      distanceLabel.setAttribute('paint-order', 'stroke fill');
      distanceLabel.textContent = `${distanceNM}NM`;
      
      svgOverlay.appendChild(distanceLabel);
    });

    // Draw lines between friendly aircraft
    for (let i = 0; i < friendlyAircraft.length; i++) {
      for (let j = i + 1; j < friendlyAircraft.length; j++) {
        const aircraft1 = friendlyAircraft[i];
        const aircraft2 = friendlyAircraft[j];
        
        // Calculate distance between friendly aircraft
        const friendlyDistance = this.calculateDistanceBetweenAircraft(aircraft1.aircraft, aircraft2.aircraft);
        const friendlyDistanceNM = friendlyDistance.toFixed(1); // Already in nautical miles
        
        // Draw connection line between friendly aircraft
        const friendlyLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        friendlyLine.setAttribute('x1', aircraft1.screenX.toString());
        friendlyLine.setAttribute('y1', aircraft1.screenY.toString());
        friendlyLine.setAttribute('x2', aircraft2.screenX.toString());
        friendlyLine.setAttribute('y2', aircraft2.screenY.toString());
        
        // Green solid line for friendly connections
        friendlyLine.setAttribute('stroke', '#00ff00');
        friendlyLine.setAttribute('stroke-width', '3');
        friendlyLine.setAttribute('stroke-opacity', '0.8');
        friendlyLine.setAttribute('stroke-dasharray', 'none'); // Solid line
        
        svgOverlay.appendChild(friendlyLine);
        
        // Add distance label at the midpoint of the friendly connection line
        const friendlyMidX = (aircraft1.screenX + aircraft2.screenX) / 2;
        const friendlyMidY = (aircraft1.screenY + aircraft2.screenY) / 2;
        
        const friendlyDistanceLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        friendlyDistanceLabel.setAttribute('x', friendlyMidX.toString());
        friendlyDistanceLabel.setAttribute('y', friendlyMidY.toString());
        friendlyDistanceLabel.setAttribute('text-anchor', 'middle');
        friendlyDistanceLabel.setAttribute('dominant-baseline', 'middle');
        friendlyDistanceLabel.setAttribute('fill', '#00ff00');
        friendlyDistanceLabel.setAttribute('font-family', 'monospace');
        friendlyDistanceLabel.setAttribute('font-size', '11');
        friendlyDistanceLabel.setAttribute('font-weight', 'bold');
        friendlyDistanceLabel.setAttribute('stroke', 'black');
        friendlyDistanceLabel.setAttribute('stroke-width', '0.5');
        friendlyDistanceLabel.setAttribute('paint-order', 'stroke fill');
        friendlyDistanceLabel.textContent = `${friendlyDistanceNM}NM`;
        
        svgOverlay.appendChild(friendlyDistanceLabel);
        
        console.log(`🤝 Connected friendly aircraft: ${aircraft1.aircraft.callSign} ↔ ${aircraft2.aircraft.callSign} (${friendlyDistanceNM}NM)`);
      }
    }
    
    console.log(`📡 Drew ${friendlyAircraft.length * (friendlyAircraft.length - 1) / 2} friendly connections`);
  }

  // Position history methods removed since server handles movement

  private addDragFunctionality(visualizationArea: HTMLElement) {
    // Mouse events for desktop
    visualizationArea.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.lastMousePos = { x: e.clientX, y: e.clientY };
      visualizationArea.style.cursor = 'grabbing';
      e.preventDefault();
    });

    visualizationArea.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        const deltaX = e.clientX - this.lastMousePos.x;
        const deltaY = e.clientY - this.lastMousePos.y;
        
        this.panOffset.x += deltaX;
        this.panOffset.y += deltaY;
        
        // No pan limits - infinite screen
        // Allow unlimited dragging in all directions
        
        this.lastMousePos = { x: e.clientX, y: e.clientY };
        this.applyPanOffset(visualizationArea);
        
        // Update pan indicator in real-time during dragging
        this.updatePanIndicator();
      }
    });

    visualizationArea.addEventListener('mouseup', () => {
      this.isDragging = false;
      visualizationArea.style.cursor = 'grab';
    });

    visualizationArea.addEventListener('mouseleave', () => {
      this.isDragging = false;
      visualizationArea.style.cursor = 'grab';
    });

    // Touch events for mobile
    visualizationArea.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this.isDragging = true;
        this.lastMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        e.preventDefault();
      }
    });

    visualizationArea.addEventListener('touchmove', (e) => {
      if (this.isDragging && e.touches.length === 1) {
        const deltaX = e.touches[0].clientX - this.lastMousePos.x;
        const deltaY = e.touches[0].clientY - this.lastMousePos.y;
        
        this.panOffset.x += deltaX;
        this.panOffset.y += deltaY;
        
        // No pan limits - infinite screen
        // Allow unlimited dragging in all directions
        
        this.lastMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        this.applyPanOffset(visualizationArea);
        
        // Update pan indicator in real-time during touch dragging
        this.updatePanIndicator();
        
        e.preventDefault();
      }
    });

    visualizationArea.addEventListener('touchend', () => {
      this.isDragging = false;
    });

    // Double-click to reset pan
    visualizationArea.addEventListener('dblclick', () => {
      this.panOffset = { x: 0, y: 0 };
      this.applyPanOffset(visualizationArea);
      this.updatePanIndicator();
    });
    
    // Add keyboard shortcuts for infinite navigation
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Home') {
        // Reset to center
        this.panOffset = { x: 0, y: 0 };
        this.applyPanOffset(visualizationArea);
        this.updatePanIndicator();
      } else if (e.key === 'ArrowLeft') {
        // Pan left
        this.panOffset.x -= 50;
        this.applyPanOffset(visualizationArea);
        this.updatePanIndicator();
      } else if (e.key === 'ArrowRight') {
        // Pan right
        this.panOffset.x += 50;
        this.applyPanOffset(visualizationArea);
        this.updatePanIndicator();
      } else if (e.key === 'ArrowUp') {
        // Pan up
        this.panOffset.y -= 50;
        this.applyPanOffset(visualizationArea);
        this.updatePanIndicator();
      } else if (e.key === 'ArrowDown') {
        // Pan down
        this.panOffset.y += 50;
        this.applyPanOffset(visualizationArea);
        this.updatePanIndicator();
      }
    });
  }

  private applyPanOffset(visualizationArea: HTMLElement) {
    // Apply pan offset to all child elements
    const children = visualizationArea.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as HTMLElement;
      if (child.id !== 'connection-lines-svg' && child.id !== 'graph-grid' && child.id !== 'map-background') {
        // Apply pan offset to aircraft elements
        const currentTransform = child.style.transform || '';
        const panTransform = `translate(${this.panOffset.x}px, ${this.panOffset.y}px)`;
        
        // Preserve existing transforms (like rotation) and add pan
        if (currentTransform.includes('rotate')) {
          child.style.transform = `${panTransform} ${currentTransform}`;
        } else {
          child.style.transform = panTransform;
        }
        
        // Ensure aircraft elements are visible
        child.style.display = 'block';
        child.style.visibility = 'visible';
        child.style.opacity = '1';
      }
    }
    
    // Apply pan offset to SVG overlay
    const svgOverlay = visualizationArea.querySelector('#connection-lines-svg') as SVGElement;
    if (svgOverlay) {
      svgOverlay.style.transform = `translate(${this.panOffset.x}px, ${this.panOffset.y}px)`;
    }
    
    // Apply pan offset to grid
    const grid = visualizationArea.querySelector('#graph-grid') as HTMLElement;
    if (grid) {
      grid.style.transform = `translate(${this.panOffset.x}px, ${this.panOffset.y}px)`;
    }
    
    // Update map background with geographic pan
    this.updateMapGeographicPan(visualizationArea);
    
    // Update pan indicator
    this.updatePanIndicator();
  }

  private updateMapGeographicPan(visualizationArea: HTMLElement) {
    // Apply geographic pan to map background - convert pixel offset to geographic offset
    const mapBackground = visualizationArea.querySelector('#map-background') as HTMLElement;
    if (!mapBackground || !this.showMap) return;

    // Get current center aircraft position
    let centerAircraft: Aircraft | null = null;
    if (this.centerMode === 'mother') {
      centerAircraft = this.motherAircraft || this.aircraft.get(this.nodeId);
    } else {
      centerAircraft = this.aircraft.get(this.nodeId) || this.motherAircraft;
    }
    if (!centerAircraft) return;

    // Convert pixel pan offset to geographic offset
    const zoom = Math.max(1, Math.min(18, 6 - Math.log2(this.zoomLevel)));
    const scale = Math.pow(2, zoom);
    const tileSize = 256;
    
    // Calculate pixels per degree at current latitude
    const pixelsPerDegreeLat = (scale * tileSize) / 360;
    const centerLatRad = (centerAircraft.lat * Math.PI) / 180;
    const pixelsPerDegreeLng = (scale * tileSize * Math.cos(centerLatRad)) / 360;
    
    // Convert pixel offset to geographic offset (inverted because we pan the map opposite to aircraft movement)
    const geoOffsetLng = -this.panOffset.x / pixelsPerDegreeLng;
    const geoOffsetLat = this.panOffset.y / pixelsPerDegreeLat; // Positive because screen Y is inverted
    
    // Apply geographic offset to map background
    const totalGeoOffsetX = geoOffsetLng;
    const totalGeoOffsetY = geoOffsetLat;
    
    // Apply smooth transform to the map background
    mapBackground.style.transition = 'transform 0.1s linear';
    mapBackground.style.transform = `translate(${totalGeoOffsetX * pixelsPerDegreeLng}px, ${-totalGeoOffsetY * pixelsPerDegreeLat}px)`;
    
    // Update stored center position to reflect the geographic pan
    const storedLat = parseFloat(mapBackground.getAttribute('data-center-lat') || centerAircraft.lat.toString());
    const storedLng = parseFloat(mapBackground.getAttribute('data-center-lng') || centerAircraft.lng.toString());
    
    // Calculate new geographic center based on pan offset
    const newCenterLat = storedLat + geoOffsetLat;
    const newCenterLng = storedLng + geoOffsetLng;
    
    // Update the stored center position
    mapBackground.setAttribute('data-center-lat', newCenterLat.toString());
    mapBackground.setAttribute('data-center-lng', newCenterLng.toString());
  }

  private updatePanIndicator() {
    // Create or update pan position indicator
    let panIndicator = document.getElementById('pan-indicator');
    if (!panIndicator) {
      panIndicator = document.createElement('div');
      panIndicator.id = 'pan-indicator';
      panIndicator.style.cssText = `
        position: fixed;
        top: 10px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.9);
        color: #00ff00;
        font-family: monospace;
        font-size: 12px;
        padding: 6px 12px;
        border-radius: 4px;
        border: 1px solid #00ff00;
        z-index: 300;
        pointer-events: none;
        box-shadow: 0 0 10px rgba(0, 255, 0, 0.3);
      `;
      document.body.appendChild(panIndicator);
    }
    
    // Calculate real-time pan metrics
    const panX = this.panOffset.x;
    const panY = this.panOffset.y;
    const distance = Math.sqrt(panX * panX + panY * panY);
    
    // Calculate direction in degrees
    const angle = Math.atan2(panY, panX) * (180 / Math.PI);
    const normalizedAngle = (angle + 360) % 360;
    
    // Convert to cardinal directions
    let direction = '';
    if (normalizedAngle >= 337.5 || normalizedAngle < 22.5) direction = 'E';
    else if (normalizedAngle >= 22.5 && normalizedAngle < 67.5) direction = 'NE';
    else if (normalizedAngle >= 67.5 && normalizedAngle < 112.5) direction = 'N';
    else if (normalizedAngle >= 112.5 && normalizedAngle < 157.5) direction = 'NW';
    else if (normalizedAngle >= 157.5 && normalizedAngle < 202.5) direction = 'W';
    else if (normalizedAngle >= 202.5 && normalizedAngle < 247.5) direction = 'SW';
    else if (normalizedAngle >= 247.5 && normalizedAngle < 292.5) direction = 'S';
    else if (normalizedAngle >= 292.5 && normalizedAngle < 337.5) direction = 'SE';
    
    // Update position display with real-time values
    panIndicator.innerHTML = `
      <span style="color: #00ff00;">INFINITE VIEW</span> | 
      Pan: <span style="color: #ffff00;">X:${panX.toFixed(0)}px</span> 
      <span style="color: #ffff00;">Y:${panY.toFixed(0)}px</span> | 
      Distance: <span style="color: #ff8800;">${distance.toFixed(0)}px</span> 
      <span style="color: #00ffff;">${direction}</span> | 
      <span style="color: #ff00ff;">Home: Reset</span> | 
      <span style="color: #ffffff;">Arrows: Navigate</span>
    `;
    
    // Create mini compass to show direction
    this.updateMiniCompass();
  }

  private updateMiniCompass() {
    let compass = document.getElementById('mini-compass');
    if (!compass) {
      compass = document.createElement('div');
      compass.id = 'mini-compass';
      compass.style.cssText = `
        position: fixed;
        bottom: 10px;
        right: 10px;
        width: 60px;
        height: 60px;
        background: rgba(0, 0, 0, 0.8);
        border: 2px solid #00ff00;
        border-radius: 50%;
        z-index: 300;
        pointer-events: none;
        display: flex;
        align-items: center;
        justify-content: center;
      `;
      document.body.appendChild(compass);
    }
    
    // Calculate direction from pan offset
    const angle = Math.atan2(this.panOffset.y, this.panOffset.x) * (180 / Math.PI);
    const normalizedAngle = (angle + 360) % 360;
    
    // Create compass needle
    compass.innerHTML = `
      <div style="
        width: 2px;
        height: 20px;
        background: #ff0000;
        transform: rotate(${normalizedAngle}deg);
        transform-origin: bottom center;
        position: absolute;
        bottom: 30px;
        left: 29px;
      "></div>
      <div style="
        position: absolute;
        top: 5px;
        left: 50%;
        transform: translateX(-50%);
        color: #00ff00;
        font-size: 10px;
        font-family: monospace;
      ">N</div>
    `;
  }

  private convertToCartesian(deltaLat: number, deltaLng: number): { x: number; y: number } {
    // Convert lat/lng degree differences to Cartesian coordinates for 2D graph display
    // Self node is at origin (0,0), other nodes are relative positions
    
    // Scale factor: Moderate scale to keep aircraft closer to center but still noticeable
    // Balanced scale keeps aircraft near center while allowing visible movement
    const scale = 100; // Moderate scale to keep aircraft closer to center
    
    // Convert to Cartesian coordinates
    // Longitude difference becomes X (East-West)
    // Latitude difference becomes Y (North-South, inverted for screen coordinates)  
    const rawX = deltaLng * scale;
    const rawY = -deltaLat * scale; // Negative because screen Y is inverted (0 at top)
    
    // Apply zoom to the coordinates - NO CLAMPING to prevent bouncing
    const zoomedX = rawX * this.zoomLevel;
    const zoomedY = rawY * this.zoomLevel;
    
    console.log(`📍 Coord conversion: ΔLat=${deltaLat.toFixed(6)}, ΔLng=${deltaLng.toFixed(6)} | Raw: X=${rawX.toFixed(2)}, Y=${rawY.toFixed(2)} | Zoomed: X=${zoomedX.toFixed(2)}, Y=${zoomedY.toFixed(2)}`);
    
    return { x: zoomedX, y: zoomedY };
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  public sendMessage(message: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const messageData = {
        type: 'message',
        payload: {
          id: this.nodeId,
          message: message
        }
      };
      this.ws.send(JSON.stringify(messageData));
      console.log('Sent message:', messageData);
    }
  }

  public disconnect() {
    if (this.ws) {
      this.ws.close();
    }
    // Location updates are now handled by server
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.messageCodesInterval) {
      clearTimeout(this.messageCodesInterval);
      this.messageCodesInterval = null;
    }
    if (this.mapUpdateInterval) {
      clearInterval(this.mapUpdateInterval);
      this.mapUpdateInterval = null;
    }
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.viewAdjustmentThrottle) {
      clearTimeout(this.viewAdjustmentThrottle);
      this.viewAdjustmentThrottle = null;
    }
    // Clear aircraft data
    this.aircraft.clear();
    this.aircraftInterpolation.clear();
    this.motherAircraft = null;
  }
}

// Initialize WebSocket client when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const wsClient = new WebSocketClient();
  
  // Add some test functionality
  window.addEventListener('beforeunload', () => {
    wsClient.disconnect();
  });
});
