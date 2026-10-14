// Lecture des pages du portail marocain des marchés publics (logiciel PRADO / Atexo).
// Les sélecteurs s'appuient sur les identifiants fixes des champs, relevés sur des
// pages réelles (voir test/fixtures).
import * as cheerio from 'cheerio';

import { resolvePlace } from './places.js';

const LIST = 'ctl0_CONTENU_PAGE_resultSearch';
const SUMMARY = 'ctl0_CONTENU_PAGE_idEntrepriseConsultationSummary';

/** Espaces multiples, insécables et retours à la ligne ramenés à un seul espace. */
export function clean(s) {
  return String(s ?? '')
    .replace(/[   ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** « 428 000,00 MAD » → 428000 ; « - » ou vide → null. */
export function parseAmount(s) {
  const digits = clean(s)
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}\b)/g, '')
    .replace(',', '.');
  if (!/\d/.test(digits)) return null;
  const n = Number.parseFloat(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** « Dossier de consultation - 689,51 Ko » → 690 (Ko). */
export function parseSizeKb(s) {
  const m = clean(s).match(/([\d\s.,]+)\s*(Ko|Mo|Go|Kb|Mb|Gb|octets)/i);
  if (!m) return null;
  const n = Number.parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const unit = m[2].toLowerCase();
  const kb = unit.startsWith('g') ? n * 1024 * 1024 : unit.startsWith('m') ? n * 1024 : unit === 'octets' ? n / 1024 : n;
  return Math.max(1, Math.round(kb));
}

/**
 * Décalage horaire de Casablanca à une date donnée, en minutes (UTC+1 l'essentiel de
 * l'année, UTC+0 pendant le ramadan).
 */
function casablancaOffsetMinutes(utcMs) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Casablanca',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return Math.round((asUtc - utcMs) / 60000);
}

/** « 20/11/2026 13:00 » (heure de Casablanca) → « 2026-11-20T13:00:00+01:00 ». */
export function parseDate(s) {
  const m = clean(s).match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [, d, mo, y, h = '00', mi = '00'] = m;
  const naive = Date.UTC(+y, +mo - 1, +d, +h, +mi);
  // Le décalage dépend de l'instant : on l'évalue autour de l'heure locale visée.
  const offset = casablancaOffsetMinutes(naive - casablancaOffsetMinutes(naive) * 60000);
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  const tz = `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
  return `${y}-${mo}-${d}T${h}:${mi}:00${tz}`;
}

const CATEGORIES = { travaux: 'travaux', services: 'services', fournitures: 'fournitures' };

/** « Travaux » → « travaux » ; catégorie inconnue → null. */
export function parseCategory(s) {
  const k = clean(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  return Object.keys(CATEGORIES).find((c) => k.startsWith(c)) ?? null;
}

/** Texte d'un bloc sans l'intitulé en gras (« Objet : », « Acheteur public : »). */
function textWithoutLabel($, el) {
  const copy = $(el).clone();
  copy.find('strong, span[style*="display:none"], span.info-suite, div.info-bulle').remove();
  return clean(copy.text());
}

/**
 * Champs du formulaire principal, tels qu'un navigateur les enverrait : champs cachés
 * (dont PRADO_PAGESTATE), textes, cases cochées et listes avec leur valeur choisie.
 * Les boutons ne sont pas inclus : on ajoute celui qu'on « clique ».
 */
export function formFields(html) {
  const $ = cheerio.load(html);
  const form = $('form[name="main_form"]').first().length
    ? $('form[name="main_form"]').first()
    : $('form').first();
  const fields = {};
  form.find('input[name]').each((_, el) => {
    const type = ($(el).attr('type') || 'text').toLowerCase();
    if (['submit', 'image', 'button', 'reset', 'file'].includes(type)) return;
    if ((type === 'checkbox' || type === 'radio') && $(el).attr('checked') === undefined) return;
    fields[$(el).attr('name')] = $(el).attr('value') ?? (type === 'checkbox' ? 'on' : '');
  });
  form.find('select[name]').each((_, el) => {
    const selected = $(el).find('option[selected]').first();
    const option = selected.length ? selected : $(el).find('option').first();
    if (option.length) fields[$(el).attr('name')] = option.attr('value') ?? clean(option.text());
  });
  form.find('textarea[name]').each((_, el) => {
    fields[$(el).attr('name')] = $(el).text();
  });
  return fields;
}

/** Le portail a-t-il affiché le formulaire de recherche au lieu des résultats ? */
export function isSearchForm(html) {
  return html.includes('AdvancedSearch$lancerRecherche') && !html.includes(`${LIST}_nombreElement`);
}

/**
 * Page de résultats → { total, pageCount, page, rows }.
 * Chaque ligne donne l'essentiel de l'avis ; la fiche complète apporte le reste.
 */
export function parseList(html) {
  const $ = cheerio.load(html);
  const int = (sel) => {
    const n = Number.parseInt(clean($(sel).first().text() || $(sel).first().attr('value')).replace(/\s/g, ''), 10);
    return Number.isFinite(n) ? n : null;
  };

  const rows = [];
  $(`input[id^="${LIST}_tableauResultSearch_ctl"][id$="_refCons"]`).each((_, input) => {
    const prefix = $(input).attr('id').replace(/_refCons$/, '');
    const byId = (suffix) => $(`[id="${prefix}_${suffix}"]`).first();
    const tr = $(input).closest('tr');
    const refConsultation = clean($(input).attr('value'));
    const orgAcronyme = clean(byId('orgCons').attr('value'));
    if (!refConsultation || !orgAcronyme) return;

    const refCell = tr.find('td[headers="cons_ref"]').first();
    const published = refCell
      .children('div')
      .toArray()
      .map((d) => clean($(d).text()))
      .find((t) => /^\d{2}\/\d{2}\/\d{4}$/.test(t));

    const titleFull = clean(byId('infosBullesObjet').text());
    const title = titleFull || textWithoutLabel($, byId('panelBlocObjet'));

    const placeFull = clean(tr.find(`[id^="${prefix}_"][id$="_infosLieuExecution"]`).first().text());
    const placeShort = textWithoutLabel($, byId('panelBlocLieuxExec'));
    const place = resolvePlace(placeFull || placeShort);

    const lotsText = clean(tr.find('td[headers="cons_lieuExe"] > div > span').eq(1).text());
    const lotsCount = Number.parseInt(lotsText, 10);

    const deadlineText = clean(
      tr.find('td[headers="cons_dateEnd"] .cloture-line').first().html()?.replace(/<br\s*\/?>/gi, ' ') ?? '',
    );

    rows.push({
      refConsultation,
      orgAcronyme,
      reference: clean(byId('reference').text()),
      title,
      buyer: textWithoutLabel($, byId('panelBlocDenomination')),
      procedure: clean(tr.find('[id$="_type_procedure"]').first().text()) || null,
      category: parseCategory(byId('panelBlocCategorie').text()),
      publishedAt: published ? parseDate(published) : null,
      deadline: parseDate(cheerio.load(deadlineText).text()),
      place: placeFull || placeShort,
      city: place.city,
      region: place.region,
      lotsCount: Number.isFinite(lotsCount) && lotsCount > 1 ? lotsCount : null,
    });
  });

  return {
    total: int(`#${LIST}_nombreElement`),
    pageCount: int(`#${LIST}_nombrePageTop`),
    page: int(`#${LIST}_numPageTop`),
    rows,
  };
}

/** Fiche détaillée d'une consultation → champs complémentaires. */
export function parseDetail(html) {
  const $ = cheerio.load(html);
  const field = (suffix) => clean($(`[id="${SUMMARY}_${suffix}"]`).first().text());
  const orNull = (s) => (s && s !== '-' ? s : null);

  // L'estimation est un champ de « référentiel » : on cherche celui dont le titre la nomme.
  let estimate = null;
  $(`[id^="${SUMMARY}_idReferentielZoneText_"][id$="_titre"]`).each((_, el) => {
    if (estimate !== null || !/estimation/i.test($(el).text())) return;
    const valueId = $(el).attr('id').replace(/_titre$/, '_labelReferentielZoneText');
    estimate = parseAmount($(`[id="${valueId}"]`).text());
  });

  const visits = $(`[id^="${SUMMARY}_repeaterVisitesLieux_"][id$="_dateVisites"]`)
    .toArray()
    .map((el) => parseDate($(el).text()))
    .filter(Boolean)
    .sort();

  const qualifications = $(`[id="${SUMMARY}_qualification"] li`)
    .toArray()
    .map((li) => clean($(li).text()))
    .filter(Boolean);

  const lotsText = field('nbrLots');
  const lotsCount = Number.parseInt(lotsText, 10);
  const place = field('lieuxExecutionSuite') || field('lieuxExecutions');
  const resolved = resolvePlace(place);

  return {
    reference: orNull(field('reference')),
    title: orNull(field('objet')),
    buyer: orNull(field('entiteAchat')),
    procedure: orNull(field('typeProcedure')),
    category: parseCategory(field('categoriePrincipale')),
    deadline: parseDate(field('dateHeureLimiteRemisePlis')),
    place: orNull(place),
    city: resolved.city || null,
    region: resolved.region,
    estimate,
    deposit: parseAmount(field('cautionProvisoire')),
    siteVisit: visits[0] ?? null,
    lotsCount: Number.isFinite(lotsCount) && lotsCount > 1 ? lotsCount : null,
    qualifications,
    dceSizeKb: parseSizeKb($('#ctl0_CONTENU_PAGE_linkDownloadDce').first().text()),
  };
}
