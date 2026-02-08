import { Buffer } from "buffer";
import { Address } from '@stellar/stellar-sdk';
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from '@stellar/stellar-sdk/contract';
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Typepoint,
  Duration,
} from '@stellar/stellar-sdk/contract';
export * from '@stellar/stellar-sdk'
export * as contract from '@stellar/stellar-sdk/contract'
export * as rpc from '@stellar/stellar-sdk/rpc'

if (typeof window !== 'undefined') {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CC7YSGS67RLLWSTFC6R3U6BX75NC5XEZABA2YHRJYXYLW4S2DAVMFEBO",
  }
} as const

export const Errors = {
  1: {message:"AlreadyInitialized"},
  2: {message:"NotInitialized"},
  3: {message:"InvalidOwner"},
  4: {message:"InvalidEmailHash"},
  5: {message:"InvalidSignature"},
  6: {message:"InvalidNonce"},
  7: {message:"SameOwner"},
  8: {message:"Unauthorized"},
  9: {message:"ReplayAttack"}
}

export type DataKey = {tag: "Owner", values: void} | {tag: "EmailHash", values: void} | {tag: "Nonce", values: void};


export interface KeyRotatedEvent {
  new_owner: Buffer;
  nonce: u64;
  old_owner: Buffer;
}


export interface AuthSuccessEvent {
  nonce: u64;
  owner: Buffer;
}


export interface WalletCreatedEvent {
  email_hash: Buffer;
  owner: Buffer;
}

export interface Client {
  /**
   * Construct and simulate a init transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Initialize the wallet contract
   */
  init: ({owner, email_hash}: {owner: Buffer, email_hash: Buffer}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_nonce transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the current nonce
   */
  get_nonce: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<u64>>>

  /**
   * Construct and simulate a get_owner transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the current owner public key
   */
  get_owner: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<Buffer>>>

  /**
   * Construct and simulate a update_owner transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Update the owner public key (key rotation)
   */
  update_owner: ({new_owner, signature}: {new_owner: Buffer, signature: Buffer}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_email_hash transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the email hash
   */
  get_email_hash: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<Buffer>>>

  /**
   * Construct and simulate a get_and_increment_nonce transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get and increment nonce atomically
   */
  get_and_increment_nonce: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<u64>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAAAAAB5Jbml0aWFsaXplIHRoZSB3YWxsZXQgY29udHJhY3QAAAAAAARpbml0AAAAAgAAAAAAAAAFb3duZXIAAAAAAAPuAAAAIAAAAAAAAAAKZW1haWxfaGFzaAAAAAAD7gAAACAAAAABAAAD6QAAA+0AAAAAAAAAAw==",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAACQAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAAA5Ob3RJbml0aWFsaXplZAAAAAAAAgAAAAAAAAAMSW52YWxpZE93bmVyAAAAAwAAAAAAAAAQSW52YWxpZEVtYWlsSGFzaAAAAAQAAAAAAAAAEEludmFsaWRTaWduYXR1cmUAAAAFAAAAAAAAAAxJbnZhbGlkTm9uY2UAAAAGAAAAAAAAAAlTYW1lT3duZXIAAAAAAAAHAAAAAAAAAAxVbmF1dGhvcml6ZWQAAAAIAAAAAAAAAAxSZXBsYXlBdHRhY2sAAAAJ",
        "AAAAAAAAABVHZXQgdGhlIGN1cnJlbnQgbm9uY2UAAAAAAAAJZ2V0X25vbmNlAAAAAAAAAAAAAAEAAAPpAAAABgAAAAM=",
        "AAAAAAAAACBHZXQgdGhlIGN1cnJlbnQgb3duZXIgcHVibGljIGtleQAAAAlnZXRfb3duZXIAAAAAAAAAAAAAAQAAA+kAAAPuAAAAIAAAAAM=",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAAAwAAAAAAAAAAAAAABU93bmVyAAAAAAAAAAAAAAAAAAAJRW1haWxIYXNoAAAAAAAAAAAAAAAAAAAFTm9uY2UAAAA=",
        "AAAAAAAAACpVcGRhdGUgdGhlIG93bmVyIHB1YmxpYyBrZXkgKGtleSByb3RhdGlvbikAAAAAAAx1cGRhdGVfb3duZXIAAAACAAAAAAAAAAluZXdfb3duZXIAAAAAAAPuAAAAIAAAAAAAAAAJc2lnbmF0dXJlAAAAAAAD7gAAAEAAAAABAAAD6QAAA+0AAAAAAAAAAw==",
        "AAAAAAAAACpNYWluIGF1dGhvcml6YXRpb24gZnVuY3Rpb24gKF9fY2hlY2tfYXV0aCkAAAAAAAxfX2NoZWNrX2F1dGgAAAADAAAAAAAAABFzaWduYXR1cmVfcGF5bG9hZAAAAAAAA+4AAAAgAAAAAAAAAAlzaWduYXR1cmUAAAAAAAPuAAAAQAAAAAAAAAANX2F1dGhfY29udGV4dAAAAAAAA+oAAAAAAAAAAQAAA+kAAAPtAAAAAAAAAAM=",
        "AAAAAAAAABJHZXQgdGhlIGVtYWlsIGhhc2gAAAAAAA5nZXRfZW1haWxfaGFzaAAAAAAAAAAAAAEAAAPpAAAD7gAAACAAAAAD",
        "AAAAAQAAAAAAAAAAAAAAD0tleVJvdGF0ZWRFdmVudAAAAAADAAAAAAAAAAluZXdfb3duZXIAAAAAAAPuAAAAIAAAAAAAAAAFbm9uY2UAAAAAAAAGAAAAAAAAAAlvbGRfb3duZXIAAAAAAAPuAAAAIA==",
        "AAAAAQAAAAAAAAAAAAAAEEF1dGhTdWNjZXNzRXZlbnQAAAACAAAAAAAAAAVub25jZQAAAAAAAAYAAAAAAAAABW93bmVyAAAAAAAD7gAAACA=",
        "AAAAAQAAAAAAAAAAAAAAEldhbGxldENyZWF0ZWRFdmVudAAAAAAAAgAAAAAAAAAKZW1haWxfaGFzaAAAAAAD7gAAACAAAAAAAAAABW93bmVyAAAAAAAD7gAAACA=",
        "AAAAAAAAACJHZXQgYW5kIGluY3JlbWVudCBub25jZSBhdG9taWNhbGx5AAAAAAAXZ2V0X2FuZF9pbmNyZW1lbnRfbm9uY2UAAAAAAAAAAAEAAAPpAAAABgAAAAM=" ]),
      options
    )
  }
  public readonly fromJSON = {
    init: this.txFromJSON<Result<void>>,
        get_nonce: this.txFromJSON<Result<u64>>,
        get_owner: this.txFromJSON<Result<Buffer>>,
        update_owner: this.txFromJSON<Result<void>>,
        get_email_hash: this.txFromJSON<Result<Buffer>>,
        get_and_increment_nonce: this.txFromJSON<Result<u64>>
  }
}