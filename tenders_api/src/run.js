// Lancement d'une collecte avec la configuration : partagé par la ligne de commande et
// le planificateur du serveur.
import { assertCanCollect, inWindow } from './config.js';
import { collect } from './pmmp/collector.js';
import { PoliteClient } from './pmmp/http.js';

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
