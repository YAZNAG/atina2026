/**
 * Matrice rôles → permissions. Chaque route de l'API déclare la permission requise.
 * Tous les rôles disposent des fonctions « agent » (demander une mission, saisir ses frais).
 */
const AGENT = [
  'mission:creer',
  'mission:lire',
  'note:saisir',
  'avance:demander',
  'vehicule:lire',
  'carnet:saisir',
  'referentiel:lire',
  'notification:lire',
  'calendrier:lire',
];

const VALIDATEUR = [...AGENT, 'validation:statuer', 'mission:lire_perimetre', 'reporting:lire', 'budget:lire'];

const FINANCIER = [
  ...VALIDATEUR,
  'mission:lire_tout',
  'note:controler',
  'note:rembourser',
  'avance:gerer',
  'budget:gerer',
  'export:comptable',
  'vehicule:gerer',
  'mission:cloturer',
];

const ADMIN = [
  ...new Set([
    ...FINANCIER,
    'admin:utilisateurs',
    'admin:referentiels',
    'admin:parametres',
    'admin:audit',
    'admin:sauvegardes',
  ]),
];

const PERMISSIONS = Object.freeze({ AGENT, VALIDATEUR, FINANCIER, ADMIN });

const aPermission = (role, permission) => (PERMISSIONS[role] || []).includes(permission);

module.exports = { PERMISSIONS, aPermission };
