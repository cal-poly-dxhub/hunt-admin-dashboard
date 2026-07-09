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

    const skStart = since
      ? `COORDINATE_SNAPSHOT#${String(parseInt(since, 10) + 1)}`
      : "COORDINATE_SNAPSHOT#";
    const expressionAttributeValues: Record<string, unknown> = {
      ":pk": `TEAM#${teamId}`,
      ":skMin": skStart,
      ":skMax": "COORDINATE_SNAPSHOT#~",
    };

    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk AND GSI1SK BETWEEN :skMin AND :skMax",
        ExpressionAttributeValues: expressionAttributeValues,
      })
    );

    const coords = (result.Items ?? []).map((item) => {
      // Synthesize CreatedAt from GSI1SK (COORDINATE_SNAPSHOT#<epoch>#<id>)
      if (!item.CreatedAt && item.GSI1SK) {
        const parts = (item.GSI1SK as string).split("#");
        if (parts.length >= 2) {
          item.CreatedAt = parseInt(parts[1], 10);
        }
      }
      return item;
    });

    return response(200, { coords });
  } catch (err) {
    console.error("Error fetching coords:", err);
    return errorResponse(500, "Failed to fetch coordinates");
  }
}
