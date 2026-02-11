/**
 * DeveloperDashboard.tsx - Developer portal dashboard.
 *
 * Allows developers to:
 * 1. Register their app and get an API key
 * 2. View/regenerate their API key
 * 3. Manage allowed CORS origins
 * 4. Read SDK installation and usage documentation
 *
 * Uses Supabase auth (same Google login as the wallet).
 */

import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase-client';
import type { Session } from '@supabase/supabase-js';

interface DeveloperApp {
  app_id: string;
  app_name: string;
  allowed_origins: string[];
  created_at: string;
  updated_at: string;
}

export function DeveloperDashboard() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [app, setApp] = useState<DeveloperApp | null>(null);
  const [appLoading, setAppLoading] = useState(false);

  // Registration form
  const [appName, setAppName] = useState('');
  const [registering, setRegistering] = useState(false);

  // Origins form
  const [originInput, setOriginInput] = useState('');
  const [savingOrigins, setSavingOrigins] = useState(false);

  // Feedback
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Active section for docs
  const [activeSection, setActiveSection] = useState<'dashboard' | 'docs'>('dashboard');

  // --- Auth ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  // --- Load developer app when session available ---
  useEffect(() => {
    if (session) fetchApp();
  }, [session]);

  async function fetchApp() {
    if (!session) return;
    setAppLoading(true);
    try {
      const res = await fetch('/api/developers/app', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setApp(data.app);
        setOriginInput((data.app.allowed_origins || []).join('\n'));
      }
    } catch {
      // No app yet
    } finally {
      setAppLoading(false);
    }
  }

  async function handleRegister() {
    if (!session || !appName.trim()) return;
    setRegistering(true);
    setMessage(null);
    try {
      const res = await fetch('/api/developers/register', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ appName: appName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setApp(data.app);
        setMessage({ type: 'success', text: 'App registered! Your API key is ready.' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Registration failed' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setRegistering(false);
    }
  }

  async function handleRegenerateKey() {
    if (!session || !confirm('This will invalidate your current API key. Continue?')) return;
    setMessage(null);
    try {
      const res = await fetch('/api/developers/regenerate-key', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setApp((prev) => prev ? { ...prev, app_id: data.appId } : null);
        setMessage({ type: 'success', text: 'API key regenerated.' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to regenerate' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    }
  }

  async function handleSaveOrigins() {
    if (!session) return;
    setSavingOrigins(true);
    setMessage(null);
    const origins = originInput
      .split('\n')
      .map((o) => o.trim())
      .filter((o) => o.length > 0);
    try {
      const res = await fetch('/api/developers/update-origins', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ origins }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: 'Origins updated.' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setSavingOrigins(false);
    }
  }

  async function copyKey() {
    if (!app) return;
    await navigator.clipboard.writeText(app.app_id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleLogin() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href },
    });
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  // --- Loading state ---
  if (loading) {
    return (
      <div style={styles.center}>
        <div style={styles.spinner} />
      </div>
    );
  }

  // --- Not logged in ---
  if (!session) {
    return (
      <div style={styles.center}>
        <h1 style={styles.title}>Accesly Developers</h1>
        <p style={styles.subtitle}>
          Build Web3 wallets into your app with a few lines of code
        </p>
        <button onClick={handleLogin} style={styles.loginBtn}>
          Sign in with Google
        </button>
      </div>
    );
  }

  // --- Dashboard ---
  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.headerTitle}>Accesly Developers</h1>
        <div style={styles.headerRight}>
          <button
            onClick={() => setActiveSection(activeSection === 'docs' ? 'dashboard' : 'docs')}
            style={styles.tabToggle}
          >
            {activeSection === 'docs' ? 'Dashboard' : 'SDK Docs'}
          </button>
          <button onClick={handleLogout} style={styles.logoutBtn}>Sign Out</button>
        </div>
      </div>

      {/* Feedback message */}
      {message && (
        <div style={{
          ...styles.message,
          backgroundColor: message.type === 'success' ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
          borderColor: message.type === 'success' ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)',
          color: message.type === 'success' ? '#34d399' : '#f87171',
        }}>
          {message.text}
        </div>
      )}

      {activeSection === 'docs' ? renderDocs() : renderDashboard()}
    </div>
  );

  // --- Dashboard content ---
  function renderDashboard() {
    if (appLoading) {
      return (
        <div style={styles.center}>
          <div style={styles.spinner} />
        </div>
      );
    }

    // No app registered yet
    if (!app) {
      return (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Create Your App</h2>
          <p style={styles.cardDesc}>
            Register your app to get an API key for the Accesly SDK.
          </p>
          <div style={styles.formGroup}>
            <label style={styles.label}>App Name</label>
            <input
              type="text"
              placeholder="My Awesome App"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              style={styles.input}
              maxLength={50}
            />
          </div>
          <button
            onClick={handleRegister}
            disabled={registering || !appName.trim()}
            style={{
              ...styles.primaryBtn,
              opacity: registering || !appName.trim() ? 0.5 : 1,
            }}
          >
            {registering ? 'Creating...' : 'Create App'}
          </button>
        </div>
      );
    }

    // App registered - show dashboard
    return (
      <>
        {/* API Key */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>API Key</h2>
          <p style={styles.cardDesc}>
            Use this key in your <code style={styles.code}>AcceslyProvider</code> component.
          </p>
          <div style={styles.keyRow}>
            <div style={styles.keyBox}>
              <span style={styles.keyText}>{app.app_id}</span>
            </div>
            <button onClick={copyKey} style={styles.copyBtn}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <button onClick={handleRegenerateKey} style={styles.dangerLink}>
            Regenerate Key
          </button>
        </div>

        {/* Allowed Origins */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Allowed Origins</h2>
          <p style={styles.cardDesc}>
            Domains allowed to use your API key. Leave empty to allow all origins.
            One URL per line.
          </p>
          <textarea
            value={originInput}
            onChange={(e) => setOriginInput(e.target.value)}
            placeholder={'https://myapp.com\nhttps://staging.myapp.com'}
            style={styles.textarea}
            rows={4}
          />
          <button
            onClick={handleSaveOrigins}
            disabled={savingOrigins}
            style={styles.secondaryBtn}
          >
            {savingOrigins ? 'Saving...' : 'Save Origins'}
          </button>
        </div>

        {/* Quick Start */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Quick Start</h2>
          <p style={styles.cardDesc}>
            Install the SDK and add it to your React app:
          </p>
          <pre style={styles.codeBlock}>
{`npm install accesly`}
          </pre>
          <pre style={styles.codeBlock}>
{`import { AcceslyProvider, ConnectButton } from 'accesly';

function App() {
  return (
    <AcceslyProvider appId="${app.app_id}">
      <ConnectButton />
    </AcceslyProvider>
  );
}`}
          </pre>
          <button
            onClick={() => setActiveSection('docs')}
            style={styles.linkBtn}
          >
            View full documentation →
          </button>
        </div>
      </>
    );
  }

  // --- Documentation section ---
  function renderDocs() {
    return (
      <div style={styles.docsContainer}>
        {/* Installation */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Installation</h2>
          <pre style={styles.codeBlock}>{`npm install accesly`}</pre>
          <p style={styles.cardDesc}>Or with yarn/pnpm:</p>
          <pre style={styles.codeBlock}>{`yarn add accesly
pnpm add accesly`}</pre>
        </div>

        {/* Basic Usage */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Basic Usage</h2>
          <p style={styles.cardDesc}>
            Wrap your app with <code style={styles.code}>AcceslyProvider</code> and
            drop in the <code style={styles.code}>ConnectButton</code>. That's it.
          </p>
          <pre style={styles.codeBlock}>
{`import { AcceslyProvider, ConnectButton } from 'accesly';

function App() {
  return (
    <AcceslyProvider appId="${app?.app_id || 'acc_your_api_key'}">
      <header>
        <ConnectButton />
      </header>
      <main>
        {/* Your app content */}
      </main>
    </AcceslyProvider>
  );
}`}
          </pre>
        </div>

        {/* Provider Config */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Provider Configuration</h2>
          <pre style={styles.codeBlock}>
{`<AcceslyProvider
  appId="acc_xxxxx"           // Required: your API key
  baseUrl="https://..."       // Optional: custom backend URL
  network="testnet"           // Optional: "testnet" | "mainnet"
  theme="dark"                // Optional: "dark" | "light"
  onConnect={(wallet) => {    // Optional: called on connect
    console.log('Connected:', wallet.stellarAddress);
  }}
  onDisconnect={() => {       // Optional: called on disconnect
    console.log('Disconnected');
  }}
>
  {children}
</AcceslyProvider>`}
          </pre>
        </div>

        {/* useAccesly Hook */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>useAccesly Hook</h2>
          <p style={styles.cardDesc}>
            Build your own custom wallet UI with the <code style={styles.code}>useAccesly</code> hook.
          </p>
          <pre style={styles.codeBlock}>
{`import { useAccesly } from 'accesly';

function MyWalletUI() {
  const {
    wallet,         // WalletInfo | null
    balance,        // string | null (XLM balance)
    loading,        // boolean
    creating,       // boolean (first-time wallet creation)
    error,          // string | null
    connect,        // () => Promise<void>
    disconnect,     // () => void
    sendPayment,    // (params) => Promise<{ txHash }>
    refreshBalance, // () => Promise<void>
    refreshWallet,  // () => Promise<void>
  } = useAccesly();

  if (loading) return <p>Loading...</p>;

  if (!wallet) {
    return <button onClick={connect}>Connect</button>;
  }

  return (
    <div>
      <p>Address: {wallet.stellarAddress}</p>
      <p>Balance: {balance} XLM</p>
      <button onClick={disconnect}>Disconnect</button>
    </div>
  );
}`}
          </pre>
        </div>

        {/* Send Payment */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Sending Payments</h2>
          <pre style={styles.codeBlock}>
{`const { sendPayment } = useAccesly();

async function handleSend() {
  try {
    const { txHash } = await sendPayment({
      destination: 'GABCD...WXYZ',  // Stellar address
      amount: '10.5',                // XLM amount
      memo: 'Payment for coffee',    // Optional memo
    });
    console.log('Transaction:', txHash);
  } catch (error) {
    console.error('Payment failed:', error.message);
  }
}`}
          </pre>
        </div>

        {/* TypeScript Types */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>TypeScript Types</h2>
          <p style={styles.cardDesc}>
            All types are exported and fully documented:
          </p>
          <pre style={styles.codeBlock}>
{`import type {
  AcceslyConfig,      // Provider configuration
  WalletInfo,         // Wallet details
  TransactionRecord,  // Transaction history entry
  SendPaymentParams,  // sendPayment() parameters
  AcceslyContextType, // Full context shape (useAccesly return)
} from 'accesly';`}
          </pre>
        </div>

        {/* WalletInfo Shape */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>WalletInfo Object</h2>
          <pre style={styles.codeBlock}>
{`interface WalletInfo {
  contractId: string;     // Soroban smart contract ID
  publicKey: string;      // Ed25519 public key
  stellarAddress: string; // Stellar G... address
  email: string;          // User's Google email
  emailHash: string;      // SHA-256 of email
  createdAt: string;      // ISO timestamp
  recoverySigners?: Array<{
    publicKey: string;
    createdAt: string;
  }>;
}`}
          </pre>
        </div>
      </div>
    );
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  center: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1rem',
    minHeight: '300px',
    textAlign: 'center' as const,
  },
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1rem',
    width: '100%',
    maxWidth: '640px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: '0.75rem',
    borderBottom: '1px solid #2a2a4a',
  },
  headerTitle: {
    fontSize: '1.25rem',
    fontWeight: 700,
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    margin: 0,
  },
  headerRight: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
  },
  tabToggle: {
    padding: '0.4rem 0.85rem',
    backgroundColor: '#1a1a2e',
    color: '#a5b4fc',
    border: '1px solid #2a2a4a',
    borderRadius: '8px',
    fontSize: '0.8rem',
    fontWeight: 500,
    cursor: 'pointer',
  },
  logoutBtn: {
    padding: '0.4rem 0.85rem',
    backgroundColor: 'transparent',
    color: '#64748b',
    border: '1px solid #2a2a4a',
    borderRadius: '8px',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
  title: {
    fontSize: '2rem',
    fontWeight: 700,
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    margin: 0,
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: '1rem',
    maxWidth: '400px',
    lineHeight: 1.5,
  },
  loginBtn: {
    padding: '0.85rem 2rem',
    backgroundColor: '#667eea',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  // Cards
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: '12px',
    padding: '1.25rem',
    border: '1px solid #2a2a4a',
  },
  cardTitle: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#e2e8f0',
    margin: '0 0 0.5rem',
  },
  cardDesc: {
    color: '#8b8ba7',
    fontSize: '0.8rem',
    lineHeight: 1.6,
    margin: '0 0 0.75rem',
  },
  // Forms
  formGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.3rem',
    marginBottom: '0.75rem',
  },
  label: {
    color: '#8b8ba7',
    fontSize: '0.8rem',
    fontWeight: 500,
  },
  input: {
    backgroundColor: '#141428',
    border: '1px solid #2a2a4a',
    borderRadius: '8px',
    padding: '0.65rem 0.85rem',
    color: '#e2e8f0',
    fontSize: '0.9rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  textarea: {
    backgroundColor: '#141428',
    border: '1px solid #2a2a4a',
    borderRadius: '8px',
    padding: '0.65rem 0.85rem',
    color: '#e2e8f0',
    fontSize: '0.85rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
    resize: 'vertical' as const,
    fontFamily: 'monospace',
    marginBottom: '0.75rem',
  },
  // API Key display
  keyRow: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
    marginBottom: '0.75rem',
  },
  keyBox: {
    flex: 1,
    backgroundColor: '#141428',
    border: '1px solid #2a2a4a',
    borderRadius: '8px',
    padding: '0.65rem 0.85rem',
    overflow: 'hidden',
  },
  keyText: {
    color: '#a5b4fc',
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    wordBreak: 'break-all' as const,
  },
  copyBtn: {
    padding: '0.65rem 1rem',
    backgroundColor: '#667eea',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
  },
  // Buttons
  primaryBtn: {
    width: '100%',
    padding: '0.75rem',
    backgroundColor: '#667eea',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  secondaryBtn: {
    padding: '0.6rem 1.25rem',
    backgroundColor: 'transparent',
    color: '#a5b4fc',
    border: '1px solid #4a4a7a',
    borderRadius: '8px',
    fontSize: '0.85rem',
    fontWeight: 500,
    cursor: 'pointer',
  },
  dangerLink: {
    background: 'none',
    border: 'none',
    color: '#f87171',
    fontSize: '0.75rem',
    cursor: 'pointer',
    padding: 0,
    textDecoration: 'underline' as const,
  },
  linkBtn: {
    background: 'none',
    border: 'none',
    color: '#667eea',
    fontSize: '0.8rem',
    fontWeight: 500,
    cursor: 'pointer',
    padding: 0,
  },
  // Code blocks
  code: {
    backgroundColor: '#141428',
    color: '#a5b4fc',
    padding: '0.15rem 0.35rem',
    borderRadius: '4px',
    fontSize: '0.8rem',
    fontFamily: 'monospace',
  },
  codeBlock: {
    backgroundColor: '#0a0a14',
    border: '1px solid #2a2a4a',
    borderRadius: '8px',
    padding: '1rem',
    color: '#e2e8f0',
    fontSize: '0.75rem',
    fontFamily: 'monospace',
    lineHeight: 1.7,
    overflow: 'auto' as const,
    whiteSpace: 'pre' as const,
    margin: '0 0 0.75rem',
  },
  // Feedback
  message: {
    padding: '0.65rem 1rem',
    borderRadius: '8px',
    border: '1px solid',
    fontSize: '0.85rem',
    fontWeight: 500,
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #2a2a4a',
    borderTop: '3px solid #667eea',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  // Docs
  docsContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1rem',
  },
};
