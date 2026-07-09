import { useState, useRef, useEffect } from "react";

interface Props {
  notifications: boolean;
  onToggleNotifications: () => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1.08 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1.08z" />
    </svg>
  );
}

export function SettingsPanel({ notifications, onToggleNotifications, fullscreen, onToggleFullscreen }: Props) {
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

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-center w-9 h-9 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer"
      >
        <GearIcon />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-md z-50 py-2">
          <label className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors">
            <span className="text-xs font-medium text-gray-700">Notifications</span>
            <button
              onClick={onToggleNotifications}
              className={`relative w-8 h-4.5 rounded-full transition-colors cursor-pointer ${
                notifications ? "bg-gray-900" : "bg-gray-200"
              }`}
            >
              <span
                className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                  notifications ? "left-4" : "left-0.5"
                }`}
              />
            </button>
          </label>
          <label className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors">
            <span className="text-xs font-medium text-gray-700">Fullscreen</span>
            <button
              onClick={onToggleFullscreen}
              className={`relative w-8 h-4.5 rounded-full transition-colors cursor-pointer ${
                fullscreen ? "bg-gray-900" : "bg-gray-200"
              }`}
            >
              <span
                className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                  fullscreen ? "left-4" : "left-0.5"
                }`}
              />
            </button>
          </label>
        </div>
      )}
    </div>
  );
}
