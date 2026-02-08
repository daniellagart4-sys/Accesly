#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, 
    Bytes, BytesN, Env, Symbol,
};

// ============================================================================
// ERROR CODES - Ahora usa contracterror! macro
// ============================================================================

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidOwner = 3,
    InvalidEmailHash = 4,
    InvalidSignature = 5,
    InvalidNonce = 6,
    SameOwner = 7,
    Unauthorized = 8,
    ReplayAttack = 9,
}

// ============================================================================
// STORAGE KEYS
// ============================================================================

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Owner,
    EmailHash,
    Nonce,
}

// ============================================================================
// EVENTS
// ============================================================================

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WalletCreatedEvent {
    pub owner: BytesN<32>,
    pub email_hash: BytesN<32>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuthSuccessEvent {
    pub owner: BytesN<32>,
    pub nonce: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KeyRotatedEvent {
    pub old_owner: BytesN<32>,
    pub new_owner: BytesN<32>,
    pub nonce: u64,
}

// ============================================================================
// CONTRACT
// ============================================================================

#[contract]
pub struct WalletContract;

#[contractimpl]
impl WalletContract {
    /// Initialize the wallet contract
    pub fn init(env: Env, owner: BytesN<32>, email_hash: BytesN<32>) -> Result<(), Error> {
        // Check if already initialized
        if env.storage().instance().has(&DataKey::Owner) {
            return Err(Error::AlreadyInitialized);
        }

        // Validate owner is not zero
        if Self::is_zero_bytes(&owner) {
            return Err(Error::InvalidOwner);
        }

        // Validate email_hash is not zero
        if Self::is_zero_bytes(&email_hash) {
            return Err(Error::InvalidEmailHash);
        }

        // Store owner
        env.storage().instance().set(&DataKey::Owner, &owner);

        // Store email hash
        env.storage().instance().set(&DataKey::EmailHash, &email_hash);

        // Initialize nonce to 0
        env.storage().instance().set(&DataKey::Nonce, &0u64);

        // Emit event
        env.events().publish(
            (Symbol::new(&env, "wallet_created"),),
            WalletCreatedEvent {
                owner: owner.clone(),
                email_hash: email_hash.clone(),
            },
        );

        Ok(())
    }

    /// Get the current owner public key
    pub fn get_owner(env: Env) -> Result<BytesN<32>, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Owner)
            .ok_or(Error::NotInitialized)
    }

    /// Get the email hash
    pub fn get_email_hash(env: Env) -> Result<BytesN<32>, Error> {
        env.storage()
            .instance()
            .get(&DataKey::EmailHash)
            .ok_or(Error::NotInitialized)
    }

    /// Get the current nonce
    pub fn get_nonce(env: Env) -> Result<u64, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Nonce)
            .ok_or(Error::NotInitialized)
    }

    /// Get and increment nonce atomically
    pub fn get_and_increment_nonce(env: Env) -> Result<u64, Error> {
        let current_nonce: u64 = env.storage()
            .instance()
            .get(&DataKey::Nonce)
            .ok_or(Error::NotInitialized)?;
        
        // Increment and store
        let new_nonce = current_nonce.checked_add(1)
            .ok_or(Error::InvalidNonce)?;
        
        env.storage().instance().set(&DataKey::Nonce, &new_nonce);
        
        Ok(current_nonce)
    }

    /// Verify Ed25519 signature (helper function)
    /// 
    /// IMPORTANT: En SDK 22.x, ed25519_verify NO retorna bool
    /// Si la verificación falla, causa un PANIC automáticamente
    fn verify_ed25519_signature(
        env: &Env,
        public_key: BytesN<32>,  // Sin referencia &
        message: Bytes,          // Sin referencia &
        signature: BytesN<64>,   // Sin referencia &
    ) {
        // En SDK 22.x, esto causa panic si falla
        // No retorna nada si tiene éxito
        env.crypto().ed25519_verify(&public_key, &message, &signature);
    }

    /// Update the owner public key (key rotation)
    pub fn update_owner(
        env: Env, 
        new_owner: BytesN<32>, 
        signature: BytesN<64>
    ) -> Result<(), Error> {
        // Get current owner
        let current_owner: BytesN<32> = env.storage()
            .instance()
            .get(&DataKey::Owner)
            .ok_or(Error::NotInitialized)?;

        // Validate new_owner is not zero
        if Self::is_zero_bytes(&new_owner) {
            return Err(Error::InvalidOwner);
        }

        // Validate new_owner is different from current
        if current_owner == new_owner {
            return Err(Error::SameOwner);
        }

        // Get current nonce
        let nonce = Self::get_nonce(env.clone())?;

        // Build message to verify: "update_owner" || new_owner || nonce
        let mut message = Bytes::new(&env);
        message.extend_from_array(b"update_owner");
        message.extend_from_slice(&new_owner.to_array());
        message.extend_from_array(&nonce.to_be_bytes());

        // Verify signature from current owner
        // En SDK 22.x, esto causa panic si falla
        Self::verify_ed25519_signature(&env, current_owner.clone(), message, signature);

        // Increment nonce
        Self::get_and_increment_nonce(env.clone())?;

        // Update owner
        env.storage().instance().set(&DataKey::Owner, &new_owner);

        // Emit event
        env.events().publish(
            (Symbol::new(&env, "key_rotated"),),
            KeyRotatedEvent {
                old_owner: current_owner,
                new_owner: new_owner.clone(),
                nonce,
            },
        );

        Ok(())
    }

    /// Main authorization function (__check_auth)
    pub fn __check_auth(
        env: Env,
        signature_payload: BytesN<32>,
        signature: BytesN<64>,
        _auth_context: soroban_sdk::Vec<soroban_sdk::Val>,
    ) -> Result<(), Error> {
        // Get current owner
        let owner: BytesN<32> = env.storage()
            .instance()
            .get(&DataKey::Owner)
            .ok_or(Error::NotInitialized)?;

        // Get current nonce
        let expected_nonce = Self::get_nonce(env.clone())?;

        // Build message: signature_payload || nonce
        let mut message = Bytes::new(&env);
        message.extend_from_slice(&signature_payload.to_array());
        message.extend_from_array(&expected_nonce.to_be_bytes());

        // Verify signature (causes panic if fails in SDK 22.x)
        Self::verify_ed25519_signature(&env, owner.clone(), message, signature);

        // Increment nonce
        Self::get_and_increment_nonce(env.clone())?;

        // Emit event
        env.events().publish(
            (Symbol::new(&env, "auth_success"),),
            AuthSuccessEvent {
                owner: owner.clone(),
                nonce: expected_nonce,
            },
        );

        Ok(())
    }

    /// Helper: Check if BytesN<32> is all zeros
    fn is_zero_bytes(bytes: &BytesN<32>) -> bool {
        bytes.to_array().iter().all(|&b| b == 0)
    }
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod test;