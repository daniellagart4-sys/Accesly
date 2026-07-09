import { useNavigate } from 'react-router-dom';
import { SendFlow } from '@accesly/react/kit';
import { PageHeader, ScreenScroll } from '../components/Layout';
import { ThemeToggle } from '../components/ThemeToggle';

/**
 * Send — wrapper del kit `<SendFlow>`.
 *
 * Antes esta página tenía UI custom con teclado numérico + estados propios.
 * Migrada a `<SendFlow>` del kit (2.10.0+) para consolidar el UX y heredar
 * automáticamente el botón "Escanear QR" + parseo SEP-0007 sin duplicar
 * código. Post-éxito el kit dispara `onSuccess` y volvemos al home después
 * de un breve delay para que el balance refresque.
 */
export function Send() {
  const navigate = useNavigate();

  return (
    <ScreenScroll className="flex flex-col">
      <PageHeader title="Enviar dinero" rightSlot={<ThemeToggle />} />
      <div className="flex-1 flex justify-center pt-3">
        <SendFlow
          onSuccess={() => {
            // Delay corto para que el user vea la confirmación del kit antes
            // de volver al home donde el balance se re-fetchea.
            setTimeout(() => navigate('/wallet'), 2000);
          }}
          onCancel={() => navigate('/wallet')}
        />
      </div>
    </ScreenScroll>
  );
}
