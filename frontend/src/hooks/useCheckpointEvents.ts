import { useEffect, useRef, useCallback } from "react";
import { fetchEvents, type CheckpointEventData } from "../lib/api";

export function useCheckpointEvents(
  onEvent: (event: CheckpointEventData) => void,
  intervalMs = 5000,
) {
  const sinceRef = useRef<string | undefined>(undefined);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const poll = useCallback(async () => {
    try {
      const { events } = await fetchEvents(sinceRef.current);
      if (events.length > 0) {
        // Update since to latest
        const latest = events[0];
        sinceRef.current = `${latest.CreatedAt}#${latest.team_id}#${latest.level_id}`;

        // Fire callback for all events in the batch
        for (const evt of events) {
          onEventRef.current(evt);
        }
      }
    } catch {
      // Silently ignore — events endpoint may not be deployed yet
    }
  }, []);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, intervalMs);
    return () => clearInterval(interval);
  }, [poll, intervalMs]);
}
