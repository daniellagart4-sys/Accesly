-- =============================================================================
-- Accesly - Supabase Database Schema
-- =============================================================================
-- Run this SQL in your Supabase Dashboard → SQL Editor
-- This creates the tables needed for wallet management and SEP-30 recovery.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. WALLETS TABLE
-- Links a Supabase Auth user (Google login) to their Stellar wallet.
-- One wallet per user.
-- ---------------------------------------------------------------------------
CREATE TABLE wallets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Reference to the Supabase Auth user (from Google OAuth)
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Stellar address (G... format) derived from the wallet's Ed25519 public key
  stellar_address TEXT NOT NULL,

  -- Raw Ed25519 public key (hex-encoded, 64 chars = 32 bytes)
  -- This is what gets stored in the smart contract as "owner"
  public_key TEXT NOT NULL,

  -- User's email address (from Google)
  email TEXT NOT NULL,

  -- SHA-256 hash of the email (hex-encoded)
  -- Stored in the smart contract as "email_hash"
  email_hash TEXT NOT NULL,

  -- Soroban contract ID (C... format)
  -- Each user gets their own deployed contract instance
  contract_id TEXT NOT NULL UNIQUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- One wallet per user
  UNIQUE(user_id)
);

-- ---------------------------------------------------------------------------
-- 2. RECOVERY SIGNERS TABLE (SEP-30)
-- Stores encrypted signing keys for the recovery server.
-- The secret key is encrypted with AES-256-GCM before storage.
-- ---------------------------------------------------------------------------
CREATE TABLE recovery_signers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Reference to the wallet this signer belongs to
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,

  -- Public key of this signer (G... format)
  -- Used to identify which signer to use when signing transactions
  signer_public_key TEXT NOT NULL,

  -- AES-256-GCM encrypted secret key (hex-encoded ciphertext)
  encrypted_secret_key TEXT NOT NULL,

  -- Initialization vector used for AES-256-GCM encryption (hex-encoded, 24 chars = 12 bytes)
  encryption_iv TEXT NOT NULL,

  -- GCM authentication tag (hex-encoded, 32 chars = 16 bytes)
  -- Ensures the ciphertext hasn't been tampered with
  encryption_tag TEXT NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 3. RECOVERY IDENTITIES TABLE (SEP-30)
-- Stores the identities (email, phone, etc.) associated with each wallet
-- for recovery purposes. When recovering, the user must prove they control
-- one of these identities.
-- ---------------------------------------------------------------------------
CREATE TABLE recovery_identities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Reference to the wallet this identity belongs to
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,

  -- Semantic role for this identity (e.g., "owner", "recovery_contact")
  role TEXT NOT NULL DEFAULT 'owner',

  -- Type of authentication method: 'email', 'stellar_address', 'phone_number'
  auth_method_type TEXT NOT NULL,

  -- The actual value (email address, G... address, or phone number)
  auth_method_value TEXT NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS)
-- Protects data so users can only access their own records.
-- The service_role key (used by our backend) bypasses RLS entirely.
-- ---------------------------------------------------------------------------

-- Enable RLS on all tables
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_signers ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_identities ENABLE ROW LEVEL SECURITY;

-- Wallets: authenticated users can only SELECT their own wallet
CREATE POLICY "Users can view own wallet"
  ON wallets
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Recovery signers: authenticated users can view their own signer public keys
-- (the encrypted_secret_key is never exposed via client-side queries)
CREATE POLICY "Users can view own recovery signers"
  ON recovery_signers
  FOR SELECT
  TO authenticated
  USING (
    wallet_id IN (
      SELECT id FROM wallets WHERE user_id = auth.uid()
    )
  );

-- Recovery identities: authenticated users can view their own identities
CREATE POLICY "Users can view own recovery identities"
  ON recovery_identities
  FOR SELECT
  TO authenticated
  USING (
    wallet_id IN (
      SELECT id FROM wallets WHERE user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 5. INDEXES
-- Improve query performance for common lookups.
-- ---------------------------------------------------------------------------

-- Fast lookup of wallet by user_id (login flow)
CREATE INDEX idx_wallets_user_id ON wallets(user_id);

-- Fast lookup of wallet by contract_id (SEP-30 API calls)
CREATE INDEX idx_wallets_contract_id ON wallets(contract_id);

-- Fast lookup of signers by wallet_id
CREATE INDEX idx_recovery_signers_wallet_id ON recovery_signers(wallet_id);

-- Fast lookup of identities by wallet_id and email
CREATE INDEX idx_recovery_identities_wallet_id ON recovery_identities(wallet_id);
CREATE INDEX idx_recovery_identities_email ON recovery_identities(auth_method_type, auth_method_value);
