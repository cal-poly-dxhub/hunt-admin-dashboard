import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { fetchCoords, type Coord } from "../lib/api";

export function useCoords(allTeamIds: string[], selectedTeamIds: string[], intervalMs = 10000) {
  const [cache, setCache] = useState<Map<string, Coord[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number>(Date.now());
  const sinceRef = useRef<Map<string, number>>(new Map());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const teamIdsRef = useRef<string[]>(allTeamIds);
  teamIdsRef.current = allTeamIds;

  const fetchAll = useCallback(async () => {
    const ids = teamIdsRef.current;
    if (ids.length === 0) return;
    setLoading(true);
    try {
      const results = await Promise.all(
        ids.map(async (teamId) => {
          const since = sinceRef.current.get(teamId);
          const res = await fetchCoords(teamId, since);
          return { teamId, coords: res.coords };
        }),
      );

      setCache((prev) => {
        const next = new Map(prev);
        for (const { teamId, coords } of results) {
          const existing = next.get(teamId) ?? [];
          const merged = [...existing, ...coords];
          next.set(teamId, merged);

          if (coords.length > 0) {
            const maxTs = Math.max(...coords.map((c) => c.CreatedAt));
            sinceRef.current.set(teamId, maxTs);
          }
        }
        return next;
      });
      setError(null);
      setLastFetchedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch coords");
    } finally {
      setLoading(false);
    }
  }, []);

  // Only reset and restart polling when the full team list changes (game switch)
  const allTeamsKey = allTeamIds.join(",");
  useEffect(() => {
    setCache(new Map());
    sinceRef.current = new Map();

    if (allTeamIds.length === 0) return;

    fetchAll();

    intervalRef.current = setInterval(fetchAll, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [allTeamsKey, intervalMs, fetchAll]);

  // Client-side filter based on selection
  const selectedKey = selectedTeamIds.join(",");
  const filteredData = useMemo(() => {
    const map = new Map<string, Coord[]>();
    for (const teamId of selectedTeamIds) {
      const coords = cache.get(teamId);
      if (coords) {
        map.set(teamId, coords);
      }
    }
    return map;
  }, [cache, selectedKey]);

  return { data: filteredData, loading, error, lastFetchedAt };
}
