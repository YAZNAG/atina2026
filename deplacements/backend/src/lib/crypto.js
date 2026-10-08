const crypto = require('crypto');
const config = require('../config');

const KEY = Buffer.from(config.encryptionKey, 'hex');
const ALGO = 'aes-256-gcm';

/** Chiffre un Buffer : [iv 12o][tag 16o][données]. */
function encryptBuffer(buf) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const data = Buffer.concat([cipher.update(buf), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]);
}

function decryptBuffer(buf) {
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]);
}

/** Chiffre une chaîne (CIN, RIB) — renvoie du base64, ou null. */
function encryptText(text) {
  if (text === undefined || text === null || text === '') return null;
  return encryptBuffer(Buffer.from(String(text), 'utf8')).toString('base64');
}

function decryptText(b64) {
  if (!b64) return null;
  try {
    return decryptBuffer(Buffer.from(b64, 'base64')).toString('utf8');
  } catch {
    return null;
  }
}

/** Masque une donnée sensible pour l'affichage : ****1234 */
function masquer(text, visibles = 4) {
  if (!text) return null;
  return '•'.repeat(Math.max(0, text.length - visibles)) + text.slice(-visibles);
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

module.exports = { encryptBuffer, decryptBuffer, encryptText, decryptText, masquer, sha256 };
