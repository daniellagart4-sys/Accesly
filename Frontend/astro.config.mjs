// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  // SSR mode: all pages are server-rendered, API routes work
  output: 'server',

  // Node.js adapter for running the server
  adapter: node({ mode: 'standalone' }),

  // React integration for interactive components (Google Login, Dashboard)
  integrations: [react()],
});
