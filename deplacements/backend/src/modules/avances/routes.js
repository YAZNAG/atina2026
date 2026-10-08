const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../../lib/prisma');
const { asyncHandler, ok, created } = require('../../lib/http');
const { badRequest, forbidden, notFound, conflict } = require('../../lib/errors');
const { valider } = require('../../middlewares/valider');
const { autoriser } = require('../../middlewares/auth');
const { audit } = require('../../lib/audit');
const { notifier } = require('../../lib/notifier');
const { prochainNumero } = require('../../lib/numerotation');
const notes = require('../notesFrais/service');

const include = {
  agent: { select: { id: true, nom: true, prenom: true, matricule: true } },
  mission: { select: { id: true, numero: true, objet: true, dateDepart: true, statut: true } },
  noteFrais: { select: { id: true, numero: true, statut: true } },
};

router.get(
  '/',
  autoriser('avance:demander'),
  asyncHandler(async (req, res) => {
    const gestion = req.user.permissions.includes('avance:gerer');
    const where = {
      ...(!gestion || req.query.mes === '1' ? { agentId: req.user.id } : {}),
      ...(req.query.statut && { statut: { in: String(req.query.statut).split(',') } }),
      ...(req.query.missionId && { missionId: Number(req.query.missionId) }),
    };
    ok(res, await prisma.avance.findMany({ where, include, orderBy: { createdAt: 'desc' } }));
  })
);

/** Demande d'avance par un participant d'une mission approuvée ou en attente. */
router.post(
  '/',
  autoriser('avance:demander'),
  valider(z.object({ missionId: z.coerce.number().int().positive(), montant: z.coerce.number().positive().max(1e7), commentaire: z.string().trim().max(1000).optional() })),
  asyncHandler(async (req, res) => {
    const m = await prisma.mission.findUnique({ where: { id: req.body.missionId }, include: { participants: true } });
    if (!m) throw notFound('Mission introuvable');
    if (!m.participants.some((p) => p.userId === req.user.id)) throw forbidden('Vous ne participez pas à cette mission');
    if (!['EN_ATTENTE', 'APPROUVE', 'EN_COURS'].includes(m.statut)) throw badRequest('Avance possible uniquement avant ou pendant la mission');
    const enCours = await prisma.avance.count({ where: { missionId: m.id, agentId: req.user.id, statut: { in: ['DEMANDEE', 'VERSEE'] } } });
    if (enCours) throw conflict('Une avance est déjà en cours pour cette mission');
    const a = await prisma.avance.create({ data: { ...req.body, agentId: req.user.id }, include });
    await audit({ req, action: 'DEMANDE', entite: 'Avance', entiteId: a.id, apres: a });
    const fin = await prisma.user.findMany({ where: { role: 'FINANCIER', actif: true }, select: { id: true } });
    await notifier(fin.map((u) => u.id), {
      titre: 'Nouvelle demande d’avance',
      message: `${req.user.prenom} ${req.user.nom} demande une avance de ${req.body.montant.toFixed(2)} MAD pour la mission « ${m.objet} ».`,
      lien: '/avances',
    });
    created(res, a, 'Demande d’avance enregistrée');
  })
);

router.post(
  '/:id/verser',
  autoriser('avance:gerer'),
  valider(
    z.object({
      montant: z.coerce.number().positive().optional(),
      modeVersement: z.enum(['VIREMENT', 'CHEQUE', 'ESPECES']),
      referenceVersement: z.string().trim().max(100).optional(),
      date: z.coerce.date().optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const avant = await prisma.avance.findUnique({ where: { id: Number(req.params.id) }, include: { mission: true } });
    if (!avant) throw notFound();
    if (avant.statut !== 'DEMANDEE') throw conflict('Cette avance n’est pas en attente de versement');
    if (!['APPROUVE', 'EN_COURS'].includes(avant.mission.statut)) throw badRequest('La mission doit être approuvée avant versement');
    const a = await prisma.avance.update({
      where: { id: avant.id },
      data: {
        numero: await prochainNumero('AV'),
        statut: 'VERSEE',
        montant: req.body.montant ?? avant.montant,
        modeVersement: req.body.modeVersement,
        referenceVersement: req.body.referenceVersement,
        verseeLe: req.body.date || new Date(),
      },
      include,
    });
    await audit({ req, action: 'VERSEMENT', entite: 'Avance', entiteId: a.id, avant, apres: a });
    // Une note en brouillon doit déduire immédiatement la nouvelle avance.
    const note = await prisma.noteFrais.findUnique({ where: { missionId_agentId: { missionId: a.missionId, agentId: a.agentId } } });
    if (note && note.statut !== 'REMBOURSEE') await notes.recalculer(note.id);
    await notifier([a.agentId], {
      titre: `Avance ${a.numero} versée`,
      message: `Une avance de ${Number(a.montant).toFixed(2)} MAD vous a été versée (${a.modeVersement}). Elle sera déduite de votre note de frais.`,
      lien: `/missions/${a.missionId}`,
    });
    ok(res, a, 'Avance versée');
  })
);

router.post(
  '/:id/annuler',
  autoriser('avance:demander'),
  valider(z.object({ commentaire: z.string().trim().max(1000).optional() })),
  asyncHandler(async (req, res) => {
    const avant = await prisma.avance.findUnique({ where: { id: Number(req.params.id) } });
    if (!avant) throw notFound();
    const gestion = req.user.permissions.includes('avance:gerer');
    if (avant.agentId !== req.user.id && !gestion) throw forbidden();
    if (avant.statut !== 'DEMANDEE') throw conflict('Seule une demande non versée peut être annulée');
    const a = await prisma.avance.update({ where: { id: avant.id }, data: { statut: 'ANNULEE', commentaire: req.body.commentaire ?? avant.commentaire }, include });
    await audit({ req, action: 'ANNULATION', entite: 'Avance', entiteId: a.id, avant, apres: a });
    if (avant.agentId !== req.user.id) {
      await notifier([a.agentId], { titre: 'Demande d’avance annulée', message: req.body.commentaire || 'Votre demande d’avance a été annulée.', lien: '/avances' });
    }
    ok(res, a, 'Avance annulée');
  })
);

module.exports = router;
