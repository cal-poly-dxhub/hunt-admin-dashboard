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

    const since = event.queryStringParameters?.since;

    let keyConditionExpression =
      "GSI1PK = :pk AND begins_with(GSI1SK, :skPrefix)";
    const expressionAttributeValues: Record<string, unknown> = {
      ":pk": `TEAM#${teamId}`,
      ":skPrefix": "COORDINATE_SNAPSHOT#",
    };

    // If ?since= is provided, filter to snapshots after that epoch
    let filterExpression: string | undefined;
    if (since) {
      filterExpression = "CreatedAt >= :since";
      expressionAttributeValues[":since"] = parseInt(since, 10);
    }

    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "GSI1",
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ...(filterExpression && { FilterExpression: filterExpression }),
      })
    );

    return response(200, { coords: result.Items ?? [] });
  } catch (err) {
    console.error("Error fetching coords:", err);
    return errorResponse(500, "Failed to fetch coordinates");
  }
}
