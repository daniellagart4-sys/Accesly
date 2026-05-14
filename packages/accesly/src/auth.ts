import type { CognitoTokens } from './types';

const POPUP_WIDTH = 450;
const POPUP_HEIGHT = 650;

/**
 * Open the Cognito Hosted UI in a popup and wait for tokens.
 *
 * The popup lands on cognitoCallbackUrl (a page in the host app) after the
 * user authenticates. That page must call exchangeCognitoCode() which
 * exchanges the code and postMessages the tokens back here.
 */
export function openCognitoPopup(
  cognitoDomain: string,
  cognitoClientId: string,
  cognitoCallbackUrl: string
): Promise<CognitoTokens> {
  return new Promise((resolve, reject) => {
    const left = Math.round(window.screenX + (window.innerWidth - POPUP_WIDTH) / 2);
    const top  = Math.round(window.screenY + (window.innerHeight - POPUP_HEIGHT) / 2);

    const authUrl =
      `https://${cognitoDomain}/oauth2/authorize` +
      `?client_id=${encodeURIComponent(cognitoClientId)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent('openid email profile')}` +
      `&redirect_uri=${encodeURIComponent(cognitoCallbackUrl)}`;

    const popup = window.open(
      authUrl,
      'accesly-auth',
      `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top},toolbar=no,menubar=no`
    );

    if (!popup) {
      reject(new Error('Popup blocked. Please allow popups for this site.'));
      return;
    }

    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;

      if (event.data?.type === 'accesly-cognito-success') {
        cleanup();
        resolve(event.data.payload as CognitoTokens);
      }

      if (event.data?.type === 'accesly-cognito-error') {
        cleanup();
        reject(new Error(event.data.error ?? 'Authentication failed'));
      }
    }

    const pollClosed = setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(new Error('Authentication cancelled'));
      }
    }, 500);

    function cleanup() {
      window.removeEventListener('message', handleMessage);
      clearInterval(pollClosed);
    }

    window.addEventListener('message', handleMessage);
  });
}

/**
 * Exchange a Cognito authorization code for tokens, then notify the opener.
 *
 * Place this call in your /auth/callback page (the page that Cognito redirects to):
 *
 *   // pages/auth/callback.tsx
 *   import { exchangeCognitoCode } from 'accesly';
 *
 *   export default function AuthCallback() {
 *     useEffect(() => {
 *       exchangeCognitoCode({
 *         cognitoDomain: 'accesly.auth.us-east-1.amazoncognito.com',
 *         cognitoClientId: '72q7gchu9bfnarslc9bl8paqsv',
 *         redirectUri: window.location.origin + '/auth/callback',
 *       });
 *     }, []);
 *     return <p>Authenticating…</p>;
 *   }
 */
export async function exchangeCognitoCode(opts: {
  cognitoDomain: string;
  cognitoClientId: string;
  redirectUri: string;
}): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const code  = params.get('code');
  const error = params.get('error');

  const send = (msg: object) =>
    window.opener?.postMessage(msg, window.location.origin);

  if (error) {
    send({ type: 'accesly-cognito-error', error });
    window.close();
    return;
  }

  if (!code) return; // not a callback page

  try {
    const res = await fetch(`https://${opts.cognitoDomain}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: opts.cognitoClientId,
        code,
        redirect_uri: opts.redirectUri,
      }),
    });

    if (!res.ok) throw new Error(`Token exchange failed (${res.status})`);

    const data = await res.json();
    const payload: CognitoTokens = {
      accessToken:  data.access_token,
      idToken:      data.id_token,
      refreshToken: data.refresh_token,
      expiresAt:    Date.now() + (data.expires_in as number) * 1000,
    };

    send({ type: 'accesly-cognito-success', payload });
  } catch (err: any) {
    send({ type: 'accesly-cognito-error', error: err.message });
  } finally {
    window.close();
  }
}

/** Parse the sub (userId) and email from a Cognito id_token JWT (no verification). */
export function parseCognitoIdToken(idToken: string): { sub: string; email: string } {
  try {
    const [, payload] = idToken.split('.');
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return { sub: decoded.sub as string, email: decoded.email as string };
  } catch {
    throw new Error('Failed to parse Cognito id_token');
  }
}
