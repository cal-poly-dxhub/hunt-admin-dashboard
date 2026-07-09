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

    // TODO: This requires a two-step query:
    // 1. Query PK=TEAM#{teamId}, SK begins_with USER# to get all users on the team
    // 2. For each user, query their messages (PK=USER#{userId}, SK begins_with MESSAGE#)
    // Consider using BatchGetItem or parallel queries for efficiency.
    //
    // For now, return a placeholder indicating the endpoint is not yet implemented.

    return response(501, {
      message: "Not yet implemented — requires two-step query (see TODO in source)",
      teamId,
    });
  } catch (err) {
    console.error("Error fetching messages:", err);
    return errorResponse(500, "Failed to fetch messages");
  }
}
