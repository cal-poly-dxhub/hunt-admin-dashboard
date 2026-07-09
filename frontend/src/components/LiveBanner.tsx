import { useState, useEffect } from "react";

interface Props {
  lastFetchedAt: number;
  intervalMs?: number;
}

export function LiveBanner({ lastFetchedAt, intervalMs = 10000 }: Props) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf: number;

    const frame = () => {
      const elapsed = Date.now() - lastFetchedAt;
      const pct = Math.min((elapsed / intervalMs) * 100, 100);
      setProgress(pct);
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [lastFetchedAt, intervalMs]);

  return (
    <div className="h-7 flex items-center px-4 bg-red-50 border-b border-red-100 shrink-0 relative overflow-hidden">
      {/* Fill bar */}
      <div
        className="absolute inset-y-0 left-0 transition-none"
        style={{
          width: `${progress}%`,
          background: `linear-gradient(to right, rgb(254 226 226), rgb(252 165 165))`,
        }}
      />

      {/* Content */}
      <div className="relative flex items-center gap-2">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-300 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-400" />
        </span>
        <span className="text-[11px] font-medium text-red-400 tracking-wide uppercase">
          Live
        </span>
      </div>
    </div>
  );
}
