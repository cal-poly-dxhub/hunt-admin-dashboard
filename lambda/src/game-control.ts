import { DeleteCommand, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { docClient, TABLE_NAME, response, errorResponse } from "./shared";

const ADMIN_SECRET = process.env.ADMIN_SECRET!;
const CONTROL_SECRET = process.env.CONTROL_SECRET!;

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  try {
    // Layer 1: dashboard admin secret (shared with viewers) — must be valid.
    const secret =
      event.headers["x-admin-secret"] || event.headers["X-Admin-Secret"];
    if (secret !== ADMIN_SECRET) {
      return errorResponse(401, "Unauthorized");
    }

    // Layer 2: private control secret — required for EVERY game-control action
    // (start/pause/unpause/reset). Viewers with only the dashboard password have
    // no control access. Fail-closed: env defaults to a sentinel that no real
    // secret matches, so a misconfigured deploy rejects rather than opens up.
    const controlSecret =
      event.headers["x-control-secret"] || event.headers["X-Control-Secret"];
    if (controlSecret !== CONTROL_SECRET) {
      return errorResponse(403, "Requires control secret");
    }

    const gameId = event.pathParameters?.gameId;
    if (!gameId) return errorResponse(400, "Missing gameId");

    const body = JSON.parse(event.body || "{}");
    const action = body.action;

    // The game-level start/pause clock is dashboard-owned state. We write it to a
    // separate item (SK = DASHBOARD#CONTROL), NOT the game backend's #METADATA item,
    // so the dashboard never mutates game-backend-owned data. games.ts merges these
    // fields back onto each game on read. See SHARED_TABLE_MODEL.md "Writers".
    const key = { PK: `GAME#${gameId}`, SK: "DASHBOARD#CONTROL" };
    const now = new Date().toISOString();

    switch (action) {
      case "start": {
        await docClient.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: key,
            UpdateExpression:
              "SET started_at = :now, updated_at = :now, ItemType = :type",
            ConditionExpression: "attribute_not_exists(started_at)",
            ExpressionAttributeValues: {
              ":now": now,
              ":type": "DASHBOARD_CONTROL",
            },
          }),
        );
        return response(200, { started_at: now });
      }

      case "pause": {
        await docClient.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: key,
            UpdateExpression: "SET paused_at = :now, updated_at = :now",
            ConditionExpression:
              "attribute_exists(started_at) AND attribute_not_exists(paused_at)",
            ExpressionAttributeValues: { ":now": now },
          }),
        );
        return response(200, { paused_at: now });
      }

      case "unpause": {
        const getResult = await docClient.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: key,
          }),
        );
        const game = getResult.Item;
        if (!game || !game.paused_at) {
          return errorResponse(400, "Game is not paused");
        }
        const pausedMs = Date.now() - new Date(game.paused_at).getTime();
        const prevPausedMs = game.total_paused_ms ?? 0;

        await docClient.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: key,
            UpdateExpression:
              "SET total_paused_ms = :total, updated_at = :now REMOVE paused_at",
            ExpressionAttributeValues: {
              ":total": prevPausedMs + pausedMs,
              ":now": now,
            },
          }),
        );
        return response(200, { total_paused_ms: prevPausedMs + pausedMs });
      }

      case "reset": {
        // Clears the game-level clock by deleting the dashboard-owned control item.
        // Backend-owned data is never touched. The next `start` recreates the item.
        // Guard: refuse to reset a currently-RUNNING clock (started & not paused)
        // unless the caller explicitly passes { force: true }, so an accidental reset
        // can't silently zero a live game's elapsed time and lose total_paused_ms.
        try {
          await docClient.send(
            new DeleteCommand({
              TableName: TABLE_NAME,
              Key: key,
              ConditionExpression:
                body.force === true
                  ? undefined
                  : "attribute_not_exists(started_at) OR attribute_exists(paused_at)",
            }),
          );
        } catch (err: unknown) {
          if (
            err instanceof Error &&
            err.name === "ConditionalCheckFailedException"
          ) {
            return errorResponse(
              409,
              "Game clock is running. Pause it first, or resend with force: true.",
            );
          }
          throw err;
        }
        return response(200, { reset: true });
      }

      default:
        return errorResponse(
          400,
          "Invalid action. Use: start, pause, unpause, reset",
        );
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "ConditionalCheckFailedException") {
      return errorResponse(
        409,
        "Condition not met (game may already be started/paused/unpaused)",
      );
    }
    console.error("game-control error:", err);
    return errorResponse(500, "Internal error");
  }
}
