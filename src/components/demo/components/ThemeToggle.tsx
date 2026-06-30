import { useTheme } from '../theme/ThemeContext';
import { IcoMoon, IcoSun } from './Icons';

export function ThemeToggle({ size = 38 }: { size?: number }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
      className="accesly-btn flex items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        border: '1px solid var(--line)',
        background: 'var(--card)',
        color: 'var(--ink2)',
        flexShrink: 0,
      }}
    >
      {theme === 'light' ? <IcoMoon size={18} /> : <IcoSun size={18} />}
    </button>
  );
}
