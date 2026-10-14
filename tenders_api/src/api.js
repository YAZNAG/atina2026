// API lue par l'app : avis ouverts, recherche, fiche et état de la collecte.
import compression from 'compression';
import cors from 'cors';
import express from 'express';

import { REGION_NAMES } from './pmmp/places.js';
import { InvalidDevice, parseDevice } from './push/prefs.js';

const CATEGORIES = ['travaux', 'services', 'fournitures'];
const SORTS = ['recent', 'deadline', 'amount'];

class BadRequest extends Error {}

function int(v, def, min, max, name) {
  if (v === undefined || v === '') return def;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new BadRequest(`${name} doit être un entier entre ${min} et ${max}`);
  }
  return n;
}

function oneOf(v, allowed, name) {
  if (v === undefined || v === '') return undefined;
  if (!allowed.includes(v)) throw new BadRequest(`${name} inconnu : ${v}`);
  return v;
}

export function createApp({ store, config, now = Date.now }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(compression());
  app.use(cors({ origin: config.corsOrigins.includes('*') ? '*' : config.corsOrigins }));

  app.use(express.json({ limit: '64kb' }));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  // Inscription d'un téléphone aux notifications, ou mise à jour de ses alertes.
  app.post('/api/devices', (req, res) => {
    const device = parseDevice(req.body);
    store.upsertDevice(device, new Date(now()).toISOString());
    res.status(204).end();
  });

  // Désinscription : alertes coupées dans l'app.
  app.delete('/api/devices', (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!token) throw new BadRequest('token manquant');
    store.deleteDevice(token);
    res.status(204).end();
  });

  app.get('/api/meta', (_req, res) => {
    const last = store.lastRun();
    const success = store.lastSuccessfulRun();
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      source: 'Portail marocain des marchés publics',
      sourceUrl: config.baseUrl,
      counts: store.counts(now()),
      regions: REGION_NAMES,
      lastRun: last && {
        startedAt: last.started_at,
        finishedAt: last.finished_at,
        status: last.status,
        reason: last.reason,
        newCount: last.new_count,
      },
      lastSuccessAt: success?.finished_at ?? null,
      push: Boolean(config.fcmServiceAccount),
    });
  });

  app.get('/api/tenders', (req, res) => {
    const q = req.query;
    const result = store.query({
      status: oneOf(q.status, ['open', 'all'], 'status') ?? 'open',
      q: typeof q.q === 'string' ? q.q.slice(0, 200) : '',
      category: oneOf(q.category, CATEGORIES, 'category'),
      region: oneOf(q.region, REGION_NAMES, 'region'),
      sort: oneOf(q.sort, SORTS, 'sort') ?? 'recent',
      limit: int(q.limit, 100, 1, 500, 'limit'),
      offset: int(q.offset, 0, 0, 1_000_000, 'offset'),
      nowMs: now(),
    });
    res.set('Cache-Control', 'public, max-age=300');
    res.json(result);
  });

  app.get('/api/tenders/:id', (req, res) => {
    const t = store.byId(req.params.id);
    if (!t) return res.status(404).json({ error: 'Avis introuvable' });
    res.set('Cache-Control', 'public, max-age=300');
    res.json(t);
  });

  app.use((_req, res) => res.status(404).json({ error: 'Route inconnue' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof BadRequest || err instanceof InvalidDevice) {
      return res.status(400).json({ error: err.message });
    }
    if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
      return res.status(400).json({ error: 'corps JSON invalide ou trop gros' });
    }
    console.error(err);
    res.status(500).json({ error: 'Erreur interne' });
  });

  return app;
}
