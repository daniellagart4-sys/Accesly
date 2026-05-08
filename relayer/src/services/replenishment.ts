import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { dynamo } from '../db/dynamo.js';
import { createSwapRecord, updateSwapRecord, getAppConfig, getFundSecret } from '../db/tables.js';
import { getXLMBalance, getTokenBalance, submitXdr, estimateSwapOutput } from '../stellar/client.js';
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
  // M-4: paginated scan — never silently miss apps beyond 1MB
  const apps: any[] = [];
  let lastKey: Record<string, any> | undefined;

  do {
    const result = await dynamo.send(new ScanCommand({
      TableName: config.dynamo.tableAppConfigs,
      FilterExpression: 'feeStrategy = :s AND attribute_exists(fundAccountPublicKey)',
      ExpressionAttributeValues: { ':s': 'developer_pays' },
      ProjectionExpression: 'appId, fundAccountPublicKey, minBalanceThresholdXlm',
      ExclusiveStartKey: lastKey,
    }));

    apps.push(...(result.Items ?? []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

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
  const usdcBalance = await getTokenBalance(fundAccountAddress, 'USDC', config.stellar.usdcIssuer);

  if (usdcBalance < 1) {
    await notify(
      `Auto-swap failed for \`${appId}\`: USDC balance too low (${usdcBalance.toFixed(2)}). Manual action needed.`,
      'critical'
    );
    return;
  }

  const swapAmount = (usdcBalance * 0.8).toFixed(7);

  // H-3: fetch live price and apply slippage before submitting
  const quotedXlm = await estimateSwapOutput('USDC', config.stellar.usdcIssuer, 'XLM', swapAmount);
  if (!quotedXlm) {
    await notify(`Auto-swap failed for \`${appId}\`: no liquidity available for USDC→XLM.`, 'critical');
    return;
  }

  const appConfig = await getAppConfig(appId);
  const slippage = appConfig?.slippagePercentage ?? 2;
  const destMin = (parseFloat(quotedXlm) * (1 - slippage / 100)).toFixed(7);

  const swapId = await createSwapRecord({
    appId,
    fromAsset: 'USDC',
    fromAmount: parseFloat(swapAmount),
    toAsset: 'XLM',
    triggerType: 'auto',
  });

  try {
    const accountRes = await fetch(`${config.stellar.horizonUrl}/accounts/${fundAccountAddress}`);
    if (!accountRes.ok) throw new Error('Fund account not found');
    const accountData = await accountRes.json();
    const account = new Account(fundAccountAddress, accountData.sequence);

    const fundSecret = appConfig ? await getFundSecret(appConfig) : config.stellar.fundSecret;
    const fundKeypair = Keypair.fromSecret(fundSecret);

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
          destMin, // H-3: slippage-protected minimum
          path: [],
        })
      )
      .setTimeout(30)
      .build();

    tx.sign(fundKeypair);

    const txHash = await submitXdr(tx.toXDR());
    await updateSwapRecord(swapId, { status: 'confirmed', txHash });
    await notify(`Auto-swap confirmed for \`${appId}\`: ${swapAmount} USDC → XLM (min: ${destMin}). Tx: \`${txHash}\``, 'info');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await updateSwapRecord(swapId, { status: 'failed' });
    // H-6: log full error server-side, send generic message to Slack
    console.error(`[replenishment] Swap failed for ${appId}:`, msg);
    await notify(`Auto-swap failed for \`${appId}\`. Check server logs.`, 'critical');
  }
}
