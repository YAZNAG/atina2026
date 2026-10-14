import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';

import { createApp } from '../src/api.js';
import { readConfig } from '../src/config.js';
import { openDb } from '../src/db.js';
import { parseDetail, parseList } from '../src/pmmp/parse.js';

const page = (name) => readFileSync(new URL(`fixtures/${name}.html`, import.meta.url), 'utf8');
const NOW = '2026-10-14T09:00:00.000Z';

let server;
let base;
let store;

before(async () => {
  store = openDb(':memory:');
  for (const row of parseList(page('liste')).rows) {
    store.upsertListRow(row, `https://portail.test/${row.refConsultation}`, NOW);
  }
  const dakhla = store.needingDetail(100, Date.parse(NOW)).find((t) => t.id === 'q9t:1038578');
  store.saveDetail(dakhla.id, dakhla.list_hash, parseDetail(page('detail_q9t_1038578')), NOW);
  const app = createApp({ store, config: readConfig({}), now: () => Date.parse(NOW) });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  store.close();
});

const get = async (path) => {
  const res = await fetch(base + path);
  return { status: res.status, body: await res.json(), headers: res.headers };
};

test('liste des avis ouverts, du plus récent au plus ancien', async () => {
  const { status, body } = await get('/api/tenders');
  assert.equal(status, 200);
  assert.equal(body.total, 10);
  const published = body.items.map((t) => Date.parse(t.publishedAt));
  assert.deepEqual([...published].sort((a, b) => b - a), published);
  const t = body.items[0];
  for (const k of ['id', 'reference', 'title', 'buyer', 'category', 'deadline', 'city', 'region', 'portalUrl']) {
    assert.ok(t[k] !== undefined, k);
  }
});

test('recherche sans accents et filtres', async () => {
  const q = await get('/api/tenders?q=medico%20technique%20dakhla');
  assert.deepEqual(q.body.items.map((t) => t.reference), ['59/2026/2']);
  const cat = await get('/api/tenders?category=services');
  assert.ok(cat.body.items.length > 0 && cat.body.items.every((t) => t.category === 'services'));
  const reg = await get(`/api/tenders?region=${encodeURIComponent('Rabat-Salé-Kénitra')}`);
  assert.ok(reg.body.items.every((t) => t.region === 'Rabat-Salé-Kénitra'));
});

test('tri par date limite et pagination', async () => {
  const a = await get('/api/tenders?sort=deadline&limit=3');
  const b = await get('/api/tenders?sort=deadline&limit=3&offset=3');
  assert.equal(a.body.items.length, 3);
  assert.equal(a.body.total, 10);
  assert.ok(Date.parse(a.body.items[2].deadline) <= Date.parse(b.body.items[0].deadline));
});

test('fiche avec les champs complémentaires', async () => {
  const id = encodeURIComponent('q9t:1038578');
  const { status, body } = await get(`/api/tenders/${id}`);
  assert.equal(status, 200);
  assert.equal(body.lotsCount, 3);
  assert.equal(body.dceSizeKb, 3052);
  assert.equal(body.detailsAvailable, true);
  assert.equal((await get('/api/tenders/inconnu')).status, 404);
});

test('paramètres invalides refusés', async () => {
  assert.equal((await get('/api/tenders?limit=0')).status, 400);
  assert.equal((await get('/api/tenders?category=autre')).status, 400);
  assert.equal((await get('/api/tenders?sort=x')).status, 400);
});

test('état de la collecte et en-têtes', async () => {
  const { body, headers } = await get('/api/meta');
  assert.equal(body.counts.total, 10);
  assert.equal(body.regions.length, 12);
  assert.equal(body.lastRun, null);
  assert.equal(headers.get('access-control-allow-origin'), '*');
});
