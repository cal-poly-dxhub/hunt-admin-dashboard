import { S3Client, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
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
    const prefix = event.queryStringParameters?.prefix;

    if (!key && !prefix) {
      return errorResponse(400, "Missing 'key' or 'prefix' query parameter");
    }

    let resolvedKey = key;

    if (!resolvedKey && prefix) {
      const listResult = await s3.send(
        new ListObjectsV2Command({
          Bucket: BUCKET,
          Prefix: prefix,
        })
      );
      const objects = listResult.Contents ?? [];
      if (objects.length === 0) {
        return errorResponse(404, "No photos found");
      }
      // Pick the most recent by LastModified
      objects.sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0));
      resolvedKey = objects[0].Key!;
    }

    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: BUCKET, Key: resolvedKey }),
      { expiresIn: 3600 }
    );

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
