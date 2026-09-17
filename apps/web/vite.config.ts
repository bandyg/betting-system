import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  appType: 'spa',
  plugins: [react()],
  server: {
    port: 4200,
    proxy: { '/api': 'http://localhost:4100' }
  },
  preview: {
    port: 4200,
    host: '0.0.0.0',
    allowedHosts: true,  // 允許所有 host (vite 5/6 內建安全機制)
    proxy: { '/api': 'http://localhost:4100' }
  }
});
