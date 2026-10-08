const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../../lib/prisma');
const { asyncHandler, ok, created } = require('../../lib/http');
const { notFound, badRequest } = require('../../lib/errors');
const { valider } = require('../../middlewares/valider');
const { autoriser } = require('../../middlewares/auth');
const { audit } = require('../../lib/audit');

const etape = z
  .object({
    libelle: z.string().trim().min(1),
    typeEtape: z.enum(['RESPONSABLE_SERVICE', 'UTILISATEUR', 'ROLE']),
    role: z.enum(['AGENT', 'VALIDATEUR', 'FINANCIER', 'ADMIN']).nullable().optional(),
    utilisateurId: z.coerce.number().int().positive().nullable().optional(),
    seuilMontant: z.coerce.number().min(0).nullable().optional(),
  })
  .refine((e) => e.typeEtape !== 'ROLE' || e.role, { message: 'Rôle requis pour une étape de type ROLE' })
  .refine((e) => e.typeEtape !== 'UTILISATEUR' || e.utilisateurId, { message: 'Utilisateur requis' });

const schema = z.object({
  nom: z.string().trim().min(1),
  type: z.enum(['MISSION', 'NOTE_FRAIS']),
  serviceId: z.coerce.number().int().positive().nullable().optional(),
  actif: z.boolean().optional(),
  etapes: z.array(etape).min(1, 'Au moins une étape'),
});

const include = {
  service: { select: { id: true, nom: true } },
  etapes: { orderBy: { ordre: 'asc' }, include: { utilisateur: { select: { id: true, nom: true, prenom: true } } } },
};

router.get('/', autoriser('referentiel:lire'), asyncHandler(async (req, res) => ok(res, await prisma.circuitValidation.findMany({ include, orderBy: [{ type: 'asc' }, { id: 'asc' }] }))));

router.use(autoriser('admin:referentiels'));

const etapesData = (etapes) =>
  etapes.map((e, i) => ({
    ordre: i + 1,
    libelle: e.libelle,
    typeEtape: e.typeEtape,
    role: e.typeEtape === 'ROLE' ? e.role : null,
    utilisateurId: e.typeEtape === 'UTILISATEUR' ? e.utilisateurId : null,
    seuilMontant: e.seuilMontant ?? null,
  }));

async function verifierUnicite({ type, serviceId, actif = true }, idExclu) {
  if (!actif) return;
  const existant = await prisma.circuitValidation.findFirst({
    where: { type, serviceId: serviceId ?? null, actif: true, ...(idExclu && { id: { not: idExclu } }) },
  });
  if (existant) throw badRequest(`Un circuit actif existe déjà pour ce périmètre : « ${existant.nom} »`);
}

router.post(
  '/',
  valider(schema),
  asyncHandler(async (req, res) => {
    const { etapes, ...d } = req.body;
    await verifierUnicite(d);
    const c = await prisma.circuitValidation.create({ data: { ...d, etapes: { create: etapesData(etapes) } }, include });
    await audit({ req, action: 'CREATION', entite: 'CircuitValidation', entiteId: c.id, apres: { ...c, etapes } });
    created(res, c);
  })
);

router.put(
  '/:id',
  valider(schema),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const avant = await prisma.circuitValidation.findUnique({ where: { id }, include });
    if (!avant) throw notFound();
    const { etapes, ...d } = req.body;
    await verifierUnicite(d, id);
    // Les objets en cours de validation gardent leur numéro d'étape ; on remplace la définition.
    const c = await prisma.$transaction(async (tx) => {
      await tx.etapeCircuit.deleteMany({ where: { circuitId: id } });
      return tx.circuitValidation.update({ where: { id }, data: { ...d, etapes: { create: etapesData(etapes) } }, include });
    });
    await audit({ req, action: 'MODIFICATION', entite: 'CircuitValidation', entiteId: id, avant: { ...avant, etapes: JSON.stringify(avant.etapes) }, apres: { ...c, etapes: JSON.stringify(c.etapes) } });
    ok(res, c);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const utilise = (await prisma.mission.count({ where: { circuitId: id } })) + (await prisma.noteFrais.count({ where: { circuitId: id } }));
    if (utilise) {
      await prisma.circuitValidation.update({ where: { id }, data: { actif: false } });
      await audit({ req, action: 'DESACTIVATION', entite: 'CircuitValidation', entiteId: id });
      return ok(res, null, 'Circuit déjà utilisé : désactivé au lieu d’être supprimé');
    }
    await prisma.circuitValidation.delete({ where: { id } });
    await audit({ req, action: 'SUPPRESSION', entite: 'CircuitValidation', entiteId: id });
    ok(res, null, 'Supprimé');
  })
);

module.exports = router;
