/** Parc automobile : véhicules, carnet de bord, carburant, entretien, disponibilités. */
const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../../lib/prisma');
const { asyncHandler, ok, created } = require('../../lib/http');
const { notFound, badRequest, forbidden } = require('../../lib/errors');
const { valider } = require('../../middlewares/valider');
const { autoriser } = require('../../middlewares/auth');
const { audit } = require('../../lib/audit');
const { crud } = require('../../lib/crud');
const { STATUTS_ACTIFS } = require('../../domain/conflits');

const id = z.coerce.number().int().positive();
const dateNul = z.coerce.date().nullable().optional();

/** Véhicules libres sur une période (hors entretien / hors service et sans mission qui chevauche). */
router.get(
  '/disponibles',
  autoriser('vehicule:lire'),
  asyncHandler(async (req, res) => {
    const du = new Date(req.query.du);
    const au = new Date(req.query.au);
    if (Number.isNaN(du.getTime()) || Number.isNaN(au.getTime())) throw badRequest('Paramètres du / au requis');
    const occupes = await prisma.mission.findMany({
      where: {
        statut: { in: STATUTS_ACTIFS },
        vehiculeId: { not: null },
        dateDepart: { lt: au },
        dateRetour: { gt: du },
        ...(req.query.missionId && { id: { not: Number(req.query.missionId) } }),
      },
      select: { vehiculeId: true },
    });
    const ids = occupes.map((o) => o.vehiculeId);
    ok(
      res,
      await prisma.vehicule.findMany({
        where: { statut: { in: ['DISPONIBLE', 'EN_MISSION'] }, id: { notIn: ids } },
        orderBy: { immatriculation: 'asc' },
      })
    );
  })
);

const vehiculeDe = async (req) => {
  const v = await prisma.vehicule.findUnique({ where: { id: Number(req.params.id) } });
  if (!v) throw notFound('Véhicule introuvable');
  return v;
};

// ── Carnet de bord : saisi par le conducteur (participant d'une mission) ou par le gestionnaire ──
router.get(
  '/:id/carnet',
  autoriser('vehicule:lire'),
  asyncHandler(async (req, res) => {
    const v = await vehiculeDe(req);
    ok(
      res,
      await prisma.carnetBord.findMany({
        where: { vehiculeId: v.id },
        include: { conducteur: { select: { nom: true, prenom: true } }, mission: { select: { id: true, numero: true } } },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
      })
    );
  })
);

router.post(
  '/:id/carnet',
  autoriser('carnet:saisir'),
  valider(
    z
      .object({
        missionId: id.nullable().optional(),
        date: z.coerce.date(),
        kmDepart: z.coerce.number().int().min(0),
        kmArrivee: z.coerce.number().int().min(0),
        trajet: z.string().trim().min(1).max(300),
        observations: z.string().trim().max(1000).nullable().optional(),
      })
      .refine((d) => d.kmArrivee >= d.kmDepart, { message: 'Kilométrage d’arrivée inférieur au départ', path: ['kmArrivee'] })
  ),
  asyncHandler(async (req, res) => {
    const v = await vehiculeDe(req);
    const gestion = req.user.permissions.includes('vehicule:gerer');
    if (!gestion) {
      if (!req.body.missionId) throw forbidden('Mission requise');
      const m = await prisma.mission.findFirst({
        where: { id: req.body.missionId, vehiculeId: v.id, participants: { some: { userId: req.user.id } } },
      });
      if (!m) throw forbidden('Ce véhicule ne vous est pas affecté pour cette mission');
    }
    const e = await prisma.carnetBord.create({ data: { ...req.body, vehiculeId: v.id, conducteurId: req.user.id } });
    if (req.body.kmArrivee > v.kilometrage) await prisma.vehicule.update({ where: { id: v.id }, data: { kilometrage: req.body.kmArrivee } });
    await audit({ req, action: 'CARNET_BORD', entite: 'Vehicule', entiteId: v.id, apres: e });
    created(res, e);
  })
);

// ── Carburant ──
router.get(
  '/:id/pleins',
  autoriser('vehicule:lire'),
  asyncHandler(async (req, res) => {
    const v = await vehiculeDe(req);
    ok(res, await prisma.pleinCarburant.findMany({ where: { vehiculeId: v.id }, include: { mission: { select: { id: true, numero: true } } }, orderBy: { date: 'desc' } }));
  })
);

router.post(
  '/:id/pleins',
  autoriser('vehicule:gerer'),
  valider(
    z.object({
      missionId: id.nullable().optional(),
      date: z.coerce.date(),
      litres: z.coerce.number().positive(),
      montant: z.coerce.number().positive(),
      kilometrage: z.coerce.number().int().min(0).nullable().optional(),
      station: z.string().trim().max(200).nullable().optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const v = await vehiculeDe(req);
    const p = await prisma.pleinCarburant.create({ data: { ...req.body, vehiculeId: v.id } });
    if (req.body.kilometrage && req.body.kilometrage > v.kilometrage) await prisma.vehicule.update({ where: { id: v.id }, data: { kilometrage: req.body.kilometrage } });
    await audit({ req, action: 'CARBURANT', entite: 'Vehicule', entiteId: v.id, apres: p });
    created(res, p);
  })
);

// ── Entretien ──
router.get(
  '/:id/entretiens',
  autoriser('vehicule:lire'),
  asyncHandler(async (req, res) => {
    const v = await vehiculeDe(req);
    ok(res, await prisma.entretien.findMany({ where: { vehiculeId: v.id }, orderBy: { date: 'desc' } }));
  })
);

router.post(
  '/:id/entretiens',
  autoriser('vehicule:gerer'),
  valider(
    z.object({
      date: z.coerce.date(),
      type: z.string().trim().min(1).max(100),
      description: z.string().trim().max(1000).nullable().optional(),
      montant: z.coerce.number().min(0),
      kilometrage: z.coerce.number().int().min(0).nullable().optional(),
      garage: z.string().trim().max(200).nullable().optional(),
      prochainEntretienKm: z.coerce.number().int().min(0).nullable().optional(),
      prochainEntretienDate: dateNul,
    })
  ),
  asyncHandler(async (req, res) => {
    const v = await vehiculeDe(req);
    const e = await prisma.entretien.create({ data: { ...req.body, vehiculeId: v.id } });
    await audit({ req, action: 'ENTRETIEN', entite: 'Vehicule', entiteId: v.id, apres: e });
    created(res, e);
  })
);

/** Statistiques d'un véhicule : km parcourus, consommation, coût total. */
router.get(
  '/:id/statistiques',
  autoriser('vehicule:lire'),
  asyncHandler(async (req, res) => {
    const v = await vehiculeDe(req);
    const [carnet, pleins, entretiens] = await Promise.all([
      prisma.carnetBord.findMany({ where: { vehiculeId: v.id } }),
      prisma.pleinCarburant.findMany({ where: { vehiculeId: v.id } }),
      prisma.entretien.findMany({ where: { vehiculeId: v.id } }),
    ]);
    const km = carnet.reduce((a, c) => a + (c.kmArrivee - c.kmDepart), 0);
    const litres = pleins.reduce((a, p) => a + Number(p.litres), 0);
    const carburant = pleins.reduce((a, p) => a + Number(p.montant), 0);
    const entretien = entretiens.reduce((a, e) => a + Number(e.montant), 0);
    ok(res, {
      kmParcourus: km,
      litres: Math.round(litres * 100) / 100,
      consommationL100: km > 0 ? Math.round((litres / km) * 10000) / 100 : null,
      coutCarburant: Math.round(carburant * 100) / 100,
      coutEntretien: Math.round(entretien * 100) / 100,
      coutParKm: km > 0 ? Math.round(((carburant + entretien) / km) * 100) / 100 : null,
    });
  })
);

router.use(
  '/',
  crud({
    modele: 'vehicule',
    entite: 'Vehicule',
    permissionLecture: 'vehicule:lire',
    permissionEcriture: 'vehicule:gerer',
    schema: z.object({
      immatriculation: z.string().trim().min(1).max(30),
      marque: z.string().trim().min(1).max(60),
      modele: z.string().trim().min(1).max(60),
      carburant: z.string().trim().max(30).optional(),
      nbPlaces: z.coerce.number().int().min(1).max(60).optional(),
      kilometrage: z.coerce.number().int().min(0).optional(),
      statut: z.enum(['DISPONIBLE', 'EN_MISSION', 'EN_ENTRETIEN', 'HORS_SERVICE']).optional(),
      dateAssurance: dateNul,
      dateVisiteTechnique: dateNul,
    }),
    orderBy: { immatriculation: 'asc' },
  })
);

module.exports = router;
