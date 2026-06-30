import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccesly } from '@accesly/react';
import { CreateWalletFlow } from '@accesly/react/kit';
import { PageHeader, ScreenScroll } from '../components/Layout';
import { ThemeToggle } from '../components/ThemeToggle';
import { Accent, Mark } from '../components/Brand';

/**
 * Wrapper de `<CreateWalletFlow>` que primero pide el password (el AuthForm
 * lo descarta tras signIn por seguridad). El SDK necesita el password para
 * derivar la `recoveryKey` que cifra F3 — sin esto, recovery v2 no funciona.
 *
 * Google sign-in skip: si el user llegó por Google, no tiene password —
 * mostramos un input vacío que actúa como passphrase de recovery (cualquier
 * string sirve, el SDK lo PBKDF2-derivea igual). Se le dice claramente.
 *
 * Pre-flight check: ANTES de mostrar el form, consultamos `wallet.fetchRemote`.
 * Si el backend ya tiene una wallet para este Cognito user pero este device
 * no tiene credential local, lo redirigimos a /recover. Esto evita el dead
 * end donde el user llena la passphrase, click Continuar, y `wallet.bootstrap`
 * truena con `WalletAlreadyExistsError` (que la kit muestra pero ya gastó
 * un passkey enroll innecesario).
 */
export function CreateWallet() {
  const navigate = useNavigate();
  const { auth, wallet } = useAccesly();
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [preflight, setPreflight] = useState<'checking' | 'ok' | 'needs-recovery'>('checking');

  // Pre-flight: detectar wallet huérfana en backend ANTES de pedir passphrase.
  useEffect(() => {
    if (auth.status !== 'authenticated' || !auth.username) return;
    let cancelled = false;
    (async () => {
      try {
        const remote = await wallet.fetchRemote();
        if (cancelled) return;
        if (!remote) {
          setPreflight('ok');
          return;
        }
        const local = await wallet.getStoredCredential(auth.username!);
        if (cancelled) return;
        // Backend tiene wallet + local tiene credential con fragments → todo OK,
        // bootstrap será idempotent. Backend tiene wallet pero local no tiene
        // fragments → no podemos crear; necesita recovery.
        if (!local || !local.fragmentF1Encrypted || !local.prfSalt) {
          setPreflight('needs-recovery');
        } else {
          setPreflight('ok');
        }
      } catch {
        // Si fetchRemote falla (network), dejamos pasar — el bootstrap
        // mismo tendrá su propio error handling.
        if (!cancelled) setPreflight('ok');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth.status, auth.username, wallet]);

  if (!auth.username) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--ink2)' }}>
        Cargando sesión…
      </div>
    );
  }

  if (preflight === 'checking') {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--ink2)' }}>
        Verificando…
      </div>
    );
  }

  if (preflight === 'needs-recovery') {
    return (
      <ScreenScroll>
        <PageHeader
          title="Ya tienes una wallet"
          rightSlot={<ThemeToggle />}
          onBack={() => navigate('/')}
        />
        <div className="flex flex-col items-center text-center" style={{ marginTop: 20 }}>
          <Mark size={56} radius={18} />
          <h2
            style={{
              marginTop: 18,
              fontWeight: 700,
              fontSize: 20,
              color: 'var(--ink)',
              letterSpacing: '-.015em',
            }}
          >
            Recupera tu wallet
          </h2>
          <Accent w={36} />
          <p
            style={{
              fontSize: 13,
              color: 'var(--ink2)',
              marginTop: 12,
              lineHeight: 1.5,
              maxWidth: 300,
            }}
          >
            Ya tienes una wallet asociada a este correo pero este dispositivo no
            tiene la llave. Usa el flow de recovery para restaurarla.
          </p>
        </div>
        <div style={{ marginTop: 'auto', paddingBottom: 16 }}>
          <button
            type="button"
            onClick={() => navigate('/recover')}
            className="accesly-btn"
            style={{
              width: '100%',
              height: 54,
              borderRadius: 16,
              border: 'none',
              background: 'var(--lav)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 15,
              boxShadow: 'var(--glow-lav)',
            }}
          >
            Ir a recovery
          </button>
        </div>
      </ScreenScroll>
    );
  }

  if (!confirmed) {
    return (
      <ScreenScroll>
        <PageHeader
          title="Configura tu wallet"
          rightSlot={<ThemeToggle />}
          onBack={() => navigate('/')}
        />
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (password) setConfirmed(true);
          }}
          className="flex-1 flex flex-col"
        >
          <div className="flex flex-col items-center text-center" style={{ marginTop: 12 }}>
            <Mark size={56} radius={18} />
            <h2
              style={{
                marginTop: 18,
                fontWeight: 700,
                fontSize: 20,
                color: 'var(--ink)',
                letterSpacing: '-.015em',
              }}
            >
              Crea tu llave de recovery
            </h2>
            <Accent w={36} />
            <p
              style={{
                fontSize: 13,
                color: 'var(--ink2)',
                marginTop: 12,
                lineHeight: 1.5,
                maxWidth: 300,
              }}
            >
              Esta passphrase cifra tu fragmento de recuperación (PBKDF2 600k).
              <br />
              <strong>Guárdala bien</strong> — sin ella no puedes recuperar la
              wallet desde otro dispositivo.
            </p>
          </div>

          <div style={{ marginTop: 'auto', paddingBottom: 16 }}>
            <input
              type="password"
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tu passphrase de recuperación"
              style={{
                width: '100%',
                padding: '14px 16px',
                borderRadius: 14,
                border: '1px solid var(--line)',
                background: 'var(--card)',
                color: 'var(--ink)',
                fontSize: 14,
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={!password}
              className="accesly-btn"
              style={{
                width: '100%',
                marginTop: 12,
                height: 54,
                borderRadius: 16,
                border: 'none',
                background: 'var(--lav)',
                color: '#fff',
                fontWeight: 700,
                fontSize: 15,
                boxShadow: 'var(--glow-lav)',
                opacity: !password ? 0.55 : 1,
              }}
            >
              Continuar
            </button>
          </div>
        </form>
      </ScreenScroll>
    );
  }

  return (
    <ScreenScroll>
      <PageHeader title="Configura tu wallet" rightSlot={<ThemeToggle />} onBack={() => navigate('/')} />
      <div className="flex-1">
        <CreateWalletFlow
          email={auth.username}
          password={password}
          onRecoverInstead={() => {
            setPassword('');
            navigate('/recover');
          }}
          onDone={() => {
            setPassword('');
            navigate('/wallet');
          }}
        />
      </div>
    </ScreenScroll>
  );
}
