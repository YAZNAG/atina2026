const nf = new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 1 234,50 MAD */
export const mad = (v) => `${nf.format(Number(v || 0))} MAD`;
export const nombre = (v, dec = 0) => new Intl.NumberFormat('fr-MA', { maximumFractionDigits: dec }).format(Number(v || 0));

export const date = (d) => (d ? new Date(d).toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
export const dateHeure = (d) =>
  d ? new Date(d).toLocaleString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
export const dateLongue = (d) => (d ? new Date(d).toLocaleDateString('fr-MA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '—');

/** Valeur pour <input type="datetime-local"> à partir d'une date ISO. */
export function versInputDateHeure(d) {
  if (!d) return '';
  const x = new Date(d);
  const p = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`;
}
export function versInputDate(d) {
  if (!d) return '';
  return versInputDateHeure(d).slice(0, 10);
}

export const nomComplet = (u) => (u ? `${u.prenom} ${u.nom}` : '—');

export const LIBELLES = {
  statutMission: {
    BROUILLON: 'Brouillon',
    EN_ATTENTE: 'En attente',
    APPROUVE: 'Approuvée',
    REFUSE: 'Refusée',
    EN_COURS: 'En cours',
    CLOTURE: 'Clôturée',
    ANNULE: 'Annulée',
  },
  statutNote: { BROUILLON: 'Brouillon', SOUMISE: 'En validation', VALIDEE: 'Validée', REJETEE: 'Rejetée', REMBOURSEE: 'Remboursée' },
  statutAvance: { DEMANDEE: 'Demandée', VERSEE: 'Versée', REGULARISEE: 'Régularisée', ANNULEE: 'Annulée' },
  statutControle: { EN_ATTENTE: 'À contrôler', CONFORME: 'Conforme', NON_CONFORME: 'Non conforme' },
  statutVehicule: { DISPONIBLE: 'Disponible', EN_MISSION: 'En mission', EN_ENTRETIEN: 'En entretien', HORS_SERVICE: 'Hors service' },
  moyenTransport: {
    VOITURE_SERVICE: 'Véhicule de service',
    VOITURE_PERSONNELLE: 'Véhicule personnel',
    TRAIN: 'Train',
    AVION: 'Avion',
    AUTOCAR: 'Autocar',
    TAXI: 'Taxi',
    AUTRE: 'Autre',
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
  typeEtape: { RESPONSABLE_SERVICE: 'Responsable du service', UTILISATEUR: 'Utilisateur désigné', ROLE: 'Rôle' },
  typeBudget: { GLOBAL: 'Global', SERVICE: 'Service', PROJET: 'Projet' },
  modePaiement: { VIREMENT: 'Virement', CHEQUE: 'Chèque', ESPECES: 'Espèces', COMPENSATION: 'Compensation' },
  decision: { APPROUVE: 'Approuvé', REFUSE: 'Refusé', SAUTE: 'Étape passée' },
  unitePlafond: { PAR_DEPENSE: 'Par dépense', PAR_JOUR: 'Par jour' },
};

/** Options <select> à partir d'un dictionnaire de libellés. */
export const options = (dico) => Object.entries(dico).map(([value, label]) => ({ value, label }));
