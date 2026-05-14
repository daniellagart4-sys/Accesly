/**
 * webauthn.ts — Passkey registration, biometric gating, and F1 fragment storage.
 *
 * Security model:
 *   - F1 bytes are stored in IndexedDB under the credential ID key.
 *   - Reading F1 always requires a fresh WebAuthn assertion (biometric presence check).
 *   - F1 alone is useless without F2 (server fragment), so the risk of IndexedDB
 *     exfiltration is bounded: the attacker would also need a valid Cognito session.
 */

const DB_NAME = 'accesly-vault';
const DB_VERSION = 1;
const STORE_NAME = 'fragments';

// ---- IndexedDB helpers ----

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---- Encoding helpers ----

function bufToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

// Allocate from a concrete ArrayBuffer so TS knows it is Uint8Array<ArrayBuffer>, not
// Uint8Array<ArrayBufferLike>. Required to satisfy BufferSource in WebAuthn / WebCrypto calls.
function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const buf = new Uint8Array(new ArrayBuffer(n));
  crypto.getRandomValues(buf);
  return buf;
}

function base64ToBuf(b64: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Array.from(atob(b64), c => c.charCodeAt(0)));
}

// ---- Feature detection ----

export function hasWebAuthn(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'credentials' in navigator &&
    typeof PublicKeyCredential !== 'undefined'
  );
}

// ---- Registration ----

/**
 * Register a new passkey for the user.
 * Returns the credential ID (base64) to persist in the session.
 */
export async function registerPasskey(
  userId: string,
  displayName: string
): Promise<{ credentialId: string }> {
  const challenge = randomBytes(32);

  const credential = (await navigator.credentials.create({
    publicKey: {
      rp: {
        name: 'Accesly',
        id: window.location.hostname,
      },
      user: {
        id: new TextEncoder().encode(userId),
        name: displayName,
        displayName,
      },
      challenge,
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },    // ES256 (preferred)
        { type: 'public-key', alg: -257 },  // RS256 (fallback)
      ],
      authenticatorSelection: {
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error('Passkey registration cancelled or failed');

  return { credentialId: bufToBase64(credential.rawId) };
}

// ---- Authentication / biometric gate ----

/**
 * Perform a WebAuthn assertion to verify user presence.
 * Must succeed before F1 can be read from IndexedDB.
 */
export async function authenticatePasskey(credentialId: string): Promise<void> {
  const challenge = randomBytes(32);
  const rawId = base64ToBuf(credentialId);

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [{ type: 'public-key', id: rawId }],
      userVerification: 'required',
      timeout: 60000,
    },
  });

  if (!assertion) throw new Error('Biometric verification cancelled');
}

// ---- F1 storage ----

/** Persist F1 bytes in IndexedDB. Called once during wallet creation. */
export async function storeF1(credentialId: string, f1: Uint8Array): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(f1.slice(), credentialId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Load F1 from IndexedDB.
 * Requires a successful WebAuthn assertion first (biometric gate).
 * Throws if the device has no registered passkey or F1 is missing.
 */
export async function loadF1(credentialId: string): Promise<Uint8Array> {
  await authenticatePasskey(credentialId);

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(credentialId);
    req.onsuccess = () => {
      if (req.result == null) {
        reject(new Error('F1 fragment not found on this device. Please recover your wallet.'));
      } else {
        resolve(new Uint8Array(req.result));
      }
    };
    req.onerror = () => reject(req.error);
  });
}

/** Remove F1 from IndexedDB (called on explicit logout / key rotation). */
export async function clearF1(credentialId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(credentialId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
