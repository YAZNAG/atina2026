/** Arrondi monétaire au centime. */
const round2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;

/** Convertit Decimal Prisma / chaîne / nombre en nombre. */
const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));

const somme = (items, f = (x) => x) => round2(items.reduce((acc, it) => acc + num(f(it)), 0));

module.exports = { round2, num, somme };
