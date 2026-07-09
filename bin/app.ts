#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { DashboardStack } from "../lib/dashboard-stack";

const app = new cdk.App();

const tableName =
  process.env.DUCK_HUNT_TABLE_NAME || "ScavengerHuntData-dev-sshreyy";
const photoBucketName =
  process.env.PHOTO_BUCKET_NAME || "photo-bucket-dev-sshreyy";
const region = process.env.AWS_REGION || "us-west-2";
const account = process.env.AWS_ACCOUNT || "077938161517";

new DashboardStack(app, "HuntAdminDashboardStack", {
  env: { account, region },
  tableName,
  photoBucketName,
});
