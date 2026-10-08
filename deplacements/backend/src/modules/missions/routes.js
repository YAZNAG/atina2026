const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../../lib/prisma');
const { asyncHandler, ok, created, pagination, paginated } = require('../../lib/http');
const { forbidden, badRequest, notFound } = require('../../lib/errors');
const { valider } = require('../../middlewares/valider');
const { autoriser } = require('../../middlewares/auth');
const { audit } = require('../../lib/audit');
const { notifier } = require('../../lib/notifier');
const { envoyerPdf } = require('../../lib/excel');
const { chargerReferentielValidation, validateursEtapeCourante } = require('../../lib/contexte');
const S = require('./service');
const { pdfOrdreMission } = require('./pdf');

const id = z.coerce.number().int().positive();
const montant = z.coerce.number().min(0).max(1e8);

const schemaMission = z.object({
  objet: z.string().trim().min(3).max(300),
  description: z.string().trim().max(5000).nullable().optional(),
  destinationId: id,
  lieuPrecis: z.string().trim().max(300).nullable().optional(),
  dateDepart: z.coerce.date(),
  dateRetour: z.coerce.date(),
  moyenTransport: z.enum(['VOITURE_SERVICE', 'VOITURE_PERSONNELLE', 'TRAIN', 'AVION', 'AUTOCAR', 'TAXI', 'AUTRE']),
  vehiculeId: id.nullable().optional(),
  projetId: id.nullable().optional(),
  budgetId: id.nullable().optional(),
  participantIds: z.array(id).min(1).max(50).optional(),
  chefMissionId: id.nullable().optional(),
  nbRepasFournis: z.coerce.number().int().min(0).max(200).optional(),
  hebergementPrisEnCharge: z.boolean().optional(),
  fraisTransportEstimes: montant.optional(),
  autresFraisEstimes: montant.optional(),
});

const lireMission = async (req) => {
  const m = await S.chargerMission(req.params.id);
  await S.verifierLecture(req.user, m);
  return m;
};

router.use(autoriser('mission:lire'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const p = pagination(req.query);
    const q = (req.query.q || '').trim();
    const mes = req.query.mes === '1';
    const where = {
      AND: [
        mes ? { OR: [{ demandeurId: req.user.id }, { participants: { some: { userId: req.user.id } } }] } : await S.filtreVisibilite(req.user),
        req.query.statut ? { statut: { in: String(req.query.statut).split(',') } } : {},
        req.query.serviceId ? { serviceId: Number(req.query.serviceId) } : {},
        req.query.du ? { dateRetour: { gte: new Date(req.query.du) } } : {},
        req.query.au ? { dateDepart: { lte: new Date(req.query.au) } } : {},
        q
          ? {
              OR: [
                { objet: { contains: q, mode: 'insensitive' } },
                { numero: { contains: q, mode: 'insensitive' } },
                { destination: { ville: { contains: q, mode: 'insensitive' } } },
              ],
            }
          : {},
      ],
    };
    const [items, total] = await Promise.all([
      prisma.mission.findMany({ where, include: S.INCLUDE_LISTE, orderBy: { dateDepart: 'desc' }, skip: p.skip, take: p.take }),
      prisma.mission.count({ where }),
    ]);
    paginated(res, items, total, p);
  })
);

/** Missions dont l'étape en cours attend une décision de l'utilisateur. */
router.get(
  '/a-valider',
  asyncHandler(async (req, res) => {
    const enAttente = await prisma.mission.findMany({
      where: { statut: 'EN_ATTENTE' },
      include: { ...S.INCLUDE_LISTE, circuit: { include: { etapes: true } } },
      orderBy: { soumisLe: 'asc' },
    });
    const ref = await chargerReferentielValidation();
    ok(res, enAttente.filter((m) => validateursEtapeCourante(m, ref, m.demandeur).includes(req.user.id)));
  })
);

/** Calendrier des déplacements (missions visibles, hors brouillons et annulées). */
router.get(
  '/calendrier',
  autoriser('calendrier:lire'),
  asyncHandler(async (req, res) => {
    const du = req.query.du ? new Date(req.query.du) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const au = req.query.au ? new Date(req.query.au) : new Date(du.getFullYear(), du.getMonth() + 1, 0, 23, 59);
    const items = await prisma.mission.findMany({
      where: {
        AND: [
          await S.filtreVisibilite(req.user),
          { statut: { in: ['EN_ATTENTE', 'APPROUVE', 'EN_COURS', 'CLOTURE'] } },
          { dateDepart: { lte: au } },
          { dateRetour: { gte: du } },
          req.query.serviceId ? { serviceId: Number(req.query.serviceId) } : {},
          req.query.vehiculeId ? { vehiculeId: Number(req.query.vehiculeId) } : {},
        ],
      },
      include: S.INCLUDE_LISTE,
      orderBy: { dateDepart: 'asc' },
    });
    ok(res, items);
  })
);

router.post(
  '/estimation',
  valider(
    schemaMission.pick({ destinationId: true, dateDepart: true, dateRetour: true, nbRepasFournis: true, fraisTransportEstimes: true, autresFraisEstimes: true, participantIds: true })
  ),
  asyncHandler(async (req, res) => {
    if (new Date(req.body.dateRetour) <= new Date(req.body.dateDepart)) throw badRequest('Dates incohérentes');
    const participantIds = req.body.participantIds || [req.user.id];
    const [estimation, conflits] = await Promise.all([
      S.estimer({ ...req.body, participantIds }),
      S.conflitsPour({ id: req.query.missionId ? Number(req.query.missionId) : undefined, ...req.body, participantIds, vehiculeId: req.query.vehiculeId ? Number(req.query.vehiculeId) : null }),
    ]);
    ok(res, { estimation, conflits });
  })
);

router.post(
  '/',
  autoriser('mission:creer'),
  valider(schemaMission),
  asyncHandler(async (req, res) => created(res, await S.creer(req.user, req.body, req), 'Mission créée'))
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const m = await lireMission(req);
    const ref = await chargerReferentielValidation();
    const validateurs = m.statut === 'EN_ATTENTE' ? validateursEtapeCourante(m, ref, m.demandeur) : [];
    ok(res, {
      ...m,
      droits: {
        modifier: S.peutModifier(req.user, m),
        soumettre: m.demandeurId === req.user.id && m.statut === 'BROUILLON',
        valider: validateurs.includes(req.user.id),
        annuler: (m.demandeurId === req.user.id || req.user.role === 'ADMIN') && ['BROUILLON', 'EN_ATTENTE', 'APPROUVE'].includes(m.statut),
        demarrer: (m.demandeurId === req.user.id || req.user.permissions.includes('mission:cloturer')) && m.statut === 'APPROUVE',
        cloturer: (m.demandeurId === req.user.id || req.user.permissions.includes('mission:cloturer')) && m.statut === 'EN_COURS',
        reviser: m.demandeurId === req.user.id && m.statut === 'REFUSE',
        saisirFrais: m.participants.some((p) => p.userId === req.user.id) && ['APPROUVE', 'EN_COURS', 'CLOTURE'].includes(m.statut),
        gererReservations: (m.demandeurId === req.user.id || req.user.permissions.includes('note:controler')) && !['CLOTURE', 'ANNULE'].includes(m.statut),
      },
      validateursEnAttente: validateurs,
    });
  })
);

router.put(
  '/:id',
  valider(schemaMission.partial()),
  asyncHandler(async (req, res) => ok(res, await S.modifier(req.user, req.params.id, req.body, req), 'Mission mise à jour'))
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await S.supprimer(req.user, req.params.id, req);
    ok(res, null, 'Brouillon supprimé');
  })
);

router.post(
  '/:id/soumettre',
  asyncHandler(async (req, res) => {
    const r = await S.soumettre(req.user, req.params.id, req);
    ok(res, r.mission, r.mission.statut === 'APPROUVE' ? 'Mission approuvée automatiquement' : 'Mission soumise à validation');
  })
);

router.post(
  '/:id/decision',
  valider(z.object({ decision: z.enum(['APPROUVE', 'REFUSE']), commentaire: z.string().trim().max(2000).optional() })),
  asyncHandler(async (req, res) => {
    const m = await S.decider(req.user, req.params.id, req.body, req);
    ok(res, m, req.body.decision === 'APPROUVE' ? 'Validation enregistrée' : 'Mission refusée');
  })
);

const transition = (vers, message) =>
  asyncHandler(async (req, res) => ok(res, await S.changerStatut(req.user, req.params.id, vers, req, { motif: req.body?.motif }), message));

router.post('/:id/demarrer', transition('EN_COURS', 'Mission démarrée'));
router.post('/:id/cloturer', transition('CLOTURE', 'Mission clôturée'));
router.post('/:id/annuler', valider(z.object({ motif: z.string().trim().min(3).max(1000) })), transition('ANNULE', 'Mission annulée'));
router.post('/:id/reviser', transition('BROUILLON', 'Mission repassée en brouillon'));

router.get(
  '/:id/pdf',
  asyncHandler(async (req, res) => {
    const m = await lireMission(req);
    if (['BROUILLON', 'REFUSE', 'ANNULE'].includes(m.statut) && m.demandeurId !== req.user.id) throw forbidden();
    const buf = await pdfOrdreMission(m);
    await audit({ req, action: 'EDITION_PDF', entite: 'Mission', entiteId: m.id });
    envoyerPdf(res, buf, `ordre-mission-${m.numero || m.id}.pdf`, req.query.telecharger !== '1');
  })
);

/** Historique complet : validations + journal d'audit des modifications. */
router.get(
  '/:id/historique',
  asyncHandler(async (req, res) => {
    const m = await lireMission(req);
    const audits = await prisma.auditLog.findMany({
      where: { entite: 'Mission', entiteId: m.id },
      include: { user: { select: { nom: true, prenom: true } } },
      orderBy: { createdAt: 'asc' },
    });
    ok(res, { validations: m.validations, audits });
  })
);

// ── Échanges (messages) ──
router.get(
  '/:id/messages',
  asyncHandler(async (req, res) => {
    const m = await lireMission(req);
    ok(
      res,
      await prisma.messageMission.findMany({
        where: { missionId: m.id },
        include: { auteur: { select: { id: true, nom: true, prenom: true } } },
        orderBy: { createdAt: 'asc' },
      })
    );
  })
);

router.post(
  '/:id/messages',
  valider(z.object({ contenu: z.string().trim().min(1).max(4000) })),
  asyncHandler(async (req, res) => {
    const m = await lireMission(req);
    const msg = await prisma.messageMission.create({
      data: { missionId: m.id, auteurId: req.user.id, contenu: req.body.contenu },
      include: { auteur: { select: { id: true, nom: true, prenom: true } } },
    });
    const ref = await chargerReferentielValidation();
    const destinataires = [
      m.demandeurId,
      ...m.participants.map((p) => p.userId),
      ...m.validations.map((v) => v.validateurId),
      ...(m.statut === 'EN_ATTENTE' ? validateursEtapeCourante(m, ref, m.demandeur) : []),
    ].filter((u) => u && u !== req.user.id);
    await notifier(destinataires, {
      titre: `Nouveau message — mission ${m.numero || '#' + m.id}`,
      message: `${req.user.prenom} ${req.user.nom} : ${req.body.contenu.slice(0, 300)}`,
      lien: `/missions/${m.id}?onglet=echanges`,
    });
    created(res, msg);
  })
);

// ── Réservations : billets, transport, nuitées ──
const schemaReservation = z.object({
  type: z.enum(['BILLET_TRAIN', 'BILLET_AVION', 'BILLET_AUTOCAR', 'LOCATION_VOITURE', 'HEBERGEMENT', 'AUTRE']),
  prestataire: z.string().trim().max(200).nullable().optional(),
  reference: z.string().trim().max(100).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  dateDebut: z.coerce.date(),
  dateFin: z.coerce.date().nullable().optional(),
  nbNuits: z.coerce.number().int().min(0).max(365).optional(),
  montant,
  payePar: z.enum(['CHAMBRE', 'AGENT']).default('CHAMBRE'),
  beneficiaireId: id.nullable().optional(),
  documentId: id.nullable().optional(),
});

async function missionReservable(req) {
  const m = await lireMission(req);
  const autorise = m.demandeurId === req.user.id || req.user.permissions.includes('note:controler');
  if (!autorise || ['CLOTURE', 'ANNULE'].includes(m.statut)) throw forbidden('Réservations non modifiables');
  return m;
}

async function verifierDocument(documentId, user) {
  if (!documentId) return;
  const d = await prisma.document.findUnique({ where: { id: documentId } });
  if (!d || (d.uploadedById !== user.id && !user.permissions.includes('note:controler'))) throw badRequest('Justificatif invalide');
}

router.post(
  '/:id/reservations',
  valider(schemaReservation),
  asyncHandler(async (req, res) => {
    const m = await missionReservable(req);
    await verifierDocument(req.body.documentId, req.user);
    if (req.body.beneficiaireId && !m.participants.some((p) => p.userId === req.body.beneficiaireId)) {
      throw badRequest('Le bénéficiaire doit participer à la mission');
    }
    const r = await prisma.reservation.create({ data: { ...req.body, missionId: m.id } });
    await audit({ req, action: 'AJOUT_RESERVATION', entite: 'Mission', entiteId: m.id, apres: r });
    created(res, r);
  })
);

router.put(
  '/:id/reservations/:rid',
  valider(schemaReservation.partial()),
  asyncHandler(async (req, res) => {
    const m = await missionReservable(req);
    const avant = await prisma.reservation.findFirst({ where: { id: Number(req.params.rid), missionId: m.id } });
    if (!avant) throw notFound();
    await verifierDocument(req.body.documentId, req.user);
    const r = await prisma.reservation.update({ where: { id: avant.id }, data: req.body });
    await audit({ req, action: 'MODIFICATION_RESERVATION', entite: 'Mission', entiteId: m.id, avant, apres: r });
    ok(res, r);
  })
);

router.delete(
  '/:id/reservations/:rid',
  asyncHandler(async (req, res) => {
    const m = await missionReservable(req);
    const avant = await prisma.reservation.findFirst({ where: { id: Number(req.params.rid), missionId: m.id } });
    if (!avant) throw notFound();
    await prisma.reservation.delete({ where: { id: avant.id } });
    await audit({ req, action: 'SUPPRESSION_RESERVATION', entite: 'Mission', entiteId: m.id, avant });
    ok(res, null, 'Réservation supprimée');
  })
);

module.exports = router;
