// Bons de commande (« avis d'achat ») du portail : module /bdc/, distinct des appels
// d'offres. Pagination simple (?page=N) et une fiche par avis (/show/<id>).
//
// La mise en page exacte de ce module n'a pas pu être relevée : la lecture s'appuie sur
// les liens vers les fiches et sur les intitulés des champs (« Objet », « Date limite
// de remise des devis »…), pas sur des classes CSS. Une page dont aucun avis n'est lu
// fait échouer la collecte avec un message explicite.
import * as cheerio from 'cheerio';

import { clean, parseAmount, parseCategory, parseDate } from './parse.js';
import { resolvePlace } from './places.js';

export const BDC_LIST_PATH = 'bdc/entreprise/consultation/';
export const bdcListPath = (page, base = BDC_LIST_PATH) => (page <= 1 ? base : `${base}?page=${page}`);
export const bdcDetailPath = (id) => `bdc/entreprise/consultation/show/${encodeURIComponent(id)}`;

const SHOW = /\/bdc\/entreprise\/consultation\/show\/([\w-]+)/;

/** Intitulés reconnus pour chaque champ (variantes rencontrées ou probables). */
const LABELS = {
  reference: ['Référence', 'Reference', 'N° de référence', 'N° de l\'avis'],
  title: ['Objet de l\'achat', 'Objet'],
  buyer: ['Acheteur public', 'Entité d\'achat', 'Acheteur', 'Organisme'],
  deadline: [
    'Date limite de remise des devis',
    'Date limite de dépôt des devis',
    'Date limite de réception des devis',
    'Date et heure limite',
    'Date limite',
  ],
  place: ["Lieu d'exécution", 'Lieu de livraison', 'Lieu'],
  category: ['Catégorie principale', 'Catégorie', 'Nature de la prestation', 'Nature'],
  published: ['Date de publication', 'Date de mise en ligne', 'Publié le'],
  estimate: ['Montant estimatif', 'Montant estimé', 'Estimation'],
};

const fold = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’`]/g, "'")
    .toLowerCase();

/** Tous les intitulés, du plus long au plus court (« Date limite de… » avant « Date limite »). */
const ALL_LABELS = Object.entries(LABELS)
  .flatMap(([field, labels]) => labels.map((label) => ({ field, label, key: fold(label) })))
  .sort((a, b) => b.key.length - a.key.length);

/** Texte d'un élément, une ligne par bloc (div, td, li…), comme à l'écran. */
export function blockText($, el) {
  const copy = $(el).clone();
  copy.find('script, style, noscript').remove();
  copy.find('br').replaceWith('\n');
  copy.find('div, p, li, tr, td, th, dt, dd, h1, h2, h3, h4, h5, h6, label, section, article').each((_, n) => {
    $(n).prepend('\n').append('\n');
  });
  return copy
    .text()
    .split('\n')
    .map((l) => clean(l))
    .filter(Boolean)
    .join('\n');
}

function labelAt(line) {
  const f = fold(line);
  for (const l of ALL_LABELS) {
    if (f === l.key || f.startsWith(`${l.key} `) || f.startsWith(`${l.key}:`) || f.startsWith(`${l.key} :`)) {
      return l;
    }
  }
  return null;
}

/**
 * « Objet : Achat de… » ou « Objet » puis la valeur sur la ligne suivante → champs.
 * Le premier intitulé trouvé pour un champ l'emporte.
 */
export function extractLabeled(text) {
  const lines = text.split('\n');
  const out = {};
  for (let i = 0; i < lines.length; i++) {
    const hit = labelAt(lines[i]);
    if (!hit || out[hit.field] !== undefined) continue;
    let value = lines[i].slice(hit.label.length).replace(/^\s*:?\s*/, '').trim();
    if (!value && i + 1 < lines.length && !labelAt(lines[i + 1])) value = lines[i + 1].trim();
    if (value) out[hit.field] = value;
  }
  return out;
}

/** « Annulé » ou « Annulée » dans le bloc de l'avis. */
const isCancelled = (text) => /\bannulee?\b/.test(fold(text));

function toRow(id, fields, text, fallbackTitle) {
  const place = resolvePlace(fields.place);
  return {
    kind: 'bdc',
    refConsultation: id,
    orgAcronyme: 'bdc',
    reference: fields.reference ?? null,
    title: fields.title ?? fallbackTitle ?? null,
    buyer: fields.buyer ?? null,
    procedure: 'Bon de commande',
    category: fields.category ? parseCategory(fields.category) : null,
    publishedAt: fields.published ? parseDate(fields.published) : null,
    deadline: fields.deadline ? parseDate(fields.deadline) : null,
    place: fields.place ?? null,
    city: place.city || null,
    region: place.region,
    lotsCount: null,
    cancelled: isCancelled(text),
  };
}

/**
 * Page de liste → { total, rows }. Chaque avis est repéré par son lien vers sa fiche ;
 * son bloc est le plus grand ancêtre qui ne contient que cet avis.
 */
export function parseBdcList(html) {
  const $ = cheerio.load(html);
  const idsIn = (el) => {
    const ids = new Set();
    $(el).find('a[href]').each((_, a) => {
      const m = SHOW.exec($(a).attr('href'));
      if (m) ids.add(m[1]);
    });
    return ids;
  };

  const seen = new Set();
  const rows = [];
  $('a[href]').each((_, a) => {
    const m = SHOW.exec($(a).attr('href'));
    if (!m || seen.has(m[1])) return;
    seen.add(m[1]);
    let block = $(a);
    for (let p = block.parent(); p.length && !p.is('body, html, table, tbody, ul, ol'); p = p.parent()) {
      const ids = idsIn(p);
      if (ids.size !== 1) break;
      block = p;
    }
    const text = blockText($, block);
    const fields = extractLabeled(text);
    const linkText = clean($(a).text());
    rows.push(toRow(m[1], fields, text, linkText.length > 15 ? linkText : null));
  });

  const all = blockText($, 'body');
  const total = /nombre de resultats\s*:?\s*([\d\s.]+)/.exec(fold(all));
  return {
    total: total ? Number.parseInt(total[1].replace(/[\s.]/g, ''), 10) : null,
    rows,
  };
}

/** Fiche d'un bon de commande → champs complémentaires (même forme que parseDetail). */
export function parseBdcDetail(html) {
  const $ = cheerio.load(html);
  const main = $('main').first().length ? $('main').first() : $('body');
  const text = blockText($, main);
  const fields = extractLabeled(text);
  const place = resolvePlace(fields.place);
  return {
    reference: fields.reference ?? null,
    title: fields.title ?? null,
    buyer: fields.buyer ?? null,
    procedure: 'Bon de commande',
    category: fields.category ? parseCategory(fields.category) : null,
    deadline: fields.deadline ? parseDate(fields.deadline) : null,
    place: fields.place ?? null,
    city: place.city || null,
    region: place.region,
    estimate: fields.estimate ? parseAmount(fields.estimate) : null,
    deposit: null,
    siteVisit: null,
    lotsCount: null,
    qualifications: [],
    dceSizeKb: null,
    cancelled: isCancelled(text),
  };
}
