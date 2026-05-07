import { Keypair, Asset, Account } from '@stellar/stellar-sdk';
import { config } from '../config.js';

const { horizonUrl } = config.stellar;

export function keypairFromSecret(secret: string): Keypair {
  return Keypair.fromSecret(secret);
}

export async function fetchAccount(address: string): Promise<{ sequence: string; balances: any[] }> {
  const res = await fetch(`${horizonUrl}/accounts/${address}`);
  if (!res.ok) throw new Error(`Account not found: ${address} (${res.status})`);
  return res.json();
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

export async function submitXdr(xdr: string): Promise<string> {
  const res = await fetch(`${horizonUrl}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `tx=${encodeURIComponent(xdr)}`,
  });

  const data = await res.json();

  if (!res.ok) {
    const ops = data.extras?.result_codes?.operations?.join(', ');
    const tx = data.extras?.result_codes?.transaction;
    throw new Error(`Submit failed: ${ops ?? tx ?? data.title ?? res.status}`);
  }

  return data.hash as string;
}

export function usdcAsset(): Asset {
  return new Asset('USDC', config.stellar.usdcIssuer);
}
