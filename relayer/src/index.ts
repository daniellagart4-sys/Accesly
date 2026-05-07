import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { config } from './config.js';
import { requireAuth } from './auth.js';
import type { AuthenticatedRequest } from './auth.js';
import { relay } from './services/relay.js';
import { checkAndTrack, getUsage } from './services/x402.js';
import { runReplenishmentCycle } from './services/replenishment.js';
import { runMonitorCycle } from './services/monitor.js';
import { getRelayerTx, getAppConfig } from './db/tables.js';
import { getXLMBalance, submitXdr } from './stellar/client.js';
import { Keypair, TransactionBuilder, Operation, BASE_FEE, Account } from '@stellar/stellar-sdk';

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));


// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', network: config.stellar.network, ts: new Date().toISOString() });
});

// POST /relay — SDK sends signed inner XDR, relayer wraps in fee-bump and submits
app.post('/relay', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { inner_xdr, app_id } = req.body as { inner_xdr: string; app_id: string };
  const user_id = req.userId;

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
app.get('/relay/:txId', requireAuth, async (req, res) => {
  const tx = await getRelayerTx(req.params.txId as string);
  if (!tx) {
    res.status(404).json({ error: 'Transaction not found' });
    return;
  }
  res.json(tx);
});

// POST /wallet/activate — fund a new wallet with ~1 XLM for activation (issue #22)
// Called by the createWallet Lambda after deploying the Smart Account
app.post('/wallet/activate', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { stellar_address } = req.body as { stellar_address: string };

  if (!stellar_address?.startsWith('G') || stellar_address.length !== 56) {
    res.status(400).json({ error: 'Invalid stellar_address' });
    return;
  }

  try {
    const fundKeypair = Keypair.fromSecret(config.stellar.fundSecret);
    const accountRes = await fetch(`${config.stellar.horizonUrl}/accounts/${fundKeypair.publicKey()}`);
    if (!accountRes.ok) throw new Error('Fund account not found');
    const accountData = await accountRes.json();
    const account = new Account(fundKeypair.publicKey(), accountData.sequence);

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: config.stellar.networkPassphrase,
    })
      .addOperation(
        Operation.createAccount({
          destination: stellar_address,
          startingBalance: '1', // ~1 XLM activation
        })
      )
      .setTimeout(30)
      .build();

    tx.sign(fundKeypair);
    const txHash = await submitXdr(tx.toXDR());

    res.json({ tx_hash: txHash });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Activation failed';
    console.error('[wallet/activate] Error:', message);
    res.status(500).json({ error: message });
  }
});

// GET /usage/:appId — get current month usage stats for an app
app.get('/usage/:appId', requireAuth, async (req, res) => {
  try {
    const usage = await getUsage(req.params.appId as string);
    res.json(usage);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
});

// GET /config/:appId — get app relayer config (fee strategy, limits, etc.)
app.get('/config/:appId', requireAuth, async (req, res) => {
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
