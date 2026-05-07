import {
  TransactionBuilder,
  Transaction,
  FeeBumpTransaction,
  Keypair,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import { config } from '../config.js';

/**
 * Wraps an already-signed inner transaction in a fee-bump envelope.
 * The fund account pays all fees — the user's account needs zero XLM.
 *
 * Fee-bump rules (Stellar protocol):
 *  - fee_source signs and pays
 *  - inner tx must already be signed by the user
 *  - fee must be >= (inner_ops + 1) * BASE_FEE
 */
export function buildFeeBump(innerXdr: string, fundSecret: string): FeeBumpTransaction {
  const fundKeypair = Keypair.fromSecret(fundSecret);
  const innerTx = new Transaction(innerXdr, config.stellar.networkPassphrase);

  // Fee: (number of inner ops + 1) * BASE_FEE, multiplied by 10 for priority
  const fee = String((innerTx.operations.length + 1) * parseInt(BASE_FEE) * 10);

  const feeBump = TransactionBuilder.buildFeeBumpTransaction(
    fundKeypair,
    fee,
    innerTx,
    config.stellar.networkPassphrase
  );

  feeBump.sign(fundKeypair);
  return feeBump;
}
