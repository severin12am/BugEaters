import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,           // makes errors readable again
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    // Forces Vite to bake the correct URL into the bundle
    'import.meta.env.VITE_SERVER_URL': JSON.stringify(process.env.VITE_SERVER_URL),
  },
});