import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import * as path from "path";

interface DashboardStackProps extends cdk.StackProps {
  tableName: string;
  photoBucketName: string;
}

export class DashboardStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DashboardStackProps) {
    super(scope, id, props);

    const { tableName, photoBucketName } = props;
    const tableArn = `arn:aws:dynamodb:${this.region}:${this.account}:table/${tableName}`;

    // --- Reference existing photo bucket ---
    const photoBucket = s3.Bucket.fromBucketName(this, "PhotoBucket", photoBucketName);

    // --- S3 Bucket for frontend ---
    const frontendBucket = new s3.Bucket(this, "FrontendBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    new s3deploy.BucketDeployment(this, "DeployFrontend", {
      sources: [s3deploy.Source.asset(path.join(__dirname, "../frontend/dist"))],
      destinationBucket: frontendBucket,
    });

    // --- API Gateway ---
    const api = new apigateway.RestApi(this, "AdminApi", {
      restApiName: "HuntAdminDashboardApi",
      deployOptions: { stageName: "prod" },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ["Content-Type", "Authorization", "x-admin-secret"],
      },
    });

    // --- DynamoDB read-only policy ---
    const dynamoReadPolicy = new iam.PolicyStatement({
      actions: ["dynamodb:Query", "dynamodb:Scan", "dynamodb:GetItem"],
      resources: [tableArn, `${tableArn}/index/*`],
    });

    // --- Lambda environment ---
    const lambdaEnv = {
      TABLE_NAME: tableName,
    };

    // --- Lambda functions ---
    const gamesFunction = new NodejsFunction(this, "GamesFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "../lambda/src/games.ts"),
      handler: "handler",
      environment: lambdaEnv,
    });
    gamesFunction.addToRolePolicy(dynamoReadPolicy);

    const teamsFunction = new NodejsFunction(this, "TeamsFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "../lambda/src/teams.ts"),
      handler: "handler",
      environment: lambdaEnv,
    });
    teamsFunction.addToRolePolicy(dynamoReadPolicy);

    const progressFunction = new NodejsFunction(this, "ProgressFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "../lambda/src/progress.ts"),
      handler: "handler",
      environment: lambdaEnv,
    });
    progressFunction.addToRolePolicy(dynamoReadPolicy);

    const coordsFunction = new NodejsFunction(this, "CoordsFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "../lambda/src/coords.ts"),
      handler: "handler",
      environment: lambdaEnv,
    });
    coordsFunction.addToRolePolicy(dynamoReadPolicy);

    const messagesFunction = new NodejsFunction(this, "MessagesFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "../lambda/src/messages.ts"),
      handler: "handler",
      environment: lambdaEnv,
    });
    messagesFunction.addToRolePolicy(dynamoReadPolicy);

    const eventsFunction = new NodejsFunction(this, "EventsFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "../lambda/src/events.ts"),
      handler: "handler",
      environment: lambdaEnv,
    });
    eventsFunction.addToRolePolicy(dynamoReadPolicy);

    const photoUrlFunction = new NodejsFunction(this, "PhotoUrlFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "../lambda/src/photo-url.ts"),
      handler: "handler",
      environment: {
        PHOTO_BUCKET: photoBucketName,
      },
    });
    photoBucket.grantRead(photoUrlFunction);

    // --- Game control (start/pause/unpause/reset) ---
    const gameControlPolicy = new iam.PolicyStatement({
      actions: [
        "dynamodb:UpdateItem",
        "dynamodb:GetItem",
        "dynamodb:DeleteItem", // reset action deletes the DASHBOARD#CONTROL item
      ],
      resources: [tableArn],
    });

    const gameControlFunction = new NodejsFunction(this, "GameControlFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "../lambda/src/game-control.ts"),
      handler: "handler",
      environment: {
        TABLE_NAME: tableName,
        ADMIN_SECRET: process.env.ADMIN_SECRET || "CHANGE_ME",
      },
    });
    gameControlFunction.addToRolePolicy(gameControlPolicy);

    // --- Verify (auth check only) ---
    const verifyFunction = new NodejsFunction(this, "VerifyFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "../lambda/src/verify.ts"),
      handler: "handler",
      environment: {
        TABLE_NAME: tableName,
        ADMIN_SECRET: process.env.ADMIN_SECRET || "CHANGE_ME",
      },
    });

    // --- S3 event handler ---
    const dynamoWritePolicy = new iam.PolicyStatement({
      actions: ["dynamodb:PutItem"],
      resources: [tableArn],
    });

    const s3EventFunction = new NodejsFunction(this, "S3EventFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "../lambda/src/s3-event.ts"),
      handler: "handler",
      environment: lambdaEnv,
    });
    s3EventFunction.addToRolePolicy(dynamoWritePolicy);

    // EventBridge rule for S3 object creation (EventBridge enabled on bucket separately)
    new events.Rule(this, "PhotoUploadRule", {
      eventPattern: {
        source: ["aws.s3"],
        detailType: ["Object Created"],
        detail: {
          bucket: { name: [photoBucketName] },
        },
      },
      targets: [new targets.LambdaFunction(s3EventFunction)],
    });

    // --- API Gateway resources ---
    const apiResource = api.root.addResource("api");

    // POST /api/verify
    const verifyResource = apiResource.addResource("verify");
    verifyResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(verifyFunction),
    );

    // GET /api/games
    const gamesResource = apiResource.addResource("games");
    gamesResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(gamesFunction)
    );

    // GET /api/games/{gameId}/teams
    const gameIdResource = gamesResource.addResource("{gameId}");
    const teamsResource = gameIdResource.addResource("teams");
    teamsResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(teamsFunction)
    );

    // POST /api/games/{gameId}/control
    const controlResource = gameIdResource.addResource("control");
    controlResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(gameControlFunction),
    );

    // GET /api/teams/{teamId}/progress
    const teamsBaseResource = apiResource.addResource("teams");
    const teamIdResource = teamsBaseResource.addResource("{teamId}");
    const progressResource = teamIdResource.addResource("progress");
    progressResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(progressFunction)
    );

    // GET /api/teams/{teamId}/coords
    const coordsResource = teamIdResource.addResource("coords");
    coordsResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(coordsFunction)
    );

    // GET /api/teams/{teamId}/messages
    const messagesResource = teamIdResource.addResource("messages");
    messagesResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(messagesFunction)
    );

    // GET /api/events
    const eventsResource = apiResource.addResource("events");
    eventsResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(eventsFunction)
    );

    // GET /api/photo-url?key=...
    const photoUrlResource = apiResource.addResource("photo-url");
    photoUrlResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(photoUrlFunction)
    );

    // --- CloudFront ---
    const distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: {
        origin:
          origins.S3BucketOrigin.withOriginAccessControl(frontendBucket),
        viewerProtocolPolicy:
          cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      additionalBehaviors: {
        "/api/*": {
          origin: new origins.RestApiOrigin(api),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy:
            cloudfront.OriginRequestPolicy
              .ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      defaultRootObject: "index.html",
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
        },
      ],
    });

    // --- Outputs ---
    new cdk.CfnOutput(this, "DistributionUrl", {
      value: `https://${distribution.distributionDomainName}`,
      description: "CloudFront distribution URL",
    });

    new cdk.CfnOutput(this, "ApiUrl", {
      value: api.url,
      description: "API Gateway URL",
    });
  }
}
