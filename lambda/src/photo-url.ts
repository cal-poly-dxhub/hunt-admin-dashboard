import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { headers, errorResponse } from "./shared";

const s3 = new S3Client({});
const BUCKET = process.env.PHOTO_BUCKET!;

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const key = event.queryStringParameters?.key;
    if (!key) {
      return errorResponse(400, "Missing 'key' query parameter");
    }

    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    });

    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ url }),
    };
  } catch (err) {
    console.error("Error generating presigned URL:", err);
    return errorResponse(500, "Failed to generate photo URL");
  }
}
