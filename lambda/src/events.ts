import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { docClient, TABLE_NAME, response, errorResponse } from "./shared";

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const since = event.queryStringParameters?.since;
    const limit = event.queryStringParameters?.limit
      ? parseInt(event.queryStringParameters.limit, 10)
      : 20;

    let keyConditionExpression = "GSI1PK = :pk";
    const expressionAttributeValues: Record<string, unknown> = {
      ":pk": "CHECKPOINT_EVENTS",
    };

    if (since) {
      keyConditionExpression += " AND GSI1SK > :since";
      expressionAttributeValues[":since"] = since;
    }

    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "GSI1",
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ScanIndexForward: false,
        Limit: limit,
      })
    );

    return response(200, { events: result.Items ?? [] });
  } catch (err) {
    console.error("Error fetching events:", err);
    return errorResponse(500, "Failed to fetch events");
  }
}
