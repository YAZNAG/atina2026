import { describe, it, expect } from 'vitest';
const { calculerNoteFrais, trouverPlafond } = require('../../src/domain/notesFrais');

const j = (n) => new Date(2026, 2, n);
const plafonds = [
  { categorieFrais: 'REPAS', categorieAgentId: null, montant: 150, unite: 'PAR_DEPENSE' },
  { categorieFrais: 'REPAS', categorieAgentId: 1, montant: 250, unite: 'PAR_DEPENSE' },
  { categorieFrais: 'TAXI', categorieAgentId: null, montant: 200, unite: 'PAR_JOUR' },
];

describe('trouverPlafond', () => {
  it('préfère le plafond propre à la catégorie d’agent', () => {
    expect(trouverPlafond(plafonds, 'REPAS', 1).montant).toBe(250);
    expect(trouverPlafond(plafonds, 'REPAS', 3).montant).toBe(150);
    expect(trouverPlafond(plafonds, 'TRANSPORT', 3)).toBeNull();
  });
});

describe('calculerNoteFrais', () => {
  it('sans plafond, tout est retenu', () => {
    const r = calculerNoteFrais({ lignes: [{ id: 1, date: j(10), categorie: 'TRANSPORT', montant: 860 }] });
    expect(r.lignes[0]).toMatchObject({ montantRetenu: 860, depassementPlafond: false });
    expect(r.montantARembourser).toBe(860);
  });

  it('plafond par dépense', () => {
    const r = calculerNoteFrais({
      plafonds,
      categorieAgentId: 3,
      lignes: [
        { id: 1, date: j(10), categorie: 'REPAS', montant: 180 },
        { id: 2, date: j(10), categorie: 'REPAS', montant: 120 },
      ],
    });
    expect(r.lignes.map((l) => l.montantRetenu)).toEqual([150, 120]);
    expect(r.lignes[0].depassementPlafond).toBe(true);
    expect(r.totalDepenses).toBe(300);
    expect(r.totalRetenu).toBe(270);
  });

  it('plafond spécifique à la catégorie d’agent', () => {
    const r = calculerNoteFrais({ plafonds, categorieAgentId: 1, lignes: [{ id: 1, date: j(10), categorie: 'REPAS', montant: 180 }] });
    expect(r.lignes[0].montantRetenu).toBe(180);
  });

  it('plafond journalier cumulé par jour, dans l’ordre chronologique', () => {
    const r = calculerNoteFrais({
      plafonds,
      lignes: [
        { id: 3, date: j(11), categorie: 'TAXI', montant: 90 },
        { id: 1, date: j(10), categorie: 'TAXI', montant: 120 },
        { id: 2, date: j(10), categorie: 'TAXI', montant: 120 },
      ],
    });
    // 10 mars : 120 + 80 (reste du plafond de 200) ; 11 mars : 90
    expect(r.lignes.map((l) => [l.id, l.montantRetenu])).toEqual([
      [3, 90],
      [1, 120],
      [2, 80],
    ]);
    expect(r.totalRetenu).toBe(290);
  });

  it('hébergement plafonné au barème × nuits à la charge de l’agent', () => {
    const r = calculerNoteFrais({
      plafondNuitee: 550,
      nuitsRemboursables: 3,
      lignes: [
        { id: 1, date: j(10), categorie: 'HEBERGEMENT', montant: 1200 },
        { id: 2, date: j(12), categorie: 'HEBERGEMENT', montant: 600 },
      ],
    });
    expect(r.lignes.map((l) => l.montantRetenu)).toEqual([1200, 450]);
    expect(r.lignes[1].depassementPlafond).toBe(true);
  });

  it('hébergement pris en charge par la Chambre : rien n’est remboursé', () => {
    const r = calculerNoteFrais({ plafondNuitee: 550, nuitsRemboursables: 0, lignes: [{ id: 1, date: j(10), categorie: 'HEBERGEMENT', montant: 500 }] });
    expect(r.lignes[0]).toMatchObject({ montantRetenu: 0, depassementPlafond: true });
  });

  it('les lignes non conformes ne sont pas retenues et ne consomment pas le plafond', () => {
    const r = calculerNoteFrais({
      plafonds,
      lignes: [
        { id: 1, date: j(10), categorie: 'TAXI', montant: 150, statutControle: 'NON_CONFORME' },
        { id: 2, date: j(10), categorie: 'TAXI', montant: 180 },
      ],
    });
    expect(r.lignes.map((l) => l.montantRetenu)).toEqual([0, 180]);
  });

  it('montant à rembourser = retenu + indemnités − avance', () => {
    const r = calculerNoteFrais({ lignes: [{ id: 1, date: j(10), categorie: 'TRANSPORT', montant: 860 }], indemnites: 1120, avance: 1000 });
    expect(r).toMatchObject({ totalRetenu: 860, totalIndemnites: 1120, avanceDeduite: 1000, montantARembourser: 980 });
  });

  it('avance supérieure aux frais : solde négatif (trop-perçu à reverser)', () => {
    const r = calculerNoteFrais({ lignes: [{ id: 1, date: j(10), categorie: 'TRANSPORT', montant: 300 }], indemnites: 200, avance: 1000 });
    expect(r.montantARembourser).toBe(-500);
  });

  it('arrondit au centime', () => {
    const r = calculerNoteFrais({
      lignes: [
        { id: 1, date: j(10), categorie: 'DIVERS', montant: 0.1 },
        { id: 2, date: j(10), categorie: 'DIVERS', montant: 0.2 },
      ],
    });
    expect(r.totalRetenu).toBe(0.3);
  });
});
