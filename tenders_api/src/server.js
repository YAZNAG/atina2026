// Serveur de l'API, avec la collecte et la tournée de notifications quotidiennes.
import { createApp } from './api.js';
import { loadEnvFile, readConfig } from './config.js';
import { openDb } from './db.js';
import { runCollect, runNotify } from './run.js';

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

/** Lance `job` chaque jour à `hhmm` (heure de Casablanca), jamais deux fois en même temps. */
function daily(hhmm, name, job) {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return;
  let running = false;
  const plan = () => {
    const wait = msUntil(hhmm);
    console.log(`${name} dans ${Math.round(wait / 60000)} min (${hhmm}, heure de Casablanca)`);
    setTimeout(async () => {
      if (!running) {
        running = true;
        try {
          console.log(`${name} terminée`, await job());
        } catch (err) {
          console.error(`${name} impossible :`, err.message);
        } finally {
          running = false;
        }
      }
      plan();
    }, wait);
  };
  plan();
}

if (config.contact) daily(config.collectAt, 'Collecte', () => runCollect({ store, config }));
else console.warn('COLLECT_CONTACT vide : la collecte automatique est désactivée.');

if (config.fcmServiceAccount) daily(config.notifyAt, 'Tournée de notifications', () => runNotify({ store, config }));
else console.warn('FCM_SERVICE_ACCOUNT vide : les notifications ne sont pas envoyées.');
