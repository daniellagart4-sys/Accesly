import { useAccesly } from '@accesly/react';
import { formatError } from '@accesly/core';

/**
 * Botón "Continuar con Google" — dispara el redirect a Cognito Hosted UI con
 * el IdP Google. El user vuelve a `/auth/callback?code=xxx` después.
 *
 * `signInWithGoogle()` es `void` (causa `window.location.assign`, no resuelve
 * promesa). Si throw es síncrono (p.ej. `hostedUiDomain` sin configurar),
 * lo reportamos vía `onError`.
 */
export function GoogleSignInButton({ onError }: { onError: (msg: string) => void }) {
  const { auth } = useAccesly();

  function handleClick() {
    try {
      auth.signInWithGoogle();
    } catch (err) {
      onError(formatError(err));
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg bg-white border border-accesly-border text-sm font-medium hover:border-accesly-ink transition"
    >
      <GoogleIcon />
      Continuar con Google
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
