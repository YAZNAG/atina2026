const router = require('express').Router();
const { z } = require('zod');
const { crud } = require('../../lib/crud');

const id = z.coerce.number().int().positive();
const idNul = id.nullable().optional();
const montant = z.coerce.number().min(0).max(1e9);
const dateStr = z.coerce.date();
const actif = z.boolean().optional();

router.use(
  '/services',
  crud({
    modele: 'service',
    entite: 'Service',
    schema: z.object({ code: z.string().trim().min(1).max(20), nom: z.string().trim().min(1), parentId: idNul, responsableId: idNul, actif }),
    include: { responsable: { select: { id: true, nom: true, prenom: true } }, parent: { select: { id: true, nom: true } } },
    orderBy: { nom: 'asc' },
  })
);

router.use(
  '/categories-agents',
  crud({
    modele: 'categorieAgent',
    entite: 'CategorieAgent',
    schema: z.object({ code: z.string().trim().min(1).max(20), libelle: z.string().trim().min(1), ordre: z.coerce.number().int().optional() }),
    orderBy: { ordre: 'asc' },
  })
);

router.use(
  '/fonctions',
  crud({
    modele: 'fonction',
    entite: 'Fonction',
    schema: z.object({ libelle: z.string().trim().min(1), categorieId: idNul, actif }),
    include: { categorie: true },
    orderBy: { libelle: 'asc' },
  })
);

router.use(
  '/zones',
  crud({
    modele: 'zone',
    entite: 'Zone',
    schema: z.object({ code: z.string().trim().min(1).max(20), libelle: z.string().trim().min(1), international: z.boolean().optional() }),
    orderBy: { code: 'asc' },
  })
);

router.use(
  '/destinations',
  crud({
    modele: 'destination',
    entite: 'Destination',
    schema: z.object({
      ville: z.string().trim().min(1),
      pays: z.string().trim().min(1).default('Maroc'),
      zoneId: id,
      distanceKm: z.coerce.number().int().min(0).nullable().optional(),
      actif,
    }),
    include: { zone: true },
    orderBy: [{ pays: 'asc' }, { ville: 'asc' }],
  })
);

router.use(
  '/baremes',
  crud({
    modele: 'bareme',
    entite: 'Bareme',
    schema: z
      .object({
        zoneId: id,
        categorieId: id,
        tauxJournalier: montant,
        tauxRepas: montant.default(0),
        plafondNuitee: montant.default(0),
        tauxKilometrique: montant.default(0),
        dateDebut: dateStr,
        dateFin: dateStr.nullable().optional(),
      }),
    include: { zone: true, categorie: true },
    orderBy: [{ zoneId: 'asc' }, { categorieId: 'asc' }, { dateDebut: 'desc' }],
  })
);

router.use(
  '/plafonds',
  crud({
    modele: 'plafondFrais',
    entite: 'PlafondFrais',
    schema: z.object({
      categorieFrais: z.enum(['TRANSPORT', 'HEBERGEMENT', 'REPAS', 'CARBURANT', 'PEAGE_PARKING', 'TAXI', 'DIVERS']),
      categorieAgentId: idNul,
      montant,
      unite: z.enum(['PAR_DEPENSE', 'PAR_JOUR']).default('PAR_DEPENSE'),
      justificatifObligatoire: z.boolean().optional(),
    }),
    include: { categorieAgent: true },
    orderBy: { categorieFrais: 'asc' },
  })
);

router.use(
  '/projets',
  crud({
    modele: 'projet',
    entite: 'Projet',
    schema: z.object({ code: z.string().trim().min(1).max(30), libelle: z.string().trim().min(1), actif }),
    orderBy: { code: 'asc' },
  })
);

module.exports = router;
