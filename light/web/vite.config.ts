import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * In sviluppo il frontend gira su :5173 e inoltra /api al backend su :8787.
 * In produzione non serve nessun proxy: e' il backend stesso a servire
 * questa build statica, quindi tutto arriva dalla stessa origine.
 */
export default defineConfig({
  plugins: [react()],
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
