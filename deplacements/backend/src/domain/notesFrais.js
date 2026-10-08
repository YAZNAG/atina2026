/**
 * Calcul d'une note de frais :
 *  - chaque dépense est retenue dans la limite du plafond applicable ;
 *  - l'hébergement est plafonné au barème (plafond par nuitée × nuits non prises en charge) ;
 *  - les dépenses jugées non conformes au contrôle ne sont pas retenues ;
 *  - montant à rembourser = dépenses retenues + indemnités − avance versée
 *    (un montant négatif signifie que l'agent doit reverser le trop-perçu).
 */
const { round2, num } = require('./montants');

/** Plafond spécifique à la catégorie d'agent, sinon plafond général. */
function trouverPlafond(plafonds, categorieFrais, categorieAgentId) {
  return (
    plafonds.find((p) => p.categorieFrais === categorieFrais && p.categorieAgentId === categorieAgentId) ||
    plafonds.find((p) => p.categorieFrais === categorieFrais && (p.categorieAgentId === null || p.categorieAgentId === undefined)) ||
    null
  );
}

const cleJour = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
};

/**
 * @param {object} p
 * @param {Array<{id?:any, date:Date|string, categorie:string, montant:number, statutControle?:string}>} p.lignes
 * @param {Array<{categorieFrais:string, categorieAgentId:number|null, montant:number, unite:'PAR_DEPENSE'|'PAR_JOUR'}>} [p.plafonds]
 * @param {number|null} [p.categorieAgentId]
 * @param {number} [p.plafondNuitee] plafond hébergement par nuit (barème), 0 = pas de plafond barème
 * @param {number} [p.nuitsRemboursables] nuits dont l'hébergement est à la charge de l'agent
 * @param {number} [p.indemnites] montant des indemnités journalières
 * @param {number} [p.avance] avance versée à déduire
 */
function calculerNoteFrais({
  lignes,
  plafonds = [],
  categorieAgentId = null,
  plafondNuitee = 0,
  nuitsRemboursables = 0,
  indemnites = 0,
  avance = 0,
}) {
  const cumulJour = new Map();
  let resteHebergement = num(plafondNuitee) > 0 ? round2(num(plafondNuitee) * Math.max(0, nuitsRemboursables)) : null;

  // Ordre chronologique pour une imputation stable des plafonds cumulés.
  const ordre = lignes
    .map((l, index) => ({ l, index }))
    .sort((a, b) => new Date(a.l.date) - new Date(b.l.date) || a.index - b.index);

  const resultats = new Array(lignes.length);
  for (const { l, index } of ordre) {
    const montant = round2(num(l.montant));
    let retenu = montant;

    if (l.statutControle === 'NON_CONFORME') {
      resultats[index] = { id: l.id, montant, montantRetenu: 0, depassementPlafond: false };
      continue;
    }

    if (l.categorie === 'HEBERGEMENT' && resteHebergement !== null) {
      retenu = Math.min(retenu, resteHebergement);
      resteHebergement = round2(resteHebergement - retenu);
    } else {
      const plafond = trouverPlafond(plafonds, l.categorie, categorieAgentId);
      if (plafond) {
        const max = num(plafond.montant);
        if (plafond.unite === 'PAR_JOUR') {
          const cle = `${l.categorie}|${cleJour(l.date)}`;
          const deja = cumulJour.get(cle) || 0;
          retenu = Math.max(0, Math.min(retenu, round2(max - deja)));
          cumulJour.set(cle, round2(deja + retenu));
        } else {
          retenu = Math.min(retenu, max);
        }
      }
    }
    retenu = round2(retenu);
    resultats[index] = { id: l.id, montant, montantRetenu: retenu, depassementPlafond: retenu < montant };
  }

  const totalDepenses = round2(resultats.reduce((a, r) => a + r.montant, 0));
  const totalRetenu = round2(resultats.reduce((a, r) => a + r.montantRetenu, 0));
  const totalIndemnites = round2(num(indemnites));
  const avanceDeduite = round2(num(avance));
  return {
    lignes: resultats,
    totalDepenses,
    totalRetenu,
    totalIndemnites,
    avanceDeduite,
    montantARembourser: round2(totalRetenu + totalIndemnites - avanceDeduite),
  };
}

module.exports = { calculerNoteFrais, trouverPlafond };
