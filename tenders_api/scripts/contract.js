// Produit la réponse de `GET /api/tenders` à partir des pages réelles de test/fixtures :
// l'app la relit dans ses tests (mobile/tenders_app/test/fixtures/api_tenders.json),
// ce qui garantit que serveur et app parlent le même format.
//
//   node scripts/contract.js > ../mobile/tenders_app/test/fixtures/api_tenders.json
import { readFileSync } from 'node:fs';

import { createApp } from '../src/api.js';
import { readConfig } from '../src/config.js';
import { openDb } from '../src/db.js';
import { detailPath } from '../src/pmmp/collector.js';
import { parseDetail, parseList } from '../src/pmmp/parse.js';

const page = (name) => readFileSync(new URL(`../test/fixtures/${name}.html`, import.meta.url), 'utf8');
const NOW = '2026-10-14T09:00:00.000Z';
const base = 'https://www.marchespublics.gov.ma/';

const store = openDb(':memory:');
for (const row of parseList(page('liste')).rows) {
  store.upsertListRow(row, new URL(detailPath(row.orgAcronyme, row.refConsultation), base).toString(), NOW);
}
const todo = store.needingDetail(100, Date.parse(NOW));
for (const name of ['detail_o8p_1041301', 'detail_g3h_1034700', 'detail_q9t_1038578']) {
  const id = name.replace(/^detail_(\w+?)_(\d+)$/, '$1:$2');
  const t = todo.find((x) => x.id === id);
  store.saveDetail(t.id, t.list_hash, parseDetail(page(name)), NOW);
}

const app = createApp({ store, config: readConfig({}), now: () => Date.parse(NOW) });
const server = app.listen(0, '127.0.0.1', async () => {
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/tenders?limit=500`);
  process.stdout.write(`${JSON.stringify(await res.json(), null, 2)}\n`);
  server.close();
  store.close();
});
