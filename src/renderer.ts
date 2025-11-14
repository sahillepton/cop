import { Aircraft, MapManager } from "./map";


// Run when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const visualizationArea = document.getElementById('nodes-container');
  if (!visualizationArea) {
    console.warn('nodes-container element not found');
    return;
  }

  // Fake aircraft with coordinates (replace with real UDP data later)
  const aircraft: Aircraft = {
    aircraftType: "friendly",
    callSign: "INDIA-1",
    id: "DEL-001",
    lat: 28.6139,
    lng: 77.2090
  };
  
  // Create MapManager instance
  const mapManager = new MapManager();

  // Create the map background
  mapManager.createMapBackground(visualizationArea, aircraft);

  console.log("Map initialized");
});
