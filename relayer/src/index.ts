import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import cron from 'node-cron';
import { config } from './config.js';
import { requireAuth } from './auth.js';
import type { AuthenticatedRequest } from './auth.js';
import { relay } from './services/relay.js';
import { checkAndTrack, getUsage } from './services/x402.js';
import { runReplenishmentCycle } from './services/replenishment.js';
import { runMonitorCycle } from './services/monitor.js';
import { getRelayerTx, getAppConfig } from './db/tables.js';
import { isValidStellarAddress, accountExists, submitXdr } from './stellar/client.js';
import { Keypair, TransactionBuilder, Operation, BASE_FEE, Account } from '@stellar/stellar-sdk';

const app = express();

// I-2: security headers
app.use(helmet());

// H-1: CORS restricted to known origins
app.use(cors({
  origin: config.cors.allowedOrigins,
  methods: ['GET', 'POST'],
}));

// I-3: small body limit — XDR transactions are well under 64KB
app.use(express.json({ limit: '64kb' }));

// H-5: rate limiting per user
const relayLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyGenerator: (req) => (req as AuthenticatedRequest).userId ?? 'unknown',
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false },
});

const activateLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 5,
  keyGenerator: (req) => (req as AuthenticatedRequest).userId ?? 'unknown',
  message: { error: 'Too many activation requests' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false },
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', network: config.stellar.network });
});

// POST /relay — SDK sends signed inner XDR, relayer wraps in fee-bump and submits
app.post('/relay', requireAuth, relayLimiter, async (req: AuthenticatedRequest, res) => {
  const { inner_xdr, app_id } = req.body as { inner_xdr: string; app_id: string };

  if (!inner_xdr || !app_id) {
    res.status(400).json({ error: 'Missing required fields: inner_xdr, app_id' });
    return;
  }

  // C-3: verify the appId exists (ownership check — TODO: add userId field to app_configs
  // once the other dev's createApp Lambda is deployed, then verify appConfig.userId === req.userId)
  const appConfig = await getAppConfig(app_id);
  if (!appConfig) {
    res.status(403).json({ error: 'Unknown app_id' });
    return;
  }

  try {
    await checkAndTrack(app_id, 'transactions');
    const result = await relay({ innerXdr: inner_xdr, appId: app_id, userId: req.userId });
    res.json({ tx_hash: result.txHash, relayer_tx_id: result.relayerTxId });
  } catch (err) {
    // H-6: log full error, return generic message
    console.error('[relay] Error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Transaction relay failed' });
  }
});

// GET /relay/:txId — check status of a submitted transaction
app.get('/relay/:txId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const tx = await getRelayerTx(req.params.txId as string);

  if (!tx) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  // C-6: only return the record if it belongs to the requesting user
  if (tx.userId && tx.userId !== req.userId) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  // Return safe subset — never expose inner/feeBump XDR to clients
  res.json({
    relayerTxId: tx.txId,
    status: tx.status,
    txHash: tx.txHash,
    attempts: tx.attempts,
    createdAt: tx.createdAt,
    updatedAt: tx.updatedAt,
  });
});

// POST /wallet/activate — fund a new wallet with ~1 XLM for on-chain activation (issue #22)
app.post('/wallet/activate', requireAuth, activateLimiter, async (req: AuthenticatedRequest, res) => {
  const { stellar_address } = req.body as { stellar_address: string };

  // C-5: proper Stellar address validation via SDK
  if (!isValidStellarAddress(stellar_address)) {
    res.status(400).json({ error: 'Invalid stellar_address' });
    return;
  }

  try {
    // C-5: skip if account already exists — saves fees and avoids protocol error
    const exists = await accountExists(stellar_address);
    if (exists) {
      res.json({ status: 'already_active' });
      return;
    }

    const fundKeypair = Keypair.fromSecret(config.stellar.fundSecret);
    const accountRes = await fetch(`${config.stellar.horizonUrl}/accounts/${fundKeypair.publicKey()}`);
    if (!accountRes.ok) throw new Error('Fund account not found');
    const accountData = await accountRes.json();
    const account = new Account(fundKeypair.publicKey(), accountData.sequence);

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: config.stellar.networkPassphrase,
    })
      .addOperation(Operation.createAccount({ destination: stellar_address, startingBalance: '1' }))
      .setTimeout(30)
      .build();

    tx.sign(fundKeypair);
    const txHash = await submitXdr(tx.toXDR());
    res.json({ tx_hash: txHash });
  } catch (err) {
    console.error('[wallet/activate] Error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Wallet activation failed' });
  }
});

// GET /usage/:appId — usage stats for the current month
app.get('/usage/:appId', requireAuth, async (req: AuthenticatedRequest, res) => {
  // C-3: verify appId belongs to this user (same TODO as /relay)
  const appConfig = await getAppConfig(req.params.appId as string);
  if (!appConfig) {
    res.status(403).json({ error: 'Unknown app_id' });
    return;
  }

  try {
    const usage = await getUsage(req.params.appId as string);
    res.json(usage);
  } catch {
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
});

// GET /config/:appId — fee strategy and limits for an app
app.get('/config/:appId', requireAuth, async (req, res) => {
  const cfg = await getAppConfig(req.params.appId as string);
  if (!cfg) {
    res.status(404).json({ error: 'App config not found' });
    return;
  }

  // Return safe subset — never expose encrypted fund account secret
  res.json({
    appId: cfg.appId,
    feeStrategy: cfg.feeStrategy,
    allowedTokens: cfg.allowedTokens,
    slippagePercentage: cfg.slippagePercentage,
    monthlyWalletCreates: cfg.monthlyWalletCreates,
    monthlyTransactions: cfg.monthlyTransactions,
    monthlyQueries: cfg.monthlyQueries,
    monthlyKyc: cfg.monthlyKyc,
    plan: cfg.plan,
  });
});

// ---------------------------------------------------------------------------
// Background jobs
// ---------------------------------------------------------------------------

cron.schedule(config.replenishment.cron, async () => {
  try { await runReplenishmentCycle(); } catch (err) { console.error('[replenishment]', err); }
});

setInterval(async () => {
  try { await runMonitorCycle(); } catch (err) { console.error('[monitor]', err); }
}, config.monitor.pollIntervalMs);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(config.port, () => {
  console.log(`Accesly Relayer :${config.port} [${config.stellar.network}]`);
});
