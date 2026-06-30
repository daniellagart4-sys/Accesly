import { useNavigate } from 'react-router-dom';
import { AuthForm } from '@accesly/react/kit';
import { PageHeader, ScreenScroll } from '../components/Layout';
import { ThemeToggle } from '../components/ThemeToggle';

/**
 * Email/password sign-in. Usa `<AuthForm>` del kit que ya tiene el branding
 * aplicado vía CSS vars. Lo envolvemos en el shell del example para tener
 * el header con back + theme toggle consistentes.
 */
export function SignIn() {
  const navigate = useNavigate();
  return (
    <ScreenScroll>
      <PageHeader title="Iniciar sesión" rightSlot={<ThemeToggle />} onBack={() => navigate('/')} />
      <div
        className="flex-1 flex flex-col justify-center"
        style={{ padding: '0 0 16px' }}
      >
        <AuthForm mode="sign-in" onSuccess={() => navigate('/wallet')} />
      </div>
    </ScreenScroll>
  );
}
