/**
 * GoogleLoginButton.tsx - Google OAuth sign-in button.
 *
 * Uses Supabase Auth to handle the Google OAuth flow.
 * When clicked, redirects to Google for authentication.
 * After Google auth, Supabase redirects back to the app with a session.
 */

import { supabase } from '../services/supabase-client';

interface GoogleLoginButtonProps {
  /** Callback when login process starts (for loading state) */
  onLoginStart?: () => void;
  /** Callback when login fails */
  onError?: (error: string) => void;
}

export function GoogleLoginButton({ onLoginStart, onError }: GoogleLoginButtonProps) {
  /**
   * Initiate Google OAuth via Supabase.
   * Supabase handles the entire OAuth flow:
   * 1. Redirects to Google consent screen
   * 2. Google redirects back to Supabase callback URL
   * 3. Supabase creates/updates the user and sets session tokens
   * 4. User is redirected back to our app with an active session
   */
  const handleGoogleLogin = async () => {
    onLoginStart?.();

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Redirect back to the app root after Google auth
        redirectTo: window.location.origin,
      },
    });

    if (error) {
      console.error('Google login failed:', error.message);
      onError?.(error.message);
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Accesly</h1>
      <p style={styles.subtitle}>
        Your Web3 wallet, powered by account abstraction
      </p>

      <button onClick={handleGoogleLogin} style={styles.googleButton}>
        <svg style={styles.googleIcon} viewBox="0 0 24 24">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        Sign in with Google
      </button>

      <p style={styles.footer}>
        A Stellar wallet will be created automatically for you
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles (inline to avoid external CSS dependencies)
// ---------------------------------------------------------------------------
const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1.5rem',
    textAlign: 'center',
  },
  title: {
    fontSize: '2.5rem',
    fontWeight: 700,
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    margin: 0,
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: '1.1rem',
    maxWidth: '300px',
    lineHeight: 1.5,
  },
  googleButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.85rem 2rem',
    backgroundColor: '#ffffff',
    color: '#333',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'box-shadow 0.2s, transform 0.1s',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
  },
  googleIcon: {
    width: '20px',
    height: '20px',
  },
  footer: {
    color: '#64748b',
    fontSize: '0.85rem',
    marginTop: '1rem',
  },
};
