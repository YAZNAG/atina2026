// Bons de commande. Les pages de test sont SYNTHÉTIQUES (la vraie mise en page du
// module n'a pas pu être relevée) : ces tests vérifient la logique et la tolérance de
// la lecture à deux mises en page différentes, pas la conformité au vrai portail.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { openDb } from '../src/db.js';
import { extractLabeled, parseBdcDetail, parseBdcList } from '../src/pmmp/bdc.js';
import { collectPurchaseOrders } from '../src/pmmp/collector.js';
import { PoliteClient } from '../src/pmmp/http.js';
import { matchesPrefs, parseDevice } from '../src/push/prefs.js';

const page = (name) => readFileSync(new URL(`fixtures/${name}.html`, import.meta.url), 'utf8');
const NOW = new Date('2026-10-14T09:00:00+01:00');

test('intitulés : sur la même ligne ou la suivante, le plus long d\'abord', () => {
  const f = extractLabeled('Date limite de remise des devis\n31/12/2026 12:00\nObjet : Achat\nLieu d’exécution : TAZA\nRéférence');
  assert.equal(f.deadline, '31/12/2026 12:00');
  assert.equal(f.title, 'Achat');
  assert.equal(f.place, 'TAZA');
  assert.equal(f.reference, undefined, 'intitulé sans valeur');
});

test('liste en cartes : champs, lieu rattaché à sa région, annulation', () => {
  const l = parseBdcList(page('bdc_liste_cartes'));
  assert.equal(l.total, 25);
  assert.equal(l.rows.length, 3, 'un avis par lien, même répété');
  const [a, b, c] = l.rows;
  assert.equal(a.refConsultation, '58231');
  assert.equal(a.orgAcronyme, 'bdc');
  assert.equal(a.kind, 'bdc');
  assert.equal(a.reference, 'BC-12/2026/CZ');
  assert.match(a.title, /^Fourniture de carburant/);
  assert.equal(a.buyer, "Direction provinciale de l'équipement de Zagora");
  assert.equal(a.deadline, '2026-12-31T12:00:00+01:00');
  assert.equal(a.city, 'Zagora');
  assert.equal(a.region, 'Drâa-Tafilalet');
  assert.equal(a.cancelled, false);
  assert.equal(b.cancelled, true);
  assert.equal(c.title, 'Construction d’un abri pour la station de taxis');
  assert.equal(c.region, 'Fès-Meknès');
});

test('liste en tableau : même résultat, liens absolus, total avec espaces', () => {
  const l = parseBdcList(page('bdc_liste_tableau'));
  assert.equal(l.total, 1517);
  assert.deepEqual(l.rows.map((r) => r.refConsultation), ['60001', '60002']);
  assert.equal(l.rows[0].title, 'Achat de fournitures de bureau');
  assert.equal(l.rows[0].deadline, '2026-11-05T09:30:00+01:00');
  assert.equal(l.rows[0].city, 'Agadir Ida-Outanane');
  assert.equal(l.rows[1].region, 'Souss-Massa');
});

test('fiche : catégorie, publication, montant estimatif', () => {
  const d = parseBdcDetail(page('bdc_fiche'));
  assert.equal(d.reference, 'BC-12/2026/CZ');
  assert.equal(d.category, 'fournitures');
  assert.equal(d.estimate, 180000);
  assert.equal(d.deadline, '2026-12-31T12:00:00+01:00');
  assert.equal(d.procedure, 'Bon de commande');
});

test('page sans avis reconnaissable : aucune ligne inventée', () => {
  assert.deepEqual(parseBdcList('<html><body><p>Maintenance</p></body></html>').rows, []);
});

/** Faux module /bdc/ : 2 pages de cartes, puis une page vide. */
function fakeBdc({ pages = 2, empty = false } = {}) {
  const requests = [];
  const fetchImpl = async (url) => {
    const u = new URL(url);
    requests.push(u.pathname + u.search);
    if (u.pathname.includes('/show/')) return new Response(page('bdc_fiche'));
    const n = Number(u.searchParams.get('page') ?? 1);
    if (empty || n > pages) return new Response('<html><body><p>Aucun résultat</p></body></html>');
    return new Response(page('bdc_liste_cartes').replace(/show\/(\d+)/g, (_, id) => `show/${n}${id}`));
  };
  const client = new PoliteClient({ baseUrl: 'https://portail.test/', userAgent: 'test', delayMs: 1, timeoutMs: 2000, maxConsecutiveErrors: 3, fetchImpl });
  return { client, requests };
}

const CONFIG = { bdcListPath: 'bdc/entreprise/consultation/', bdcMaxPages: 50, bdcDetailsPerRun: 100 };

test('collecte : pages jusqu\'à la page vide, puis fiches des avis ouverts', async () => {
  const store = openDb(':memory:');
  const { client, requests } = fakeBdc({ pages: 2 });
  const r = await collectPurchaseOrders({ store, client, config: CONFIG, now: () => NOW });
  assert.equal(r.pages, 2);
  assert.equal(r.newCount, 6);
  assert.equal(r.detailsFetched, 4, 'les avis annulés ne sont pas lus');
  assert.deepEqual(requests.slice(0, 3), [
    '/bdc/entreprise/consultation/',
    '/bdc/entreprise/consultation/?page=2',
    '/bdc/entreprise/consultation/?page=3',
  ]);
  const open = store.query({ kind: 'bdc', nowMs: NOW.getTime(), limit: 100 });
  assert.equal(open.total, 4, 'annulés exclus');
  assert.ok(open.items.every((t) => t.kind === 'bdc' && t.procedure === 'Bon de commande'));
  assert.match(open.items[0].portalUrl, /^https:\/\/portail\.test\/bdc\/entreprise\/consultation\/show\/\d+$/);
  assert.equal(store.query({ kind: 'ao', nowMs: NOW.getTime() }).total, 0);
  const t = store.byId('bdc:158231');
  assert.equal(t.estimate, 180000);
  assert.equal(t.category, 'fournitures');
  assert.equal(store.counts(NOW.getTime()).openPurchaseOrders, 4);
});

test('collecte : total atteint, pas de page en trop', async () => {
  const store = openDb(':memory:');
  const { client, requests } = fakeBdc({ pages: 10 });
  // La page annonce 25 résultats, 3 par page : 9 pages au plus.
  const r = await collectPurchaseOrders({ store, client, config: { ...CONFIG, bdcDetailsPerRun: 0 }, now: () => NOW });
  assert.equal(r.pages, 9);
  assert.equal(requests.length, 9);
});

test('collecte : module illisible, erreur explicite ; limite de pages', async () => {
  const store = openDb(':memory:');
  await assert.rejects(
    collectPurchaseOrders({ store, client: fakeBdc({ empty: true }).client, config: CONFIG, now: () => NOW }),
    /structure du module/,
  );
  const r = await collectPurchaseOrders({ store, client: fakeBdc({ pages: 10 }).client, config: { ...CONFIG, bdcMaxPages: 2, bdcDetailsPerRun: 0 }, now: () => NOW });
  assert.match(r.partial, /limite de 2 pages/);
});

test('alertes : choix des types d\'avis', () => {
  const bdc = { kind: 'bdc', category: null, region: 'Drâa-Tafilalet', title: 'carburant' };
  const ao = { kind: 'ao', category: 'travaux', region: 'Drâa-Tafilalet', title: 'route' };
  const all = parseDevice({ token: 'x'.repeat(30), platform: 'android' }).prefs;
  assert.deepEqual(all.kinds, ['ao', 'bdc']);
  assert.equal(matchesPrefs(bdc, all), true, 'catégorie inconnue : signalé quand même');
  const onlyAo = parseDevice({ token: 'x'.repeat(30), platform: 'android', prefs: { kinds: ['ao'] } }).prefs;
  assert.equal(matchesPrefs(bdc, onlyAo), false);
  assert.equal(matchesPrefs(ao, onlyAo), true);
});

test('ancienne base : colonnes ajoutées sans perte', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { mkdtempSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const path = join(mkdtempSync(join(tmpdir(), 'db-')), 'old.db');
  const old = new DatabaseSync(path);
  old.exec(`CREATE TABLE tenders (id TEXT PRIMARY KEY, ref_consultation TEXT NOT NULL, org_acronyme TEXT NOT NULL,
    reference TEXT, title TEXT, buyer TEXT, procedure TEXT, category TEXT, published_at TEXT, published_ts INTEGER,
    deadline TEXT, deadline_ts INTEGER, place TEXT, city TEXT, region TEXT, estimate REAL, deposit REAL, site_visit TEXT,
    lots_count INTEGER, qualifications TEXT, dce_size_kb INTEGER, portal_url TEXT NOT NULL, search_text TEXT,
    list_hash TEXT, detail_for_hash TEXT, detail_errors INTEGER NOT NULL DEFAULT 0, first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    INSERT INTO tenders (id, ref_consultation, org_acronyme, deadline_ts, portal_url, first_seen_at, last_seen_at, updated_at)
    VALUES ('o8p:1', '1', 'o8p', 9999999999999, 'u', 'n', 'n', 'n');`);
  old.close();
  const store = openDb(path);
  const t = store.byId('o8p:1');
  assert.equal(t.kind, 'ao');
  assert.equal(t.cancelled, false);
  store.close();
});
