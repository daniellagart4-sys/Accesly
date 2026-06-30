/**
 * Tailwind config scoped al demo. La paleta `accesly.*` mirror el example
 * standalone — kept stable so opacity modifiers (.../40 etc.) sigan
 * funcionando. `useBranding()` del SDK escribe los mismos tokens lógicos
 * a `document.documentElement` como `--accesly-primary` etc.
 *
 * Content path: solo `src/components/demo/**` para no scanear el resto
 * de la landing (que no usa Tailwind). El preflight base se aplica al
 * documento entero, pero solo cuando la página carga la CSS — y eso solo
 * pasa en `/demo/*` porque el import vive en `DemoEntry.tsx`.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/components/demo/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accesly: {
          ink: '#0b0f17',
          bg: '#f6f7fb',
          card: '#ffffff',
          accent: '#5b6cff',
          accentDark: '#4453d8',
          subtle: '#7a8597',
          border: '#e3e6ee',
          success: '#16a34a',
          danger: '#dc2626',
          warning: '#f59e0b',
        },
      },
      fontFamily: {
        sans: [
          '"Inter"',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          '"JetBrains Mono"',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
      },
    },
  },
  plugins: [],
};
