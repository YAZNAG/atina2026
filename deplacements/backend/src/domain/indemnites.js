/**
 * Calcul des indemnités journalières de déplacement.
 *
 * Règles par défaut (modifiables via le paramètre `regles_indemnites`) :
 *  - mission sur une seule journée : 1 jour si la durée atteint `dureeMinJourneeH` heures, sinon ½ jour ;
 *  - jour de départ : 1 jour si départ avant `heureLimiteDepart` h, sinon ½ jour ;
 *  - jour de retour : 1 jour si retour à partir de `heureLimiteRetour` h, sinon ½ jour ;
 *  - jours intermédiaires : 1 jour chacun ;
 *  - chaque repas fourni (pris en charge par l'organisateur) est déduit au taux repas du barème.
 * Les heures sont lues dans le fuseau du serveur (Africa/Casablanca).
 */
const { round2, num } = require('./montants');

const REGLES_DEFAUT = Object.freeze({
  heureLimiteDepart: 12,
  heureLimiteRetour: 14,
  dureeMinJourneeH: 6,
});

const jourCivil = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
const heureDecimale = (d) => d.getHours() + d.getMinutes() / 60;

/** Nombre de nuits passées hors résidence (différence de jours civils). */
function nuitees(dateDepart, dateRetour) {
  const dep = new Date(dateDepart);
  const ret = new Date(dateRetour);
  return Math.max(0, Math.round((jourCivil(ret) - jourCivil(dep)) / 86400000));
}

function joursIndemnisables(dateDepart, dateRetour, regles = {}) {
  const r = { ...REGLES_DEFAUT, ...regles };
  const dep = new Date(dateDepart);
  const ret = new Date(dateRetour);
  if (Number.isNaN(dep.getTime()) || Number.isNaN(ret.getTime())) throw new Error('Dates invalides');
  if (ret < dep) throw new Error('La date de retour précède la date de départ');

  const nuits = nuitees(dep, ret);
  if (nuits === 0) {
    const dureeH = (ret - dep) / 3600000;
    return dureeH >= r.dureeMinJourneeH ? 1 : 0.5;
  }
  const premier = heureDecimale(dep) < r.heureLimiteDepart ? 1 : 0.5;
  const dernier = heureDecimale(ret) >= r.heureLimiteRetour ? 1 : 0.5;
  return premier + dernier + (nuits - 1);
}

/**
 * @param {object} p
 * @param {Date|string} p.dateDepart
 * @param {Date|string} p.dateRetour
 * @param {{tauxJournalier:number, tauxRepas?:number, plafondNuitee?:number}} p.bareme
 * @param {number} [p.nbRepasFournis]
 * @param {object} [p.regles]
 */
function calculerIndemnites({ dateDepart, dateRetour, bareme, nbRepasFournis = 0, regles }) {
  if (!bareme) throw new Error('Aucun barème applicable');
  const jours = joursIndemnisables(dateDepart, dateRetour, regles);
  const taux = num(bareme.tauxJournalier);
  const montantBrut = round2(jours * taux);
  const deductionRepas = round2(Math.max(0, nbRepasFournis) * num(bareme.tauxRepas));
  const montant = round2(Math.max(0, montantBrut - deductionRepas));
  return {
    jours,
    nuits: nuitees(dateDepart, dateRetour),
    tauxJournalier: taux,
    montantBrut,
    deductionRepas,
    montant,
  };
}

/**
 * Choisit le barème en vigueur à une date pour une zone et une catégorie d'agent
 * (le plus récent dont la période couvre la date).
 */
function selectionnerBareme(baremes, { zoneId, categorieId, date }) {
  const t = new Date(date).getTime();
  const debutJour = (d) => new Date(d).setHours(0, 0, 0, 0);
  const finJour = (d) => new Date(d).setHours(23, 59, 59, 999);
  return (
    baremes
      .filter((b) => b.zoneId === zoneId && b.categorieId === categorieId)
      .filter((b) => debutJour(b.dateDebut) <= t && (!b.dateFin || finJour(b.dateFin) >= t))
      .sort((a, b) => new Date(b.dateDebut) - new Date(a.dateDebut))[0] || null
  );
}

/**
 * Coût prévisionnel d'une mission : indemnités et nuitées de chaque participant,
 * plus le transport et les autres frais estimés.
 * @param {object} p
 * @param {Array<{userId:number, bareme:object|null}>} p.participants
 */
function estimerCoutMission({
  participants,
  dateDepart,
  dateRetour,
  nbRepasFournis = 0,
  fraisTransportEstimes = 0,
  autresFraisEstimes = 0,
  regles,
}) {
  const nuits = nuitees(dateDepart, dateRetour);
  const detail = participants.map(({ userId, bareme }) => {
    if (!bareme) return { userId, indemnites: 0, hebergement: 0, total: 0, sansBareme: true };
    const ind = calculerIndemnites({ dateDepart, dateRetour, bareme, nbRepasFournis, regles });
    const hebergement = round2(nuits * num(bareme.plafondNuitee));
    return {
      userId,
      jours: ind.jours,
      tauxJournalier: ind.tauxJournalier,
      indemnites: ind.montant,
      hebergement,
      total: round2(ind.montant + hebergement),
    };
  });
  const totalParticipants = round2(detail.reduce((a, d) => a + d.total, 0));
  const total = round2(totalParticipants + num(fraisTransportEstimes) + num(autresFraisEstimes));
  return { nuits, detail, totalParticipants, transport: num(fraisTransportEstimes), autres: num(autresFraisEstimes), total };
}

module.exports = {
  REGLES_DEFAUT,
  nuitees,
  joursIndemnisables,
  calculerIndemnites,
  selectionnerBareme,
  estimerCoutMission,
};
