/** Formats d'affichage français / Maroc. */
const { num } = require('../domain/montants');

const fmtNombre = new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 1 234,50 MAD — espaces insécables remplacés pour les PDF (polices standard). */
const mad = (v) => `${fmtNombre.format(num(v)).replace(/[  ]/g, ' ')} MAD`;

const pad = (n) => String(n).padStart(2, '0');
const date = (d) => {
  if (!d) return '';
  const x = new Date(d);
  return `${pad(x.getDate())}/${pad(x.getMonth() + 1)}/${x.getFullYear()}`;
};
const dateHeure = (d) => {
  if (!d) return '';
  const x = new Date(d);
  return `${date(x)} ${pad(x.getHours())}:${pad(x.getMinutes())}`;
};

const LIBELLES = {
  moyenTransport: {
    VOITURE_SERVICE: 'Véhicule de service',
    VOITURE_PERSONNELLE: 'Véhicule personnel',
    TRAIN: 'Train',
    AVION: 'Avion',
    AUTOCAR: 'Autocar',
    TAXI: 'Taxi',
    AUTRE: 'Autre',
  },
  statutMission: {
    BROUILLON: 'Brouillon',
    EN_ATTENTE: 'En attente',
    APPROUVE: 'Approuvée',
    REFUSE: 'Refusée',
    EN_COURS: 'En cours',
    CLOTURE: 'Clôturée',
    ANNULE: 'Annulée',
  },
  statutNote: {
    BROUILLON: 'Brouillon',
    SOUMISE: 'En validation',
    VALIDEE: 'Validée',
    REJETEE: 'Rejetée',
    REMBOURSEE: 'Remboursée',
  },
  categorieFrais: {
    TRANSPORT: 'Transport',
    HEBERGEMENT: 'Hébergement',
    REPAS: 'Repas',
    CARBURANT: 'Carburant',
    PEAGE_PARKING: 'Péage / parking',
    TAXI: 'Taxi',
    DIVERS: 'Divers',
  },
  typeReservation: {
    BILLET_TRAIN: 'Billet de train',
    BILLET_AVION: "Billet d'avion",
    BILLET_AUTOCAR: "Billet d'autocar",
    LOCATION_VOITURE: 'Location de voiture',
    HEBERGEMENT: 'Hébergement',
    AUTRE: 'Autre',
  },
  role: { AGENT: 'Agent', VALIDATEUR: 'Validateur', FINANCIER: 'Service financier', ADMIN: 'Administrateur' },
};

const nomComplet = (u) => (u ? `${u.prenom} ${u.nom}` : '');

module.exports = { mad, date, dateHeure, LIBELLES, nomComplet };
