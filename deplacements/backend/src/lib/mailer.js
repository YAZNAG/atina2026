const nodemailer = require('nodemailer');
const config = require('../config');
const prisma = require('./prisma');

let transport;
function getTransport() {
  if (transport) return transport;
  transport = config.smtp.host
    ? nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      })
    : nodemailer.createTransport({ jsonTransport: true });
  return transport;
}

const echapper = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function gabarit({ titre, message, lien }) {
  const url = lien ? `${config.appUrl}${lien}` : null;
  return `<!doctype html><html lang="fr"><body style="font-family:Arial,sans-serif;background:#f5f5f4;padding:24px">
<div style="max-width:560px;margin:auto;background:#fff;border-radius:8px;padding:24px;border-top:4px solid #9a3412">
<p style="color:#78716c;font-size:12px;margin:0 0 8px">Chambre d'Artisanat Souss Massa — Gestion des déplacements</p>
<h2 style="color:#1c1917;font-size:18px">${echapper(titre)}</h2>
<p style="color:#292524;line-height:1.5">${echapper(message).replace(/\n/g, '<br>')}</p>
${url ? `<p><a href="${echapper(url)}" style="display:inline-block;background:#9a3412;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Ouvrir dans l'application</a></p>` : ''}
<p style="color:#a8a29e;font-size:11px;margin-top:24px">Message automatique, merci de ne pas répondre.</p>
</div></body></html>`;
}

/** Envoie un e-mail et le journalise. N'échoue jamais : une erreur d'envoi est seulement tracée. */
async function envoyerEmail({ to, sujet, titre, message, lien }) {
  if (!to) return;
  try {
    await getTransport().sendMail({
      from: config.smtp.from,
      to,
      subject: sujet,
      text: `${message}${lien ? `\n\n${config.appUrl}${lien}` : ''}`,
      html: gabarit({ titre: titre || sujet, message, lien }),
    });
    await prisma.emailLog.create({ data: { destinataire: to, sujet, statut: config.smtp.host ? 'ENVOYE' : 'JOURNALISE' } });
  } catch (e) {
    await prisma.emailLog
      .create({ data: { destinataire: to, sujet, statut: 'ECHEC', erreur: String(e.message).slice(0, 500) } })
      .catch(() => {});
  }
}

module.exports = { envoyerEmail, gabarit };
