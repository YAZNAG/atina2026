import { describe, it, expect } from 'vitest';
const W = require('../../src/domain/workflow');

// Hiérarchie : 1 Direction (resp. 10) → 2 Promotion (resp. 20) → 3 Annexe (sans responsable)
const services = [
  { id: 1, parentId: null, responsableId: 10 },
  { id: 2, parentId: 1, responsableId: 20 },
  { id: 3, parentId: 2, responsableId: null },
];
const utilisateurs = [
  { id: 10, role: 'VALIDATEUR', perimetreGlobal: true, actif: true },
  { id: 20, role: 'VALIDATEUR', actif: true },
  { id: 30, role: 'FINANCIER', actif: true },
  { id: 31, role: 'FINANCIER', actif: true },
  { id: 40, role: 'AGENT', actif: true },
  { id: 41, role: 'AGENT', actif: true },
  { id: 99, role: 'FINANCIER', actif: false },
];
const ctx = (demandeurId, serviceId) => ({ demandeur: { id: demandeurId, serviceId }, services, utilisateurs });

const circuitMission = [
  { ordre: 1, libelle: 'Chef de service', typeEtape: 'RESPONSABLE_SERVICE' },
  { ordre: 2, libelle: 'Directeur', typeEtape: 'UTILISATEUR', utilisateurId: 10 },
];
const circuitNote = [
  { ordre: 1, libelle: 'Chef de service', typeEtape: 'RESPONSABLE_SERVICE' },
  { ordre: 2, libelle: 'Finance', typeEtape: 'ROLE', role: 'FINANCIER' },
];

describe('machines à états', () => {
  it('missions : transitions autorisées', () => {
    expect(W.peutTransiter(W.TRANSITIONS_MISSION, 'BROUILLON', 'EN_ATTENTE')).toBe(true);
    expect(W.peutTransiter(W.TRANSITIONS_MISSION, 'EN_ATTENTE', 'APPROUVE')).toBe(true);
    expect(W.peutTransiter(W.TRANSITIONS_MISSION, 'APPROUVE', 'EN_COURS')).toBe(true);
    expect(W.peutTransiter(W.TRANSITIONS_MISSION, 'EN_COURS', 'CLOTURE')).toBe(true);
    expect(W.peutTransiter(W.TRANSITIONS_MISSION, 'REFUSE', 'BROUILLON')).toBe(true);
  });
  it('missions : transitions interdites', () => {
    expect(W.peutTransiter(W.TRANSITIONS_MISSION, 'BROUILLON', 'APPROUVE')).toBe(false);
    expect(W.peutTransiter(W.TRANSITIONS_MISSION, 'CLOTURE', 'EN_COURS')).toBe(false);
    expect(W.peutTransiter(W.TRANSITIONS_MISSION, 'EN_COURS', 'ANNULE')).toBe(false);
    expect(() => W.assertTransition(W.TRANSITIONS_MISSION, 'ANNULE', 'BROUILLON')).toThrow(/Transition impossible/);
  });
  it('notes de frais', () => {
    expect(W.peutTransiter(W.TRANSITIONS_NOTE, 'BROUILLON', 'SOUMISE')).toBe(true);
    expect(W.peutTransiter(W.TRANSITIONS_NOTE, 'VALIDEE', 'REMBOURSEE')).toBe(true);
    expect(W.peutTransiter(W.TRANSITIONS_NOTE, 'SOUMISE', 'REMBOURSEE')).toBe(false);
    expect(W.peutTransiter(W.TRANSITIONS_NOTE, 'REMBOURSEE', 'BROUILLON')).toBe(false);
  });
});

describe('resoudreValidateurs', () => {
  it('responsable du service du demandeur', () => {
    expect(W.resoudreValidateurs(circuitMission[0], ctx(40, 2))).toEqual([20]);
  });
  it('remonte la hiérarchie quand le service n’a pas de responsable', () => {
    expect(W.resoudreValidateurs(circuitMission[0], ctx(40, 3))).toEqual([20]);
  });
  it('le responsable demandeur est validé par le niveau supérieur', () => {
    expect(W.resoudreValidateurs(circuitMission[0], ctx(20, 2))).toEqual([10]);
  });
  it('à défaut de responsable, un validateur à périmètre global', () => {
    expect(W.resoudreValidateurs(circuitMission[0], ctx(40, null))).toEqual([10]);
  });
  it('jamais d’auto-validation', () => {
    expect(W.resoudreValidateurs(circuitMission[1], ctx(10, 1))).toEqual([]);
    expect(W.resoudreValidateurs(circuitNote[1], ctx(30, 1))).toEqual([31]);
  });
  it('étape par rôle : tous les utilisateurs actifs du rôle', () => {
    expect(W.resoudreValidateurs(circuitNote[1], ctx(40, 2))).toEqual([30, 31]);
  });
  it('ignore les comptes inactifs', () => {
    expect(W.resoudreValidateurs({ typeEtape: 'UTILISATEUR', utilisateurId: 99 }, ctx(40, 2))).toEqual([]);
  });
  it('accepte une Map de services', () => {
    const c = { ...ctx(40, 2), services: new Map(services.map((s) => [s.id, s])) };
    expect(W.resoudreValidateurs(circuitMission[0], c)).toEqual([20]);
  });
  it('résiste à une boucle dans la hiérarchie', () => {
    const boucle = [
      { id: 5, parentId: 6, responsableId: null },
      { id: 6, parentId: 5, responsableId: null },
    ];
    expect(W.resoudreValidateurs(circuitMission[0], { ...ctx(40, 5), services: boucle })).toEqual([10]);
  });
});

describe('prochaineEtape / appliquerDecision', () => {
  it('agent : première étape = chef de service', () => {
    const r = W.prochaineEtape(circuitMission, null, ctx(40, 2));
    expect(r.etape.ordre).toBe(1);
    expect(r.validateurs).toEqual([20]);
    expect(r.sautees).toEqual([]);
  });

  it('directeur demandeur : toutes les étapes sont sautées (approbation directe)', () => {
    const r = W.prochaineEtape(circuitMission, null, ctx(10, 1));
    // Étape 1 : le responsable de la Direction est le directeur lui-même → aucun autre validateur
    expect(r.etape).toBeNull();
    expect(r.sautees.map((e) => e.ordre)).toEqual([1, 2]);
  });

  it('circuit complet : approbation étape par étape', () => {
    const c = ctx(40, 2);
    const e1 = W.appliquerDecision({ etapes: circuitMission, ordreCourant: 1, decision: 'APPROUVE', ctx: c });
    expect(e1.statut).toBe('EN_COURS_VALIDATION');
    expect(e1.etapeSuivante.ordre).toBe(2);
    expect(e1.validateurs).toEqual([10]);
    const e2 = W.appliquerDecision({ etapes: circuitMission, ordreCourant: 2, decision: 'APPROUVE', ctx: c });
    expect(e2.statut).toBe('APPROUVE');
  });

  it('un refus termine le circuit à n’importe quelle étape', () => {
    expect(W.appliquerDecision({ etapes: circuitMission, ordreCourant: 1, decision: 'REFUSE', ctx: ctx(40, 2) }).statut).toBe('REFUSE');
  });

  it('décision inconnue', () => {
    expect(() => W.appliquerDecision({ etapes: circuitMission, ordreCourant: 1, decision: 'PEUT_ETRE', ctx: ctx(40, 2) })).toThrow();
  });

  it('étape conditionnée par un seuil de montant', () => {
    const etapes = [circuitMission[0], { ...circuitMission[1], seuilMontant: 5000 }];
    expect(W.appliquerDecision({ etapes, ordreCourant: 1, decision: 'APPROUVE', ctx: ctx(40, 2), montant: 1200 }).statut).toBe('APPROUVE');
    expect(W.appliquerDecision({ etapes, ordreCourant: 1, decision: 'APPROUVE', ctx: ctx(40, 2), montant: 5000 }).statut).toBe('EN_COURS_VALIDATION');
    expect(W.etapesApplicables(etapes, '7000.00').length).toBe(2);
  });

  it('peutValider vérifie l’étape en cours', () => {
    const c = ctx(40, 2);
    expect(W.peutValider(20, circuitMission, 1, c)).toBe(true);
    expect(W.peutValider(10, circuitMission, 1, c)).toBe(false);
    expect(W.peutValider(10, circuitMission, 2, c)).toBe(true);
    expect(W.peutValider(40, circuitMission, 1, c)).toBe(false);
    expect(W.peutValider(20, circuitMission, 3, c)).toBe(false);
  });
});
