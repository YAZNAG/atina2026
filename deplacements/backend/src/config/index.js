const path = require('path');
require('dotenv').config({ path: process.env.DOTENV_PATH || path.resolve(__dirname, '../../.env') });

process.env.TZ = process.env.TZ || 'Africa/Casablanca';

const env = process.env.NODE_ENV || 'development';
const racine = path.resolve(__dirname, '../..');

function requis(nom) {
  const v = process.env[nom];
  if (!v) throw new Error(`Variable d'environnement manquante : ${nom}`);
  return v;
}

const config = {
  env,
  isProd: env === 'production',
  isTest: env === 'test',
  port: Number(process.env.PORT || 5010),
  appUrl: process.env.APP_URL || 'http://localhost:5173',
  jwtSecret: requis('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  encryptionKey: requis('ENCRYPTION_KEY'),
  uploadDir: path.resolve(racine, process.env.UPLOAD_DIR || './storage/justificatifs'),
  backupDir: path.resolve(racine, process.env.BACKUP_DIR || './storage/sauvegardes'),
  backupRetention: Number(process.env.BACKUP_RETENTION || 30),
  uploadMaxBytes: Number(process.env.UPLOAD_MAX_MB || 10) * 1024 * 1024,
  databaseUrl: process.env.DATABASE_URL,
  cronEnabled: process.env.CRON_ENABLED === 'true',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || "Chambre d'Artisanat Souss Massa <no-reply@localhost>",
  },
  assetsDir: path.resolve(racine, 'assets'),
  /** Tentatives de connexion avant verrouillage temporaire du compte. */
  maxTentatives: 5,
  dureeVerrouillageMin: 15,
};

if (config.isProd && config.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET doit contenir au moins 32 caractères en production');
}
if (!/^[0-9a-fA-F]{64}$/.test(config.encryptionKey)) {
  throw new Error('ENCRYPTION_KEY doit contenir 64 caractères hexadécimaux (clé AES-256)');
}

module.exports = config;
