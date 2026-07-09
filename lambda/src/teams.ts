import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { docClient, TABLE_NAME, response, errorResponse } from "./shared";

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const gameId = event.pathParameters?.gameId;
    if (!gameId) {
      return errorResponse(400, "Missing gameId path parameter");
    }

    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
        ExpressionAttributeValues: {
          ":pk": `GAME#${gameId}`,
          ":skPrefix": "TEAM#",
        },
      })
    );

    return response(200, { teams: result.Items ?? [] });
  } catch (err) {
    console.error("Error fetching teams:", err);
    return errorResponse(500, "Failed to fetch teams");
  }
}
