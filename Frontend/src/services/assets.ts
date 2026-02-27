/**
 * assets.ts - USDC and EURC asset configuration for Stellar.
 *
 * Issuers are environment-driven to support testnet and mainnet.
 * Override via USDC_ISSUER / EURC_ISSUER in your .env file.
 *
 * Circle mainnet issuers:
 *   USDC: GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN
 *   EURC: GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP
 */

import { Asset } from '@stellar/stellar-sdk';

const isMainnet = import.meta.env.STELLAR_NETWORK === 'mainnet';

// USDC — Circle's official issuers
export const USDC_ISSUER: string =
  import.meta.env.USDC_ISSUER ||
  (isMainnet
    ? 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'  // Circle mainnet
    : 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'); // Circle testnet

// EURC — Circle's official issuers
export const EURC_ISSUER: string =
  import.meta.env.EURC_ISSUER ||
  (isMainnet
    ? 'GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2' // Circle mainnet
    : 'GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO'); // Circle testnet

export const USDC_ASSET = new Asset('USDC', USDC_ISSUER);
export const EURC_ASSET = new Asset('EURC', EURC_ISSUER);

/** Return the Stellar Asset object for a given code. */
export function getStellarAsset(code: string, issuer?: string | null): Asset {
  if (code === 'XLM') return Asset.native();
  if (code === 'USDC') return USDC_ASSET;
  if (code === 'EURC') return EURC_ASSET;
  if (issuer) return new Asset(code, issuer);
  throw new Error(`Unknown asset code: ${code}`);
}

/** Return the issuer for USDC or EURC. Returns null for XLM. */
export function getIssuerForCode(code: string): string | null {
  if (code === 'USDC') return USDC_ISSUER;
  if (code === 'EURC') return EURC_ISSUER;
  return null;
}
