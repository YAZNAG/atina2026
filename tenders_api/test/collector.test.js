// Collecte complète contre un faux portail en mémoire, construit à partir des vraies
// pages : aucune requête ne part vers le portail réel.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { inWindow, readConfig } from '../src/config.js';
import { openDb } from '../src/db.js';
import { collect } from '../src/pmmp/collector.js';
import { PoliteClient } from '../src/pmmp/http.js';
import { runCollect } from '../src/run.js';

const page = (name) => readFileSync(new URL(`fixtures/${name}.html`, import.meta.url), 'utf8');
const LIST = page('liste');
const DETAIL = page('detail_o8p_1041301');
const FORM = page('formulaire');
const NOW = new Date('2026-10-14T09:00:00+01:00');
const BASE = 'https://portail.test/';

/** Page `p` de la liste : identifiants décalés, dates limites passées après `openPages`. */
function listPage(p, openPages, pageCount = 99) {
  let html = LIST
    .replace(/(_refCons" value=")(\d+)/g, (_, a, n) => `${a}${p}0${n}`)
    .replace(/value="1" id="ctl0_CONTENU_PAGE_resultSearch_numPageTop"/, `value="${p}" id="ctl0_CONTENU_PAGE_resultSearch_numPageTop"`)
    .replace(/(nombrePageTop">)\d+/, `$1${pageCount}`)
    .replace(/(name="PRADO_PAGESTATE" id="PRADO_PAGESTATE" value=")/, `$1P${p}`);
  if (p > openPages) html = html.replace(/(cloture-line">\s*)\d{2}\/\d{2}\/\d{4}/g, '$101/01/2020');
  return html;
}

/**
 * Faux portail. `routes` peut remplacer une réponse : (req) => Response | undefined.
 * Toutes les requêtes reçues sont enregistrées avec leur heure.
 */
function fakePortal({ openPages = 2, pageCount = 99, showForm = false, robots = null, override } = {}) {
  const requests = [];
  let current = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  const fetchImpl = async (url, init = {}) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      const u = new URL(url);
      const body = init.body ? new URLSearchParams(init.body) : null;
      const req = { method: init.method ?? 'GET', path: u.pathname + u.search, target: body?.get('PRADO_POSTBACK_TARGET') ?? null, body, headers: init.headers, at: Date.now() };
      requests.push(req);
      const custom = override?.(req, requests);
      if (custom) return custom;
      if (u.pathname === '/robots.txt') {
        return robots === null ? new Response('', { status: 404 }) : new Response(robots);
      }
      if (u.search.includes('EntrepriseDetailConsultation')) {
        return new Response(DETAIL, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      }
      if (u.search.includes('EntrepriseAdvancedSearch')) {
        if (req.method === 'GET') {
          current = 1;
          return new Response(showForm ? FORM : listPage(1, openPages, pageCount), { headers: { 'set-cookie': 'PHPSESSID=abc; path=/' } });
        }
        if (req.target === 'ctl0$CONTENU_PAGE$AdvancedSearch$lancerRecherche') current = 1;
        if (req.target === 'ctl0$CONTENU_PAGE$resultSearch$PagerTop$ctl2') current += 1;
        return new Response(listPage(current, openPages, pageCount));
      }
      return new Response('introuvable', { status: 404 });
    } finally {
      inFlight -= 1;
    }
  };
  return { fetchImpl, requests, maxInFlight: () => maxInFlight };
}

function setup(portal, overrides = {}) {
  const store = openDb(':memory:');
  const client = new PoliteClient({
    baseUrl: BASE,
    userAgent: 'MounaqasaBot/1.0 (+test@example.ma)',
    delayMs: 15,
    timeoutMs: 2000,
    maxConsecutiveErrors: 3,
    fetchImpl: portal.fetchImpl,
  });
  const config = { searchPath: 'index.php?page=entreprise.EntrepriseAdvancedSearch&AllCons', pageSize: 100, maxPages: 50, detailsPerRun: 400, ...overrides };
  return { store, client, config, now: () => NOW };
}

test('parcourt les pages jusqu\'aux avis clôturés puis lit les fiches', async () => {
  const portal = fakePortal({ openPages: 2 });
  const s = setup(portal);
  const r = await collect(s);

  assert.equal(r.status, 'succes', r.reason);
  assert.equal(r.pages, 3, 'deux pages ouvertes, la troisième arrête la collecte');
  assert.equal(r.newCount, 30);
  assert.equal(r.detailsFetched, 20, 'seuls les avis ouverts ont leur fiche lue');

  const posts = portal.requests.filter((q) => q.method === 'POST');
  assert.equal(posts[0].target, 'ctl0$CONTENU_PAGE$resultSearch$listePageSizeTop');
  assert.equal(posts[0].body.get('ctl0$CONTENU_PAGE$resultSearch$listePageSizeTop'), '100');
  assert.ok(posts[0].body.get('PRADO_PAGESTATE').length > 1000, 'état PRADO renvoyé');
  assert.equal(posts[1].target, 'ctl0$CONTENU_PAGE$resultSearch$PagerTop$ctl2');
  assert.ok(posts[2].body.get('PRADO_PAGESTATE').startsWith('P2'), 'état de la page précédente');

  const counts = s.store.counts(NOW.getTime());
  assert.equal(counts.open, 20);
  assert.equal(counts.openWithDetail, 20);
  const t = s.store.query({ nowMs: NOW.getTime(), limit: 1, sort: 'amount' }).items[0];
  assert.equal(t.estimate, 21446884.14);
  assert.equal(t.deposit, 428000);
  assert.match(t.portalUrl, /^https:\/\/portail\.test\/index\.php\?page=entreprise\.EntrepriseDetailConsultation&refConsultation=\d+&orgAcronyme=\w+$/);
});

test('politesse : une requête à la fois, pause, identité et cookie de session', async () => {
  const portal = fakePortal({ openPages: 1 });
  await collect(setup(portal));
  assert.equal(portal.maxInFlight(), 1);
  for (let i = 1; i < portal.requests.length; i++) {
    assert.ok(portal.requests[i].at - portal.requests[i - 1].at >= 14, `pause avant la requête ${i}`);
  }
  for (const q of portal.requests) assert.equal(q.headers['User-Agent'], 'MounaqasaBot/1.0 (+test@example.ma)');
  assert.equal(portal.requests[0].path, '/robots.txt');
  assert.match(portal.requests.at(-1).headers.Cookie, /PHPSESSID=abc/);
});

test('second passage : rien de nouveau, aucune fiche relue', async () => {
  const portal = fakePortal({ openPages: 1 });
  const s = setup(portal);
  await collect(s);
  const before = portal.requests.length;
  s.client.requestCount = 0;
  const r = await collect(s);
  assert.equal(r.status, 'succes');
  assert.equal(r.newCount, 0);
  assert.equal(r.detailsFetched, 0);
  assert.equal(portal.requests.length - before, 4, 'robots, liste, taille de page, page 2');
});

test('formulaire affiché : la recherche est lancée avec les critères par défaut', async () => {
  const portal = fakePortal({ openPages: 1, showForm: true });
  const r = await collect(setup(portal));
  assert.equal(r.status, 'succes', r.reason);
  const first = portal.requests.find((q) => q.method === 'POST');
  assert.equal(first.target, 'ctl0$CONTENU_PAGE$AdvancedSearch$lancerRecherche');
  assert.equal(first.body.get('ctl0$CONTENU_PAGE$AdvancedSearch$lancerRecherche'), 'Lancer la recherche');
});

test('refus du portail (403) : arrêt immédiat, sans nouvelle tentative', async () => {
  const portal = fakePortal({
    override: (req) => (req.target === 'ctl0$CONTENU_PAGE$resultSearch$PagerTop$ctl2' ? new Response('non', { status: 403 }) : undefined),
  });
  const s = setup(portal);
  const r = await collect(s);
  assert.equal(r.status, 'arrete');
  assert.match(r.reason, /refus du portail/);
  assert.equal(portal.requests.at(-1).target, 'ctl0$CONTENU_PAGE$resultSearch$PagerTop$ctl2');
  assert.equal(s.store.lastRun().status, 'arrete');
});

test('erreurs serveur répétées sur les fiches : arrêt après trois', async () => {
  const portal = fakePortal({
    openPages: 1,
    override: (req) => (req.path.includes('EntrepriseDetailConsultation') ? new Response('panne', { status: 503 }) : undefined),
  });
  const r = await collect(setup(portal));
  assert.equal(r.status, 'arrete');
  assert.match(r.reason, /3 erreurs d'affilée/);
  assert.equal(portal.requests.filter((q) => q.path.includes('EntrepriseDetailConsultation')).length, 3);
});

test('robots.txt interdit : aucune page de liste demandée', async () => {
  const portal = fakePortal({ robots: 'User-agent: *\nDisallow: /index.php' });
  const r = await collect(setup(portal));
  assert.equal(r.status, 'arrete');
  assert.match(r.reason, /robots\.txt/);
  assert.equal(portal.requests.length, 1);
});

test('limite de pages : collecte partielle', async () => {
  const portal = fakePortal({ openPages: 10 });
  const r = await collect(setup(portal, { maxPages: 2, detailsPerRun: 0 }));
  assert.equal(r.status, 'partiel');
  assert.equal(r.pages, 2);
});

test('structure inconnue : échec explicite', async () => {
  const portal = fakePortal({
    override: (req) => (req.path.includes('AdvancedSearch') ? new Response('<html><body>Maintenance</body></html>') : undefined),
  });
  const r = await collect(setup(portal));
  assert.equal(r.status, 'echec');
  assert.match(r.reason, /structure du portail/);
});

test('une seule collecte à la fois', async () => {
  const s = setup(fakePortal());
  s.store.startRun(new Date(NOW.getTime() - 60_000).toISOString());
  const r = await collect(s);
  assert.equal(r.status, 'refuse');
});

test('plage horaire et contact obligatoires', async () => {
  const config = readConfig({ COLLECT_WINDOW: '00:00-00:01', COLLECT_CONTACT: 'veille@example.ma' });
  const store = openDb(':memory:');
  const portal = fakePortal({ openPages: 1 });
  const refused = await runCollect({ store, config: { ...config, baseUrl: BASE }, fetchImpl: portal.fetchImpl, log: () => {}, now: () => NOW });
  assert.equal(refused.status, 'refuse');
  assert.equal(portal.requests.length, 0);

  // Hors plage avec --force : essai réduit à une page et dix fiches.
  const forced = await runCollect({ store, config: { ...config, baseUrl: BASE, delayMs: 15 }, force: true, fetchImpl: portal.fetchImpl, log: () => {}, now: () => NOW });
  assert.equal(forced.status, 'partiel');
  assert.equal(forced.pages, 1);
  assert.ok(forced.detailsFetched <= 10);

  await assert.rejects(runCollect({ store, config: readConfig({}), log: () => {} }), /COLLECT_CONTACT/);
});

test('configuration : délai plancher de 2 s', () => {
  assert.equal(readConfig({ PMMP_DELAY_MS: '100' }).delayMs, 2000);
  assert.equal(readConfig({}).delayMs, 3000);
  assert.equal(readConfig({ PMMP_PAGE_SIZE: '37' }).pageSize, 100);
  assert.match(readConfig({ COLLECT_CONTACT: 'a@b.ma' }).userAgent, /\+a@b\.ma/);
});

test('plage horaire qui passe minuit', () => {
  const at = (h) => new Date(`2026-10-14T${h}:00+01:00`);
  assert.equal(inWindow('23:00-06:00', at('23:30')), true);
  assert.equal(inWindow('23:00-06:00', at('05:59')), true);
  assert.equal(inWindow('23:00-06:00', at('12:00')), false);
  assert.equal(inWindow('', at('12:00')), true);
});

test('fichier .env : commentaires de fin de ligne et guillemets', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { loadEnvFile } = await import('../src/config.js');
  const dir = mkdtempSync(join(tmpdir(), 'env-'));
  const file = join(dir, '.env');
  writeFileSync(file, 'TEST_ENV_A=3000        # pause\nTEST_ENV_B="a # b"\n# TEST_ENV_C=1\n');
  loadEnvFile(file);
  assert.equal(process.env.TEST_ENV_A, '3000');
  assert.equal(process.env.TEST_ENV_B, 'a # b');
  assert.equal(process.env.TEST_ENV_C, undefined);
});
