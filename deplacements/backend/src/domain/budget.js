/**
 * Situation d'un budget.
 *  - prévisionnel : missions en attente de validation (non encore engagées) ;
 *  - engagé : coût estimé des missions approuvées, en cours ou clôturées non soldées ;
 *  - réalisé : dépenses effectives (notes remboursées, prestations payées par la Chambre) ;
 *  - consommé : réalisé pour les missions soldées, sinon max(estimé, réalisé) ;
 *  - disponible = montant − consommé.
 */
const { round2, num } = require('./montants');

const STATUTS_ENGAGES = ['APPROUVE', 'EN_COURS', 'CLOTURE'];

/**
 * @param {{montantInitial, montantAjuste?, seuilAlerte?:number}} budget
 * @param {Array<{statut, coutEstime, coutReel?:number, soldee?:boolean}>} missions
 */
function situationBudget(budget, missions) {
  const montant = num(budget.montantAjuste ?? budget.montantInitial);
  let previsionnel = 0;
  let engage = 0;
  let realise = 0;
  let consomme = 0;
  for (const m of missions) {
    const estime = num(m.coutEstime);
    const reel = num(m.coutReel);
    if (m.statut === 'EN_ATTENTE') {
      previsionnel += estime;
      continue;
    }
    if (!STATUTS_ENGAGES.includes(m.statut)) continue;
    realise += reel;
    if (m.soldee) consomme += reel;
    else {
      engage += Math.max(0, estime - reel);
      consomme += Math.max(estime, reel);
    }
  }
  const seuil = budget.seuilAlerte ?? 80;
  const taux = montant > 0 ? round2((consomme / montant) * 100) : consomme > 0 ? 100 : 0;
  return {
    montant: round2(montant),
    previsionnel: round2(previsionnel),
    engage: round2(engage),
    realise: round2(realise),
    consomme: round2(consomme),
    disponible: round2(montant - consomme),
    tauxConsommation: taux,
    enAlerte: taux >= seuil,
    depasse: consomme > montant,
  };
}

/** Un montant supplémentaire tient-il dans le disponible ? */
function verifierDisponibilite(situation, montantSupplementaire) {
  const apres = round2(situation.disponible - num(montantSupplementaire));
  return { ok: apres >= 0, disponibleApres: apres, depassement: apres < 0 ? round2(-apres) : 0 };
}

module.exports = { STATUTS_ENGAGES, situationBudget, verifierDisponibilite };
