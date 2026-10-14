// Lancement d'une collecte avec la configuration : partagé par la ligne de commande et
// le planificateur du serveur.
import Anthropic from '@anthropic-ai/sdk';

import { SummaryService } from './ai/service.js';
import { Summarizer } from './ai/summarize.js';
import { assertCanCollect, inWindow } from './config.js';
import { collect } from './pmmp/collector.js';
import { PoliteClient } from './pmmp/http.js';
import { FcmSender, readServiceAccount } from './push/fcm.js';
import { notify } from './push/notify.js';

/**
 * @param {object} o
 * @param {boolean} [o.force] hors de la plage horaire : 1 page et 10 fiches au plus
 */
export async function runCollect({ store, config, force = false, log = console.log, fetchImpl, now = () => new Date() }) {
  assertCanCollect(config);
  let limits = config;
  if (!inWindow(config.window, now())) {
    if (!force) {
      return {
        status: 'refuse',
        reason: `hors de la plage horaire autorisée (${config.window}, heure de Casablanca) ; --force pour un essai limité`,
      };
    }
    // En journée, le portail sert d'abord les entreprises : essai réduit.
    limits = { ...config, maxPages: 1, detailsPerRun: Math.min(10, config.detailsPerRun), pageSize: Math.min(config.pageSize, 20) };
    log('Hors plage horaire : essai limité à 1 page et 10 fiches');
  }
  const client = new PoliteClient({
    baseUrl: config.baseUrl,
    userAgent: config.userAgent,
    delayMs: config.delayMs,
    timeoutMs: config.timeoutMs,
    maxConsecutiveErrors: config.maxConsecutiveErrors,
    fetchImpl,
  });
  return collect({ store, client, config: limits, log, now });
}

/** Tournée de notifications ; sans compte de service Firebase, rien n'est envoyé. */
export async function runNotify({ store, config, log = console.log, fetchImpl, now = () => new Date() }) {
  if (!config.fcmServiceAccount) {
    return { status: 'desactive', reason: 'FCM_SERVICE_ACCOUNT est vide' };
  }
  const sender = new FcmSender({ account: readServiceAccount(config.fcmServiceAccount), fetchImpl });
  const stats = await notify({ store, sender, now, log });
  return { status: 'succes', ...stats };
}

/** Service de résumés ; sans clé d'API Anthropic, il répond « IA non configurée ». */
export function createSummaryService({ store, config, client, log = console.log }) {
  const summarizer = config.aiEnabled
    ? new Summarizer({ client: client ?? new Anthropic(), model: config.aiModel, effort: config.aiEffort })
    : null;
  return new SummaryService({ store, summarizer, dailyLimit: config.aiDailyLimit, log });
}

/** Après une collecte : résumés des nouveaux avis, pour que les fiches s'ouvrent vite. */
export async function runSummaries({ summaries, config }) {
  if (!summaries.enabled) return { status: 'desactive', reason: "ANTHROPIC_API_KEY est vide" };
  return { status: 'succes', ...(await summaries.precompute(config.aiPrecomputePerRun)) };
}
