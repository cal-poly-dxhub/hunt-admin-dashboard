import { useEffect, useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  teamName: string;
  teamColor: string;
  levelIndex: number;
  photoUrl?: string | null;
  elapsedTime?: string;
  // Notification path has a checkpoint NAME + a wall-clock time, but no route
  // level index / elapsed. When provided these override the level-index labels.
  checkpointLabel?: string;
  timeLabel?: string;
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

export function PhotoModal({ open, onClose, teamName, teamColor, levelIndex, photoUrl, elapsedTime, checkpointLabel, timeLabel }: Props) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
      const timer = setTimeout(() => setMounted(false), 200);
      return () => clearTimeout(timer);
    }
  }, [open]);

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-200 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Modal */}
      <div
        className={`relative bg-white rounded-lg border border-gray-200 w-full max-w-3xl mx-4 overflow-hidden transition-all duration-200 ${
          visible ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: teamColor }} />
            <span className="text-sm font-semibold text-gray-900">{teamName}</span>
            <span className="text-sm text-gray-400">{checkpointLabel ?? `Level ${levelIndex}`}</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
            <CloseIcon />
          </button>
        </div>

        {/* Photo area */}
        <div className="bg-gray-50 flex items-center justify-center min-h-96">
          {photoUrl ? (
            <img src={photoUrl} alt={`${teamName} - Level ${levelIndex}`} className="max-w-full max-h-[70vh] object-contain" />
          ) : (
            <div className="text-sm text-gray-300 py-24">No photo available</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
          <div className="text-xs text-gray-700">
            {elapsedTime ? (
              <span>Completed in <span className="font-semibold text-gray-900 font-mono">{elapsedTime}</span></span>
            ) : timeLabel ? (
              <span>Reached at <span className="font-semibold text-gray-900 font-mono">{timeLabel}</span></span>
            ) : (
              <span>Time: <span className="font-mono">--:--:--</span></span>
            )}
          </div>
          <div className="text-xs text-gray-700 uppercase tracking-wide font-medium">
            {checkpointLabel ?? `Checkpoint ${levelIndex}`}
          </div>
        </div>
      </div>
    </div>
  );
}
