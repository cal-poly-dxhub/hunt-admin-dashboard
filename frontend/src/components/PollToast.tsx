import { useEffect, useState, useRef } from "react";

interface Props {
  lastFetchedAt: number;
}

export function PollToast({ lastFetchedAt }: Props) {
  const [visible, setVisible] = useState(false);
  const mountCount = useRef(0);

  useEffect(() => {
    // Skip the first two updates (mount + initial fetch)
    mountCount.current++;
    if (mountCount.current <= 2) return;

    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 2000);
    return () => clearTimeout(timer);
  }, [lastFetchedAt]);

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-md transition-all duration-300 pointer-events-none ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
    >
      Data updated
    </div>
  );
}
