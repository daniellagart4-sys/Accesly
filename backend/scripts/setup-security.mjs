#!/usr/bin/env node
// Sets up WAF, VPC with private subnets + VPC endpoints, and per-Lambda IAM roles
// Run: AWS_REGION=us-east-1 AWS_ACCOUNT_ID=xxx node scripts/setup-security.mjs

import {
  WAFV2Client,
  CreateWebACLCommand,
  ListWebACLsCommand,

} from '@aws-sdk/client-wafv2';
import {
  EC2Client,
  CreateVpcCommand,
  DescribeVpcsCommand,
  CreateSubnetCommand,
  DescribeSubnetsCommand,
  CreateSecurityGroupCommand,
  DescribeSecurityGroupsCommand,
  CreateVpcEndpointCommand,
  DescribeVpcEndpointsCommand,
  ModifyVpcAttributeCommand,
  AuthorizeSecurityGroupEgressCommand,
  RevokeSecurityGroupEgressCommand,
  DescribeAvailabilityZonesCommand,
} from '@aws-sdk/client-ec2';
import {
  IAMClient,
  CreateRoleCommand,
  GetRoleCommand,
  PutRolePolicyCommand,

} from '@aws-sdk/client-iam';
import {
  LambdaClient,
  UpdateFunctionConfigurationCommand,
} from '@aws-sdk/client-lambda';

const region    = process.env.AWS_REGION    ?? 'us-east-1';
const accountId = process.env.AWS_ACCOUNT_ID;


if (!accountId) throw new Error('AWS_ACCOUNT_ID required');

const waf    = new WAFV2Client({ region });
const ec2    = new EC2Client({ region });
const iam    = new IAMClient({ region });
const lambda = new LambdaClient({ region });

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
// 1. WAF WebACL
// ---------------------------------------------------------------------------
console.log('\n── WAF ─────────────────────────────────────────────────────────────');

const existingAcls = await waf.send(new ListWebACLsCommand({ Scope: 'REGIONAL' }));
let webAclArn = existingAcls.WebACLs?.find(a => a.Name === 'accesly-waf')?.ARN;

if (webAclArn) {
  console.log(`✓ WAF WebACL exists: ${webAclArn}`);
} else {
  const acl = await waf.send(new CreateWebACLCommand({
    Name: 'accesly-waf',
    Scope: 'REGIONAL',
    DefaultAction: { Allow: {} },
    Description: 'Accesly API Gateway protection',
    Rules: [
      {
        Name: 'AWSManagedRulesCommonRuleSet',
        Priority: 1,
        OverrideAction: { None: {} },
        Statement: {
          ManagedRuleGroupStatement: {
            VendorName: 'AWS',
            Name: 'AWSManagedRulesCommonRuleSet',
          },
        },
        VisibilityConfig: {
          SampledRequestsEnabled: true,
          CloudWatchMetricsEnabled: true,
          MetricName: 'CommonRuleSet',
        },
      },
      {
        Name: 'AWSManagedRulesKnownBadInputsRuleSet',
        Priority: 2,
        OverrideAction: { None: {} },
        Statement: {
          ManagedRuleGroupStatement: {
            VendorName: 'AWS',
            Name: 'AWSManagedRulesKnownBadInputsRuleSet',
          },
        },
        VisibilityConfig: {
          SampledRequestsEnabled: true,
          CloudWatchMetricsEnabled: true,
          MetricName: 'KnownBadInputs',
        },
      },
      {
        Name: 'AWSManagedRulesSQLiRuleSet',
        Priority: 3,
        OverrideAction: { None: {} },
        Statement: {
          ManagedRuleGroupStatement: {
            VendorName: 'AWS',
            Name: 'AWSManagedRulesSQLiRuleSet',
          },
        },
        VisibilityConfig: {
          SampledRequestsEnabled: true,
          CloudWatchMetricsEnabled: true,
          MetricName: 'SQLiRuleSet',
        },
      },
      {
        Name: 'RateLimitPerIP',
        Priority: 4,
        Action: { Block: {} },
        Statement: {
          RateBasedStatement: {
            Limit: 1000,  // requests per 5 minutes per IP
            AggregateKeyType: 'IP',
          },
        },
        VisibilityConfig: {
          SampledRequestsEnabled: true,
          CloudWatchMetricsEnabled: true,
          MetricName: 'RateLimitPerIP',
        },
      },
    ],
    VisibilityConfig: {
      SampledRequestsEnabled: true,
      CloudWatchMetricsEnabled: true,
      MetricName: 'accesly-waf',
    },
  }));
  webAclArn = acl.Summary?.ARN;
  console.log(`✓ WAF WebACL created: ${webAclArn}`);
}

// WAF association with HTTP API v2 is not supported directly.
// To apply WAF: put CloudFront in front and associate the WebACL with the distribution.
// The WebACL is ready — ARN stored for future CloudFront association.
console.log(`⚠ WAF association skipped — HTTP API v2 requires CloudFront as frontend.`);
console.log(`  WebACL ARN: ${webAclArn}`);

// ---------------------------------------------------------------------------
// 2. VPC + private subnets + security group
// ---------------------------------------------------------------------------
console.log('\n── VPC ─────────────────────────────────────────────────────────────');

const existingVpcs = await ec2.send(new DescribeVpcsCommand({
  Filters: [{ Name: 'tag:Name', Values: ['accesly-vpc'] }],
}));
let vpcId = existingVpcs.Vpcs?.[0]?.VpcId;

if (vpcId) {
  console.log(`✓ VPC exists: ${vpcId}`);
} else {
  const vpc = await ec2.send(new CreateVpcCommand({
    CidrBlock: '10.0.0.0/16',
    TagSpecifications: [{
      ResourceType: 'vpc',
      Tags: [{ Key: 'Name', Value: 'accesly-vpc' }],
    }],
  }));
  vpcId = vpc.Vpc?.VpcId;
  // Enable DNS hostnames (required for VPC endpoints)
  await ec2.send(new ModifyVpcAttributeCommand({
    VpcId: vpcId,
    EnableDnsHostnames: { Value: true },
  }));
  console.log(`✓ VPC created: ${vpcId}`);
}

// Get availability zones
const azs = await ec2.send(new DescribeAvailabilityZonesCommand({
  Filters: [{ Name: 'state', Values: ['available'] }],
}));
const az1 = azs.AvailabilityZones?.[0]?.ZoneName;
const az2 = azs.AvailabilityZones?.[1]?.ZoneName;

// Create two private subnets
const existingSubnets = await ec2.send(new DescribeSubnetsCommand({
  Filters: [{ Name: 'vpc-id', Values: [vpcId] }],
}));

let subnetIds = existingSubnets.Subnets?.map(s => s.SubnetId) ?? [];

if (subnetIds.length < 2) {
  const s1 = await ec2.send(new CreateSubnetCommand({
    VpcId: vpcId,
    CidrBlock: '10.0.1.0/24',
    AvailabilityZone: az1,
    TagSpecifications: [{
      ResourceType: 'subnet',
      Tags: [{ Key: 'Name', Value: 'accesly-private-1' }],
    }],
  }));
  const s2 = await ec2.send(new CreateSubnetCommand({
    VpcId: vpcId,
    CidrBlock: '10.0.2.0/24',
    AvailabilityZone: az2,
    TagSpecifications: [{
      ResourceType: 'subnet',
      Tags: [{ Key: 'Name', Value: 'accesly-private-2' }],
    }],
  }));
  subnetIds = [s1.Subnet?.SubnetId, s2.Subnet?.SubnetId];
  console.log(`✓ Private subnets: ${subnetIds.join(', ')}`);
} else {
  console.log(`✓ Subnets exist: ${subnetIds.join(', ')}`);
}

// Security group for Lambdas (outbound to VPC endpoints only)
const existingSGs = await ec2.send(new DescribeSecurityGroupsCommand({
  Filters: [
    { Name: 'vpc-id', Values: [vpcId] },
    { Name: 'group-name', Values: ['accesly-lambda-sg'] },
  ],
}));
let sgId = existingSGs.SecurityGroups?.[0]?.GroupId;

if (sgId) {
  console.log(`✓ Security group exists: ${sgId}`);
} else {
  const sg = await ec2.send(new CreateSecurityGroupCommand({
    GroupName: 'accesly-lambda-sg',
    Description: 'Accesly Lambda functions — outbound to VPC endpoints only',
    VpcId: vpcId,
    TagSpecifications: [{
      ResourceType: 'security-group',
      Tags: [{ Key: 'Name', Value: 'accesly-lambda-sg' }],
    }],
  }));
  sgId = sg.GroupId;

  // Remove default allow-all egress, add HTTPS only (for VPC endpoints)
  await ec2.send(new RevokeSecurityGroupEgressCommand({
    GroupId: sgId,
    IpPermissions: [{ IpProtocol: '-1', IpRanges: [{ CidrIp: '0.0.0.0/0' }] }],
  }));
  await ec2.send(new AuthorizeSecurityGroupEgressCommand({
    GroupId: sgId,
    IpPermissions: [{
      IpProtocol: 'tcp',
      FromPort: 443,
      ToPort: 443,
      IpRanges: [{ CidrIp: '10.0.0.0/16', Description: 'HTTPS to VPC endpoints' }],
    }],
  }));
  console.log(`✓ Security group created: ${sgId}`);
}

// ---------------------------------------------------------------------------
// 3. VPC Endpoints (so Lambdas in VPC can reach AWS services without NAT)
// ---------------------------------------------------------------------------
console.log('\n── VPC Endpoints ───────────────────────────────────────────────────');

const existingEndpoints = await ec2.send(new DescribeVpcEndpointsCommand({
  Filters: [{ Name: 'vpc-id', Values: [vpcId] }],
}));
const existingServices = new Set(
  existingEndpoints.VpcEndpoints
    ?.filter(e => e.State !== 'deleted')
    .map(e => e.ServiceName) ?? []
);

const gatewayEndpoints = [
  `com.amazonaws.${region}.dynamodb`,
  `com.amazonaws.${region}.s3`,
];

const interfaceEndpoints = [
  `com.amazonaws.${region}.kms`,
  `com.amazonaws.${region}.email-smtp`,  // SES SMTP
  `com.amazonaws.${region}.logs`,        // CloudWatch Logs
  `com.amazonaws.${region}.monitoring`,  // CloudWatch Metrics
  `com.amazonaws.${region}.xray`,        // X-Ray
];

// Gateway endpoints (free)
for (const svc of gatewayEndpoints) {
  if (existingServices.has(svc)) {
    console.log(`✓ Endpoint exists: ${svc.split('.').pop()}`);
    continue;
  }
  await ec2.send(new CreateVpcEndpointCommand({
    VpcId: vpcId,
    ServiceName: svc,
    VpcEndpointType: 'Gateway',
    TagSpecifications: [{
      ResourceType: 'vpc-endpoint',
      Tags: [{ Key: 'Name', Value: svc.split('.').pop() }],
    }],
  }));
  console.log(`✓ Gateway endpoint created: ${svc.split('.').pop()}`);
}

// Interface endpoints
for (const svc of interfaceEndpoints) {
  if (existingServices.has(svc)) {
    console.log(`✓ Endpoint exists: ${svc.split('.').pop()}`);
    continue;
  }
  await ec2.send(new CreateVpcEndpointCommand({
    VpcId: vpcId,
    ServiceName: svc,
    VpcEndpointType: 'Interface',
    SubnetIds: subnetIds,
    SecurityGroupIds: [sgId],
    PrivateDnsEnabled: true,
    TagSpecifications: [{
      ResourceType: 'vpc-endpoint',
      Tags: [{ Key: 'Name', Value: svc.split('.').pop() }],
    }],
  }));
  console.log(`✓ Interface endpoint created: ${svc.split('.').pop()}`);
}

// ---------------------------------------------------------------------------
// 4. Per-Lambda IAM roles (least privilege)
// ---------------------------------------------------------------------------
console.log('\n── IAM least privilege ─────────────────────────────────────────────');

const trustPolicy = JSON.stringify({
  Version: '2012-10-17',
  Statement: [{
    Effect: 'Allow',
    Principal: { Service: 'lambda.amazonaws.com' },
    Action: 'sts:AssumeRole',
  }],
});

const tableArn = (name) => `arn:aws:dynamodb:${region}:${accountId}:table/${name}`;
const kmsArn   = `arn:aws:kms:${region}:${accountId}:alias/accesly-user-fragments`;

const lambdaPolicies = {
  createWallet: {
    Statement: [
      {
        Effect: 'Allow',
        Action: ['dynamodb:PutItem', 'dynamodb:GetItem', 'dynamodb:TransactWriteItems'],
        Resource: [tableArn('user_fragments'), tableArn('email_fragments'), tableArn('wallets')],
      },
      { Effect: 'Allow', Action: ['kms:Encrypt', 'kms:GenerateDataKey'], Resource: kmsArn },
      { Effect: 'Allow', Action: ['ses:SendEmail', 'ses:SendRawEmail'], Resource: '*' },
    ],
  },
  getFragment2: {
    Statement: [
      { Effect: 'Allow', Action: ['dynamodb:GetItem'], Resource: tableArn('user_fragments') },
      { Effect: 'Allow', Action: ['kms:Decrypt'], Resource: kmsArn },
    ],
  },
  sep30Handler: {
    Statement: [
      { Effect: 'Allow', Action: ['dynamodb:GetItem'], Resource: tableArn('email_fragments') },
      { Effect: 'Allow', Action: ['kms:Decrypt'], Resource: kmsArn },
    ],
  },
  manageTTL: {
    Statement: [
      { Effect: 'Allow', Action: ['dynamodb:Scan', 'dynamodb:GetItem'], Resource: tableArn('wallets') },
    ],
  },
  etherfuseKYC: {
    Statement: [
      {
        Effect: 'Allow',
        Action: ['dynamodb:GetItem', 'dynamodb:UpdateItem', 'dynamodb:PutItem'],
        Resource: tableArn('user_kyc_status'),
      },
    ],
  },
  etherfuseOrder: {
    Statement: [
      { Effect: 'Allow', Action: ['dynamodb:GetItem'], Resource: tableArn('user_kyc_status') },
    ],
  },
  etherfuseWebhook: {
    Statement: [
      { Effect: 'Allow', Action: ['dynamodb:UpdateItem'], Resource: tableArn('user_kyc_status') },
      { Effect: 'Allow', Action: ['ses:SendEmail', 'ses:SendRawEmail'], Resource: '*' },
    ],
  },
  distributeYield: {
    Statement: [
      {
        Effect: 'Allow',
        Action: ['dynamodb:Scan', 'dynamodb:UpdateItem'],
        Resource: tableArn('yield_positions'),
      },
      { Effect: 'Allow', Action: ['ses:SendEmail', 'ses:SendRawEmail'], Resource: '*' },
    ],
  },
};

// Common VPC + logs permissions added to every Lambda
const commonStatements = [
  {
    Effect: 'Allow',
    Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
    Resource: `arn:aws:logs:${region}:${accountId}:log-group:/aws/lambda/*`,
  },
  {
    Effect: 'Allow',
    Action: [
      'ec2:CreateNetworkInterface',
      'ec2:DescribeNetworkInterfaces',
      'ec2:DeleteNetworkInterface',
    ],
    Resource: '*',
  },
  {
    Effect: 'Allow',
    Action: ['xray:PutTraceSegments', 'xray:PutTelemetryRecords'],
    Resource: '*',
  },
];

const roleArns = {};

for (const [fnName, policy] of Object.entries(lambdaPolicies)) {
  const roleName = `accesly-lambda-${fnName}`;

  let roleArn;
  try {
    const r = await iam.send(new GetRoleCommand({ RoleName: roleName }));
    roleArn = r.Role?.Arn;
    console.log(`✓ Role exists: ${roleName}`);
  } catch {
    const r = await iam.send(new CreateRoleCommand({
      RoleName: roleName,
      AssumeRolePolicyDocument: trustPolicy,
      Description: `Least-privilege role for Lambda ${fnName}`,
    }));
    roleArn = r.Role?.Arn;
    console.log(`✓ Role created: ${roleName}`);
  }

  // Put inline policy with function-specific + common statements
  await iam.send(new PutRolePolicyCommand({
    RoleName: roleName,
    PolicyName: 'inline',
    PolicyDocument: JSON.stringify({
      Version: '2012-10-17',
      Statement: [...policy.Statement, ...commonStatements],
    }),
  }));

  roleArns[fnName] = roleArn;
}

// ---------------------------------------------------------------------------
// 5. Update each Lambda: new role + VPC config
// ---------------------------------------------------------------------------
console.log('\n── Updating Lambdas (role + VPC) ───────────────────────────────────');

for (const fnName of LAMBDAS) {
  await lambda.send(new UpdateFunctionConfigurationCommand({
    FunctionName: fnName,
    Role: roleArns[fnName],
    VpcConfig: {
      SubnetIds: subnetIds,
      SecurityGroupIds: [sgId],
    },
  }));
  console.log(`✓ ${fnName}: role + VPC updated`);
}

console.log(`\n✓ Security setup complete`);
console.log(`
Summary:
  WAF WebACL:     accesly-waf (SQLi, XSS, bad inputs, rate limit 1000/5min/IP)
  VPC:            ${vpcId}
  Subnets:        ${subnetIds.join(', ')}
  Security group: ${sgId}
  VPC endpoints:  dynamodb (gateway), kms, ses, logs, monitoring, xray
  IAM roles:      one per Lambda with least-privilege access
`);
