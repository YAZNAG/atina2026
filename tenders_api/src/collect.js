// Ligne de commande : `npm run collect` (ou `-- --force` pour un essai en journée).
import { ConfigError, loadEnvFile, readConfig } from './config.js';
import { openDb } from './db.js';
import { runCollect } from './run.js';

loadEnvFile();
const config = readConfig();
const force = process.argv.includes('--force');

// Codes de sortie : 0 succès, 1 échec, 2 refusé (hors plage ou déjà en cours),
// 3 partiel, 4 arrêté par le portail (refus, erreurs répétées, robots.txt).
const CODES = { succes: 0, echec: 1, refuse: 2, partiel: 3, arrete: 4 };

try {
  const store = openDb(config.dbPath);
  const r = await runCollect({ store, config, force });
  console.log(JSON.stringify(r, null, 2));
  store.close();
  process.exitCode = CODES[r.status] ?? 1;
} catch (err) {
  console.error(err instanceof ConfigError ? err.message : err);
  process.exitCode = 1;
}
