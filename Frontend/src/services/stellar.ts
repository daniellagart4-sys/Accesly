/**
 * stellar.ts - Stellar/Soroban blockchain interaction service.
 *
 * Handles:
 * - Ed25519 keypair generation for wallet ownership
 * - Email hashing (SHA-256 → 32 bytes for the contract's email_hash)
 * - Contract deployment (new instance per user)
 * - Contract initialization (calling init() with owner + email_hash)
 * - Contract queries (get_owner, get_nonce, etc.)
 * - Key rotation (update_owner for recovery)
 */

import {
  Keypair,
  TransactionBuilder,
  Contract,
  xdr,
  BASE_FEE,
  Address,
  Operation,
  StrKey,
  Asset,
  Account as StellarAccount,
  Memo,
} from '@stellar/stellar-sdk';
import { Server, Api, assembleTransaction } from '@stellar/stellar-sdk/rpc';
import { createHash, randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// Configuration (loaded from environment variables)
// ---------------------------------------------------------------------------
const RPC_URL = import.meta.env.SOROBAN_RPC_URL;
const NETWORK_PASSPHRASE = import.meta.env.SOROBAN_NETWORK_PASSPHRASE;
const WASM_HASH = import.meta.env.WASM_HASH;
const SERVER_SECRET = import.meta.env.STELLAR_SERVER_SECRET;

// Soroban RPC server instance
const rpcServer = new Server(RPC_URL);

// Server keypair: funded Stellar account that pays for all transactions.
// Lazy-initialized to avoid crashing at import time if env var is missing.
let _serverKeypair: Keypair | null = null;
function getServerKeypair(): Keypair {
  if (!_serverKeypair) {
    if (!SERVER_SECRET) throw new Error('STELLAR_SERVER_SECRET not configured');
    _serverKeypair = Keypair.fromSecret(SERVER_SECRET);
  }
  return _serverKeypair;
}

// ---------------------------------------------------------------------------
// Keypair Generation
// ---------------------------------------------------------------------------

/**
 * Generate a new random Stellar keypair for wallet ownership.
 * The public key (32 bytes) goes to the smart contract as "owner".
 * The secret key is encrypted and stored in Supabase for custodial management.
 *
 * @returns Object with:
 *   - publicKeyRaw: 32-byte Ed25519 public key (for contract)
 *   - publicKeyHex: hex-encoded public key (for DB storage)
 *   - stellarAddress: G... format Stellar address (for SEP-10)
 *   - secret: S... format secret key (to be encrypted and stored)
 */
export function generateWalletKeypair() {
  const keypair = Keypair.random();

  return {
    publicKeyRaw: keypair.rawPublicKey(),      // Buffer, 32 bytes
    publicKeyHex: keypair.rawPublicKey().toString('hex'),
    stellarAddress: keypair.publicKey(),         // G... format
    secret: keypair.secret(),                    // S... format
  };
}

/**
 * Hash an email address to 32 bytes using SHA-256.
 * The contract stores this hash to associate the wallet with an email identity.
 * Email is lowercased and trimmed before hashing for consistency.
 *
 * @param email - The user's email address
 * @returns 32-byte SHA-256 hash as a Buffer
 */
export function hashEmail(email: string): Buffer {
  return createHash('sha256')
    .update(email.toLowerCase().trim())
    .digest();
}

// ---------------------------------------------------------------------------
// Friendbot Funding (testnet only)
// ---------------------------------------------------------------------------

const FRIENDBOT_URL = 'https://friendbot.stellar.org';

/**
 * Fund a Stellar account on testnet using Friendbot.
 * Friendbot sends 10,000 test XLM to the account, which also
 * activates it on the network (accounts don't exist until funded).
 *
 * This is required for both the server account (pays tx fees)
 * and each new wallet address (needs to exist on-chain).
 *
 * @param stellarAddress - The G... format Stellar address to fund
 * @throws Error if Friendbot request fails
 */
export async function fundWithFriendbot(stellarAddress: string): Promise<void> {
  const response = await fetch(`${FRIENDBOT_URL}/?addr=${stellarAddress}`);

  if (!response.ok) {
    // Friendbot returns 400 if already funded, which is fine
    const body = await response.text();
    if (body.includes('createAccountAlreadyExist')) {
      return; // Account already exists, no problem
    }
    throw new Error(`Friendbot funding failed: ${response.status} - ${body}`);
  }
}

// ---------------------------------------------------------------------------
// Contract Deployment
// ---------------------------------------------------------------------------

/**
 * Deploy a new instance of the account abstraction contract for a user.
 * Each user gets their own contract instance (since init() can only be called once).
 *
 * @returns The contract ID (C... format) of the newly deployed contract
 */
export async function deployContract(): Promise<string> {
  // Load the server account from the network
  const server = getServerKeypair();
  const account = await rpcServer.getAccount(server.publicKey());

  // Random salt ensures a unique contract ID for each deployment
  const salt = randomBytes(32);

  // Build the deployment transaction using invokeHostFunction
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.invokeHostFunction({
        func: xdr.HostFunction.hostFunctionTypeCreateContract(
          new xdr.CreateContractArgs({
            contractIdPreimage:
              xdr.ContractIdPreimage.contractIdPreimageFromAddress(
                new xdr.ContractIdPreimageFromAddress({
                  address: new Address(server.publicKey()).toScAddress(),
                  salt: salt,
                })
              ),
            executable: xdr.ContractExecutable.contractExecutableWasm(
              Buffer.from(WASM_HASH, 'hex')
            ),
          })
        ),
        auth: [],
      })
    )
    .setTimeout(30)
    .build();

  // Simulate to calculate resource fees and footprint
  const simResult = await rpcServer.simulateTransaction(tx);
  if (Api.isSimulationError(simResult)) {
    throw new Error(`Deploy simulation failed: ${simResult.error}`);
  }

  // Assemble the transaction with proper footprint from simulation
  const prepared = assembleTransaction(tx, simResult).build();
  prepared.sign(server);

  // Submit to the network
  const sendResult = await rpcServer.sendTransaction(prepared);
  if (sendResult.status === 'ERROR') {
    throw new Error(`Deploy send failed: ${JSON.stringify(sendResult.errorResult)}`);
  }

  // Wait for confirmation (poll every second)
  const confirmed = await waitForTransaction(sendResult.hash);

  // Extract the contract ID from the transaction result
  const contractId = extractContractId(confirmed);
  return contractId;
}

// ---------------------------------------------------------------------------
// Contract Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize a deployed wallet contract by calling init(owner, email_hash).
 * This sets the owner's public key and email hash on-chain.
 *
 * @param contractId - The contract ID (C... format) to initialize
 * @param ownerPublicKey - 32-byte Ed25519 public key of the wallet owner
 * @param emailHash - 32-byte SHA-256 hash of the owner's email
 * @returns Transaction hash of the successful init call
 */
export async function initContract(
  contractId: string,
  ownerPublicKey: Buffer,
  emailHash: Buffer
): Promise<string> {
  const server = getServerKeypair();
  const account = await rpcServer.getAccount(server.publicKey());
  const contract = new Contract(contractId);

  // Build the init() invocation with BytesN<32> arguments
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        'init',
        xdr.ScVal.scvBytes(ownerPublicKey),
        xdr.ScVal.scvBytes(emailHash)
      )
    )
    .setTimeout(30)
    .build();

  // Simulate, assemble, sign, and submit
  const simResult = await rpcServer.simulateTransaction(tx);
  if (Api.isSimulationError(simResult)) {
    throw new Error(`Init simulation failed: ${simResult.error}`);
  }

  const prepared = assembleTransaction(tx, simResult).build();
  prepared.sign(server);

  const sendResult = await rpcServer.sendTransaction(prepared);
  if (sendResult.status === 'ERROR') {
    throw new Error(`Init send failed: ${JSON.stringify(sendResult.errorResult)}`);
  }

  await waitForTransaction(sendResult.hash);
  return sendResult.hash;
}

// ---------------------------------------------------------------------------
// Contract Queries (read-only)
// ---------------------------------------------------------------------------

/**
 * Get the current owner's public key from the contract.
 *
 * @param contractId - The contract ID to query
 * @returns Hex-encoded 32-byte public key of the current owner
 */
export async function getContractOwner(contractId: string): Promise<string> {
  const account = await rpcServer.getAccount(getServerKeypair().publicKey());
  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call('get_owner'))
    .setTimeout(30)
    .build();

  const simResult = await rpcServer.simulateTransaction(tx);
  if (Api.isSimulationError(simResult)) {
    throw new Error(`get_owner simulation failed: ${simResult.error}`);
  }

  // Extract the result from simulation (read-only, no need to submit)
  const result = (simResult as Api.SimulateTransactionSuccessResponse).result;
  if (!result) throw new Error('No result from get_owner simulation');

  const scVal = result.retval;
  const bytes = scVal.bytes();
  return Buffer.from(bytes).toString('hex');
}

/**
 * Get the current nonce from the contract.
 *
 * @param contractId - The contract ID to query
 * @returns Current nonce value
 */
export async function getContractNonce(contractId: string): Promise<number> {
  const account = await rpcServer.getAccount(getServerKeypair().publicKey());
  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call('get_nonce'))
    .setTimeout(30)
    .build();

  const simResult = await rpcServer.simulateTransaction(tx);
  if (Api.isSimulationError(simResult)) {
    throw new Error(`get_nonce simulation failed: ${simResult.error}`);
  }

  const result = (simResult as Api.SimulateTransactionSuccessResponse).result;
  if (!result) throw new Error('No result from get_nonce simulation');

  return Number(result.retval.u64());
}

// ---------------------------------------------------------------------------
// Key Rotation (for recovery)
// ---------------------------------------------------------------------------

/**
 * Rotate the contract owner to a new public key.
 * Used during account recovery: generate a new keypair and rotate ownership.
 *
 * The signature must be: sign("update_owner" || new_owner || nonce) with the OLD key.
 *
 * @param contractId - The contract ID
 * @param oldSecret - The current owner's secret key (S... format)
 * @param newPublicKey - 32-byte public key of the new owner
 * @returns Transaction hash
 */
export async function rotateOwner(
  contractId: string,
  oldSecret: string,
  newPublicKey: Buffer
): Promise<string> {
  const oldKeypair = Keypair.fromSecret(oldSecret);

  // Get the current nonce for the signature message
  const nonce = await getContractNonce(contractId);

  // Build the message: "update_owner" || new_owner_bytes || nonce_be_bytes
  const prefix = Buffer.from('update_owner');
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64BE(BigInt(nonce));
  const message = Buffer.concat([prefix, newPublicKey, nonceBuf]);

  // Sign with the old (current) owner key
  const signature = oldKeypair.sign(message);

  // Build and submit the update_owner transaction
  const server = getServerKeypair();
  const account = await rpcServer.getAccount(server.publicKey());
  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        'update_owner',
        xdr.ScVal.scvBytes(newPublicKey),
        xdr.ScVal.scvBytes(signature)
      )
    )
    .setTimeout(30)
    .build();

  const simResult = await rpcServer.simulateTransaction(tx);
  if (Api.isSimulationError(simResult)) {
    throw new Error(`update_owner simulation failed: ${simResult.error}`);
  }

  const prepared = assembleTransaction(tx, simResult).build();
  prepared.sign(server);

  const sendResult = await rpcServer.sendTransaction(prepared);
  if (sendResult.status === 'ERROR') {
    throw new Error(`update_owner send failed: ${JSON.stringify(sendResult.errorResult)}`);
  }

  await waitForTransaction(sendResult.hash);
  return sendResult.hash;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Poll the Soroban RPC server until a transaction is confirmed or fails.
 * Throws an error if the transaction fails.
 *
 * @param hash - Transaction hash to wait for
 * @returns The confirmed transaction response
 */
async function waitForTransaction(hash: string): Promise<Api.GetTransactionResponse> {
  let result = await rpcServer.getTransaction(hash);

  // Poll every second until the transaction is processed
  while (result.status === 'NOT_FOUND') {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    result = await rpcServer.getTransaction(hash);
  }

  if (result.status === 'FAILED') {
    throw new Error(`Transaction ${hash} failed on-chain`);
  }

  return result;
}

/**
 * Extract the newly created contract ID from a deployment transaction result.
 *
 * @param txResult - The confirmed transaction response
 * @returns Contract ID in C... (StrKey) format
 */
function extractContractId(txResult: Api.GetTransactionResponse): string {
  // The successful result contains the contract address as an ScVal
  if (txResult.status !== 'SUCCESS') {
    throw new Error('Transaction was not successful');
  }

  const successResult = txResult as Api.GetSuccessfulTransactionResponse;
  const returnValue = successResult.returnValue;

  if (!returnValue) {
    throw new Error('No return value in deployment transaction');
  }

  // The return value of a contract creation is the contract address
  const contractAddress = returnValue.address();
  const contractHash = contractAddress.contractId();

  // Convert the Hash type to a proper Buffer for StrKey encoding
  return StrKey.encodeContract(Buffer.from(contractHash as unknown as Uint8Array));
}

// ---------------------------------------------------------------------------
// Horizon API (balance, send, transaction history)
// ---------------------------------------------------------------------------

// Horizon testnet server for account queries and classic payments
const HORIZON_URL = 'https://horizon-testnet.stellar.org';

/** Balance entry from the Stellar network */
interface BalanceInfo {
  asset: string;   // "native" for XLM, or "CODE:ISSUER"
  balance: string; // Amount as string with 7 decimal places
}

/**
 * Get the XLM balance for a Stellar account from Horizon.
 *
 * @param stellarAddress - G... format Stellar address
 * @returns Array of balance entries (native XLM + any other assets)
 */
export async function getAccountBalance(stellarAddress: string): Promise<BalanceInfo[]> {
  const response = await fetch(`${HORIZON_URL}/accounts/${stellarAddress}`);

  if (!response.ok) {
    if (response.status === 404) {
      // Account not found / not funded yet
      return [{ asset: 'native', balance: '0' }];
    }
    throw new Error(`Horizon account query failed: ${response.status}`);
  }

  const data = await response.json();

  // Map Horizon balance format to our simplified format
  return data.balances.map((b: any) => ({
    asset: b.asset_type === 'native' ? 'native' : `${b.asset_code}:${b.asset_issuer}`,
    balance: b.balance,
  }));
}

/**
 * Send XLM from a wallet to another Stellar address.
 *
 * Builds a classic Stellar payment transaction, signs it with the
 * wallet's secret key, and submits it to the network via Horizon.
 *
 * @param senderSecret - The sender's secret key (S... format, decrypted)
 * @param destinationAddress - The recipient's Stellar address (G...)
 * @param amount - Amount of XLM to send (as string, e.g. "10.5")
 * @param memo - Optional text memo
 * @returns Transaction hash
 */
export async function sendPayment(
  senderSecret: string,
  destinationAddress: string,
  amount: string,
  memo?: string
): Promise<string> {
  const senderKeypair = Keypair.fromSecret(senderSecret);

  // Load the sender's account from Horizon for the sequence number
  const accountRes = await fetch(`${HORIZON_URL}/accounts/${senderKeypair.publicKey()}`);
  if (!accountRes.ok) {
    throw new Error('Sender account not found on network');
  }
  const accountData = await accountRes.json();

  // Build the payment transaction
  const account = new StellarAccount(senderKeypair.publicKey(), accountData.sequence);

  let txBuilder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        destination: destinationAddress,
        asset: Asset.native(),
        amount: amount,
      })
    )
    .setTimeout(30);

  // Add memo if provided
  if (memo) {
    txBuilder = txBuilder.addMemo(Memo.text(memo));
  }

  const tx = txBuilder.build();
  tx.sign(senderKeypair);

  // Submit to Horizon
  const submitRes = await fetch(`${HORIZON_URL}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `tx=${encodeURIComponent(tx.toXDR())}`,
  });

  const submitData = await submitRes.json();

  if (!submitRes.ok) {
    const errorDetail = submitData.extras?.result_codes?.operations?.join(', ') || submitData.title;
    throw new Error(`Payment failed: ${errorDetail}`);
  }

  return submitData.hash;
}

/** Single transaction entry for the history view */
export interface TransactionRecord {
  id: string;
  type: 'sent' | 'received' | 'other';
  amount: string;
  asset: string;
  counterparty: string;  // The other address involved
  memo: string;
  createdAt: string;     // ISO timestamp
  txHash: string;
}

/**
 * Get the recent transaction history for a Stellar account.
 * Queries Horizon for payment and create_account operations.
 *
 * @param stellarAddress - G... format Stellar address
 * @param limit - Maximum number of transactions to return (default 20)
 * @returns Array of transaction records
 */
export async function getTransactionHistory(
  stellarAddress: string,
  limit: number = 20
): Promise<TransactionRecord[]> {
  // Fetch payments (includes both payments and create_account ops)
  const response = await fetch(
    `${HORIZON_URL}/accounts/${stellarAddress}/payments?limit=${limit}&order=desc`
  );

  if (!response.ok) {
    if (response.status === 404) return [];
    throw new Error(`Horizon payments query failed: ${response.status}`);
  }

  const data = await response.json();
  const records: TransactionRecord[] = [];

  for (const op of data._embedded?.records || []) {
    // Handle create_account operations (e.g., Friendbot funding)
    if (op.type === 'create_account') {
      records.push({
        id: op.id,
        type: op.funder === stellarAddress ? 'sent' : 'received',
        amount: op.starting_balance,
        asset: 'XLM',
        counterparty: op.funder === stellarAddress ? op.account : op.funder,
        memo: '',
        createdAt: op.created_at,
        txHash: op.transaction_hash,
      });
      continue;
    }

    // Handle payment operations
    if (op.type === 'payment') {
      const isSent = op.from === stellarAddress;
      records.push({
        id: op.id,
        type: isSent ? 'sent' : 'received',
        amount: op.amount,
        asset: op.asset_type === 'native' ? 'XLM' : op.asset_code,
        counterparty: isSent ? op.to : op.from,
        memo: '',
        createdAt: op.created_at,
        txHash: op.transaction_hash,
      });
    }
  }

  return records;
}

export { getServerKeypair, rpcServer, NETWORK_PASSPHRASE };
