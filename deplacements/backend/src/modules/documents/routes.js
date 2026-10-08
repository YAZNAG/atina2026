/** Pièces justificatives : téléversement chiffré, consultation contrôlée, conservation légale. */
const router = require('express').Router();
const prisma = require('../../lib/prisma');
const { asyncHandler, created, ok } = require('../../lib/http');
const { badRequest, forbidden, notFound } = require('../../lib/errors');
const { upload } = require('../../middlewares/upload');
const stockage = require('../../lib/stockage');
const { audit } = require('../../lib/audit');
const { tousLesParametres } = require('../../lib/parametres');
const missions = require('../missions/service');

async function verifierAccesMission(user, missionId) {
  const m = await missions.chargerMission(missionId, { demandeur: true, circuit: { include: { etapes: true } } });
  await missions.verifierLecture(user, m);
  return m;
}

/** POST /documents (multipart: fichier, missionId?, noteFraisId?, categorie?) */
router.post(
  '/',
  upload.single('fichier'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('Aucun fichier reçu');
    const missionId = req.body.missionId ? Number(req.body.missionId) : null;
    const noteFraisId = req.body.noteFraisId ? Number(req.body.noteFraisId) : null;
    if (missionId) await verifierAccesMission(req.user, missionId);
    if (noteFraisId) {
      const n = await prisma.noteFrais.findUnique({ where: { id: noteFraisId } });
      if (!n || (n.agentId !== req.user.id && !req.user.permissions.includes('note:controler'))) throw forbidden();
    }
    const params = await tousLesParametres();
    const f = await stockage.enregistrer(req.file.buffer);
    const conserver = new Date();
    conserver.setFullYear(conserver.getFullYear() + Number(params.dureeConservationAnnees || 10));
    const nom = Buffer.from(req.file.originalname, 'latin1').toString('utf8').replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 200);
    const doc = await prisma.document.create({
      data: {
        nomOriginal: nom || 'justificatif',
        mimeType: f.mimeType,
        taille: f.taille,
        cheminStockage: f.chemin,
        sha256: f.sha256,
        chiffre: true,
        categorie: String(req.body.categorie || 'JUSTIFICATIF').slice(0, 40),
        uploadedById: req.user.id,
        missionId,
        noteFraisId,
        conserverJusqua: conserver,
      },
      select: { id: true, nomOriginal: true, mimeType: true, taille: true, categorie: true, createdAt: true },
    });
    await audit({ req, action: 'TELEVERSEMENT', entite: 'Document', entiteId: doc.id, apres: doc });
    created(res, doc, 'Justificatif enregistré');
  })
);

/** Téléchargement : auteur, parties prenantes de la mission ou de la note, finance et admin. */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const doc = await prisma.document.findUnique({
      where: { id: Number(req.params.id) },
      include: { ligne: { include: { noteFrais: true } }, reservation: true },
    });
    if (!doc) throw notFound();
    const u = req.user;
    let autorise = doc.uploadedById === u.id || u.permissions.includes('mission:lire_tout');
    const missionId = doc.missionId || doc.reservation?.missionId || doc.ligne?.noteFrais?.missionId || null;
    if (!autorise && missionId) {
      try {
        await verifierAccesMission(u, missionId);
        autorise = true;
      } catch {
        /* refus ci-dessous */
      }
    }
    if (!autorise) throw forbidden();
    const contenu = await stockage.lire(doc);
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(doc.nomOriginal)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(contenu);
  })
);

/** Suppression : seulement par l'auteur, et seulement si la pièce n'est rattachée à rien de soumis. */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const doc = await prisma.document.findUnique({
      where: { id: Number(req.params.id) },
      include: { ligne: { include: { noteFrais: true } }, reservation: true },
    });
    if (!doc) throw notFound();
    if (doc.uploadedById !== req.user.id) throw forbidden();
    if (doc.ligne && doc.ligne.noteFrais.statut !== 'BROUILLON') {
      throw forbidden('Pièce rattachée à une note soumise : conservation obligatoire');
    }
    if (doc.reservation) throw forbidden('Pièce rattachée à une réservation : retirez-la de la réservation d’abord');
    if (doc.ligne) await prisma.ligneFrais.update({ where: { id: doc.ligne.id }, data: { documentId: null } });
    await prisma.document.delete({ where: { id: doc.id } });
    await stockage.supprimer(doc.cheminStockage);
    await audit({ req, action: 'SUPPRESSION', entite: 'Document', entiteId: doc.id, avant: doc });
    ok(res, null, 'Pièce supprimée');
  })
);

module.exports = router;
