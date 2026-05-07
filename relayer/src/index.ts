import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { config } from './config.js';
import { relay } from './services/relay.js';
import { checkAndTrack, getUsage } from './services/x402.js';
import { runReplenishmentCycle } from './services/replenishment.js';
import { runMonitorCycle } from './services/monitor.js';
import { getRelayerTx, getAppConfig } from './db/tables.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------
function requireApiKey(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  if (req.headers['x-api-key'] as string !== config.apiKey) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }
  next();
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', network: config.stellar.network, ts: new Date().toISOString() });
});

// POST /relay — SDK sends signed inner XDR, relayer wraps in fee-bump and submits
app.post('/relay', requireApiKey, async (req, res) => {
  const { inner_xdr, app_id, user_id } = req.body as {
    inner_xdr: string;
    app_id: string;
    user_id?: string;
  };

  if (!inner_xdr || !app_id) {
    res.status(400).json({ error: 'Missing required fields: inner_xdr, app_id' });
    return;
  }

  try {
    await checkAndTrack(app_id, 'transactions');

    const result = await relay({ innerXdr: inner_xdr, appId: app_id, userId: user_id });
    res.json({ tx_hash: result.txHash, relayer_tx_id: result.relayerTxId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Relay failed';
    console.error('[relay] Error:', message);
    res.status(500).json({ error: message });
  }
});

// GET /relay/:txId — check status of a submitted transaction
app.get('/relay/:txId', requireApiKey, async (req, res) => {
  const tx = await getRelayerTx(req.params.txId as string);
  if (!tx) {
    res.status(404).json({ error: 'Transaction not found' });
    return;
  }
  res.json(tx);
});

// GET /usage/:appId — get current month usage stats for an app
app.get('/usage/:appId', requireApiKey, async (req, res) => {
  try {
    const usage = await getUsage(req.params.appId as string);
    res.json(usage);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
});

// GET /config/:appId — get app relayer config (fee strategy, limits, etc.)
app.get('/config/:appId', requireApiKey, async (req, res) => {
  const cfg = await getAppConfig(req.params.appId as string);
  if (!cfg) {
    // Return safe defaults if no config exists yet
    res.json({
      appId: req.params.appId,
      feeStrategy: 'developer_pays',
      allowedTokens: ['XLM', 'USDC', 'EURC'],
      monthlyWalletCreates: 100,
      monthlyTransactions: 1000,
      monthlyQueries: 10000,
      monthlyKyc: 50,
    });
    return;
  }
  res.json(cfg);
});

// ---------------------------------------------------------------------------
// Background jobs
// ---------------------------------------------------------------------------

// Replenishment: check fund account balances every N minutes
cron.schedule(config.replenishment.cron, async () => {
  console.log('[replenishment] Running cycle...');
  try {
    await runReplenishmentCycle();
  } catch (err) {
    console.error('[replenishment] Failed:', err);
  }
});

// Monitor: poll Stellar events on a fixed interval
setInterval(async () => {
  try {
    await runMonitorCycle();
  } catch (err) {
    console.error('[monitor] Failed:', err);
  }
}, config.monitor.pollIntervalMs);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(config.port, () => {
  console.log(`Accesly Relayer running on :${config.port} [${config.stellar.network}]`);
});
