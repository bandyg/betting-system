// pm2 ecosystem — betting-system (Amelco-style MVP)
// 用法: pm2 start ecosystem.config.js && pm2 save
module.exports = {
  apps: [
    {
      name: 'betting-api',
      cwd: __dirname + '/apps/api',
      script: 'node',
      args: 'dist/index.js',
      interpreter: 'node',
      env: { NODE_ENV: 'production', PORT: 4100 },
      max_restarts: 10,
      restart_delay: 2000,
    },
    {
      name: 'betting-web',
      cwd: __dirname + '/apps/web',
      script: 'pnpm',
      args: 'preview --host 0.0.0.0',
      env: { NODE_ENV: 'production' },
      max_restarts: 10,
      restart_delay: 2000,
    },
  ],
};
