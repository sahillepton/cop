import './index.css';
import mapboxgl from 'mapbox-gl';

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
  isLocked?: boolean; // Whether the aircraft is locked
  isExecuted?: boolean; // Whether the aircraft has been executed
};

// Tactical Display Client (with dummy data)
class TacticalDisplayClient {
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
  private locationUpdateInterval: NodeJS.Timeout | null = null; // Track location display updates
  private motherAircraft: Aircraft | null = null; // Reference to mother aircraft for centering
  private motherLocation: { lat: number; lng: number; heading: number; altitude: number; speed: number; callSign: string } | null = null; // Stored mother location for dialog
  private showMap: boolean = true; // Toggle visibility of background map (enabled by default)
  private mapElement: HTMLElement | null = null; // Reference to map container
  private mapboxMap: mapboxgl.Map | null = null; // Mapbox GL map instance
  private centerMode: 'mother' | 'self' = 'mother'; // Toggle between mother-centered and self-centered view
  private mumbaiLocations = {
    "Mumbai": {
      "districts": [
        {
          "name": "Mumbai City",
          "places": [
            {"name": "Colaba", "lat": 18.9219, "lng": 72.8330},
            {"name": "Cuffe Parade", "lat": 18.9210, "lng": 72.8250},
            {"name": "Marine Drive", "lat": 18.9432, "lng": 72.8238},
            {"name": "Fort", "lat": 18.9320, "lng": 72.8347},
            {"name": "Churchgate", "lat": 18.9365, "lng": 72.8308},
            {"name": "Byculla", "lat": 18.9812, "lng": 72.8312},
            {"name": "Mazgaon", "lat": 18.9720, "lng": 72.8350},
            {"name": "Breach Candy", "lat": 18.9818, "lng": 72.8216},
            {"name": "Parel", "lat": 19.0044, "lng": 72.8406}
          ]
        },
        {
          "name": "Mumbai Suburban",
          "places": [
            {"name": "Andheri", "lat": 19.1196, "lng": 72.8469},
            {"name": "Bandra", "lat": 19.0550, "lng": 72.8400},
            {"name": "Borivali", "lat": 19.2293, "lng": 72.8566},
            {"name": "Dahisar", "lat": 19.2813, "lng": 72.8599},
            {"name": "Goregaon", "lat": 19.1640, "lng": 72.8493},
            {"name": "Jogeshwari", "lat": 19.1350, "lng": 72.8496},
            {"name": "Juhu", "lat": 19.0986, "lng": 72.8266},
            {"name": "Kandivali", "lat": 19.2184, "lng": 72.8569},
            {"name": "Kurla", "lat": 19.0666, "lng": 72.8793},
            {"name": "Malad", "lat": 19.1856, "lng": 72.8486},
            {"name": "Mulund", "lat": 19.1640, "lng": 72.9564},
            {"name": "Santacruz", "lat": 19.0863, "lng": 72.8433},
            {"name": "Vikhroli", "lat": 19.1251, "lng": 72.9279},
            {"name": "Chembur", "lat": 19.0627, "lng": 72.9007},
            {"name": "Bhandup", "lat": 19.1425, "lng": 72.9332},
            {"name": "Powai", "lat": 19.1198, "lng": 72.9106},
            {"name": "Sion", "lat": 19.0597, "lng": 72.8722}
          ]
        }
      ]
    }
  };
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
  private viewMode: 'normal' | 'self-only' = 'normal'; // Toggle between normal view and self-only view
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
    this.initialize();
  }

  private initialize() {
    console.log('🎮 Initializing tactical display with dummy data...');
    
    // Generate node ID
      this.nodeId = this.generateId();
    
    // Set initial location within Mumbai region
    // Mumbai coordinates: Lat 18.9°N to 19.3°N, Lng 72.7°E to 73.1°E
    // Starting in central Mumbai area
    this.currentLat = 19.0 + Math.random() * 0.2; // 19.0°N to 19.2°N (Central Mumbai)
    this.currentLng = 72.8 + Math.random() * 0.2; // 72.8°E to 73.0°E (Central Mumbai)
    
    // Create self aircraft
    const selfAircraft: Aircraft = {
          id: this.nodeId,
          status: 'connected',
          info: 'F-35 Lightning II Client',
          lat: this.currentLat,
          lng: this.currentLng,
      aircraftType: 'self',
          callSign: `LIGHTNING-${Math.floor(Math.random() * 99) + 1}`,
          altitude: 25000 + Math.floor(Math.random() * 10000),
          heading: Math.floor(Math.random() * 360),
      speed: this.getAircraftSpeed('self'),
      totalDistanceCovered: 0,
      lastPosition: { lat: this.currentLat, lng: this.currentLng }
      };
      
    // Add self aircraft
    this.aircraft.set(this.nodeId, selfAircraft);
    console.log('✈️ Self aircraft created:', selfAircraft.callSign);
      
    // Generate dummy aircraft data
    this.generateDummyAircraft();
      
    console.log(`📊 Total aircraft initialized: ${this.aircraft.size}`);
      
    // Start all systems
      this.startLocationUpdates();
      this.startPeriodicMapUpdates();
      this.startContinuousMovement();
      this.startTacticalSimulation();
      
    // Update UI to show all aircraft immediately
      this.updateUI();
  }

  private generateDummyAircraft() {
    // Create mother aircraft (center node) very close to self aircraft
    const motherLat = this.clampToIndiaBounds(this.currentLat + (Math.random() - 0.5) * 0.02, 'lat');
    const motherLng = this.clampToIndiaBounds(this.currentLng + (Math.random() - 0.5) * 0.02, 'lng');
    
    const motherAircraft: Aircraft = {
      id: this.generateId(),
      status: 'connected',
      info: 'Command Aircraft',
      lat: motherLat,
      lng: motherLng,
      aircraftType: 'mother',
      callSign: `MOTHER-${Math.floor(Math.random() * 9) + 1}`,
      altitude: 30000 + Math.floor(Math.random() * 5000),
      heading: Math.floor(Math.random() * 360),
      speed: this.getAircraftSpeed('mother'),
      totalDistanceCovered: 0,
      lastPosition: { lat: motherLat, lng: motherLng }
    };
    
    this.addAircraft(motherAircraft);
    console.log('🎯 Mother aircraft created:', motherAircraft.callSign, `at ${motherLat.toFixed(2)}°N, ${motherLng.toFixed(2)}°E (Mumbai)`);
    
    // Create exactly 4 friendly aircraft positioned around the center within Mumbai
    const friendlyCount = 4;
    for (let i = 0; i < friendlyCount; i++) {
      // Distribute friendly aircraft in different directions for better visibility
      const angle = (i * 90) + (Math.random() - 0.5) * 30; // Spread in 4 quadrants
      const distance = 0.15 + Math.random() * 0.1; // 0.15-0.25 degrees away (~17-28 km)
      const angleRad = (angle * Math.PI) / 180;
      
      const friendlyLat = this.clampToIndiaBounds(this.currentLat + Math.cos(angleRad) * distance, 'lat');
      const friendlyLng = this.clampToIndiaBounds(this.currentLng + Math.sin(angleRad) * distance, 'lng');
      
      const friendlyAircraft: Aircraft = {
        id: this.generateId(),
        status: 'connected',
        info: 'Fighter Aircraft',
        lat: friendlyLat,
        lng: friendlyLng,
        aircraftType: 'friendly',
        callSign: `VIPER-${10 + i + 1}`,
        altitude: 20000 + Math.floor(Math.random() * 15000),
        heading: Math.floor(Math.random() * 360),
        speed: this.getAircraftSpeed('friendly'),
        totalDistanceCovered: 0,
        lastPosition: { lat: friendlyLat, lng: friendlyLng }
      };
      
      this.addAircraft(friendlyAircraft);
      console.log('🤝 Friendly aircraft created:', friendlyAircraft.callSign, `at ${friendlyLat.toFixed(2)}°N, ${friendlyLng.toFixed(2)}°E (Mumbai)`);
    }
    
    // Create exactly 4 threat aircraft positioned around the center within Mumbai
    const threatCount = 4;
    for (let i = 0; i < threatCount; i++) {
      // Distribute threat aircraft in different directions, offset from friendly
      const angle = (i * 90) + 45 + (Math.random() - 0.5) * 30; // Offset by 45° from friendly
      const distance = 0.2 + Math.random() * 0.15; // 0.2-0.35 degrees away (~22-39 km)
      const angleRad = (angle * Math.PI) / 180;
      
      const threatLat = this.clampToIndiaBounds(this.currentLat + Math.cos(angleRad) * distance, 'lat');
      const threatLng = this.clampToIndiaBounds(this.currentLng + Math.sin(angleRad) * distance, 'lng');
      
      const threatAircraft: Aircraft = {
        id: this.generateId(),
        status: 'connected',
        info: 'Hostile Aircraft',
        lat: threatLat,
        lng: threatLng,
        aircraftType: 'threat',
        callSign: `BANDIT-${20 + i + 1}`,
        altitude: 15000 + Math.floor(Math.random() * 20000),
        heading: Math.floor(Math.random() * 360),
        speed: this.getAircraftSpeed('threat'),
        totalDistanceCovered: 0,
        lastPosition: { lat: threatLat, lng: threatLng }
      };
      
      this.addAircraft(threatAircraft);
      this.simulationSystem.activeThreats.add(threatAircraft.id);
      console.log('⚠️ Threat aircraft created:', threatAircraft.callSign, `at ${threatLat.toFixed(2)}°N, ${threatLng.toFixed(2)}°E (Mumbai)`);
    }
  }

  private clampToIndiaBounds(value: number, type: 'lat' | 'lng'): number {
    // Mumbai region boundaries (Greater Mumbai area)
    // Latitude: 18.9°N to 19.3°N (Mumbai region)
    // Longitude: 72.7°E to 73.1°E (Mumbai region)
    if (type === 'lat') {
      return Math.max(18.9, Math.min(19.3, value));
    } else {
      return Math.max(72.7, Math.min(73.1, value));
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
      // Initialize and update mother location in dialog using dedicated function
      this.updateMotherLocationInDialog(
        aircraft.lat,
        aircraft.lng,
        aircraft.heading,
        aircraft.altitude,
        aircraft.speed,
        aircraft.callSign
      );
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
    if (!aircraft) return;
    
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
    
    // IMPORTANT: Update aircraft position immediately to target
    aircraft.lat = targetLat;
    aircraft.lng = targetLng;
    aircraft.heading = targetHeading;
    
    this.aircraft.set(locationData.id, aircraft);
    
    // Update motherAircraft reference if this is the mother aircraft (to keep it in sync)
    if (aircraft.aircraftType === 'mother' || (this.motherAircraft && aircraft.id === this.motherAircraft.id)) {
      this.motherAircraft = aircraft; // Keep reference updated
    }
    
    console.log(`✈️ ${aircraft.callSign} location updated: ${targetLat.toFixed(4)}, ${targetLng.toFixed(4)} | Alt: ${aircraft.altitude}ft, Hdg: ${targetHeading}°, Spd: ${aircraft.speed}kts`);
    
    // Check if this is the mother aircraft and update stored location
    const isMother = (aircraft.aircraftType === 'mother') || (this.motherAircraft && aircraft.id === this.motherAircraft.id);
    
    console.log(`📍 Checking if mother aircraft - ID: ${locationData.id}, Type: ${aircraft.aircraftType}, Mother ID: ${this.motherAircraft?.id}, isMother: ${isMother}`);
    
    if (isMother) {
        console.log(`📍 MOTHER AIRCRAFT UPDATE DETECTED - ID: ${locationData.id}, Type: ${aircraft.aircraftType}`);
        console.log(`📍 Calling updateMotherLocationInDialog() with new location data...`);
        console.log(`📍 Location data: lat=${targetLat.toFixed(4)}, lng=${targetLng.toFixed(4)}, heading=${targetHeading}, alt=${aircraft.altitude}, speed=${aircraft.speed}`);
        
        // ALWAYS update mother location in dialog when location data arrives (even if values are the same)
        // This ensures the dialog is refreshed on every location update
        this.updateMotherLocationInDialog(
          targetLat,
          targetLng,
          targetHeading,
          aircraft.altitude,
          aircraft.speed,
          aircraft.callSign
        );
        
        console.log(`📍 updateMotherLocationInDialog() completed`);
    } else {
        console.log(`📍 Not mother aircraft - skipping dialog update`);
    }
    
    this.updateDebugInfo();
    
    // Set up interpolation for smooth visual movement
    const distance = Math.sqrt(Math.pow(targetLat - startLat, 2) + Math.pow(targetLng - startLng, 2));
    const speedKnots = aircraft.speed;
    const duration = Math.max(100, Math.min(800, (distance * 111000) / (speedKnots * 0.514) * 200));
    
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
    
    // Check for warnings after position update (throttled)
    this.throttledWarningCheck();
    
    // Update threat dialog when aircraft positions change
    this.updateThreatDialog();
    
    // Also update visual position
    this.updateAircraftVisualPosition(locationData.id);
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
    
    // Update stored mother location if this is the mother aircraft
    if (aircraftId === this.motherAircraft?.id && this.motherAircraft) {
      // Check if location actually changed
      const hasChanged = !this.motherLocation || 
        this.motherLocation.lat !== this.motherAircraft.lat ||
        this.motherLocation.lng !== this.motherAircraft.lng ||
        this.motherLocation.heading !== this.motherAircraft.heading ||
        this.motherLocation.altitude !== this.motherAircraft.altitude ||
        this.motherLocation.speed !== this.motherAircraft.speed;
      
      if (hasChanged) {
        // Update mother location in dialog using dedicated function
        this.updateMotherLocationInDialog(
          this.motherAircraft.lat,
          this.motherAircraft.lng,
          this.motherAircraft.heading,
          this.motherAircraft.altitude,
          this.motherAircraft.speed,
          this.motherAircraft.callSign
        );
        console.log(`📍 Mother location changed in visual update - dialog updated`);
      }
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
          padding: 8px;
          margin: 4px 0;
          background: rgba(255, 68, 68, 0.1);
          border-left: 3px solid #ff4444;
          border-radius: 3px;
        `;

        // Top row: Callsign and Distance
        const topRow = document.createElement('div');
        topRow.style.cssText = `
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
        `;

        const callSign = document.createElement('div');
        callSign.style.cssText = `
          font-weight: bold;
          color: #ff4444;
        `;
        callSign.textContent = threat.aircraft.callSign;

        const distance = document.createElement('div');
        distance.style.cssText = `
          font-weight: bold;
          color: #ffaa44;
          font-size: 14px;
        `;
        distance.textContent = `${threat.distanceNM.toFixed(1)}NM`;

        topRow.appendChild(callSign);
        topRow.appendChild(distance);

        // Details row
        const details = document.createElement('div');
        details.style.cssText = `
          font-size: 10px;
          color: #cccccc;
          margin-bottom: 6px;
        `;
        details.textContent = `${threat.aircraft.altitude}ft | ${threat.aircraft.speed}kts | Hdg ${threat.aircraft.heading}°`;

        // Action buttons row
        const actionsRow = document.createElement('div');
        actionsRow.style.cssText = `
          display: flex;
          gap: 5px;
        `;

        const lockBtn = document.createElement('button');
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
        lockBtn.textContent = '🎯 LOCK';
        lockBtn.addEventListener('mouseenter', () => {
          lockBtn.style.background = '#ffaa00';
        });
        lockBtn.addEventListener('mouseleave', () => {
          lockBtn.style.background = '#ff8800';
        });
        lockBtn.addEventListener('click', () => {
          this.lockThreat(threat.aircraft);
        });

        const executeBtn = document.createElement('button');
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
        executeBtn.textContent = '💥 EXECUTE';
        executeBtn.addEventListener('mouseenter', () => {
          executeBtn.style.background = '#ff3333';
        });
        executeBtn.addEventListener('mouseleave', () => {
          executeBtn.style.background = '#ff0000';
        });
        executeBtn.addEventListener('click', () => {
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
    // Local heartbeat (no network communication needed)
    this.heartbeatInterval = setInterval(() => {
        const heartbeatData = {
          type: 'heartbeat',
          payload: {
            id: this.nodeId,
            timestamp: Date.now(),
            status: 'connected'
          }
        };
      console.log('💓 Heartbeat:', heartbeatData);
    }, 5000); // Log heartbeat every 5 seconds
  }

  private startLocationUpdates() {
    // Aircraft location updates disabled - keeping all aircraft in fixed positions
    console.log('📍 Aircraft location updates disabled - all aircraft remain in fixed positions');
  }

  private startPeriodicMapUpdates() {
    // Update map viewpoint regularly while keeping aircraft nodes fixed
    this.mapUpdateInterval = setInterval(() => {
      if (this.showMap) {
        const visualizationArea = document.getElementById('visualization-area');
        if (visualizationArea) {
          this.updateMapPositionSmooth(visualizationArea);
        }
      }
    }, 800); // Update every 800ms for very slow map viewpoint movement
  }

  private startContinuousMovement() {
    // Continuous movement disabled - aircraft remain in fixed positions
    console.log('📍 Continuous movement disabled - aircraft remain static');
  }

  private startTacticalSimulation() {
    // Tactical simulation disabled - aircraft remain in fixed positions
    console.log('📍 Tactical simulation disabled - aircraft remain static');
    
    // Create location display
    this.createLocationDisplay();
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
    // Spawn friendly aircraft in formation within India
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
      lat: this.clampToIndiaBounds(selfAircraft.lat + offsetLat, 'lat'),
      lng: this.clampToIndiaBounds(selfAircraft.lng + offsetLng, 'lng'),
      aircraftType: 'friendly',
      callSign: `FALCON-${Math.floor(Math.random() * 99) + 1}`,
      altitude: 25000 + Math.floor(Math.random() * 5000),
      heading: selfAircraft.heading + (Math.random() - 0.5) * 30,
      speed: this.getAircraftSpeed('friendly')
    };
    
    this.aircraft.set(aircraftId, newAircraft);
    console.log(`✈️ Spawned formation aircraft: ${newAircraft.callSign} at ${newAircraft.lat.toFixed(2)}°N, ${newAircraft.lng.toFixed(2)}°E (India)`);
    this.updateUI();
  }

  private spawnThreatAircraft() {
    // Spawn threat aircraft from random directions within India
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
      lat: this.clampToIndiaBounds(selfAircraft.lat + offsetLat, 'lat'),
      lng: this.clampToIndiaBounds(selfAircraft.lng + offsetLng, 'lng'),
      aircraftType: 'threat',
      callSign: `BANDIT-${Math.floor(Math.random() * 99) + 1}`,
      altitude: 20000 + Math.floor(Math.random() * 15000),
      heading: Math.floor(Math.random() * 360),
      speed: this.getAircraftSpeed('threat')
    };
    
    this.aircraft.set(aircraftId, newAircraft);
    this.simulationSystem.activeThreats.add(aircraftId);
    console.log(`🚨 Spawned threat aircraft: ${newAircraft.callSign} at ${newAircraft.lat.toFixed(2)}°N, ${newAircraft.lng.toFixed(2)}°E (India) - ${distance.toFixed(1)}NM away`);
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
    // Check if location display already exists
    let locationDisplay = document.getElementById('location-display');
    if (locationDisplay) {
      console.log('📍 Location display already exists, skipping creation');
      return;
    }
    
    locationDisplay = document.createElement('div');
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
    
    // Set up periodic updates (every 100ms) to check for mother location changes and update dialog
    if (this.locationUpdateInterval) {
      clearInterval(this.locationUpdateInterval);
      this.locationUpdateInterval = null;
    }
    
    this.locationUpdateInterval = setInterval(() => {
      // Check if mother aircraft exists and location has changed
      if (this.motherAircraft) {
        const hasChanged = !this.motherLocation || 
          this.motherLocation.lat !== this.motherAircraft.lat ||
          this.motherLocation.lng !== this.motherAircraft.lng ||
          this.motherLocation.heading !== this.motherAircraft.heading ||
          this.motherLocation.altitude !== this.motherAircraft.altitude ||
          this.motherLocation.speed !== this.motherAircraft.speed;
        
        if (hasChanged) {
          console.log('📍 Periodic check: Mother location changed, calling updateMotherLocationInDialog()');
          this.updateMotherLocationInDialog(
            this.motherAircraft.lat,
            this.motherAircraft.lng,
            this.motherAircraft.heading,
            this.motherAircraft.altitude,
            this.motherAircraft.speed,
            this.motherAircraft.callSign
          );
        }
      } else if (this.motherLocation) {
        // Fallback: just update display if motherLocation exists but no motherAircraft reference
        this.updateLocationDisplay();
      }
    }, 100); // Check every 100ms for location changes
    
    console.log('📍 Location display created and periodic update interval started (100ms checks)');
  }

  private getLocationInfo(lat: number, lng: number): { country: string; state: string; place: string } {
    // Improved geographic determination based on precise coordinates
    let country = 'Unknown';
    let state = 'Unknown';
    let place = 'Unknown';
    
    // United States (more precise)
    if (lat >= 24 && lat <= 49 && lng >= -125 && lng <= -66) {
      country = 'United States';
      if (lat >= 32 && lat <= 42 && lng >= -125 && lng <= -114) {
        state = 'California';
        place = lat >= 34 ? 'Northern California' : 'Southern California';
      } else if (lat >= 25 && lat <= 31 && lng >= -97 && lng <= -80) {
        state = 'Florida';
        place = 'Sunshine State';
      } else if (lat >= 25 && lat <= 37 && lng >= -107 && lng <= -93) {
        state = 'Texas';
        place = 'Lone Star State';
      } else if (lat >= 36 && lat <= 42 && lng >= -80 && lng <= -71) {
        state = 'New York';
        place = 'Empire State';
      } else if (lat >= 35 && lat <= 42 && lng >= -120 && lng <= -114) {
        state = 'Nevada';
        place = 'Silver State';
      } else {
        state = 'Continental US';
        place = 'United States';
      }
    }
    // Spain
    else if (lat >= 36 && lat <= 44 && lng >= -10 && lng <= 4) {
      country = 'Spain';
      state = 'Kingdom of Spain';
      place = 'Iberian Peninsula';
    }
    // France
    else if (lat >= 42 && lat <= 51 && lng >= -5 && lng <= 10) {
      country = 'France';
      state = 'French Republic';
      place = 'Western Europe';
    }
    // Germany
    else if (lat >= 47 && lat <= 55 && lng >= 6 && lng <= 15) {
      country = 'Germany';
      state = 'Federal Republic';
      place = 'Central Europe';
    }
    // Italy
    else if (lat >= 36 && lat <= 47 && lng >= 6 && lng <= 19) {
      country = 'Italy';
      state = 'Italian Republic';
      place = 'Italian Peninsula';
    }
    // United Kingdom
    else if (lat >= 49 && lat <= 61 && lng >= -8 && lng <= 2) {
      country = 'United Kingdom';
      state = 'Great Britain';
      place = 'British Isles';
    }
    // Poland
    else if (lat >= 49 && lat <= 55 && lng >= 14 && lng <= 24) {
      country = 'Poland';
      state = 'Republic of Poland';
      place = 'Eastern Europe';
    }
    // Turkey
    else if (lat >= 36 && lat <= 42 && lng >= 26 && lng <= 45) {
      country = 'Turkey';
      state = 'Turkish Republic';
      place = 'Anatolia';
    }
    // Saudi Arabia
    else if (lat >= 16 && lat <= 32 && lng >= 34 && lng <= 56) {
      country = 'Saudi Arabia';
      state = 'Kingdom of Saudi Arabia';
      place = 'Arabian Peninsula';
    }
    // UAE
    else if (lat >= 22 && lat <= 26 && lng >= 51 && lng <= 57) {
      country = 'United Arab Emirates';
      state = 'UAE';
      place = 'Persian Gulf';
    }
    // Egypt
    else if (lat >= 22 && lat <= 32 && lng >= 24 && lng <= 37) {
      country = 'Egypt';
      state = 'Arab Republic of Egypt';
      place = 'Nile Region';
    }
    // India - Mumbai region with specific location names
    else if (lat >= 8 && lat <= 35 && lng >= 68 && lng <= 97) {
      country = 'India';
      state = 'Maharashtra';
      
      // Check if within Mumbai region and find specific location
      if (lat >= 18.9 && lat <= 19.3 && lng >= 72.7 && lng <= 73.1) {
        place = this.findNearestMumbaiLocation(lat, lng);
      } else {
        place = 'Indian Subcontinent';
      }
    }
    // China
    else if (lat >= 18 && lat <= 54 && lng >= 73 && lng <= 135) {
      country = 'China';
      state = 'People\'s Republic';
      place = 'East Asia';
    }
    // Japan
    else if (lat >= 24 && lat <= 46 && lng >= 123 && lng <= 146) {
      country = 'Japan';
      state = 'Japanese Islands';
      place = 'East Asia';
    }
    // South Korea
    else if (lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132) {
      country = 'South Korea';
      state = 'Republic of Korea';
      place = 'Korean Peninsula';
    }
    // Thailand
    else if (lat >= 5 && lat <= 21 && lng >= 97 && lng <= 106) {
      country = 'Thailand';
      state = 'Kingdom of Thailand';
      place = 'Southeast Asia';
    }
    // Australia
    else if (lat >= -44 && lat <= -10 && lng >= 113 && lng <= 154) {
      country = 'Australia';
      state = 'Commonwealth of Australia';
      place = 'Australian Continent';
    }
    // South Africa
    else if (lat >= -35 && lat <= -22 && lng >= 16 && lng <= 33) {
      country = 'South Africa';
      state = 'Republic of South Africa';
      place = 'Southern Africa';
    }
    // Brazil
    else if (lat >= -34 && lat <= 5 && lng >= -74 && lng <= -34) {
      country = 'Brazil';
      state = 'Federative Republic';
      place = 'South America';
    }
    // Argentina
    else if (lat >= -55 && lat <= -21 && lng >= -74 && lng <= -53) {
      country = 'Argentina';
      state = 'Argentine Republic';
      place = 'South America';
    }
    // Canada
    else if (lat >= 41 && lat <= 84 && lng >= -141 && lng <= -52) {
      country = 'Canada';
      state = 'Canadian Territory';
      place = 'North America';
    }
    // Russia
    else if (lat >= 41 && lat <= 82 && lng >= 19 && lng <= 180) {
      country = 'Russia';
      state = 'Russian Federation';
      place = 'Eurasia';
    }
    else {
      country = 'International Airspace';
      state = 'Unidentified Region';
      place = 'Remote Area';
    }
    
    return { country, state, place };
  }

  private getCurrentAircraftPosition(aircraftId: string): { lat: number; lng: number; heading: number } | null {
    const aircraft = this.aircraft.get(aircraftId);
    if (!aircraft) return null;
    
    // Since aircraft positions are updated immediately when location updates arrive,
    // we can directly use the aircraft's current position
    return { lat: aircraft.lat, lng: aircraft.lng, heading: aircraft.heading };
  }

  private updateMotherLocationInDialog(lat: number, lng: number, heading: number, altitude: number, speed: number, callSign: string) {
    console.log(`📍 updateMotherLocationInDialog() CALLED with:`, { lat, lng, heading, altitude, speed, callSign });
    
    // Update the stored mother location variable
    this.motherLocation = {
      lat: lat,
      lng: lng,
      heading: heading,
      altitude: altitude,
      speed: speed,
      callSign: callSign
    };
    
    console.log(`📍 Mother location variable updated: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    
    // Update the dialog display
    this.updateLocationDisplay();
    console.log(`📍 updateLocationDisplay() called from updateMotherLocationInDialog`);
  }

  private updateLocationDisplay() {
    console.log('📍 updateLocationDisplay() called');
    console.log('📍 motherLocation:', this.motherLocation);
    
    // FIRST: Remove old dialog from document if it exists
    const existingDisplay = document.getElementById('location-display');
    if (existingDisplay) {
      console.log('📍 Removing old dialog from document');
      existingDisplay.remove();
      console.log('📍 Old dialog removed');
    } else {
      console.log('📍 No existing dialog found to remove');
    }
    
    // Use stored mother location variable
    if (!this.motherLocation) {
      console.log('📍 No motherLocation stored, trying to initialize from aircraft...');
      // Try to initialize from mother aircraft if available 
      const motherAircraft = this.motherAircraft || this.aircraft.get(this.nodeId);
      if (motherAircraft) {
        this.motherLocation = {
          lat: motherAircraft.lat,
          lng: motherAircraft.lng,
          heading: motherAircraft.heading,
          altitude: motherAircraft.altitude,
          speed: motherAircraft.speed,
          callSign: motherAircraft.callSign
        };
        console.log('📍 Initialized motherLocation from aircraft:', this.motherLocation);
      } else {
        console.log('📍 No mother aircraft available - dialog already removed');
        return;
      }
    }
    
    // Get location info from stored coordinates
    console.log('📍 Getting location info for:', this.motherLocation.lat, this.motherLocation.lng);
    const location = this.getLocationInfo(this.motherLocation.lat, this.motherLocation.lng);
    console.log('📍 Location info:', location);
    
    // THEN: Create and add new dialog with updated location
    console.log('📍 Creating new dialog element...');
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
    console.log('📍 Dialog element created with styles');
    
    // Set all the content with new location data
    const dialogContent = `
      <div style="color: #00ffff; font-weight: bold; margin-bottom: 5px;">📍 MOTHER LOCATION</div>
      <div><strong>Aircraft:</strong> ${this.motherLocation.callSign}</div>
      <div><strong>Country:</strong> ${location.country}</div>
      <div><strong>State/Region:</strong> ${location.state}</div>
      <div><strong>Place:</strong> ${location.place}</div>
      <hr style="border: 1px solid #333; margin: 8px 0;">
      <div style="color: #aaa; font-size: 10px;">
        Position: ${this.motherLocation.lat.toFixed(4)}°, ${this.motherLocation.lng.toFixed(4)}°
      </div>
      <div style="color: #aaa; font-size: 10px; margin-top: 4px;">
        Alt: ${this.motherLocation.altitude}ft | Hdg: ${this.motherLocation.heading.toFixed(0)}° | Spd: ${this.motherLocation.speed}kts
      </div>
    `;
    locationDisplay.innerHTML = dialogContent;
    console.log('📍 Dialog content set:', dialogContent.substring(0, 100) + '...');
    
    // Append new dialog to body
    console.log('📍 Appending dialog to body...');
    document.body.appendChild(locationDisplay);
    console.log('📍 Dialog appended to body');
    
    // Verify it was added
    const verifyDialog = document.getElementById('location-display');
    if (verifyDialog) {
      console.log('✅ Dialog successfully added to DOM');
    } else {
      console.error('❌ Dialog was NOT added to DOM!');
    }
  }

  private endSimulation() {
    this.simulationSystem.isRunning = false;
    console.log('🎯 Simulation completed!');
    
    // Remove simulation UI
    const simUI = document.getElementById('simulation-ui');
    if (simUI) {
      simUI.remove();
    }
    
    // Clear location update interval
    if (this.locationUpdateInterval) {
      clearInterval(this.locationUpdateInterval);
      this.locationUpdateInterval = null;
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
    // Continuous movement disabled - aircraft remain in fixed positions
    // Only update connection lines to maintain visual relationships
    
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
    // Update map viewpoint regularly while keeping aircraft nodes fixed
    if (!this.mapboxMap) {
      // Create map for the first time if it doesn't exist
      this.createMapBackground(visualizationArea);
      return;
    }

    // Generate regular map viewpoint movement within Mumbai boundaries
    const time = Date.now() * 0.0001; // Slow time factor for smooth movement
    
    // Create a circular/elliptical movement pattern for the map viewpoint
    const centerLat = 19.1; // Central Mumbai latitude
    const centerLng = 72.9; // Central Mumbai longitude
    const radiusLat = 0.15; // Movement radius in latitude (Mumbai area)
    const radiusLng = 0.15; // Movement radius in longitude (Mumbai area)
    
    // Calculate new map center position with smooth circular movement
    const newLat = centerLat + Math.sin(time) * radiusLat;
    const newLng = centerLng + Math.cos(time * 0.7) * radiusLng; // Different frequency for elliptical pattern
    
    // Clamp to Mumbai boundaries
    const clampedLat = this.clampToIndiaBounds(newLat, 'lat');
    const clampedLng = this.clampToIndiaBounds(newLng, 'lng');

    // Smoothly pan map to new viewpoint position
    this.mapboxMap.easeTo({
      center: [clampedLng, clampedLat],
      duration: 200, // Smooth movement duration
      essential: true
    });
    
    // Location labels removed - only showing in dialog
    
    console.log(`🗺️ Map viewpoint updated: ${clampedLat.toFixed(6)}°N, ${clampedLng.toFixed(6)}°E (Mumbai)`);
  }

  // Removed artificial continuous movement - aircraft now move naturally based on real position updates

  // Mapbox GL handles tile updates automatically - no need for manual tile management

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
      cursor: default;
      user-select: none;
    `;

    container.appendChild(visualizationArea);

    // Drag functionality disabled
    // this.addDragFunctionality(visualizationArea);

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

    // Grid removed - only create radar circles
    this.createAdaptiveRadarCircles(visualizationArea);

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
      
      // Filter aircraft based on view mode
      if (this.viewMode === 'self-only' && aircraft.aircraftType !== 'self') {
        console.log(`🎨 Skipping non-self aircraft in self-only mode: ${aircraft.callSign}`);
        return; // Skip non-self aircraft in self-only mode
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
      
      // Apply extra styling for threat aircraft to make them more visible
      if (aircraft.aircraftType === 'threat') {
        aircraftElement.style.filter = 'brightness(1.5)';
        const iconContainer = aircraftElement.querySelector('[data-icon-type="threat"]') as HTMLElement;
        if (iconContainer) {
          iconContainer.style.animation = 'pulse 1s infinite';
        }
      }
      
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
    
    // Ensure location display is created if it doesn't exist
    let locationDisplay = document.getElementById('location-display');
    if (!locationDisplay) {
      this.createLocationDisplay();
    } else {
      // Update location display when UI is updated
      this.updateLocationDisplay();
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

    // View mode buttons
    const button101 = document.createElement('button');
    button101.textContent = '101';
    button101.style.cssText = `
      width: 40px;
      height: 30px;
      background: ${this.viewMode === 'normal' ? '#44ff44' : '#333'};
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

    button101.addEventListener('click', () => {
      this.setViewMode('normal');
    });

    button101.addEventListener('mouseenter', () => {
      button101.style.opacity = '0.8';
    });

    button101.addEventListener('mouseleave', () => {
      button101.style.opacity = '1';
    });

    // Add data attribute for identification
    button101.setAttribute('data-view-mode', '101');

    const button102 = document.createElement('button');
    button102.textContent = '102';
    button102.style.cssText = `
      width: 40px;
      height: 30px;
      background: ${this.viewMode === 'self-only' ? '#ff8844' : '#333'};
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

    button102.addEventListener('click', () => {
      this.setViewMode('self-only');
    });

    button102.addEventListener('mouseenter', () => {
      button102.style.opacity = '0.8';
    });

    button102.addEventListener('mouseleave', () => {
      button102.style.opacity = '1';
    });

    // Add data attribute for identification
    button102.setAttribute('data-view-mode', '102');

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
    
    console.log('Zoom controls added to sidebar');
  }

  private setViewMode(mode: 'normal' | 'self-only') {
    console.log(`🔄 Switching to view mode: ${mode}`);
    this.viewMode = mode;
    
    // Update UI to reflect the new view mode
    this.updateUI();
    
    // Update button colors in sidebar
    const button101 = document.querySelector('button[data-view-mode="101"]') as HTMLElement;
    const button102 = document.querySelector('button[data-view-mode="102"]') as HTMLElement;
    
    if (button101) {
      button101.style.background = mode === 'normal' ? '#44ff44' : '#333';
    }
    if (button102) {
      button102.style.background = mode === 'self-only' ? '#ff8844' : '#333';
    }
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
    
    // Threat aircraft get larger icons for better visibility
    const fixedSize = aircraft.aircraftType === 'threat' ? 24 : 20; // Threats are 24px, others 20px
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
    this.createAircraftIcon(aircraftElement, aircraft.aircraftType, fixedSize, aircraft);
    
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
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
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

  private createAircraftIcon(container: HTMLElement, aircraftType: AircraftType, size: number, aircraft?: Aircraft) {
    // Always create a fallback icon first as the primary icon
    // This ensures aircraft are always visible regardless of SVG loading issues
    this.createFallbackIcon(container, aircraftType, size, aircraft);
    
    // Load appropriate SVG icon based on aircraft state
    let iconFile = '';
    if (aircraft?.isLocked) {
      // Use alert icon for locked aircraft
      iconFile = 'alert.svg';
    } else {
      // Use normal aircraft icons for unlocked aircraft
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
    }
    
    // Create image element for the SVG icon
    const iconElement = document.createElement('img');
    iconElement.src = `icons/${iconFile}`;
    iconElement.alt = `${aircraftType} aircraft`;
    
    // Apply glow effects and styling
    let glowFilter = '';
    if (aircraft?.isLocked) {
      // Orange glow for locked aircraft
      glowFilter = `drop-shadow(0 0 8px #ffaa00) drop-shadow(0 0 16px #ff8800)`;
    } else if (aircraftType === 'mother') {
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
  
  private createFallbackIcon(container: HTMLElement, aircraftType: AircraftType, size: number, aircraft?: Aircraft) {
    // Create a simple fallback icon if the image fails to load
    const fallbackElement = document.createElement('div');
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
    
    // Add letter/symbol based on aircraft type and lock state
    if (aircraft?.isLocked) {
      // Use alert icon for locked aircraft instead of emoji
      const alertIcon = document.createElement('img');
      alertIcon.src = 'icons/alert.svg';
      alertIcon.alt = 'Locked aircraft';
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
      fallbackElement.setAttribute('data-icon-type', 'locked');
      fallbackElement.style.background = 'transparent'; // No background for locked
    } else {
      switch (aircraftType) {
        case 'mother':
          fallbackElement.textContent = 'M';
          fallbackElement.setAttribute('data-icon-type', 'mother');
          break;
        case 'self':
          fallbackElement.textContent = '★'; // Star for self aircraft
          fallbackElement.setAttribute('data-icon-type', 'self');
          break;
        case 'friendly':
          fallbackElement.textContent = 'F';
          fallbackElement.setAttribute('data-icon-type', 'friendly');
          break;
        case 'threat':
          fallbackElement.textContent = '⚠'; // Warning symbol for threats
          fallbackElement.setAttribute('data-icon-type', 'threat');
          console.log(`⚠️ Creating THREAT icon with warning symbol`);
          break;
        default:
          fallbackElement.textContent = '?';
          fallbackElement.setAttribute('data-icon-type', 'unknown');
          break;
      }
    }

    container.appendChild(fallbackElement);
    console.log(`✅ Created fallback icon for ${aircraftType}, symbol: "${fallbackElement.textContent}", color: ${color}`);
    console.log(`🔍 Fallback element:`, fallbackElement);
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
    
    // Threat action buttons (Lock and Execute)
    const threatActions = aircraft.aircraftType === 'threat' ? `
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
    ` : '';
    
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
    
    // Add event listeners for threat actions if this is a threat aircraft
    if (aircraft.aircraftType === 'threat') {
      const lockBtn = document.getElementById('lock-threat-btn');
      const executeBtn = document.getElementById('execute-threat-btn');
      
      if (lockBtn) {
        lockBtn.addEventListener('mouseenter', () => {
          lockBtn.style.background = '#ffaa00';
          lockBtn.style.transform = 'scale(1.05)';
        });
        lockBtn.addEventListener('mouseleave', () => {
          lockBtn.style.background = '#ff8800';
          lockBtn.style.transform = 'scale(1)';
        });
        lockBtn.addEventListener('click', () => {
          this.lockThreat(aircraft);
          details.remove();
        });
      }
      
      if (executeBtn) {
        executeBtn.addEventListener('mouseenter', () => {
          executeBtn.style.background = '#ff3333';
          executeBtn.style.transform = 'scale(1.05)';
        });
        executeBtn.addEventListener('mouseleave', () => {
          executeBtn.style.background = '#ff0000';
          executeBtn.style.transform = 'scale(1)';
        });
        executeBtn.addEventListener('click', () => {
          this.executeThreat(aircraft);
          details.remove();
        });
      }
    }
  }

  private lockThreat(aircraft: Aircraft) {
    console.log(`🎯 LOCKING TARGET: ${aircraft.callSign}`);
    
    // Set aircraft as locked
    aircraft.isLocked = true;
    
    // Change lock button icon to show locked state
    const lockButtons = document.querySelectorAll('button');
    lockButtons.forEach(button => {
      if (button.textContent?.includes('LOCK')) {
        button.textContent = '🔒 LOCKED';
        button.style.background = '#00ff00';
        button.style.color = '#000000';
        button.style.fontWeight = 'bold';
        
        // Reset button after 3 seconds
        setTimeout(() => {
          button.textContent = '🎯 LOCK';
          button.style.background = '#ff8800';
          button.style.color = '#ffffff';
          button.style.fontWeight = 'normal';
        }, 3000);
      }
    });
    
    // Create lock notification
    const notification = document.createElement('div');
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
    
    // Mark aircraft as locked (visual indicator)
    const aircraftElement = document.querySelector(`[data-aircraft-id="${aircraft.id}"]`) as HTMLElement;
    if (aircraftElement) {
      aircraftElement.style.boxShadow = '0 0 30px #ffaa00, 0 0 50px #ff8800';
      aircraftElement.style.border = '3px solid #ffaa00';
      
      // Update the aircraft icon to show lock symbol
      this.updateAircraftIcon(aircraftElement, aircraft);
    }
    
    // Update connection lines to reflect locked state
    this.updateConnectionLines();
    
    // Remove notification after 2 seconds
    setTimeout(() => {
      notification.remove();
    }, 2000);
    
    console.log(`✅ Target ${aircraft.callSign} locked successfully`);
  }

  private executeThreat(aircraft: Aircraft) {
    console.log(`💥 EXECUTING TARGET: ${aircraft.callSign}`);
    
    // Set aircraft as executed
    aircraft.isExecuted = true;
    
    // Change execute button icon to show executed state
    const executeButtons = document.querySelectorAll('button');
    executeButtons.forEach(button => {
      if (button.textContent?.includes('EXECUTE')) {
        button.textContent = '✅ EXECUTED';
        button.style.background = '#00ff00';
        button.style.color = '#000000';
        button.style.fontWeight = 'bold';
        
        // Reset button after 3 seconds
        setTimeout(() => {
          button.textContent = '💥 EXECUTE';
          button.style.background = '#ff0000';
          button.style.color = '#ffffff';
          button.style.fontWeight = 'normal';
        }, 3000);
      }
    });
    
    // Create execute notification
    const notification = document.createElement('div');
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
    
    // Remove aircraft from the map with proper highlighting
    const aircraftElement = document.querySelector(`[data-aircraft-id="${aircraft.id}"]`) as HTMLElement;
    if (aircraftElement) {
      // Highlight the aircraft before removal
      aircraftElement.style.boxShadow = '0 0 30px #ff0000, 0 0 50px #ff0000';
      aircraftElement.style.border = '3px solid #ff0000';
      aircraftElement.style.background = '#ff0000';
      aircraftElement.style.opacity = '0.8';
      
      // Remove after highlighting
      setTimeout(() => {
        aircraftElement.remove();
      }, 1000);
    }
    
    // Update connection lines to reflect executed state before removal
    this.updateConnectionLines();
    
    // Remove aircraft from data
    this.aircraft.delete(aircraft.id);
    this.simulationSystem.activeThreats.delete(aircraft.id);
    this.simulationSystem.engagementCount++;
    
    // Update UI to reflect removal
    setTimeout(() => {
      this.updateUI();
    }, 600);
    
    // Remove notification after 2 seconds
    setTimeout(() => {
      notification.remove();
    }, 2000);
    
    console.log(`✅ Target ${aircraft.callSign} eliminated successfully`);
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

    // Auto-adjust zoom disabled - zoom level stays fixed
    // this.adjustZoomForAllAircraft(maxDistance);

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
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        text-rendering: optimizeLegibility;
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

    // Auto-adjust zoom disabled - zoom level stays fixed
    // this.adjustZoomForAllAircraft(maxDistance);
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

    // Check if map already exists - don't recreate
    const existingMap = visualizationArea.querySelector('#map-background') as HTMLElement;
    if (existingMap) {
      return;
    }

    const mapContainer = document.createElement('div');
    mapContainer.id = 'map-background';
    
    // Store the EXACT center position for smooth tracking (clamped to Mumbai)
    const lat = this.clampToIndiaBounds(centerAircraft.lat, 'lat');
    const lng = this.clampToIndiaBounds(centerAircraft.lng, 'lng');
    
    console.log(`🗺️ Creating Mapbox GL map centered on: ${centerAircraft.callSign} at ${lat.toFixed(6)}, ${lng.toFixed(6)} (Mumbai)`);
    
    mapContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 0;
      opacity: 0.8;
    `;
    
    visualizationArea.appendChild(mapContainer);
    this.mapElement = mapContainer;
    
    // Initialize Mapbox GL map
    this.initializeMapboxMap(mapContainer, lat, lng);
  }

  private initializeMapboxMap(container: HTMLElement, lat: number, lng: number) {
    // Set Mapbox access token (you can use a public token or set your own)
    mapboxgl.accessToken = 'pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw';
    
    // Create Mapbox GL map
    this.mapboxMap = new mapboxgl.Map({
      container: container,
      style: {
        version: 8,
        sources: {
          'local-tiles': {
            type: 'raster',
            tiles: ['./tile-final/{z}/{x}/{y}.png'],
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

  // Old tile-based map system removed - now using Mapbox GL
  private createBlueMarbleTileMap(container: HTMLElement, centerLat: number, centerLng: number, zoom: number) {
    // This method is no longer used - Mapbox GL handles map rendering
    console.log('🗺️ Old tile-based map system disabled - using Mapbox GL instead');
  }

  // Map labels removed - location information shown only in dialog

  private findNearestMumbaiLocation(lat: number, lng: number): string {
    let nearestLocation = 'Mumbai';
    let minDistance = Infinity;
    
    const mumbaiData = this.mumbaiLocations.Mumbai;
    
    mumbaiData.districts.forEach(district => {
      district.places.forEach(place => {
        // Calculate distance using simple Euclidean distance
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
      
      // Filter aircraft based on view mode
      if (this.viewMode === 'self-only' && aircraft.aircraftType !== 'self') {
        return; // Skip non-self aircraft in self-only mode
      }

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
      
      // Different line colors for different aircraft types and states
      let lineColor: string;
      if (aircraft.isExecuted) {
        lineColor = '#ff0000'; // Red for executed aircraft
      } else if (aircraft.isLocked) {
        lineColor = '#ffaa00'; // Orange for locked aircraft
      } else {
        lineColor = aircraft.aircraftType === 'threat' ? '#ff4444' : 
                   aircraft.aircraftType === 'mother' ? '#4488ff' : 
                   aircraft.aircraftType === 'self' ? '#FFD700' : '#44ff44';
      }
      
      line.setAttribute('stroke', lineColor);
      
      // Enhanced styling for locked aircraft
      if (aircraft.isLocked) {
        line.setAttribute('stroke-width', '4'); // Thicker line for locked aircraft
        line.setAttribute('stroke-opacity', '0.9'); // Higher opacity for locked aircraft
        line.setAttribute('stroke-dasharray', 'none'); // Solid line for locked aircraft
      } else {
        line.setAttribute('stroke-width', '2');
        line.setAttribute('stroke-opacity', '0.5');
        line.setAttribute('stroke-dasharray', '5,5'); // Dashed line
      }
      
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
      distanceLabel.setAttribute('style', '-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility;');
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
        friendlyDistanceLabel.setAttribute('style', '-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility;');
        friendlyDistanceLabel.textContent = `${friendlyDistanceNM}NM`;
        
        svgOverlay.appendChild(friendlyDistanceLabel);
        
        console.log(`🤝 Connected friendly aircraft: ${aircraft1.aircraft.callSign} ↔ ${aircraft2.aircraft.callSign} (${friendlyDistanceNM}NM)`);
      }
    }
    
    console.log(`📡 Drew ${friendlyAircraft.length * (friendlyAircraft.length - 1) / 2} friendly connections`);
  }

  private updateAircraftIcon(aircraftElement: HTMLElement, aircraft: Aircraft) {
    // Clear existing icons
    const existingIcons = aircraftElement.querySelectorAll('[data-icon-type]');
    existingIcons.forEach(icon => icon.remove());
    
    // Get the size from the aircraft element
    const size = aircraft.aircraftType === 'threat' ? 24 : 20;
    
    // Recreate the icon with updated state
    this.createAircraftIcon(aircraftElement, aircraft.aircraftType, size, aircraft);
  }

  private updateConnectionLines() {
    // Find the visualization area and center aircraft
    const visualizationArea = document.querySelector('#nodes-container') as HTMLElement;
    if (!visualizationArea) return;
    
    const centerAircraft = this.motherAircraft;
    if (!centerAircraft) return;
    
    // Redraw connection lines with updated colors
    this.drawConnectionLines(visualizationArea, centerAircraft);
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
    
    // Calculate new geographic center based on pan offset (clamped to India)
    const newCenterLat = this.clampToIndiaBounds(storedLat + geoOffsetLat, 'lat');
    const newCenterLng = this.clampToIndiaBounds(storedLng + geoOffsetLng, 'lng');
    
    // Update the stored center position (always within India)
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
      const messageData = {
        type: 'message',
        payload: {
          id: this.nodeId,
          message: message
        }
      };
    console.log('📤 Local message:', messageData);
  }

  public disconnect() {
    console.log('🛑 Disconnecting and cleaning up...');
    
    // Clear all intervals and timeouts
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

// Initialize Tactical Display Client when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const tacticalClient = new TacticalDisplayClient();
  
  // Add cleanup functionality
  window.addEventListener('beforeunload', () => {
    tacticalClient.disconnect();
  });
});
