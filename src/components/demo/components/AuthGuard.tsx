import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAccesly } from '@accesly/react';

/**
 * Defiende rutas autenticadas. El SDK 1.1.0+ expone el state `'bootstrapping'`
 * para el primer render mientras el SessionStorage termina de cargar, así que
 * no necesitamos hacks de `setTimeout(200)` como en versiones previas.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { auth } = useAccesly();
  const location = useLocation();

  if (auth.status === 'bootstrapping') {
    return (
      <div className="flex items-center justify-center py-12 text-accesly-subtle text-sm">
        Verificando sesión…
      </div>
    );
  }

  if (auth.status !== 'authenticated') {
    return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
