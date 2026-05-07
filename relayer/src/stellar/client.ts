import { Keypair, Asset, Account, StrKey } from '@stellar/stellar-sdk';
import { config } from '../config.js';

const { horizonUrl } = config.stellar;

// M-7: all Horizon fetches get a 10s timeout
async function horizonFetch(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function keypairFromSecret(secret: string): Keypair {
  return Keypair.fromSecret(secret);
}

// C-5: proper Stellar address validation
export function isValidStellarAddress(address: string): boolean {
  return StrKey.isValidEd25519PublicKey(address);
}

export async function fetchAccount(address: string): Promise<{ sequence: string; balances: any[] }> {
  const res = await horizonFetch(`${horizonUrl}/accounts/${address}`);
  if (!res.ok) throw new Error(`Account not found: ${address}`);
  return res.json();
}

export async function accountExists(address: string): Promise<boolean> {
  const res = await horizonFetch(`${horizonUrl}/accounts/${address}`);
  return res.ok;
}

export async function getXLMBalance(address: string): Promise<number> {
  try {
    const data = await fetchAccount(address);
    const entry = data.balances.find((b: any) => b.asset_type === 'native');
    return entry ? parseFloat(entry.balance) : 0;
  } catch {
    return 0;
  }
}

export async function getTokenBalance(address: string, assetCode: string, issuer: string): Promise<number> {
  try {
    const data = await fetchAccount(address);
    const entry = data.balances.find(
      (b: any) => b.asset_code === assetCode && b.asset_issuer === issuer
    );
    return entry ? parseFloat(entry.balance) : 0;
  } catch {
    return 0;
  }
}

// H-3: fetch swap estimate for slippage protection
export async function estimateSwapOutput(
  fromAssetCode: string,
  fromIssuer: string | null,
  toAssetCode: string,
  sendAmount: string
): Promise<string | null> {
  const params = new URLSearchParams();

  if (fromIssuer) {
    params.set('source_asset_type', 'credit_alphanum4');
    params.set('source_asset_code', fromAssetCode);
    params.set('source_asset_issuer', fromIssuer);
  } else {
    params.set('source_asset_type', 'native');
  }
  params.set('source_amount', sendAmount);
  params.set('destination_assets', 'native');

  const res = await horizonFetch(`${horizonUrl}/paths/strict-send?${params}`);
  if (!res.ok) return null;

  const data = await res.json();
  const records: any[] = data._embedded?.records ?? [];
  return records[0]?.destination_amount ?? null;
}

export async function submitXdr(xdr: string): Promise<string> {
  const res = await horizonFetch(`${horizonUrl}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `tx=${encodeURIComponent(xdr)}`,
  });

  const data = await res.json();

  if (!res.ok) {
    const ops = data.extras?.result_codes?.operations?.join(', ');
    const tx = data.extras?.result_codes?.transaction;
    // H-6: only surface safe error category, not raw Horizon details
    const isKnownError = ops || tx;
    throw new Error(isKnownError ? `Transaction rejected: ${tx ?? ops}` : 'Transaction submission failed');
  }

  return data.hash as string;
}

export async function getTxByHash(hash: string): Promise<{ successful: boolean } | null> {
  const res = await horizonFetch(`${horizonUrl}/transactions/${hash}`);
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const data = await res.json();
  return { successful: data.successful };
}

export function usdcAsset(): Asset {
  return new Asset('USDC', config.stellar.usdcIssuer);
}
