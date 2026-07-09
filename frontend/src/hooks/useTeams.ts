import { useEffect, useState } from "react";
import { fetchTeams, type Team } from "../lib/api";

export function useTeams(gameId: string | null) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gameId) {
      setTeams([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchTeams(gameId)
      .then((data) => {
        if (!cancelled) {
          setTeams(data.teams);
          setError(null);
        }
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
  }, [gameId]);

  return { teams, loading, error };
}
