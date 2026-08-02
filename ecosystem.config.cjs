/**
 * PM2 config for Colyseus Cloud.
 * Build output: `server/dist/index.js` (see `npm run build:race-server`).
 */
module.exports = {
  apps: [
    {
      name: 'bugeaters-race-server',
      script: 'server/dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      wait_ready: true,
      listen_timeout: 10000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
