import { useState, useEffect } from "react";

interface Props {
  startTime: string | null;
}

export function Stopwatch({ startTime }: Props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startTime) return;

    const start = new Date(startTime).getTime();

    const tick = () => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  if (!startTime) return null;

  const hours = Math.floor(elapsed / 3600);
  const mins = Math.floor((elapsed % 3600) / 60);
  const secs = elapsed % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <span className="text-sm font-medium text-gray-900 tabular-nums tracking-tight font-mono">
      {pad(hours)}:{pad(mins)}:{pad(secs)}
    </span>
  );
}
