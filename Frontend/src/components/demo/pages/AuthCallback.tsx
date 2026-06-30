import { useNavigate } from 'react-router-dom';
import { useAccesly } from '@accesly/react';
import { AuthCallback as KitAuthCallback } from '@accesly/react/kit';
import { Mark } from '../components/Brand';

/**
 * Callback de OAuth (Google) — el SDK kit hace el exchange. Mientras tanto,
 * mostramos el loading state del Brand Book: Mark animado con spinner.
 *
 * On success: si el user ya tiene wallet en este device → /wallet, si no
 * → /create-wallet para bootstrappearla.
 */
export function AuthCallback() {
  const navigate = useNavigate();
  const { wallet, _internal } = useAccesly();

  return (
    <div className="flex-1 flex flex-col items-center justify-center anim-scr" style={{ gap: 22 }}>
      <div className="anim-pop">
        <Mark size={62} radius={20} />
      </div>
      <div
        aria-hidden
        style={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          border: '2.5px solid var(--lav-soft)',
          borderTopColor: 'var(--lav)',
          animationName: 'spin',
          animationDuration: '0.8s',
          animationTimingFunction: 'linear',
          animationIterationCount: 'infinite',
        }}
      />
      <div style={{ color: 'var(--ink2)', fontSize: 14 }}>Iniciando sesión segura…</div>
      <div style={{ display: 'none' }}>
        <KitAuthCallback
          onSuccess={async () => {
            // El RecoveryFlow del kit setea este flag en sessionStorage
            // ANTES de redirigir a Google OAuth. Al volver acá, sabemos que
            // el OAuth era parte de un recovery — no del create-wallet flow.
            // No limpiamos el flag aquí; el RecoveryFlow lo consume al
            // re-mount con auth.status === 'authenticated'.
            const recoveryIntent =
              typeof window !== 'undefined' &&
              window.sessionStorage.getItem('accesly:recovery-via-google') === '1';
            if (recoveryIntent) {
              navigate('/recover');
              return;
            }

            const username = _internal.username;
            if (!username) {
              navigate('/wallet');
              return;
            }
            const stored = await wallet.getStoredCredential(username).catch(() => null);
            navigate(stored?.walletAddress ? '/wallet' : '/create-wallet');
          }}
          onError={() => navigate('/signin')}
        />
      </div>
    </div>
  );
}
