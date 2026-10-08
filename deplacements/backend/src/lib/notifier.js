const prisma = require('./prisma');
const { envoyerEmail } = require('./mailer');

/**
 * Notifie des utilisateurs : notification dans l'application + e-mail.
 * @param {number[]} userIds
 * @param {{titre:string, message:string, lien?:string, email?:boolean}} contenu
 */
async function notifier(userIds, { titre, message, lien, email = true }) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return;
  const users = await prisma.user.findMany({ where: { id: { in: ids }, actif: true }, select: { id: true, email: true } });
  await prisma.notification.createMany({ data: users.map((u) => ({ userId: u.id, titre, message, lien })) });
  if (email) {
    // Envoi non bloquant pour la requête HTTP.
    Promise.all(users.map((u) => envoyerEmail({ to: u.email, sujet: titre, titre, message, lien }))).catch(() => {});
  }
}

module.exports = { notifier };
