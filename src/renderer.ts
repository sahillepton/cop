import './index.css';

console.log(
  '👋 This message is being logged by "renderer.ts", included via Vite',
);

type AircraftType = "mother" | "friendly" | "threat";

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
  private motherAircraft: Aircraft | null = null; // Reference to mother aircraft for centering
  private showMap: boolean = false; // Toggle visibility of background map
  private mapElement: HTMLElement | null = null; // Reference to map container
  private centerMode: 'mother' | 'self' = 'mother'; // Toggle between mother-centered and self-centered view
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
      // Set initial realistic location (somewhere in a reasonable area)
      this.currentLat = 40.7128 + (Math.random() - 0.5) * 0.1; // Near NYC with some variation
      this.currentLng = -74.0060 + (Math.random() - 0.5) * 0.1;
      
      const connectionData = {
        type: 'connection',
        payload: {
          id: this.nodeId,
          status: 'connected',
          info: 'F-35 Lightning II Client',
          lat: this.currentLat,
          lng: this.currentLng,
          aircraftType: 'friendly',
          callSign: `LIGHTNING-${Math.floor(Math.random() * 99) + 1}`,
          altitude: 25000 + Math.floor(Math.random() * 10000),
          heading: Math.floor(Math.random() * 360),
          speed: 400 + Math.floor(Math.random() * 200)
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
      speed: aircraftData.speed || 400
    };
    
    console.log(`🔧 Created aircraft object:`, aircraft);
    
    this.aircraft.set(aircraftData.id, aircraft);
    console.log(`🔧 Aircraft map now has ${this.aircraft.size} aircraft`);
    
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
      aircraft.lat = locationData.lat;
      aircraft.lng = locationData.lng;
      
      // Update additional flight data if provided
      if (locationData.altitude !== undefined) aircraft.altitude = locationData.altitude;
      if (locationData.heading !== undefined) aircraft.heading = locationData.heading;
      if (locationData.speed !== undefined) aircraft.speed = locationData.speed;
      
      this.aircraft.set(locationData.id, aircraft);
      console.log(`✈️ ${aircraft.callSign} location updated: ${aircraft.lat.toFixed(4)}, ${aircraft.lng.toFixed(4)} | Alt: ${aircraft.altitude}ft, Hdg: ${aircraft.heading}°, Spd: ${aircraft.speed}kts`);
      this.updateDebugInfo();
      
      // Update the aircraft position instantly
      this.updateAircraftPosition(locationData.id);
      
      // Check for warnings after position update (throttled)
      this.throttledWarningCheck();
    }
  }

  private updateAircraftPosition(aircraftId: string) {
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
    
    // Only display aircraft that are within visible bounds
    const isVisible = (x >= 5 && x <= 95 && y >= 5 && y <= 95);

    // Find the existing aircraft element and update its position instantly
    const aircraftElement = document.querySelector(`[data-aircraft-id="${aircraftId}"]`) as HTMLElement;
    if (aircraftElement && isVisible) {
      // INSTANT position change - no animations
      aircraftElement.style.transition = 'none !important';
      aircraftElement.style.animation = 'none !important';
      aircraftElement.style.top = `${y}%`;
      aircraftElement.style.left = `${x}%`;
      aircraftElement.style.display = 'block';
      
      console.log(`🎯 Updated ${aircraft.callSign} position to: ${x.toFixed(1)}%, ${y.toFixed(1)}%`);
      
      // Update connection lines when aircraft moves
      const visualizationArea = document.getElementById('visualization-area');
      if (visualizationArea && centerAircraft) {
        this.drawConnectionLines(visualizationArea, centerAircraft);
      }
    } else if (aircraftElement && !isVisible) {
      // Hide aircraft that are off-screen
      aircraftElement.style.display = 'none';
      console.log(`🎯 ${aircraft.callSign} moved off-screen - hiding`);
    } else {
      // If element doesn't exist, update the entire UI
      this.updateUI();
    }
  }

  private isAircraftThreat(aircraft: Aircraft): boolean {
    return aircraft.aircraftType === 'threat';
  }

  private updateAircraftThreatStatus(aircraftElement: HTMLElement, aircraft: Aircraft) {
    if (aircraft.aircraftType === 'threat') {
      // Threat aircraft - red with pulsing
      aircraftElement.style.background = '#ff0000';
      aircraftElement.style.boxShadow = '0 0 20px #ff0000, 0 0 30px #ff0000';
      aircraftElement.style.animation = 'threatPulse 0.5s infinite';
      
      // Add threat indicator
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
          animation: threatBlink 0.3s infinite;
        `;
        aircraftElement.appendChild(threatIndicator);
      }
    } else if (aircraft.aircraftType === 'mother') {
      // Mother aircraft - blue with stronger glow
      aircraftElement.style.background = '#0080ff';
      aircraftElement.style.boxShadow = '0 0 25px #0080ff, 0 0 40px #0080ff';
      aircraftElement.style.animation = 'motherPulse 2s infinite';
    } else {
      // Friendly aircraft - green
      aircraftElement.style.background = '#00ff00';
      aircraftElement.style.boxShadow = '0 0 15px rgba(0, 255, 0, 0.8)';
      aircraftElement.style.animation = 'none !important';
      
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
    // Send periodic location updates to server
    setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const selfAircraft = this.aircraft.get(this.nodeId);
        if (selfAircraft) {
          // Simulate some movement for the self aircraft
          selfAircraft.lat += (Math.random() - 0.5) * 0.0001; // Small random movement
          selfAircraft.lng += (Math.random() - 0.5) * 0.0001;
          
          // Update heading and speed occasionally
          if (Math.random() < 0.1) { // 10% chance
            selfAircraft.heading = (selfAircraft.heading + (Math.random() - 0.5) * 10 + 360) % 360;
            selfAircraft.speed += (Math.random() - 0.5) * 20;
            selfAircraft.speed = Math.max(200, Math.min(600, selfAircraft.speed));
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
          console.log(`📡 Sent self location update: ${selfAircraft.callSign} at ${selfAircraft.lat.toFixed(6)}, ${selfAircraft.lng.toFixed(6)}`);
        }
      }
    }, 2000); // Send every 2 seconds
  }

  private updateUI() {
    const container = document.getElementById('nodes-container');
    if (!container) return;

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
    `;

    container.appendChild(visualizationArea);

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

    // Create 2D graph with grid lines and circles
    this.create2DGraph(visualizationArea);

    // Always create center aircraft element at screen center (same positioning as radar circles)
    const centerElement = this.createAircraftElement(centerAircraft, true);
    
    // Get the aircraft size to calculate proper centering margins
    const aircraftSize = Math.max(8, 22 / this.zoomLevel); // Same calculation as in createAircraftElement
    const halfSize = aircraftSize / 2;
    
    centerElement.style.cssText = `
      position: absolute !important;
      top: 50% !important;
      left: 50% !important;
      margin-top: -${halfSize}px !important;
      margin-left: -${halfSize}px !important;
      z-index: 10;
      transform: none !important;
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
      if (!this.showOtherNodes) {
        console.log(`🎨 Other nodes hidden, skipping: ${aircraft.callSign}`);
        return; // Skip if other aircraft are hidden
      }

      const aircraftElement = this.createAircraftElement(aircraft, false);
      
      // Calculate relative position: other_aircraft - center_aircraft
      const relativeLat = aircraft.lat - centerAircraft.lat;
      const relativeLng = aircraft.lng - centerAircraft.lng;
      
      // Convert lat/lng degrees to Cartesian coordinates for 2D graph
      const cartesianCoords = this.convertToCartesian(relativeLat, relativeLng);
      const x = cartesianCoords.x + 50; // 50% is center (origin)
      const y = cartesianCoords.y + 50; // 50% is center (origin)
      
      console.log(`🎨 Aircraft ${aircraft.callSign} position: x=${x.toFixed(1)}%, y=${y.toFixed(1)}%`);
      
      // Clamp coordinates to visible bounds instead of hiding
      const clampedX = Math.max(5, Math.min(95, x));
      const clampedY = Math.max(5, Math.min(95, y));
      
      if (x !== clampedX || y !== clampedY) {
        console.log(`📍 Aircraft ${aircraft.callSign} clamped from (${x.toFixed(1)}, ${y.toFixed(1)}) to (${clampedX.toFixed(1)}, ${clampedY.toFixed(1)})`);
      }
      
      aircraftElement.style.cssText += `
          position: absolute;
        top: ${clampedY}%;
        left: ${clampedX}%;
          transform: translate(-50%, -50%);
          z-index: 5;
          transition: none !important;
          animation: none !important;
          display: block;
        `;
      
      // Add data attribute for updates
      aircraftElement.setAttribute('data-aircraft-id', id);
      
      // Apply aircraft-specific styling
      this.updateAircraftThreatStatus(aircraftElement, aircraft);
      
      visualizationArea.appendChild(aircraftElement);
    });

    // Draw connection lines to aircraft within radar circles
    if (this.showOtherNodes) {
      this.drawConnectionLines(visualizationArea, centerAircraft);
    }

    // Add bottom bar with range filter buttons
    this.createBottomBar(container);
    
    // Add debug info
    this.addDebugInfo(container);

    // Check for warnings
    this.checkWarnings();
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
    if (this.zoomLevel < 4) { // Max zoom 4x (smallest nodes)
      this.zoomLevel += 0.5;
      console.log('New zoom level (higher = smaller nodes):', this.zoomLevel);
      this.updateZoomDisplay();
      this.updateUI();
    } else {
      console.log('Max zoom reached - nodes at smallest size');
    }
  }

  private zoomOut() {
    console.log('Zoom Out (-) clicked - Making nodes larger, current level:', this.zoomLevel);
    if (this.zoomLevel > 0.25) { // Min zoom 0.25x (largest nodes)
      this.zoomLevel -= 0.5;
      console.log('New zoom level (lower = larger nodes):', this.zoomLevel);
      this.updateZoomDisplay();
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

      const distance = this.calculateDistance(selfAircraft, aircraft);
      
      if (distance <= this.warningSystem.threatProximityThreshold) {
        const warningId = `THREAT_PROXIMITY_${id}`;
        this.warningSystem.activeWarnings.add(warningId);
        console.log(`⚠️ THREAT WARNING: ${aircraft.callSign} at ${(distance * 54).toFixed(1)}NM`);
      }
    });
  }

  private checkMotherDistance(selfAircraft: Aircraft) {
    if (!this.motherAircraft) return;

    const distance = this.calculateDistance(selfAircraft, this.motherAircraft);
    
    if (distance >= this.warningSystem.motherDistanceThreshold) {
      const warningId = `MOTHER_DISTANCE`;
      this.warningSystem.activeWarnings.add(warningId);
      console.log(`⚠️ SEPARATION WARNING: Distance from ${this.motherAircraft.callSign}: ${(distance * 54).toFixed(1)}NM`);
    }
  }

  private calculateDistance(aircraft1: Aircraft, aircraft2: Aircraft): number {
    const latDiff = aircraft1.lat - aircraft2.lat;
    const lngDiff = aircraft1.lng - aircraft2.lng;
    return Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
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
  }

  private createAircraftElement(aircraft: Aircraft, isCenter: boolean) {
    const aircraftElement = document.createElement('div');
    
    // Scale aircraft sizes with zoom level - larger for better icon visibility
    const baseSize = isCenter ? 32 : 24;
    const scaledSize = Math.max(16, baseSize / this.zoomLevel);
    const glowSize = scaledSize + 10;
    
    // Base styling for all aircraft - invisible container, only icon visible
    aircraftElement.style.cssText = `
      width: ${scaledSize}px;
      height: ${scaledSize}px;
      transition: none !important;
      cursor: pointer;
      position: absolute;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      outline: none;
    `;
    
    // Create SVG icon element directly
    this.createSVGIcon(aircraftElement, aircraft.aircraftType, scaledSize);
    
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
      top: ${scaledSize + 2}px;
      left: 50%;
      transform: translateX(-50%);
      color: white;
      font-family: monospace;
      font-size: ${Math.max(8, scaledSize * 0.3)}px;
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

  private createSVGIcon(container: HTMLElement, aircraftType: AircraftType, size: number) {
    const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgElement.setAttribute('width', size.toString());
    svgElement.setAttribute('height', size.toString());
    svgElement.setAttribute('viewBox', '0 0 100 100');
    
    // Apply glow effects and animations directly to SVG
    let svgFilter = '';
    let svgAnimation = '';
    
    if (aircraftType === 'mother') {
      svgFilter = `drop-shadow(0 0 8px #0080ff) drop-shadow(0 0 16px #0080ff)`;
      svgAnimation = 'motherPulse 2s infinite';
    } else if (aircraftType === 'threat') {
      svgFilter = `drop-shadow(0 0 8px #ff0000) drop-shadow(0 0 16px #ff0000)`;
      svgAnimation = 'threatPulse 0.5s infinite';
    } else {
      svgFilter = `drop-shadow(0 0 6px rgba(0, 255, 0, 0.8))`;
      svgAnimation = 'none';
    }
    
    svgElement.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
      filter: ${svgFilter};
      animation: ${svgAnimation};
    `;

    // Create different aircraft shapes based on type
    let svgContent = '';
    const color = this.getAircraftColor(aircraftType);

    switch (aircraftType) {
      case 'mother':
        // Simple large circle for testing
        svgContent = `
          <circle cx="50" cy="50" r="40" fill="${color}" stroke="white" stroke-width="3"/>
          <text x="50" y="55" text-anchor="middle" fill="white" font-size="20" font-family="monospace">M</text>
        `;
        break;
      case 'friendly':
        // Simple triangle for testing
        svgContent = `
          <polygon points="50,10 20,80 80,80" fill="${color}" stroke="white" stroke-width="3"/>
          <text x="50" y="60" text-anchor="middle" fill="white" font-size="16" font-family="monospace">F</text>
        `;
        break;
      case 'threat':
        // Simple square for testing
        svgContent = `
          <rect x="15" y="15" width="70" height="70" fill="${color}" stroke="white" stroke-width="3"/>
          <text x="50" y="55" text-anchor="middle" fill="white" font-size="18" font-family="monospace">T</text>
        `;
        break;
      default:
        // Simple diamond for testing
        svgContent = `
          <polygon points="50,10 85,50 50,90 15,50" fill="${color}" stroke="white" stroke-width="3"/>
          <text x="50" y="55" text-anchor="middle" fill="white" font-size="16" font-family="monospace">?</text>
        `;
        break;
    }

    svgElement.innerHTML = svgContent;
    container.appendChild(svgElement);
    
    console.log(`✅ Created SVG icon for ${aircraftType} with size ${size}px`);
    console.log(`🔍 SVG element:`, svgElement);
    console.log(`🔍 Container element:`, container);
    console.log(`🔍 SVG content:`, svgContent);
  }

  private getAircraftColor(aircraftType: AircraftType): string {
    switch (aircraftType) {
      case 'mother':
        return '#0080ff';
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
                     aircraft.aircraftType === 'mother' ? '#4488ff' : '#44ff44';
    
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
      <div><strong>Speed:</strong> ${aircraft.speed} kts</div>
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

    // Set minimum radar range and add buffer
    const minRadarRange = 20; // Minimum radar range
    const bufferFactor = 1.3; // 30% buffer beyond farthest aircraft
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

  private updateRangeInfo(adaptiveRange: number, maxDistance: number) {
    const rangeInfo = document.getElementById('adaptive-range-info');
    if (rangeInfo) {
      const aircraftCount = this.aircraft.size - 1; // Exclude center aircraft
      const maxRangeNM = Math.round((adaptiveRange / 50) * 200); // Rough NM conversion
      rangeInfo.textContent = `ADAPTIVE RANGE: ${maxRangeNM}NM | ${aircraftCount} AIRCRAFT | MAX DIST: ${maxDistance.toFixed(1)}`;
    }
  }

  private createMapBackground(visualizationArea: HTMLElement) {
    let centerAircraft: Aircraft | null = null;
    if (this.centerMode === 'mother') {
      centerAircraft = this.motherAircraft || this.aircraft.get(this.nodeId);
    } else {
      centerAircraft = this.aircraft.get(this.nodeId) || this.motherAircraft;
    }
    if (!centerAircraft) return;

    // Check if map already exists and is at the same location
    const existingMap = visualizationArea.querySelector('#map-background') as HTMLElement;
    if (existingMap) {
      const existingLat = existingMap.getAttribute('data-center-lat');
      const existingLng = existingMap.getAttribute('data-center-lng');
      const existingZoom = existingMap.getAttribute('data-zoom-level');
      const existingMode = existingMap.getAttribute('data-center-mode');
      
      const currentLat = centerAircraft.lat.toFixed(4);
      const currentLng = centerAircraft.lng.toFixed(4);
      const currentZoom = Math.max(1, Math.min(8, 6 - Math.log2(this.zoomLevel))).toString();
      const currentMode = this.centerMode;
      
      // If location, zoom, AND center mode haven't changed significantly, don't recreate map
      if (existingLat === currentLat && existingLng === currentLng && existingZoom === currentZoom && existingMode === currentMode) {
        console.log(`🗺️ Map already exists at same location and mode, skipping recreation`);
        return;
      }
      
      console.log(`🗺️ Map location/zoom/mode changed (${existingMode}->${currentMode}), recreating map`);
      existingMap.remove();
    }

    const mapContainer = document.createElement('div');
    mapContainer.id = 'map-background';
    
    // Calculate zoom level based on radar range (approximate)
    const zoomLevel = Math.max(1, Math.min(8, 6 - Math.log2(this.zoomLevel)));
    
    // Use NASA Blue Marble satellite imagery
    const lat = centerAircraft.lat.toFixed(6);
    const lng = centerAircraft.lng.toFixed(6);
    
    // Store map parameters to avoid unnecessary recreation
    mapContainer.setAttribute('data-center-lat', lat.substring(0, lat.indexOf('.') + 5)); // 4 decimal places
    mapContainer.setAttribute('data-center-lng', lng.substring(0, lng.indexOf('.') + 5)); // 4 decimal places
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
    
    // Create a tile-based map using Blue Marble tiles
    this.createBlueMarbleTileMap(mapContainer, parseFloat(lat), parseFloat(lng), Math.floor(zoomLevel));
    
    console.log(`🛰️ Created Blue Marble satellite map centered at ${lat}, ${lng} with zoom ${zoomLevel}`);
    
    visualizationArea.appendChild(mapContainer);
    this.mapElement = mapContainer;
  }

  private createBlueMarbleTileMap(container: HTMLElement, centerLat: number, centerLng: number, zoom: number) {
    console.log(`🛰️ Creating optimized satellite map: lat=${centerLat}, lng=${centerLng}, zoom=${zoom}`);
    
    // Show loading indicator
    const loadingIndicator = document.createElement('div');
    loadingIndicator.id = 'map-loading';
    loadingIndicator.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: #00ff00;
      font-family: monospace;
      font-size: 14px;
      background: rgba(0, 0, 0, 0.8);
      padding: 10px 20px;
      border-radius: 5px;
      border: 1px solid #00ff00;
      z-index: 100;
    `;
    loadingIndicator.textContent = 'Loading Satellite Map...';
    container.appendChild(loadingIndicator);
    
    // Use faster, more reliable tile sources
    const fastTileSources = [
      // OpenStreetMap - fast and reliable
      `https://tile.openstreetmap.org/${zoom}/{x}/{y}.png`,
      // Esri World Imagery - good satellite imagery, faster than NASA
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/{y}/{x}`,
      // Cartodb Dark Matter for tactical look
      `https://cartodb-basemaps-a.global.ssl.fastly.net/dark_all/${zoom}/{x}/{y}.png`
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
    
    console.log(`🛰️ Creating optimized ${tilesX}x${tilesY} tile grid`);
    
    let tilesLoaded = 0;
    let totalTiles = tilesX * tilesY;
    
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
          
          console.log(`🗺️ Tile ${dx},${dy} positioned at: ${leftPos.toFixed(1)}, ${topPos.toFixed(1)}`);
          
          tile.style.cssText = `
            position: absolute;
            width: ${tileSize}px;
            height: ${tileSize}px;
            left: ${leftPos}px;
            top: ${topPos}px;
            background-color: #001122;
            z-index: 1;
            border: none;
          `;
          
          // Debug tile boundaries
          if (leftPos < 0 || topPos < 0 || leftPos > containerWidth || topPos > containerHeight) {
            console.log(`🗺️ Tile extends beyond container: pos(${leftPos.toFixed(1)}, ${topPos.toFixed(1)}) container(${containerWidth}x${containerHeight})`);
          }
          
          // Use faster tile loading with timeout
          this.loadTileOptimized(tile, tileX, tileY, zoom, fastTileSources, () => {
            tilesLoaded++;
            if (tilesLoaded === 1) {
              // Remove loading indicator after first tile loads
              loadingIndicator.remove();
            }
            if (tilesLoaded === totalTiles) {
              console.log(`🛰️ All ${totalTiles} tiles loaded successfully`);
            }
          });
          
          container.appendChild(tile);
        }
      }
    }
    
    // Add map attribution
    const attribution = document.createElement('div');
    attribution.style.cssText = `
      position: absolute;
      bottom: 5px;
      right: 5px;
      font-size: 8px;
      color: rgba(255, 255, 255, 0.9);
      background: rgba(0, 0, 0, 0.7);
      padding: 2px 4px;
      border-radius: 2px;
      z-index: 10;
    `;
    attribution.innerHTML = '🛰️ <a href="https://openstreetmap.org" style="color: #4CAF50;">Map Data</a>';
    container.appendChild(attribution);
    
    console.log(`🛰️ Initiated loading of ${totalTiles} optimized tiles`);
  }

  private loadTileOptimized(tile: HTMLElement, tileX: number, tileY: number, zoom: number, sources: string[], onSuccess: () => void) {
    // Use the fastest, most reliable source first (OpenStreetMap)
    const tileUrl = sources[0].replace('{x}', tileX.toString()).replace('{y}', tileY.toString());
    
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    // Set timeout for faster loading
    const loadTimeout = setTimeout(() => {
      console.warn(`🛰️ Tile loading timeout: ${zoom}/${tileX}/${tileY}`);
      tile.style.backgroundColor = '#001133';
      onSuccess();
    }, 3000); // 3 second timeout
    
    img.onload = () => {
      clearTimeout(loadTimeout);
      tile.style.backgroundImage = `url('${img.src}')`;
      tile.style.backgroundSize = 'cover';
      tile.style.backgroundRepeat = 'no-repeat';
      tile.style.backgroundColor = 'transparent';
      onSuccess();
    };
    
    img.onerror = () => {
      clearTimeout(loadTimeout);
      console.warn(`🛰️ Failed to load tile: ${zoom}/${tileX}/${tileY}`);
      tile.style.backgroundColor = '#001133';
      onSuccess();
    };
    
    img.src = tileUrl;
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

      // Draw line from center to each aircraft
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', centerX.toString());
        line.setAttribute('y1', centerY.toString());
      line.setAttribute('x2', aircraftX.toString());
      line.setAttribute('y2', aircraftY.toString());
      
      // Different line colors for different aircraft types
      const lineColor = aircraft.aircraftType === 'threat' ? '#ff4444' : 
                       aircraft.aircraftType === 'mother' ? '#4488ff' : '#44ff44';
      
      line.setAttribute('stroke', lineColor);
        line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-opacity', '0.5');
        line.setAttribute('stroke-dasharray', '5,5'); // Dashed line
        
        svgOverlay.appendChild(line);
    });

    // Draw lines between friendly aircraft
    for (let i = 0; i < friendlyAircraft.length; i++) {
      for (let j = i + 1; j < friendlyAircraft.length; j++) {
        const aircraft1 = friendlyAircraft[i];
        const aircraft2 = friendlyAircraft[j];
        
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
        
        console.log(`🤝 Connected friendly aircraft: ${aircraft1.aircraft.callSign} ↔ ${aircraft2.aircraft.callSign}`);
      }
    }
    
    console.log(`📡 Drew ${friendlyAircraft.length * (friendlyAircraft.length - 1) / 2} friendly connections`);
  }

  // Position history methods removed since server handles movement

  private convertToCartesian(deltaLat: number, deltaLng: number): { x: number; y: number } {
    // Convert lat/lng degree differences to Cartesian coordinates for 2D graph display
    // Self node is at origin (0,0), other nodes are relative positions
    
    // Scale factor: Adjusted to keep aircraft within visible bounds
    // Smaller scale keeps aircraft closer to center
    const scale = 100; // Reduced scale to keep aircraft on screen
    
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
    // Clear aircraft data
    this.aircraft.clear();
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
