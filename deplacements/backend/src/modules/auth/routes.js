const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const config = require('../../config');
const prisma = require('../../lib/prisma');
const { asyncHandler, ok } = require('../../lib/http');
const { badRequest, unauthorized } = require('../../lib/errors');
const { valider } = require('../../middlewares/valider');
const { authentifier } = require('../../middlewares/auth');
const { audit } = require('../../lib/audit');
const { PERMISSIONS } = require('../../domain/permissions');
const { profil, schemaMotDePasse } = require('../utilisateurs/service');

const limiteurConnexion = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Trop de tentatives, réessayez dans quelques minutes' },
});

const journal = (data, req) =>
  prisma.connexionLog.create({
    data: { ...data, ip: req.ip, userAgent: String(req.headers['user-agent'] || '').slice(0, 300) },
  });

router.post(
  '/login',
  limiteurConnexion,
  valider(z.object({ email: z.string().trim().toLowerCase().email(), motDePasse: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const { email, motDePasse } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    const refus = async (motif, message = 'Identifiants incorrects') => {
      await journal({ email, succes: false, motif, userId: user?.id ?? null }, req);
      throw unauthorized(message);
    };

    if (!user) return refus('Utilisateur inconnu');
    if (!user.actif) return refus('Compte désactivé', 'Compte désactivé, contactez l’administrateur');
    if (user.verrouilleJusqua && user.verrouilleJusqua > new Date()) {
      return refus('Compte verrouillé', 'Compte temporairement verrouillé après plusieurs échecs, réessayez plus tard');
    }
    if (!(await bcrypt.compare(motDePasse, user.passwordHash))) {
      const tentatives = user.tentativesEchouees + 1;
      const verrou = tentatives >= config.maxTentatives;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          tentativesEchouees: verrou ? 0 : tentatives,
          verrouilleJusqua: verrou ? new Date(Date.now() + config.dureeVerrouillageMin * 60000) : null,
        },
      });
      return refus(verrou ? 'Mot de passe incorrect — compte verrouillé' : 'Mot de passe incorrect');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { tentativesEchouees: 0, verrouilleJusqua: null, derniereConnexion: new Date() },
    });
    await journal({ email, succes: true, userId: user.id }, req);
    const token = jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
    ok(res, { token, utilisateur: await profil(user.id) }, 'Connexion réussie');
  })
);

router.get(
  '/moi',
  authentifier,
  asyncHandler(async (req, res) => ok(res, await profil(req.user.id)))
);

router.post(
  '/mot-de-passe',
  authentifier,
  valider(z.object({ actuel: z.string().min(1), nouveau: schemaMotDePasse })),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!(await bcrypt.compare(req.body.actuel, user.passwordHash))) throw badRequest('Mot de passe actuel incorrect');
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(req.body.nouveau, 12), doitChangerMdp: false },
    });
    await audit({ req, action: 'CHANGEMENT_MOT_DE_PASSE', entite: 'User', entiteId: user.id });
    ok(res, null, 'Mot de passe modifié');
  })
);

router.post(
  '/deconnexion',
  authentifier,
  asyncHandler(async (req, res) => {
    await journal({ email: req.user.email, succes: true, motif: 'Déconnexion', userId: req.user.id }, req);
    ok(res, null, 'Déconnecté');
  })
);

router.get('/permissions', authentifier, (req, res) => ok(res, PERMISSIONS));

module.exports = router;
