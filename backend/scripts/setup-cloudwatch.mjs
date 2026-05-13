#!/usr/bin/env node
// Sets up CloudWatch Logs retention, X-Ray tracing, alarms, and dashboard
// Run: AWS_REGION=us-east-1 AWS_ACCOUNT_ID=xxx ALERT_EMAIL=acceslyoficial@gmail.com node scripts/setup-cloudwatch.mjs

import {
  CloudWatchClient,
  PutMetricAlarmCommand,
  PutDashboardCommand,
} from '@aws-sdk/client-cloudwatch';
import {
  CloudWatchLogsClient,
  PutRetentionPolicyCommand,
  CreateLogGroupCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import {
  LambdaClient,
  UpdateFunctionConfigurationCommand,
} from '@aws-sdk/client-lambda';
import {
  ApiGatewayV2Client,
  UpdateStageCommand,
} from '@aws-sdk/client-apigatewayv2';
import {
  IAMClient,
  AttachRolePolicyCommand,
} from '@aws-sdk/client-iam';
import {
  SNSClient,
  CreateTopicCommand,
  SubscribeCommand,
  ListSubscriptionsByTopicCommand,
} from '@aws-sdk/client-sns';

const region    = process.env.AWS_REGION    ?? 'us-east-1';
const accountId = process.env.AWS_ACCOUNT_ID;
const apiId     = process.env.API_GATEWAY_ID ?? '7xteb2jknk';
const alertEmail = process.env.ALERT_EMAIL  ?? 'acceslyoficial@gmail.com';

if (!accountId) throw new Error('AWS_ACCOUNT_ID required');

const cw     = new CloudWatchClient({ region });
const cwLogs = new CloudWatchLogsClient({ region });
const lambda = new LambdaClient({ region });
const apigw  = new ApiGatewayV2Client({ region });
const iam    = new IAMClient({ region });
const sns    = new SNSClient({ region });

const LAMBDAS = [
  'createWallet',
  'getFragment2',
  'sep30Handler',
  'manageTTL',
  'etherfuseKYC',
  'etherfuseOrder',
  'etherfuseWebhook',
  'distributeYield',
];

// ---------------------------------------------------------------------------
// 1. SNS topic for alerts
// ---------------------------------------------------------------------------
const topic = await sns.send(new CreateTopicCommand({ Name: 'accesly-alerts' }));
const topicArn = topic.TopicArn;
console.log(`✓ SNS topic: ${topicArn}`);

// Subscribe email if not already subscribed
const subs = await sns.send(new ListSubscriptionsByTopicCommand({ TopicArn: topicArn }));
const alreadySubscribed = subs.Subscriptions?.some(s => s.Endpoint === alertEmail);
if (!alreadySubscribed) {
  await sns.send(new SubscribeCommand({
    TopicArn: topicArn,
    Protocol: 'email',
    Endpoint: alertEmail,
  }));
  console.log(`✓ Subscription pending — confirm the email sent to ${alertEmail}`);
} else {
  console.log(`✓ Email already subscribed: ${alertEmail}`);
}

// ---------------------------------------------------------------------------
// 2. Attach X-Ray policy to Lambda execution role
// ---------------------------------------------------------------------------
try {
  await iam.send(new AttachRolePolicyCommand({
    RoleName: 'accesly-lambda-role',
    PolicyArn: 'arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess',
  }));
  console.log(`✓ X-Ray policy attached to accesly-lambda-role`);
} catch (err) {
  if (!err.message?.includes('already attached')) throw err;
  console.log(`✓ X-Ray policy already attached`);
}

// ---------------------------------------------------------------------------
// 3. CloudWatch Logs: create log groups + 90-day retention
// ---------------------------------------------------------------------------
for (const name of LAMBDAS) {
  const logGroup = `/aws/lambda/${name}`;
  try {
    await cwLogs.send(new CreateLogGroupCommand({ logGroupName: logGroup }));
  } catch (err) {
    if (!err.name?.includes('ResourceAlreadyExists')) throw err;
  }
  await cwLogs.send(new PutRetentionPolicyCommand({
    logGroupName: logGroup,
    retentionInDays: 90,
  }));
  console.log(`✓ Log retention 90d: ${logGroup}`);
}

// ---------------------------------------------------------------------------
// 4. Enable X-Ray active tracing on all Lambdas
// ---------------------------------------------------------------------------
for (const name of LAMBDAS) {
  await lambda.send(new UpdateFunctionConfigurationCommand({
    FunctionName: name,
    TracingConfig: { Mode: 'Active' },
  }));
  console.log(`✓ X-Ray active: ${name}`);
}

// ---------------------------------------------------------------------------
// 5. Enable X-Ray on API Gateway $default stage
// ---------------------------------------------------------------------------
try {
  await apigw.send(new UpdateStageCommand({
    ApiId: apiId,
    StageName: '$default',
    DefaultRouteSettings: {
      DetailedMetricsEnabled: true,
    },
  }));
  console.log(`✓ API Gateway detailed metrics enabled`);
} catch (err) {
  console.warn(`⚠ API Gateway stage update: ${err.message}`);
}

// ---------------------------------------------------------------------------
// 6. CloudWatch Alarms
// ---------------------------------------------------------------------------
const alarms = [
  // Lambda errors — all functions
  ...LAMBDAS.map(name => ({
    AlarmName: `lambda-errors-${name}`,
    AlarmDescription: `Lambda ${name} errors`,
    Namespace: 'AWS/Lambda',
    MetricName: 'Errors',
    Dimensions: [{ Name: 'FunctionName', Value: name }],
    Statistic: 'Sum',
    Period: 300,
    EvaluationPeriods: 1,
    Threshold: 1,
    ComparisonOperator: 'GreaterThanOrEqualToThreshold',
    TreatMissingData: 'notBreaching',
    AlarmActions: [topicArn],
  })),
  // createWallet latencia > 5s (p99)
  {
    AlarmName: 'lambda-latency-createWallet',
    AlarmDescription: 'createWallet p99 latency > 5s',
    Namespace: 'AWS/Lambda',
    MetricName: 'Duration',
    Dimensions: [{ Name: 'FunctionName', Value: 'createWallet' }],
    ExtendedStatistic: 'p99',
    Period: 300,
    EvaluationPeriods: 2,
    Threshold: 5000,
    ComparisonOperator: 'GreaterThanThreshold',
    TreatMissingData: 'notBreaching',
    AlarmActions: [topicArn],
  },
  // getFragment2 error rate > 1%
  {
    AlarmName: 'lambda-errorrate-getFragment2',
    AlarmDescription: 'getFragment2 error rate > 1% — may indicate KMS issues',
    Namespace: 'AWS/Lambda',
    MetricName: 'Errors',
    Dimensions: [{ Name: 'FunctionName', Value: 'getFragment2' }],
    Statistic: 'Average',
    Period: 300,
    EvaluationPeriods: 2,
    Threshold: 0.01,
    ComparisonOperator: 'GreaterThanThreshold',
    TreatMissingData: 'notBreaching',
    AlarmActions: [topicArn],
  },
  // Lambda throttles — any function
  ...LAMBDAS.map(name => ({
    AlarmName: `lambda-throttles-${name}`,
    AlarmDescription: `Lambda ${name} throttled`,
    Namespace: 'AWS/Lambda',
    MetricName: 'Throttles',
    Dimensions: [{ Name: 'FunctionName', Value: name }],
    Statistic: 'Sum',
    Period: 300,
    EvaluationPeriods: 1,
    Threshold: 5,
    ComparisonOperator: 'GreaterThanOrEqualToThreshold',
    TreatMissingData: 'notBreaching',
    AlarmActions: [topicArn],
  })),
  // API Gateway 5xx errors
  {
    AlarmName: 'apigw-5xx-errors',
    AlarmDescription: 'API Gateway 5xx error rate',
    Namespace: 'AWS/ApiGateway',
    MetricName: '5XXError',
    Dimensions: [{ Name: 'ApiId', Value: apiId }],
    Statistic: 'Sum',
    Period: 300,
    EvaluationPeriods: 1,
    Threshold: 5,
    ComparisonOperator: 'GreaterThanOrEqualToThreshold',
    TreatMissingData: 'notBreaching',
    AlarmActions: [topicArn],
  },
  // API Gateway latency p99 > 10s
  {
    AlarmName: 'apigw-latency-p99',
    AlarmDescription: 'API Gateway p99 latency > 10s',
    Namespace: 'AWS/ApiGateway',
    MetricName: 'Latency',
    Dimensions: [{ Name: 'ApiId', Value: apiId }],
    ExtendedStatistic: 'p99',
    Period: 300,
    EvaluationPeriods: 2,
    Threshold: 10000,
    ComparisonOperator: 'GreaterThanThreshold',
    TreatMissingData: 'notBreaching',
    AlarmActions: [topicArn],
  },
];

for (const alarm of alarms) {
  await cw.send(new PutMetricAlarmCommand(alarm));
  console.log(`✓ Alarm: ${alarm.AlarmName}`);
}

// ---------------------------------------------------------------------------
// 7. CloudWatch Dashboard
// ---------------------------------------------------------------------------
const dashboard = {
  widgets: [
    {
      type: 'metric',
      x: 0, y: 0, width: 12, height: 6,
      properties: {
        title: 'Lambda Errors',
        metrics: LAMBDAS.map(name => ['AWS/Lambda', 'Errors', 'FunctionName', name]),
        period: 300,
        stat: 'Sum',
        view: 'timeSeries',
      },
    },
    {
      type: 'metric',
      x: 12, y: 0, width: 12, height: 6,
      properties: {
        title: 'Lambda Duration (p99)',
        metrics: LAMBDAS.map(name => ['AWS/Lambda', 'Duration', 'FunctionName', name, { stat: 'p99' }]),
        period: 300,
        view: 'timeSeries',
      },
    },
    {
      type: 'metric',
      x: 0, y: 6, width: 12, height: 6,
      properties: {
        title: 'API Gateway — Requests & 5xx',
        metrics: [
          ['AWS/ApiGateway', 'Count', 'ApiId', apiId, { stat: 'Sum', label: 'Requests' }],
          ['AWS/ApiGateway', '5XXError', 'ApiId', apiId, { stat: 'Sum', label: '5xx Errors' }],
        ],
        period: 300,
        view: 'timeSeries',
      },
    },
    {
      type: 'metric',
      x: 12, y: 6, width: 12, height: 6,
      properties: {
        title: 'Lambda Throttles',
        metrics: LAMBDAS.map(name => ['AWS/Lambda', 'Throttles', 'FunctionName', name]),
        period: 300,
        stat: 'Sum',
        view: 'timeSeries',
      },
    },
    {
      type: 'metric',
      x: 0, y: 12, width: 12, height: 6,
      properties: {
        title: 'DynamoDB — Consumed Capacity',
        metrics: [
          ['AWS/DynamoDB', 'ConsumedReadCapacityUnits', 'TableName', 'user_fragments', { stat: 'Sum' }],
          ['AWS/DynamoDB', 'ConsumedWriteCapacityUnits', 'TableName', 'user_fragments', { stat: 'Sum' }],
          ['AWS/DynamoDB', 'ConsumedReadCapacityUnits', 'TableName', 'wallets', { stat: 'Sum' }],
          ['AWS/DynamoDB', 'ConsumedWriteCapacityUnits', 'TableName', 'wallets', { stat: 'Sum' }],
        ],
        period: 300,
        view: 'timeSeries',
      },
    },
    {
      type: 'alarm',
      x: 12, y: 12, width: 12, height: 6,
      properties: {
        title: 'Alarm Status',
        alarms: [
          `arn:aws:cloudwatch:${region}:${accountId}:alarm:apigw-5xx-errors`,
          `arn:aws:cloudwatch:${region}:${accountId}:alarm:lambda-latency-createWallet`,
          `arn:aws:cloudwatch:${region}:${accountId}:alarm:lambda-errorrate-getFragment2`,
        ],
      },
    },
  ],
};

await cw.send(new PutDashboardCommand({
  DashboardName: 'accesly-backend',
  DashboardBody: JSON.stringify(dashboard),
}));
console.log(`\n✓ Dashboard: accesly-backend`);
console.log(`  https://${region}.console.aws.amazon.com/cloudwatch/home#dashboards:name=accesly-backend`);

console.log(`\n✓ Setup complete`);
console.log(`  Confirm the SNS subscription email sent to ${alertEmail}`);
