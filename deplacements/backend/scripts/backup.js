/** Sauvegarde manuelle : npm run backup (même procédure que la tâche planifiée de 2h30). */
const { sauvegarder } = require('../src/lib/sauvegarde');
const prisma = require('../src/lib/prisma');

sauvegarder()
  .then((s) => {
    console.log(`${s.statut} — ${s.fichier}${s.erreur ? ` : ${s.erreur}` : ''}`);
    process.exitCode = s.statut === 'OK' ? 0 : 1;
  })
  .finally(() => prisma.$disconnect());
