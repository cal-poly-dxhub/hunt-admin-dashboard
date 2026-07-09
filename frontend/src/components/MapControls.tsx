import { useState, useEffect } from "react";
import type { Coord } from "../lib/api";
import ducks from "../data/ducks.json";

interface Props {
  mapRef: React.RefObject<any>;
  mapLoaded: boolean;
  coordsData: Map<string, Coord[]>;
  showTrails: boolean;
  onToggleTrails: () => void;
  showDucks: boolean;
  onToggleDucks: () => void;
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" />
      <circle cx="8" cy="8" r="2" />
      <path d="M2 14L14 2" />
    </svg>
  );
}

function CrosshairIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="5" />
      <path d="M8 1v3M8 12v3M1 8h3M12 8h3" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 8l6-6 6 6M4 7v6h3v-3h2v3h3V7" />
    </svg>
  );
}

function DuckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10c0 2.2 1.8 4 4 4s4-1.8 4-4" />
      <path d="M12 7c0-2.8-1.8-5-4-5S4 4.2 4 7c0 1.1.4 2.1 1 3h6c.6-.9 1-1.9 1-3z" />
      <circle cx="6.5" cy="6" r="0.5" fill="currentColor" />
      <path d="M9 7.5h2.5" />
    </svg>
  );
}

function TrailIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12c2-2 4-6 6-6s4 4 6 2" />
      <circle cx="2" cy="12" r="1.5" fill="currentColor" />
      <circle cx="14" cy="8" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function MapControls({ mapRef, mapLoaded, coordsData, showTrails, onToggleTrails, showDucks, onToggleDucks }: Props) {
  const [poiVisible, setPoiVisible] = useState(() => localStorage.getItem("map:poi") !== "false");
  const [roadsVisible, setRoadsVisible] = useState(() => localStorage.getItem("map:roads") !== "false");

  // Apply saved preferences once map style loads
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (!poiVisible) {
      (map as any).setConfigProperty("basemap", "showPlaceLabels", false);
      (map as any).setConfigProperty("basemap", "showPointOfInterestLabels", false);
    }
    if (!roadsVisible) {
      (map as any).setConfigProperty("basemap", "showRoadLabels", false);
    }
  }, [mapLoaded]);

  const togglePoi = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const show = !poiVisible;
    (map as any).setConfigProperty("basemap", "showPlaceLabels", show);
    (map as any).setConfigProperty("basemap", "showPointOfInterestLabels", show);
    localStorage.setItem("map:poi", String(show));
    setPoiVisible(show);
  };

  const toggleRoads = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const show = !roadsVisible;
    (map as any).setConfigProperty("basemap", "showRoadLabels", show);
    localStorage.setItem("map:roads", String(show));
    setRoadsVisible(show);
  };

  const centerOnTeams = () => {
    const map = mapRef.current;
    if (!map) return;

    const allCoords: [number, number][] = [];
    for (const coords of coordsData.values()) {
      for (const coord of coords) {
        allCoords.push([Number(coord.longitude), Number(coord.latitude)]);
      }
    }

    // Include duck locations in bounds
    for (const duck of ducks) {
      allCoords.push([duck.longitude, duck.latitude]);
    }

    if (allCoords.length === 0) return;

    let minLng = allCoords[0][0], maxLng = allCoords[0][0];
    let minLat = allCoords[0][1], maxLat = allCoords[0][1];
    for (const [lng, lat] of allCoords) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }

    map.fitBounds(
      [[minLng, minLat], [maxLng, maxLat]],
      { padding: 60, maxZoom: 18 },
    );
  };

  const resetView = () => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: [-120.66, 35.301], zoom: 15 });
  };

  return (
    <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-2">
      {/* Visual toggles */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-md overflow-hidden">
        <ControlRow active={showDucks} onClick={onToggleDucks} first>
          <DuckIcon />
          Ducks
        </ControlRow>
        <ControlRow active={poiVisible} onClick={togglePoi}>
          {poiVisible ? <EyeIcon /> : <EyeOffIcon />}
          POI
        </ControlRow>
        <ControlRow active={roadsVisible} onClick={toggleRoads}>
          {roadsVisible ? <EyeIcon /> : <EyeOffIcon />}
          Roads
        </ControlRow>
        <ControlRow active={showTrails} onClick={onToggleTrails} last>
          <TrailIcon />
          Trails
        </ControlRow>
      </div>

      {/* View controls */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-md overflow-hidden">
        <ControlRow active onClick={centerOnTeams} first>
          <CrosshairIcon />
          Center
        </ControlRow>
        <ControlRow active onClick={resetView} last>
          <HomeIcon />
          Reset
        </ControlRow>
      </div>
    </div>
  );
}

function ControlRow({ active, onClick, disabled, first, children }: {
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
  first?: boolean;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 w-full px-3 py-2.5 text-xs font-medium transition-colors cursor-pointer ${
        !first ? "border-t border-gray-100" : ""
      } ${
        disabled
          ? "text-gray-300 cursor-not-allowed"
          : active
            ? "text-gray-900 font-semibold bg-gray-100"
            : "text-gray-300 hover:bg-gray-50 hover:text-gray-500"
      }`}
    >
      {children}
    </button>
  );
}
