/** Tâches automatiques : passage en cours, rappels, relances, échéances du parc. */
const prisma = require('../lib/prisma');
const { notifier } = require('../lib/notifier');
const { audit } = require('../lib/audit');
const { tousLesParametres } = require('../lib/parametres');
const { chargerReferentielValidation, validateursEtapeCourante } = require('../lib/contexte');
const { sauvegarder } = require('../lib/sauvegarde');

const jours = (n) => n * 86400000;

/** Les missions approuvées dont la date de départ est atteinte passent « en cours ». */
async function demarrerMissions(maintenant = new Date()) {
  const missions = await prisma.mission.findMany({ where: { statut: 'APPROUVE', dateDepart: { lte: maintenant } } });
  for (const m of missions) {
    const maj = await prisma.mission.update({ where: { id: m.id }, data: { statut: 'EN_COURS' } });
    if (m.vehiculeId) await prisma.vehicule.update({ where: { id: m.vehiculeId }, data: { statut: 'EN_MISSION' } });
    await audit({ action: 'DEMARRAGE_AUTOMATIQUE', entite: 'Mission', entiteId: m.id, avant: m, apres: maj });
  }
  return { missionsDemarrees: missions.length };
}

/** Rappel de clôture des missions terminées depuis plus de N jours. */
async function rappelerClotures(maintenant = new Date()) {
  const p = await tousLesParametres();
  const missions = await prisma.mission.findMany({
    where: { statut: 'EN_COURS', dateRetour: { lt: new Date(maintenant - jours(p.rappels.joursApresRetour)) } },
  });
  for (const m of missions) {
    await notifier([m.demandeurId], {
      titre: `Mission ${m.numero} à clôturer`,
      message: `La mission « ${m.objet} » est terminée depuis le ${m.dateRetour.toLocaleDateString('fr-MA')}. Merci de la clôturer.`,
      lien: `/missions/${m.id}`,
    });
  }
  return { rappelsCloture: missions.length };
}

/** Rappel aux participants : note de frais non saisie / non soumise, justificatifs manquants. */
async function rappelerJustificatifs(maintenant = new Date()) {
  const p = await tousLesParametres();
  const missions = await prisma.mission.findMany({
    where: { statut: { in: ['EN_COURS', 'CLOTURE'] }, dateRetour: { lt: new Date(maintenant - jours(p.rappels.joursApresRetour)) } },
    include: { participants: true, notesFrais: { include: { lignes: { select: { documentId: true } } } } },
  });
  let n = 0;
  for (const m of missions) {
    for (const part of m.participants) {
      const note = m.notesFrais.find((x) => x.agentId === part.userId);
      let message = null;
      if (!note) message = `Vous n'avez pas encore saisi votre note de frais pour la mission « ${m.objet} ».`;
      else if (note.statut === 'BROUILLON' && note.lignes.some((l) => !l.documentId)) {
        message = `Des justificatifs manquent dans votre note de frais pour la mission « ${m.objet} ».`;
      } else if (note.statut === 'BROUILLON') message = `Votre note de frais pour la mission « ${m.objet} » n'est pas encore soumise.`;
      else if (note.statut === 'REJETEE') message = `Votre note de frais pour la mission « ${m.objet} » a été rejetée et attend vos corrections.`;
      if (message) {
        n += 1;
        await notifier([part.userId], { titre: `Rappel — mission ${m.numero}`, message, lien: note ? `/notes-frais/${note.id}` : `/missions/${m.id}` });
      }
    }
  }
  return { rappelsJustificatifs: n };
}

/** Relance des validateurs pour les demandes en attente depuis plus de N jours. */
async function relancerValidateurs(maintenant = new Date()) {
  const p = await tousLesParametres();
  const limite = new Date(maintenant - jours(p.rappels.joursRelanceValidation));
  const ref = await chargerReferentielValidation();
  const circuit = { include: { etapes: true } };
  const [missions, notes] = await Promise.all([
    prisma.mission.findMany({ where: { statut: 'EN_ATTENTE', updatedAt: { lt: limite } }, include: { demandeur: true, circuit } }),
    prisma.noteFrais.findMany({ where: { statut: 'SOUMISE', updatedAt: { lt: limite } }, include: { agent: true, circuit } }),
  ]);
  const parValidateur = new Map();
  const ajouter = (ids, libelle) => ids.forEach((id) => parValidateur.set(id, [...(parValidateur.get(id) || []), libelle]));
  missions.forEach((m) => ajouter(validateursEtapeCourante(m, ref, m.demandeur), `Mission ${m.numero} — ${m.objet}`));
  notes.forEach((n) => ajouter(validateursEtapeCourante(n, ref, n.agent), `Note de frais ${n.numero}`));
  for (const [id, items] of parValidateur) {
    await notifier([id], {
      titre: `${items.length} demande(s) en attente de votre validation`,
      message: items.map((i) => `• ${i}`).join('\n'),
      lien: '/validations',
    });
  }
  return { validateursRelances: parValidateur.size };
}

/** Échéances assurance / visite technique dans les 30 jours. */
async function echeancesParc(maintenant = new Date()) {
  const limite = new Date(+maintenant + jours(30));
  const vehicules = await prisma.vehicule.findMany({
    where: { statut: { not: 'HORS_SERVICE' }, OR: [{ dateAssurance: { lte: limite } }, { dateVisiteTechnique: { lte: limite } }] },
  });
  if (!vehicules.length) return { echeances: 0 };
  const gestionnaires = await prisma.user.findMany({ where: { role: { in: ['FINANCIER', 'ADMIN'] }, actif: true }, select: { id: true } });
  const fmt = (d) => (d ? d.toLocaleDateString('fr-MA') : '—');
  await notifier(
    gestionnaires.map((u) => u.id),
    {
      titre: 'Échéances du parc automobile',
      message: vehicules.map((v) => `• ${v.immatriculation} : assurance ${fmt(v.dateAssurance)}, visite technique ${fmt(v.dateVisiteTechnique)}`).join('\n'),
      lien: '/parc',
    }
  );
  return { echeances: vehicules.length };
}

async function quotidien() {
  return {
    ...(await demarrerMissions()),
    ...(await rappelerClotures()),
    ...(await rappelerJustificatifs()),
    ...(await relancerValidateurs()),
    ...(await echeancesParc()),
  };
}

const TACHES = {
  'demarrer-missions': demarrerMissions,
  'rappels-cloture': rappelerClotures,
  'rappels-justificatifs': rappelerJustificatifs,
  'relances-validateurs': relancerValidateurs,
  'echeances-parc': echeancesParc,
  quotidien,
  sauvegarde: async () => {
    const s = await sauvegarder();
    return { sauvegarde: s.statut, fichier: s.fichier };
  },
};

module.exports = { TACHES, demarrerMissions, rappelerClotures, rappelerJustificatifs, relancerValidateurs, echeancesParc, quotidien };
