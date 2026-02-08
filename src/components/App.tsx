/**
 * App.tsx - Main application component.
 *
 * Manages the authentication state and renders either:
 * - GoogleLoginButton (if not authenticated)
 * - WalletDashboard (if authenticated)
 *
 * Uses Supabase Auth to listen for session changes.
 * The Google OAuth flow redirects the user to Google,
 * then back to the app where Supabase automatically
 * picks up the session from the URL hash.
 */

import { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabase-client';
import { GoogleLoginButton } from './GoogleLoginButton';
import { WalletDashboard } from './WalletDashboard';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for an existing session on mount
    // (handles page refresh and OAuth redirect return)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth state changes (login, logout, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    // Cleanup the listener on unmount
    return () => subscription.unsubscribe();
  }, []);

  // Show a minimal loading state while checking for existing session
  if (loading) {
    return (
      <div style={styles.loading}>
        <div style={styles.spinner} />
      </div>
    );
  }

  // Render login or dashboard based on authentication state
  if (session) {
    return <WalletDashboard session={session} />;
  }

  return <GoogleLoginButton />;
}

const styles: Record<string, React.CSSProperties> = {
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '200px',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #2a2a4a',
    borderTop: '3px solid #667eea',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
};
