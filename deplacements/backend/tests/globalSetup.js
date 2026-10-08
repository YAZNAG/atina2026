const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/** Base de test remise à zéro puis initialisée avec les référentiels et comptes du seed. */
module.exports = function setup() {
  if (process.env.VITEST_SANS_BD) return;
  const racine = path.resolve(__dirname, '..');
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgresql://deplacements:deplacements@localhost:5432/deplacements_test',
    JWT_SECRET: 'secret-de-test-0123456789-0123456789-abcdef',
    ENCRYPTION_KEY: 'aa'.repeat(32),
  };
  fs.rmSync(path.join(racine, 'storage-test'), { recursive: true, force: true });
  execSync('npx prisma migrate reset --force --skip-seed --skip-generate', { cwd: racine, env, stdio: 'pipe' });
  execSync('node prisma/seed.js', { cwd: racine, env, stdio: 'pipe' });
  return () => fs.rmSync(path.join(racine, 'storage-test'), { recursive: true, force: true });
};
