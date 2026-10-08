const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { z } = require('zod');
const prisma = require('../../lib/prisma');
const { asyncHandler, ok, created, pagination, paginated } = require('../../lib/http');
const { notFound, badRequest } = require('../../lib/errors');
const { valider } = require('../../middlewares/valider');
const { autoriser } = require('../../middlewares/auth');
const { encryptText } = require('../../lib/crypto');
const { audit } = require('../../lib/audit');
const { envoyerEmail } = require('../../lib/mailer');
const { SELECT_PUBLIC, presenter, schemaMotDePasse } = require('./service');

const idOpt = z.coerce.number().int().positive().nullable().optional();
const base = {
  matricule: z.string().trim().min(1).max(30),
  nom: z.string().trim().min(1).max(80),
  prenom: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(['AGENT', 'VALIDATEUR', 'FINANCIER', 'ADMIN']),
  perimetreGlobal: z.boolean().optional(),
  telephone: z.string().trim().max(30).nullable().optional(),
  serviceId: idOpt,
  fonctionId: idOpt,
  categorieId: idOpt,
  actif: z.boolean().optional(),
  cin: z.string().trim().max(20).nullable().optional(),
  rib: z.string().trim().max(34).nullable().optional(),
};
const schemaCreation = z.object({ ...base, motDePasse: schemaMotDePasse.optional() });
const schemaMaj = z.object(base).partial();

function donnees(body) {
  const { cin, rib, motDePasse, ...d } = body;
  if (cin !== undefined) d.cinChiffre = encryptText(cin);
  if (rib !== undefined) d.ribChiffre = encryptText(rib);
  return d;
}

const motDePasseTemporaire = () => `Ca${crypto.randomBytes(6).toString('base64url')}9x`;

/** Annuaire minimal accessible à tous (choix des participants). */
router.get(
  '/annuaire',
  asyncHandler(async (req, res) => {
    const users = await prisma.user.findMany({
      where: { actif: true },
      select: { id: true, nom: true, prenom: true, matricule: true, serviceId: true, categorieId: true, role: true,
        service: { select: { nom: true } }, fonction: { select: { libelle: true } } },
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    });
    ok(res, users);
  })
);

router.use(autoriser('admin:utilisateurs'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const p = pagination(req.query);
    const q = (req.query.q || '').trim();
    const where = {
      ...(q && {
        OR: ['nom', 'prenom', 'email', 'matricule'].map((f) => ({ [f]: { contains: q, mode: 'insensitive' } })),
      }),
      ...(req.query.role && { role: req.query.role }),
      ...(req.query.serviceId && { serviceId: Number(req.query.serviceId) }),
    };
    const [items, total] = await Promise.all([
      prisma.user.findMany({ where, select: { ...SELECT_PUBLIC, cinChiffre: true, ribChiffre: true }, orderBy: { nom: 'asc' }, skip: p.skip, take: p.take }),
      prisma.user.count({ where }),
    ]);
    paginated(res, items.map((u) => presenter(u)), total, p);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const u = await prisma.user.findUnique({
      where: { id: Number(req.params.id) },
      select: { ...SELECT_PUBLIC, cinChiffre: true, ribChiffre: true },
    });
    if (!u) throw notFound();
    await audit({ req, action: 'CONSULTATION_DONNEES_SENSIBLES', entite: 'User', entiteId: u.id });
    ok(res, presenter(u, { complet: true }));
  })
);

router.post(
  '/',
  valider(schemaCreation),
  asyncHandler(async (req, res) => {
    const mdp = req.body.motDePasse || motDePasseTemporaire();
    const u = await prisma.user.create({
      data: { ...donnees(req.body), passwordHash: await bcrypt.hash(mdp, 12), doitChangerMdp: true },
      select: SELECT_PUBLIC,
    });
    await audit({ req, action: 'CREATION', entite: 'User', entiteId: u.id, apres: u });
    await envoyerEmail({
      to: u.email,
      sujet: 'Votre compte — Gestion des déplacements',
      message: `Bonjour ${u.prenom},\nVotre compte a été créé.\nIdentifiant : ${u.email}\nMot de passe provisoire : ${mdp}\nVous devrez le modifier à la première connexion.`,
      lien: '/connexion',
    });
    created(res, { ...u, motDePasseProvisoire: req.body.motDePasse ? undefined : mdp });
  })
);

router.put(
  '/:id',
  valider(schemaMaj),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const avant = await prisma.user.findUnique({ where: { id } });
    if (!avant) throw notFound();
    if (id === req.user.id && (req.body.actif === false || (req.body.role && req.body.role !== 'ADMIN'))) {
      throw badRequest('Vous ne pouvez pas retirer vos propres droits d’administration');
    }
    const u = await prisma.user.update({ where: { id }, data: donnees(req.body) });
    await audit({ req, action: 'MODIFICATION', entite: 'User', entiteId: id, avant, apres: u });
    ok(res, presenter(u));
  })
);

router.post(
  '/:id/reinitialiser-mot-de-passe',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const mdp = motDePasseTemporaire();
    const u = await prisma.user.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(mdp, 12), doitChangerMdp: true, tentativesEchouees: 0, verrouilleJusqua: null },
    });
    await audit({ req, action: 'REINITIALISATION_MOT_DE_PASSE', entite: 'User', entiteId: id });
    await envoyerEmail({
      to: u.email,
      sujet: 'Réinitialisation de votre mot de passe',
      message: `Bonjour ${u.prenom},\nVotre mot de passe a été réinitialisé.\nMot de passe provisoire : ${mdp}`,
      lien: '/connexion',
    });
    ok(res, { motDePasseProvisoire: mdp }, 'Mot de passe réinitialisé');
  })
);

module.exports = router;
