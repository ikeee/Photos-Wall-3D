import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 开发时后端跑在 8787（node server.mjs），API 与照片资源走代理
export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/photos': 'http://127.0.0.1:8787',
      '/thumbs': 'http://127.0.0.1:8787',
    },
  },
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 2000,
  },
});
