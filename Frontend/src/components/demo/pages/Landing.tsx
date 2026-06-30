import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAccesly, useAuthProviders, useBranding } from '@accesly/react';
import { Accent, Mark, Wordmark } from '../components/Brand';
import { ThemeToggle } from '../components/ThemeToggle';
import { GoogleG, IcoPhone } from '../components/Icons';

// Defaults Accesly cuando el dev no setea el branding copy. Sincronizados
// con los placeholders del dashboard `/settings` para que el preview que el
// dev ve allá == lo que renderea acá.
const DEFAULT_TITLE = 'Entra en segundos';
const DEFAULT_HIGHLIGHT = 'Sin seed phrases.';
const DEFAULT_SUBTITLE =
  'Tu llave nunca toca nuestros servidores. Smart Account on-chain en Stellar, asegurado con biométrico.';

/**
 * Landing — punto de entrada cuando no hay sesión. Replica el "Login" del
 * mockup del Brand Book v3:
 *   - Mark grande + headline con gradient en el slogan
 *   - Botón Google (cableado al SDK via `signInWithGoogle`)
 *   - Botón email/password (linkea a /signin para el AuthForm clásico)
 *   - Pie con "Protegido por Accesly"
 *
 * Si el user ya está auth'd, lo redirige al wallet (defensa contra back button).
 */
export function Landing() {
  const navigate = useNavigate();
  const { auth } = useAccesly();
  const providers = useAuthProviders();
  const branding = useBranding();

  useEffect(() => {
    if (auth.status === 'authenticated') navigate('/wallet', { replace: true });
  }, [auth.status, navigate]);

  // Pre-interpoladas por el SDK (`{appName}` ya resuelto). Fallback al
  // copy default cuando el dev no las setea. Strings vacíos (truthy check)
  // también caen al default — evita layout vacío si el dev borra el campo.
  const headline = branding.landingTitle || DEFAULT_TITLE;
  const highlight = branding.landingHighlight || DEFAULT_HIGHLIGHT;
  const subtitle = branding.landingSubtitle || DEFAULT_SUBTITLE;

  async function onGoogle() {
    try {
      await auth.signInWithGoogle();
    } catch (err) {
      console.error('google signin failed', err);
    }
  }

  const showGoogle = providers.providers.includes('google');
  const showEmail = providers.providers.includes('email');
  const showPhone = providers.providers.includes('phone');

  return (
    <div
      className="flex-1 relative flex flex-col justify-center anim-scr"
      style={{ padding: '26px 26px 26px' }}
    >
      <div style={{ position: 'absolute', top: 26, right: 26, zIndex: 2 }}>
        <ThemeToggle />
      </div>

      <div className="flex flex-col items-center text-center">
        {branding.logoUrl ? (
          <img
            src={branding.logoUrl}
            alt={branding.displayName ?? ''}
            width={66}
            height={66}
            style={{
              borderRadius: 20,
              objectFit: 'cover',
              boxShadow: '0 12px 32px rgba(139,108,231,.25)',
            }}
            onError={(e) => {
              // Si la URL del logo falla (404, CORS, etc.), ocultamos el img
              // y dejamos un hueco. Mejor que el roto-image icon del browser.
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <Mark size={66} radius={20} />
        )}
        <h1
          style={{
            fontWeight: 800,
            fontSize: 32,
            lineHeight: 1.12,
            color: 'var(--ink)',
            letterSpacing: '-.025em',
            margin: '26px 0 0',
          }}
        >
          {headline}
          <br />
          <span
            style={{
              // `--accesly-grad` lo escribe el SDK al boot a partir del
              // primaryColor del dashboard. Sin branding cae al gradient
              // lavender-mint default.
              background: 'var(--accesly-grad, var(--grad))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              display: 'inline-block',
            }}
          >
            {highlight}
          </span>
        </h1>
        <p
          style={{
            fontSize: 15,
            lineHeight: 1.55,
            color: 'var(--ink2)',
            margin: '14px 0 0',
            maxWidth: 296,
          }}
        >
          {subtitle}
        </p>
        <Accent w={48} />
      </div>

      <div className="flex flex-col gap-2.5" style={{ marginTop: 32 }}>
        {showGoogle ? (
          <button
            type="button"
            onClick={() => void onGoogle()}
            className="accesly-btn flex items-center justify-center gap-3"
            style={{
              height: 54,
              borderRadius: 16,
              border: '1px solid var(--line)',
              background: 'var(--card)',
              color: 'var(--ink)',
              fontWeight: 700,
              fontSize: 15,
            }}
          >
            <GoogleG />
            Continuar con Google
          </button>
        ) : null}
        {showEmail ? (
          <Link
            to="/signin"
            className="accesly-btn flex items-center justify-center gap-3"
            style={{
              height: 54,
              borderRadius: 16,
              border: '1px solid var(--line)',
              background: 'var(--card)',
              color: 'var(--ink)',
              fontWeight: 700,
              fontSize: 15,
              textDecoration: 'none',
            }}
          >
            Iniciar sesión con correo
          </Link>
        ) : null}
        {showEmail ? (
          <Link
            to="/signup"
            className="accesly-btn flex items-center justify-center gap-2"
            style={{
              height: 48,
              borderRadius: 16,
              border: '1.5px dashed var(--lav-soft)',
              background: 'transparent',
              color: 'var(--lav-ink)',
              fontWeight: 700,
              fontSize: 14,
              textDecoration: 'none',
            }}
          >
            <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>+</span>
            Crear cuenta nueva
          </Link>
        ) : null}
        {showPhone ? (
          <Link
            to="/signin"
            className="accesly-btn flex items-center justify-center gap-2"
            style={{
              height: 54,
              borderRadius: 16,
              border: '1px solid var(--line)',
              background: 'var(--card)',
              color: 'var(--ink)',
              fontWeight: 700,
              fontSize: 15,
              textDecoration: 'none',
            }}
          >
            <IcoPhone size={19} strokeWidth={1.9} />
            Continuar con teléfono
          </Link>
        ) : null}
      </div>

      <p
        style={{
          textAlign: 'center',
          marginTop: 16,
          fontSize: 12,
          color: 'var(--ink3)',
        }}
      >
        ¿Cambiaste de dispositivo?{' '}
        <Link to="/recover" style={{ color: 'var(--lav-ink)', fontWeight: 600 }}>
          Recupera tu wallet
        </Link>
      </p>

      <div
        className="flex items-center justify-center gap-2"
        style={{
          position: 'absolute',
          bottom: 26,
          left: 0,
          right: 0,
          color: 'var(--ink3)',
          fontWeight: 500,
          fontSize: 12,
        }}
      >
        Protegido por
        <Wordmark size={13} color="var(--lav-ink)" />
      </div>
    </div>
  );
}
