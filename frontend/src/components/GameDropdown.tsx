import { useState, useRef, useEffect } from "react";
import type { Game } from "../lib/api";


interface Props {
  games: Game[];
  selectedGameId: string | null;
  onSelect: (gameId: string) => void;
}

function GameIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8.5" cy="8.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="15.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function GameDropdown({ games, selectedGameId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const getGameName = (game: Game, index: number) =>
    game.name || `Game ${index + 1} — ${new Date(game.created_at).toLocaleDateString()}`;

  if (games.length <= 1) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-center w-9 h-9 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer"
      >
        <GameIcon />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 min-w-48 bg-white border border-gray-200 rounded-md z-50">
          {games.map((game, i) => (
            <button
              key={game.id}
              onClick={() => {
                onSelect(game.id);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-50 transition-colors cursor-pointer ${
                i < games.length - 1 ? "border-b border-gray-100" : ""
              } ${game.id === selectedGameId ? "bg-gray-50" : ""}`}
            >
              {getGameName(game, i)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
