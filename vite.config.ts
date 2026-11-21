import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// Valeurs par défaut pour fonctionner hors de Replit (local, Netlify).
const port = Number(process.env.PORT || 5173);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env.PORT}"`);
}
const basePath = process.env.BASE_PATH || '/';

export default defineConfig({
  base: basePath,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
    // En développement, /api est relayé vers le serveur local (`npm run dev:api`).
    proxy: { '/api': process.env.API_PROXY || 'http://localhost:8888' },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
