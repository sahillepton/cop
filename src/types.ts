export type AircraftType = "mother" | "friendly" | "threat" | "self";

export type Aircraft = {
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

