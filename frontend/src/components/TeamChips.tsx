import { useRef, useEffect } from "react";
import type { Team } from "../lib/api";

interface Props {
  teams: Team[];
  selectedTeamIds: string[];
  onToggle: (teamId: string) => void;
  onSolo: (teamId: string) => void;
  getColor: (index: number) => string;
}

export function TeamChips({ teams, selectedTeamIds, onToggle, onSolo, getColor }: Props) {
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
            <span
              className="w-2 h-2 rounded-full shrink-0 transition-colors"
              style={{ backgroundColor: active ? getColor(index) : "#d1d5db" }}
            />
            {team.name}
          </button>
        );
      })}
    </>
  );
}
