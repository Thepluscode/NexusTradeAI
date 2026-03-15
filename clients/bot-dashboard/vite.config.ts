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
    rolldownOptions: {
      output: {
        entryFileNames: 'assets/index.js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]',
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/react-router')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/@mui/icons-material')) {
            return 'vendor-mui-icons';
          }
          if (id.includes('node_modules/@mui/system') || id.includes('node_modules/@mui/styled-engine')) {
            return 'vendor-mui-system';
          }
          if (id.includes('node_modules/@mui/lab')) {
            return 'vendor-mui-lab';
          }
          if (id.includes('node_modules/@mui')) {
            return 'vendor-mui-core';
          }
          if (id.includes('node_modules/@tanstack/react-query') || id.includes('node_modules/react-query') || id.includes('node_modules/axios')) {
            return 'vendor-query';
          }
        },
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
