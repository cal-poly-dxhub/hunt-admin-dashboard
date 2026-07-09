import { useEffect, useState, useCallback, useRef } from "react";
import { fetchProgress, type TeamProgress } from "../lib/api";

const MAX_BACKOFF = 60000;

export function useProgress(teamIds: string[], intervalMs = 10000) {
  const [data, setData] = useState<Map<string, TeamProgress>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const teamIdsRef = useRef(teamIds);
  const failCountRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  teamIdsRef.current = teamIds;

  const schedule = useCallback((baseMs: number) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const delay = Math.min(baseMs * Math.pow(2, failCountRef.current), MAX_BACKOFF);
    timeoutRef.current = setTimeout(() => poll(), delay);
  }, []);

  const poll = useCallback(async () => {
    const ids = teamIdsRef.current;
    if (ids.length === 0) return;

    try {
      const results = await Promise.all(ids.map((id) => fetchProgress(id)));
      const map = new Map<string, TeamProgress>();
      for (const r of results) {
        map.set(r.teamId, r);
      }
      setData(map);
      setError(null);
      failCountRef.current = 0;
      schedule(intervalMs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch progress");
      failCountRef.current++;
      schedule(intervalMs);
    }
  }, [intervalMs, schedule]);

  const teamKey = teamIds.join(",");

  useEffect(() => {
    if (teamIds.length === 0) {
      setData(new Map());
      return;
    }

    failCountRef.current = 0;
    setLoading(true);
    poll().finally(() => setLoading(false));

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [teamKey, poll]);

  return { data, loading, error };
}
