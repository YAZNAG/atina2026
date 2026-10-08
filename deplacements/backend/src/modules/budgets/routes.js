const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../../lib/prisma');
const { asyncHandler, ok, created } = require('../../lib/http');
const { notFound, badRequest, forbidden } = require('../../lib/errors');
const { valider } = require('../../middlewares/valider');
const { autoriser } = require('../../middlewares/auth');
const { audit } = require('../../lib/audit');
const { budgetsAvecSituation, SELECT_COUT, coutMission, filtreBudgets } = require('./service');

const schema = z
  .object({
    annee: z.coerce.number().int().min(2000).max(2100),
    libelle: z.string().trim().min(1),
    type: z.enum(['GLOBAL', 'SERVICE', 'PROJET']),
    serviceId: z.coerce.number().int().positive().nullable().optional(),
    projetId: z.coerce.number().int().positive().nullable().optional(),
    montantInitial: z.coerce.number().min(0),
    montantAjuste: z.coerce.number().min(0).nullable().optional(),
    seuilAlerte: z.coerce.number().int().min(1).max(100).optional(),
  });

const coherent = (b) => {
  if (b.type === 'SERVICE' && !b.serviceId) throw badRequest('Service requis pour un budget de service');
  if (b.type === 'PROJET' && !b.projetId) throw badRequest('Projet requis pour un budget de projet');
  return {
    ...b,
    serviceId: b.type === 'SERVICE' ? b.serviceId : null,
    projetId: b.type === 'PROJET' ? b.projetId : null,
  };
};

router.get(
  '/',
  autoriser('budget:lire'),
  asyncHandler(async (req, res) => {
    const where = { AND: [await filtreBudgets(req.user), req.query.annee ? { annee: Number(req.query.annee) } : {}] };
    ok(res, await budgetsAvecSituation(where));
  })
);

router.get(
  '/:id',
  autoriser('budget:lire'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [b] = await budgetsAvecSituation({ AND: [{ id }, await filtreBudgets(req.user)] });
    if (!b) {
      if (await prisma.budget.count({ where: { id } })) throw forbidden();
      throw notFound();
    }
    const missions = await prisma.mission.findMany({
      where: { budgetId: id },
      select: { ...SELECT_COUT, demandeur: { select: { nom: true, prenom: true } } },
      orderBy: { dateDepart: 'desc' },
    });
    ok(res, {
      ...b,
      missions: missions.map((m) => ({
        id: m.id,
        numero: m.numero,
        objet: m.objet,
        dateDepart: m.dateDepart,
        demandeur: m.demandeur,
        ...coutMission(m),
      })),
    });
  })
);

router.post(
  '/',
  autoriser('budget:gerer'),
  valider(schema),
  asyncHandler(async (req, res) => {
    const b = await prisma.budget.create({ data: coherent(req.body) });
    await audit({ req, action: 'CREATION', entite: 'Budget', entiteId: b.id, apres: b });
    created(res, b);
  })
);

router.put(
  '/:id',
  autoriser('budget:gerer'),
  valider(schema),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const avant = await prisma.budget.findUnique({ where: { id } });
    if (!avant) throw notFound();
    const b = await prisma.budget.update({ where: { id }, data: { ...coherent(req.body), alerteEnvoyee: 0 } });
    await audit({ req, action: 'MODIFICATION', entite: 'Budget', entiteId: id, avant, apres: b });
    ok(res, b);
  })
);

router.delete(
  '/:id',
  autoriser('budget:gerer'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (await prisma.mission.count({ where: { budgetId: id } })) throw badRequest('Budget imputé par des missions : suppression impossible');
    const avant = await prisma.budget.delete({ where: { id } });
    await audit({ req, action: 'SUPPRESSION', entite: 'Budget', entiteId: id, avant });
    ok(res, null, 'Supprimé');
  })
);

module.exports = router;
