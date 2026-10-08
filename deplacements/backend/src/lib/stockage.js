/** Stockage chiffré des pièces justificatives sur disque. */
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const { encryptBuffer, decryptBuffer, sha256 } = require('./crypto');

const TYPES_AUTORISES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']);

/** Vérifie la signature binaire (le type MIME déclaré par le client n'est pas fiable). */
function detecterType(buf) {
  if (buf.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.subarray(4, 12).toString().startsWith('ftyphei') || buf.subarray(4, 12).toString().startsWith('ftypmif')) return 'image/heic';
  return null;
}

async function enregistrer(buffer) {
  const type = detecterType(buffer);
  if (!type || !TYPES_AUTORISES.has(type)) {
    const err = new Error('Format non accepté : PDF, JPEG, PNG, WEBP ou HEIC uniquement');
    err.status = 400;
    throw err;
  }
  const now = new Date();
  const sousDossier = path.join(String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
  const nom = `${crypto.randomUUID()}.bin`;
  const relatif = path.join(sousDossier, nom);
  await fs.mkdir(path.join(config.uploadDir, sousDossier), { recursive: true });
  await fs.writeFile(path.join(config.uploadDir, relatif), encryptBuffer(buffer), { mode: 0o600 });
  return { chemin: relatif, mimeType: type, taille: buffer.length, sha256: sha256(buffer) };
}

function cheminAbsolu(relatif) {
  const abs = path.resolve(config.uploadDir, relatif);
  if (!abs.startsWith(path.resolve(config.uploadDir) + path.sep)) throw new Error('Chemin invalide');
  return abs;
}

async function lire(doc) {
  const brut = await fs.readFile(cheminAbsolu(doc.cheminStockage));
  return doc.chiffre ? decryptBuffer(brut) : brut;
}

async function supprimer(relatif) {
  await fs.rm(cheminAbsolu(relatif), { force: true });
}

module.exports = { enregistrer, lire, supprimer, detecterType };
