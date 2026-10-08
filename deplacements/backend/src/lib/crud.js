/** Routeur CRUD générique pour les référentiels (lecture pour tous, écriture selon permission). */
const express = require('express');
const prisma = require('./prisma');
const { asyncHandler, ok, created } = require('./http');
const { notFound } = require('./errors');
const { valider } = require('../middlewares/valider');
const { autoriser } = require('../middlewares/auth');
const { audit } = require('./audit');

/**
 * @param {object} o
 * @param {string} o.modele nom du délégué Prisma (ex. 'service')
 * @param {string} o.entite nom pour l'audit (ex. 'Service')
 * @param {import('zod').ZodObject} o.schema
 * @param {object} [o.include] relations à inclure en lecture
 * @param {object} [o.orderBy]
 * @param {string} [o.permissionEcriture]
 * @param {string} [o.permissionLecture]
 * @param {(query:object)=>object} [o.filtre]
 * @param {(data:object)=>object} [o.avantEcriture]
 */
function crud({
  modele,
  entite,
  schema,
  include,
  orderBy = { id: 'asc' },
  permissionEcriture = 'admin:referentiels',
  permissionLecture = 'referentiel:lire',
  filtre = () => ({}),
  avantEcriture = (d) => d,
}) {
  const r = express.Router();
  const delegue = prisma[modele];

  r.get(
    '/',
    autoriser(permissionLecture),
    asyncHandler(async (req, res) => ok(res, await delegue.findMany({ where: filtre(req.query), include, orderBy })))
  );

  r.get(
    '/:id',
    autoriser(permissionLecture),
    asyncHandler(async (req, res) => {
      const item = await delegue.findUnique({ where: { id: Number(req.params.id) }, include });
      if (!item) throw notFound();
      ok(res, item);
    })
  );

  r.post(
    '/',
    autoriser(permissionEcriture),
    valider(schema),
    asyncHandler(async (req, res) => {
      const item = await delegue.create({ data: avantEcriture(req.body), include });
      await audit({ req, action: 'CREATION', entite, entiteId: item.id, apres: item });
      created(res, item);
    })
  );

  r.put(
    '/:id',
    autoriser(permissionEcriture),
    valider(schema.partial()),
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const avant = await delegue.findUnique({ where: { id } });
      if (!avant) throw notFound();
      const item = await delegue.update({ where: { id }, data: avantEcriture(req.body), include });
      await audit({ req, action: 'MODIFICATION', entite, entiteId: id, avant, apres: item });
      ok(res, item);
    })
  );

  r.delete(
    '/:id',
    autoriser(permissionEcriture),
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const avant = await delegue.findUnique({ where: { id } });
      if (!avant) throw notFound();
      await delegue.delete({ where: { id } });
      await audit({ req, action: 'SUPPRESSION', entite, entiteId: id, avant });
      ok(res, null, 'Supprimé');
    })
  );

  return r;
}

module.exports = { crud };
