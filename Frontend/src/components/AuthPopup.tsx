/**
 * AuthPopup.tsx - OAuth popup component for SDK authentication.
 *
 * This runs inside a popup window opened by the SDK.
 * Flow:
 * 1. Show "Continue with Google" button
 * 2. User authenticates with Google via Supabase OAuth
 * 3. Google redirects back to this popup page
 * 4. Popup detects the session and sends tokens to the parent via postMessage
 * 5. Popup closes automatically
 */

import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase-client';

export function AuthPopup() {
  const [status, setStatus] = useState<'login' | 'checking' | 'success' | 'error'>('checking');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    // Check if we already have a session (returning from Google OAuth redirect)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && window.opener) {
        sendTokenToParent(session);
        return;
      }
      setStatus('login');
    });

    // Also listen for auth state changes (handles the OAuth callback)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && window.opener) {
        sendTokenToParent(session);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  /** Send auth tokens to the parent window (SDK) and close the popup */
  function sendTokenToParent(session: any) {
    setStatus('success');
    window.opener.postMessage(
      {
        type: 'accesly-auth-success',
        payload: {
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
          expiresAt: session.expires_at,
          user: {
            id: session.user.id,
            email: session.user.email,
          },
        },
      },
      '*'
    );
    // Close popup after a brief moment so user sees "success"
    setTimeout(() => window.close(), 800);
  }

  /** Initiate Google OAuth, redirecting back to this popup page */
  async function handleGoogleLogin() {
    setStatus('checking');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/auth/popup',
      },
    });
    if (error) {
      setErrorMsg(error.message);
      setStatus('error');
    }
  }

  // --- Render based on status ---

  if (status === 'checking') {
    return (
      <div style={styles.container}>
        <div style={styles.spinner} />
        <p style={styles.text}>Connecting...</p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div style={styles.container}>
        <div style={styles.successIcon}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="8 12 11 15 16 9" />
          </svg>
        </div>
        <p style={styles.successText}>Connected! Closing...</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div style={styles.container}>
        <p style={styles.errorText}>{errorMsg}</p>
        <button onClick={() => setStatus('login')} style={styles.retryBtn}>
          Try Again
        </button>
      </div>
    );
  }

  // Login state
  return (
    <div style={styles.container}>
      {/* Branding */}
      <div style={styles.iconWrapper}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#667eea" strokeWidth="1.5">
          <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2.5" />
          <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
        </svg>
      </div>
      <h2 style={styles.title}>Connect to Accesly</h2>
      <p style={styles.subtitle}>Sign in to continue</p>

      {/* Google login button */}
      <button onClick={handleGoogleLogin} style={styles.googleBtn}>
        <svg style={styles.googleIcon} viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
        Continue with Google
      </button>

      <p style={styles.footer}>
        Powered by Accesly
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    gap: '1rem',
    textAlign: 'center' as const,
    padding: '2rem',
  },
  iconWrapper: {
    width: '52px',
    height: '52px',
    borderRadius: '14px',
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
    border: '1px solid rgba(102, 126, 234, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: '1.25rem',
    fontWeight: 700,
    color: '#e2e8f0',
    margin: 0,
  },
  subtitle: {
    color: '#64748b',
    fontSize: '0.85rem',
    margin: '0 0 0.5rem',
  },
  googleBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
    padding: '0.85rem 2rem',
    backgroundColor: '#1a1a2e',
    color: '#e2e8f0',
    border: '1px solid #2a2a4a',
    borderRadius: '12px',
    fontSize: '0.95rem',
    fontWeight: 500,
    cursor: 'pointer',
    width: '100%',
    maxWidth: '280px',
  },
  googleIcon: {
    width: '20px',
    height: '20px',
    flexShrink: 0,
  },
  footer: {
    color: '#475569',
    fontSize: '0.7rem',
    marginTop: '1rem',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #2a2a4a',
    borderTop: '3px solid #667eea',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  text: {
    color: '#8b8ba7',
    fontSize: '0.9rem',
  },
  successIcon: {
    marginBottom: '0.5rem',
  },
  successText: {
    color: '#34d399',
    fontSize: '1rem',
    fontWeight: 600,
  },
  errorText: {
    color: '#f87171',
    fontSize: '0.9rem',
  },
  retryBtn: {
    padding: '0.6rem 1.5rem',
    backgroundColor: '#667eea',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '0.9rem',
    cursor: 'pointer',
  },
};
