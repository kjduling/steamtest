import { defineConfig } from 'vite';

/**
 * Vite only builds the browser client. The Node server mounts Vite as middleware
 * in development and serves `dist` in production, so both share one origin and no
 * proxy configuration is needed.
 */
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    port: 5173,
  },
});