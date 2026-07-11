import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { docClient, TABLE_NAME, response, errorResponse } from "./shared";

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const teamId = event.pathParameters?.teamId;
    if (!teamId) {
      return errorResponse(400, "Missing teamId path parameter");
    }

    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
        ExpressionAttributeValues: {
          ":pk": `TEAM#${teamId}`,
          ":skPrefix": "LEVEL#",
        },
      })
    );

    const levels = result.Items ?? [];
    const total = levels.length;
    // A TEAM_LEVEL is complete iff completed_at is set — the game backend does
    // not write a Status field. See SHARED_TABLE_MODEL.md §3 (TeamLevel).
    const completed = levels.filter((item) => !!item.completed_at).length;

    return response(200, {
      teamId,
      total,
      completed,
      levels,
    });
  } catch (err) {
    console.error("Error fetching progress:", err);
    return errorResponse(500, "Failed to fetch progress");
  }
}
