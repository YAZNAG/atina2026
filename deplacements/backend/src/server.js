const config = require('./config');
const app = require('./app');
const prisma = require('./lib/prisma');
const { demarrerPlanificateur } = require('./jobs/planificateur');

const serveur = app.listen(config.port, () => {
  console.log(`API déplacements à l'écoute sur le port ${config.port} (${config.env})`);
  if (config.cronEnabled) demarrerPlanificateur();
});

async function arret() {
  serveur.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', arret);
process.on('SIGINT', arret);
