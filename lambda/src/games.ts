import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { docClient, TABLE_NAME, response, errorResponse } from "./shared";

// Dashboard-owned start/pause clock fields, stored on the DASHBOARD#CONTROL item
// (written by game-control.ts) and merged onto each game here so the frontend can
// keep reading them off the game object. See GAME_BACKEND_SCHEMA.md "Writers".
const CONTROL_FIELDS = ["started_at", "paused_at", "total_paused_ms"] as const;

export async function handler(
  _event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const games: Record<string, unknown>[] = [];
    // gameId -> the game's dashboard control fields
    const controls = new Map<string, Record<string, unknown>>();
    let lastKey: Record<string, unknown> | undefined;

    do {
      const result = await docClient.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: "ItemType = :game OR ItemType = :control",
          ExpressionAttributeValues: {
            ":game": "GAME",
            ":control": "DASHBOARD_CONTROL",
          },
          ExclusiveStartKey: lastKey,
        })
      );
      for (const item of result.Items ?? []) {
        if (item.ItemType === "GAME") {
          games.push(item);
        } else {
          // PK is GAME#<gameId>; key control fields by that PK.
          controls.set(item.PK as string, item);
        }
      }
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    // Merge dashboard control fields onto their game (matched by PK).
    for (const game of games) {
      const control = controls.get(game.PK as string);
      if (!control) continue;
      for (const field of CONTROL_FIELDS) {
        if (control[field] !== undefined) game[field] = control[field];
      }
    }

    return response(200, { games });
  } catch (err) {
    console.error("Error fetching games:", err);
    return errorResponse(500, "Failed to fetch games");
  }
}
