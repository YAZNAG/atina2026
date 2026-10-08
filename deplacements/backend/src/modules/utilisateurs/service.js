const { z } = require('zod');
const prisma = require('../../lib/prisma');
const { decryptText, masquer } = require('../../lib/crypto');
const { PERMISSIONS } = require('../../domain/permissions');

const schemaMotDePasse = z
  .string()
  .min(10, 'Au moins 10 caractères')
  .regex(/[A-Z]/, 'Au moins une majuscule')
  .regex(/[a-z]/, 'Au moins une minuscule')
  .regex(/[0-9]/, 'Au moins un chiffre');

const SELECT_PUBLIC = {
  id: true,
  matricule: true,
  nom: true,
  prenom: true,
  email: true,
  role: true,
  perimetreGlobal: true,
  telephone: true,
  actif: true,
  serviceId: true,
  fonctionId: true,
  categorieId: true,
  derniereConnexion: true,
  doitChangerMdp: true,
  createdAt: true,
  service: { select: { id: true, code: true, nom: true } },
  fonction: { select: { id: true, libelle: true } },
  categorie: { select: { id: true, code: true, libelle: true } },
};

/** Vue d'un utilisateur, données sensibles déchiffrées puis masquées. */
function presenter(u, { complet = false } = {}) {
  if (!u) return u;
  const { cinChiffre, ribChiffre, passwordHash, ...reste } = u;
  const cin = decryptText(cinChiffre);
  const rib = decryptText(ribChiffre);
  return {
    ...reste,
    cin: complet ? cin : masquer(cin, 3),
    rib: complet ? rib : masquer(rib, 4),
  };
}

async function profil(id) {
  const u = await prisma.user.findUnique({
    where: { id },
    select: { ...SELECT_PUBLIC, cinChiffre: true, ribChiffre: true, servicesDiriges: { select: { id: true, nom: true } } },
  });
  return { ...presenter(u), permissions: PERMISSIONS[u.role] || [] };
}

module.exports = { SELECT_PUBLIC, presenter, profil, schemaMotDePasse };
