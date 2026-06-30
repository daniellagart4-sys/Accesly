import { StrictMode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AcceslyProvider } from '@accesly/react';
import { IndexedDbDeviceStore } from '@accesly/core';
import { App } from './App';
import { ThemeProvider } from './theme/ThemeContext';
import './styles.css';

/**
 * Astro island entry para el demo del SDK. Espejo de `accesly-example/src/main.tsx`,
 * pero adaptado para vivir bajo `/demo/*` en una app Astro existente.
 *
 * Diferencias vs el example standalone:
 *  - `<BrowserRouter basename="/demo">` — todas las rutas internas
 *    (Landing, SignIn, etc.) viven bajo `/demo/*` del host. El componente
 *    se monta vía `client:only="react"` en `pages/demo/[...path].astro`
 *    porque `IndexedDbDeviceStore` no es SSR-safe.
 *  - `appId` desde `PUBLIC_ACCESLY_APP_ID` (convención Astro) en vez de
 *    `VITE_ACCESLY_APP_ID`. Default sigue siendo `accesly-example` por si
 *    el .env no está seteado.
 *  - No necesita el setup de `createRoot` ni `#root` lookup — Astro maneja
 *    el mount del island contra el slot del Layout.
 *  - No incluye el safety net de Vite chunk reload — Astro tiene su propia
 *    semántica de HMR y normalmente no produce ese error.
 */
const appId = import.meta.env.PUBLIC_ACCESLY_APP_ID ?? 'accesly-example';

export function DemoEntry() {
  return (
    <StrictMode>
      <ThemeProvider>
        <AcceslyProvider
          appId={appId}
          env="dev"
          // El SPA vive bajo /demo en este host (Astro), así que la
          // callback de Google es /demo/auth/callback. Sin este prop el
          // SDK defaulta a `${origin}/auth/callback` (sin /demo) y Cognito
          // rechaza con redirect_mismatch.
          authCallbackPath="/demo/auth/callback"
          overrides={{ deviceStore: new IndexedDbDeviceStore() }}
        >
          <BrowserRouter basename="/demo">
            <App />
          </BrowserRouter>
        </AcceslyProvider>
      </ThemeProvider>
    </StrictMode>
  );
}
