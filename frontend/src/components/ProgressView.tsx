import { useState, useMemo, useEffect } from "react";
import { useProgress } from "../hooks/useProgress";
import { getTeamColor } from "../lib/colors";
import { PhotoModal } from "./PhotoModal";
import type { Level } from "../lib/api";

interface Props {
  teamIds: string[];
  teamIndexMap: Map<string, number>;
  teamNameMap: Map<string, string>;
  gameStartedAt?: string;
  totalPausedMs?: number;
}

type SortKey = "best" | "recent" | "alpha";
type SortDir = "asc" | "desc";

const SORT_OPTIONS: { key: SortKey; label: string; reverse: string }[] = [
  { key: "best", label: "Best", reverse: "Worst" },
  { key: "recent", label: "Recent", reverse: "Oldest" },
  { key: "alpha", label: "A–Z", reverse: "Z–A" },
];

function formatDuration(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function getLevelState(level: Level): "completed" | "in-progress" | "not-reached" {
  if (level.completed_at || level.Status === "COMPLETED") return "completed";
  if (level.started_at) return "in-progress";
  return "not-reached";
}

function getLevelElapsed(level: Level, now: number): number | null {
  if (!level.started_at) return null;
  const start = new Date(level.started_at).getTime();
  if (level.completed_at) {
    return new Date(level.completed_at).getTime() - start;
  }
  return now - start;
}

function getTeamTotalElapsed(
  levels: Level[],
  now: number,
  gameStartedAt?: string,
  totalPausedMs?: number,
): number {
  let firstStart: number;
  if (gameStartedAt) {
    firstStart = new Date(gameStartedAt).getTime();
  } else {
    const starts = levels
      .filter((l) => l.started_at)
      .map((l) => new Date(l.started_at!).getTime());
    if (starts.length === 0) return 0;
    firstStart = Math.min(...starts);
  }
  const hasInProgress = levels.some((l) => l.started_at && !l.completed_at);
  let elapsed: number;
  if (hasInProgress) {
    elapsed = now - firstStart;
  } else {
    const completions = levels
      .filter((l) => l.completed_at)
      .map((l) => new Date(l.completed_at!).getTime());
    elapsed = completions.length > 0 ? Math.max(...completions) - firstStart : 0;
  }
  return elapsed - (totalPausedMs ?? 0);
}

function SortBar({ sortKey, sortDir, onSort }: {
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  return (
    <div className="flex items-center gap-1 px-6 py-2 border-b border-gray-200 bg-white shrink-0">
      {SORT_OPTIONS.map((opt) => {
        const active = sortKey === opt.key;
        const label = active && sortDir === "desc" ? opt.reverse : opt.label;
        return (
          <button
            key={opt.key}
            onClick={() => onSort(opt.key)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              active
                ? "bg-gray-900 text-white"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function LiveTimer({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const elapsed = now - new Date(startedAt).getTime();
  return <span>{formatDuration(elapsed)}</span>;
}

export function ProgressView({ teamIds, teamIndexMap, teamNameMap, gameStartedAt, totalPausedMs }: Props) {
  const { data, loading, error } = useProgress(teamIds);
  const [sortKey, setSortKey] = useState<SortKey>("best");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [now, setNow] = useState(Date.now());
  const [modal, setModal] = useState<{
    teamName: string;
    teamColor: string;
    levelIndex: number;
    photoUrl: string | null;
    elapsedTime: string | null;
  } | null>(null);

  // Tick for live timers in sort
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortedTeamIds = useMemo(() => {
    if (!data || data.size === 0) return teamIds;

    const getCompleted = (id: string) => {
      const p = data.get(id);
      if (!p) return 0;
      return p.levels.filter((l) => l.Status === "COMPLETED" || !!l.completed_at).length;
    };

    const getTotalElapsed = (id: string) => {
      const p = data.get(id);
      if (!p) return Infinity;
      return getTeamTotalElapsed(p.levels, now, gameStartedAt, totalPausedMs);
    };

    const getLatestActivity = (id: string) => {
      const p = data.get(id);
      if (!p) return "";
      const timestamps = p.levels
        .flatMap((l) => [l.completed_at, l.started_at])
        .filter(Boolean) as string[];
      if (timestamps.length === 0) return "";
      return timestamps.reduce((latest, t) => t > latest ? t : latest, "");
    };

    const getName = (id: string) => teamNameMap.get(id) ?? id;

    const sorted = [...teamIds].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "best": {
          cmp = getCompleted(b) - getCompleted(a);
          if (cmp === 0) {
            cmp = getTotalElapsed(a) - getTotalElapsed(b);
          }
          break;
        }
        case "recent":
          cmp = getLatestActivity(b).localeCompare(getLatestActivity(a));
          break;
        case "alpha":
          cmp = getName(a).localeCompare(getName(b));
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [teamIds, data, sortKey, sortDir, teamNameMap, now]);

  if (teamIds.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">
        Select teams to view progress.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto flex flex-col gap-8">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-gray-200" />
                  <div className="w-24 h-4 bg-gray-200 rounded" />
                </div>
                <div className="w-8 h-4 bg-gray-200 rounded" />
              </div>
              <div className="w-full h-1.5 bg-gray-100 rounded-sm" />
              <div className="flex gap-2 mt-3">
                {[...Array(5)].map((_, j) => (
                  <div key={j} className="w-[120px] h-14 rounded-md bg-gray-100" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-red-500">
        {error}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <SortBar sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
      <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-8">
        {sortedTeamIds.map((teamId) => {
          const progress = data.get(teamId);
          if (!progress) return null;
          const colorIndex = teamIndexMap.get(teamId) ?? 0;
          const color = getTeamColor(colorIndex);
          const name = teamNameMap.get(teamId) ?? teamId;
          const completedCount = progress.levels.filter(
            (l) => l.Status === "COMPLETED" || !!l.completed_at,
          ).length;
          const pct =
            progress.total > 0
              ? (completedCount / progress.total) * 100
              : 0;

          const sortedLevels = [...progress.levels].sort((a, b) => a.index - b.index);
          const teamElapsed = getTeamTotalElapsed(sortedLevels, now, gameStartedAt, totalPausedMs);

          return (
            <div key={teamId}>
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-sm font-semibold text-gray-900">
                    {name}
                  </span>
                  {teamElapsed > 0 && (
                    <span className={`text-xs font-mono ${
                      completedCount === progress.total ? "text-gray-700" : "text-gray-400"
                    }`}>
                      {formatDuration(teamElapsed)}
                    </span>
                  )}
                </div>
                <span className="text-sm font-normal text-gray-500">
                  {completedCount} / {progress.total}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1.5 bg-gray-100 rounded-sm overflow-hidden">
                <div
                  className="h-full rounded-sm transition-all"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
              </div>

              {/* Level tiles */}
              {sortedLevels.length > 0 && (
                <div className="flex gap-2 mt-3 flex-wrap">
                  {sortedLevels.map((level) => {
                    const state = getLevelState(level);
                    const displayIndex = level.index + 1;
                    const elapsed = getLevelElapsed(level, now);
                    const elapsedStr = elapsed !== null ? formatDuration(elapsed) : null;

                    return (
                      <button
                        key={level.level_id}
                        onClick={async () => {
                          setModal({
                            teamName: name,
                            teamColor: color,
                            levelIndex: displayIndex,
                            photoUrl: null,
                            elapsedTime: elapsedStr,
                          });
                          const nextLevel = sortedLevels[level.index + 1];
                          if (state === "completed" && nextLevel) {
                            try {
                              const res = await fetch(`/api/photo-url?prefix=${encodeURIComponent(`${teamId}/${nextLevel.level_id}/`)}`);
                              if (res.ok) {
                                const data = await res.json();
                                setModal((prev) => prev ? { ...prev, photoUrl: data.url } : null);
                              }
                            } catch {}
                          }
                        }}
                        className={`flex flex-col justify-center px-4 py-3 rounded-md cursor-pointer transition-all min-w-[120px] ${
                          state === "completed"
                            ? "text-white hover:opacity-90"
                            : state === "in-progress"
                              ? "border-2 hover:opacity-90 level-in-progress"
                              : "bg-transparent border border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-500"
                        }`}
                        style={
                          state === "completed"
                            ? { backgroundColor: color }
                            : state === "in-progress"
                              ? { borderColor: color }
                              : undefined
                        }
                      >
                        <span className={`text-xs font-semibold ${
                          state === "completed"
                            ? "text-white"
                            : state === "in-progress"
                              ? "text-gray-900"
                              : "text-gray-900"
                        }`}>
                          Level {displayIndex}
                        </span>
                        <span className={`text-[11px] font-mono mt-0.5 ${
                          state === "completed"
                            ? "text-white/70"
                            : state === "in-progress"
                              ? "text-gray-600"
                              : "text-gray-300"
                        }`}>
                          {state === "completed" && elapsedStr
                            ? elapsedStr
                            : state === "in-progress" && level.started_at
                              ? <LiveTimer startedAt={level.started_at} />
                              : "--:--"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      </div>

      {/* Photo modal */}
      <PhotoModal
        open={modal !== null}
        onClose={() => setModal(null)}
        teamName={modal?.teamName ?? ""}
        teamColor={modal?.teamColor ?? ""}
        levelIndex={modal?.levelIndex ?? 0}
        photoUrl={modal?.photoUrl}
        elapsedTime={modal?.elapsedTime ?? undefined}
      />
    </div>
  );
}
