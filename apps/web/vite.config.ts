import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_API_TARGET 控制 /api 反代目标（隔离 e2e 可覆盖；默认 production :4100）
const API_TARGET = process.env.VITE_API_TARGET ?? 'http://localhost:4100';

export default defineConfig({
  appType: 'spa',
  plugins: [react()],
  server: {
    port: 4200,
    proxy: { '/api': API_TARGET }
  },
  preview: {
    port: 4200,
    host: '0.0.0.0',
    allowedHosts: true,  // 允許所有 host (vite 5/6 內建安全機制)
    proxy: { '/api': API_TARGET }
  }
});
