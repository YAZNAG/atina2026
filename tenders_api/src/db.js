// Stockage SQLite (module intégré à Node) : un seul fichier, rien à installer.
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tenders (
  id                TEXT PRIMARY KEY,          -- « orgAcronyme:refConsultation », « bdc:<id> »
  kind              TEXT NOT NULL DEFAULT 'ao',-- ao (appel d'offres), bdc (bon de commande)
  cancelled         INTEGER NOT NULL DEFAULT 0,
  ref_consultation  TEXT NOT NULL,
  org_acronyme      TEXT NOT NULL,
  reference         TEXT,
  title             TEXT,
  buyer             TEXT,
  procedure         TEXT,
  category          TEXT,
  published_at      TEXT,                      -- ISO 8601, heure de Casablanca
  published_ts      INTEGER,                   -- même instant en millisecondes, pour trier
  deadline          TEXT,
  deadline_ts       INTEGER,
  place             TEXT,
  city              TEXT,
  region            TEXT,
  estimate          REAL,
  deposit           REAL,
  site_visit        TEXT,
  lots_count        INTEGER,
  qualifications    TEXT,                      -- JSON
  dce_size_kb       INTEGER,
  portal_url        TEXT NOT NULL,
  search_text       TEXT,
  list_hash         TEXT,                      -- empreinte de la ligne de liste
  detail_for_hash   TEXT,                      -- empreinte à laquelle la fiche a été lue
  detail_errors     INTEGER NOT NULL DEFAULT 0,
  first_seen_at     TEXT NOT NULL,
  last_seen_at      TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tenders_deadline ON tenders (deadline_ts);
CREATE INDEX IF NOT EXISTS tenders_published ON tenders (published_ts);

CREATE TABLE IF NOT EXISTS runs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at       TEXT NOT NULL,
  finished_at      TEXT,
  status           TEXT NOT NULL,              -- en_cours, succes, partiel, arrete, echec
  reason           TEXT,
  pages            INTEGER DEFAULT 0,
  rows_seen        INTEGER DEFAULT 0,
  new_count        INTEGER DEFAULT 0,
  updated_count    INTEGER DEFAULT 0,
  details_fetched  INTEGER DEFAULT 0,
  requests         INTEGER DEFAULT 0
);

-- Téléphones inscrits aux notifications, avec leurs préférences d'alertes.
CREATE TABLE IF NOT EXISTS devices (
  token             TEXT PRIMARY KEY,          -- jeton Firebase Cloud Messaging
  platform          TEXT NOT NULL,
  lang              TEXT NOT NULL,
  prefs             TEXT NOT NULL,             -- JSON, même forme que AlertPrefs dans l'app
  saved             TEXT NOT NULL DEFAULT '[]',-- JSON, avis enregistrés (rappels)
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  last_notified_at  TEXT NOT NULL              -- avis vus après cette date = nouveaux
);

-- Résumés rédigés par l'IA, un par avis, refaits si l'avis change (rectificatif).
CREATE TABLE IF NOT EXISTS ai_summaries (
  tender_id          TEXT PRIMARY KEY,
  source_hash        TEXT NOT NULL,            -- version de l'avis résumée
  status             TEXT NOT NULL,            -- ok, refuse
  summary            TEXT,                     -- JSON { fr, ar }
  model              TEXT,
  input_tokens       INTEGER,
  output_tokens      INTEGER,
  cache_read_tokens  INTEGER,
  created_at         TEXT NOT NULL
);

-- Ce qui a déjà été signalé : jamais deux fois la même alerte.
CREATE TABLE IF NOT EXISTS notifications_sent (
  token      TEXT NOT NULL,
  tender_id  TEXT NOT NULL,
  kind       TEXT NOT NULL,                    -- nouveau, rappel
  sent_at    TEXT NOT NULL,
  PRIMARY KEY (token, tender_id, kind)
);
`;

/** Minuscules sans accents, pour chercher « equipement » dans « Équipement ». */
export function searchKey(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, ' ')
    .trim();
}

const ts = (iso) => (iso ? Date.parse(iso) : null);

/** Bases créées avant l'ajout des bons de commande : colonnes ajoutées sur place. */
function migrate(db) {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'tenders'").get();
  if (!exists) return;
  const cols = db.prepare('PRAGMA table_info(tenders)').all().map((c) => c.name);
  if (!cols.includes('kind')) db.exec("ALTER TABLE tenders ADD COLUMN kind TEXT NOT NULL DEFAULT 'ao'");
  if (!cols.includes('cancelled')) db.exec('ALTER TABLE tenders ADD COLUMN cancelled INTEGER NOT NULL DEFAULT 0');
}

/** Avis encore ouvert : date limite à venir et pas annulé. */
const OPEN = 'deadline_ts > ? AND cancelled = 0';

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  migrate(db);
  db.exec(SCHEMA);
  return new TenderStore(db);
}

export class TenderStore {
  constructor(db) {
    this.db = db;
  }

  close() {
    this.db.close();
  }

  /**
   * Enregistre une ligne de la liste. Renvoie « new », « updated » ou « same ».
   * Les champs déjà lus sur la fiche (estimation, caution…) ne sont pas écrasés.
   */
  upsertListRow(row, portalUrl, now) {
    const id = `${row.orgAcronyme}:${row.refConsultation}`;
    const kind = row.kind ?? 'ao';
    const cancelled = row.cancelled ? 1 : 0;
    const hash = createHash('sha1')
      .update(JSON.stringify([row.reference, row.title, row.buyer, row.procedure, row.category, row.deadline, row.place, row.lotsCount, cancelled]))
      .digest('hex');
    const existing = this.db.prepare('SELECT list_hash FROM tenders WHERE id = ?').get(id);
    const search = searchKey([row.reference, row.title, row.buyer, row.place, row.city, row.region, row.procedure].join(' '));

    if (!existing) {
      this.db.prepare(`
        INSERT INTO tenders (id, kind, cancelled, ref_consultation, org_acronyme, reference, title, buyer, procedure,
          category, published_at, published_ts, deadline, deadline_ts, place, city, region, lots_count,
          portal_url, search_text, list_hash, first_seen_at, last_seen_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        id, kind, cancelled, row.refConsultation, row.orgAcronyme, row.reference, row.title, row.buyer, row.procedure,
        row.category, row.publishedAt, ts(row.publishedAt), row.deadline, ts(row.deadline), row.place,
        row.city, row.region, row.lotsCount, portalUrl, search, hash, now, now, now,
      );
      return 'new';
    }
    if (existing.list_hash === hash) {
      this.db.prepare('UPDATE tenders SET last_seen_at = ? WHERE id = ?').run(now, id);
      return 'same';
    }
    // Rectificatif ou report : la fiche sera relue au prochain passage.
    this.db.prepare(`
      UPDATE tenders SET cancelled = ?, reference = ?, title = ?, buyer = ?, procedure = ?, category = ?,
        published_at = COALESCE(?, published_at), published_ts = COALESCE(?, published_ts),
        deadline = ?, deadline_ts = ?, place = ?, city = ?, region = ?,
        lots_count = COALESCE(?, lots_count), search_text = ?, list_hash = ?, detail_errors = 0,
        last_seen_at = ?, updated_at = ?
      WHERE id = ?`).run(
      cancelled, row.reference, row.title, row.buyer, row.procedure, row.category, row.publishedAt,
      ts(row.publishedAt), row.deadline, ts(row.deadline), row.place, row.city, row.region,
      row.lotsCount, search, hash, now, now, id,
    );
    return 'updated';
  }

  /** Avis encore ouverts dont la fiche n'a jamais été lue, ou plus à jour. */
  needingDetail(limit, nowMs, kind = 'ao') {
    return this.db.prepare(`
      SELECT id, ref_consultation, org_acronyme, portal_url, list_hash FROM tenders
      WHERE ${OPEN} AND kind = ? AND detail_errors < 3
        AND (detail_for_hash IS NULL OR detail_for_hash <> list_hash)
      ORDER BY deadline_ts ASC
      LIMIT ?`).all(nowMs, kind, limit);
  }

  saveDetail(id, listHash, d, now) {
    const current = this.db.prepare('SELECT * FROM tenders WHERE id = ?').get(id);
    if (!current) return;
    // La liste reste la référence pour l'objet et l'acheteur (sans le code d'organisme).
    const title = current.title || d.title;
    const buyer = current.buyer || d.buyer;
    const city = current.city || d.city;
    const region = current.region || d.region;
    this.db.prepare(`
      UPDATE tenders SET title = ?, buyer = ?, procedure = COALESCE(procedure, ?),
        category = COALESCE(category, ?), city = ?, region = ?, estimate = ?, deposit = ?,
        site_visit = ?, lots_count = COALESCE(?, lots_count), qualifications = ?, dce_size_kb = ?,
        search_text = ?, detail_for_hash = ?, detail_errors = 0, updated_at = ?
      WHERE id = ?`).run(
      title, buyer, d.procedure, d.category, city, region, d.estimate, d.deposit, d.siteVisit,
      d.lotsCount, JSON.stringify(d.qualifications ?? []), d.dceSizeKb,
      searchKey([current.reference, title, buyer, current.place, city, region, current.procedure, ...(d.qualifications ?? [])].join(' ')),
      listHash, now, id,
    );
  }

  markDetailError(id) {
    this.db.prepare('UPDATE tenders SET detail_errors = detail_errors + 1 WHERE id = ?').run(id);
  }

  byId(id) {
    const r = this.db.prepare('SELECT * FROM tenders WHERE id = ?').get(id);
    return r ? toApi(r) : null;
  }

  /**
   * Recherche pour l'API. `status` : « open » (par défaut) ou « all ».
   * Tous les mots de `q` doivent apparaître, accents ignorés.
   */
  query({ status = 'open', q = '', kind, category, region, sort = 'recent', limit = 50, offset = 0, nowMs = Date.now() } = {}) {
    const where = [];
    const params = [];
    if (status !== 'all') {
      where.push(OPEN);
      params.push(nowMs);
    }
    if (kind) {
      where.push('kind = ?');
      params.push(kind);
    }
    if (category) {
      where.push('category = ?');
      params.push(category);
    }
    if (region) {
      where.push('region = ?');
      params.push(region);
    }
    for (const word of searchKey(q).split(' ').filter(Boolean).slice(0, 8)) {
      where.push("search_text LIKE ? ESCAPE '\\'");
      params.push(`%${word.replace(/[\\%_]/g, '\\$&')}%`);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const order = {
      recent: 'published_ts DESC, deadline_ts ASC',
      deadline: 'deadline_ts ASC',
      amount: 'estimate IS NULL, estimate DESC',
    }[sort] ?? 'published_ts DESC';
    const total = this.db.prepare(`SELECT COUNT(*) AS n FROM tenders ${clause}`).get(...params).n;
    const items = this.db
      .prepare(`SELECT * FROM tenders ${clause} ORDER BY ${order}, id LIMIT ? OFFSET ?`)
      .all(...params, limit, offset)
      .map(toApi);
    return { total, items };
  }

  counts(nowMs = Date.now()) {
    return this.db.prepare(`
      SELECT COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN ${OPEN} THEN 1 ELSE 0 END), 0) AS open,
        COALESCE(SUM(CASE WHEN ${OPEN} AND kind = 'bdc' THEN 1 ELSE 0 END), 0) AS openPurchaseOrders,
        COALESCE(SUM(CASE WHEN ${OPEN} AND detail_for_hash IS NOT NULL THEN 1 ELSE 0 END), 0) AS openWithDetail
      FROM tenders`).get(nowMs, nowMs, nowMs);
  }

  startRun(now) {
    const r = this.db.prepare("INSERT INTO runs (started_at, status) VALUES (?, 'en_cours')").run(now);
    return Number(r.lastInsertRowid);
  }

  finishRun(id, { status, reason = null, pages, rowsSeen, newCount, updatedCount, detailsFetched, requests }, now) {
    this.db.prepare(`
      UPDATE runs SET finished_at = ?, status = ?, reason = ?, pages = ?, rows_seen = ?,
        new_count = ?, updated_count = ?, details_fetched = ?, requests = ?
      WHERE id = ?`).run(now, status, reason, pages, rowsSeen, newCount, updatedCount, detailsFetched, requests, id);
  }

  lastRun() {
    return this.db.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT 1').get() ?? null;
  }

  /**
   * Inscrit ou met à jour un téléphone. À la première inscription, seuls les avis vus
   * ensuite comptent comme nouveaux : pas d'avalanche sur l'existant.
   */
  upsertDevice({ token, platform, lang, prefs, saved }, now) {
    this.db.prepare(`
      INSERT INTO devices (token, platform, lang, prefs, saved, created_at, updated_at, last_notified_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (token) DO UPDATE SET platform = excluded.platform, lang = excluded.lang,
        prefs = excluded.prefs, saved = excluded.saved, updated_at = excluded.updated_at`).run(
      token, platform, lang, JSON.stringify(prefs), JSON.stringify(saved), now, now, now,
    );
  }

  deleteDevice(token) {
    this.db.prepare('DELETE FROM notifications_sent WHERE token = ?').run(token);
    return this.db.prepare('DELETE FROM devices WHERE token = ?').run(token).changes > 0;
  }

  devices() {
    return this.db.prepare('SELECT * FROM devices ORDER BY created_at').all().map((d) => ({
      token: d.token,
      platform: d.platform,
      lang: d.lang,
      prefs: JSON.parse(d.prefs),
      saved: JSON.parse(d.saved),
      lastNotifiedAt: d.last_notified_at,
    }));
  }

  markNotified(token, now) {
    this.db.prepare('UPDATE devices SET last_notified_at = ? WHERE token = ?').run(now, token);
  }

  /** Avis encore ouverts apparus depuis `sinceIso`. */
  newTendersSince(sinceIso, nowMs) {
    return this.db
      .prepare(`SELECT * FROM tenders WHERE first_seen_at > ? AND ${OPEN}
        ORDER BY published_ts DESC, id`)
      .all(sinceIso, nowMs)
      .map(toApi);
  }

  tendersByIds(ids) {
    if (!ids.length) return [];
    const marks = ids.map(() => '?').join(',');
    return this.db.prepare(`SELECT * FROM tenders WHERE id IN (${marks})`).all(...ids).map(toApi);
  }

  wasSent(token, tenderId, kind) {
    return !!this.db
      .prepare('SELECT 1 FROM notifications_sent WHERE token = ? AND tender_id = ? AND kind = ?')
      .get(token, tenderId, kind);
  }

  recordSent(token, tenderIds, kind, now) {
    const stmt = this.db.prepare(
      'INSERT OR IGNORE INTO notifications_sent (token, tender_id, kind, sent_at) VALUES (?, ?, ?, ?)',
    );
    for (const id of tenderIds) stmt.run(token, id, kind, now);
  }

  /** Version de l'avis à résumer : change avec la liste et avec la fiche. */
  summarySourceHash(id) {
    const r = this.db.prepare('SELECT list_hash, detail_for_hash FROM tenders WHERE id = ?').get(id);
    return r ? `${r.list_hash}:${r.detail_for_hash ?? ''}` : null;
  }

  /** Résumé enregistré pour la version actuelle de l'avis, ou null. */
  summaryFor(id) {
    const hash = this.summarySourceHash(id);
    if (!hash) return null;
    const r = this.db.prepare('SELECT * FROM ai_summaries WHERE tender_id = ? AND source_hash = ?').get(id, hash);
    if (!r) return null;
    return {
      status: r.status,
      summary: r.summary ? JSON.parse(r.summary) : null,
      model: r.model,
      createdAt: r.created_at,
    };
  }

  saveSummary(id, sourceHash, { status, summary = null, model = null, usage = {} }, now) {
    this.db.prepare(`
      INSERT INTO ai_summaries (tender_id, source_hash, status, summary, model, input_tokens,
        output_tokens, cache_read_tokens, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (tender_id) DO UPDATE SET source_hash = excluded.source_hash,
        status = excluded.status, summary = excluded.summary, model = excluded.model,
        input_tokens = excluded.input_tokens, output_tokens = excluded.output_tokens,
        cache_read_tokens = excluded.cache_read_tokens, created_at = excluded.created_at`).run(
      id, sourceHash, status, summary ? JSON.stringify(summary) : null, model,
      usage.input ?? null, usage.output ?? null, usage.cacheRead ?? null, now,
    );
  }

  /** Résumés demandés à l'IA depuis `sinceIso` (plafond quotidien). */
  summariesSince(sinceIso) {
    return this.db.prepare('SELECT COUNT(*) AS n FROM ai_summaries WHERE created_at >= ?').get(sinceIso).n;
  }

  /** Avis ouverts, fiche lue, sans résumé à jour : les plus récents d'abord. */
  needingSummary(limit, nowMs) {
    return this.db.prepare(`
      SELECT t.id FROM tenders t
      LEFT JOIN ai_summaries s ON s.tender_id = t.id
        AND s.source_hash = t.list_hash || ':' || COALESCE(t.detail_for_hash, '')
      WHERE t.deadline_ts > ? AND t.cancelled = 0 AND t.detail_for_hash IS NOT NULL AND s.tender_id IS NULL
      ORDER BY t.published_ts DESC, t.id
      LIMIT ?`).all(nowMs, limit).map((r) => r.id);
  }

  deviceCount() {
    return this.db.prepare('SELECT COUNT(*) AS n FROM devices').get().n;
  }

  lastSuccessfulRun() {
    return this.db.prepare("SELECT * FROM runs WHERE status IN ('succes', 'partiel') ORDER BY id DESC LIMIT 1").get() ?? null;
  }
}

/** Ligne de base → avis tel que l'app le lit. */
function toApi(r) {
  return {
    id: r.id,
    kind: r.kind,
    cancelled: r.cancelled === 1,
    reference: r.reference,
    title: r.title,
    buyer: r.buyer,
    procedure: r.procedure,
    category: r.category,
    publishedAt: r.published_at,
    deadline: r.deadline,
    place: r.place,
    city: r.city,
    region: r.region,
    estimate: r.estimate,
    deposit: r.deposit,
    siteVisit: r.site_visit,
    lotsCount: r.lots_count,
    qualifications: r.qualifications ? JSON.parse(r.qualifications) : [],
    dceSizeKb: r.dce_size_kb,
    portalUrl: r.portal_url,
    detailsAvailable: r.detail_for_hash !== null,
    firstSeenAt: r.first_seen_at,
    updatedAt: r.updated_at,
  };
}
