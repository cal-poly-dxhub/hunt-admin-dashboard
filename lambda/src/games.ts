import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { docClient, TABLE_NAME, response, errorResponse } from "./shared";

export async function handler(
  _event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const items: Record<string, unknown>[] = [];
    let lastKey: Record<string, unknown> | undefined;

    do {
      const result = await docClient.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: "ItemType = :itemType",
          ExpressionAttributeValues: {
            ":itemType": "GAME",
          },
          ExclusiveStartKey: lastKey,
        })
      );
      items.push(...(result.Items ?? []));
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    return response(200, { games: items });
  } catch (err) {
    console.error("Error fetching games:", err);
    return errorResponse(500, "Failed to fetch games");
  }
}
