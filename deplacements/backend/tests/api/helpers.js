const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/lib/prisma');

const MDP = 'Chambre2026!';
const jetons = new Map();

async function connecter(email) {
  if (jetons.has(email)) return jetons.get(email);
  const r = await request(app).post('/api/auth/login').send({ email, motDePasse: MDP });
  if (r.status !== 200) throw new Error(`Connexion impossible pour ${email} : ${r.status} ${r.body.message}`);
  jetons.set(email, r.body.data.token);
  return r.body.data.token;
}

/** Client HTTP authentifié : const a = await en('y.bouzid@…'); await a.get('/api/missions') */
async function en(email) {
  const token = await connecter(email);
  const avec = (req) => req.set('Authorization', `Bearer ${token}`);
  return {
    get: (u) => avec(request(app).get(u)),
    post: (u) => avec(request(app).post(u)),
    put: (u) => avec(request(app).put(u)),
    delete: (u) => avec(request(app).delete(u)),
  };
}

const EMAILS = {
  admin: 'admin@ca-soussmassa.ma',
  directeur: 'directeur@ca-soussmassa.ma',
  chefSpc: 'chef.spc@ca-soussmassa.ma',
  chefSfe: 'chef.sfe@ca-soussmassa.ma',
  finance: 'finance@ca-soussmassa.ma',
  agent1: 'y.bouzid@ca-soussmassa.ma',
  agent2: 's.lahcen@ca-soussmassa.ma',
  agent3: 'o.amzil@ca-soussmassa.ma',
};

const utilisateur = (cle) => prisma.user.findUnique({ where: { email: EMAILS[cle] } });

/** Date locale dans N jours à l'heure indiquée. */
function dans(jours, heure = 8) {
  const d = new Date();
  d.setDate(d.getDate() + jours);
  d.setHours(heure, 0, 0, 0);
  return d.toISOString();
}

/** PNG minimal valide (1×1). */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

module.exports = { app, prisma, request, connecter, en, EMAILS, utilisateur, dans, PNG };
