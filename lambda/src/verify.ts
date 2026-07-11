import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { response, errorResponse } from "./shared";

const ADMIN_SECRET = process.env.ADMIN_SECRET!;

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const secret =
    event.headers["x-admin-secret"] || event.headers["X-Admin-Secret"];
  if (secret !== ADMIN_SECRET) {
    return errorResponse(401, "Unauthorized");
  }
  return response(200, { ok: true });
}
