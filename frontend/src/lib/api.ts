export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new ApiError(res.status, `API error ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// GET /api/games → { games: Game[] }
export interface Game {
  id: string;
  name?: string;
  levelsInGame: number;
  levels: GameLevel[];
  teams: { id: string; name: string }[];
  created_at: string;
  updated_at: string;
  started_at?: string;
  paused_at?: string;
  total_paused_ms?: number;
  [key: string]: unknown;
}

export interface GameLevel {
  id: string;
  levelName: string;
  character: { name: string; systemPrompt: string };
  location: { description: string; latitude: number; longitude: number };
  clues: string[];
  easyClues: string[];
  mapLink: string;
}

// A checkpoint location for the map, derived from the selected game's levels
// (id is the level UUID). Replaces the old hardcoded ducks.json so the map and
// notification names always reflect the actual game config.
export interface Duck {
  id: string;
  name: string;
  character: string;
  description: string;
  latitude: number;
  longitude: number;
}

export function gameLevelsToDucks(levels: GameLevel[] | undefined): Duck[] {
  if (!levels) return [];
  return levels.map((l) => ({
    id: l.id,
    name: l.levelName,
    character: l.character?.name ?? "",
    description: l.location?.description ?? "",
    latitude: l.location?.latitude,
    longitude: l.location?.longitude,
  }));
}

// GET /api/games/{gameId}/teams → { teams: Team[] }
export interface Team {
  id: string;
  name: string;
  game_id: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

// GET /api/teams/{teamId}/coords → { coords: Coord[] }
export interface Coord {
  user_id: string;
  team_id: string;
  latitude: string;  // comes as string from DynamoDB
  longitude: string; // comes as string from DynamoDB
  created_at: string;
  CreatedAt: number;
  [key: string]: unknown;
}

// GET /api/teams/{teamId}/progress → TeamProgress
export interface Level {
  level_id: string;
  index: number;
  team_id: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
  Status?: string;
  [key: string]: unknown;
}

export interface TeamProgress {
  teamId: string;
  total: number;
  completed: number; // count of levels with completed_at set
  levels: Level[];
}

// GET /api/events → { events: CheckpointEventData[] }
export interface CheckpointEventData {
  team_id: string;
  level_id: string;
  s3_key: string;
  filename: string;
  created_at: string;
  CreatedAt: number;
}

export function fetchGames(): Promise<{ games: Game[] }> {
  return request("/api/games");
}

export function fetchTeams(gameId: string): Promise<{ teams: Team[] }> {
  return request(`/api/games/${gameId}/teams`);
}

export function fetchCoords(
  teamId: string,
  since?: number,
): Promise<{ coords: Coord[] }> {
  const params = since ? `?since=${since}` : "";
  return request(`/api/teams/${teamId}/coords${params}`);
}

export function fetchProgress(teamId: string): Promise<TeamProgress> {
  return request(`/api/teams/${teamId}/progress`);
}

export function fetchEvents(since?: string): Promise<{ events: CheckpointEventData[] }> {
  const params = since ? `?since=${since}` : "";
  return request(`/api/events${params}`);
}

export function fetchPhotoUrl(key: string): Promise<{ url: string }> {
  return request(`/api/photo-url?key=${encodeURIComponent(key)}`);
}

export async function verifySecret(secret: string): Promise<boolean> {
  const res = await fetch("/api/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-secret": secret,
    },
  });
  return res.ok;
}

async function postControl(
  gameId: string,
  action: string,
  secret: string,
  controlSecret: string,
  extra?: Record<string, unknown>,
) {
  const res = await fetch(`/api/games/${gameId}/control`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-secret": secret,
      // Private per-action secret; prompted on each click, never stored.
      "x-control-secret": controlSecret,
    },
    body: JSON.stringify({ action, ...extra }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      (data as { error?: string }).error || `API error ${res.status}`,
    );
  }
  return res.json();
}

export function startGame(gameId: string, secret: string, controlSecret: string) {
  return postControl(gameId, "start", secret, controlSecret);
}

export function pauseGame(gameId: string, secret: string, controlSecret: string) {
  return postControl(gameId, "pause", secret, controlSecret);
}

export function unpauseGame(gameId: string, secret: string, controlSecret: string) {
  return postControl(gameId, "unpause", secret, controlSecret);
}

// Clears the game clock (deletes the dashboard control item). Refuses to reset a
// running clock with a 409 unless force is passed. The next startGame recreates it.
export function resetGame(gameId: string, secret: string, controlSecret: string, force = false) {
  return postControl(gameId, "reset", secret, controlSecret, force ? { force: true } : undefined);
}
