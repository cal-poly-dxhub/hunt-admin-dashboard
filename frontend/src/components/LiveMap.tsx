import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { getTeamColor } from "../lib/colors";
import { MapControls } from "./MapControls";
import type { Coord, Duck } from "../lib/api";

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface Props {
  coordsData: Map<string, Coord[]>;
  teamIndexMap: Map<string, number>;
  teamNameMap: Map<string, string>;
  ducks: Duck[];
}

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;

export function LiveMap({ coordsData, teamIndexMap, teamNameMap, ducks }: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [showTrails, setShowTrails] = useState(() => localStorage.getItem("map:trails") === "true");
  const [showDucks, setShowDucks] = useState(() => localStorage.getItem("map:ducks") === "true");
  const [mapLoaded, setMapLoaded] = useState(false);
  const duckMarkersRef = useRef<mapboxgl.Marker[]>([]);

  useEffect(() => {
    if (!mapContainerRef.current || !MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/itsisaac19/cmrboru7v006801r769ky04k6",
      center: [-120.66, 35.301],
      zoom: 15,
      logoPosition: "bottom-right",
      attributionControl: false,
    });

    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");

    map.on("load", () => setMapLoaded(true));
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, []);

  // Update markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const m of markersRef.current) {
      m.remove();
    }
    markersRef.current = [];

    for (const [teamId, coords] of coordsData.entries()) {
      const colorIndex = teamIndexMap.get(teamId) ?? 0;
      const color = getTeamColor(colorIndex);
      const teamName = teamNameMap.get(teamId) ?? teamId;

      const latestByUser = new Map<string, (typeof coords)[0]>();
      for (const coord of coords) {
        const existing = latestByUser.get(coord.user_id);
        if (!existing || coord.CreatedAt > existing.CreatedAt) {
          latestByUser.set(coord.user_id, coord);
        }
      }

      for (const coord of latestByUser.values()) {
        const el = document.createElement("div");
        el.style.width = "18px";
        el.style.height = "18px";
        el.style.borderRadius = "50%";
        el.style.backgroundColor = color;
        el.style.border = "2px solid #fff";
        const popup = new mapboxgl.Popup({
          offset: 12,
          closeButton: false,
          closeOnClick: false,
          className: "hunt-popup",
        }).setHTML(
          `<div style="font-family: 'Host Grotesk', sans-serif; padding: 4px 0;">
            <div style="font-size: 13px; font-weight: 600; color: #111827;">${escapeHtml(teamName)}</div>
            <div style="font-size: 12px; color: #6b7280; margin-top: 2px;">${escapeHtml(coord.user_id.slice(0, 8))}</div>
          </div>`,
        );

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([Number(coord.longitude), Number(coord.latitude)])
          .addTo(map);

        el.addEventListener("mouseenter", () => popup.setLngLat(marker.getLngLat()).addTo(map));
        el.addEventListener("mouseleave", () => popup.remove());
        el.addEventListener("click", (e) => e.stopPropagation());

        markersRef.current.push(marker);
      }
    }
  }, [coordsData, teamIndexMap, teamNameMap]);

  // Draw trails
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Remove existing trail layers/sources
    for (const [teamId] of coordsData.entries()) {
      const sourceId = `trail-${teamId}`;
      if (map.getLayer(sourceId)) map.removeLayer(sourceId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    }

    // Also clean up any stale trail sources from previously visible teams
    const style = map.getStyle();
    if (style?.sources) {
      for (const sourceId of Object.keys(style.sources)) {
        if (sourceId.startsWith("trail-")) {
          if (map.getLayer(sourceId)) map.removeLayer(sourceId);
          map.removeSource(sourceId);
        }
      }
    }

    if (!showTrails) return;

    for (const [teamId, coords] of coordsData.entries()) {
      const colorIndex = teamIndexMap.get(teamId) ?? 0;
      const color = getTeamColor(colorIndex);

      // Group by user and sort by time
      const userCoords = new Map<string, Coord[]>();
      for (const coord of coords) {
        const arr = userCoords.get(coord.user_id) ?? [];
        arr.push(coord);
        userCoords.set(coord.user_id, arr);
      }

      // Create a line for each user's path
      const features: any[] = [];
      for (const [, userPings] of userCoords.entries()) {
        const sorted = userPings.sort((a, b) => a.CreatedAt - b.CreatedAt);
        if (sorted.length < 2) continue;
        features.push({
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: sorted.map((c) => [Number(c.longitude), Number(c.latitude)]),
          },
        });
      }

      if (features.length === 0) continue;

      const sourceId = `trail-${teamId}`;
      map.addSource(sourceId, {
        type: "geojson",
        data: { type: "FeatureCollection", features },
      });

      map.addLayer({
        id: sourceId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": color,
          "line-width": 2,
          "line-opacity": 0.5,
        },
      });
    }
  }, [coordsData, showTrails, mapLoaded, teamIndexMap]);

  // Duck markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove existing duck markers
    for (const m of duckMarkersRef.current) {
      m.remove();
    }
    duckMarkersRef.current = [];

    if (!showDucks) return;

    for (const duck of ducks) {
      const el = document.createElement("div");
      el.style.width = "72px";
      el.style.height = "72px";
      const img = document.createElement("img");
      img.src = "/duck-marker.svg";
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "contain";
      el.appendChild(img);

      const popup = new mapboxgl.Popup({
        offset: 38,
        closeButton: false,
        closeOnClick: false,
        className: "hunt-popup",
      }).setHTML(
        `<div style="font-family: 'Host Grotesk', sans-serif; padding: 4px 0;">
          <div style="font-size: 13px; font-weight: 600; color: #111827;">${escapeHtml(duck.name)}</div>
          <div style="font-size: 12px; color: #6b7280; margin-top: 2px;">${escapeHtml(duck.character)}</div>
        </div>`,
      );

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([duck.longitude, duck.latitude])
        .addTo(map);

      el.addEventListener("mouseenter", () => popup.setLngLat(marker.getLngLat()).addTo(map));
      el.addEventListener("mouseleave", () => popup.remove());
      el.addEventListener("click", (e) => e.stopPropagation());

      duckMarkersRef.current.push(marker);
    }
  }, [showDucks, ducks]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-500">
        VITE_MAPBOX_TOKEN is not set.
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      <div ref={mapContainerRef} className="w-full h-full" />
      <MapControls
        mapRef={mapRef}
        mapLoaded={mapLoaded}
        coordsData={coordsData}
        ducks={ducks}
        showTrails={showTrails}
        onToggleTrails={() => {
          const next = !showTrails;
          localStorage.setItem("map:trails", String(next));
          setShowTrails(next);
        }}
        showDucks={showDucks}
        onToggleDucks={() => {
          const next = !showDucks;
          localStorage.setItem("map:ducks", String(next));
          setShowDucks(next);
        }}
      />
    </div>
  );
}
