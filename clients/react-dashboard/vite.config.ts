import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api/trading': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
      '/api/risk': {
        target: 'http://localhost:3004',
        changeOrigin: true,
      },
      '/api/market': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
