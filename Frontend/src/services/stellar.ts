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
import { getStellarAsset, getIssuerForCode, USDC_ASSET, EURC_ASSET } from './assets';

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

// Horizon server — testnet or mainnet based on environment
const HORIZON_URL =
  import.meta.env.STELLAR_NETWORK === 'mainnet'
    ? 'https://horizon.stellar.org'
    : 'https://horizon-testnet.stellar.org';

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
 * Activate USDC and EURC trustlines on a wallet's Stellar address.
 *
 * Must be called once during wallet creation. Each trustline increases
 * the account's minimum balance by 0.5 XLM (1 XLM total for two assets).
 * Accesly funds this cost automatically as part of the wallet setup.
 *
 * @param walletSecret - The wallet's own secret key (S... format)
 */
export async function activateTrustlines(walletSecret: string): Promise<void> {
  const walletKeypair = Keypair.fromSecret(walletSecret);

  const accountRes = await fetch(`${HORIZON_URL}/accounts/${walletKeypair.publicKey()}`);
  if (!accountRes.ok) {
    throw new Error('Wallet account not found on network for trustline activation');
  }
  const accountData = await accountRes.json();

  const account = new StellarAccount(walletKeypair.publicKey(), accountData.sequence);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.changeTrust({ asset: USDC_ASSET }))
    .addOperation(Operation.changeTrust({ asset: EURC_ASSET }))
    .setTimeout(30)
    .build();

  tx.sign(walletKeypair);

  const submitRes = await fetch(`${HORIZON_URL}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `tx=${encodeURIComponent(tx.toXDR())}`,
  });

  if (!submitRes.ok) {
    const data = await submitRes.json();
    const detail = data.extras?.result_codes?.operations?.join(', ') || data.title;
    throw new Error(`Trustline activation failed: ${detail}`);
  }
}

/**
 * Send a payment (XLM, USDC, or EURC) from a wallet to another Stellar address.
 *
 * @param senderSecret - The sender's secret key (S... format, decrypted)
 * @param destinationAddress - The recipient's Stellar address (G...)
 * @param amount - Amount to send (as string, e.g. "10.5")
 * @param memo - Optional text memo
 * @param assetCode - Asset code: "XLM" | "USDC" | "EURC" (defaults to "XLM")
 * @param assetIssuer - Asset issuer address (required for non-XLM assets)
 * @returns Transaction hash
 */
export async function sendPayment(
  senderSecret: string,
  destinationAddress: string,
  amount: string,
  memo?: string,
  assetCode?: string,
  assetIssuer?: string,
): Promise<string> {
  const senderKeypair = Keypair.fromSecret(senderSecret);

  const accountRes = await fetch(`${HORIZON_URL}/accounts/${senderKeypair.publicKey()}`);
  if (!accountRes.ok) {
    throw new Error('Sender account not found on network');
  }
  const accountData = await accountRes.json();

  const account = new StellarAccount(senderKeypair.publicKey(), accountData.sequence);

  // Resolve the asset: default to native XLM
  const asset = assetCode && assetCode !== 'XLM'
    ? getStellarAsset(assetCode, assetIssuer)
    : Asset.native();

  let txBuilder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        destination: destinationAddress,
        asset,
        amount,
      })
    )
    .setTimeout(30);

  if (memo) {
    txBuilder = txBuilder.addMemo(Memo.text(memo));
  }

  const tx = txBuilder.build();
  tx.sign(senderKeypair);

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

/**
 * Swap assets using Stellar's built-in DEX (pathPaymentStrictSend).
 *
 * Sends a fixed amount of one asset and receives at least `destMin` of another.
 * The DEX automatically finds the best path through available liquidity.
 * The swap destination is the wallet itself (you swap to yourself).
 *
 * @param senderSecret - Wallet secret key
 * @param fromAssetCode - Asset to sell: "XLM" | "USDC" | "EURC"
 * @param toAssetCode - Asset to buy: "XLM" | "USDC" | "EURC"
 * @param sendAmount - Exact amount to sell (string)
 * @param destMin - Minimum amount to receive (string, accounts for slippage)
 * @returns Transaction hash
 */
/** Intermediate asset in a swap path */
export interface SwapPathAsset {
  code: string;         // "XLM", "USDC", etc.
  issuer: string | null; // null for XLM
}

/** Result from estimateSwap */
export interface SwapEstimate {
  destinationAmount: string;        // expected receive amount
  path: SwapPathAsset[];            // intermediate hops (may be empty)
}

/**
 * Estimate a swap using Horizon's strict-send path-finding endpoint.
 * Returns the expected destination amount and the optimal intermediate path.
 * Must be called before swapAssets to get an accurate minReceive value.
 *
 * @param fromAssetCode - "XLM" | "USDC" | "EURC"
 * @param toAssetCode   - "XLM" | "USDC" | "EURC"
 * @param sendAmount    - Exact amount to sell (string)
 */
export async function estimateSwap(
  fromAssetCode: string,
  toAssetCode: string,
  sendAmount: string,
): Promise<SwapEstimate> {
  const params = new URLSearchParams();

  // Source asset
  if (fromAssetCode === 'XLM') {
    params.set('source_asset_type', 'native');
  } else {
    params.set('source_asset_type', 'credit_alphanum4');
    params.set('source_asset_code', fromAssetCode);
    params.set('source_asset_issuer', getIssuerForCode(fromAssetCode)!);
  }
  params.set('source_amount', sendAmount);

  // Destination asset
  if (toAssetCode === 'XLM') {
    params.set('destination_assets', 'native');
  } else {
    params.set('destination_assets', `${toAssetCode}:${getIssuerForCode(toAssetCode)}`);
  }

  const response = await fetch(`${HORIZON_URL}/paths/strict-send?${params}`);
  if (!response.ok) {
    throw new Error(`Horizon path-find failed: ${response.status}`);
  }

  const data = await response.json();
  const records: any[] = data._embedded?.records ?? [];

  if (records.length === 0) {
    throw new Error('No liquidity available for this pair. On testnet, some assets have no DEX liquidity — this will work on mainnet with real liquidity.');
  }

  // Horizon returns paths sorted best-first
  const best = records[0];

  const path: SwapPathAsset[] = (best.path ?? []).map((p: any) => ({
    code: p.asset_type === 'native' ? 'XLM' : p.asset_code,
    issuer: p.asset_type === 'native' ? null : p.asset_issuer,
  }));

  return { destinationAmount: best.destination_amount, path };
}

/**
 * Swap assets using Stellar's built-in DEX (pathPaymentStrictSend).
 * Pass the path returned by estimateSwap to ensure the transaction uses
 * the same route and avoids PATH_PAYMENT_STRICT_SEND_UNDER_DESTMIN errors.
 *
 * @param senderSecret - Wallet secret key
 * @param fromAssetCode - Asset to sell: "XLM" | "USDC" | "EURC"
 * @param toAssetCode   - Asset to buy:  "XLM" | "USDC" | "EURC"
 * @param sendAmount    - Exact amount to sell (string)
 * @param destMin       - Minimum amount to receive (slippage-adjusted)
 * @param intermediatePath - Path from estimateSwap (intermediate hops)
 * @returns Transaction hash
 */
export async function swapAssets(
  senderSecret: string,
  fromAssetCode: string,
  toAssetCode: string,
  sendAmount: string,
  destMin: string,
  intermediatePath: SwapPathAsset[] = [],
): Promise<string> {
  const senderKeypair = Keypair.fromSecret(senderSecret);

  const accountRes = await fetch(`${HORIZON_URL}/accounts/${senderKeypair.publicKey()}`);
  if (!accountRes.ok) {
    throw new Error('Sender account not found on network');
  }
  const accountData = await accountRes.json();

  const account = new StellarAccount(senderKeypair.publicKey(), accountData.sequence);

  const sendAsset = getStellarAsset(fromAssetCode, getIssuerForCode(fromAssetCode));
  const destAsset = getStellarAsset(toAssetCode, getIssuerForCode(toAssetCode));

  // Convert intermediate path to Stellar Asset objects
  const stellarPath = intermediatePath.map((p) =>
    p.code === 'XLM' ? Asset.native() : new Asset(p.code, p.issuer!)
  );

  const txBuilder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  // Ensure destination trustline exists (idempotent: no-op if already active)
  if (toAssetCode !== 'XLM') {
    txBuilder.addOperation(Operation.changeTrust({ asset: destAsset }));
  }

  txBuilder
    .addOperation(
      Operation.pathPaymentStrictSend({
        sendAsset,
        sendAmount,
        destination: senderKeypair.publicKey(), // swap to self
        destAsset,
        destMin,
        path: stellarPath,
      })
    )
    .setTimeout(30);

  const tx = txBuilder.build();

  tx.sign(senderKeypair);

  const submitRes = await fetch(`${HORIZON_URL}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `tx=${encodeURIComponent(tx.toXDR())}`,
  });

  const submitData = await submitRes.json();

  if (!submitRes.ok) {
    const errorDetail = submitData.extras?.result_codes?.operations?.join(', ') || submitData.title;
    throw new Error(`Swap failed: ${errorDetail}`);
  }

  return submitData.hash;
}

/** Single transaction entry for the history view */
export interface TransactionRecord {
  id: string;
  type: 'sent' | 'received' | 'swap';
  amount: string;
  asset: string;
  counterparty: string;  // The other address involved
  memo: string;
  createdAt: string;     // ISO timestamp
  txHash: string;
  // Populated only for type === 'swap'
  fromAmount?: string;
  fromAsset?: string;
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

    // Handle swap operations (pathPaymentStrictSend to self)
    if (op.type === 'path_payment_strict_send') {
      const isSelfSwap = op.from === stellarAddress && op.to === stellarAddress;
      if (isSelfSwap) {
        records.push({
          id: op.id,
          type: 'swap',
          amount: op.amount,
          asset: op.asset_type === 'native' ? 'XLM' : op.asset_code,
          fromAmount: op.source_amount,
          fromAsset: op.source_asset_type === 'native' ? 'XLM' : op.source_asset_code,
          counterparty: '',
          memo: '',
          createdAt: op.created_at,
          txHash: op.transaction_hash,
        });
      } else {
        // Path payment to a third party — treat as sent
        const isSent = op.from === stellarAddress;
        records.push({
          id: op.id,
          type: isSent ? 'sent' : 'received',
          amount: isSent ? op.source_amount : op.amount,
          asset: isSent
            ? (op.source_asset_type === 'native' ? 'XLM' : op.source_asset_code)
            : (op.asset_type === 'native' ? 'XLM' : op.asset_code),
          counterparty: isSent ? op.to : op.from,
          memo: '',
          createdAt: op.created_at,
          txHash: op.transaction_hash,
        });
      }
    }
  }

  return records;
}

export { getServerKeypair, rpcServer, NETWORK_PASSPHRASE, HORIZON_URL };
