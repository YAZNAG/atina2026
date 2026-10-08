/** Sauvegarde : dump PostgreSQL + archive des justificatifs (déjà chiffrés), avec rotation. */
const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const config = require('../config');
const prisma = require('./prisma');

const exec = promisify(execFile);
const horodatage = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

async function sauvegarder() {
  await fs.mkdir(config.backupDir, { recursive: true });
  const nom = `sauvegarde-${horodatage()}`;
  const dump = path.join(config.backupDir, `${nom}.dump`);
  const archive = path.join(config.backupDir, `${nom}-justificatifs.tar.gz`);
  try {
    const url = new URL(config.databaseUrl);
    url.searchParams.delete('schema');
    await exec('pg_dump', ['--format=custom', '--no-owner', `--file=${dump}`, url.toString()], { timeout: 10 * 60 * 1000 });
    await fs.mkdir(config.uploadDir, { recursive: true });
    await exec('tar', ['-czf', archive, '-C', path.dirname(config.uploadDir), path.basename(config.uploadDir)], { timeout: 30 * 60 * 1000 });
    const taille = (await fs.stat(dump)).size + (await fs.stat(archive)).size;
    const s = await prisma.sauvegarde.create({ data: { fichier: nom, taille, statut: 'OK' } });
    await rotation();
    return s;
  } catch (e) {
    await fs.rm(dump, { force: true });
    await fs.rm(archive, { force: true });
    return prisma.sauvegarde.create({ data: { fichier: nom, taille: 0, statut: 'ECHEC', erreur: String(e.message).slice(0, 500) } });
  }
}

/** Conserve les N dernières sauvegardes réussies. */
async function rotation() {
  const anciennes = await prisma.sauvegarde.findMany({ where: { statut: 'OK' }, orderBy: { createdAt: 'desc' }, skip: config.backupRetention });
  for (const s of anciennes) {
    await fs.rm(path.join(config.backupDir, `${s.fichier}.dump`), { force: true });
    await fs.rm(path.join(config.backupDir, `${s.fichier}-justificatifs.tar.gz`), { force: true });
    await prisma.sauvegarde.update({ where: { id: s.id }, data: { statut: 'PURGEE' } });
  }
}

module.exports = { sauvegarder, rotation };
