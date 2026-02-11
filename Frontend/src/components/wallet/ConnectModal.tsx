/**
 * ConnectModal.tsx - Login modal with Google OAuth option.
 *
 * Opens when the user clicks "Connect Wallet" in the disconnected state.
 * Uses backdrop blur and slide-up animation.
 */

import { useWallet } from './WalletProvider';

interface ConnectModalProps {
  onClose: () => void;
}

export function ConnectModal({ onClose }: ConnectModalProps) {
  const { connect } = useWallet();

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button onClick={onClose} style={styles.closeBtn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Branding */}
        <div style={styles.iconWrapper}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#667eea" strokeWidth="1.5">
            <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2.5" />
            <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
          </svg>
        </div>
        <h2 style={styles.title}>Connect to Accesly</h2>
        <p style={styles.subtitle}>Choose how you want to connect</p>

        {/* Login options */}
        <div style={styles.options}>
          <button onClick={() => connect()} style={styles.googleBtn}>
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
            Continue with Google
          </button>
        </div>

        <p style={styles.footer}>
          A Stellar wallet will be created automatically
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: '1rem',
    animation: 'fadeIn 0.2s ease-out',
  },
  modal: {
    position: 'relative' as const,
    backgroundColor: '#141428',
    borderRadius: '20px',
    border: '1px solid #2a2a4a',
    padding: '2rem',
    width: '100%',
    maxWidth: '380px',
    textAlign: 'center' as const,
    animation: 'slideUp 0.3s ease-out',
  },
  closeBtn: {
    position: 'absolute' as const,
    top: '1rem',
    right: '1rem',
    background: 'none',
    border: 'none',
    color: '#64748b',
    cursor: 'pointer',
    padding: '4px',
  },
  iconWrapper: {
    width: '56px',
    height: '56px',
    borderRadius: '16px',
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
    border: '1px solid rgba(102, 126, 234, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 1rem',
  },
  title: {
    fontSize: '1.3rem',
    fontWeight: 700,
    color: '#e2e8f0',
    margin: '0 0 0.25rem',
  },
  subtitle: {
    color: '#64748b',
    fontSize: '0.85rem',
    margin: '0 0 1.5rem',
  },
  options: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.75rem',
    marginBottom: '1.25rem',
  },
  googleBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
    padding: '0.85rem 1.5rem',
    backgroundColor: '#1a1a2e',
    color: '#e2e8f0',
    border: '1px solid #2a2a4a',
    borderRadius: '12px',
    fontSize: '0.95rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'border-color 0.2s, background-color 0.2s',
    width: '100%',
  },
  googleIcon: {
    width: '20px',
    height: '20px',
    flexShrink: 0,
  },
  footer: {
    color: '#475569',
    fontSize: '0.75rem',
    margin: 0,
  },
};
