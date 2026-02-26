// vite.config.ts
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  build: {
    outDir: 'dist', // Ensure output matches server.ts expectation
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
        target: 'wss://bugeaters-production.up.railway.app', // Replace with your actual Railway URL during dev if needed
        ws: true,
      },
    },
  },
});
