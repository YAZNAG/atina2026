// Ligne de commande : `npm run notify` envoie les notifications du jour maintenant.
import { loadEnvFile, readConfig } from './config.js';
import { openDb } from './db.js';
import { PushConfigError } from './push/fcm.js';
import { runNotify } from './run.js';

loadEnvFile();
const config = readConfig();

try {
  const store = openDb(config.dbPath);
  const r = await runNotify({ store, config });
  console.log(JSON.stringify(r, null, 2));
  store.close();
  process.exitCode = r.status === 'succes' ? 0 : 2;
} catch (err) {
  console.error(err instanceof PushConfigError ? err.message : err);
  process.exitCode = 1;
}
