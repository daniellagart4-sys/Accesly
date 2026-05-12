#!/usr/bin/env node
// Verifies accesly.io domain in SES, enables DKIM, prints required DNS records
// Run: AWS_REGION=us-east-1 node scripts/setup-ses.mjs

import {
  SESClient,
  VerifyDomainIdentityCommand,
  VerifyDomainDkimCommand,
  GetIdentityVerificationAttributesCommand,
  GetIdentityDkimAttributesCommand,
} from '@aws-sdk/client-ses';

const region = process.env.AWS_REGION ?? 'us-east-1';
const domain = 'accesly.io';

const ses = new SESClient({ region });

// ---------------------------------------------------------------------------
// 1. Verify domain identity
// ---------------------------------------------------------------------------
const verify = await ses.send(new VerifyDomainIdentityCommand({ Domain: domain }));
console.log(`✓ Domain submitted for verification: ${domain}`);
console.log(`\n── TXT verification record (add to DNS) ────────────────────────────`);
console.log(`Name:  _amazonses.${domain}`);
console.log(`Value: "${verify.VerificationToken}"`);
console.log(`Type:  TXT`);

// ---------------------------------------------------------------------------
// 2. Enable DKIM
// ---------------------------------------------------------------------------
const dkim = await ses.send(new VerifyDomainDkimCommand({ Domain: domain }));
console.log(`\n── DKIM CNAME records (add all 3 to DNS) ───────────────────────────`);
for (const token of dkim.DkimTokens ?? []) {
  console.log(`\nName:  ${token}._domainkey.${domain}`);
  console.log(`Value: ${token}.dkim.amazonses.com`);
  console.log(`Type:  CNAME`);
}

// ---------------------------------------------------------------------------
// 3. Current verification status
// ---------------------------------------------------------------------------
const [verStatus, dkimStatus] = await Promise.all([
  ses.send(new GetIdentityVerificationAttributesCommand({ Identities: [domain] })),
  ses.send(new GetIdentityDkimAttributesCommand({ Identities: [domain] })),
]);

const vs = verStatus.VerificationAttributes?.[domain];
const ds = dkimStatus.DkimAttributes?.[domain];

console.log(`\n────────────────────────────────────────────────────────────────────`);
console.log(`Verification status: ${vs?.VerificationStatus ?? 'Pending'}`);
console.log(`DKIM enabled:        ${ds?.DkimEnabled ?? false}`);
console.log(`DKIM status:         ${ds?.DkimVerificationStatus ?? 'Pending'}`);

console.log(`\n── SPF TXT record (add if not present) ─────────────────────────────`);
console.log(`Name:  ${domain}`);
console.log(`Value: "v=spf1 include:amazonses.com ~all"`);
console.log(`Type:  TXT`);

console.log(`\n── DMARC TXT record (recommended) ──────────────────────────────────`);
console.log(`Name:  _dmarc.${domain}`);
console.log(`Value: "v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}"`);
console.log(`Type:  TXT`);

console.log(`\nAfter adding DNS records, DNS propagation can take up to 72h.`);
console.log(`Re-run this script to check verification status.`);
