const { Prisma } = require('@prisma/client');
const multer = require('multer');
const config = require('../config');

// eslint-disable-next-line no-unused-vars
function gestionErreurs(err, req, res, next) {
  let status = err.status || 500;
  let message = err.message || 'Erreur interne';
  let details = err.details;

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      status = 409;
      message = `Valeur déjà utilisée : ${(err.meta?.target || []).join(', ')}`;
    } else if (err.code === 'P2025') {
      status = 404;
      message = 'Ressource introuvable';
    } else if (err.code === 'P2003') {
      status = 409;
      message = 'Opération impossible : cet élément est référencé ailleurs';
    }
  } else if (err instanceof multer.MulterError) {
    status = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop volumineux' : 'Téléversement invalide';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'JSON invalide';
  }

  if (status >= 500) {
    console.error(err);
    if (config.isProd) message = 'Erreur interne du serveur';
  }
  res.status(status).json({ success: false, message, details });
}

module.exports = { gestionErreurs };
