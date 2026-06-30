// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

/**
 * `vite-plugin-node-polyfills` por default inyecta shims de `Buffer`,
 * `crypto`, `stream`, etc. en TODOS los bundles que Vite construye —
 * incluido el SSR. En Vercel serverless (Node), eso truena al boot de la
 * function con `TypeError: Cannot read 'from' of undefined` (la versión
 * browser de `safe-buffer` se carga ANTES de que el polyfill setee el
 * `Buffer` global, así que `Buffer.from` es undefined).
 *
 * Solo lo necesitamos en el CLIENT bundle (donde `@stellar/stellar-sdk`
 * y otros usan `Buffer` y no existe nativo en browser). En Node está
 * built-in y no hace falta polyfill.
 *
 * Wrappeamos cada sub-plugin del array que devuelve `nodePolyfills(...)`
 * con `apply: (cfg, env) => !env.isSsrBuild` para que se skipee en SSR
 * builds (Astro construye 2 bundles: client + server).
 */
const polyfills = nodePolyfills({
  include: ['buffer', 'crypto', 'stream', 'util', 'process'],
  globals: { Buffer: true, global: true, process: true },
  protocolImports: true,
});

const clientOnlyPolyfills = (Array.isArray(polyfills) ? polyfills : [polyfills]).map(
  (p) => ({
    ...p,
    apply: (_config, env) => !env.isSsrBuild,
  }),
);

// https://astro.build/config
export default defineConfig({
  // SSR mode: all pages are server-rendered, API routes work
  output: 'server',

  // Vercel adapter for serverless deployment
  adapter: vercel(),

  // React integration for interactive components (Google Login, Dashboard, /demo)
  integrations: [react()],

  vite: {
    plugins: clientOnlyPolyfills,
    ssr: {
      // Marcamos los paquetes del SDK como EXTERNAL en SSR para que Node
      // los `require()` desde node_modules a runtime en vez de bundlearlos
      // dentro de la function. Si los bundleáramos (`noExternal`), también
      // se bundlearía `@stellar/stellar-sdk` + sus deps, y los polyfills
      // browser de Buffer/crypto/safe-buffer terminarían inyectados en el
      // bundle del server → crash al boot ("Cannot read 'from' of
      // undefined").
      //
      // Como las páginas del demo usan `client:only="react"`, el SDK
      // realmente nunca se EJECUTA en server — el import top-level del
      // módulo `DemoEntry.tsx` solo registra el componente, no llama
      // ninguna API browser-only. Con `external`, Node carga el SDK
      // (todos los class declarations + exports) sin tirar.
      external: ['@accesly/react', '@accesly/core', '@stellar/stellar-sdk'],
    },
  },
});
