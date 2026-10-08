import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
const fs = require('fs');
const path = require('path');
const { prisma, en, EMAILS, utilisateur, dans, PNG } = require('./helpers');
const { TACHES } = require('../../src/jobs/taches');

afterAll(() => prisma.$disconnect());

let destTaroudant;
let destCasa;
let agent1;
let agent2;
let chefSpc;

beforeAll(async () => {
  destTaroudant = await prisma.destination.findFirst({ where: { ville: 'Taroudant' } });
  destCasa = await prisma.destination.findFirst({ where: { ville: 'Casablanca' } });
  agent1 = await utilisateur('agent1');
  agent2 = await utilisateur('agent2');
  chefSpc = await utilisateur('chefSpc');
});

const nouvelleMission = (extra = {}) => ({
  objet: 'Accompagnement des coopératives au Salon national',
  destinationId: destCasa.id,
  dateDepart: dans(20, 7),
  dateRetour: dans(23, 19),
  moyenTransport: 'TRAIN',
  fraisTransportEstimes: 900,
  ...extra,
});

describe('ordre de mission : circuit complet', () => {
  let missionId;

  it('l’agent crée un brouillon ; le coût est estimé selon le barème', async () => {
    const a = await en(EMAILS.agent1);
    const r = await a.post('/api/missions').send(nouvelleMission());
    expect(r.status).toBe(201);
    missionId = r.body.data.id;
    expect(r.body.data.statut).toBe('BROUILLON');
    expect(r.body.data.numero).toBeNull();
    // Catégorie C, zone Z2 : 4 jours × 280 + 3 nuits × 550 + 900 de transport
    expect(r.body.data.coutEstime).toBe(3670);
    expect(r.body.data.participants.map((p) => p.userId)).toEqual([agent1.id]);
    // Budget du service imputé automatiquement
    const budget = await prisma.budget.findUnique({ where: { id: r.body.data.budgetId } });
    expect(budget.type).toBe('SERVICE');
  });

  it('refuse des dates incohérentes', async () => {
    const a = await en(EMAILS.agent1);
    const r = await a.post('/api/missions').send(nouvelleMission({ dateRetour: dans(19) }));
    expect(r.status).toBe(400);
  });

  it('un autre agent ne voit pas la mission', async () => {
    expect((await (await en(EMAILS.agent2)).get(`/api/missions/${missionId}`)).status).toBe(403);
  });

  it('soumission : numéro attribué, chef de service notifié', async () => {
    const r = await (await en(EMAILS.agent1)).post(`/api/missions/${missionId}/soumettre`);
    expect(r.status).toBe(200);
    expect(r.body.data.statut).toBe('EN_ATTENTE');
    expect(r.body.data.etapeCourante).toBe(1);
    expect(r.body.data.numero).toMatch(new RegExp(`^OM-${new Date(dans(20)).getFullYear()}-\\d{4}$`));
    const notif = await prisma.notification.findFirst({ where: { userId: chefSpc.id }, orderBy: { id: 'desc' } });
    expect(notif.titre).toMatch(/à valider/);
    // L'e-mail part en arrière-plan pour ne pas ralentir la requête.
    await vi.waitFor(async () => expect(await prisma.emailLog.findFirst({ where: { destinataire: EMAILS.chefSpc } })).toBeTruthy(), { timeout: 5000 });
  });

  it('seul le validateur de l’étape en cours peut statuer', async () => {
    expect((await (await en(EMAILS.agent1)).post(`/api/missions/${missionId}/decision`).send({ decision: 'APPROUVE' })).status).toBe(403);
    expect((await (await en(EMAILS.directeur)).post(`/api/missions/${missionId}/decision`).send({ decision: 'APPROUVE' })).status).toBe(403);
    expect((await (await en(EMAILS.chefSfe)).post(`/api/missions/${missionId}/decision`).send({ decision: 'APPROUVE' })).status).toBe(403);
  });

  it('le chef de service la voit dans « à valider » puis vise', async () => {
    const chef = await en(EMAILS.chefSpc);
    const liste = await chef.get('/api/missions/a-valider');
    expect(liste.body.data.map((m) => m.id)).toContain(missionId);
    const r = await chef.post(`/api/missions/${missionId}/decision`).send({ decision: 'APPROUVE', commentaire: 'Bon pour accord' });
    expect(r.status).toBe(200);
    expect(r.body.data.statut).toBe('EN_ATTENTE');
    expect(r.body.data.etapeCourante).toBe(2);
  });

  it('le directeur approuve : mission approuvée, participants notifiés', async () => {
    const r = await (await en(EMAILS.directeur)).post(`/api/missions/${missionId}/decision`).send({ decision: 'APPROUVE' });
    expect(r.body.data.statut).toBe('APPROUVE');
    const v = await prisma.validation.findMany({ where: { missionId }, orderBy: { id: 'asc' } });
    expect(v.map((x) => x.decision)).toEqual(['APPROUVE', 'APPROUVE']);
    const notif = await prisma.notification.findFirst({ where: { userId: agent1.id }, orderBy: { id: 'desc' } });
    expect(notif.titre).toMatch(/approuvée/);
  });

  it('l’ordre de mission PDF est généré', async () => {
    const r = await (await en(EMAILS.agent1)).get(`/api/missions/${missionId}/pdf`).buffer(true).parse((res, cb) => {
      const c = [];
      res.on('data', (x) => c.push(x));
      res.on('end', () => cb(null, Buffer.concat(c)));
    });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('application/pdf');
    expect(r.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(r.body.length).toBeGreaterThan(10000); // en-tête image inclus
  });

  it('historique : chaque changement est journalisé', async () => {
    const r = await (await en(EMAILS.agent1)).get(`/api/missions/${missionId}/historique`);
    expect(r.body.data.audits.map((a) => a.action)).toEqual(['CREATION', 'SOUMISSION', 'APPROBATION', 'APPROBATION', 'EDITION_PDF']);
  });

  it('conflit : l’agent ne peut pas partir sur une mission qui chevauche', async () => {
    const a = await en(EMAILS.agent1);
    const m = await a.post('/api/missions').send(nouvelleMission({ destinationId: destTaroudant.id, dateDepart: dans(21, 8), dateRetour: dans(21, 18) }));
    const r = await a.post(`/api/missions/${m.body.data.id}/soumettre`);
    expect(r.status).toBe(409);
    expect(r.body.details[0]).toMatchObject({ type: 'PARTICIPANT', userId: agent1.id, missionId });
    expect((await a.delete(`/api/missions/${m.body.data.id}`)).status).toBe(200);
  });

  it('les échanges sont historisés et notifiés', async () => {
    const r = await (await en(EMAILS.directeur)).post(`/api/missions/${missionId}/messages`).send({ contenu: 'Merci de joindre le programme du salon.' });
    expect(r.status).toBe(201);
    const liste = await (await en(EMAILS.agent1)).get(`/api/missions/${missionId}/messages`);
    expect(liste.body.data).toHaveLength(1);
  });
});

describe('refus, révision et circuit auto-adapté', () => {
  it('le refus exige un motif ; la mission peut être révisée puis resoumise', async () => {
    const a = await en(EMAILS.agent2);
    const m = (await a.post('/api/missions').send(nouvelleMission({ destinationId: destTaroudant.id, dateDepart: dans(30, 8), dateRetour: dans(30, 17) }))).body.data;
    const s1 = (await a.post(`/api/missions/${m.id}/soumettre`)).body.data;
    const chef = await en(EMAILS.chefSpc);
    expect((await chef.post(`/api/missions/${m.id}/decision`).send({ decision: 'REFUSE' })).status).toBe(400);
    const r = await chef.post(`/api/missions/${m.id}/decision`).send({ decision: 'REFUSE', commentaire: 'Mutualiser avec la mission de Samira' });
    expect(r.body.data.statut).toBe('REFUSE');
    expect((await a.post(`/api/missions/${m.id}/reviser`)).body.data.statut).toBe('BROUILLON');
    expect((await a.put(`/api/missions/${m.id}`).send({ objet: 'Repérage mutualisé à Taroudant' })).status).toBe(200);
    const re = await a.post(`/api/missions/${m.id}/soumettre`);
    expect(re.body.data.statut).toBe('EN_ATTENTE');
    expect(re.body.data.numero).toBe(s1.numero);
  });

  it('chef de service demandeur : son propre visa est sauté, le directeur valide', async () => {
    const chef = await en(EMAILS.chefSpc);
    const m = (await chef.post('/api/missions').send(nouvelleMission({ destinationId: destTaroudant.id, dateDepart: dans(35, 8), dateRetour: dans(35, 17) }))).body.data;
    // Le responsable du SPC est le demandeur : l'étape 1 remonte au responsable de la Direction (directeur).
    const r = await chef.post(`/api/missions/${m.id}/soumettre`);
    expect(r.body.data.statut).toBe('EN_ATTENTE');
    const dir = await en(EMAILS.directeur);
    expect((await dir.post(`/api/missions/${m.id}/decision`).send({ decision: 'APPROUVE' })).body.data.etapeCourante).toBe(2);
    expect((await dir.post(`/api/missions/${m.id}/decision`).send({ decision: 'APPROUVE' })).body.data.statut).toBe('APPROUVE');
  });

  it('directeur demandeur : aucune étape applicable, approbation automatique tracée', async () => {
    const dir = await en(EMAILS.directeur);
    const m = (await dir.post('/api/missions').send(nouvelleMission({ destinationId: destTaroudant.id, dateDepart: dans(40, 8), dateRetour: dans(40, 17) }))).body.data;
    const r = await dir.post(`/api/missions/${m.id}/soumettre`);
    expect(r.body.data.statut).toBe('APPROUVE');
    const v = await prisma.validation.findMany({ where: { missionId: m.id } });
    expect(v.map((x) => x.decision)).toEqual(['SAUTE', 'SAUTE']);
  });

  it('annulation avec motif obligatoire', async () => {
    const a = await en(EMAILS.agent3);
    const m = (await a.post('/api/missions').send(nouvelleMission({ dateDepart: dans(50, 8), dateRetour: dans(51, 17) }))).body.data;
    expect((await a.post(`/api/missions/${m.id}/annuler`).send({})).status).toBe(400);
    expect((await a.post(`/api/missions/${m.id}/annuler`).send({ motif: 'Salon reporté' })).body.data.statut).toBe('ANNULE');
  });
});

describe('note de frais : saisie, contrôle et remboursement', () => {
  let mission;
  let noteId;
  let ligneTaxi;

  beforeAll(async () => {
    // Mission approuvée de Samira (agent2), une nuit à Casablanca.
    const a = await en(EMAILS.agent2);
    mission = (await a.post('/api/missions').send(nouvelleMission({ dateDepart: dans(60, 7), dateRetour: dans(61, 19) }))).body.data;
    await a.post(`/api/missions/${mission.id}/soumettre`);
    await (await en(EMAILS.chefSpc)).post(`/api/missions/${mission.id}/decision`).send({ decision: 'APPROUVE' });
    await (await en(EMAILS.directeur)).post(`/api/missions/${mission.id}/decision`).send({ decision: 'APPROUVE' });
  });

  it('avance demandée par l’agent puis versée par le financier', async () => {
    const a = await en(EMAILS.agent2);
    const av = await a.post('/api/avances').send({ missionId: mission.id, montant: 500 });
    expect(av.status).toBe(201);
    expect((await a.post('/api/avances').send({ missionId: mission.id, montant: 100 })).status).toBe(409);
    expect((await a.post(`/api/avances/${av.body.data.id}/verser`).send({ modeVersement: 'VIREMENT' })).status).toBe(403);
    const v = await (await en(EMAILS.finance)).post(`/api/avances/${av.body.data.id}/verser`).send({ modeVersement: 'VIREMENT', referenceVersement: 'VIR-1' });
    expect(v.body.data.statut).toBe('VERSEE');
    expect(v.body.data.numero).toMatch(/^AV-/);
  });

  it('création : indemnités calculées et avance déduite', async () => {
    const a = await en(EMAILS.agent2);
    const r = await a.post('/api/notes-frais').send({ missionId: mission.id });
    expect(r.status).toBe(201);
    noteId = r.body.data.id;
    // 2 jours × 280 (cat. C, zone Z2)
    expect(r.body.data.totalIndemnites).toBe(560);
    expect(r.body.data.avanceDeduite).toBe(500);
    expect(r.body.data.montantARembourser).toBe(60);
    expect((await a.post('/api/notes-frais').send({ missionId: mission.id })).status).toBe(409);
  });

  it('un non-participant ne peut pas créer de note pour la mission', async () => {
    expect((await (await en(EMAILS.agent1)).post('/api/notes-frais').send({ missionId: mission.id })).status).toBe(403);
  });

  it('justificatif téléversé, chiffré sur disque, typé par son contenu', async () => {
    const a = await en(EMAILS.agent2);
    const faux = await a.post('/api/documents').attach('fichier', Buffer.from('MZ exécutable'), 'facture.pdf');
    expect(faux.status).toBe(400);
    const r = await a.post('/api/documents').field('noteFraisId', String(noteId)).attach('fichier', PNG, 'ticket-taxi.png');
    expect(r.status).toBe(201);
    const doc = await prisma.document.findUnique({ where: { id: r.body.data.id } });
    expect(doc.mimeType).toBe('image/png');
    const surDisque = fs.readFileSync(path.resolve(process.env.UPLOAD_DIR, doc.cheminStockage));
    expect(surDisque.includes(PNG)).toBe(false);
    const conservation = new Date(doc.conserverJusqua).getFullYear() - new Date().getFullYear();
    expect(conservation).toBe(10);
    // Relu déchiffré par l'agent ; refusé à un tiers
    const lu = await a.get(`/api/documents/${doc.id}`).buffer(true).parse((res, cb) => {
      const c = [];
      res.on('data', (x) => c.push(x));
      res.on('end', () => cb(null, Buffer.concat(c)));
    });
    expect(Buffer.compare(lu.body, PNG)).toBe(0);
    expect((await (await en(EMAILS.agent1)).get(`/api/documents/${doc.id}`)).status).toBe(403);

    const l = await a.post(`/api/notes-frais/${noteId}/lignes`).send({ date: dans(60), categorie: 'TAXI', montant: 260, description: 'Taxis gare–salon', documentId: doc.id });
    expect(l.status).toBe(201);
    ligneTaxi = l.body.data;
    // Plafond taxi : 200 par jour
    expect(ligneTaxi.montantRetenu).toBe(200);
    expect(ligneTaxi.depassementPlafond).toBe(true);
  });

  it('soumission bloquée tant qu’un justificatif manque', async () => {
    const a = await en(EMAILS.agent2);
    const l = await a.post(`/api/notes-frais/${noteId}/lignes`).send({ date: dans(60), categorie: 'HEBERGEMENT', montant: 700, description: 'Hôtel 1 nuit' });
    // Hébergement : plafond barème 550 × 1 nuit
    expect(l.body.data.montantRetenu).toBe(550);
    const r = await a.post(`/api/notes-frais/${noteId}/soumettre`);
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/Justificatifs manquants/);
    const doc = await a.post('/api/documents').field('noteFraisId', String(noteId)).attach('fichier', PNG, 'facture-hotel.png');
    await a.put(`/api/notes-frais/${noteId}/lignes/${l.body.data.id}`).send({ documentId: doc.body.data.id });
    const ok = await a.post(`/api/notes-frais/${noteId}/soumettre`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.numero).toMatch(/^NF-/);
    // 200 + 550 + 560 − 500
    expect(ok.body.data.montantARembourser).toBe(810);
    expect((await a.post(`/api/notes-frais/${noteId}/lignes`).send({ date: dans(60), categorie: 'REPAS', montant: 50 })).status).toBe(409);
  });

  it('pièce d’une note soumise : suppression interdite (conservation légale)', async () => {
    const a = await en(EMAILS.agent2);
    const ligne = await prisma.ligneFrais.findUnique({ where: { id: ligneTaxi.id } });
    expect((await a.delete(`/api/documents/${ligne.documentId}`)).status).toBe(403);
  });

  it('visa du chef puis contrôle et validation financière', async () => {
    await (await en(EMAILS.chefSpc)).post(`/api/notes-frais/${noteId}/decision`).send({ decision: 'APPROUVE' });
    const fin = await en(EMAILS.finance);
    expect((await fin.get('/api/notes-frais/a-valider')).body.data.map((n) => n.id)).toContain(noteId);
    // Le taxi est jugé non conforme : il n'est plus retenu.
    expect((await fin.post(`/api/notes-frais/${noteId}/lignes/${ligneTaxi.id}/controle`).send({ statutControle: 'NON_CONFORME' })).status).toBe(400);
    const c = await fin.post(`/api/notes-frais/${noteId}/lignes/${ligneTaxi.id}/controle`).send({ statutControle: 'NON_CONFORME', commentaireControle: 'Ticket illisible' });
    expect(c.body.data.montantARembourser).toBe(610);
    const v = await fin.post(`/api/notes-frais/${noteId}/decision`).send({ decision: 'APPROUVE' });
    expect(v.body.data.statut).toBe('VALIDEE');
  });

  it('remboursement : lignes contrôlées obligatoires, avance régularisée', async () => {
    const fin = await en(EMAILS.finance);
    expect((await (await en(EMAILS.agent2)).post(`/api/notes-frais/${noteId}/rembourser`).send({ modePaiement: 'VIREMENT' })).status).toBe(403);
    expect((await fin.post(`/api/notes-frais/${noteId}/rembourser`).send({ modePaiement: 'VIREMENT' })).status).toBe(400);
    const lignes = await prisma.ligneFrais.findMany({ where: { noteFraisId: noteId, statutControle: 'EN_ATTENTE' } });
    for (const l of lignes) await fin.post(`/api/notes-frais/${noteId}/lignes/${l.id}/controle`).send({ statutControle: 'CONFORME' });
    const r = await fin.post(`/api/notes-frais/${noteId}/rembourser`).send({ modePaiement: 'VIREMENT', referencePaiement: 'VIR-2' });
    expect(r.body.data.statut).toBe('REMBOURSEE');
    const avance = await prisma.avance.findFirst({ where: { missionId: mission.id } });
    expect(avance.statut).toBe('REGULARISEE');
    expect(Number(avance.soldeRegularisation)).toBe(610);
  });

  it('PDF de la note et export comptable équilibré', async () => {
    const fin = await en(EMAILS.finance);
    const pdf = await fin.get(`/api/notes-frais/${noteId}/pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    const csv = await fin.get('/api/reporting/export-comptable?format=csv');
    expect(csv.status).toBe(200);
    const lignes = csv.text.replace('﻿', '').trim().split('\r\n').slice(1).map((l) => l.split(';'));
    const tot = (i) => lignes.reduce((a, l) => a + Number(l[i].replace(',', '.')), 0);
    expect(tot(5)).toBeCloseTo(tot(6), 2);
    expect(tot(5)).toBeCloseTo(550 + 560, 2);
  });

  it('budget : le réalisé reflète le remboursement', async () => {
    const b = await (await en(EMAILS.finance)).get(`/api/budgets/${mission.budgetId}`);
    const ligne = b.body.data.missions.find((m) => m.id === mission.id);
    expect(ligne.coutReel).toBe(1110);
    expect(b.body.data.situation.realise).toBeGreaterThanOrEqual(1110);
  });
});

describe('tableau de bord, exports et tâches planifiées', () => {
  it('tableau de bord selon le périmètre', async () => {
    const fin = (await (await en(EMAILS.finance)).get('/api/reporting/tableau-de-bord')).body.data;
    expect(fin.kpis.nbMissions).toBeGreaterThan(0);
    expect(fin.parMois).toHaveLength(12);
    expect(fin.budgets.length).toBeGreaterThan(0);
    const agent = (await (await en(EMAILS.agent3)).get('/api/reporting/tableau-de-bord')).body.data;
    expect(agent.kpis.nbMissions).toBe(0);
    expect(agent.budgets).toEqual([]);
  });

  it('exports Excel et PDF', async () => {
    const dir = await en(EMAILS.directeur);
    const x = await dir.get('/api/reporting/export.xlsx');
    expect(x.status).toBe(200);
    expect(x.headers['content-type']).toMatch(/spreadsheetml/);
    const p = await dir.get('/api/reporting/export.pdf');
    expect(p.headers['content-type']).toBe('application/pdf');
  });

  it('passage automatique en cours à la date de départ', async () => {
    const a = await en(EMAILS.agent3);
    const m = (await a.post('/api/missions').send(nouvelleMission({ destinationId: destTaroudant.id, dateDepart: dans(70, 8), dateRetour: dans(70, 17) }))).body.data;
    await a.post(`/api/missions/${m.id}/soumettre`);
    await (await en(EMAILS.chefSfe)).post(`/api/missions/${m.id}/decision`).send({ decision: 'APPROUVE' });
    await (await en(EMAILS.directeur)).post(`/api/missions/${m.id}/decision`).send({ decision: 'APPROUVE' });
    const r = await TACHES['demarrer-missions'](new Date(dans(70, 9)));
    expect(r.missionsDemarrees).toBeGreaterThanOrEqual(1);
    expect((await prisma.mission.findUnique({ where: { id: m.id } })).statut).toBe('EN_COURS');
  });

  it('l’administrateur consulte le journal d’audit filtré', async () => {
    const r = await (await en(EMAILS.admin)).get('/api/admin/audit?entite=NoteFrais');
    expect(r.status).toBe(200);
    expect(r.body.data.length).toBeGreaterThan(3);
    expect(r.body.data.every((x) => x.entite === 'NoteFrais')).toBe(true);
  });
});

describe('confidentialité des brouillons', () => {
  it('un brouillon n’est visible que du demandeur et des participants', async () => {
    const dest = await prisma.destination.findFirst({ where: { ville: 'Tiznit' } });
    const a = await en(EMAILS.agent1);
    const m = (await a.post('/api/missions').send({ objet: 'Brouillon privé', destinationId: dest.id, dateDepart: dans(90, 8), dateRetour: dans(90, 17), moyenTransport: 'TAXI' })).body.data;
    for (const qui of ['finance', 'directeur', 'chefSpc', 'admin']) {
      expect((await (await en(EMAILS[qui])).get(`/api/missions/${m.id}`)).status).toBe(403);
      const liste = await (await en(EMAILS[qui])).get('/api/missions?limit=200');
      expect(liste.body.data.map((x) => x.id)).not.toContain(m.id);
    }
    expect((await a.get(`/api/missions/${m.id}`)).status).toBe(200);
  });
});
