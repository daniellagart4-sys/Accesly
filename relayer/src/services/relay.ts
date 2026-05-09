import { Transaction, BASE_FEE, Operation, Asset } from '@stellar/stellar-sdk';
import { buildFeeBump } from '../stellar/feebump.js';
import { submitXdr, getTxByHash, estimateSwapOutput } from '../stellar/client.js';
import { createRelayerTx, updateRelayerTx, getAppConfig, getFundSecret, AppConfig } from '../db/tables.js';
import { config } from '../config.js';

const MAX_OPS = 10;

// Stroops per XLM
const STROOPS_PER_XLM = 10_000_000;

// 5% safety buffer applied when pricing fees in USDC
const USDC_FEE_BUFFER = 1.05;

/**
 * Calculates the minimum required fee reimbursement in XLM for an inner transaction.
 * Mirrors the formula in feebump.ts: (inner_ops + 1) * BASE_FEE * 10.
 */
function requiredFeeXlm(innerTx: Transaction): number {
  const feeStroops = (innerTx.operations.length + 1) * parseInt(BASE_FEE) * 10;
  return feeStroops / STROOPS_PER_XLM;
}

/**
 * Validates that the inner transaction contains a Payment operation to the relayer's
 * fund account that covers the required fee.
 *
 * Accepted payment assets:
 *  - XLM (native): amount must be >= requiredFeeXlm
 *  - USDC (config.stellar.usdcIssuer): amount must be >= USDC equivalent of fee + 5% buffer
 *
 * Throws a descriptive Error if the payment is missing or insufficient.
 */
async function validateUserFeePayment(
  innerTx: Transaction,
  appConfig: AppConfig
): Promise<void> {
  const fundPk = appConfig.fundAccountPublicKey ?? '';
  if (!fundPk) {
    throw new Error('user_pays: app config is missing fundAccountPublicKey');
  }

  const requiredXlm = requiredFeeXlm(innerTx);

  // Find a Payment operation directed at the relayer's fund account
  const feePayment = innerTx.operations.find(
    (op): op is Operation.Payment =>
      op.type === 'payment' && op.destination === fundPk
  );

  if (!feePayment) {
    throw new Error(
      `user_pays: inner transaction must include a Payment operation to the relayer fund account (${fundPk})`
    );
  }

  const asset: Asset = feePayment.asset;
  const paidAmount = parseFloat(feePayment.amount);

  if (asset.isNative()) {
    // Direct XLM payment — compare straight to required XLM
    if (paidAmount < requiredXlm) {
      throw new Error(
        `user_pays: XLM fee payment is insufficient — paid ${paidAmount} XLM, required ${requiredXlm} XLM`
      );
    }
    return;
  }

  // Non-native asset: only USDC is accepted
  if (asset.getCode() !== 'USDC' || asset.getIssuer() !== config.stellar.usdcIssuer) {
    throw new Error(
      `user_pays: unsupported fee asset ${asset.getCode()} — only XLM (native) or USDC are accepted`
    );
  }

  // Get USDC equivalent of the required XLM fee via SDEX strict-send path
  // estimateSwapOutput returns the XLM you'd receive for `requiredXlm` worth of USDC sent,
  // so we query: how many USDC are needed to receive `requiredXlm` XLM?
  // We send USDC → receive XLM. We need to find the USDC cost, so we query
  // the reverse direction: send `requiredXlm` XLM → receive USDC, then invert.
  // But estimateSwapOutput uses strict-send, not strict-receive.
  // Practical approach: query how much XLM you get for `paidAmount` USDC,
  // then check if that covers requiredXlm (with buffer).
  const xlmReceivable = await estimateSwapOutput(
    'USDC',
    config.stellar.usdcIssuer,
    'native',
    feePayment.amount  // the exact USDC amount the user is paying
  );

  if (xlmReceivable === null) {
    throw new Error(
      'user_pays: could not estimate USDC→XLM swap via SDEX — cannot verify fee payment'
    );
  }

  // Apply 5% buffer: the XLM receivable for the paid USDC must cover the fee
  const requiredXlmWithBuffer = requiredXlm * USDC_FEE_BUFFER;

  if (parseFloat(xlmReceivable) < requiredXlmWithBuffer) {
    throw new Error(
      `user_pays: USDC fee payment is insufficient — ${feePayment.amount} USDC yields ~${xlmReceivable} XLM, ` +
      `required ${requiredXlmWithBuffer.toFixed(7)} XLM (${requiredXlm} XLM + 5% buffer)`
    );
  }
}

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

  // Validate fee payment before writing any DB records or touching Stellar
  if (feeStrategy === 'user_pays') {
    if (!appConfig) {
      throw new Error('user_pays: no app config found for appId ' + req.appId);
    }
    await validateUserFeePayment(innerTx, appConfig);
  }

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
