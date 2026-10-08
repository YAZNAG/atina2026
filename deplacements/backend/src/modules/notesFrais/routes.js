const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../../lib/prisma');
const { asyncHandler, ok, created, pagination, paginated } = require('../../lib/http');
const { valider } = require('../../middlewares/valider');
const { autoriser } = require('../../middlewares/auth');
const { audit } = require('../../lib/audit');
const { envoyerPdf } = require('../../lib/excel');
const { chargerReferentielValidation, validateursEtapeCourante } = require('../../lib/contexte');
const S = require('./service');
const { pdfNoteFrais } = require('./pdf');

const id = z.coerce.number().int().positive();
const schemaLigne = z.object({
  date: z.coerce.date(),
  categorie: z.enum(['TRANSPORT', 'HEBERGEMENT', 'REPAS', 'CARBURANT', 'PEAGE_PARKING', 'TAXI', 'DIVERS']),
  description: z.string().trim().max(500).nullable().optional(),
  montant: z.coerce.number().positive('Montant positif requis').max(1e7),
  documentId: id.nullable().optional(),
});

const lire = async (req) => {
  const n = await S.charger(req.params.id);
  await S.verifierLecture(req.user, n);
  return n;
};

router.use(autoriser('note:saisir'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const p = pagination(req.query);
    const where = {
      AND: [
        req.query.mes === '1' ? { agentId: req.user.id } : await S.filtreVisibilite(req.user),
        req.query.statut ? { statut: { in: String(req.query.statut).split(',') } } : {},
        req.query.missionId ? { missionId: Number(req.query.missionId) } : {},
        req.query.q
          ? {
              OR: [
                { numero: { contains: req.query.q, mode: 'insensitive' } },
                { mission: { objet: { contains: req.query.q, mode: 'insensitive' } } },
                { agent: { nom: { contains: req.query.q, mode: 'insensitive' } } },
              ],
            }
          : {},
      ],
    };
    const [items, total] = await Promise.all([
      prisma.noteFrais.findMany({ where, include: S.INCLUDE_LISTE, orderBy: { updatedAt: 'desc' }, skip: p.skip, take: p.take }),
      prisma.noteFrais.count({ where }),
    ]);
    paginated(res, items, total, p);
  })
);

router.get(
  '/a-valider',
  asyncHandler(async (req, res) => {
    const soumises = await prisma.noteFrais.findMany({
      where: { statut: 'SOUMISE' },
      include: { ...S.INCLUDE_LISTE, circuit: { include: { etapes: true } } },
      orderBy: { soumiseLe: 'asc' },
    });
    const ref = await chargerReferentielValidation();
    ok(res, soumises.filter((n) => validateursEtapeCourante(n, ref, n.agent).includes(req.user.id)));
  })
);

router.post(
  '/',
  valider(z.object({ missionId: id })),
  asyncHandler(async (req, res) => created(res, await S.creer(req.user, req.body.missionId, req), 'Note de frais créée'))
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const n = await lire(req);
    const ref = await chargerReferentielValidation();
    const validateurs = n.statut === 'SOUMISE' ? validateursEtapeCourante(n, ref, n.agent) : [];
    const estAgent = n.agentId === req.user.id;
    const controleur = req.user.permissions.includes('note:controler');
    const calcul = await S.donneesCalcul(n);
    ok(res, {
      ...n,
      calcul: {
        bareme: calcul.bareme,
        nuitsRemboursables: calcul.nuitsRemboursables,
        indemnites: calcul.indemnites,
        hebergementPrisEnCharge: calcul.mission.hebergementPrisEnCharge,
        nbRepasFournis: calcul.mission.nbRepasFournis,
      },
      droits: {
        modifier: estAgent && n.statut === 'BROUILLON',
        soumettre: estAgent && n.statut === 'BROUILLON',
        valider: validateurs.includes(req.user.id),
        controler: controleur && ['SOUMISE', 'VALIDEE'].includes(n.statut),
        rembourser: req.user.permissions.includes('note:rembourser') && n.statut === 'VALIDEE',
        reviser: estAgent && n.statut === 'REJETEE',
      },
    });
  })
);

router.post(
  '/:id/lignes',
  valider(schemaLigne),
  asyncHandler(async (req, res) => created(res, await S.ajouterLigne(req.user, req.params.id, req.body, req), 'Dépense ajoutée'))
);

router.put(
  '/:id/lignes/:ligneId',
  valider(schemaLigne.partial()),
  asyncHandler(async (req, res) => ok(res, await S.modifierLigne(req.user, req.params.id, req.params.ligneId, req.body, req), 'Dépense modifiée'))
);

router.delete(
  '/:id/lignes/:ligneId',
  asyncHandler(async (req, res) => {
    await S.supprimerLigne(req.user, req.params.id, req.params.ligneId, req);
    ok(res, null, 'Dépense supprimée');
  })
);

router.post('/:id/soumettre', asyncHandler(async (req, res) => ok(res, await S.soumettre(req.user, req.params.id, req), 'Note de frais soumise')));

router.post(
  '/:id/decision',
  valider(z.object({ decision: z.enum(['APPROUVE', 'REFUSE']), commentaire: z.string().trim().max(2000).optional() })),
  asyncHandler(async (req, res) =>
    ok(res, await S.decider(req.user, req.params.id, req.body, req), req.body.decision === 'APPROUVE' ? 'Validation enregistrée' : 'Note rejetée')
  )
);

router.post(
  '/:id/lignes/:ligneId/controle',
  autoriser('note:controler'),
  valider(z.object({ statutControle: z.enum(['EN_ATTENTE', 'CONFORME', 'NON_CONFORME']), commentaireControle: z.string().trim().max(1000).nullable().optional() })),
  asyncHandler(async (req, res) => ok(res, await S.controlerLigne(req.user, req.params.id, req.params.ligneId, req.body, req), 'Contrôle enregistré'))
);

router.post(
  '/:id/rembourser',
  autoriser('note:rembourser'),
  valider(
    z.object({
      modePaiement: z.enum(['VIREMENT', 'CHEQUE', 'ESPECES', 'COMPENSATION']),
      referencePaiement: z.string().trim().max(100).optional(),
      date: z.coerce.date().optional(),
    })
  ),
  asyncHandler(async (req, res) => ok(res, await S.rembourser(req.user, req.params.id, req.body, req), 'Remboursement enregistré'))
);

router.post('/:id/reviser', asyncHandler(async (req, res) => ok(res, await S.reviser(req.user, req.params.id, req), 'Note repassée en brouillon')));

router.get(
  '/:id/pdf',
  asyncHandler(async (req, res) => {
    const n = await lire(req);
    const buf = await pdfNoteFrais(n);
    await audit({ req, action: 'EDITION_PDF', entite: 'NoteFrais', entiteId: n.id });
    envoyerPdf(res, buf, `note-frais-${n.numero || n.id}.pdf`, req.query.telecharger !== '1');
  })
);

router.get(
  '/:id/historique',
  asyncHandler(async (req, res) => {
    const n = await lire(req);
    const audits = await prisma.auditLog.findMany({
      where: { entite: 'NoteFrais', entiteId: n.id },
      include: { user: { select: { nom: true, prenom: true } } },
      orderBy: { createdAt: 'asc' },
    });
    ok(res, { validations: n.validations, audits });
  })
);

module.exports = router;
