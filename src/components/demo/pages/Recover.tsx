import { useNavigate } from 'react-router-dom';
import { RecoveryFlow } from '@accesly/react/kit';
import { PageHeader, ScreenScroll } from '../components/Layout';
import { ThemeToggle } from '../components/ThemeToggle';

export function Recover() {
  const navigate = useNavigate();
  return (
    <ScreenScroll>
      <PageHeader
        title="Recuperar wallet"
        rightSlot={<ThemeToggle />}
        onBack={() => navigate('/')}
      />
      <div className="flex-1 flex flex-col justify-center" style={{ padding: '0 0 16px' }}>
        <RecoveryFlow
          onDone={() => navigate('/wallet')}
          onCancel={() => navigate('/signin')}
        />
      </div>
    </ScreenScroll>
  );
}
