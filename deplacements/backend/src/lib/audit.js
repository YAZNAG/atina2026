const prisma = require('./prisma');
const { Prisma } = require('@prisma/client');

const CHAMPS_MASQUES = new Set(['passwordHash', 'cinChiffre', 'ribChiffre']);

/** Rend un objet sérialisable en JSON (Decimal → nombre, Date → ISO) et masque les secrets. */
function nettoyer(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Prisma.Decimal.isDecimal(obj)) return obj.toNumber();
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map(nettoyer);
  if (typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (CHAMPS_MASQUES.has(k)) out[k] = v ? '[masqué]' : v;
      else if (v === null || typeof v !== 'object' || v instanceof Date || Prisma.Decimal.isDecimal(v)) out[k] = nettoyer(v);
    }
    return out;
  }
  return obj;
}

/** Ne garde que les champs scalaires modifiés entre deux versions. */
function difference(avant, apres) {
  const a = nettoyer(avant) || {};
  const b = nettoyer(apres) || {};
  const av = {};
  const ap = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (k === 'updatedAt') continue;
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
      av[k] = a[k];
      ap[k] = b[k];
    }
  }
  return { avant: av, apres: ap, change: Object.keys(ap).length > 0 };
}

/**
 * Journalise une action.
 * @param {object} p { req?, userId?, action, entite, entiteId?, avant?, apres?, client? }
 */
async function audit({ req, userId, action, entite, entiteId, avant, apres, client = prisma }) {
  let a = avant ? nettoyer(avant) : undefined;
  let b = apres ? nettoyer(apres) : undefined;
  if (avant && apres) {
    const d = difference(avant, apres);
    if (!d.change) return;
    a = d.avant;
    b = d.apres;
  }
  await client.auditLog.create({
    data: {
      userId: userId ?? req?.user?.id ?? null,
      action,
      entite,
      entiteId: entiteId ?? null,
      avant: a ?? undefined,
      apres: b ?? undefined,
      ip: req ? req.ip : null,
    },
  });
}

module.exports = { audit, nettoyer, difference };
