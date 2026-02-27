#![no_std]

use soroban_sdk::{contract, contractimpl, token, Address, Env, IntoVal};

// ---------------------------------------------------------------------------
// Internal helper: move tokens between parties via this contract as escrow.
//
// Flow:
//   1. transfer_from: moves `max_spend` from `from` -> contract (requires prior approve)
//   2. transfer: moves `transfer_amount` from contract -> `to`
//   3. transfer: returns any remainder from contract -> `from`
// ---------------------------------------------------------------------------
fn move_token(
    env: &Env,
    token_addr: &Address,
    from: &Address,
    to: &Address,
    max_spend: i128,
    transfer_amount: i128,
) {
    let token_client = token::Client::new(env, token_addr);
    let contract_addr = env.current_contract_address();

    // Move the maximum spend from `from` to this contract.
    // Requires that `from` has authorized this contract to spend on their behalf.
    token_client.transfer_from(&contract_addr, from, &contract_addr, &max_spend);

    // Transfer the agreed amount to the recipient.
    token_client.transfer(&contract_addr, to, &transfer_amount);

    // Return any remainder back to the sender.
    let remainder = max_spend - transfer_amount;
    if remainder > 0 {
        token_client.transfer(&contract_addr, from, &remainder);
    }
}

// ---------------------------------------------------------------------------
// AtomicSwapContract
//
// Enables trustless peer-to-peer swaps between two parties for any
// SAC (Stellar Asset Contract) tokens, including USDC and EURC.
//
// Deploy once per network; any two Accesly wallets can use the same instance.
// ---------------------------------------------------------------------------
#[contract]
pub struct AtomicSwapContract;

#[contractimpl]
impl AtomicSwapContract {
    /// Atomically swap `token_a` for `token_b` between parties `a` and `b`.
    ///
    /// Parameters:
    /// - `a`           : Party A — offers `amount_a` of `token_a`
    /// - `b`           : Party B — offers `amount_b` of `token_b`
    /// - `token_a`     : SAC contract address for asset A (e.g. USDC)
    /// - `token_b`     : SAC contract address for asset B (e.g. EURC)
    /// - `amount_a`    : Amount of `token_a` that A is offering
    /// - `min_b_for_a` : Minimum `token_b` that A expects in return
    /// - `amount_b`    : Amount of `token_b` that B is offering
    /// - `min_a_for_b` : Minimum `token_a` that B expects in return
    ///
    /// Both parties must provide a Soroban authorization entry for their
    /// respective `require_auth_for_args` call before this transaction executes.
    pub fn swap(
        env: Env,
        a: Address,
        b: Address,
        token_a: Address,
        token_b: Address,
        amount_a: i128,
        min_b_for_a: i128,
        amount_b: i128,
        min_a_for_b: i128,
    ) {
        // Verify that each party receives at least their minimum.
        if amount_b < min_b_for_a {
            panic!("amount_b is below min_b_for_a: swap rejected");
        }
        if amount_a < min_a_for_b {
            panic!("amount_a is below min_a_for_b: swap rejected");
        }

        // Each party authorizes only their side of the swap.
        // The auth args are symmetric so either party can be swapped in the call.
        a.require_auth_for_args(
            (token_a.clone(), token_b.clone(), amount_a, min_b_for_a).into_val(&env),
        );
        b.require_auth_for_args(
            (token_b.clone(), token_a.clone(), amount_b, min_a_for_b).into_val(&env),
        );

        // Move token_a from A to B.
        move_token(&env, &token_a, &a, &b, amount_a, amount_b);

        // Move token_b from B to A.
        move_token(&env, &token_b, &b, &a, amount_b, amount_a);
    }
}
