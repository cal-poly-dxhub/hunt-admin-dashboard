import { useEffect, useRef, useCallback } from "react";
import { fetchEvents, type CheckpointEventData } from "../lib/api";

const MAX_BACKOFF = 60000;

export function useCheckpointEvents(
  onEvent: (event: CheckpointEventData) => void,
  intervalMs = 10000,
) {
  const sinceRef = useRef<string | undefined>(undefined);
  const readyRef = useRef(false);
  const onEventRef = useRef(onEvent);
  const failCountRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  onEventRef.current = onEvent;

  const schedule = useCallback((baseMs: number) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const delay = Math.min(baseMs * Math.pow(2, failCountRef.current), MAX_BACKOFF);
    timeoutRef.current = setTimeout(() => poll(), delay);
  }, []);

  const poll = useCallback(async () => {
    try {
      const { events } = await fetchEvents(sinceRef.current);
      if (events.length > 0) {
        const latest = events[0];
        sinceRef.current = `${latest.CreatedAt}#${latest.team_id}#${latest.level_id}`;

        if (readyRef.current) {
          for (const evt of events) {
            onEventRef.current(evt);
          }
        }
      }
      readyRef.current = true;
      failCountRef.current = 0;
      schedule(intervalMs);
    } catch {
      failCountRef.current++;
      schedule(intervalMs);
    }
  }, [intervalMs, schedule]);

  useEffect(() => {
    poll();
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [poll]);
}
