import { describe, it, expect, afterAll } from 'vitest';
const { app, prisma, request, en, EMAILS } = require('./helpers');

afterAll(() => prisma.$disconnect());

describe('authentification', () => {
  it('refuse des identifiants incorrects et journalise la tentative', async () => {
    const r = await request(app).post('/api/auth/login').send({ email: EMAILS.agent2, motDePasse: 'mauvais' });
    expect(r.status).toBe(401);
    const log = await prisma.connexionLog.findFirst({ where: { email: EMAILS.agent2 }, orderBy: { id: 'desc' } });
    expect(log.succes).toBe(false);
  });

  it('connecte un utilisateur et renvoie son profil sans données sensibles en clair', async () => {
    const r = await request(app).post('/api/auth/login').send({ email: EMAILS.directeur.toUpperCase(), motDePasse: 'Chambre2026!' });
    expect(r.status).toBe(200);
    expect(r.body.data.token).toBeTruthy();
    expect(r.body.data.utilisateur.role).toBe('VALIDATEUR');
    expect(r.body.data.utilisateur.passwordHash).toBeUndefined();
    expect(r.body.data.utilisateur.rib).toMatch(/^•+\d{4}$/);
    expect(r.body.data.utilisateur.cinChiffre).toBeUndefined();
  });

  it('verrouille le compte après 5 échecs', async () => {
    const email = EMAILS.agent3;
    for (let i = 0; i < 5; i++) await request(app).post('/api/auth/login').send({ email, motDePasse: 'faux' });
    const r = await request(app).post('/api/auth/login').send({ email, motDePasse: 'Chambre2026!' });
    expect(r.status).toBe(401);
    expect(r.body.message).toMatch(/verrouillé/);
    await prisma.user.update({ where: { email }, data: { verrouilleJusqua: null, tentativesEchouees: 0 } });
  });

  it('exige un jeton sur les routes protégées', async () => {
    expect((await request(app).get('/api/missions')).status).toBe(401);
    expect((await request(app).get('/api/missions').set('Authorization', 'Bearer faux')).status).toBe(401);
  });

  it('coupe l’accès d’un compte désactivé immédiatement', async () => {
    const a = await en(EMAILS.agent2);
    await prisma.user.update({ where: { email: EMAILS.agent2 }, data: { actif: false } });
    expect((await a.get('/api/auth/moi')).status).toBe(401);
    await prisma.user.update({ where: { email: EMAILS.agent2 }, data: { actif: true } });
    expect((await a.get('/api/auth/moi')).status).toBe(200);
  });

  it('impose une politique de mot de passe', async () => {
    const a = await en(EMAILS.agent1);
    const r = await a.post('/api/auth/mot-de-passe').send({ actuel: 'Chambre2026!', nouveau: 'court' });
    expect(r.status).toBe(400);
  });
});

describe('contrôle d’accès par rôle', () => {
  it('un agent ne peut pas administrer', async () => {
    const a = await en(EMAILS.agent1);
    expect((await a.get('/api/utilisateurs')).status).toBe(403);
    expect((await a.put('/api/admin/parametres').send({ tauxTVA: 10 })).status).toBe(403);
    expect((await a.get('/api/admin/audit')).status).toBe(403);
    expect((await a.post('/api/referentiels/zones').send({ code: 'ZX', libelle: 'X' })).status).toBe(403);
    expect((await a.get('/api/reporting/export.xlsx')).status).toBe(403);
    expect((await a.get('/api/reporting/export-comptable')).status).toBe(403);
    expect((await a.post('/api/budgets').send({})).status).toBe(403);
  });

  it('un agent peut lire les référentiels et l’annuaire', async () => {
    const a = await en(EMAILS.agent1);
    expect((await a.get('/api/referentiels/destinations')).body.data.length).toBeGreaterThan(5);
    expect((await a.get('/api/utilisateurs/annuaire')).status).toBe(200);
  });

  it('le financier n’administre pas les comptes, l’administrateur oui', async () => {
    expect((await (await en(EMAILS.finance)).get('/api/utilisateurs')).status).toBe(403);
    const r = await (await en(EMAILS.admin)).get('/api/utilisateurs');
    expect(r.status).toBe(200);
    expect(r.body.meta.total).toBeGreaterThan(5);
  });

  it('l’administrateur consulte les données sensibles déchiffrées, et c’est tracé', async () => {
    const admin = await en(EMAILS.admin);
    const dir = await prisma.user.findUnique({ where: { email: EMAILS.directeur } });
    const r = await admin.get(`/api/utilisateurs/${dir.id}`);
    expect(r.body.data.cin).toBe('J123456');
    expect(dir.cinChiffre).not.toContain('J123456');
    const trace = await prisma.auditLog.findFirst({ where: { action: 'CONSULTATION_DONNEES_SENSIBLES', entiteId: dir.id } });
    expect(trace).toBeTruthy();
  });
});
