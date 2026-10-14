// Résumés IA : un seul appel par version d'avis, gardé en base. Plafond quotidien pour
// maîtriser la facture, et jamais deux appels simultanés pour le même avis.
import { SummaryRefused } from './summarize.js';

export class SummaryUnavailable extends Error {}
export class SummaryQuotaReached extends Error {}

/** Début du jour (heure de Casablanca), en ISO UTC. */
function startOfDayIso(now) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca' }).format(now);
  // Minuit à Casablanca : UTC+1 la plupart de l'année, UTC+0 pendant le ramadan.
  for (const offset of ['+01:00', '+00:00']) {
    const d = new Date(`${day}T00:00:00${offset}`);
    if (new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca' }).format(d) === day) {
      return d.toISOString();
    }
  }
  return new Date(`${day}T00:00:00Z`).toISOString();
}

export class SummaryService {
  /**
   * @param {object} o
   * @param {import('../db.js').TenderStore} o.store
   * @param {import('./summarize.js').Summarizer | null} o.summarizer null = IA désactivée
   * @param {number} o.dailyLimit appels à l'IA par jour, au plus
   */
  constructor({ store, summarizer, dailyLimit, now = () => new Date(), log = () => {} }) {
    this.store = store;
    this.summarizer = summarizer;
    this.dailyLimit = dailyLimit;
    this.now = now;
    this.log = log;
    this.inFlight = new Map();
  }

  get enabled() {
    return this.summarizer !== null;
  }

  /** Résumé déjà rédigé pour la version actuelle de l'avis, sans appeler l'IA. */
  cached(id) {
    const r = this.store.summaryFor(id);
    return r?.status === 'ok' ? r : null;
  }

  /**
   * Résumé de l'avis, rédigé à la demande s'il n'existe pas.
   * Lève SummaryUnavailable (IA désactivée, avis inconnu, refus) ou SummaryQuotaReached.
   */
  async get(id) {
    const existing = this.store.summaryFor(id);
    if (existing?.status === 'ok') return existing;
    if (existing?.status === 'refuse') throw new SummaryUnavailable('résumé refusé pour cet avis');
    if (!this.summarizer) throw new SummaryUnavailable('IA non configurée');
    if (!this.store.byId(id)) throw new SummaryUnavailable('avis introuvable');

    // Deux personnes ouvrent la même fiche : un seul appel.
    if (!this.inFlight.has(id)) {
      const job = this.#generate(id).finally(() => this.inFlight.delete(id));
      this.inFlight.set(id, job);
    }
    return this.inFlight.get(id);
  }

  async #generate(id) {
    const now = this.now();
    if (this.store.summariesSince(startOfDayIso(now)) >= this.dailyLimit) {
      throw new SummaryQuotaReached(`plafond de ${this.dailyLimit} résumés par jour atteint`);
    }
    const tender = this.store.byId(id);
    const hash = this.store.summarySourceHash(id);
    try {
      const r = await this.summarizer.summarize(tender, now);
      this.store.saveSummary(id, hash, { status: 'ok', ...r }, now.toISOString());
      this.log(`Résumé ${id} : ${r.usage.input} + ${r.usage.cacheRead} (cache) jetons lus, ${r.usage.output} écrits`);
    } catch (err) {
      if (err instanceof SummaryRefused) {
        // Mémorisé : on ne redemande pas à chaque ouverture de la fiche.
        this.store.saveSummary(id, hash, { status: 'refuse' }, now.toISOString());
        throw new SummaryUnavailable(err.message);
      }
      throw err;
    }
    return this.store.summaryFor(id);
  }

  /** Après une collecte : résume d'avance les nouveaux avis, dans la limite donnée. */
  async precompute(limit) {
    const stats = { done: 0, refused: 0, errors: 0, quota: false };
    if (!this.summarizer) return stats;
    for (const id of this.store.needingSummary(limit, this.now().getTime())) {
      try {
        await this.get(id);
        stats.done += 1;
      } catch (err) {
        if (err instanceof SummaryQuotaReached) {
          stats.quota = true;
          break;
        }
        if (err instanceof SummaryUnavailable) stats.refused += 1;
        else {
          stats.errors += 1;
          this.log(`Résumé ${id} impossible : ${err.message}`);
          // Panne de l'API ou clé refusée : inutile d'insister sur les suivants.
          if (stats.errors >= 3) break;
        }
      }
    }
    return stats;
  }
}
