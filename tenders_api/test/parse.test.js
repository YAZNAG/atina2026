import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  clean,
  formFields,
  isSearchForm,
  parseAmount,
  parseDate,
  parseDetail,
  parseList,
  parseSizeKb,
} from '../src/pmmp/parse.js';
import { resolvePlace } from '../src/pmmp/places.js';

const page = (name) => readFileSync(new URL(`fixtures/${name}.html`, import.meta.url), 'utf8');

test('liste réelle : compteurs et dix lignes complètes', () => {
  const l = parseList(page('liste'));
  assert.equal(l.total, 100624);
  assert.equal(l.pageCount, 10063);
  assert.equal(l.page, 1);
  assert.equal(l.rows.length, 10);
  for (const r of l.rows) {
    assert.match(r.refConsultation, /^\d+$/);
    assert.ok(r.orgAcronyme && r.reference && r.title && r.buyer, JSON.stringify(r));
    assert.ok(['travaux', 'services', 'fournitures'].includes(r.category));
    assert.match(r.deadline, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+0[01]:00$/);
    assert.match(r.publishedAt, /^\d{4}-\d{2}-\d{2}T00:00:00/);
    assert.ok(!r.title.startsWith('Objet'), r.title);
    assert.ok(!r.buyer.startsWith('Acheteur'), r.buyer);
  }
});

test('liste réelle : première ligne lue champ par champ', () => {
  const [r] = parseList(page('liste')).rows;
  assert.equal(r.refConsultation, '1041301');
  assert.equal(r.orgAcronyme, 'o8p');
  assert.equal(r.reference, 'SK04/2026/CFR');
  assert.equal(r.procedure, "Appel d'offres ouvert");
  assert.equal(r.category, 'travaux');
  assert.equal(r.publishedAt, '2026-09-20T00:00:00+01:00');
  assert.equal(r.deadline, '2026-11-20T13:00:00+01:00');
  assert.equal(r.city, 'Sidi Kacem');
  assert.equal(r.region, 'Rabat-Salé-Kénitra');
  assert.match(r.buyer, /^LE DIRECTEUR PROVINCIAL DE L'EQUIPEMENT/);
  // L'objet complet (info-bulle), pas la version tronquée.
  assert.match(r.title, /Lot unique -Province de Sidi Kacem-$/);
});

test('liste réelle : tri par date limite décroissante', () => {
  const ds = parseList(page('liste')).rows.map((r) => Date.parse(r.deadline));
  assert.deepEqual([...ds].sort((a, b) => b - a), ds);
});

test('fiche réelle : estimation, caution, taille du dossier', () => {
  const d = parseDetail(page('detail_o8p_1041301'));
  assert.equal(d.reference, 'SK04/2026/CFR');
  assert.equal(d.category, 'travaux');
  assert.equal(d.estimate, 21446884.14);
  assert.equal(d.deposit, 428000);
  assert.equal(d.deadline, '2026-11-20T13:00:00+01:00');
  assert.equal(d.region, 'Rabat-Salé-Kénitra');
  assert.equal(d.dceSizeKb, 690);
  assert.equal(d.siteVisit, null);
  assert.ok(d.qualifications.length >= 3);
  assert.match(d.qualifications[0], /^Equipement \/ B- Travaux routiers/);
});

test('fiche réelle : visite des lieux et gros dossier', () => {
  const d = parseDetail(page('detail_g3h_1034700'));
  assert.equal(d.estimate, 48516000);
  assert.equal(d.deposit, 752000);
  assert.equal(d.siteVisit, '2026-10-20T10:00:00+01:00');
  assert.equal(d.city, 'Fahs-Anjra');
  assert.equal(d.region, 'Tanger-Tétouan-Al Hoceïma');
  assert.equal(d.dceSizeKb, Math.round(140.69 * 1024));
});

test('fiche réelle allotie : nombre de lots, pas de montant global', () => {
  const d = parseDetail(page('detail_q9t_1038578'));
  assert.equal(d.lotsCount, 3);
  assert.equal(d.estimate, null);
  assert.equal(d.deposit, null);
  assert.equal(d.region, 'Dakhla-Oued Ed-Dahab');
});

test('formulaire PRADO : état de page et taille de page', () => {
  const f = formFields(page('liste'));
  assert.ok(f.PRADO_PAGESTATE.length > 1000);
  assert.equal(f['ctl0$CONTENU_PAGE$resultSearch$listePageSizeTop'], '10');
  assert.equal(f['ctl0$CONTENU_PAGE$resultSearch$numPageTop'], '1');
  assert.ok(!Object.keys(f).some((k) => k.endsWith('$lancerRecherche')));
});

test('formulaire de recherche reconnu', () => {
  assert.equal(isSearchForm(page('formulaire')), true);
  assert.equal(isSearchForm(page('liste')), false);
  assert.ok(formFields(page('formulaire')).PRADO_PAGESTATE);
});

test('montants, tailles, dates', () => {
  assert.equal(parseAmount('428 000,00 MAD '), 428000);
  assert.equal(parseAmount('1 399 999,99'), 1399999.99);
  assert.equal(parseAmount('1.234.567,50'), 1234567.5);
  assert.equal(parseAmount('-'), null);
  assert.equal(parseAmount('0,00 MAD'), null);
  assert.equal(parseSizeKb('Dossier de consultation - 27,62 Ko'), 28);
  assert.equal(parseSizeKb('Dossier de consultation - 2,98 Mo'), 3052);
  assert.equal(parseSizeKb('-'), null);
  assert.equal(parseDate('05/11/2026 10:00'), '2026-11-05T10:00:00+01:00');
  assert.equal(parseDate('pas de date'), null);
  assert.equal(clean('  a  b\n c '), 'a b c');
});

test('heure de Casablanca pendant le ramadan (UTC+0)', () => {
  // Ramadan 2026 : environ du 18 février au 19 mars.
  assert.match(parseDate('01/03/2026 10:00'), /\+00:00$/);
  assert.match(parseDate('01/05/2026 10:00'), /\+01:00$/);
});

test('lieux : provinces, préfectures et inconnus', () => {
  assert.deepEqual(resolvePlace('TANGER-ASSILAH'), { city: 'Tanger-Assilah', region: 'Tanger-Tétouan-Al Hoceïma' });
  assert.deepEqual(resolvePlace('SALE'), { city: 'Salé', region: 'Rabat-Salé-Kénitra' });
  assert.deepEqual(resolvePlace('PREFECTURE DE CASABLANCA ANFA'), { city: 'Casablanca-Anfa', region: 'Casablanca-Settat' });
  assert.deepEqual(resolvePlace('BENI MELLAL, AZILAL'), { city: 'Béni Mellal', region: 'Béni Mellal-Khénifra' });
  assert.deepEqual(resolvePlace('EL KELAA DES SRAGHNA'), { city: 'El Kelâa des Sraghna', region: 'Marrakech-Safi' });
  assert.deepEqual(resolvePlace('TOUT LE ROYAUME'), { city: 'Tout Le Royaume', region: null });
  assert.deepEqual(resolvePlace('-'), { city: '', region: null });
});
