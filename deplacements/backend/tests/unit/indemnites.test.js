import { describe, it, expect } from 'vitest';
const { joursIndemnisables, nuitees, calculerIndemnites, selectionnerBareme, estimerCoutMission } = require('../../src/domain/indemnites');

// Dates locales (TZ=Africa/Casablanca) : new Date(an, mois, jour, heure, minute)
const d = (j, h = 8, m = 0) => new Date(2026, 2, j, h, m);
const bareme = { tauxJournalier: 280, tauxRepas: 55, plafondNuitee: 550 };

describe('nuitees', () => {
  it('compte les jours civils entre départ et retour', () => {
    expect(nuitees(d(10, 7), d(13, 19))).toBe(3);
    expect(nuitees(d(10, 7), d(10, 19))).toBe(0);
    expect(nuitees(d(10, 23, 30), d(11, 0, 30))).toBe(1);
  });
});

describe('joursIndemnisables', () => {
  it('mission de plusieurs jours : départ matin et retour soir comptent en entier', () => {
    expect(joursIndemnisables(d(10, 7), d(13, 19))).toBe(4);
  });

  it('départ après midi : demi-journée le premier jour', () => {
    expect(joursIndemnisables(d(10, 12), d(13, 19))).toBe(3.5);
    expect(joursIndemnisables(d(10, 11, 59), d(13, 19))).toBe(4);
  });

  it('retour avant 14h : demi-journée le dernier jour', () => {
    expect(joursIndemnisables(d(10, 7), d(13, 13, 59))).toBe(3.5);
    expect(joursIndemnisables(d(10, 7), d(13, 14))).toBe(4);
  });

  it('départ tardif et retour matinal : deux demi-journées', () => {
    expect(joursIndemnisables(d(10, 18), d(11, 9))).toBe(1);
  });

  it('mission dans la journée : 1 jour à partir de 6 h, sinon ½', () => {
    expect(joursIndemnisables(d(10, 8), d(10, 14))).toBe(1);
    expect(joursIndemnisables(d(10, 8), d(10, 13, 59))).toBe(0.5);
  });

  it('règles personnalisables', () => {
    const regles = { heureLimiteDepart: 10, heureLimiteRetour: 18, dureeMinJourneeH: 4 };
    expect(joursIndemnisables(d(10, 11), d(12, 17), regles)).toBe(2);
    expect(joursIndemnisables(d(10, 8), d(10, 12), regles)).toBe(1);
  });

  it('refuse un retour antérieur au départ et les dates invalides', () => {
    expect(() => joursIndemnisables(d(12), d(10))).toThrow(/retour/);
    expect(() => joursIndemnisables('n’importe quoi', d(10))).toThrow(/invalides/);
  });
});

describe('calculerIndemnites', () => {
  it('jours × taux journalier', () => {
    const r = calculerIndemnites({ dateDepart: d(10, 7), dateRetour: d(13, 19), bareme });
    expect(r).toMatchObject({ jours: 4, nuits: 3, tauxJournalier: 280, montantBrut: 1120, deductionRepas: 0, montant: 1120 });
  });

  it('déduit les repas fournis au taux repas', () => {
    const r = calculerIndemnites({ dateDepart: d(10, 7), dateRetour: d(13, 19), bareme, nbRepasFournis: 3 });
    expect(r.deductionRepas).toBe(165);
    expect(r.montant).toBe(955);
  });

  it('ne devient jamais négatif', () => {
    const r = calculerIndemnites({ dateDepart: d(10, 8), dateRetour: d(10, 11), bareme, nbRepasFournis: 10 });
    expect(r.montantBrut).toBe(140);
    expect(r.montant).toBe(0);
  });

  it('accepte des montants Decimal sous forme de chaînes et arrondit au centime', () => {
    const r = calculerIndemnites({ dateDepart: d(10, 12), dateRetour: d(11, 9), bareme: { tauxJournalier: '333.33', tauxRepas: '0' } });
    expect(r.montant).toBe(333.33);
  });

  it('exige un barème', () => {
    expect(() => calculerIndemnites({ dateDepart: d(10), dateRetour: d(11), bareme: null })).toThrow(/barème/);
  });
});

describe('selectionnerBareme', () => {
  const baremes = [
    { id: 1, zoneId: 1, categorieId: 1, dateDebut: new Date(2025, 0, 1), dateFin: new Date(2025, 11, 31) },
    { id: 2, zoneId: 1, categorieId: 1, dateDebut: new Date(2026, 0, 1), dateFin: null },
    { id: 3, zoneId: 1, categorieId: 2, dateDebut: new Date(2025, 0, 1), dateFin: null },
    { id: 4, zoneId: 2, categorieId: 1, dateDebut: new Date(2025, 0, 1), dateFin: null },
  ];
  it('retient le barème en vigueur à la date de la mission', () => {
    expect(selectionnerBareme(baremes, { zoneId: 1, categorieId: 1, date: new Date(2025, 5, 1) }).id).toBe(1);
    expect(selectionnerBareme(baremes, { zoneId: 1, categorieId: 1, date: new Date(2026, 5, 1) }).id).toBe(2);
    expect(selectionnerBareme(baremes, { zoneId: 1, categorieId: 1, date: new Date(2025, 11, 31, 18) }).id).toBe(1);
  });
  it('filtre zone et catégorie', () => {
    expect(selectionnerBareme(baremes, { zoneId: 2, categorieId: 1, date: new Date(2026, 1, 1) }).id).toBe(4);
    expect(selectionnerBareme(baremes, { zoneId: 2, categorieId: 2, date: new Date(2026, 1, 1) })).toBeNull();
  });
  it('aucun barème avant la première date de validité', () => {
    expect(selectionnerBareme(baremes, { zoneId: 1, categorieId: 1, date: new Date(2024, 5, 1) })).toBeNull();
  });
  it('à périodes chevauchantes, le plus récent l’emporte', () => {
    const b = [...baremes, { id: 5, zoneId: 1, categorieId: 2, dateDebut: new Date(2026, 2, 1), dateFin: null }];
    expect(selectionnerBareme(b, { zoneId: 1, categorieId: 2, date: new Date(2026, 5, 1) }).id).toBe(5);
  });
});

describe('estimerCoutMission', () => {
  it('additionne indemnités, nuitées au plafond, transport et autres frais', () => {
    const r = estimerCoutMission({
      participants: [
        { userId: 1, bareme },
        { userId: 2, bareme: { tauxJournalier: 220, tauxRepas: 45, plafondNuitee: 450 } },
      ],
      dateDepart: d(10, 7),
      dateRetour: d(13, 19),
      fraisTransportEstimes: 900,
      autresFraisEstimes: 100,
    });
    // agent 1 : 4 × 280 + 3 × 550 = 2770 ; agent 2 : 4 × 220 + 3 × 450 = 2230
    expect(r.detail.map((x) => x.total)).toEqual([2770, 2230]);
    expect(r.total).toBe(6000);
  });

  it('signale les participants sans barème sans bloquer', () => {
    const r = estimerCoutMission({ participants: [{ userId: 1, bareme: null }], dateDepart: d(10), dateRetour: d(10, 18) });
    expect(r.detail[0].sansBareme).toBe(true);
    expect(r.total).toBe(0);
  });
});
