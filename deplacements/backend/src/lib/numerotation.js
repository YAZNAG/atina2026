const prisma = require('./prisma');

/**
 * Numéro séquentiel par préfixe et année, atomique côté base : OM-2026-0001.
 * @param {string} prefixe OM (ordre de mission), NF (note de frais), AV (avance)
 */
async function prochainNumero(prefixe, annee = new Date().getFullYear(), client = prisma) {
  const cle = `${prefixe}-${annee}`;
  const rows = await client.$queryRaw`
    INSERT INTO "Compteur" ("cle", "valeur") VALUES (${cle}, 1)
    ON CONFLICT ("cle") DO UPDATE SET "valeur" = "Compteur"."valeur" + 1
    RETURNING "valeur"`;
  return `${cle}-${String(rows[0].valeur).padStart(4, '0')}`;
}

module.exports = { prochainNumero };
