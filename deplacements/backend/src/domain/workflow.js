/**
 * Circuits de validation et machines à états des missions et notes de frais.
 * Logique pure : les données (étapes, services, utilisateurs) sont fournies par l'appelant.
 */
const { num } = require('./montants');

const TRANSITIONS_MISSION = Object.freeze({
  BROUILLON: ['EN_ATTENTE', 'ANNULE'],
  EN_ATTENTE: ['EN_ATTENTE', 'APPROUVE', 'REFUSE', 'ANNULE'],
  APPROUVE: ['EN_COURS', 'ANNULE'],
  REFUSE: ['BROUILLON'],
  EN_COURS: ['CLOTURE'],
  CLOTURE: [],
  ANNULE: [],
});

const TRANSITIONS_NOTE = Object.freeze({
  BROUILLON: ['SOUMISE'],
  SOUMISE: ['SOUMISE', 'VALIDEE', 'REJETEE'],
  REJETEE: ['BROUILLON'],
  VALIDEE: ['REMBOURSEE'],
  REMBOURSEE: [],
});

const LIBELLES_STATUT_MISSION = Object.freeze({
  BROUILLON: 'Brouillon',
  EN_ATTENTE: 'En attente de validation',
  APPROUVE: 'Approuvée',
  REFUSE: 'Refusée',
  EN_COURS: 'En cours',
  CLOTURE: 'Clôturée',
  ANNULE: 'Annulée',
});

function peutTransiter(table, de, vers) {
  return (table[de] || []).includes(vers);
}

function assertTransition(table, de, vers) {
  if (!peutTransiter(table, de, vers)) {
    const err = new Error(`Transition impossible : ${de} → ${vers}`);
    err.status = 409;
    throw err;
  }
}

/** Étapes qui s'appliquent pour un montant donné, triées par ordre. */
function etapesApplicables(etapes, montant = 0) {
  return [...etapes]
    .sort((a, b) => a.ordre - b.ordre)
    .filter((e) => e.seuilMontant === null || e.seuilMontant === undefined || num(montant) >= num(e.seuilMontant));
}

/**
 * Validateurs possibles pour une étape. Le demandeur est toujours exclu
 * (pas d'auto-validation).
 * @param {object} etape { typeEtape, role, utilisateurId }
 * @param {object} ctx { demandeur:{id, serviceId}, services: Map|Array, utilisateurs: Array<{id, role, actif, perimetreGlobal}> }
 * @returns {number[]}
 */
function resoudreValidateurs(etape, ctx) {
  const { demandeur, utilisateurs } = ctx;
  const services = ctx.services instanceof Map ? ctx.services : new Map((ctx.services || []).map((s) => [s.id, s]));
  const actifs = new Map(utilisateurs.filter((u) => u.actif !== false).map((u) => [u.id, u]));
  const exclureDemandeur = (ids) => [...new Set(ids)].filter((id) => id !== demandeur.id && actifs.has(id));

  switch (etape.typeEtape) {
    case 'RESPONSABLE_SERVICE': {
      // Remonte la hiérarchie : premier responsable qui n'est pas le demandeur.
      let sid = demandeur.serviceId;
      const vus = new Set();
      while (sid && !vus.has(sid)) {
        vus.add(sid);
        const s = services.get(sid);
        if (!s) break;
        if (s.responsableId && s.responsableId !== demandeur.id && actifs.has(s.responsableId)) return [s.responsableId];
        sid = s.parentId;
      }
      // À défaut, un validateur à périmètre global (directeur).
      return exclureDemandeur(
        utilisateurs.filter((u) => u.perimetreGlobal && u.role === 'VALIDATEUR').map((u) => u.id)
      );
    }
    case 'UTILISATEUR':
      return exclureDemandeur(etape.utilisateurId ? [etape.utilisateurId] : []);
    case 'ROLE':
      return exclureDemandeur(utilisateurs.filter((u) => u.role === etape.role).map((u) => u.id));
    default:
      return [];
  }
}

/**
 * Cherche la prochaine étape ayant au moins un validateur, après `apresOrdre`.
 * Les étapes sans validateur possible (ex. le demandeur est lui-même le responsable) sont sautées.
 * @returns {{ etape: object|null, validateurs: number[], sautees: object[] }}
 *   etape === null : le circuit est terminé (objet approuvé).
 */
function prochaineEtape(etapes, apresOrdre, ctx, montant = 0) {
  const sautees = [];
  for (const etape of etapesApplicables(etapes, montant)) {
    if (apresOrdre !== null && apresOrdre !== undefined && etape.ordre <= apresOrdre) continue;
    const validateurs = resoudreValidateurs(etape, ctx);
    if (validateurs.length > 0) return { etape, validateurs, sautees };
    sautees.push(etape);
  }
  return { etape: null, validateurs: [], sautees };
}

/** L'utilisateur peut-il statuer sur l'étape en cours ? */
function peutValider(userId, etapes, ordreCourant, ctx) {
  const etape = etapes.find((e) => e.ordre === ordreCourant);
  if (!etape) return false;
  return resoudreValidateurs(etape, ctx).includes(userId);
}

/**
 * Applique une décision sur l'étape en cours.
 * @returns {{ statut:'EN_COURS_VALIDATION'|'APPROUVE'|'REFUSE', etapeSuivante: object|null, validateurs:number[], sautees:object[] }}
 */
function appliquerDecision({ etapes, ordreCourant, decision, ctx, montant = 0 }) {
  if (decision === 'REFUSE') return { statut: 'REFUSE', etapeSuivante: null, validateurs: [], sautees: [] };
  if (decision !== 'APPROUVE') throw new Error(`Décision inconnue : ${decision}`);
  const suite = prochaineEtape(etapes, ordreCourant, ctx, montant);
  if (!suite.etape) return { statut: 'APPROUVE', etapeSuivante: null, validateurs: [], sautees: suite.sautees };
  return { statut: 'EN_COURS_VALIDATION', etapeSuivante: suite.etape, validateurs: suite.validateurs, sautees: suite.sautees };
}

module.exports = {
  TRANSITIONS_MISSION,
  TRANSITIONS_NOTE,
  LIBELLES_STATUT_MISSION,
  peutTransiter,
  assertTransition,
  etapesApplicables,
  resoudreValidateurs,
  prochaineEtape,
  peutValider,
  appliquerDecision,
};
