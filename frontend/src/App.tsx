import { useState, useMemo, useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { LiveBanner } from "./components/LiveBanner";
import { PollToast } from "./components/PollToast";
import { CheckpointToastStack, type CheckpointEvent } from "./components/CheckpointToast";
import { Stopwatch } from "./components/Stopwatch";
import { GameDropdown } from "./components/GameDropdown";
import { SettingsPanel } from "./components/SettingsPanel";
import { RecordButton } from "./components/RecordButton";
import { TeamChips } from "./components/TeamChips";
import { LiveMap } from "./components/LiveMap";
import { ProgressView } from "./components/ProgressView";
import { useGames } from "./hooks/useGames";
import { useTeams } from "./hooks/useTeams";
import { useCoords } from "./hooks/useCoords";
import { useCheckpointEvents } from "./hooks/useCheckpointEvents";
import { getTeamColor } from "./lib/colors";
import ducks from "./data/ducks.json";

function Layout() {
  const { games } = useGames();
  const [gameId, setGameId] = useState<string | null>(null);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const { teams } = useTeams(gameId);
  const allTeamIds = useMemo(() => teams.map((t) => t.id), [teams]);
  const { data: coordsData, lastFetchedAt } = useCoords(allTeamIds, selectedTeamIds);
  const [checkpointEvents, setCheckpointEvents] = useState<CheckpointEvent[]>([]);
  const dismissedIdsRef = useRef<Set<string>>(new Set());
  const [notifications, setNotifications] = useState(() => localStorage.getItem("settings:notifications") !== "false");
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const dismissCheckpointEvent = (id: string) => {
    dismissedIdsRef.current.add(id);
    setCheckpointEvents((prev) => prev.filter((e) => e.id !== id));
  };


  // Poll for S3 checkpoint events
  useCheckpointEvents(async (event) => {
    // Skip if teams haven't loaded yet (names would be wrong)
    if (teamNameMap.size === 0) return;

    const teamName = teamNameMap.get(event.team_id) ?? "Team";
    const colorIndex = teamIndexMap.get(event.team_id) ?? 0;
    const teamColor = getTeamColor(colorIndex);
    const duckName = ducks.find((d) => d.id.toString() === event.level_id)?.name
      ?? "Checkpoint";

    let photoUrl: string | null = null;
    try {
      const res = await fetch(`/api/photo-url?key=${encodeURIComponent(event.s3_key)}`);
      if (res.ok) {
        const data = await res.json();
        photoUrl = data.url;
      }
    } catch {}

    const id = `${event.CreatedAt}-${event.level_id}`;
    if (dismissedIdsRef.current.has(id)) return;
    setCheckpointEvents((prev) => {
      if (prev.some((e) => e.id === id)) return prev;
      return [...prev, {
        id,
        teamName,
        teamColor,
        levelIndex: 0,
        duckName,
        photoUrl,
        timestamp: event.CreatedAt,
      }];
    });
  });

  // Auto-select the most recent game on load
  useEffect(() => {
    if (games.length > 0 && !gameId) {
      const sorted = [...games].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      );
      setGameId(sorted[0].id);
    }
  }, [games, gameId]);

  // Auto-select all teams when teams load
  useEffect(() => {
    if (teams.length > 0) {
      setSelectedTeamIds(teams.map((t) => t.id));
    }
  }, [teams]);

  const handleGameSelect = (id: string) => {
    setGameId(id || null);
    setSelectedTeamIds([]);
  };

  const handleTeamToggle = (teamId: string) => {
    setSelectedTeamIds((prev) =>
      prev.includes(teamId)
        ? prev.filter((t) => t !== teamId)
        : [...prev, teamId],
    );
  };

  const handleTeamSolo = (teamId: string) => {
    setSelectedTeamIds((prev) =>
      prev.length === 1 && prev[0] === teamId
        ? teams.map((t) => t.id)
        : [teamId],
    );
  };

  const teamIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    teams.forEach((t, i) => map.set(t.id, i));
    return map;
  }, [teams]);

  const teamNameMap = useMemo(() => {
    const map = new Map<string, string>();
    teams.forEach((t) => map.set(t.id, t.name));
    return map;
  }, [teams]);

  const dataReady = teams.length > 0;
  const [minDelayPassed, setMinDelayPassed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setMinDelayPassed(true), 800);
    return () => clearTimeout(timer);
  }, []);
  const showOverlay = !dataReady || !minDelayPassed;

  return (
    <>
    {/* Loading overlay */}
    <div
      className={`fixed inset-0 z-100 bg-white flex flex-col items-center justify-center transition-opacity duration-500 pointer-events-none ${
        showOverlay ? "opacity-100" : "opacity-0"
      }`}
      onTransitionEnd={(e) => {
        if (!showOverlay) (e.currentTarget as HTMLElement).style.display = "none";
      }}
    >
      <img src="/dx-duck-final-final.png" alt="" className="w-64 h-64 object-contain" />
      <div className="mt-6 flex gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-600 animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="w-1.5 h-1.5 rounded-full bg-gray-600 animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="w-1.5 h-1.5 rounded-full bg-gray-600 animate-bounce" style={{ animationDelay: "300ms" }} />
      </div>
    </div>

    {notifications && <PollToast lastFetchedAt={lastFetchedAt} />}
    {notifications && <CheckpointToastStack events={checkpointEvents} onDismiss={dismissCheckpointEvent} />}

    <div className="flex flex-col h-screen">
      {/* Live banner */}
      <LiveBanner lastFetchedAt={lastFetchedAt} />

      {/* Nav bar */}
      <div className="h-14 flex items-center px-6 border-b border-gray-200 bg-white shrink-0">
        <nav className="flex items-center gap-6">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `text-sm pb-0.5 border-b-2 transition-colors ${
                isActive
                  ? "font-semibold text-gray-900 border-gray-900"
                  : "font-medium text-gray-400 border-transparent hover:text-gray-600"
              }`
            }
          >
            Map
          </NavLink>
          <NavLink
            to="/progress"
            className={({ isActive }) =>
              `text-sm pb-0.5 border-b-2 transition-colors ${
                isActive
                  ? "font-semibold text-gray-900 border-gray-900"
                  : "font-medium text-gray-400 border-transparent hover:text-gray-600"
              }`
            }
          >
            Progress
          </NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <RecordButton />
          <Stopwatch startTime={games.find((g) => g.id === gameId)?.created_at ?? null} />
          <GameDropdown
            games={games}
            selectedGameId={gameId}
            onSelect={handleGameSelect}
          />
          <SettingsPanel
            notifications={notifications}
            onToggleNotifications={() => {
              const next = !notifications;
              localStorage.setItem("settings:notifications", String(next));
              setNotifications(next);
            }}
            fullscreen={fullscreen}
            onToggleFullscreen={() => {
              if (document.fullscreenElement) {
                document.exitFullscreen();
              } else {
                document.documentElement.requestFullscreen();
              }
            }}
          />
        </div>
      </div>

      {/* Team bar */}
      <div className="h-12 flex items-center px-6 gap-2 border-b border-gray-200 bg-gray-50 shrink-0 overflow-x-auto">
        <TeamChips
          teams={teams}
          selectedTeamIds={selectedTeamIds}
          onToggle={handleTeamToggle}
          onSolo={handleTeamSolo}
          getColor={getTeamColor}
        />
      </div>

      {/* Page content */}
      <div className="flex-1 min-h-0">
        <Routes>
          <Route
            path="/"
            element={
              <LiveMap
                coordsData={coordsData}
                teamIndexMap={teamIndexMap}
                teamNameMap={teamNameMap}
              />
            }
          />
          <Route
            path="/progress"
            element={
              <ProgressView
                teamIds={selectedTeamIds}
                teamIndexMap={teamIndexMap}
                teamNameMap={teamNameMap}
              />
            }
          />
        </Routes>
      </div>
    </div>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  );
}
