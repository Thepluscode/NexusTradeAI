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
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/index.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  server: {
    port: 3020,
    proxy: {
      '/api/trading': {
        target: 'http://localhost:3002',  // Stock Bot
        changeOrigin: true,
      },
      '/api/forex': {
        target: 'http://localhost:3005',  // Forex Bot
        changeOrigin: true,
      },
      '/api/crypto': {
        target: 'http://localhost:3006',  // Crypto Bot
        changeOrigin: true,
      },
      '/api/risk': {
        target: 'http://localhost:3004',  // Risk Management
        changeOrigin: true,
      },
      '/api/market': {
        target: 'http://localhost:3001',  // Live Data Server
        changeOrigin: true,
      },
    },
  },
});
