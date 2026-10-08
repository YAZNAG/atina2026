const prisma = require('../../lib/prisma');
const { badRequest, forbidden, notFound, conflict } = require('../../lib/errors');
const { audit } = require('../../lib/audit');
const { notifier } = require('../../lib/notifier');
const { prochainNumero } = require('../../lib/numerotation');
const { tousLesParametres } = require('../../lib/parametres');
const { chargerReferentielValidation, contexte, circuitApplicable, perimetreServices, validateursEtapeCourante } = require('../../lib/contexte');
const { calculerIndemnites, selectionnerBareme, nuitees } = require('../../domain/indemnites');
const { calculerNoteFrais, trouverPlafond } = require('../../domain/notesFrais');
const { TRANSITIONS_NOTE, assertTransition, prochaineEtape, appliquerDecision } = require('../../domain/workflow');
const { num } = require('../../domain/montants');
const { LIBELLES } = require('../../lib/format');
const missions = require('../missions/service');

const USER_MIN = { select: { id: true, nom: true, prenom: true, matricule: true, email: true, serviceId: true, categorieId: true } };

const INCLUDE_LISTE = {
  agent: USER_MIN,
  mission: { select: { id: true, numero: true, objet: true, dateDepart: true, dateRetour: true, statut: true, serviceId: true, destination: { select: { ville: true } } } },
};

const INCLUDE_DETAIL = {
  ...INCLUDE_LISTE,
  lignes: { orderBy: [{ date: 'asc' }, { id: 'asc' }], include: { document: { select: { id: true, nomOriginal: true, mimeType: true } } } },
  circuit: { include: { etapes: { orderBy: { ordre: 'asc' } } } },
  validations: { orderBy: { createdAt: 'asc' }, include: { validateur: { select: { id: true, nom: true, prenom: true } } } },
  avances: true,
};

/** Notes visibles : les siennes, puis — une fois soumises — celles du périmètre de l'utilisateur. */
async function filtreVisibilite(user) {
  const soumises = { statut: { not: 'BROUILLON' } };
  if (user.permissions.includes('mission:lire_tout') || (user.permissions.includes('mission:lire_perimetre') && user.perimetreGlobal)) {
    return { OR: [{ agentId: user.id }, soumises] };
  }
  const autres = [{ validations: { some: { validateurId: user.id } } }];
  if (user.permissions.includes('mission:lire_perimetre')) {
    const services = await perimetreServices(user.id);
    if (services.length) autres.push({ mission: { serviceId: { in: services } } });
  }
  return { OR: [{ agentId: user.id }, { AND: [soumises, { OR: autres }] }] };
}

async function charger(id, include = INCLUDE_DETAIL) {
  const n = await prisma.noteFrais.findUnique({ where: { id: Number(id) }, include });
  if (!n) throw notFound('Note de frais introuvable');
  return n;
}

async function verifierLecture(user, note) {
  const visible = await prisma.noteFrais.count({ where: { AND: [{ id: note.id }, await filtreVisibilite(user)] } });
  if (visible) return;
  if (note.statut === 'SOUMISE') {
    const ref = await chargerReferentielValidation();
    if (validateursEtapeCourante(note, ref, note.agent).includes(user.id)) return;
  }
  throw forbidden('Vous n’avez pas accès à cette note de frais');
}

/** Données de calcul : barème de l'agent, plafonds, nuits à sa charge, avances versées. */
async function donneesCalcul(note) {
  const mission = await prisma.mission.findUnique({
    where: { id: note.missionId },
    include: { destination: true, reservations: true },
  });
  const agent = await prisma.user.findUnique({ where: { id: note.agentId }, select: { categorieId: true } });
  const [baremes, plafonds, avances, params] = await Promise.all([
    prisma.bareme.findMany({ where: { zoneId: mission.destination.zoneId } }),
    prisma.plafondFrais.findMany(),
    prisma.avance.findMany({
      where: {
        missionId: note.missionId,
        agentId: note.agentId,
        OR: [{ statut: 'VERSEE' }, { statut: 'REGULARISEE', noteFraisId: note.id }],
      },
    }),
    tousLesParametres(),
  ]);
  const bareme = agent.categorieId
    ? selectionnerBareme(baremes, { zoneId: mission.destination.zoneId, categorieId: agent.categorieId, date: mission.dateDepart })
    : null;
  const nuits = nuitees(mission.dateDepart, mission.dateRetour);
  const nuitsPayeesChambre = mission.reservations
    .filter((r) => r.type === 'HEBERGEMENT' && r.payePar === 'CHAMBRE' && (!r.beneficiaireId || r.beneficiaireId === note.agentId))
    .reduce((a, r) => a + r.nbNuits, 0);
  const nuitsRemboursables = mission.hebergementPrisEnCharge ? 0 : Math.max(0, nuits - nuitsPayeesChambre);
  const indemnites = bareme
    ? calculerIndemnites({
        dateDepart: mission.dateDepart,
        dateRetour: mission.dateRetour,
        bareme,
        nbRepasFournis: mission.nbRepasFournis,
        regles: params.regles_indemnites,
      })
    : { jours: 0, tauxJournalier: 0, montant: 0 };
  return {
    mission,
    bareme,
    plafonds,
    categorieAgentId: agent.categorieId,
    nuitsRemboursables,
    indemnites,
    avance: avances.reduce((a, x) => a + num(x.montant), 0),
  };
}

/** Recalcule montants retenus, indemnités et solde, et les enregistre. */
async function recalculer(noteId, client = prisma) {
  const note = await client.noteFrais.findUnique({ where: { id: noteId }, include: { lignes: true } });
  const d = await donneesCalcul(note);
  const calc = calculerNoteFrais({
    lignes: note.lignes,
    plafonds: d.plafonds,
    categorieAgentId: d.categorieAgentId,
    plafondNuitee: d.bareme ? num(d.bareme.plafondNuitee) : 0,
    nuitsRemboursables: d.nuitsRemboursables,
    indemnites: d.indemnites.montant,
    avance: d.avance,
  });
  for (const l of calc.lignes) {
    const orig = note.lignes.find((x) => x.id === l.id);
    if (num(orig.montantRetenu) !== l.montantRetenu || orig.depassementPlafond !== l.depassementPlafond) {
      await client.ligneFrais.update({ where: { id: l.id }, data: { montantRetenu: l.montantRetenu, depassementPlafond: l.depassementPlafond } });
    }
  }
  return client.noteFrais.update({
    where: { id: noteId },
    data: {
      joursIndemnises: d.indemnites.jours,
      tauxJournalier: d.indemnites.tauxJournalier,
      totalIndemnites: calc.totalIndemnites,
      totalDepenses: calc.totalDepenses,
      totalRetenu: calc.totalRetenu,
      avanceDeduite: calc.avanceDeduite,
      montantARembourser: calc.montantARembourser,
    },
  });
}

async function creer(user, missionId, req) {
  const m = await missions.chargerMission(missionId);
  if (!m.participants.some((p) => p.userId === user.id)) throw forbidden('Vous ne participez pas à cette mission');
  if (!['APPROUVE', 'EN_COURS', 'CLOTURE'].includes(m.statut)) throw badRequest('La mission doit être approuvée pour saisir des frais');
  const existante = await prisma.noteFrais.findUnique({ where: { missionId_agentId: { missionId: m.id, agentId: user.id } } });
  if (existante) throw conflict('Une note de frais existe déjà pour cette mission', { id: existante.id });
  const n = await prisma.noteFrais.create({ data: { missionId: m.id, agentId: user.id } });
  const calc = await recalculer(n.id);
  await audit({ req, action: 'CREATION', entite: 'NoteFrais', entiteId: n.id, apres: calc });
  return calc;
}

async function noteModifiable(user, id) {
  const n = await charger(id, { lignes: true });
  if (n.agentId !== user.id) throw forbidden('Seul l’agent peut modifier sa note de frais');
  if (n.statut !== 'BROUILLON') throw conflict('La note n’est plus modifiable (déjà soumise)');
  return n;
}

async function verifierDocument(documentId, user) {
  if (!documentId) return;
  const d = await prisma.document.findUnique({ where: { id: documentId }, include: { ligne: true } });
  if (!d || d.uploadedById !== user.id) throw badRequest('Justificatif invalide');
}

async function ajouterLigne(user, id, data, req) {
  const n = await noteModifiable(user, id);
  await verifierDocument(data.documentId, user);
  const l = await prisma.ligneFrais.create({ data: { ...data, noteFraisId: n.id } });
  await recalculer(n.id);
  await audit({ req, action: 'AJOUT_LIGNE', entite: 'NoteFrais', entiteId: n.id, apres: l });
  return prisma.ligneFrais.findUnique({ where: { id: l.id } });
}

async function modifierLigne(user, id, ligneId, data, req) {
  const n = await noteModifiable(user, id);
  const avant = n.lignes.find((l) => l.id === Number(ligneId));
  if (!avant) throw notFound('Ligne introuvable');
  await verifierDocument(data.documentId, user);
  const l = await prisma.ligneFrais.update({ where: { id: avant.id }, data });
  await recalculer(n.id);
  await audit({ req, action: 'MODIFICATION_LIGNE', entite: 'NoteFrais', entiteId: n.id, avant, apres: l });
  return prisma.ligneFrais.findUnique({ where: { id: l.id } });
}

async function supprimerLigne(user, id, ligneId, req) {
  const n = await noteModifiable(user, id);
  const avant = n.lignes.find((l) => l.id === Number(ligneId));
  if (!avant) throw notFound('Ligne introuvable');
  await prisma.ligneFrais.delete({ where: { id: avant.id } });
  await recalculer(n.id);
  await audit({ req, action: 'SUPPRESSION_LIGNE', entite: 'NoteFrais', entiteId: n.id, avant });
}

const lien = (n) => `/notes-frais/${n.id}`;

async function enregistrerSauts(tx, note, sautees) {
  for (const e of sautees) {
    await tx.validation.create({
      data: {
        objetType: 'NOTE_FRAIS',
        noteFraisId: note.id,
        etapeOrdre: e.ordre,
        etapeLibelle: e.libelle,
        decision: 'SAUTE',
        commentaire: 'Étape sans validateur éligible — passée automatiquement',
      },
    });
  }
}

async function notifierFinanciers(titre, message, lienNote) {
  const fin = await prisma.user.findMany({ where: { role: 'FINANCIER', actif: true }, select: { id: true } });
  await notifier(fin.map((u) => u.id), { titre, message, lien: lienNote });
}

async function soumettre(user, id, req) {
  const n = await charger(id);
  if (n.agentId !== user.id) throw forbidden('Seul l’agent peut soumettre sa note de frais');
  assertTransition(TRANSITIONS_NOTE, n.statut, 'SOUMISE');
  if (['ANNULE', 'REFUSE'].includes(n.mission.statut)) throw badRequest('La mission a été annulée ou refusée');

  const plafonds = await prisma.plafondFrais.findMany();
  const agent = await prisma.user.findUnique({ where: { id: n.agentId } });
  const manquants = n.lignes.filter((l) => {
    const p = trouverPlafond(plafonds, l.categorie, agent.categorieId);
    return (p ? p.justificatifObligatoire : true) && !l.documentId;
  });
  if (manquants.length) {
    throw badRequest(
      'Justificatifs manquants',
      manquants.map((l) => ({ ligneId: l.id, message: `${LIBELLES.categorieFrais[l.categorie]} du ${new Date(l.date).toLocaleDateString('fr-MA')}` }))
    );
  }

  const calc = await recalculer(n.id);
  const circuit = await circuitApplicable('NOTE_FRAIS', n.agent.serviceId);
  if (!circuit || !circuit.etapes.length) throw badRequest('Aucun circuit de validation des notes de frais n’est configuré');
  const ref = await chargerReferentielValidation();
  const suite = prochaineEtape(circuit.etapes, null, contexte(ref, n.agent), calc.montantARembourser);
  const numero = n.numero || (await prochainNumero('NF'));

  const maj = await prisma.$transaction(async (tx) => {
    await enregistrerSauts(tx, n, suite.sautees);
    return tx.noteFrais.update({
      where: { id: n.id },
      data: {
        numero,
        circuitId: circuit.id,
        statut: suite.etape ? 'SOUMISE' : 'VALIDEE',
        etapeCourante: suite.etape ? suite.etape.ordre : null,
        soumiseLe: new Date(),
        valideeLe: suite.etape ? null : new Date(),
        motifRejet: null,
      },
    });
  });
  await audit({ req, action: 'SOUMISSION', entite: 'NoteFrais', entiteId: n.id, avant: n, apres: maj });
  if (suite.etape) {
    await notifier(suite.validateurs, {
      titre: `Note de frais ${numero} à valider`,
      message: `${n.agent.prenom} ${n.agent.nom} a soumis sa note de frais pour la mission « ${n.mission.objet} » (${calc.montantARembourser.toFixed(2)} MAD).`,
      lien: lien(n),
    });
  } else {
    await notifierFinanciers(`Note de frais ${numero} à rembourser`, `Note validée de ${n.agent.prenom} ${n.agent.nom}.`, lien(n));
  }
  return maj;
}

async function decider(user, id, { decision, commentaire }, req) {
  const n = await charger(id);
  if (n.statut !== 'SOUMISE') throw conflict('Cette note n’est pas en cours de validation');
  const ref = await chargerReferentielValidation();
  if (!validateursEtapeCourante(n, ref, n.agent).includes(user.id)) throw forbidden('Vous n’êtes pas validateur de l’étape en cours');
  if (decision === 'REFUSE' && !commentaire?.trim()) throw badRequest('Le motif du rejet est obligatoire');

  const etape = n.circuit.etapes.find((e) => e.ordre === n.etapeCourante);
  const res = appliquerDecision({
    etapes: n.circuit.etapes,
    ordreCourant: n.etapeCourante,
    decision,
    ctx: contexte(ref, n.agent),
    montant: n.montantARembourser,
  });
  const maj = await prisma.$transaction(async (tx) => {
    await tx.validation.create({
      data: {
        objetType: 'NOTE_FRAIS',
        noteFraisId: n.id,
        etapeOrdre: etape.ordre,
        etapeLibelle: etape.libelle,
        validateurId: user.id,
        decision,
        commentaire: commentaire || null,
      },
    });
    await enregistrerSauts(tx, n, res.sautees);
    const data =
      res.statut === 'REFUSE'
        ? { statut: 'REJETEE', etapeCourante: null, motifRejet: commentaire }
        : res.statut === 'APPROUVE'
          ? { statut: 'VALIDEE', etapeCourante: null, valideeLe: new Date() }
          : { etapeCourante: res.etapeSuivante.ordre };
    return tx.noteFrais.update({ where: { id: n.id }, data });
  });
  await audit({ req, action: decision === 'REFUSE' ? 'REJET' : 'VALIDATION', entite: 'NoteFrais', entiteId: n.id, avant: n, apres: maj });

  if (res.statut === 'REFUSE') {
    await notifier([n.agentId], {
      titre: `Note de frais ${n.numero} rejetée`,
      message: `Votre note de frais a été rejetée par ${user.prenom} ${user.nom}.\nMotif : ${commentaire}\nVous pouvez la corriger et la soumettre à nouveau.`,
      lien: lien(n),
    });
  } else if (res.statut === 'APPROUVE') {
    await notifier([n.agentId], {
      titre: `Note de frais ${n.numero} validée`,
      message: `Votre note de frais est validée. Montant à rembourser : ${num(maj.montantARembourser).toFixed(2)} MAD.`,
      lien: lien(n),
    });
    await notifierFinanciers(`Note de frais ${n.numero} à rembourser`, `Note validée de ${n.agent.prenom} ${n.agent.nom}.`, lien(n));
  } else {
    await notifier(res.validateurs, {
      titre: `Note de frais ${n.numero} à valider`,
      message: `La note de frais de ${n.agent.prenom} ${n.agent.nom} attend votre validation (${res.etapeSuivante.libelle}).`,
      lien: lien(n),
    });
  }
  return maj;
}

/** Contrôle des justificatifs par le service financier, ligne par ligne. */
async function controlerLigne(user, id, ligneId, { statutControle, commentaireControle }, req) {
  const n = await charger(id, { lignes: true });
  if (!['SOUMISE', 'VALIDEE'].includes(n.statut)) throw conflict('Contrôle possible uniquement sur une note soumise ou validée');
  const avant = n.lignes.find((l) => l.id === Number(ligneId));
  if (!avant) throw notFound('Ligne introuvable');
  if (statutControle === 'NON_CONFORME' && !commentaireControle?.trim()) throw badRequest('Motif de non-conformité requis');
  const l = await prisma.ligneFrais.update({ where: { id: avant.id }, data: { statutControle, commentaireControle: commentaireControle || null } });
  const note = await recalculer(n.id);
  await audit({ req, action: 'CONTROLE_LIGNE', entite: 'NoteFrais', entiteId: n.id, avant, apres: l });
  return note;
}

async function rembourser(user, id, { modePaiement, referencePaiement, date }, req) {
  const n = await charger(id);
  assertTransition(TRANSITIONS_NOTE, n.statut, 'REMBOURSEE');
  if (n.lignes.some((l) => l.statutControle === 'EN_ATTENTE')) throw badRequest('Toutes les lignes doivent être contrôlées avant remboursement');
  const recalc = await recalculer(n.id);
  const quand = date ? new Date(date) : new Date();
  const maj = await prisma.$transaction(async (tx) => {
    // Régularisation des avances versées pour cette mission.
    await tx.avance.updateMany({
      where: { missionId: n.missionId, agentId: n.agentId, statut: 'VERSEE' },
      data: { statut: 'REGULARISEE', noteFraisId: n.id, regulariseeLe: quand, soldeRegularisation: recalc.montantARembourser },
    });
    return tx.noteFrais.update({
      where: { id: n.id },
      data: { statut: 'REMBOURSEE', rembourseeLe: quand, modePaiement, referencePaiement },
    });
  });
  await audit({ req, action: 'REMBOURSEMENT', entite: 'NoteFrais', entiteId: n.id, avant: n, apres: maj });
  const solde = num(maj.montantARembourser);
  await notifier([n.agentId], {
    titre: `Note de frais ${n.numero} ${solde >= 0 ? 'remboursée' : 'régularisée'}`,
    message:
      solde >= 0
        ? `Le remboursement de ${solde.toFixed(2)} MAD a été effectué (${modePaiement}${referencePaiement ? `, réf. ${referencePaiement}` : ''}).`
        : `Le reversement du trop-perçu de ${(-solde).toFixed(2)} MAD a été enregistré.`,
    lien: lien(n),
  });
  const m = await prisma.mission.findUnique({ where: { id: n.missionId } });
  await missions.alerterBudget(m);
  return maj;
}

async function reviser(user, id, req) {
  const n = await charger(id, {});
  if (n.agentId !== user.id) throw forbidden();
  assertTransition(TRANSITIONS_NOTE, n.statut, 'BROUILLON');
  const maj = await prisma.noteFrais.update({ where: { id: n.id }, data: { statut: 'BROUILLON', etapeCourante: null } });
  await prisma.ligneFrais.updateMany({ where: { noteFraisId: n.id }, data: { statutControle: 'EN_ATTENTE' } });
  await recalculer(n.id);
  await audit({ req, action: 'REVISION', entite: 'NoteFrais', entiteId: n.id, avant: n, apres: maj });
  return maj;
}

module.exports = {
  INCLUDE_LISTE,
  INCLUDE_DETAIL,
  filtreVisibilite,
  charger,
  verifierLecture,
  recalculer,
  donneesCalcul,
  creer,
  ajouterLigne,
  modifierLigne,
  supprimerLigne,
  soumettre,
  decider,
  controlerLigne,
  rembourser,
  reviser,
};
