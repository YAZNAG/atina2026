// Collecte des avis ouverts : liste paginée, puis fiches des avis nouveaux ou modifiés.
//
// Le portail trie la liste par date limite décroissante : les avis ouverts viennent en
// tête, et la collecte s'arrête à la première page où tout est clôturé. Elle ne
// parcourt donc qu'une quarantaine de pages, et non les 10 000 de l'historique.
import { CollectStopped } from './http.js';
import { formFields, isSearchForm, parseDetail, parseList } from './parse.js';
import { isAllowed, parseRobots } from './robots.js';

const PAGE_SIZE_FIELD = 'ctl0$CONTENU_PAGE$resultSearch$listePageSizeTop';
const PAGE_SIZE_FIELD_BOTTOM = 'ctl0$CONTENU_PAGE$resultSearch$listePageSizeBottom';
const NEXT_PAGE = 'ctl0$CONTENU_PAGE$resultSearch$PagerTop$ctl2';
const SEARCH_BUTTON = 'ctl0$CONTENU_PAGE$AdvancedSearch$lancerRecherche';

/** Une exécution « en cours » plus vieille que ceci est considérée comme morte. */
const STALE_RUN_MS = 6 * 3600 * 1000;

export function detailPath(orgAcronyme, refConsultation) {
  return `index.php?page=entreprise.EntrepriseDetailConsultation&refConsultation=${encodeURIComponent(refConsultation)}&orgAcronyme=${encodeURIComponent(orgAcronyme)}`;
}

async function checkRobots(client, paths) {
  let text = '';
  try {
    text = (await client.get('/robots.txt')).text;
  } catch (err) {
    if (err instanceof CollectStopped) throw err;
    // Pas de robots.txt (404) : aucune restriction déclarée.
  }
  const rules = parseRobots(text, 'MounaqasaBot');
  for (const p of paths) {
    const u = new URL(p, client.baseUrl);
    if (!isAllowed(rules, u.pathname + u.search)) {
      throw new CollectStopped('robots.txt interdit la collecte', u.pathname + u.search);
    }
  }
}

/**
 * Lance une collecte. Ne lève pas : le résultat (et le journal en base) dit comment
 * elle s'est terminée.
 *
 * @param {object} o
 * @param {import('../db.js').TenderStore} o.store
 * @param {import('./http.js').PoliteClient} o.client
 * @param {object} o.config  pageSize, maxPages, detailsPerRun, searchPath
 * @param {() => Date} [o.now]
 * @param {(msg: string) => void} [o.log]
 */
export async function collect({ store, client, config, now = () => new Date(), log = () => {} }) {
  const last = store.lastRun();
  if (last?.status === 'en_cours' && now() - Date.parse(last.started_at) < STALE_RUN_MS) {
    return { status: 'refuse', reason: 'une collecte est déjà en cours' };
  }
  if (last?.status === 'en_cours') {
    store.finishRun(last.id, { status: 'echec', reason: 'interrompue (processus arrêté)', pages: last.pages, rowsSeen: last.rows_seen, newCount: last.new_count, updatedCount: last.updated_count, detailsFetched: last.details_fetched, requests: last.requests }, now().toISOString());
  }

  const runId = store.startRun(now().toISOString());
  const stats = { pages: 0, rowsSeen: 0, newCount: 0, updatedCount: 0, detailsFetched: 0 };
  let status = 'succes';
  let reason = null;

  try {
    await checkRobots(client, [config.searchPath, detailPath('x', '1')]);

    // 1. Première page : le portail renvoie soit les résultats, soit le formulaire.
    let html = (await client.get(config.searchPath)).text;
    if (isSearchForm(html)) {
      log('Formulaire de recherche affiché : envoi avec les critères par défaut');
      html = (await client.postForm(config.searchPath, {
        ...formFields(html),
        PRADO_POSTBACK_TARGET: SEARCH_BUTTON,
        [SEARCH_BUTTON]: 'Lancer la recherche',
      })).text;
    }
    let list = parseList(html);
    if (!list.rows.length) {
      throw new Error('aucune consultation lue sur la première page : la structure du portail a peut-être changé');
    }
    log(`${list.total ?? '?'} consultations au total sur le portail`);

    // 2. Plus de résultats par page, comme le choisirait un utilisateur.
    if (list.rows.length < config.pageSize) {
      html = (await client.postForm(config.searchPath, {
        ...formFields(html),
        PRADO_POSTBACK_TARGET: PAGE_SIZE_FIELD,
        [PAGE_SIZE_FIELD]: String(config.pageSize),
        [PAGE_SIZE_FIELD_BOTTOM]: String(config.pageSize),
      })).text;
      const resized = parseList(html);
      if (resized.rows.length) list = resized;
    }

    // 3. Pages successives jusqu'aux avis clôturés.
    const nowMs = now().getTime();
    for (;;) {
      stats.pages += 1;
      let open = 0;
      for (const row of list.rows) {
        stats.rowsSeen += 1;
        if (row.deadline && Date.parse(row.deadline) > nowMs) open += 1;
        const portalUrl = client.url(detailPath(row.orgAcronyme, row.refConsultation));
        const r = store.upsertListRow(row, portalUrl, now().toISOString());
        if (r === 'new') stats.newCount += 1;
        if (r === 'updated') stats.updatedCount += 1;
      }
      log(`Page ${list.page ?? stats.pages} : ${list.rows.length} avis, dont ${open} ouverts`);

      if (open === 0) break;
      if (stats.pages >= config.maxPages) {
        status = 'partiel';
        reason = `limite de ${config.maxPages} pages atteinte`;
        break;
      }
      if (list.pageCount !== null && list.page !== null && list.page >= list.pageCount) break;

      const nextHtml = (await client.postForm(config.searchPath, {
        ...formFields(html),
        PRADO_POSTBACK_TARGET: NEXT_PAGE,
      })).text;
      const next = parseList(nextHtml);
      const samePage =
        !next.rows.length ||
        (next.page !== null && list.page !== null && next.page <= list.page) ||
        next.rows[0].refConsultation === list.rows[0].refConsultation;
      if (samePage) {
        status = 'partiel';
        reason = 'la page suivante n\'a pas pu être obtenue';
        break;
      }
      // La page suivante devient le formulaire de référence (nouvel état PRADO).
      html = nextHtml;
      list = next;
    }

    // 4. Fiches des avis nouveaux ou modifiés, les plus urgents d'abord.
    const todo = store.needingDetail(config.detailsPerRun, nowMs);
    log(`${todo.length} fiches à lire`);
    for (const t of todo) {
      try {
        const page = (await client.get(detailPath(t.org_acronyme, t.ref_consultation))).text;
        const d = parseDetail(page);
        if (!d.reference && !d.title) throw new Error('fiche illisible');
        store.saveDetail(t.id, t.list_hash, d, now().toISOString());
        stats.detailsFetched += 1;
      } catch (err) {
        if (err instanceof CollectStopped) throw err;
        store.markDetailError(t.id);
        log(`Fiche ${t.id} ignorée : ${err.message}`);
      }
    }
  } catch (err) {
    status = err instanceof CollectStopped ? 'arrete' : 'echec';
    reason = err.message;
    log(`Collecte ${status} : ${reason}`);
  }

  store.finishRun(runId, { status, reason, ...stats, requests: client.requestCount }, now().toISOString());
  return { status, reason, ...stats, requests: client.requestCount };
}
