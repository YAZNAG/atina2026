import assert from 'node:assert/strict';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { after, before, test } from 'node:test';

import { createApp } from '../src/api.js';
import { readConfig } from '../src/config.js';
import { openDb } from '../src/db.js';
import { FcmSender, PushConfigError, UNREGISTERED, signJwt } from '../src/push/fcm.js';
import { daysUntil, newTendersMessage, notify } from '../src/push/notify.js';
import { InvalidDevice, matchesPrefs, parseDevice } from '../src/push/prefs.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const ACCOUNT = {
  project_id: 'safa9at-test',
  client_email: 'push@safa9at-test.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  private_key_id: 'cle1',
  token_uri: 'https://oauth2.test/token',
};
const TOKEN = 'fcm-token-telephone-1-abcdefghijklmnop';
const TOKEN2 = 'fcm-token-telephone-2-abcdefghijklmnop';

const at = (s) => new Date(`2026-10-${s}+01:00`);

/** Avis au format de la liste du portail. */
function row(n, extra = {}) {
  return {
    refConsultation: String(1000 + n),
    orgAcronyme: 'x1y',
    reference: `${n}/2026`,
    title: `Travaux de voirie lot ${n}`,
    buyer: 'Commune urbaine',
    procedure: "Appel d'offres ouvert",
    category: 'travaux',
    publishedAt: '2026-10-13T00:00:00+01:00',
    deadline: '2026-11-20T10:00:00+01:00',
    place: 'AGADIR',
    city: 'Agadir',
    region: 'Souss-Massa',
    lotsCount: null,
    ...extra,
  };
}

/** Faux FCM : enregistre les messages ; `reply` peut imposer une réponse. */
function fakeSender(reply = () => 'ok') {
  const sent = [];
  return {
    sent,
    async send(token, message) {
      const r = reply(token, message, sent);
      if (r instanceof Error) throw r;
      sent.push({ token, ...message });
      return r;
    },
  };
}

const PREFS = { newTenders: true, deadlineReminders: true, reminderDays: 3, categories: ['travaux'], regions: [], keywords: [] };

function setup() {
  const store = openDb(':memory:');
  store.upsertDevice({ token: TOKEN, platform: 'android', lang: 'fr', prefs: PREFS, saved: [] }, at('14T08:00:00').toISOString());
  return store;
}

test('inscription : validation et valeurs par défaut', () => {
  const d = parseDevice({ token: TOKEN, platform: 'ios', lang: 'ar', prefs: { keywords: [' voirie ', 'voirie'], regions: ['Souss-Massa', 'Atlantide'], categories: ['travaux', 'autre'] }, saved: ['x:1', 'x:1'] });
  assert.equal(d.lang, 'ar');
  assert.deepEqual(d.prefs.keywords, ['voirie']);
  assert.deepEqual(d.prefs.regions, ['Souss-Massa']);
  assert.deepEqual(d.prefs.categories, ['travaux']);
  assert.equal(d.prefs.reminderDays, 3);
  assert.deepEqual(d.saved, ['x:1']);
  assert.deepEqual(parseDevice({ token: TOKEN, platform: 'android' }).prefs.categories, ['travaux', 'services', 'fournitures']);
  assert.throws(() => parseDevice({ token: 'court', platform: 'android' }), InvalidDevice);
  assert.throws(() => parseDevice({ token: TOKEN, platform: 'symbian' }), InvalidDevice);
  assert.throws(() => parseDevice({ token: TOKEN, platform: 'ios', prefs: { keywords: Array(31).fill('a') } }), InvalidDevice);
});

test('correspondance : mêmes règles que l\'app', () => {
  const t = { category: 'travaux', region: 'Souss-Massa', title: 'Aménagement de la voirie', reference: '1', buyer: 'Commune', city: 'Agadir', procedure: '', qualifications: ['Équipement routier'] };
  const p = { categories: ['travaux'], regions: [], keywords: [] };
  assert.equal(matchesPrefs(t, p), true);
  assert.equal(matchesPrefs(t, { ...p, categories: ['services'] }), false);
  assert.equal(matchesPrefs(t, { ...p, regions: ['Oriental'] }), false);
  assert.equal(matchesPrefs(t, { ...p, keywords: ['VOIRIE'] }), true);
  assert.equal(matchesPrefs(t, { ...p, keywords: ['equipement'] }), true, 'accents ignorés, qualifications lues');
  assert.equal(matchesPrefs(t, { ...p, keywords: ['informatique'] }), false);
});

test('JWT signé par la clé du compte de service', () => {
  const jwt = signJwt(ACCOUNT, 1_800_000_000);
  const [h, c, s] = jwt.split('.');
  assert.ok(createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(s, 'base64url')));
  const claims = JSON.parse(Buffer.from(c, 'base64url'));
  assert.equal(claims.iss, ACCOUNT.client_email);
  assert.equal(claims.aud, ACCOUNT.token_uri);
  assert.equal(claims.scope, 'https://www.googleapis.com/auth/firebase.messaging');
  assert.equal(claims.exp - claims.iat, 3600);
  assert.equal(JSON.parse(Buffer.from(h, 'base64url')).kid, 'cle1');
});

test('FCM : un seul jeton OAuth pour plusieurs envois, message au format v1', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url === ACCOUNT.token_uri) return Response.json({ access_token: 'ya29.test', expires_in: 3600 });
    return Response.json({ name: 'projects/x/messages/1' });
  };
  const sender = new FcmSender({ account: ACCOUNT, fetchImpl });
  assert.equal(await sender.send(TOKEN, { title: 'T', body: 'B', data: { tenderId: 'x:1' } }), 'ok');
  assert.equal(await sender.send(TOKEN2, { title: 'T2', body: 'B2' }), 'ok');
  assert.equal(calls.filter((c) => c.url === ACCOUNT.token_uri).length, 1);
  const msg = calls.at(-1);
  assert.equal(msg.url, 'https://fcm.googleapis.com/v1/projects/safa9at-test/messages:send');
  assert.equal(msg.init.headers.Authorization, 'Bearer ya29.test');
  const body = JSON.parse(msg.init.body).message;
  assert.equal(body.token, TOKEN2);
  assert.deepEqual(body.notification, { title: 'T2', body: 'B2' });
  assert.equal(new URLSearchParams(calls[0].init.body).get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
});

test('FCM : jeton périmé, accès refusé, panne', async () => {
  const make = (status, error) => new FcmSender({
    account: ACCOUNT,
    fetchImpl: async (url) => (url === ACCOUNT.token_uri
      ? Response.json({ access_token: 'a', expires_in: 3600 })
      : Response.json({ error }, { status })),
  });
  assert.equal(await make(404, { message: 'Requested entity was not found.', details: [{ errorCode: 'UNREGISTERED' }] }).send(TOKEN, { title: '', body: '' }), UNREGISTERED);
  assert.equal(await make(400, { message: 'The registration token is not a valid FCM registration token' }).send(TOKEN, { title: '', body: '' }), UNREGISTERED);
  await assert.rejects(make(403, { message: 'Permission denied' }).send(TOKEN, { title: '', body: '' }), PushConfigError);
  await assert.rejects(make(503, { message: 'Unavailable' }).send(TOKEN, { title: '', body: '' }), (e) => !(e instanceof PushConfigError));
  const refused = new FcmSender({ account: ACCOUNT, fetchImpl: async () => Response.json({ error: 'invalid_grant' }, { status: 400 }) });
  await assert.rejects(refused.send(TOKEN, { title: '', body: '' }), PushConfigError);
});

test('nouveaux avis : une notification groupée, jamais répétée', async () => {
  const store = setup();
  for (const n of [1, 2, 3]) store.upsertListRow(row(n), `https://p/${n}`, at('14T09:00:00').toISOString());
  store.upsertListRow(row(4, { category: 'services' }), 'https://p/4', at('14T09:00:00').toISOString());

  const sender = fakeSender();
  const stats = await notify({ store, sender, now: () => at('15T08:30:00') });
  assert.equal(stats.sent, 1);
  assert.equal(stats.newTenders, 3);
  assert.equal(sender.sent[0].title, "3 nouveaux appels d'offres");
  assert.match(sender.sent[0].body, /Travaux de voirie lot \d · Travaux de voirie lot \d et 1 autre$/);
  assert.equal(sender.sent[0].data.type, 'list');

  const again = await notify({ store, sender, now: () => at('16T08:30:00') });
  assert.equal(again.sent, 0);
});

test('un seul nouvel avis : lien direct vers sa fiche, en arabe si demandé', async () => {
  const store = setup();
  store.upsertDevice({ token: TOKEN, platform: 'android', lang: 'ar', prefs: PREFS, saved: [] }, at('14T08:00:00').toISOString());
  store.upsertListRow(row(1), 'https://p/1', at('14T09:00:00').toISOString());
  const sender = fakeSender();
  await notify({ store, sender, now: () => at('15T08:30:00') });
  assert.equal(sender.sent[0].title, 'طلب عروض جديد');
  assert.deepEqual(sender.sent[0].data, { type: 'tender', tenderId: 'x1y:1001', tag: 'nouveaux' });
  assert.match(sender.sent[0].body, /^أشغال · Agadir — Travaux de voirie lot 1$/);
});

test('avis vus avant l\'inscription, anciens ou hors critères : rien', async () => {
  const store = openDb(':memory:');
  store.upsertListRow(row(1), 'https://p/1', at('14T07:00:00').toISOString());
  store.upsertDevice({ token: TOKEN, platform: 'ios', lang: 'fr', prefs: { ...PREFS, regions: ['Oriental'] }, saved: [] }, at('14T08:00:00').toISOString());
  store.upsertDevice({ token: TOKEN2, platform: 'ios', lang: 'fr', prefs: PREFS, saved: [] }, at('14T08:00:00').toISOString());
  store.upsertListRow(row(2), 'https://p/2', at('14T09:00:00').toISOString());
  store.upsertListRow(row(3, { publishedAt: '2026-08-01T00:00:00+01:00' }), 'https://p/3', at('14T09:00:00').toISOString());
  const sender = fakeSender();
  await notify({ store, sender, now: () => at('15T08:30:00') });
  assert.equal(sender.sent.length, 1, 'seul TOKEN2, et seulement l\'avis 2');
  assert.equal(sender.sent[0].token, TOKEN2);
  assert.equal(sender.sent[0].data.tenderId, 'x1y:1002');
});

test('rappels de date limite des avis enregistrés, une seule fois', async () => {
  const store = openDb(':memory:');
  store.upsertListRow(row(1, { deadline: '2026-10-17T10:00:00+01:00' }), 'https://p/1', at('10T09:00:00').toISOString());
  store.upsertListRow(row(2, { deadline: '2026-10-30T10:00:00+01:00' }), 'https://p/2', at('10T09:00:00').toISOString());
  store.upsertDevice({ token: TOKEN, platform: 'android', lang: 'fr', prefs: { ...PREFS, newTenders: false }, saved: ['x1y:1001', 'x1y:1002', 'x1y:inconnu'] }, at('14T08:00:00').toISOString());

  const sender = fakeSender();
  const s = await notify({ store, sender, now: () => at('15T08:30:00') });
  assert.equal(s.reminders, 1);
  assert.equal(sender.sent[0].title, 'Date limite dans 2 jours');
  assert.equal(sender.sent[0].data.tenderId, 'x1y:1001');
  assert.equal((await notify({ store, sender, now: () => at('16T08:30:00') })).reminders, 0);
});

test('téléphone désinscrit chez Google : retiré de la base', async () => {
  const store = setup();
  store.upsertListRow(row(1), 'https://p/1', at('14T09:00:00').toISOString());
  const s = await notify({ store, sender: fakeSender(() => UNREGISTERED), now: () => at('15T08:30:00') });
  assert.equal(s.removed, 1);
  assert.equal(store.deviceCount(), 0);
});

test('panne passagère : le téléphone est retenté à la tournée suivante', async () => {
  const store = setup();
  store.upsertListRow(row(1), 'https://p/1', at('14T09:00:00').toISOString());
  const failing = await notify({ store, sender: fakeSender(() => new Error('FCM HTTP 503')), now: () => at('15T08:30:00') });
  assert.equal(failing.errors, 1);
  const sender = fakeSender();
  await notify({ store, sender, now: () => at('16T08:30:00') });
  assert.equal(sender.sent.length, 1);
});

test('accès refusé par Google : la tournée s\'arrête', async () => {
  const store = setup();
  store.upsertListRow(row(1), 'https://p/1', at('14T09:00:00').toISOString());
  await assert.rejects(notify({ store, sender: fakeSender(() => new PushConfigError('403')), now: () => at('15T08:30:00') }), PushConfigError);
});

test('jours restants au calendrier de Casablanca', () => {
  const now = at('15T23:30:00').getTime();
  assert.equal(daysUntil('2026-10-16T09:00:00+01:00', now), 1);
  assert.equal(daysUntil('2026-10-15T23:59:00+01:00', now), 0);
  assert.equal(newTendersMessage([{ id: 'a', category: 'services', city: 'Rabat', title: 'x'.repeat(300) }], 'fr').body.length, 180);
});

// API d'inscription
let server;
let base;
let apiStore;

before(async () => {
  apiStore = openDb(':memory:');
  const app = createApp({ store: apiStore, config: readConfig({}) });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  apiStore.close();
});

const send = (method, body, raw) => fetch(`${base}/api/devices`, {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: raw ?? JSON.stringify(body),
});

test('API : inscription, mise à jour, désinscription', async () => {
  assert.equal((await send('POST', { token: TOKEN, platform: 'android', lang: 'fr', prefs: PREFS, saved: ['a:1'] })).status, 204);
  assert.equal((await send('POST', { token: TOKEN, platform: 'android', lang: 'ar', prefs: { ...PREFS, keywords: ['solaire'] }, saved: [] })).status, 204);
  const [d] = apiStore.devices();
  assert.equal(d.lang, 'ar');
  assert.deepEqual(d.prefs.keywords, ['solaire']);
  assert.equal((await send('DELETE', { token: TOKEN })).status, 204);
  assert.equal(apiStore.deviceCount(), 0);
});

test('API : inscriptions invalides refusées', async () => {
  assert.equal((await send('POST', { token: 'x', platform: 'android' })).status, 400);
  assert.equal((await send('POST', null, '{pas du json')).status, 400);
  assert.equal((await send('POST', null, JSON.stringify({ token: TOKEN, platform: 'android', saved: ['x'.repeat(70000)] }))).status, 400);
  assert.equal((await send('DELETE', {})).status, 400);
});
