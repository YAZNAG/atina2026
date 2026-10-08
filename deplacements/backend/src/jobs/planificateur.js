const cron = require('node-cron');
const { TACHES } = require('./taches');

const executer = (nom) => async () => {
  try {
    const r = await TACHES[nom]();
    console.log(`[tâche] ${nom}`, JSON.stringify(r));
  } catch (e) {
    console.error(`[tâche] ${nom} en échec :`, e.message);
  }
};

function demarrerPlanificateur() {
  const tz = { timezone: 'Africa/Casablanca' };
  cron.schedule('*/15 * * * *', executer('demarrer-missions'), tz);
  cron.schedule('0 8 * * 1-5', executer('quotidien'), tz);
  cron.schedule('30 2 * * *', executer('sauvegarde'), tz);
  console.log('Tâches planifiées actives (missions /15 min, rappels 8h ouvrés, sauvegarde 2h30)');
}

module.exports = { demarrerPlanificateur };
