// pm2 ecosystem — betting-system (Amelco-style MVP)
// 用法: pm2 start ecosystem.config.js && pm2 save
// 注意: script 一律指向 .js/.mjs 文件（pm2 自动用 node 解释器），
//       不要写 script:'node'/'pnpm'（pm2 会解析错：node 二进制被当脚本 → ELF SyntaxError；pnpm 被 bash 当命令）
module.exports = {
  apps: [
    {
      name: 'betting-api',
      cwd: __dirname + '/apps/api',
      script: 'dist/index.js',
      interpreter: 'node',
      env: { NODE_ENV: 'production', PORT: 4100 },
      max_restarts: 10,
      restart_delay: 2000,
    },
    {
      name: 'betting-web',
      cwd: __dirname + '/apps/web',
      script: 'scripts/preview.mjs',
      interpreter: 'node',
      env: { NODE_ENV: 'production' },
      max_restarts: 10,
      restart_delay: 2000,
    },
    {
      // 多端前端 — Expo Web 静态产物（三端共享 code base 的 Web 端），serve-web.mjs 自带 /api 反代
      name: 'betting-mobile-web',
      cwd: __dirname + '/apps/mobile',
      script: 'scripts/serve-web.mjs',
      args: '4300',
      interpreter: 'node',
      env: { NODE_ENV: 'production' },
      max_restarts: 10,
      restart_delay: 2000,
    },
  ],
};
