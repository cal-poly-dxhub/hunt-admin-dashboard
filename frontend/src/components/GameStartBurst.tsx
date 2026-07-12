interface Props {
  /** When set, the burst plays once then calls onDone. */
  active: boolean;
  onDone: () => void;
}

/**
 * A full-screen celebratory burst shown when a game starts: a white flash,
 * an expanding green ring, and a "GO!" label that pops and fades. Runs ~2.4s
 * then unmounts via onDone. Non-interactive (pointer-events: none).
 */
export function GameStartBurst({ active, onDone }: Props) {
  if (!active) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none overflow-hidden"
      onAnimationEnd={(e) => {
        // All elements share the same 2.4s duration; fire once when the label
        // (a single element) finishes so onDone isn't called multiple times.
        if ((e.target as HTMLElement).classList.contains("game-start-label")) {
          onDone();
        }
      }}
    >
      {/* Bright full-screen flash */}
      <div className="game-start-flash absolute inset-0 bg-white" />

      {/* Expanding ring */}
      <div className="game-start-ring absolute w-64 h-64 rounded-full border-[10px] border-green-500" />
      <div
        className="game-start-ring absolute w-64 h-64 rounded-full border-[6px] border-green-300"
        style={{ animationDelay: "120ms" }}
      />

      {/* Center label */}
      <div className="game-start-label relative flex flex-col items-center">
        <span className="text-7xl font-extrabold tracking-tight text-green-600 drop-shadow-[0_2px_12px_rgba(34,197,94,0.5)]">
          GO!
        </span>
        <span className="mt-2 text-lg font-semibold text-gray-700">
          Game started
        </span>
      </div>
    </div>
  );
}
