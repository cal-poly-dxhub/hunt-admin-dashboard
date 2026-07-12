import { useState, useRef, useEffect } from "react";
import { PhotoModal } from "./PhotoModal";

export interface NotificationItem {
  id: string;
  teamName: string;
  teamColor: string;
  duckName: string;
  photoUrl: string | null;
  timestamp: number;
}

interface Props {
  items: NotificationItem[];
}

export function NotificationBell({ items }: Props) {
  const [open, setOpen] = useState(false);
  const [seenCount, setSeenCount] = useState(0);
  const [modal, setModal] = useState<NotificationItem | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const unread = items.length - seenCount;

  useEffect(() => {
    if (open) {
      setSeenCount(items.length);
    }
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <>
      <div className="relative" ref={panelRef}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="relative flex items-center justify-center w-9 h-9 rounded-md hover:bg-gray-100 transition-colors cursor-pointer"
          title="Notifications"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full">
              {unread}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 top-11 w-80 max-h-96 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg z-50">
            {items.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-gray-400">
                No notifications yet
              </div>
            ) : (
              <div className="py-1">
                {[...items].reverse().map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors"
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: item.teamColor }}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-gray-900 truncate block">
                        {item.teamName}
                        <span className="font-normal text-gray-500"> reached </span>
                        {item.duckName}
                      </span>
                    </div>
                    {item.photoUrl && (
                      <button
                        onClick={() => setModal(item)}
                        className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 hover:text-gray-900 shrink-0 cursor-pointer transition-colors"
                        title="View photo"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <path d="M21 15l-5-5L5 21" />
                        </svg>
                        Photo
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {modal && (
        <PhotoModal
          open
          onClose={() => setModal(null)}
          teamName={modal.teamName}
          teamColor={modal.teamColor}
          levelIndex={0}
          photoUrl={modal.photoUrl}
          checkpointLabel={modal.duckName}
          timeLabel={new Date(modal.timestamp * 1000).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        />
      )}
    </>
  );
}
