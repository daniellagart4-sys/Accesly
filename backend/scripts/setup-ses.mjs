#!/usr/bin/env node
// Verifies sender email address in SES
// Run: AWS_REGION=us-east-1 node scripts/setup-ses.mjs
// When you have a domain: AWS_REGION=us-east-1 SES_FROM_EMAIL=noreply@accesly.io node scripts/setup-ses.mjs

import {
  SESClient,
  VerifyEmailIdentityCommand,
  GetIdentityVerificationAttributesCommand,
} from '@aws-sdk/client-ses';

const region = process.env.AWS_REGION ?? 'us-east-1';
const email  = process.env.SES_FROM_EMAIL ?? 'acceslyoficial@gmail.com';

const ses = new SESClient({ region });

await ses.send(new VerifyEmailIdentityCommand({ EmailAddress: email }));
console.log(`✓ Verification email sent to: ${email}`);
console.log(`  → Open the inbox and click the verification link.`);

const status = await ses.send(new GetIdentityVerificationAttributesCommand({
  Identities: [email],
}));

const attr = status.VerificationAttributes?.[email];
console.log(`\nCurrent status: ${attr?.VerificationStatus ?? 'Pending'}`);

if (attr?.VerificationStatus === 'Success') {
  console.log(`✓ Verified — SES ready to send from ${email}`);
} else {
  console.log(`Re-run after clicking the verification link to confirm.`);
}
