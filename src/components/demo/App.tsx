import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useBranding } from '@accesly/react';
import { Layout } from './components/Layout';
import { WalletLauncher } from './components/WalletLauncher';
import { AuthGuard } from './components/AuthGuard';
import { Landing } from './pages/Landing';
import { SignUp } from './pages/SignUp';
import { SignIn } from './pages/SignIn';
import { AuthCallback } from './pages/AuthCallback';
import { Recover } from './pages/Recover';
import { CreateWallet } from './pages/CreateWallet';
import { Wallet } from './pages/Wallet';
import { Send } from './pages/Send';
import { Receive } from './pages/Receive';
import { Add } from './pages/Add';
import { Kyc } from './pages/Kyc';
import { Swap } from './pages/Swap';
import { History } from './pages/History';
import { Account } from './pages/Account';

/**
 * Rutas que muestran el wallet SIN el tab bar (landing / auth flows).
 *
 * IMPORTANTE: el matching es contra `location.pathname` ya stripped del
 * basename `/demo`. React Router `useLocation()` devuelve la ruta lógica,
 * no la URL completa — `BrowserRouter basename="/demo"` se encarga del
 * stripping. Así `/demo/signin` → `pathname = '/signin'`.
 */
const BARE_PATHS = new Set([
  '/',
  '/signin',
  '/signup',
  '/recover',
  '/auth/callback',
  '/create-wallet',
]);

/**
 * App root: monta `<WalletLauncher>` con el árbol de rutas adentro. El
 * launcher se encarga del botón centrado en el host + abrir/cerrar el
 * modal con el wallet. El árbol de rutas queda SIEMPRE montado para
 * preservar navegación al cerrar/reabrir.
 */
export function App() {
  // Live branding del dashboard — escribe CSS vars (--accesly-primary,
  // --accesly-grad, etc.) al :root + expone `loginButtonText` para el
  // launcher button.
  useBranding();

  const location = useLocation();
  const bare = BARE_PATHS.has(location.pathname);

  return (
    <WalletLauncher>
      <Layout bare={bare}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/recover" element={<Recover />} />
          <Route
            path="/create-wallet"
            element={
              <AuthGuard>
                <CreateWallet />
              </AuthGuard>
            }
          />
          <Route
            path="/wallet"
            element={
              <AuthGuard>
                <Wallet />
              </AuthGuard>
            }
          />
          <Route
            path="/send"
            element={
              <AuthGuard>
                <Send />
              </AuthGuard>
            }
          />
          <Route
            path="/receive"
            element={
              <AuthGuard>
                <Receive />
              </AuthGuard>
            }
          />
          <Route
            path="/add"
            element={
              <AuthGuard>
                <Add />
              </AuthGuard>
            }
          />
          <Route
            path="/kyc"
            element={
              <AuthGuard>
                <Kyc />
              </AuthGuard>
            }
          />
          <Route
            path="/swap"
            element={
              <AuthGuard>
                <Swap />
              </AuthGuard>
            }
          />
          <Route
            path="/history"
            element={
              <AuthGuard>
                <History />
              </AuthGuard>
            }
          />
          <Route
            path="/account"
            element={
              <AuthGuard>
                <Account />
              </AuthGuard>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </WalletLauncher>
  );
}
