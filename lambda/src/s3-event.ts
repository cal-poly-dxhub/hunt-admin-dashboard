import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { S3Event } from "aws-lambda";
import { docClient, TABLE_NAME } from "./shared";

export async function handler(event: S3Event): Promise<void> {
  for (const record of event.Records) {
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    // Key format: teamId/levelId/timestamp_userId.png
    const parts = key.split("/");
    if (parts.length < 3) continue;

    const teamId = parts[0];
    const levelId = parts[1];
    const filename = parts[2];
    const timestamp = Math.floor(new Date(record.eventTime).getTime() / 1000);

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `TEAM#${teamId}`,
          SK: `CHECKPOINT_EVENT#${timestamp}#${levelId}`,
          GSI1PK: `CHECKPOINT_EVENTS`,
          GSI1SK: `${timestamp}#${teamId}#${levelId}`,
          ItemType: "CHECKPOINT_EVENT",
          team_id: teamId,
          level_id: levelId,
          s3_key: key,
          filename,
          created_at: record.eventTime,
          CreatedAt: timestamp,
        },
      }),
    );

    console.log(`Checkpoint event recorded: team=${teamId} level=${levelId}`);
  }
}
