import { useRef, useEffect } from "react";
import type { Team, TeamProgress } from "../lib/api";

interface Props {
  teams: Team[];
  selectedTeamIds: string[];
  onToggle: (teamId: string) => void;
  onSolo: (teamId: string) => void;
  getColor: (index: number) => string;
  progressData?: Map<string, TeamProgress>;
  totalLevels?: number;
}

export function TeamChips({ teams, selectedTeamIds, onToggle, onSolo, getColor, progressData, totalLevels = 0 }: Props) {
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastClickRef = useRef<{ id: string; time: number } | null>(null);

  useEffect(() => {
    return () => { if (clickTimerRef.current) clearTimeout(clickTimerRef.current); };
  }, []);

  if (teams.length === 0) {
    return <span className="text-sm text-gray-400">No teams</span>;
  }

  const handleClick = (teamId: string) => {
    const now = Date.now();
    const last = lastClickRef.current;

    if (last && last.id === teamId && now - last.time < 250) {
      // Double click — cancel the pending toggle and solo instead
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      lastClickRef.current = null;
      onSolo(teamId);
    } else {
      // First click — delay toggle to allow for double click
      lastClickRef.current = { id: teamId, time: now };
      clickTimerRef.current = setTimeout(() => {
        onToggle(teamId);
        clickTimerRef.current = null;
      }, 250);
    }
  };

  return (
    <>
      {teams.map((team, index) => {
        const active = selectedTeamIds.includes(team.id);
        const color = getColor(index);
        const progress = progressData?.get(team.id);
        const completed =
          progress?.levels.filter((l) => !!l.completed_at).length ?? 0;
        // One box per level in the game; fill exactly the completed count.
        const filled = Math.min(completed, totalLevels);
        return (
          <button
            key={team.id}
            onClick={() => handleClick(team.id)}
            className={`flex items-center gap-2 px-3 h-8 rounded-md border text-xs font-medium whitespace-nowrap transition-all duration-150 cursor-pointer ${
              active
                ? "bg-white border-gray-200 text-gray-900 hover:bg-gray-50 hover:border-gray-300"
                : "bg-transparent border-transparent text-gray-300 hover:text-gray-400 hover:bg-gray-100/50 hover:border-gray-200"
            }`}
          >
            <span className="flex items-center gap-0.5 shrink-0">
              {Array.from({ length: totalLevels }, (_, i) => {
                const isFilled = i < filled;
                return (
                  <span
                    key={i}
                    className="w-1.5 h-4 rounded-[1px] transition-colors"
                    style={{
                      // Filled = solid color (active) or gray (inactive); empty is
                      // always a neutral light gray so filled vs empty is clear —
                      // a color-tinted empty box reads as "filled" on a tiny bar.
                      backgroundColor: isFilled
                        ? active
                          ? color
                          : "#9ca3af"
                        : "#f3f4f6",
                    }}
                  />
                );
              })}
            </span>
            {team.name}
          </button>
        );
      })}
    </>
  );
}
