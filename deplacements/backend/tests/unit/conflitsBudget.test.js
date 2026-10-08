import { describe, it, expect } from 'vitest';
const { chevauche, detecterConflits } = require('../../src/domain/conflits');
const { situationBudget, verifierDisponibilite } = require('../../src/domain/budget');
const { aPermission, PERMISSIONS } = require('../../src/domain/permissions');

const p = (j1, h1, j2, h2) => ({ dateDepart: new Date(2026, 4, j1, h1), dateRetour: new Date(2026, 4, j2, h2) });

describe('conflits de calendrier', () => {
  it('chevauchement strict', () => {
    expect(chevauche(p(10, 8, 12, 18), p(12, 8, 13, 18))).toBe(true);
    expect(chevauche(p(10, 8, 12, 18), p(12, 18, 13, 18))).toBe(false);
    expect(chevauche(p(10, 8, 12, 18), p(1, 8, 30, 18))).toBe(true);
  });

  it('détecte agent et véhicule déjà engagés, ignore brouillons et missions annulées', () => {
    const mission = { id: 1, ...p(10, 8, 12, 18), vehiculeId: 7, participantIds: [40, 41] };
    const autres = [
      { id: 2, numero: 'OM-2', statut: 'APPROUVE', ...p(11, 8, 11, 18), vehiculeId: 7, participantIds: [41] },
      { id: 3, numero: 'OM-3', statut: 'BROUILLON', ...p(11, 8, 11, 18), vehiculeId: 7, participantIds: [40] },
      { id: 4, numero: 'OM-4', statut: 'ANNULE', ...p(11, 8, 11, 18), vehiculeId: null, participantIds: [40] },
      { id: 5, numero: 'OM-5', statut: 'EN_COURS', ...p(20, 8, 21, 18), vehiculeId: 7, participantIds: [40] },
      { id: 1, numero: 'OM-1', statut: 'EN_ATTENTE', ...p(10, 8, 12, 18), vehiculeId: 7, participantIds: [40] },
    ];
    expect(detecterConflits(mission, autres)).toEqual([
      { type: 'PARTICIPANT', userId: 41, missionId: 2, numero: 'OM-2' },
      { type: 'VEHICULE', vehiculeId: 7, missionId: 2, numero: 'OM-2' },
    ]);
  });
});

describe('situation budgétaire', () => {
  const budget = { montantInitial: 10000, seuilAlerte: 80 };

  it('prévisionnel, engagé, réalisé, consommé, disponible', () => {
    const s = situationBudget(budget, [
      { statut: 'EN_ATTENTE', coutEstime: 1000 },
      { statut: 'APPROUVE', coutEstime: 2000, coutReel: 0 },
      { statut: 'EN_COURS', coutEstime: 1500, coutReel: 1800 },
      { statut: 'CLOTURE', coutEstime: 3000, coutReel: 2600, soldee: true },
      { statut: 'REFUSE', coutEstime: 9999 },
      { statut: 'BROUILLON', coutEstime: 9999 },
    ]);
    expect(s).toMatchObject({
      montant: 10000,
      previsionnel: 1000,
      engage: 2000,
      realise: 4400,
      consomme: 6400,
      disponible: 3600,
      tauxConsommation: 64,
      enAlerte: false,
      depasse: false,
    });
  });

  it('alerte au seuil et dépassement', () => {
    expect(situationBudget(budget, [{ statut: 'APPROUVE', coutEstime: 8000 }]).enAlerte).toBe(true);
    const s = situationBudget(budget, [{ statut: 'APPROUVE', coutEstime: 12000 }]);
    expect(s.depasse).toBe(true);
    expect(s.disponible).toBe(-2000);
  });

  it('montant ajusté prioritaire sur le montant initial', () => {
    expect(situationBudget({ montantInitial: 10000, montantAjuste: 20000 }, [{ statut: 'APPROUVE', coutEstime: 5000 }]).tauxConsommation).toBe(25);
  });

  it('vérification de disponibilité', () => {
    const s = situationBudget(budget, [{ statut: 'APPROUVE', coutEstime: 9000 }]);
    expect(verifierDisponibilite(s, 500)).toEqual({ ok: true, disponibleApres: 500, depassement: 0 });
    expect(verifierDisponibilite(s, 1500)).toEqual({ ok: false, disponibleApres: -500, depassement: 500 });
  });
});

describe('permissions', () => {
  it('chaque rôle hérite des fonctions agent', () => {
    for (const role of Object.keys(PERMISSIONS)) expect(aPermission(role, 'mission:creer')).toBe(true);
  });
  it('cloisonnement', () => {
    expect(aPermission('AGENT', 'validation:statuer')).toBe(false);
    expect(aPermission('AGENT', 'mission:lire_tout')).toBe(false);
    expect(aPermission('VALIDATEUR', 'note:rembourser')).toBe(false);
    expect(aPermission('FINANCIER', 'admin:utilisateurs')).toBe(false);
    expect(aPermission('FINANCIER', 'export:comptable')).toBe(true);
    expect(aPermission('ADMIN', 'admin:sauvegardes')).toBe(true);
    expect(aPermission('INCONNU', 'mission:lire')).toBe(false);
  });
});
