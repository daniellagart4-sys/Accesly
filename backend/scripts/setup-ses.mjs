#!/usr/bin/env node
// Verifies a domain in SES and generates DKIM DNS records
// Run: AWS_REGION=us-east-1 SES_DOMAIN=accesly.xyz node scripts/setup-ses.mjs
// Then add the printed CNAME records to your DNS provider.

import {
  SESClient,
  VerifyDomainIdentityCommand,
  VerifyDomainDkimCommand,
  GetIdentityVerificationAttributesCommand,
} from '@aws-sdk/client-ses';

const region = process.env.AWS_REGION ?? 'us-east-1';
const domain = process.env.SES_DOMAIN ?? 'accesly.xyz';
const ses    = new SESClient({ region });

// 1. Verify domain identity
const { VerificationToken } = await ses.send(new VerifyDomainIdentityCommand({ Domain: domain }));
console.log(`✓ Domain verification initiated: ${domain}`);
console.log(`\nAdd this TXT record in Namecheap DNS:`);
console.log(`  Type: TXT`);
console.log(`  Host: _amazonses`);
console.log(`  Value: ${VerificationToken}\n`);

// 2. Generate DKIM tokens
const { DkimTokens } = await ses.send(new VerifyDomainDkimCommand({ Domain: domain }));
console.log(`Add these 3 CNAME records in Namecheap DNS (for DKIM):`);
for (const token of DkimTokens) {
  console.log(`  Type: CNAME`);
  console.log(`  Host: ${token}._domainkey`);
  console.log(`  Value: ${token}.dkim.amazonses.com\n`);
}

// 3. Check current status
const status = await ses.send(new GetIdentityVerificationAttributesCommand({ Identities: [domain] }));
const attr   = status.VerificationAttributes?.[domain];
console.log(`Current status: ${attr?.VerificationStatus ?? 'Pending'}`);
console.log(`\nAfter adding the DNS records, re-run this script to confirm verification.`);
