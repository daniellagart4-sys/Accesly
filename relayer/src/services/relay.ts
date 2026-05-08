import { Transaction } from '@stellar/stellar-sdk';
import { buildFeeBump } from '../stellar/feebump.js';
import { submitXdr, getTxByHash } from '../stellar/client.js';
import { createRelayerTx, updateRelayerTx, getAppConfig, getFundSecret } from '../db/tables.js';
import { config } from '../config.js';

const MAX_OPS = 10;

export interface RelayRequest {
  innerXdr: string;
  appId: string;
  userId?: string;
}

export interface RelayResult {
  txHash: string;
  relayerTxId: string;
}

// C-4: validate the inner XDR before doing anything with it
function validateInnerXdr(xdr: string): Transaction {
  let tx: Transaction;
  try {
    tx = new Transaction(xdr, config.stellar.networkPassphrase);
  } catch {
    throw new Error('Invalid XDR: could not parse transaction');
  }

  if (tx.networkPassphrase !== config.stellar.networkPassphrase) {
    throw new Error('Invalid XDR: wrong network passphrase');
  }

  if (tx.operations.length === 0 || tx.operations.length > MAX_OPS) {
    throw new Error(`Invalid XDR: operation count must be between 1 and ${MAX_OPS}`);
  }

  return tx;
}

export async function relay(req: RelayRequest): Promise<RelayResult> {
  // C-4: validate XDR before touching DynamoDB or Stellar
  const innerTx = validateInnerXdr(req.innerXdr);

  const appConfig = await getAppConfig(req.appId);
  const feeStrategy = appConfig?.feeStrategy ?? 'developer_pays';
  const fundSecret = appConfig ? await getFundSecret(appConfig) : config.stellar.fundSecret;

  const relayerTxId = await createRelayerTx({
    appId: req.appId,
    userId: req.userId,
    innerXdr: req.innerXdr,
    feeStrategy,
  });

  const maxAttempts = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await updateRelayerTx(relayerTxId, { status: 'processing', attempts: attempt });

      const feeBump = buildFeeBump(req.innerXdr, fundSecret);
      const feeBumpXdr = feeBump.toXDR();
      const feeBumpHash = feeBump.hash().toString('hex');

      await updateRelayerTx(relayerTxId, { feeBumpXdr, status: 'submitted' });

      // M-6: before submitting on retry, check if already confirmed on-chain
      if (attempt > 1) {
        const existing = await getTxByHash(feeBumpHash);
        if (existing?.successful) {
          await updateRelayerTx(relayerTxId, { txHash: feeBumpHash, status: 'confirmed' });
          return { txHash: feeBumpHash, relayerTxId };
        }
      }

      const txHash = await submitXdr(feeBumpXdr);

      await updateRelayerTx(relayerTxId, { txHash, status: 'confirmed' });
      return { txHash, relayerTxId };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`[relay] Attempt ${attempt}/${maxAttempts} failed:`, lastError.message);
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }

  await updateRelayerTx(relayerTxId, {
    status: 'failed',
    // H-6: don't leak internal Horizon details in the DB record either — keep it clean
    errorMessage: 'Failed after max retries',
  });

  throw lastError ?? new Error('Relay failed');
}
