/**
 * E2E smoke test against local relayer (TEST_MODE=true) + DynamoDB Local + Stellar testnet
 * Usage: node scripts/test-e2e.mjs
 */
import { Keypair, TransactionBuilder, Operation, BASE_FEE, Account, Networks } from '@stellar/stellar-sdk';

const BASE_URL = 'http://localhost:3001';
const PASSPHRASE = 'Test SDF Network ; September 2015';
const HORIZON = 'https://horizon-testnet.stellar.org';

async function horizonGet(path) {
  const res = await fetch(`${HORIZON}${path}`);
  return res.json();
}

async function relayer(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-test-user-id': 'test-user' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}

function ok(label, condition, detail = '') {
  const mark = condition ? '✓' : '✗';
  console.log(`${mark} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!condition) process.exitCode = 1;
}

// ── Health check ──────────────────────────────────────────────────────────────
console.log('\n── Health ──');
const health = await relayer('GET', '/health');
ok('GET /health 200', health.status === 200);
ok('network = testnet', health.data.network === 'testnet');

// ── Usage before any tx ───────────────────────────────────────────────────────
console.log('\n── Usage ──');
const usageBefore = await relayer('GET', '/usage/test-app');
ok('GET /usage/test-app 200', usageBefore.status === 200, JSON.stringify(usageBefore.data));

// ── Wallet activation ─────────────────────────────────────────────────────────
console.log('\n── Wallet activation ──');
const userKp = Keypair.random();
console.log(`  new wallet: ${userKp.publicKey()}`);
const activation = await relayer('POST', '/wallet/activate', { stellar_address: userKp.publicKey() });
ok('POST /wallet/activate 200', activation.status === 200, JSON.stringify(activation.data));

// ── Relay a transaction ───────────────────────────────────────────────────────
console.log('\n── Relay ──');
// Fund a sender account via Friendbot
const senderKp = Keypair.random();
await fetch(`https://friendbot.stellar.org?addr=${senderKp.publicKey()}`);
console.log(`  sender: ${senderKp.publicKey()}`);

// Brief pause for testnet to settle
await new Promise(r => setTimeout(r, 3000));

const accountData = await horizonGet(`/accounts/${senderKp.publicKey()}`);
const account = new Account(senderKp.publicKey(), accountData.sequence);

const innerTx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
  .addOperation(Operation.manageData({ name: 'relayer-test', value: 'ok' }))
  .setTimeout(60)
  .build();

innerTx.sign(senderKp);
const innerXdr = innerTx.toXDR();

const relay = await relayer('POST', '/relay', { inner_xdr: innerXdr, app_id: 'test-app' });
ok('POST /relay 200', relay.status === 200, JSON.stringify(relay.data));

if (relay.status === 200) {
  const txId = relay.data.relayer_tx_id;
  const txStatus = await relayer('GET', `/relay/${txId}`);
  ok('GET /relay/:txId 200', txStatus.status === 200);
  ok('status is confirmed or submitted', ['confirmed', 'submitted', 'processing'].includes(txStatus.data.status), txStatus.data.status);
}

// ── Config endpoint ───────────────────────────────────────────────────────────
console.log('\n── Config ──');
const cfg = await relayer('GET', '/config/test-app');
ok('GET /config/test-app 200', cfg.status === 200);
ok('feeStrategy present', !!cfg.data.feeStrategy);

console.log('\nDone.');
