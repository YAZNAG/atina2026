/** Tableau de bord, reporting et exports (Excel, PDF, comptabilité). */
const router = require('express').Router();
const prisma = require('../../lib/prisma');
const { asyncHandler, ok } = require('../../lib/http');
const { autoriser } = require('../../middlewares/auth');
const { classeur, envoyerExcel, envoyerPdf } = require('../../lib/excel');
const { creerPdf, section, tableau } = require('../../lib/pdf');
const { mad, date, LIBELLES, nomComplet } = require('../../lib/format');
const { tousLesParametres } = require('../../lib/parametres');
const { round2, num } = require('../../domain/montants');
const { audit } = require('../../lib/audit');
const { filtreVisibilite } = require('../missions/service');
const { SELECT_COUT, coutMission, budgetsAvecSituation, filtreBudgets } = require('../budgets/service');

const budgetsVisibles = async (user, annee) => budgetsAvecSituation({ AND: [{ annee }, await filtreBudgets(user)] });

const MOIS = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];

/** Missions de l'année (selon le périmètre de l'utilisateur) avec leur coût. */
async function donnees(user, query) {
  const annee = Number(query.annee) || new Date().getFullYear();
  const where = {
    AND: [
      await filtreVisibilite(user),
      { dateDepart: { gte: new Date(annee, 0, 1), lt: new Date(annee + 1, 0, 1) } },
      query.serviceId ? { serviceId: Number(query.serviceId) } : {},
    ],
  };
  const missions = await prisma.mission.findMany({
    where,
    select: {
      ...SELECT_COUT,
      dateRetour: true,
      demandeurId: true,
      service: { select: { id: true, nom: true } },
      destination: { select: { id: true, ville: true, pays: true } },
      participants: { select: { userId: true, user: { select: { id: true, nom: true, prenom: true } } } },
    },
    orderBy: { dateDepart: 'asc' },
  });
  return { annee, missions: missions.map((m) => ({ ...m, cout: coutMission(m) })) };
}

const STATUTS_COMPTES = ['APPROUVE', 'EN_COURS', 'CLOTURE'];

function agreger(missions, cle, libelle) {
  const map = new Map();
  for (const m of missions.filter((x) => STATUTS_COMPTES.includes(x.statut))) {
    for (const [k, lib, part] of cle(m)) {
      const e = map.get(k) || { cle: k, libelle: lib, nb: 0, cout: 0 };
      e.nb += 1;
      e.cout = round2(e.cout + part);
      map.set(k, e);
    }
  }
  return [...map.values()].sort((a, b) => b.cout - a.cout).map((e) => ({ ...e, libelle: libelle ? libelle(e) : e.libelle }));
}

function indicateurs({ annee, missions }) {
  const comptees = missions.filter((m) => STATUTS_COMPTES.includes(m.statut));
  const parStatut = Object.fromEntries(Object.keys(LIBELLES.statutMission).map((s) => [s, 0]));
  missions.forEach((m) => (parStatut[m.statut] += 1));
  const coutTotal = round2(comptees.reduce((a, m) => a + m.cout.coutRetenu, 0));
  const maintenant = new Date();

  const parMois = MOIS.map((libelle, i) => {
    const duMois = comptees.filter((m) => new Date(m.dateDepart).getMonth() === i);
    return { mois: i + 1, libelle, nb: duMois.length, cout: round2(duMois.reduce((a, m) => a + m.cout.coutRetenu, 0)) };
  });
  const parService = agreger(missions, (m) => [[m.service.id, m.service.nom, m.cout.coutRetenu]]);
  const parDestination = agreger(missions, (m) => [[m.destination.id, `${m.destination.ville}${m.destination.pays !== 'Maroc' ? ` (${m.destination.pays})` : ''}`, m.cout.coutRetenu]]);
  // Coût par agent : coût de la mission réparti entre les participants.
  const parAgent = agreger(missions, (m) =>
    m.participants.map((p) => [p.userId, nomComplet(p.user), m.cout.coutRetenu / Math.max(1, m.participants.length)])
  ).map((e) => ({ ...e, cout: round2(e.cout) }));

  const resume = (m) => ({
    id: m.id,
    numero: m.numero,
    objet: m.objet,
    statut: m.statut,
    dateDepart: m.dateDepart,
    dateRetour: m.dateRetour,
    destination: m.destination.ville,
    participants: m.participants.map((p) => nomComplet(p.user)),
  });

  return {
    annee,
    kpis: {
      nbMissions: comptees.length,
      nbDemandes: missions.filter((m) => m.statut !== 'BROUILLON').length,
      coutTotal,
      coutMoyen: comptees.length ? round2(coutTotal / comptees.length) : 0,
      coutRealise: round2(comptees.reduce((a, m) => a + m.cout.coutReel, 0)),
      enCours: parStatut.EN_COURS,
      enAttente: parStatut.EN_ATTENTE,
      joursMission: round2(comptees.reduce((a, m) => a + Math.max(1, Math.ceil((new Date(m.dateRetour) - new Date(m.dateDepart)) / 86400000)), 0)),
    },
    parStatut,
    parMois,
    parService,
    parDestination: parDestination.slice(0, 10),
    parAgent: parAgent.slice(0, 10),
    missionsEnCours: missions.filter((m) => m.statut === 'EN_COURS').map(resume),
    missionsAVenir: missions
      .filter((m) => m.statut === 'APPROUVE' && new Date(m.dateDepart) >= maintenant)
      .slice(0, 10)
      .map(resume),
  };
}

router.get(
  '/tableau-de-bord',
  asyncHandler(async (req, res) => {
    const d = await donnees(req.user, req.query);
    const ind = indicateurs(d);
    const [notesAValider, notesARembourser, avancesOuvertes, mesNotesBrouillon, budgets] = await Promise.all([
      prisma.noteFrais.count({ where: { statut: 'SOUMISE' } }),
      req.user.permissions.includes('note:rembourser')
        ? prisma.noteFrais.aggregate({ where: { statut: 'VALIDEE' }, _sum: { montantARembourser: true }, _count: true })
        : null,
      req.user.permissions.includes('avance:gerer')
        ? prisma.avance.aggregate({ where: { statut: { in: ['DEMANDEE', 'VERSEE'] } }, _sum: { montant: true }, _count: true })
        : null,
      prisma.noteFrais.count({ where: { agentId: req.user.id, statut: { in: ['BROUILLON', 'REJETEE'] } } }),
      req.user.permissions.includes('budget:lire') ? budgetsVisibles(req.user, d.annee) : [],
    ]);
    ok(res, {
      ...ind,
      finances: {
        notesEnValidation: req.user.permissions.includes('note:controler') ? notesAValider : undefined,
        notesARembourser: notesARembourser ? { nb: notesARembourser._count, montant: num(notesARembourser._sum.montantARembourser) } : undefined,
        avancesOuvertes: avancesOuvertes ? { nb: avancesOuvertes._count, montant: num(avancesOuvertes._sum.montant) } : undefined,
        mesNotesAFinaliser: mesNotesBrouillon,
      },
      budgets: budgets.map((b) => ({ id: b.id, libelle: b.libelle, type: b.type, ...b.situation })),
    });
  })
);

router.get(
  '/export.xlsx',
  autoriser('reporting:lire'),
  asyncHandler(async (req, res) => {
    const d = await donnees(req.user, req.query);
    const ind = indicateurs(d);
    const budgets = req.user.permissions.includes('budget:lire') ? await budgetsVisibles(req.user, d.annee) : [];
    const buf = await classeur(
      [
        {
          nom: 'Missions',
          colonnes: [
            { header: 'N°', key: 'numero', width: 16 },
            { header: 'Objet', key: 'objet', width: 40 },
            { header: 'Service', key: 'service', width: 24 },
            { header: 'Destination', key: 'destination', width: 18 },
            { header: 'Départ', key: 'dateDepart', format: 'date', width: 12 },
            { header: 'Retour', key: 'dateRetour', format: 'date', width: 12 },
            { header: 'Participants', key: 'participants', width: 36 },
            { header: 'Statut', key: 'statut', width: 14 },
            { header: 'Coût estimé', key: 'coutEstime', format: 'mad', width: 16 },
            { header: 'Coût réel', key: 'coutReel', format: 'mad', width: 16 },
            { header: 'Coût retenu', key: 'coutRetenu', format: 'mad', width: 16 },
          ],
          lignes: d.missions.map((m) => ({
            numero: m.numero || `#${m.id}`,
            objet: m.objet,
            service: m.service.nom,
            destination: m.destination.ville,
            dateDepart: m.dateDepart,
            dateRetour: m.dateRetour,
            participants: m.participants.map((p) => nomComplet(p.user)).join(', '),
            statut: LIBELLES.statutMission[m.statut],
            coutEstime: m.cout.coutEstime,
            coutReel: m.cout.coutReel,
            coutRetenu: m.cout.coutRetenu,
          })),
        },
        {
          nom: 'Par service',
          colonnes: [
            { header: 'Service', key: 'libelle', width: 30 },
            { header: 'Missions', key: 'nb', format: 'nombre' },
            { header: 'Coût', key: 'cout', format: 'mad' },
          ],
          lignes: ind.parService,
        },
        {
          nom: 'Par agent',
          colonnes: [
            { header: 'Agent', key: 'libelle', width: 30 },
            { header: 'Missions', key: 'nb', format: 'nombre' },
            { header: 'Coût', key: 'cout', format: 'mad' },
          ],
          lignes: agreger(d.missions, (m) => m.participants.map((p) => [p.userId, nomComplet(p.user), m.cout.coutRetenu / Math.max(1, m.participants.length)])),
        },
        {
          nom: 'Par destination',
          colonnes: [
            { header: 'Destination', key: 'libelle', width: 30 },
            { header: 'Missions', key: 'nb', format: 'nombre' },
            { header: 'Coût', key: 'cout', format: 'mad' },
          ],
          lignes: agreger(d.missions, (m) => [[m.destination.id, m.destination.ville, m.cout.coutRetenu]]),
        },
        {
          nom: 'Budgets',
          colonnes: [
            { header: 'Budget', key: 'libelle', width: 30 },
            { header: 'Montant', key: 'montant', format: 'mad' },
            { header: 'Prévisionnel', key: 'previsionnel', format: 'mad' },
            { header: 'Engagé', key: 'engage', format: 'mad' },
            { header: 'Réalisé', key: 'realise', format: 'mad' },
            { header: 'Consommé', key: 'consomme', format: 'mad' },
            { header: 'Disponible', key: 'disponible', format: 'mad' },
            { header: 'Taux (%)', key: 'tauxConsommation', format: 'nombre' },
          ],
          lignes: budgets.map((b) => ({ libelle: b.libelle, ...b.situation })),
        },
      ],
      { titre: `Déplacements professionnels — ${d.annee}` }
    );
    await audit({ req, action: 'EXPORT_EXCEL', entite: 'Reporting' });
    envoyerExcel(res, buf, `reporting-deplacements-${d.annee}.xlsx`);
  })
);

router.get(
  '/export.pdf',
  autoriser('reporting:lire'),
  asyncHandler(async (req, res) => {
    const d = await donnees(req.user, req.query);
    const ind = indicateurs(d);
    const { doc, largeur, fin } = await creerPdf({
      titre: 'RAPPORT DES DÉPLACEMENTS PROFESSIONNELS',
      sousTitre: `Exercice ${d.annee} — édité le ${date(new Date())}`,
    });
    section(doc, 'Indicateurs clés');
    tableau(
      doc,
      [
        { label: 'Indicateur', width: 3 },
        { label: 'Valeur', width: 1.5, align: 'right' },
      ],
      [
        ['Missions approuvées / réalisées', String(ind.kpis.nbMissions)],
        ['Missions en attente de validation', String(ind.kpis.enAttente)],
        ['Missions en cours', String(ind.kpis.enCours)],
        ['Coût total retenu', mad(ind.kpis.coutTotal)],
        ['Dépenses réalisées', mad(ind.kpis.coutRealise)],
        ['Coût moyen par mission', mad(ind.kpis.coutMoyen)],
      ],
      largeur
    );
    const bloc = (titre, lignes) => {
      section(doc, titre);
      tableau(
        doc,
        [
          { label: 'Libellé', width: 3 },
          { label: 'Missions', width: 1, align: 'right' },
          { label: 'Coût', width: 1.5, align: 'right' },
        ],
        lignes.map((l) => [l.libelle, String(l.nb), mad(l.cout)]),
        largeur
      );
    };
    bloc('Par service', ind.parService);
    bloc('Par destination (10 premières)', ind.parDestination);
    bloc('Par agent (10 premiers)', ind.parAgent);
    section(doc, 'Évolution mensuelle');
    tableau(
      doc,
      [
        { label: 'Mois', width: 2 },
        { label: 'Missions', width: 1, align: 'right' },
        { label: 'Coût', width: 1.5, align: 'right' },
      ],
      ind.parMois.map((m) => [m.libelle, String(m.nb), mad(m.cout)]),
      largeur
    );
    if (req.user.permissions.includes('budget:lire')) {
      const budgets = await budgetsVisibles(req.user, d.annee);
      if (budgets.length) {
        section(doc, 'Exécution budgétaire');
        tableau(
          doc,
          [
            { label: 'Budget', width: 2.4 },
            { label: 'Montant', width: 1.3, align: 'right' },
            { label: 'Consommé', width: 1.3, align: 'right' },
            { label: 'Disponible', width: 1.3, align: 'right' },
            { label: 'Taux', width: 0.7, align: 'right' },
          ],
          budgets.map((b) => [b.libelle, mad(b.situation.montant), mad(b.situation.consomme), mad(b.situation.disponible), `${b.situation.tauxConsommation} %`]),
          largeur
        );
      }
    }
    await audit({ req, action: 'EXPORT_PDF', entite: 'Reporting' });
    envoyerPdf(res, await fin(), `rapport-deplacements-${d.annee}.pdf`);
  })
);

/**
 * Export comptable des notes remboursées sur une période :
 * débit des comptes de charges par catégorie, crédit du compte de tiers (net) et du compte d'avances.
 */
router.get(
  '/export-comptable',
  autoriser('export:comptable'),
  asyncHandler(async (req, res) => {
    const params = await tousLesParametres();
    const cpt = params.comptabilite;
    const du = req.query.du ? new Date(req.query.du) : new Date(new Date().getFullYear(), 0, 1);
    const au = req.query.au ? new Date(`${req.query.au}T23:59:59`) : new Date();
    const notes = await prisma.noteFrais.findMany({
      where: { statut: 'REMBOURSEE', rembourseeLe: { gte: du, lte: au } },
      include: { agent: true, mission: { select: { numero: true } }, lignes: true },
      orderBy: { rembourseeLe: 'asc' },
    });
    const ecritures = [];
    for (const n of notes) {
      const base = { date: n.rembourseeLe, journal: cpt.journal, piece: n.numero, libelle: `Frais mission ${n.mission.numero} — ${nomComplet(n.agent)}` };
      const parCategorie = new Map();
      for (const l of n.lignes) parCategorie.set(l.categorie, round2((parCategorie.get(l.categorie) || 0) + num(l.montantRetenu)));
      for (const [cat, montant] of parCategorie) {
        if (montant > 0) ecritures.push({ ...base, compte: cpt.comptes[cat] || cpt.comptes.DIVERS, libelle: `${base.libelle} — ${LIBELLES.categorieFrais[cat]}`, debit: montant, credit: 0 });
      }
      if (num(n.totalIndemnites) > 0) ecritures.push({ ...base, compte: cpt.comptes.INDEMNITES, libelle: `${base.libelle} — indemnités`, debit: num(n.totalIndemnites), credit: 0 });
      if (num(n.avanceDeduite) > 0) ecritures.push({ ...base, compte: '3431', libelle: `${base.libelle} — avance régularisée`, debit: 0, credit: num(n.avanceDeduite) });
      const net = num(n.montantARembourser);
      if (net > 0) ecritures.push({ ...base, compte: cpt.compteCredit, debit: 0, credit: net });
      if (net < 0) ecritures.push({ ...base, compte: cpt.compteCredit, libelle: `${base.libelle} — trop-perçu à reverser`, debit: -net, credit: 0 });
    }
    await audit({ req, action: 'EXPORT_COMPTABLE', entite: 'Reporting', apres: { du, au, notes: notes.length } });
    const nom = `export-comptable-${date(du).replace(/\//g, '-')}_${date(au).replace(/\//g, '-')}`;
    if (req.query.format === 'csv') {
      const csv = [
        'Date;Journal;Pièce;Compte;Libellé;Débit;Crédit',
        ...ecritures.map((e) =>
          [date(e.date), e.journal, e.piece, e.compte, `"${e.libelle.replace(/"/g, '""')}"`, e.debit.toFixed(2).replace('.', ','), e.credit.toFixed(2).replace('.', ',')].join(';')
        ),
      ].join('\r\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${nom}.csv"`);
      return res.send('﻿' + csv);
    }
    const buf = await classeur(
      [
        {
          nom: 'Écritures',
          colonnes: [
            { header: 'Date', key: 'date', format: 'date', width: 12 },
            { header: 'Journal', key: 'journal', width: 8 },
            { header: 'Pièce', key: 'piece', width: 16 },
            { header: 'Compte', key: 'compte', width: 10 },
            { header: 'Libellé', key: 'libelle', width: 60 },
            { header: 'Débit', key: 'debit', format: 'mad', width: 16 },
            { header: 'Crédit', key: 'credit', format: 'mad', width: 16 },
          ],
          lignes: ecritures,
        },
      ],
      { titre: `Export comptable du ${date(du)} au ${date(au)}` }
    );
    envoyerExcel(res, buf, `${nom}.xlsx`);
  })
);

module.exports = router;
module.exports.indicateurs = indicateurs;
