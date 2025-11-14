export interface Opcode101A {
    globalId: number;
    latitude: number;
    longitude: number;
    altitude: number;
    veIn: number;
    veIe: number;
    veIu: number;
    trueHeading: number;
    reserved: number;
  }
  
export  interface Opcode104A {
    globalId: number;
    latitude: number;
    longitude: number;
    altitude: number;
    heading: number;
    groundSpeed: number;
  }