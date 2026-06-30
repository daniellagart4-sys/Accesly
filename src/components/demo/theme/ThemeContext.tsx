import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  readonly theme: Theme;
  toggle(): void;
}

const Ctx = createContext<ThemeContextValue>({ theme: 'light', toggle: () => undefined });

const STORAGE_KEY = 'accesly-example:theme';

function readInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* private mode / quota — no-op */
    }
  }, [theme]);

  return (
    <Ctx.Provider
      value={{
        theme,
        toggle: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(Ctx);
}
