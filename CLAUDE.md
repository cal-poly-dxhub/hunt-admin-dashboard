# CLAUDE.md

Real-time admin dashboard for monitoring a campus scavenger ("duck") hunt at Cal Poly SLO.
It is **read-mostly**: it observes data written by a separate game backend (not in this repo)
and only writes game start/pause state. React + Mapbox frontend, AWS CDK infra, Lambda API.

## Environment

The AWS resources belong to a separate `duck` profile. Local + deploy config lives in `.env`
(loaded by `bin/app.ts` via `dotenv/config`). Key vars:

```
DUCK_HUNT_TABLE_NAME=ScavengerHuntData-dev-sshreyy   # single DynamoDB table (shared with game backend)
PHOTO_BUCKET_NAME=photo-bucket-dev-sshreyy           # existing S3 bucket for team checkpoint photos
AWS_PROFILE=duck                                     # use for all aws/cdk commands
AWS_REGION=us-west-2   AWS_ACCOUNT=077938161517
```
Frontend also needs `frontend/.env` with `VITE_MAPBOX_TOKEN=...`.

Run AWS CLI against the data: `AWS_PROFILE=duck aws dynamodb ... --region us-west-2`.

## Commands

```bash
# Frontend (workspace: frontend/)
cd frontend && npx vite            # dev server; proxies /api/* → deployed API Gateway (prod stage)
cd frontend && npm run build       # tsc -b && vite build → frontend/dist

# Deploy (build frontend first — CDK deploys frontend/dist as a static asset)
cd frontend && npm run build && cd ..
source .env && npx cdk deploy --profile duck

npx cdk diff --profile duck        # yarn workspaces; root scripts: build, synth, deploy, diff
```

The Vite dev proxy target is hardcoded in `frontend/vite.config.ts` (rewrites `/api` → `/prod/api`).
Update it if the API Gateway id changes.

## Architecture

```
Browser (React + Vite + Tailwind v4 + Mapbox GL)
  └─ CloudFront: / → S3 (static frontend),  /api/* → API Gateway (prod stage)
        └─ Lambda (Node 22, one fn per route) → DynamoDB (read) / S3 (presign)
S3 photo upload → EventBridge → s3-event Lambda → DynamoDB (writes CHECKPOINT_EVENT)
```

- **Infra:** `lib/dashboard-stack.ts` (all resources), `bin/app.ts` (entry/config).
- **API:** `lambda/src/*.ts`, one file per route. `shared.ts` = DocumentClient + `response()`/`errorResponse()` + CORS headers.
- **Frontend:** `frontend/src/` — `hooks/` (polling data fetchers), `lib/api.ts` (typed client + all response interfaces), `lib/colors.ts` (golden-angle team colors), `components/`, `data/ducks.json` (checkpoint metadata keyed by numeric id).

### API routes
| Method | Path | Lambda | Notes |
|---|---|---|---|
| GET | `/api/games` | games.ts | full-table Scan filtered `ItemType = GAME` |
| GET | `/api/games/{gameId}/teams` | teams.ts | Query PK=`GAME#id`, SK begins_with `TEAM#` |
| POST | `/api/games/{gameId}/control` | game-control.ts | `{action: start\|pause\|unpause\|reset}` (`reset` accepts `force: true`); needs `x-admin-secret` header |
| POST | `/api/verify` | verify.ts | checks admin secret only |
| GET | `/api/teams/{teamId}/progress` | progress.ts | Query PK=`TEAM#id`, SK begins_with `LEVEL#` |
| GET | `/api/teams/{teamId}/coords?since=` | coords.ts | GSI1 query; `since` = epoch seconds |
| GET | `/api/teams/{teamId}/messages` | messages.ts | |
| GET | `/api/events?since=&limit=` | events.ts | GSI1 query, newest first; checkpoint feed |
| GET | `/api/photo-url?key=` | photo-url.ts | presigned S3 URL (uses PHOTO_BUCKET, not the table) |

## DynamoDB data model (single-table)

One table, `PK`/`SK` composite key, `GSI1` (`GSI1PK`/`GSI1SK`) for time-ordered feeds.
Every item has an `ItemType`. This repo mostly **reads** these; the game backend writes them.

| Entity | PK | SK | Notes |
|---|---|---|---|
| Game | `GAME#<id>` | `#METADATA` | `ItemType=GAME`. Embeds `levels[]`/`teams[]` inline. Has `created_at`/`updated_at`, optional `winner_team_id`. **Backend-owned — the dashboard never writes here.** **No `name`/`status` attribute.** |
| Team | `GAME#<id>` | `TEAM#<teamId>` | |
| Progress (`TEAM_LEVEL`) | `TEAM#<teamId>` | `LEVEL#<levelId>` | complete iff `completed_at` is set (**no `Status` field** — see GAME_BACKEND_SCHEMA.md §3). Sort route by `index`; join to level via `level_id`, not `id` |
| Coord snapshot | `TEAM#<teamId>` | `COORDINATE_SNAPSHOT#<epoch>#<id>` | queried via GSI1; lat/long come back as **strings** |
| Checkpoint event *(dashboard)* | `TEAM#<teamId>` | `CHECKPOINT_EVENT#<epoch>#<levelId>` | GSI1PK=`CHECKPOINT_EVENTS`; written by `s3-event.ts` |
| Dashboard control *(dashboard)* | `GAME#<id>` | `DASHBOARD#CONTROL` | `ItemType=DASHBOARD_CONTROL`. Start/pause clock; written by `game-control.ts` |

**Writer ownership (important):** the dashboard is read-only against game-backend items and only
writes its own two item types (`CHECKPOINT_EVENT`, `DASHBOARD_CONTROL`). The game-level start/pause
clock lives on the separate `DASHBOARD#CONTROL` item — **not** on the game's `#METADATA` — so the
dashboard never mutates backend-owned data. `game-control.ts`: `start` sets `started_at` (guarded so
it can't restart), `pause` sets `paused_at`, `unpause` removes `paused_at` and accumulates
`total_paused_ms`, and `reset` **deletes** the control item to zero the clock (refuses with 409 if the
clock is running unless `force: true`; the next `start` recreates it). `games.ts` merges those fields
onto each game in the `/api/games` response, and the frontend Stopwatch reads them off the game object.
See GAME_BACKEND_SCHEMA.md "Writers into this table".

Checkpoint flow: a team photo lands in the S3 bucket under key `teamId/levelId/timestamp_userId.png`;
EventBridge fires `s3-event.ts`, which parses the key and writes a `CHECKPOINT_EVENT`. The dashboard
polls `/api/events` and shows a toast + notification.

### Quick check: how many games exist
```bash
AWS_PROFILE=duck aws dynamodb scan --region us-west-2 \
  --table-name ScavengerHuntData-dev-sshreyy \
  --filter-expression "ItemType = :t" \
  --expression-attribute-values '{":t":{"S":"GAME"}}'
```

## Conventions & gotchas

- **Games have no name/status** — the UI identifies games only by id and timestamps. Don't assume those fields exist.
- Numeric attributes (coords) arrive as strings from DynamoDB; parse before use (`api.ts` interfaces note this).
- Data fetching hooks poll on an interval with exponential backoff on error (see `hooks/`) — there are no websockets.
- Lambdas have **read-only** table IAM (`Query`/`Scan`/`GetItem`), except `game-control` (`UpdateItem`/`GetItem`) and `s3-event` (`PutItem`). Adding a route that writes needs a matching policy in the stack.
- `ADMIN_SECRET` gates game-control/verify; defaults to `CHANGE_ME` if unset at deploy — set it in `.env`.
- This is prototype code (see README disclaimers): relaxed auth, CORS `*`, no tests.
</content>
</invoke>
