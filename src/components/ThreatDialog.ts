import { Aircraft } from "../types";

type ThreatWithDistance = {
  aircraft: Aircraft;
  distance: number;
  distanceNM: number;
};

export class ThreatDialog {
  private showThreatDialog: boolean = true;
  private onLockThreat: (aircraft: Aircraft) => void;
  private onExecuteThreat: (aircraft: Aircraft) => void;

  constructor(
    onLockThreat: (aircraft: Aircraft) => void,
    onExecuteThreat: (aircraft: Aircraft) => void
  ) {
    this.onLockThreat = onLockThreat;
    this.onExecuteThreat = onExecuteThreat;
  }

  public create(): HTMLElement {
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

  public update(nearestThreats: ThreatWithDistance[]): void {
    if (!this.showThreatDialog) return;

    const threatList = document.getElementById("threat-list");
    if (!threatList) {
      this.create();
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
      nearestThreats.forEach((threat) => {
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
          this.onLockThreat(threat.aircraft);
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
          this.onExecuteThreat(threat.aircraft);
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

  public toggle(): boolean {
    this.showThreatDialog = !this.showThreatDialog;
    console.log(
      `Threat dialog visibility: ${this.showThreatDialog ? "SHOW" : "HIDE"}`
    );

    const threatDialog = document.getElementById("threat-dialog");
    if (threatDialog) {
      threatDialog.style.display = this.showThreatDialog ? "block" : "none";
    } else if (this.showThreatDialog) {
      this.create();
    }

    const buttons = document.querySelectorAll("button");
    buttons.forEach((button) => {
      if (button.textContent === "THRT") {
        button.style.background = this.showThreatDialog ? "#ff4444" : "#333";
        button.style.opacity = this.showThreatDialog ? "1" : "0.5";
      }
    });

    return this.showThreatDialog;
  }

  public isVisible(): boolean {
    return this.showThreatDialog;
  }
}
