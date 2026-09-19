import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_API_TARGET 控制 /api 反代目标（隔离 e2e 可覆盖；默认 production :4100）
const API_TARGET = process.env.VITE_API_TARGET ?? 'http://localhost:4100';

const apiProxy = {
  target: API_TARGET,
  changeOrigin: true,
  ws: true,  // 启用 WebSocket 转发（Sprint 4 C3 实时赔率）
};

export default defineConfig({
  appType: 'spa',
  plugins: [react()],
  server: {
    port: 4200,
    proxy: { '/api': apiProxy, '/ws': apiProxy }
  },
  preview: {
    port: 4200,
    host: '0.0.0.0',
    allowedHosts: true,  // 允許所有 host (vite 5/6 內建安全機制)
    proxy: { '/api': apiProxy, '/ws': apiProxy }
  }
});
