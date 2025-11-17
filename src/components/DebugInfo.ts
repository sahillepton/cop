import { Aircraft } from "../types";

export class DebugInfo {
  public create(
    container: HTMLElement,
    aircraft: Map<string, Aircraft>,
    nodeId: string
  ): void {
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

    const selfAircraft = aircraft.get(nodeId);
    const threatCount = Array.from(aircraft.values()).filter(
      (a) => a.aircraftType === "threat"
    ).length;
    const motherCount = Array.from(aircraft.values()).filter(
      (a) => a.aircraftType === "mother"
    ).length;
    const friendlyCount = Array.from(aircraft.values()).filter(
      (a) => a.aircraftType === "friendly"
    ).length;

    container.appendChild(debugInfo);
  }
}
