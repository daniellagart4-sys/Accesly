import { MovementsList } from '@accesly/react/kit';
import { PageHeader, ScreenScroll } from '../components/Layout';
import { ThemeToggle } from '../components/ThemeToggle';

/**
 * History — feed completo paginado de 5 en 5 (Brand v3). El sort por tiempo
 * (descending por ledger) ya viene del hook `useWalletHistory` que usa
 * `MovementsList` por dentro.
 */
export function History() {
  return (
    <ScreenScroll>
      <PageHeader title="Historial" rightSlot={<ThemeToggle />} />

      <p style={{ fontSize: 13, color: 'var(--ink2)', margin: '0 2px 14px' }}>
        Todas las operaciones de tu wallet — refrescadas en tiempo real desde
        Stellar Expert.
      </p>

      <div
        style={{
          padding: 14,
          borderRadius: 18,
          background: 'var(--card)',
          border: '1px solid var(--line)',
        }}
      >
        <MovementsList source="history" pageSize={5} limit={50} />
      </div>
    </ScreenScroll>
  );
}
