import { useEffect, useState } from "react";
import { fetchProgress, type TeamProgress } from "../lib/api";

export function useProgress(teamIds: string[]) {
  const [data, setData] = useState<Map<string, TeamProgress>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (teamIds.length === 0) {
      setData(new Map());
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.all(teamIds.map((id) => fetchProgress(id)))
      .then((results) => {
        if (cancelled) return;
        const map = new Map<string, TeamProgress>();
        for (const r of results) {
          map.set(r.teamId, r);
        }
        setData(map);
        setError(null);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [teamIds.join(",")]);

  return { data, loading, error };
}
