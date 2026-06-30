// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// https://astro.build/config
export default defineConfig({
  // SSR mode: all pages are server-rendered, API routes work
  output: 'server',

  // Vercel adapter for serverless deployment
  adapter: vercel(),

  // React integration for interactive components (Google Login, Dashboard, /demo)
  integrations: [react()],

  vite: {
    plugins: [
      // El SDK del demo (`@accesly/react` + `@accesly/core`) usa
      // `@stellar/stellar-sdk` que importa `Buffer`/`crypto`/`stream` de
      // Node. En el browser esos builtins no existen — el polyfill plugin
      // les pone shims (vía `buffer`/`crypto-browserify`/etc.) durante el
      // bundling. Sin esto el demo truena con "Buffer is not defined" en
      // runtime y/o "Module 'node:crypto' has no exported member" en build.
      //
      // Scope: aplica a cualquier import del bundle del cliente, no solo
      // al demo. No tiene impacto en server-only code (las API routes y
      // demás SSR siguen usando Node real).
      nodePolyfills({
        // Solo los que necesita stellar-sdk + dependientes.
        include: ['buffer', 'crypto', 'stream', 'util', 'process'],
        // global y globalThis.Buffer disponibles sin import explícito.
        globals: { Buffer: true, global: true, process: true },
        protocolImports: true,
      }),
    ],
    ssr: {
      // No empujar `@accesly/react` ni `@accesly/core` por el path SSR de
      // Astro — viven solo en el bundle del cliente del island del demo.
      // Esto evita que el server intente cargarlos y se queje de
      // IndexedDB/WebAuthn browser-only APIs.
      noExternal: ['@accesly/react', '@accesly/core'],
    },
  },
});
