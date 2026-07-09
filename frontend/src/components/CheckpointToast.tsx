import { useState, useEffect } from "react";
import { PhotoModal } from "./PhotoModal";

export interface CheckpointEvent {
  id: string;
  teamName: string;
  teamColor: string;
  levelIndex: number;
  duckName: string;
  photoUrl: string | null;
  timestamp: number;
}

function PartyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 14l3-10 7 7-10 3z" />
      <path d="M8 3l1-1M12 5l1-1M11 9l1-1" />
    </svg>
  );
}

interface StackProps {
  events: CheckpointEvent[];
  onDismiss: (id: string) => void;
}

export function CheckpointToastStack({ events, onDismiss }: StackProps) {
  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col-reverse gap-3 items-end">
      {events.map((event) => (
        <SingleToast key={event.id} event={event} onDismiss={() => onDismiss(event.id)} />
      ))}
    </div>
  );
}

function SingleToast({ event, onDismiss }: { event: CheckpointEvent; onDismiss: () => void }) {
  const [showModal, setShowModal] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(onDismiss, 250);
  };

  const handleViewPhoto = () => {
    setShowModal(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    handleDismiss();
  };

  return (
    <>
      <div
        style={{ boxShadow: "0 10px 40px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.1)" }}
        className={`w-80 rounded-lg transition-all duration-250 checkpoint-toast-border ${
          visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
        }`}
      >
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <PartyIcon />
            <span className="text-sm font-semibold text-gray-900">
              {event.teamName} reached checkpoint!
            </span>
          </div>

          <div className="text-xs text-gray-500 mb-3">
            📍 {event.duckName}
          </div>

          <button
            onClick={handleViewPhoto}
            className="w-full py-2 bg-gray-900 text-white text-xs font-medium rounded-md hover:bg-gray-800 transition-colors cursor-pointer"
          >
            View Photo
          </button>
        </div>

        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 text-gray-300 hover:text-gray-500 transition-colors cursor-pointer"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      <PhotoModal
        open={showModal}
        onClose={handleModalClose}
        teamName={event.teamName}
        teamColor={event.teamColor}
        levelIndex={event.levelIndex}
        photoUrl={event.photoUrl}
      />
    </>
  );
}
