# Duck Hunt — Shared DynamoDB Table Model

> **What this is:** the `ScavengerHuntData-<uniqueId>` table is shared by two systems — the
> **game backend** (`duck-hunt` repo, the source of truth for all gameplay) and this
> **admin dashboard** (`hunt-admin-dashboard`). This doc is the contract between them: what
> every item type looks like, who writes it, and exactly how the dashboard extends the table
> **without ever mutating game-backend data**.
>
> **Audience:** the dashboard frontend/agent. §1–7 describe the game backend's data model
> (what the dashboard *reads*). **§8 is the dashboard's own additive write layer.**
>
> **Source of truth for §1–7:** the `duck-hunt` repo, branch `summer-camp-2026`, commit
> `e35628b`. This dashboard repo does not contain the backend writer code — this doc mirrors
> it. If the game backend changes, regenerate those sections.
>
> **The one-line contract:** the dashboard is **read-only against every game-backend item**.
> It writes only its own two item types — `CHECKPOINT_EVENT` and `DASHBOARD_CONTROL` — which
> live in key ranges no backend item uses. Quick map in **Writers into this table** below;
> full detail in **§8**.

---

## 1. Big picture

It's a **single DynamoDB table** (`ScavengerHuntData-<uniqueId>`), single-table design.
Everything is one table with a composite `PK` / `SK` key plus **three GSIs** (`GSI1`, `GSI2`,
`GSI3`), each with its own `<name>PK` / `<name>SK` string attributes and **`ProjectionType.ALL`**
(so every GSI query returns the full item — no projection surprises).

- **Billing mode: `PAY_PER_REQUEST` (on-demand).** Recently changed from the CDK default of
  PROVISIONED 5 RCU/5 WCU, which throttled almost immediately under concurrent play. GSIs
  inherit this. Relevant if you run heavy Scans from the dashboard — you won't hit a fixed
  capacity ceiling, but on-demand reads still cost money, so prefer targeted Queries.
- Every item carries an **`ItemType`** discriminator string. Game-backend types: `GAME`, `TEAM`,
  `LEVEL`, `TEAM_LEVEL`, `USER`, `MESSAGE`, `PHOTO`, `COORDINATE_SNAPSHOT`. Dashboard-owned types:
  `CHECKPOINT_EVENT`, `DASHBOARD_CONTROL` (see "Writers into this table").
- **`ttl` attribute is declared but unused.** Nothing sets it. Soft deletes use `deleted_at`
  instead (see the "soft delete" note under Message).
- Photos themselves live in an **S3 bucket** (`photo-bucket-<uniqueId>`); the table only
  stores photo *metadata* (including the URL).

### Base fields on (almost) every item

All the entity interfaces extend `BaseEntity`:

```ts
interface BaseEntity {
  id: string;          // usually a v4 UUID (exceptions noted below)
  created_at: string;  // ISO 8601 string, e.g. "2026-07-11T18:22:05.123Z"
  updated_at: string;  // ISO 8601 string
  deleted_at?: number; // epoch SECONDS; present only on soft-deleted items
}
```

Note the mixed time formats — **`created_at`/`updated_at` are ISO strings**, but
**`deleted_at` is epoch seconds** (and sort-key timestamps are also epoch seconds; see below).

### Writers into this table

Two systems share this table. They write **disjoint items** — the dashboard never mutates a
game-backend-owned item, so there is no shared-item / racing-`updated_at` hazard.

| Writer | Item types it writes | Notes |
|---|---|---|
| **Game backend** (`duck-hunt`) | `GAME`, `TEAM`, `LEVEL`, `TEAM_LEVEL`, `USER`, `MESSAGE`, `PHOTO`, `COORDINATE_SNAPSHOT` | Source of truth for all game data and timing. |
| **Dashboard** (`hunt-admin-dashboard`) | `CHECKPOINT_EVENT`, `DASHBOARD_CONTROL` | Additive only — its own item types, keyed under `GAME#`/`TEAM#` PKs but never overlapping a backend SK. |

- **`CHECKPOINT_EVENT`** (`s3-event.ts`) — one per photo upload, driven by an EventBridge S3 rule.
  `PK=TEAM#<teamId>`, `SK=CHECKPOINT_EVENT#<epoch>#<levelId>`, `GSI1PK=CHECKPOINT_EVENTS` (global feed).
  Writes both `created_at` (ISO) and `CreatedAt` (epoch) — a dashboard convention; no backend item does this.
- **`DASHBOARD_CONTROL`** (`game-control.ts`) — the admin start/pause clock, one per game.
  `PK=GAME#<gameId>`, `SK=DASHBOARD#CONTROL`, holds `started_at` / `paused_at` / `total_paused_ms`.
  **This is a game-*level* clock the backend has no concept of** — the backend's authoritative timing is
  per-`TEAM_LEVEL` `started_at`/`completed_at`. `games.ts` reads these control items and merges the fields
  onto each game in the `/api/games` response, so the frontend sees them on the game object.
  The item is created on the first `start`; the `reset` action **deletes** it to zero the clock (guarded
  against resetting a running clock unless `force: true`). Deleting this item never affects backend data.
- **Neither dashboard write touches `#METADATA` or any other backend item.** Infra-wise the two CDK stacks
  are also disjoint: the dashboard references the table by ARN and never declares it, so a game-backend
  `cdk deploy` and a dashboard deploy don't fight over the resource. (Caveat: the backend table has
  `RemovalPolicy.DESTROY` — a stack *destroy*/replace would drop all data, dashboard items included.)

---

## 2. Key layout at a glance

| Entity | ItemType | PK | SK | GSI1 (PK / SK) | GSI2 | GSI3 |
|---|---|---|---|---|---|---|
| **Game** | `GAME` | `GAME#<gameId>` | `#METADATA` | — | — | — |
| **Team** | `TEAM` | `GAME#<gameId>` | `TEAM#<teamId>` | — | — | — |
| **Level** | `LEVEL` | `GAME#<gameId>` | `LEVEL#<levelId>` | `LEVEL#<levelId>` / `GAME#<gameId>` | — | — |
| **TeamLevel** (progress) | `TEAM_LEVEL` | `TEAM#<teamId>` | `LEVEL#<levelId>` | `LEVEL#<levelId>` / `TEAM#<teamId>` | — | — |
| **User** | `USER` | `TEAM#<teamId>` | `USER#<userId>` | `USER#<userId>` / `#METADATA` | — | — |
| **Message** | `MESSAGE` | `USER#<userId>` | `MESSAGE#<epoch>#<id>` | `TEAM#<teamId>` / `MESSAGE#<epoch>#<id>` | `GAME#<gameId>` / same SK | `LEVEL#<levelId>` / same SK |
| **Photo** | `PHOTO` | `USER#<userId>` | `PHOTO#<epoch>#<id>` | `TEAM#<teamId>` / `PHOTO#<epoch>#<id>` | `GAME#<gameId>` / same SK | `LEVEL#<levelId>` / same SK |
| **CoordinateSnapshot** | `COORDINATE_SNAPSHOT` | `USER#<userId>` | `COORDINATE_SNAPSHOT#<epoch>#<id>` | `TEAM#<teamId>` / same SK | — | — |
| **CheckpointEvent** *(dashboard)* | `CHECKPOINT_EVENT` | `TEAM#<teamId>` | `CHECKPOINT_EVENT#<epoch>#<levelId>` | `CHECKPOINT_EVENTS` / `<epoch>#<teamId>#<levelId>` | — | — |
| **DashboardControl** *(dashboard)* | `DASHBOARD_CONTROL` | `GAME#<gameId>` | `DASHBOARD#CONTROL` | — | — | — |

`<epoch>` in sort keys is **epoch seconds** (`Math.floor(Date.now()/1000)`), zero-padded only by
its natural width — so lexical sort ≈ chronological sort for the foreseeable future. `ScanIndexForward`
controls oldest-vs-newest ordering per query.

---

## 3. Entities in detail (shape + when written)

### Game — `GAME#<gameId>` / `#METADATA`

```ts
interface Game extends BaseEntity {
  levelsInGame?: number;         // how many stops each team plays (<= levels.length)
  teams: Array<Team>;            // FULL team objects, embedded inline
  levels: Array<Level>;          // FULL level objects, embedded inline
  winner_team_id?: string;       // team id of the FIRST team to finish; absent until someone wins
}
```

- **Embeds `teams[]` and `levels[]` inline** in the metadata item, *in addition to* the separate
  per-`TEAM#`/`LEVEL#` items. The inline copies are a snapshot from game-creation time; the
  authoritative per-entity records are the standalone items. Prefer querying the standalone
  `TEAM#`/`LEVEL#` items for anything live.
- **Written once** at game creation (`createGame.ts`, triggered by a game-config JSON landing in
  S3 → `GameOperations.create`).
- **`winner_team_id`** is written later, at most once, by `GameOperations.claimWinner` (see §5).
- ✅ **Single writer:** only the game backend writes this `#METADATA` item (`levelsInGame`, `teams`,
  `levels`, `winner_team_id`, `created_at`, `updated_at`). The dashboard's start/pause clock
  (`started_at`, `paused_at`, `total_paused_ms`) lives on a **separate** `DASHBOARD#CONTROL` item, not
  here — so `updated_at` on `#METADATA` is a reliable game-backend-activity signal. `games.ts` merges
  the control fields onto each game at read time, so the API response still exposes them on the game
  object. See **Writers into this table** below.
- There is **no `name` and no `status` attribute** on the game (matches your existing CLAUDE.md note).

### Team — `GAME#<gameId>` / `TEAM#<teamId>`

```ts
interface Team extends BaseEntity {
  name: string;
  game_id: string;
}
```

- Written once per team at game creation. No GSI. Query all teams in a game with
  `PK = GAME#<gameId>` AND `begins_with(SK, "TEAM#")`.

### Level — `GAME#<gameId>` / `LEVEL#<levelId>`

```ts
interface Level extends BaseEntity {
  game_id: string;
  levelName: string;
  character: { name: string; systemPrompt: string };
  location: { description: string; latitude: number; longitude: number };
  clues: string[];       // >= 3 (validated at creation)
  easyClues: string[];   // >= 2 (validated at creation)
  mapLink: string;
  max_tokens: number;    // per-level cap for the AI response
}
```

- Written once per level at game creation.
- **`GSI1` lets you fetch a level by id alone** (`GSI1PK = LEVEL#<levelId>`), without knowing the
  game id. That's how the backend resolves a scanned duck's level.
- `character.systemPrompt`, `clues`, `easyClues`, `location.description` are **spoilers** — they
  drive the AI character and hints. Don't surface them to players; fine for an admin view.

### TeamLevel — `TEAM#<teamId>` / `LEVEL#<levelId>`  *(this is "progress")*

This is the per-team route + progress join row. **This is what you read for team progress.**

```ts
interface TeamLevel extends BaseEntity {
  team_id: string;
  level_id: string;      // the REAL level id (use this to join to a Level, NOT `id`)
  index: number;         // 0-based position in THIS team's route (0 = first stop)
  started_at?: string;   // ISO; set once, when the team first arrives at this level
  completed_at?: string; // ISO; set when the team clears this level
}
```

- ⚠️ **`id` vs `level_id`:** `id` (from `BaseEntity`) is the join-row's own UUID. The actual level
  is `level_id`. Join progress → level via `level_id`.
- ⚠️ **Completion is `completed_at` presence, NOT a `Status` field.** Your current dashboard
  `CLAUDE.md` says `Status === "COMPLETED"` marks a level done — that does **not** match this
  backend. A `TEAM_LEVEL` is complete **iff `completed_at` exists** (an ISO timestamp). There is
  no `Status` attribute. Treat `attribute_exists(completed_at)` as done, `attribute_not_exists` as
  in-progress. Please reconcile the dashboard code/doc against this.
- **`started_at`** is set by `markLevelAsStarted` using a **conditional write**
  (`attribute_not_exists(started_at)`), so only the *first* arrival stamps it; it's called on
  essentially every request for the team's current (uncompleted) level via `fetchBaseData`. Safe to
  treat as "time the team reached this stop."
- **`completed_at`** is set by `markLevelAsCompleted` when the team submits the correct level id
  for their current stop (the level-advance path in `level.ts`).
- **The "current level" for a team** = the assigned `TEAM_LEVEL` with the **lowest `index`** that has
  **no `completed_at`**. If all are completed, the backend treats the highest-index one as current.
- Created once per (team, level) at game creation. `GSI1` (`LEVEL#<levelId>` / `TEAM#<teamId>`) lets
  you find all teams assigned to a given level.
- **Routes are per-team and may be randomized/subset.** If `levelsInGame < levels.length`, each team
  gets a random subset of non-final levels **plus** the shared final level (always the last
  `levels[]` entry) appended at the end. If `levelsInGame === levels.length`, every team plays all
  levels in the original order. So `index` ordering is authoritative per team; don't assume all teams
  share a route.

### User — `TEAM#<teamId>` / `USER#<userId>`

```ts
interface User extends BaseEntity {
  team_id: string;
}
```

- ⚠️ **`id` is NOT server-generated** — it's the `user-id` supplied in the request header (a device/
  browser identity). Created lazily on a user's first API call (`fetchBaseData` creates it if missing).
- `GSI1` (`USER#<userId>` / `#METADATA`) fetches a user by id alone. Query all users on a team with
  `PK = TEAM#<teamId>` AND `begins_with(SK, "USER#")`. A team has many users (each teammate's device).

### Message — `USER#<userId>` / `MESSAGE#<epoch>#<id>`

Chat log between a player and the AI character. **The highest-fan-out item type** — this is where
volume lives.

```ts
interface Message extends BaseEntity {
  user_id: string;
  team_id: string;
  game_id: string;
  level_id: string;
  role: "user" | "assistant";
  content: string;
}
```

- Three GSIs give you three feeds, all newest/oldest-orderable via `ScanIndexForward`:
  - **GSI1** `TEAM#<teamId>` — all messages for a team (across users/levels).
  - **GSI2** `GAME#<gameId>` — all messages in a game.
  - **GSI3** `LEVEL#<levelId>` — all messages at a level. Used by the backend to reconstruct a
    user's chat for the AI, filtered to that user + not soft-deleted.
- Written by `invokeBedrockPersistToDynamo`: the **user message is persisted first**, then the
  **assistant reply is persisted only if it's a real model response** — hardcoded fallback replies
  (from a failed/throttled Bedrock call) are **not** written, so chat history won't contain them.
- ⚠️ **Soft delete via `deleted_at` (epoch seconds), not row deletion.** "Clear chat"
  (`softDeleteCurrentLevelMessages`) sets `deleted_at` on the level's messages; they remain in the
  table and in GSI3. If you display message history, **filter out `attribute_exists(deleted_at)`**
  unless you specifically want deleted ones. (There is also a hard `delete` used narrowly to drop a
  trailing unanswered user message.)
- Adaptive hints (a "here's an easy clue" / map-link assistant line the backend synthesizes after a
  team lingers) are returned in API responses but are **not always persisted** as messages — don't
  assume the chat log contains every line a player saw.

### Photo — `USER#<userId>` / `PHOTO#<epoch>#<id>`

```ts
interface Photo extends BaseEntity {
  user_id: string;
  team_id: string;
  game_id: string;
  level_id: string;
  url: string;   // https://<bucket>.s3.amazonaws.com/<key>
}
```

- Same 3-GSI fan-out as Message (TEAM / GAME / LEVEL). Query photos at a level via **GSI3**
  (`LEVEL#<levelId>`, `begins_with(GSI3SK, "PHOTO#")`).
- Written by `uploadPhoto.ts` after the image is stored in S3. **S3 key format:**
  `teamId/levelId/<epochSeconds>_<photoId>.<ext>` (ext = jpg/png/gif, sniffed from content-type or
  magic bytes). Your `photo-url.ts` presigner keys off this bucket layout.
- Note: the backend's `PhotoOperations.create` generates a fresh `photoId` for the item's `id`, and
  `uploadPhoto` also generates one for the S3 key — they are **not guaranteed to be the same UUID**.
  Correlate photos to levels/teams via the item attributes, not by matching the two ids.

### CoordinateSnapshot — `USER#<userId>` / `COORDINATE_SNAPSHOT#<epoch>#<id>`

```ts
interface CoordinateSnapshot extends BaseEntity {
  user_id: string;
  team_id: string;
  latitude: number;   // written as a JS number
  longitude: number;  // written as a JS number
}
```

- GPS breadcrumb. Client pings roughly every **10s** while playing (`coordinatePingIntervalMs`).
- Query a team's track via **GSI1** (`TEAM#<teamId>`, `begins_with(GSI1SK, "COORDINATE_SNAPSHOT#")`),
  filtered by `since` epoch on the sort key. Only GSI1 exists for this type (no game/level GSI).
- ⚠️ **Type caveat:** the writer stores lat/long as **numbers** (DynamoDB `N`). Your dashboard
  CLAUDE.md notes they arrive as **strings** — that happens if you read with the low-level
  `DynamoDBClient` (raw `{"N":"..."}` marshalling) rather than `DynamoDBDocumentClient`. Either way,
  coerce with `Number(...)` before using; just know the underlying attribute is numeric.

---

## 4. Access-pattern cheat sheet

| You want… | How |
|---|---|
| A game's metadata | `GetItem` PK=`GAME#<id>`, SK=`#METADATA` |
| All games | `Scan` filter `ItemType = GAME` (on-demand, but still a full scan — cache it) |
| All teams in a game | `Query` PK=`GAME#<id>`, `begins_with(SK,"TEAM#")` |
| All levels in a game | `Query` PK=`GAME#<id>`, `begins_with(SK,"LEVEL#")` |
| A level by id (no game id) | `Query` GSI1 `GSI1PK=LEVEL#<id>`, Limit 1 |
| A team's progress/route | `Query` PK=`TEAM#<id>`, `begins_with(SK,"LEVEL#")` → sort by `index`; done = `completed_at` present |
| Which teams are on a level | `Query` GSI1 `GSI1PK=LEVEL#<id>` (returns `TEAM_LEVEL` rows) |
| A user by id | `Query` GSI1 `GSI1PK=USER#<id>` |
| A team's chat | `Query` GSI1 `GSI1PK=TEAM#<id>`, `begins_with(GSI1SK,"MESSAGE#")` (drop `deleted_at`) |
| A level's chat | `Query` GSI3 `GSI3PK=LEVEL#<id>`, `begins_with(GSI3SK,"MESSAGE#")` |
| Photos at a level | `Query` GSI3 `GSI3PK=LEVEL#<id>`, `begins_with(GSI3SK,"PHOTO#")` |
| A team's GPS track | `Query` GSI1 `GSI1PK=TEAM#<id>`, `begins_with(GSI1SK,"COORDINATE_SNAPSHOT#")`, filter SK by `since` |

---

## 5. The "winner" / finish mechanic (recently added)

When a team clears its **final** level, the backend races to claim the winner slot:

```ts
GameOperations.claimWinner(gameId, teamId)
// UpdateItem on GAME#<gameId>/#METADATA
//   SET winner_team_id = :teamId
//   ConditionExpression: attribute_not_exists(winner_team_id)
```

- **First team to finish wins** — the conditional write succeeds exactly once and stores that team's
  id in `winner_team_id`. Every later finisher's write fails `ConditionalCheckFailedException`; the
  code then *reads* the existing `winner_team_id`. Idempotent: a team that already won reads itself.
- The `/level` API response carries a transient **`endScreen`** field (`"win"` | `"finish"` | `null`)
  computed by comparing the caller's team id to `winner_team_id`. **`endScreen` is response-only — it
  is NOT stored in DynamoDB.** The only persisted signal you can observe is `winner_team_id` on the
  game item.
- **For the dashboard:** to show who won, read `GAME#<id>/#METADATA.winner_team_id`. If absent, no
  team has finished yet. To detect "a team finished," you can also watch for a team whose
  highest-`index` `TEAM_LEVEL` has `completed_at` set.

---

## 6. Write-trigger timeline (who writes what, when)

1. **Game creation** (`createGame.ts`, S3-config-upload trigger): writes `GAME` (with inline
   `teams`/`levels`), all `TEAM` items, all `LEVEL` items, and one `TEAM_LEVEL` per (team, stop) with
   its `index`. No progress timestamps yet.
2. **Player's first request** (`fetchBaseData`, on `/level`, `/message`, `/clear-chat`,
   `/ping-coordinates`, `/upload-photo`): lazily creates the `USER` item if missing; stamps
   `started_at` on the current `TEAM_LEVEL` (once).
3. **Chatting** (`/message`, and the intro turn on `/level`): writes `MESSAGE` items (user always;
   assistant only if a real model reply). Adaptive hint lines may be returned without being persisted.
4. **Clearing chat** (`/clear-chat`): sets `deleted_at` (soft delete) on the level's messages.
5. **Photo upload** (`/upload-photo`): S3 object + `PHOTO` metadata item.
6. **GPS ping** (`/ping-coordinates`): `COORDINATE_SNAPSHOT` item (~every 10s).
7. **Advancing a level** (`/level` with a matching `levelId`): sets `completed_at` on the current
   `TEAM_LEVEL`. If it was the final level, calls `claimWinner` → maybe sets `winner_team_id`.

### Game-backend API routes (the player-facing API, separate from this dashboard's API)

All under `/api`, all **POST**, all keyed off `user-id` + `team-id` request headers:
`/api/message`, `/api/level`, `/api/clear-chat`, `/api/ping-coordinates`, `/api/upload-photo`.
CORS is wide open (`*`) and there's no auth on the game API — prototype posture.

---

## 7. Gotchas summary (read this)

- **Progress completion = `completed_at` timestamp, not a `Status` field.** (The dashboard's
  `progress.ts` and `CLAUDE.md` have been reconciled to this.)
- **Two time formats coexist:** `created_at`/`updated_at` and `started_at`/`completed_at` are **ISO
  strings**; `deleted_at` and all `#<epoch>#` sort-key timestamps are **epoch seconds**.
- **`TEAM_LEVEL.id` ≠ `level_id`.** Join on `level_id`.
- **`USER.id` and the team id come from client headers**, not the server; users are created lazily.
- **Soft-deleted messages stay in the table** (`deleted_at`); filter them unless you want them.
- **Fallback AI replies are not persisted**, and some hint lines players see are never stored — the
  message log is not a complete transcript of what was displayed.
- **`GAME` embeds stale inline `teams[]`/`levels[]` snapshots**; the standalone `TEAM#`/`LEVEL#` items
  are authoritative.
- **The dashboard never writes to `#METADATA` or any backend item.** The start/pause clock lives on a
  separate `DASHBOARD_CONTROL` item — so `updated_at` on `#METADATA` is a reliable backend-activity
  signal. See **§8**.
- **`ttl` is declared but never set** — don't rely on TTL expiry.
- **On-demand billing** — no capacity ceiling, but full-table Scans still cost; prefer Queries/GSIs.

---

## 8. The dashboard's additive layer (how the dashboard writes)

The dashboard treats the game backend's items as **strictly read-only**. It never issues a write —
`PutItem`, `UpdateItem`, or `DeleteItem` — against any item type in §1–7. Everything it persists is
**additive**: brand-new item types the backend neither reads nor writes, placed in `PK`/`SK` ranges
that don't collide with anything backend-owned. This is what lets the two systems share one table
safely without coordination or locking.

### The three ways the dashboard stays additive

1. **New item types, never new fields on old items.** The dashboard introduces exactly two `ItemType`s
   of its own — `CHECKPOINT_EVENT` and `DASHBOARD_CONTROL`. It does **not** add attributes to `GAME`,
   `TEAM_LEVEL`, etc. (An earlier version wrote `started_at`/`paused_at`/`total_paused_ms` and bumped
   `updated_at` directly onto the `GAME#…/#METADATA` item — that made the dashboard a second writer into
   backend state and corrupted `updated_at` as a signal. That coupling has been removed; the clock now
   lives on its own `DASHBOARD_CONTROL` item.)

2. **Disjoint key space.** Both dashboard items are keyed under existing `PK`s (`GAME#…`, `TEAM#…`) so
   they co-locate for cheap `Query`, but their `SK`s (`CHECKPOINT_EVENT#…`, `DASHBOARD#CONTROL`) are
   values no backend item ever uses. A backend `Query` for `#METADATA` / `TEAM#` / `LEVEL#` / etc. can
   never return a dashboard item, and vice-versa. The `CHECKPOINT_EVENT` GSI1 partition
   (`CHECKPOINT_EVENTS`) is likewise a partition no backend item writes.

3. **Merge on read, not on write.** Where the dashboard needs its data to *appear* attached to a game
   (the start/pause clock on the game object), it stores separately and **joins at read time** in
   `games.ts` — rather than denormalizing onto the backend's item. The backend's item stays pristine.

### What the dashboard writes

| Item | ItemType | Lambda | Trigger | Key | Notable fields |
|---|---|---|---|---|---|
| **Checkpoint event** | `CHECKPOINT_EVENT` | `s3-event.ts` | EventBridge, on S3 photo upload | `PK=TEAM#<teamId>` · `SK=CHECKPOINT_EVENT#<epoch>#<levelId>` | `GSI1PK=CHECKPOINT_EVENTS`, `GSI1SK=<epoch>#<teamId>#<levelId>`, `team_id`, `level_id`, `s3_key`, `filename`, `created_at`(ISO) + `CreatedAt`(epoch) |
| **Dashboard control** | `DASHBOARD_CONTROL` | `game-control.ts` | Admin start/pause/reset (secret-gated) | `PK=GAME#<gameId>` · `SK=DASHBOARD#CONTROL` | `started_at`, `paused_at`, `total_paused_ms`, `updated_at` |

**`CHECKPOINT_EVENT`** — the dashboard's real-time notification feed. When a player photo lands in the
S3 bucket (key `teamId/levelId/<epoch>_<userId>.png`), an EventBridge rule fires `s3-event.ts`, which
writes one event item. The global `GSI1PK=CHECKPOINT_EVENTS` partition makes a single time-ordered feed
across all teams (queried newest-first by `events.ts` for the toast/notification stream). Note it writes
**both** `created_at` (ISO) and `CreatedAt` (epoch) — a dashboard convention; no backend item does this.
This item type is purely a dashboard invention; the backend's own record of the upload is the `PHOTO`
item (§3), which the dashboard leaves untouched.

**`DASHBOARD_CONTROL`** — the admin game-level start/pause clock (the master Stopwatch). The backend has
**no concept of a game-level clock** — its authoritative timing is per-`TEAM_LEVEL`
`started_at`/`completed_at` (§3). This item is a dashboard-only overlay:
- `start` → upsert with `started_at` + `ItemType` (guarded `attribute_not_exists(started_at)`, so it
  can't restart). The item is *created* on the first start.
- `pause` → set `paused_at`; `unpause` → accumulate `total_paused_ms`, remove `paused_at`.
- `reset` → **delete** the item to zero the clock. Guarded so it refuses (HTTP 409) to reset a *running*
  clock unless `{force: true}` is passed. The next `start` cleanly recreates it.
- `games.ts` reads these items alongside the `GAME` scan and merges `started_at`/`paused_at`/
  `total_paused_ms` onto the matching game (by `PK`) in the `/api/games` response — so the frontend sees
  them on the game object even though they live on a separate item.

### Consequences of the boundary

- **`updated_at` on `#METADATA` is trustworthy again** — only the backend writes it, so it reflects real
  gameplay activity, never a dashboard action.
- **Clean reset / re-run** — clearing a game's clock is a single delete of a dashboard-owned item;
  backend data (progress, winner, chat) is by definition unaffected.
- **Orphans are harmless** — if the backend deletes a game, its `DASHBOARD_CONTROL` item is
  dashboard-owned and won't be cleaned up, but `games.ts` merges by `PK` so an orphan with no matching
  `GAME` is simply ignored.
- **Infra is also disjoint** — the dashboard CDK stack references the table by ARN and never declares it,
  so a backend `cdk deploy` and a dashboard deploy don't fight over the resource. (The shared table now
  has PITR + deletion protection enabled; a stack *destroy*/replace is the remaining catastrophic risk,
  tracked in the backend repo.)

### Dashboard read access patterns (additions to §4)

| You want… | How |
|---|---|
| The global checkpoint-event feed | `Query` GSI1 `GSI1PK=CHECKPOINT_EVENTS`, `ScanIndexForward=false`, optional `GSI1SK > since` |
| A game's dashboard clock | `GetItem` PK=`GAME#<id>`, SK=`DASHBOARD#CONTROL` (or read it merged onto the game via `/api/games`) |
</content>
</invoke>
