import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLE_NAME } from "./shared";

interface EventBridgeS3Event {
  detail: {
    bucket: { name: string };
    object: { key: string };
  };
  time: string;
}

export async function handler(event: EventBridgeS3Event): Promise<void> {
  const key = decodeURIComponent(event.detail.object.key.replace(/\+/g, " "));
  // Key format: teamId/levelId/timestamp_userId.png
  const parts = key.split("/");
  if (parts.length < 3) return;

  const teamId = parts[0];
  const levelId = parts[1];
  const filename = parts[2];
  const timestamp = Math.floor(new Date(event.time).getTime() / 1000);

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
        created_at: event.time,
        CreatedAt: timestamp,
      },
    }),
  );

  console.log(`Checkpoint event recorded: team=${teamId} level=${levelId}`);
}
