const jwt = require('jsonwebtoken');
const config = require('../config');
const prisma = require('../lib/prisma');
const { unauthorized, forbidden } = require('../lib/errors');
const { aPermission, PERMISSIONS } = require('../domain/permissions');

/** Vérifie le jeton JWT et recharge l'utilisateur (compte désactivé = accès coupé immédiatement). */
async function authentifier(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) throw unauthorized();
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw unauthorized('Session expirée, veuillez vous reconnecter');
    }
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        nom: true,
        prenom: true,
        email: true,
        role: true,
        perimetreGlobal: true,
        serviceId: true,
        categorieId: true,
        actif: true,
        updatedAt: true,
      },
    });
    if (!user || !user.actif) throw unauthorized('Compte inactif');
    user.permissions = PERMISSIONS[user.role] || [];
    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}

/** Exige au moins une des permissions indiquées. */
const autoriser =
  (...permissions) =>
  (req, res, next) => {
    if (!req.user) return next(unauthorized());
    if (!permissions.some((p) => aPermission(req.user.role, p))) return next(forbidden());
    next();
  };

module.exports = { authentifier, autoriser };
