/** Administration : paramètres, modèles de documents, journaux, sauvegardes. */
const router = require('express').Router();
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { z } = require('zod');
const prisma = require('../../lib/prisma');
const config = require('../../config');
const { asyncHandler, ok, created, pagination, paginated } = require('../../lib/http');
const { badRequest, notFound } = require('../../lib/errors');
const { valider } = require('../../middlewares/valider');
const { autoriser } = require('../../middlewares/auth');
const { upload } = require('../../middlewares/upload');
const { audit } = require('../../lib/audit');
const { tousLesParametres, definirParametre, DEFAUTS } = require('../../lib/parametres');
const { detecterType } = require('../../lib/stockage');
const { sauvegarder } = require('../../lib/sauvegarde');
const jobs = require('../../jobs/taches');

const dossierParametres = path.resolve(config.uploadDir, '..', 'parametres');

// ── Paramètres généraux ──
const schemaParametres = z
  .object({
    organisme: z.object({ nom: z.string().trim().min(1), adresse: z.string().trim().optional(), telephone: z.string().trim().optional(), email: z.string().trim().optional(), ville: z.string().trim().optional() }),
    devise: z.literal('MAD'),
    tauxTVA: z.coerce.number().min(0).max(100),
    exerciceDebutMois: z.coerce.number().int().min(1).max(12),
    anneeFiscale: z.coerce.number().int().min(2000).max(2100),
    dureeConservationAnnees: z.coerce.number().int().min(1).max(50),
    regles_indemnites: z.object({
      heureLimiteDepart: z.coerce.number().min(0).max(24),
      heureLimiteRetour: z.coerce.number().min(0).max(24),
      dureeMinJourneeH: z.coerce.number().min(0).max(24),
    }),
    rappels: z.object({ joursApresRetour: z.coerce.number().int().min(0).max(60), joursRelanceValidation: z.coerce.number().int().min(1).max(30) }),
    bloquerDepassementBudget: z.boolean(),
    comptabilite: z.object({
      journal: z.string().trim().min(1).max(10),
      compteCredit: z.string().trim().min(1).max(20),
      libelleCompteCredit: z.string().trim().optional(),
      comptes: z.record(z.string().trim().max(20)),
    }),
  })
  .partial();

router.get(
  '/parametres',
  autoriser('referentiel:lire'),
  asyncHandler(async (req, res) => ok(res, await tousLesParametres()))
);

router.put(
  '/parametres',
  autoriser('admin:parametres'),
  valider(schemaParametres),
  asyncHandler(async (req, res) => {
    const avant = await tousLesParametres();
    for (const [cle, valeur] of Object.entries(req.body)) {
      if (!(cle in DEFAUTS)) continue;
      await definirParametre(cle, valeur);
    }
    const apres = await tousLesParametres();
    await audit({
      req,
      action: 'MODIFICATION',
      entite: 'Parametre',
      avant: Object.fromEntries(Object.keys(req.body).map((k) => [k, JSON.stringify(avant[k])])),
      apres: Object.fromEntries(Object.keys(req.body).map((k) => [k, JSON.stringify(apres[k])])),
    });
    ok(res, apres, 'Paramètres enregistrés');
  })
);

/** Logo ou en-tête des documents (PNG / JPEG). */
router.post(
  '/parametres/:type(logo|entete)',
  autoriser('admin:parametres'),
  upload.single('fichier'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('Aucun fichier reçu');
    const type = detecterType(req.file.buffer);
    if (!['image/png', 'image/jpeg'].includes(type)) throw badRequest('Image PNG ou JPEG attendue');
    await fsp.mkdir(dossierParametres, { recursive: true });
    const nom = `${req.params.type}-${Date.now()}.${type === 'image/png' ? 'png' : 'jpg'}`;
    await fsp.writeFile(path.join(dossierParametres, nom), req.file.buffer);
    await definirParametre(req.params.type, nom);
    await audit({ req, action: 'TELEVERSEMENT', entite: 'Parametre', apres: { [req.params.type]: nom } });
    ok(res, { [req.params.type]: nom }, 'Image enregistrée');
  })
);

router.delete(
  '/parametres/:type(logo|entete)',
  autoriser('admin:parametres'),
  asyncHandler(async (req, res) => {
    await definirParametre(req.params.type, null);
    await audit({ req, action: 'REINITIALISATION', entite: 'Parametre', apres: { [req.params.type]: 'défaut' } });
    ok(res, null, 'Image par défaut rétablie');
  })
);

// ── Modèles de documents ──
const schemaModele = z.object({
  titre: z.string().trim().min(1).max(200),
  texteIntro: z.string().trim().max(3000).nullable().optional(),
  textePied: z.string().trim().max(1000).nullable().optional(),
  signataires: z.array(z.object({ libelle: z.string().trim().min(1).max(100) })).max(4),
  afficherEntete: z.boolean().optional(),
});

router.get('/modeles', autoriser('admin:parametres'), asyncHandler(async (req, res) => ok(res, await prisma.modeleDocument.findMany({ orderBy: { code: 'asc' } }))));

router.put(
  '/modeles/:code',
  autoriser('admin:parametres'),
  valider(schemaModele),
  asyncHandler(async (req, res) => {
    const code = String(req.params.code).toUpperCase();
    if (!['ORDRE_MISSION', 'NOTE_FRAIS'].includes(code)) throw notFound('Modèle inconnu');
    const avant = await prisma.modeleDocument.findUnique({ where: { code } });
    const m = await prisma.modeleDocument.upsert({ where: { code }, create: { code, ...req.body }, update: req.body });
    await audit({ req, action: 'MODIFICATION', entite: 'ModeleDocument', entiteId: m.id, avant: avant && { ...avant, signataires: JSON.stringify(avant.signataires) }, apres: { ...m, signataires: JSON.stringify(m.signataires) } });
    ok(res, m, 'Modèle enregistré');
  })
);

// ── Journaux ──
router.get(
  '/audit',
  autoriser('admin:audit'),
  asyncHandler(async (req, res) => {
    const p = pagination(req.query);
    const where = {
      ...(req.query.entite && { entite: req.query.entite }),
      ...(req.query.entiteId && { entiteId: Number(req.query.entiteId) }),
      ...(req.query.userId && { userId: Number(req.query.userId) }),
      ...(req.query.action && { action: req.query.action }),
      ...((req.query.du || req.query.au) && {
        createdAt: { ...(req.query.du && { gte: new Date(req.query.du) }), ...(req.query.au && { lte: new Date(`${req.query.au}T23:59:59`) }) },
      }),
    };
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({ where, include: { user: { select: { nom: true, prenom: true, email: true } } }, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take }),
      prisma.auditLog.count({ where }),
    ]);
    paginated(res, items, total, p);
  })
);

router.get(
  '/connexions',
  autoriser('admin:audit'),
  asyncHandler(async (req, res) => {
    const p = pagination(req.query);
    const where = {
      ...(req.query.succes && { succes: req.query.succes === '1' }),
      ...(req.query.q && { email: { contains: req.query.q, mode: 'insensitive' } }),
    };
    const [items, total] = await Promise.all([
      prisma.connexionLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take }),
      prisma.connexionLog.count({ where }),
    ]);
    paginated(res, items, total, p);
  })
);

router.get(
  '/emails',
  autoriser('admin:audit'),
  asyncHandler(async (req, res) => {
    const p = pagination(req.query);
    const [items, total] = await Promise.all([
      prisma.emailLog.findMany({ orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take }),
      prisma.emailLog.count(),
    ]);
    paginated(res, items, total, p);
  })
);

// ── Sauvegardes ──
router.get('/sauvegardes', autoriser('admin:sauvegardes'), asyncHandler(async (req, res) => ok(res, await prisma.sauvegarde.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }))));

router.post(
  '/sauvegardes',
  autoriser('admin:sauvegardes'),
  asyncHandler(async (req, res) => {
    const s = await sauvegarder();
    await audit({ req, action: 'SAUVEGARDE', entite: 'Sauvegarde', entiteId: s.id, apres: s });
    if (s.statut !== 'OK') throw badRequest(`Échec de la sauvegarde : ${s.erreur}`);
    created(res, s, 'Sauvegarde effectuée');
  })
);

router.get(
  '/sauvegardes/:id/:partie(base|justificatifs)',
  autoriser('admin:sauvegardes'),
  asyncHandler(async (req, res) => {
    const s = await prisma.sauvegarde.findUnique({ where: { id: Number(req.params.id) } });
    if (!s || s.statut !== 'OK') throw notFound();
    const fichier = path.join(config.backupDir, req.params.partie === 'base' ? `${s.fichier}.dump` : `${s.fichier}-justificatifs.tar.gz`);
    if (!fs.existsSync(fichier)) throw notFound('Fichier de sauvegarde absent');
    await audit({ req, action: 'TELECHARGEMENT_SAUVEGARDE', entite: 'Sauvegarde', entiteId: s.id });
    res.download(fichier);
  })
);

/** Exécution manuelle des tâches planifiées (rappels, passage en cours). */
router.post(
  '/taches/:nom',
  autoriser('admin:parametres'),
  asyncHandler(async (req, res) => {
    const tache = jobs.TACHES[req.params.nom];
    if (!tache) throw notFound('Tâche inconnue');
    const r = await tache();
    await audit({ req, action: 'TACHE_MANUELLE', entite: 'Tache', apres: { nom: req.params.nom, ...r } });
    ok(res, r, 'Tâche exécutée');
  })
);

module.exports = router;
module.exports.dossierParametres = dossierParametres;
