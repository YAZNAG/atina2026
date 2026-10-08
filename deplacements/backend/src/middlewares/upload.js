const multer = require('multer');
const config = require('../config');

/** Fichiers gardés en mémoire puis chiffrés avant écriture sur disque. */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.uploadMaxBytes, files: 1 } });

module.exports = { upload };
