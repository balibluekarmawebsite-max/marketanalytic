// PM2 process definition for the Market Analytics dashboard (native deploy).
//
// Runs the built Next.js app on 127.0.0.1:3100 — a PRIVATE port (localhost only),
// which Apache reverse-proxies to your subdomain via .htaccess. This mirrors how
// dashboard.* (:3000) and ads.* (:3001) already run, and touches neither of them.
//
// Next.js automatically loads `.env` from this directory at runtime, so the
// database URL and other secrets live in .env (gitignored) — not in this file.
//
// Usage:
//   pm2 start ecosystem.config.js
//   pm2 save
//   pm2 logs market-analytics
module.exports = {
  apps: [
    {
      name: "market-analytics",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      interpreter: "node",
      args: "start -H 127.0.0.1 -p 3100",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
      },
      time: true,
    },
  ],
};
