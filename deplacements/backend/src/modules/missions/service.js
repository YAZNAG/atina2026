const prisma = require('../../lib/prisma');
const { badRequest, forbidden, notFound, conflict } = require('../../lib/errors');
const { audit } = require('../../lib/audit');
const { notifier } = require('../../lib/notifier');
const { prochainNumero } = require('../../lib/numerotation');
const { tousLesParametres } = require('../../lib/parametres');
const {
  chargerReferentielValidation,
  contexte,
  circuitApplicable,
  perimetreServices,
  validateursEtapeCourante,
} = require('../../lib/contexte');
const { estimerCoutMission, selectionnerBareme } = require('../../domain/indemnites');
const { detecterConflits, STATUTS_ACTIFS } = require('../../domain/conflits');
const { TRANSITIONS_MISSION, assertTransition, prochaineEtape, appliquerDecision } = require('../../domain/workflow');
const { verifierDisponibilite } = require('../../domain/budget');
const { situationBudgetParId } = require('../budgets/service');

const USER_MIN = { select: { id: true, nom: true, prenom: true, matricule: true, email: true, categorieId: true, serviceId: true } };

const INCLUDE_LISTE = {
  destination: { include: { zone: true } },
  demandeur: USER_MIN,
  service: { select: { id: true, nom: true, code: true } },
  participants: { include: { user: USER_MIN } },
  vehicule: { select: { id: true, immatriculation: true, marque: true, modele: true } },
};

const INCLUDE_DETAIL = {
  ...INCLUDE_LISTE,
  projet: true,
  budget: { select: { id: true, libelle: true, annee: true } },
  circuit: { include: { etapes: { orderBy: { ordre: 'asc' }, include: { utilisateur: { select: { id: true, nom: true, prenom: true } } } } } },
  reservations: { orderBy: { dateDebut: 'asc' }, include: { document: { select: { id: true, nomOriginal: true } } } },
  validations: { orderBy: { createdAt: 'asc' }, include: { validateur: { select: { id: true, nom: true, prenom: true } } } },
  notesFrais: { select: { id: true, numero: true, agentId: true, statut: true, montantARembourser: true } },
  avances: { select: { id: true, numero: true, agentId: true, montant: true, statut: true } },
  documents: { select: { id: true, nomOriginal: true, mimeType: true, taille: true, categorie: true, createdAt: true } },
};

/**
 * Filtre Prisma des missions visibles par l'utilisateur. Un brouillon reste privé
 * (demandeur et participants) tant qu'il n'est pas soumis.
 */
async function filtreVisibilite(user) {
  const siennes = [{ demandeurId: user.id }, { participants: { some: { userId: user.id } } }];
  const soumises = { statut: { not: 'BROUILLON' } };
  if (user.permissions.includes('mission:lire_tout') || (user.permissions.includes('mission:lire_perimetre') && user.perimetreGlobal)) {
    return { OR: [...siennes, soumises] };
  }
  const autres = [{ validations: { some: { validateurId: user.id } } }];
  if (user.permissions.includes('mission:lire_perimetre')) {
    const services = await perimetreServices(user.id);
    if (services.length) autres.push({ serviceId: { in: services } });
  }
  return { OR: [...siennes, { AND: [soumises, { OR: autres }] }] };
}

/** Vérifie que l'utilisateur peut consulter la mission (y compris en tant que validateur de l'étape en cours). */
async function verifierLecture(user, mission) {
  const filtre = await filtreVisibilite(user);
  const visible = await prisma.mission.count({ where: { AND: [{ id: mission.id }, filtre] } });
  if (visible) return;
  if (mission.statut === 'EN_ATTENTE') {
    const ref = await chargerReferentielValidation();
    if (validateursEtapeCourante(mission, ref, mission.demandeur).includes(user.id)) return;
  }
  throw forbidden('Vous n’avez pas accès à cette mission');
}

async function chargerMission(id, include = INCLUDE_DETAIL) {
  const m = await prisma.mission.findUnique({ where: { id: Number(id) }, include });
  if (!m) throw notFound('Mission introuvable');
  return m;
}

/** Estimation des indemnités et du coût prévisionnel à partir du barème en vigueur. */
async function estimer({ destinationId, participantIds, dateDepart, dateRetour, nbRepasFournis = 0, fraisTransportEstimes = 0, autresFraisEstimes = 0 }) {
  const destination = await prisma.destination.findUnique({ where: { id: destinationId }, include: { zone: true } });
  if (!destination) throw badRequest('Destination inconnue');
  const [users, baremes, params] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: participantIds } }, select: { id: true, nom: true, prenom: true, categorieId: true } }),
    prisma.bareme.findMany({ where: { zoneId: destination.zoneId } }),
    tousLesParametres(),
  ]);
  const participants = users.map((u) => ({
    userId: u.id,
    bareme: u.categorieId ? selectionnerBareme(baremes, { zoneId: destination.zoneId, categorieId: u.categorieId, date: dateDepart }) : null,
  }));
  const estimation = estimerCoutMission({
    participants,
    dateDepart,
    dateRetour,
    nbRepasFournis,
    fraisTransportEstimes,
    autresFraisEstimes,
    regles: params.regles_indemnites,
  });
  const noms = new Map(users.map((u) => [u.id, `${u.prenom} ${u.nom}`]));
  estimation.detail = estimation.detail.map((d) => ({ ...d, nom: noms.get(d.userId) }));
  estimation.zone = destination.zone;
  return estimation;
}

/** Budget par défaut : service, sinon projet, sinon budget global de l'année. */
async function choisirBudget({ serviceId, projetId, dateDepart }) {
  const annee = new Date(dateDepart).getFullYear();
  if (projetId) {
    const b = await prisma.budget.findFirst({ where: { annee, type: 'PROJET', projetId } });
    if (b) return b.id;
  }
  const b =
    (await prisma.budget.findFirst({ where: { annee, type: 'SERVICE', serviceId } })) ||
    (await prisma.budget.findFirst({ where: { annee, type: 'GLOBAL' } }));
  return b?.id ?? null;
}

async function conflitsPour({ id, dateDepart, dateRetour, vehiculeId, participantIds }) {
  const autres = await prisma.mission.findMany({
    where: {
      statut: { in: STATUTS_ACTIFS },
      dateDepart: { lt: new Date(dateRetour) },
      dateRetour: { gt: new Date(dateDepart) },
      ...(id && { id: { not: id } }),
    },
    select: { id: true, numero: true, statut: true, dateDepart: true, dateRetour: true, vehiculeId: true, participants: { select: { userId: true } } },
  });
  return detecterConflits(
    { id, dateDepart, dateRetour, vehiculeId, participantIds },
    autres.map((m) => ({ ...m, participantIds: m.participants.map((p) => p.userId) }))
  );
}

function verifierDates(d) {
  if (new Date(d.dateRetour) <= new Date(d.dateDepart)) throw badRequest('La date de retour doit être postérieure à la date de départ');
  if (d.moyenTransport === 'VOITURE_SERVICE' && !d.vehiculeId) {
    // Le véhicule peut être affecté plus tard par le gestionnaire du parc ; pas d'erreur.
  }
}

/** Champs communs création/mise à jour, avec recalcul du coût estimé. */
async function preparer(data, demandeur, existant) {
  const fusion = { ...existant, ...data };
  verifierDates(fusion);
  const participantIds = data.participantIds ?? existant?.participants?.map((p) => p.userId) ?? [demandeur.id];
  if (!participantIds.length) throw badRequest('Au moins une personne doit être concernée par la mission');
  const estimation = await estimer({
    destinationId: fusion.destinationId,
    participantIds,
    dateDepart: fusion.dateDepart,
    dateRetour: fusion.dateRetour,
    nbRepasFournis: fusion.nbRepasFournis ?? 0,
    fraisTransportEstimes: fusion.fraisTransportEstimes ?? 0,
    autresFraisEstimes: fusion.autresFraisEstimes ?? 0,
  });
  const serviceId = existant?.serviceId ?? demandeur.serviceId;
  if (!serviceId) throw badRequest('Votre compte n’est rattaché à aucun service : contactez l’administrateur');
  const budgetId =
    data.budgetId !== undefined && data.budgetId !== null
      ? data.budgetId
      : existant?.budgetId ?? (await choisirBudget({ serviceId, projetId: fusion.projetId, dateDepart: fusion.dateDepart }));
  const { participantIds: _p, chefMissionId, ...champs } = data;
  return { champs: { ...champs, serviceId, budgetId, coutEstime: estimation.total }, participantIds, chefMissionId, estimation };
}

async function creer(user, data, req) {
  const { champs, participantIds, chefMissionId } = await preparer(data, user);
  const m = await prisma.mission.create({
    data: {
      ...champs,
      demandeurId: user.id,
      participants: {
        create: participantIds.map((uid) => ({ userId: uid, chefMission: chefMissionId ? uid === chefMissionId : participantIds.length === 1 })),
      },
    },
    include: INCLUDE_LISTE,
  });
  await audit({ req, action: 'CREATION', entite: 'Mission', entiteId: m.id, apres: m });
  return m;
}

const peutModifier = (user, m) => m.demandeurId === user.id && ['BROUILLON'].includes(m.statut);

async function modifier(user, id, data, req) {
  const avant = await chargerMission(id, { participants: true });
  if (!peutModifier(user, avant)) throw forbidden('Seul le demandeur peut modifier une mission au statut brouillon');
  const { champs, participantIds, chefMissionId } = await preparer(data, user, avant);
  const m = await prisma.$transaction(async (tx) => {
    if (data.participantIds) {
      await tx.missionParticipant.deleteMany({ where: { missionId: avant.id } });
      await tx.missionParticipant.createMany({
        data: participantIds.map((uid) => ({
          missionId: avant.id,
          userId: uid,
          chefMission: chefMissionId ? uid === chefMissionId : participantIds.length === 1,
        })),
      });
    }
    return tx.mission.update({ where: { id: avant.id }, data: champs, include: INCLUDE_LISTE });
  });
  await audit({
    req,
    action: 'MODIFICATION',
    entite: 'Mission',
    entiteId: m.id,
    avant: { ...avant, participants: avant.participants.map((p) => p.userId).join(',') },
    apres: { ...m, participants: m.participants.map((p) => p.userId).join(',') },
  });
  return m;
}

async function supprimer(user, id, req) {
  const m = await chargerMission(id, {});
  if (m.demandeurId !== user.id || m.statut !== 'BROUILLON' || m.numero) {
    throw forbidden('Seul un brouillon jamais soumis peut être supprimé ; utilisez l’annulation sinon');
  }
  await prisma.mission.delete({ where: { id: m.id } });
  await audit({ req, action: 'SUPPRESSION', entite: 'Mission', entiteId: m.id, avant: m });
}

const lien = (m) => `/missions/${m.id}`;
const ref = (m) => m.numero || `#${m.id}`;

async function enregistrerSauts(tx, mission, sautees) {
  for (const e of sautees) {
    await tx.validation.create({
      data: {
        objetType: 'MISSION',
        missionId: mission.id,
        etapeOrdre: e.ordre,
        etapeLibelle: e.libelle,
        decision: 'SAUTE',
        commentaire: 'Étape sans validateur éligible (ex. demandeur responsable) — passée automatiquement',
      },
    });
  }
}

/** Approbation finale : contrôle budgétaire puis passage au statut APPROUVE. */
async function controleBudget(mission) {
  if (!mission.budgetId) return null;
  const params = await tousLesParametres();
  const situation = await situationBudgetParId(mission.budgetId, { exclureMissionId: mission.id });
  const verif = verifierDisponibilite(situation, mission.coutEstime);
  if (!verif.ok && params.bloquerDepassementBudget) {
    throw conflict(`Budget insuffisant : dépassement de ${verif.depassement.toFixed(2)} MAD`, { situation, verif });
  }
  return { situation, verif };
}

async function alerterBudget(mission) {
  if (!mission.budgetId) return;
  const situation = await situationBudgetParId(mission.budgetId);
  const budget = await prisma.budget.findUnique({ where: { id: mission.budgetId } });
  const palier = situation.depasse ? 100 : situation.enAlerte ? budget.seuilAlerte : 0;
  if (palier > budget.alerteEnvoyee) {
    await prisma.budget.update({ where: { id: budget.id }, data: { alerteEnvoyee: palier } });
    const financiers = await prisma.user.findMany({ where: { role: { in: ['FINANCIER', 'ADMIN'] }, actif: true }, select: { id: true } });
    await notifier(
      financiers.map((u) => u.id),
      {
        titre: situation.depasse ? `Budget dépassé : ${budget.libelle}` : `Alerte budget : ${budget.libelle}`,
        message: `Consommation : ${situation.tauxConsommation} % (${situation.consomme.toFixed(2)} MAD sur ${situation.montant.toFixed(2)} MAD).`,
        lien: `/budgets`,
      }
    );
  }
}

async function soumettre(user, id, req) {
  const m = await chargerMission(id);
  if (m.demandeurId !== user.id) throw forbidden('Seul le demandeur peut soumettre la mission');
  assertTransition(TRANSITIONS_MISSION, m.statut, 'EN_ATTENTE');
  if (new Date(m.dateRetour) < new Date()) throw badRequest('La date de retour est déjà passée');

  const conflits = await conflitsPour({ ...m, participantIds: m.participants.map((p) => p.userId) });
  if (conflits.length) throw conflict('Conflit de calendrier avec une autre mission', conflits);

  const circuit = await circuitApplicable('MISSION', m.serviceId);
  if (!circuit || !circuit.etapes.length) throw badRequest('Aucun circuit de validation des missions n’est configuré');
  const refV = await chargerReferentielValidation();
  const suite = prochaineEtape(circuit.etapes, null, contexte(refV, m.demandeur), m.coutEstime);

  const numero = m.numero || (await prochainNumero('OM', new Date(m.dateDepart).getFullYear()));
  let finale = null;
  if (!suite.etape) finale = await controleBudget(m);

  const maj = await prisma.$transaction(async (tx) => {
    await enregistrerSauts(tx, m, suite.sautees);
    return tx.mission.update({
      where: { id: m.id },
      data: {
        numero,
        circuitId: circuit.id,
        statut: suite.etape ? 'EN_ATTENTE' : 'APPROUVE',
        etapeCourante: suite.etape ? suite.etape.ordre : null,
        soumisLe: new Date(),
        approuveLe: suite.etape ? null : new Date(),
        motifRefus: null,
      },
    });
  });
  await audit({ req, action: 'SOUMISSION', entite: 'Mission', entiteId: m.id, avant: m, apres: maj });

  if (suite.etape) {
    await notifier(suite.validateurs, {
      titre: `Mission ${numero} à valider`,
      message: `${m.demandeur.prenom} ${m.demandeur.nom} demande votre validation (${suite.etape.libelle}) pour la mission « ${m.objet} » à ${m.destination.ville}.`,
      lien: lien(m),
    });
  } else {
    await apresApprobation(maj, m);
  }
  return { mission: maj, budget: finale };
}

async function apresApprobation(maj, m) {
  await notifier([m.demandeurId, ...m.participants.map((p) => p.userId)], {
    titre: `Mission ${maj.numero} approuvée`,
    message: `La mission « ${m.objet} » à ${m.destination.ville} est approuvée. L'ordre de mission est disponible.`,
    lien: lien(m),
  });
  await alerterBudget(maj);
}

async function decider(user, id, { decision, commentaire }, req) {
  const m = await chargerMission(id);
  if (m.statut !== 'EN_ATTENTE') throw conflict('Cette mission n’est pas en attente de validation');
  const refV = await chargerReferentielValidation();
  const ctx = contexte(refV, m.demandeur);
  if (!validateursEtapeCourante(m, refV, m.demandeur).includes(user.id)) {
    throw forbidden('Vous n’êtes pas validateur de l’étape en cours');
  }
  if (decision === 'REFUSE' && !commentaire?.trim()) throw badRequest('Le motif du refus est obligatoire');

  const etape = m.circuit.etapes.find((e) => e.ordre === m.etapeCourante);
  const res = appliquerDecision({ etapes: m.circuit.etapes, ordreCourant: m.etapeCourante, decision, ctx, montant: m.coutEstime });
  if (res.statut === 'APPROUVE') await controleBudget(m);

  const maj = await prisma.$transaction(async (tx) => {
    await tx.validation.create({
      data: {
        objetType: 'MISSION',
        missionId: m.id,
        etapeOrdre: etape.ordre,
        etapeLibelle: etape.libelle,
        validateurId: user.id,
        decision,
        commentaire: commentaire || null,
      },
    });
    await enregistrerSauts(tx, m, res.sautees);
    const data =
      res.statut === 'REFUSE'
        ? { statut: 'REFUSE', etapeCourante: null, motifRefus: commentaire }
        : res.statut === 'APPROUVE'
          ? { statut: 'APPROUVE', etapeCourante: null, approuveLe: new Date() }
          : { etapeCourante: res.etapeSuivante.ordre };
    return tx.mission.update({ where: { id: m.id }, data });
  });
  await audit({ req, action: decision === 'REFUSE' ? 'REFUS' : 'APPROBATION', entite: 'Mission', entiteId: m.id, avant: m, apres: maj });

  if (res.statut === 'REFUSE') {
    await notifier([m.demandeurId], {
      titre: `Mission ${m.numero} refusée`,
      message: `Votre mission « ${m.objet} » a été refusée par ${user.prenom} ${user.nom}.\nMotif : ${commentaire}`,
      lien: lien(m),
    });
  } else if (res.statut === 'APPROUVE') {
    await apresApprobation(maj, m);
  } else {
    await notifier(res.validateurs, {
      titre: `Mission ${m.numero} à valider`,
      message: `La mission « ${m.objet} » de ${m.demandeur.prenom} ${m.demandeur.nom} attend votre validation (${res.etapeSuivante.libelle}).`,
      lien: lien(m),
    });
  }
  return maj;
}

async function changerStatut(user, id, vers, req, { motif } = {}) {
  const m = await chargerMission(id);
  assertTransition(TRANSITIONS_MISSION, m.statut, vers);
  const estDemandeur = m.demandeurId === user.id;
  const gestionnaire = user.permissions.includes('mission:cloturer');
  const data = { statut: vers };

  switch (vers) {
    case 'EN_COURS':
      if (!estDemandeur && !gestionnaire) throw forbidden();
      if (m.vehiculeId) await prisma.vehicule.update({ where: { id: m.vehiculeId }, data: { statut: 'EN_MISSION' } });
      break;
    case 'CLOTURE':
      if (!estDemandeur && !gestionnaire) throw forbidden();
      if (new Date(m.dateRetour) > new Date()) throw badRequest('La mission ne peut être clôturée qu’après la date de retour');
      data.clotureLe = new Date();
      if (m.vehiculeId) await prisma.vehicule.update({ where: { id: m.vehiculeId }, data: { statut: 'DISPONIBLE' } });
      break;
    case 'ANNULE':
      if (!estDemandeur && user.role !== 'ADMIN') throw forbidden();
      if (!motif?.trim()) throw badRequest('Le motif d’annulation est obligatoire');
      data.motifRefus = motif;
      data.etapeCourante = null;
      break;
    case 'BROUILLON':
      if (!estDemandeur) throw forbidden();
      data.etapeCourante = null;
      break;
    default:
      throw badRequest('Transition non gérée');
  }
  const maj = await prisma.mission.update({ where: { id: m.id }, data });
  const actions = { EN_COURS: 'DEMARRAGE', CLOTURE: 'CLOTURE', ANNULE: 'ANNULATION', BROUILLON: 'REVISION' };
  await audit({ req, action: actions[vers], entite: 'Mission', entiteId: m.id, avant: m, apres: maj });

  if (vers === 'ANNULE') {
    await notifier(m.participants.map((p) => p.userId).filter((u) => u !== user.id), {
      titre: `Mission ${ref(m)} annulée`,
      message: `La mission « ${m.objet} » a été annulée.\nMotif : ${motif}`,
      lien: lien(m),
    });
  }
  if (vers === 'CLOTURE') {
    await notifier(m.participants.map((p) => p.userId), {
      titre: `Mission ${ref(m)} clôturée`,
      message: `Pensez à saisir votre note de frais et à joindre vos justificatifs pour la mission « ${m.objet} ».`,
      lien: lien(m),
    });
  }
  return maj;
}

module.exports = {
  INCLUDE_LISTE,
  INCLUDE_DETAIL,
  filtreVisibilite,
  verifierLecture,
  chargerMission,
  estimer,
  conflitsPour,
  creer,
  modifier,
  supprimer,
  soumettre,
  decider,
  changerStatut,
  alerterBudget,
  peutModifier,
};
