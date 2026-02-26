// vite.config.ts
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  base: '/',                    // ← Added (fixes assets on Netlify)

  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/ws': {
        target: 'wss://bugeaters-production.up.railway.app',
        ws: true,
      },
    },
  },
});