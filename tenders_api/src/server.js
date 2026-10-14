// Serveur de l'API, avec une collecte quotidienne optionnelle (COLLECT_AT).
import { createApp } from './api.js';
import { loadEnvFile, readConfig } from './config.js';
import { openDb } from './db.js';
import { runCollect } from './run.js';

loadEnvFile();
const config = readConfig();
const store = openDb(config.dbPath);
const app = createApp({ store, config });

app.listen(config.port, () => {
  console.log(`API des appels d'offres sur le port ${config.port}`);
});

/** Millisecondes jusqu'au prochain « HH:MM » à Casablanca. */
function msUntil(hhmm, from = new Date()) {
  const [h, m] = hhmm.split(':').map(Number);
  const local = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Casablanca',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(from);
  const [lh, lm, ls] = local.split(':').map(Number);
  let delta = (h * 3600 + m * 60) - (lh * 3600 + lm * 60 + ls);
  if (delta <= 0) delta += 24 * 3600;
  return delta * 1000;
}

let collecting = false;

function schedule() {
  if (!/^\d{2}:\d{2}$/.test(config.collectAt)) return;
  const wait = msUntil(config.collectAt);
  console.log(`Prochaine collecte dans ${Math.round(wait / 60000)} min (${config.collectAt}, heure de Casablanca)`);
  setTimeout(async () => {
    if (!collecting) {
      collecting = true;
      try {
        const r = await runCollect({ store, config });
        console.log('Collecte terminée', r);
      } catch (err) {
        console.error('Collecte impossible :', err.message);
      } finally {
        collecting = false;
      }
    }
    schedule();
  }, wait).unref?.();
}

if (config.contact) schedule();
else console.warn('COLLECT_CONTACT vide : la collecte automatique est désactivée.');
