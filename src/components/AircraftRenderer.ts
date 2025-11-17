import { Aircraft, AircraftType } from "../types";

export class AircraftRenderer {
  private onAircraftClick: (aircraft: Aircraft) => void;

  constructor(onAircraftClick: (aircraft: Aircraft) => void) {
    this.onAircraftClick = onAircraftClick;
  }

  public createAircraftElement(
    aircraft: Aircraft,
    isCenter: boolean
  ): HTMLElement {
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
      this.onAircraftClick(aircraft);
    });

    return aircraftElement;
  }

  private createAircraftIcon(
    container: HTMLElement,
    aircraftType: AircraftType,
    size: number,
    aircraft?: Aircraft
  ): void {
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
  ): void {
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

  public updateAircraftIcon(
    aircraftElement: HTMLElement,
    aircraft: Aircraft
  ): void {
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
}
