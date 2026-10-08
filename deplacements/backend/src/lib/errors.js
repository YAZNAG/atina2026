class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const badRequest = (msg, details) => new AppError(400, msg, details);
const unauthorized = (msg = 'Authentification requise') => new AppError(401, msg);
const forbidden = (msg = 'Accès refusé') => new AppError(403, msg);
const notFound = (msg = 'Ressource introuvable') => new AppError(404, msg);
const conflict = (msg, details) => new AppError(409, msg, details);

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict };
