/**
 * auth.ts - Popup-based OAuth authentication for the SDK.
 *
 * Opens a popup window pointing to the Accesly auth page.
 * The popup handles Google OAuth and sends the resulting tokens
 * back to this window via postMessage.
 */

import type { AuthTokens } from './types';

/** Popup window dimensions */
const POPUP_WIDTH = 450;
const POPUP_HEIGHT = 600;

/**
 * Open the Accesly auth popup and wait for the user to authenticate.
 * Returns the auth tokens on success, or throws on failure/cancellation.
 */
export function openAuthPopup(baseUrl: string, appId: string): Promise<AuthTokens> {
  return new Promise((resolve, reject) => {
    // Center the popup on screen
    const left = window.screenX + (window.innerWidth - POPUP_WIDTH) / 2;
    const top = window.screenY + (window.innerHeight - POPUP_HEIGHT) / 2;

    const popup = window.open(
      `${baseUrl}/auth/popup?appId=${appId}`,
      'accesly-auth',
      `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top},toolbar=no,menubar=no`
    );

    if (!popup) {
      reject(new Error('Failed to open popup. Please allow popups for this site.'));
      return;
    }

    /** Handle messages from the popup */
    function handleMessage(event: MessageEvent) {
      // Only accept messages from the Accesly domain
      if (!event.origin.includes(new URL(baseUrl).host)) return;

      if (event.data?.type === 'accesly-auth-success') {
        cleanup();
        resolve(event.data.payload as AuthTokens);
      }

      if (event.data?.type === 'accesly-auth-error') {
        cleanup();
        reject(new Error(event.data.error || 'Authentication failed'));
      }
    }

    /** Detect if the user closed the popup manually */
    const pollClosed = setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(new Error('Authentication cancelled'));
      }
    }, 500);

    /** Remove all listeners and intervals */
    function cleanup() {
      window.removeEventListener('message', handleMessage);
      clearInterval(pollClosed);
    }

    window.addEventListener('message', handleMessage);
  });
}
