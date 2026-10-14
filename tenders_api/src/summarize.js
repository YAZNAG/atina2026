// Ligne de commande : `npm run summarize` résume maintenant les avis qui n'en ont pas.
import { loadEnvFile, readConfig } from './config.js';
import { openDb } from './db.js';
import { createSummaryService, runSummaries } from './run.js';

loadEnvFile();
const config = readConfig();

try {
  const store = openDb(config.dbPath);
  const summaries = createSummaryService({ store, config });
  const r = await runSummaries({ summaries, config });
  console.log(JSON.stringify(r, null, 2));
  store.close();
  process.exitCode = r.status === 'succes' ? 0 : 2;
} catch (err) {
  console.error(err);
  process.exitCode = 1;
}
