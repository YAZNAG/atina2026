// pm2 : serveur SAFA9AT (API, collecte quotidienne, notifications, résumés IA).
// Lancé par install.sh : pm2 startOrReload deploy/safa9at/ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'safa9at-api',
      cwd: '/opt/safa9at/tenders_api',
      script: 'src/server.js',
      node_args: '--disable-warning=ExperimentalWarning',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '400M',
      time: true,
    },
  ],
};
