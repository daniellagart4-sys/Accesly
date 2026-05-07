import { buildFeeBump } from '../stellar/feebump.js';
import { submitXdr } from '../stellar/client.js';
import { createRelayerTx, updateRelayerTx, getAppConfig } from '../db/tables.js';
import { config } from '../config.js';

export interface RelayRequest {
  innerXdr: string;
  appId: string;
  userId?: string;
}

export interface RelayResult {
  txHash: string;
  relayerTxId: string;
}

export async function relay(req: RelayRequest): Promise<RelayResult> {
  const appConfig = await getAppConfig(req.appId);
  const feeStrategy = appConfig?.feeStrategy ?? 'developer_pays';

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

      const fundSecret = config.stellar.fundSecret;
      const feeBump = buildFeeBump(req.innerXdr, fundSecret);
      const feeBumpXdr = feeBump.toXDR();

      await updateRelayerTx(relayerTxId, { feeBumpXdr, status: 'submitted' });

      const txHash = await submitXdr(feeBumpXdr);

      await updateRelayerTx(relayerTxId, { txHash, status: 'confirmed' });

      return { txHash, relayerTxId };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`[relay] Attempt ${attempt}/${maxAttempts} failed:`, lastError.message);

      if (attempt < maxAttempts) {
        // Exponential backoff: 1s, 2s
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }

  await updateRelayerTx(relayerTxId, {
    status: 'failed',
    errorMessage: lastError?.message ?? 'Unknown error after max retries',
  });

  throw lastError ?? new Error('Relay failed');
}
