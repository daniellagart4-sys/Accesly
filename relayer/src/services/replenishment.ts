import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { dynamo } from '../db/dynamo.js';
import { createSwapRecord, updateSwapRecord } from '../db/tables.js';
import { getXLMBalance, getTokenBalance, submitXdr } from '../stellar/client.js';
import { notify } from './slack.js';
import { config } from '../config.js';
import {
  Keypair,
  TransactionBuilder,
  Operation,
  Asset,
  BASE_FEE,
  Account,
} from '@stellar/stellar-sdk';

export async function runReplenishmentCycle(): Promise<void> {
  // Find all apps with developer_pays strategy and a configured fund account
  const result = await dynamo.send(
    new ScanCommand({
      TableName: 'app_configs',
      FilterExpression: 'feeStrategy = :s AND attribute_exists(fundAccountPublicKey)',
      ExpressionAttributeValues: { ':s': 'developer_pays' },
      ProjectionExpression: 'appId, fundAccountPublicKey, minBalanceThresholdXlm',
    })
  );

  const apps = result.Items ?? [];

  await Promise.allSettled(
    apps.map((a) =>
      checkApp({
        appId: a['appId'] as string,
        fundAccountPublicKey: a['fundAccountPublicKey'] as string,
        minBalanceThresholdXlm: a['minBalanceThresholdXlm'] as number,
      })
    )
  );
}

async function checkApp(app: {
  appId: string;
  fundAccountPublicKey: string;
  minBalanceThresholdXlm: number;
}): Promise<void> {
  const balance = await getXLMBalance(app.fundAccountPublicKey);
  const threshold = app.minBalanceThresholdXlm ?? 100;
  const ratio = balance / threshold;

  if (ratio <= 0.05) {
    await notify(
      `CRITICAL: Fund account for \`${app.appId}\` at ${(ratio * 100).toFixed(1)}% (${balance.toFixed(2)} XLM). Triggering swap.`,
      'critical'
    );
    await swapUsdcToXlm(app.appId, app.fundAccountPublicKey);
  } else if (ratio <= 0.20) {
    await notify(
      `Warning: Fund account for \`${app.appId}\` at ${(ratio * 100).toFixed(1)}% (${balance.toFixed(2)} XLM). Consider topping up.`,
      'warning'
    );
  }
}

async function swapUsdcToXlm(appId: string, fundAccountAddress: string): Promise<void> {
  const usdcBalance = await getTokenBalance(
    fundAccountAddress,
    'USDC',
    config.stellar.usdcIssuer
  );

  if (usdcBalance < 1) {
    await notify(
      `Auto-swap failed for \`${appId}\`: USDC balance too low (${usdcBalance.toFixed(2)}). Manual action needed.`,
      'critical'
    );
    return;
  }

  const swapAmount = (usdcBalance * 0.8).toFixed(7);
  const swapId = await createSwapRecord({
    appId,
    fromAsset: 'USDC',
    fromAmount: parseFloat(swapAmount),
    toAsset: 'XLM',
    triggerType: 'auto',
  });

  try {
    const horizonUrl = config.stellar.horizonUrl;
    const accountRes = await fetch(`${horizonUrl}/accounts/${fundAccountAddress}`);
    if (!accountRes.ok) throw new Error('Fund account not found on network');
    const accountData = await accountRes.json();
    const account = new Account(fundAccountAddress, accountData.sequence);

    // We need the fund account secret to sign — it must be in env or app_config
    // For now we use the default relayer fund secret
    const fundKeypair = Keypair.fromSecret(config.stellar.fundSecret);

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: config.stellar.networkPassphrase,
    })
      .addOperation(
        Operation.pathPaymentStrictSend({
          sendAsset: new Asset('USDC', config.stellar.usdcIssuer),
          sendAmount: swapAmount,
          destination: fundAccountAddress,
          destAsset: Asset.native(),
          destMin: '1', // Accept any amount of XLM (slippage handled by DEX)
          path: [],
        })
      )
      .setTimeout(30)
      .build();

    tx.sign(fundKeypair);

    const txHash = await submitXdr(tx.toXDR());

    await updateSwapRecord(swapId, { status: 'confirmed', txHash });
    await notify(`Auto-swap confirmed for \`${appId}\`: ${swapAmount} USDC → XLM. Tx: \`${txHash}\``, 'info');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateSwapRecord(swapId, { status: 'failed' });
    await notify(`Auto-swap failed for \`${appId}\`: ${msg}`, 'critical');
  }
}
