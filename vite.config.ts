import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    port: 5173,
    open: true,
    host: true,                    // ← Required for ngrok
    allowedHosts: true,            // ← This fixes the "Blocked request" error
  },
  preview: {
    port: 4173,
    host: true,
    allowedHosts: true,
  },
});