import { useNavigate } from 'react-router-dom';
import { AuthForm } from '@accesly/react/kit';
import { PageHeader, ScreenScroll } from '../components/Layout';
import { ThemeToggle } from '../components/ThemeToggle';

/**
 * Sign-up email/password. Tras confirmar el código de SES, el AuthForm hace
 * signIn automático y dispara onSuccess → /create-wallet para el bootstrap
 * MPC + WebAuthn.
 */
export function SignUp() {
  const navigate = useNavigate();
  return (
    <ScreenScroll>
      <PageHeader title="Crear cuenta" rightSlot={<ThemeToggle />} onBack={() => navigate('/')} />
      <div className="flex-1 flex flex-col justify-center" style={{ padding: '0 0 16px' }}>
        <AuthForm mode="sign-up" onSuccess={() => navigate('/create-wallet')} />
      </div>
    </ScreenScroll>
  );
}
