const prisma = require('./prisma');

/** Valeurs par défaut des paramètres généraux. */
const DEFAUTS = Object.freeze({
  organisme: {
    nom: "Chambre d'Artisanat de la Région Souss Massa",
    adresse: 'Agadir, Maroc',
    telephone: '',
    email: '',
    ville: 'Agadir',
  },
  devise: 'MAD',
  tauxTVA: 20,
  /** Mois de début de l'exercice (1 = janvier). */
  exerciceDebutMois: 1,
  anneeFiscale: new Date().getFullYear(),
  /** Durée légale de conservation des pièces (années) — art. 22 du Code de commerce. */
  dureeConservationAnnees: 10,
  regles_indemnites: { heureLimiteDepart: 12, heureLimiteRetour: 14, dureeMinJourneeH: 6 },
  rappels: {
    /** Jours après le retour avant rappel de clôture / justificatifs. */
    joursApresRetour: 3,
    /** Jours d'attente avant relance d'un validateur. */
    joursRelanceValidation: 2,
  },
  /** Bloquer l'approbation d'une mission qui dépasse le budget disponible. */
  bloquerDepassementBudget: false,
  comptabilite: {
    journal: 'OD',
    compteCredit: '4437',
    libelleCompteCredit: 'Autres créanciers — frais de mission à payer',
    comptes: {
      TRANSPORT: '61431',
      HEBERGEMENT: '61432',
      REPAS: '61432',
      CARBURANT: '61251',
      PEAGE_PARKING: '61431',
      TAXI: '61431',
      DIVERS: '61438',
      INDEMNITES: '61433',
    },
  },
  logo: null,
  entete: null,
});

let cache = null;
let cacheAt = 0;

async function tousLesParametres() {
  if (cache && Date.now() - cacheAt < 30_000) return cache;
  const rows = await prisma.parametre.findMany();
  const out = { ...DEFAUTS };
  for (const r of rows) out[r.cle] = r.valeur;
  cache = out;
  cacheAt = Date.now();
  return out;
}

async function parametre(cle) {
  return (await tousLesParametres())[cle];
}

async function definirParametre(cle, valeur) {
  await prisma.parametre.upsert({ where: { cle }, create: { cle, valeur }, update: { valeur } });
  cache = null;
}

const invaliderCache = () => {
  cache = null;
};

module.exports = { DEFAUTS, tousLesParametres, parametre, definirParametre, invaliderCache };
