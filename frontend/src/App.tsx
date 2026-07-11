import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { LiveBanner } from "./components/LiveBanner";
import { PollToast } from "./components/PollToast";
import { CheckpointToastStack, type CheckpointEvent } from "./components/CheckpointToast";
import { Stopwatch } from "./components/Stopwatch";
import { GameDropdown } from "./components/GameDropdown";
import { SettingsPanel } from "./components/SettingsPanel";
import { RecordButton } from "./components/RecordButton";
import { NotificationBell, type NotificationItem } from "./components/NotificationBell";
import { TeamChips } from "./components/TeamChips";
import { LiveMap } from "./components/LiveMap";
import { ProgressView } from "./components/ProgressView";
import { useGames } from "./hooks/useGames";
import { useTeams } from "./hooks/useTeams";
import { useCoords } from "./hooks/useCoords";
import { useCheckpointEvents } from "./hooks/useCheckpointEvents";
import { startGame, pauseGame, unpauseGame, resetGame, verifySecret, ApiError } from "./lib/api";
import { getTeamColor } from "./lib/colors";
import ducks from "./data/ducks.json";

function Layout() {
  const { games, refetch: refetchGames } = useGames();
  const [gameId, setGameId] = useState<string | null>(null);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const { teams } = useTeams(gameId);
  const allTeamIds = useMemo(() => teams.map((t) => t.id), [teams]);
  const { data: coordsData, lastFetchedAt } = useCoords(allTeamIds, selectedTeamIds);
  const [checkpointEvents, setCheckpointEvents] = useState<CheckpointEvent[]>([]);
  const [notificationHistory, setNotificationHistory] = useState<NotificationItem[]>([]);
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
    const item = { id, teamName, teamColor, duckName, photoUrl, timestamp: event.CreatedAt };

    setNotificationHistory((prev) => {
      if (prev.some((n) => n.id === id)) return prev;
      return [...prev, item];
    });

    if (dismissedIdsRef.current.has(id)) return;
    setCheckpointEvents((prev) => {
      if (prev.some((e) => e.id === id)) return prev;
      return [...prev, { ...item, levelIndex: 0 }];
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

  const getSecret = (): string | null => {
    return localStorage.getItem("admin-secret");
  };

  const handleStartGame = async () => {
    if (!gameId) return;
    if (!window.confirm("Are you sure? This cannot be undone.")) return;
    const secret = getSecret();
    if (!secret) return;
    try {
      await startGame(gameId, secret);
      refetchGames();
    } catch (err) {
      alert(`Failed to start game: ${err}`);
    }
  };

  const handlePauseGame = async () => {
    if (!gameId) return;
    if (!window.confirm("Pause the game timer?")) return;
    const secret = getSecret();
    if (!secret) return;
    try {
      await pauseGame(gameId, secret);
      refetchGames();
    } catch (err) {
      alert(`Failed to pause: ${err}`);
    }
  };

  const handleUnpauseGame = async () => {
    if (!gameId) return;
    if (!window.confirm("Resume the game timer?")) return;
    const secret = getSecret();
    if (!secret) return;
    try {
      await unpauseGame(gameId, secret);
      refetchGames();
    } catch (err) {
      alert(`Failed to unpause: ${err}`);
    }
  };

  const handleResetGame = async () => {
    if (!gameId) return;
    if (!window.confirm("Reset the game timer to zero? This clears the start time and any paused time.")) return;
    const secret = getSecret();
    if (!secret) return;
    try {
      await resetGame(gameId, secret);
      refetchGames();
    } catch (err) {
      // 409 = the clock is still running; offer a forced reset.
      if (err instanceof ApiError && err.status === 409) {
        if (window.confirm("The game clock is still running. Force reset anyway?")) {
          try {
            await resetGame(gameId, secret, true);
            refetchGames();
          } catch (err2) {
            alert(`Failed to reset: ${err2}`);
          }
        }
        return;
      }
      alert(`Failed to reset: ${err}`);
    }
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
          <NotificationBell items={notificationHistory} />
          <RecordButton />
          {(() => {
            const game = games.find((g) => g.id === gameId);
            if (!game) return null;
            if (!game.started_at) {
              return (
                <button
                  className="px-3 py-1.5 text-xs font-semibold bg-green-600 text-white rounded-md hover:bg-green-700"
                  onClick={handleStartGame}
                >
                  Start Game
                </button>
              );
            }
            return (
              <div className="flex items-center gap-2">
                <Stopwatch
                  startTime={game.started_at}
                  pausedAt={game.paused_at}
                  totalPausedMs={game.total_paused_ms ?? 0}
                />
                {game.paused_at ? (
                  <button
                    className="px-2 py-1 text-[11px] font-medium bg-amber-100 text-amber-700 rounded hover:bg-amber-200"
                    onClick={handleUnpauseGame}
                  >
                    Resume
                  </button>
                ) : (
                  <button
                    className="px-2 py-1 text-[11px] font-medium bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                    onClick={handlePauseGame}
                  >
                    Pause
                  </button>
                )}
                <button
                  className="px-2 py-1 text-[11px] font-medium bg-red-50 text-red-600 rounded hover:bg-red-100"
                  onClick={handleResetGame}
                >
                  Reset
                </button>
              </div>
            );
          })()}
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
                gameStartedAt={games.find((g) => g.id === gameId)?.started_at}
                totalPausedMs={games.find((g) => g.id === gameId)?.total_paused_ms}
              />
            }
          />
        </Routes>
      </div>
    </div>
    </>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("admin-secret");
    if (!stored) {
      setChecking(false);
      return;
    }
    verifySecret(stored).then((ok) => {
      if (ok) setAuthed(true);
      else localStorage.removeItem("admin-secret");
      setChecking(false);
    });
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    const ok = await verifySecret(trimmed);
    if (ok) {
      localStorage.setItem("admin-secret", trimmed);
      setAuthed(true);
      setError(false);
    } else {
      setError(true);
    }
  }, [input]);

  if (checking) return null;
  if (authed) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow-sm border border-gray-200 w-80">
        <h1 className="text-lg font-semibold text-gray-900 mb-4">Admin Dashboard</h1>
        <input
          type="password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter admin secret"
          autoFocus
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        />
        {error && <p className="text-xs text-red-600 mt-1">Invalid secret</p>}
        <button
          type="submit"
          className="mt-4 w-full px-3 py-2 text-sm font-medium bg-gray-900 text-white rounded-md hover:bg-gray-800"
        >
          Enter
        </button>
      </form>
    </div>
  );
}

export default function App() {
  return (
    <AuthGate>
      <BrowserRouter>
        <Layout />
      </BrowserRouter>
    </AuthGate>
  );
}
