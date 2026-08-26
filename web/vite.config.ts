import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * In sviluppo il frontend gira su :5173 e inoltra /api al backend su :8787.
 * In produzione non serve nessun proxy: e' il backend stesso a servire
 * questa build statica, quindi tutto arriva dalla stessa origine.
 *
 * Tailwind entra come plugin di Vite (v4): niente postcss.config, niente
 * tailwind.config. Il tema sta in `src/styles/theme.css`, dentro `@theme`.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
});
