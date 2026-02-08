// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  // SSR mode: all pages are server-rendered, API routes work
  output: 'server',

  // Vercel adapter for serverless deployment
  adapter: vercel(),

  // React integration for interactive components (Google Login, Dashboard)
  integrations: [react()],
});
