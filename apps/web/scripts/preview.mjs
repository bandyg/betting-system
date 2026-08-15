// pm2 wrapper: 启动 vite preview (apps/web)
// 用法: pm2 start scripts/preview.mjs --cwd apps/web
// 为什么不用 ecosystem 里 script:'pnpm': pm2 对无扩展名 script 默认 interpreter=bash，
// 会把 "preview" 当命令执行（/usr/bin/bash: preview: No such file）。.mjs 后缀让 pm2 用 node 跑。
import { spawn } from 'node:child_process';

const child = spawn('pnpm', ['preview', '--host', '0.0.0.0'], {
  stdio: 'inherit',
  shell: false,
});

child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  console.error('[preview.mjs] spawn error:', err);
  process.exit(1);
});
