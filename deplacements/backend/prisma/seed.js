/**
 * Données initiales : référentiels, barèmes, circuits, comptes de démonstration.
 *   npm run db:seed            → référentiels + comptes (si la base est vide)
 *   npm run db:seed -- --demo  → ajoute des missions de démonstration
 *
 * Les barèmes fournis sont indicatifs : les remplacer par le barème officiel en vigueur
 * dans Paramétrage → Barèmes.
 */
const bcrypt = require('bcryptjs');
const prisma = require('../src/lib/prisma');
const { encryptText } = require('../src/lib/crypto');
const { prochainNumero } = require('../src/lib/numerotation');

const MOT_DE_PASSE_DEMO = 'Chambre2026!';
const annee = new Date().getFullYear();

async function referentiels() {
  const cat = {};
  for (const [code, libelle, ordre] of [
    ['A', 'Catégorie A — Direction / hors échelle', 1],
    ['B', 'Catégorie B — Cadres (échelles 10-11)', 2],
    ['C', 'Catégorie C — Agents de maîtrise (échelles 8-9)', 3],
    ['D', "Catégorie D — Agents d'exécution (échelles 1 à 7)", 4],
  ]) {
    cat[code] = await prisma.categorieAgent.create({ data: { code, libelle, ordre } });
  }

  const fonctions = {};
  for (const [libelle, c] of [
    ['Directeur', 'A'],
    ['Secrétaire général', 'A'],
    ['Chef de service', 'B'],
    ['Comptable', 'B'],
    ['Cadre administratif', 'B'],
    ['Conseiller en artisanat', 'C'],
    ['Animateur de formation', 'C'],
    ['Technicien', 'C'],
    ['Agent administratif', 'D'],
    ['Chauffeur', 'D'],
  ]) {
    fonctions[libelle] = await prisma.fonction.create({ data: { libelle, categorieId: cat[c].id } });
  }

  const zones = {};
  for (const [code, libelle, international] of [
    ['Z1', 'Région Souss Massa', false],
    ['Z2', 'Autres régions du Maroc', false],
    ['Z3', 'International — Afrique', true],
    ['Z4', 'International — Europe, Amériques, Asie', true],
  ]) {
    zones[code] = await prisma.zone.create({ data: { code, libelle, international } });
  }

  const destinations = [
    ['Agadir', 'Maroc', 'Z1', 0],
    ['Inezgane', 'Maroc', 'Z1', 13],
    ['Aït Melloul', 'Maroc', 'Z1', 15],
    ['Biougra', 'Maroc', 'Z1', 35],
    ['Taroudant', 'Maroc', 'Z1', 85],
    ['Tiznit', 'Maroc', 'Z1', 95],
    ['Tafraout', 'Maroc', 'Z1', 160],
    ['Tata', 'Maroc', 'Z1', 340],
    ['Marrakech', 'Maroc', 'Z2', 250],
    ['Essaouira', 'Maroc', 'Z2', 175],
    ['Casablanca', 'Maroc', 'Z2', 500],
    ['Rabat', 'Maroc', 'Z2', 590],
    ['Fès', 'Maroc', 'Z2', 790],
    ['Tanger', 'Maroc', 'Z2', 840],
    ['Laâyoune', 'Maroc', 'Z2', 650],
    ['Dakhla', 'Maroc', 'Z2', 1180],
    ['Dakar', 'Sénégal', 'Z3', null],
    ['Abidjan', "Côte d'Ivoire", 'Z3', null],
    ['Nouakchott', 'Mauritanie', 'Z3', null],
    ['Paris', 'France', 'Z4', null],
    ['Madrid', 'Espagne', 'Z4', null],
    ['Bruxelles', 'Belgique', 'Z4', null],
    ['Dubaï', 'Émirats arabes unis', 'Z4', null],
  ];
  const dest = {};
  for (const [ville, pays, z, distanceKm] of destinations) {
    dest[ville] = await prisma.destination.create({ data: { ville, pays, zoneId: zones[z].id, distanceKm } });
  }

  // [taux journalier, taux repas, plafond nuitée] par catégorie A, B, C, D — valeurs indicatives.
  const baremes = {
    Z1: [[300, 60, 600], [250, 50, 500], [200, 40, 400], [150, 30, 300]],
    Z2: [[450, 90, 900], [350, 70, 700], [280, 55, 550], [220, 45, 450]],
    Z3: [[1500, 300, 1800], [1200, 240, 1500], [1000, 200, 1200], [800, 160, 1000]],
    Z4: [[2000, 400, 2500], [1600, 320, 2000], [1300, 260, 1700], [1100, 220, 1400]],
  };
  for (const [z, lignes] of Object.entries(baremes)) {
    for (const [i, [tauxJournalier, tauxRepas, plafondNuitee]] of lignes.entries()) {
      await prisma.bareme.create({
        data: {
          zoneId: zones[z].id,
          categorieId: cat['ABCD'[i]].id,
          tauxJournalier,
          tauxRepas,
          plafondNuitee,
          tauxKilometrique: 2.5,
          dateDebut: new Date(annee - 1, 0, 1),
        },
      });
    }
  }

  for (const p of [
    { categorieFrais: 'REPAS', montant: 150, unite: 'PAR_DEPENSE' },
    { categorieFrais: 'TAXI', montant: 200, unite: 'PAR_JOUR' },
    { categorieFrais: 'DIVERS', montant: 300, unite: 'PAR_DEPENSE' },
    { categorieFrais: 'PEAGE_PARKING', montant: 500, unite: 'PAR_JOUR' },
  ]) {
    await prisma.plafondFrais.create({ data: p });
  }

  await prisma.projet.create({ data: { code: 'SALON-2026', libelle: "Salon régional de l'artisanat Souss Massa 2026" } });
  await prisma.projet.create({ data: { code: 'FORM-APPR', libelle: 'Programme de formation par apprentissage' } });

  for (const v of [
    { immatriculation: '12345-A-33', marque: 'Dacia', modele: 'Logan', carburant: 'Diesel', kilometrage: 84500 },
    { immatriculation: '23456-B-33', marque: 'Dacia', modele: 'Duster', carburant: 'Diesel', kilometrage: 61200 },
    { immatriculation: '34567-A-33', marque: 'Peugeot', modele: 'Partner', carburant: 'Diesel', kilometrage: 120300, nbPlaces: 2 },
  ]) {
    await prisma.vehicule.create({
      data: { ...v, dateAssurance: new Date(annee, 11, 31), dateVisiteTechnique: new Date(annee + 1, 2, 15) },
    });
  }

  await prisma.modeleDocument.create({
    data: {
      code: 'ORDRE_MISSION',
      titre: 'ORDRE DE MISSION',
      texteIntro: "Le Président de la Chambre d'Artisanat de la Région Souss Massa ordonne aux personnes désignées ci-dessous d'effectuer la mission suivante :",
      textePied: "Chambre d'Artisanat de la Région Souss Massa — Agadir",
      signataires: [{ libelle: "L'intéressé(e)" }, { libelle: 'Le Chef de service' }, { libelle: 'Le Directeur' }],
    },
  });
  await prisma.modeleDocument.create({
    data: {
      code: 'NOTE_FRAIS',
      titre: 'ÉTAT DES FRAIS DE DÉPLACEMENT',
      texteIntro: "Je soussigné(e) certifie l'exactitude des dépenses ci-dessous, engagées pour les besoins du service.",
      textePied: "Chambre d'Artisanat de la Région Souss Massa — Agadir",
      signataires: [{ libelle: "L'agent" }, { libelle: 'Le Chef de service' }, { libelle: 'Le Service financier' }],
    },
  });

  return { cat, fonctions, dest };
}

async function comptes({ cat, fonctions }) {
  const hash = await bcrypt.hash(MOT_DE_PASSE_DEMO, 12);
  const services = {};
  for (const [code, nom, parent] of [
    ['DIR', 'Direction', null],
    ['SAF', 'Service administratif et financier', 'DIR'],
    ['SPC', 'Service promotion et commercialisation', 'DIR'],
    ['SFE', 'Service formation et encadrement', 'DIR'],
    ['ANX-TRD', 'Annexe provinciale de Taroudant', 'DIR'],
    ['ANX-TZN', 'Annexe provinciale de Tiznit', 'DIR'],
  ]) {
    services[code] = await prisma.service.create({ data: { code, nom, parentId: parent ? services[parent].id : null } });
  }

  const u = {};
  const creer = async (cle, d) => {
    u[cle] = await prisma.user.create({
      data: {
        passwordHash: hash,
        telephone: '06' + String(Math.floor(10000000 + Math.random() * 89999999)),
        cinChiffre: encryptText(d.cin),
        ribChiffre: encryptText(d.rib),
        ...d.data,
      },
    });
  };
  await creer('admin', { data: { matricule: 'ADM001', nom: 'Système', prenom: 'Administrateur', email: 'admin@ca-soussmassa.ma', role: 'ADMIN', serviceId: services.SAF.id, fonctionId: fonctions['Cadre administratif'].id, categorieId: cat.B.id } });
  await creer('directeur', { cin: 'J123456', rib: '011780000012345678901234', data: { matricule: 'DIR001', nom: 'El Amrani', prenom: 'Hassan', email: 'directeur@ca-soussmassa.ma', role: 'VALIDATEUR', perimetreGlobal: true, serviceId: services.DIR.id, fonctionId: fonctions.Directeur.id, categorieId: cat.A.id } });
  await creer('chefSaf', { cin: 'JB45678', rib: '011780000098765432109876', data: { matricule: 'SAF001', nom: 'Benali', prenom: 'Fatima', email: 'chef.saf@ca-soussmassa.ma', role: 'VALIDATEUR', serviceId: services.SAF.id, fonctionId: fonctions['Chef de service'].id, categorieId: cat.B.id } });
  await creer('chefSpc', { cin: 'JE11223', rib: '230780000011122233344455', data: { matricule: 'SPC001', nom: 'Ouhammou', prenom: 'Rachid', email: 'chef.spc@ca-soussmassa.ma', role: 'VALIDATEUR', serviceId: services.SPC.id, fonctionId: fonctions['Chef de service'].id, categorieId: cat.B.id } });
  await creer('chefSfe', { cin: 'JA99887', rib: '007780000055566677788899', data: { matricule: 'SFE001', nom: 'Idrissi', prenom: 'Nadia', email: 'chef.sfe@ca-soussmassa.ma', role: 'VALIDATEUR', serviceId: services.SFE.id, fonctionId: fonctions['Chef de service'].id, categorieId: cat.B.id } });
  await creer('finance', { cin: 'JC33445', rib: '011780000044455566677788', data: { matricule: 'SAF002', nom: 'Aït Brahim', prenom: 'Karim', email: 'finance@ca-soussmassa.ma', role: 'FINANCIER', serviceId: services.SAF.id, fonctionId: fonctions.Comptable.id, categorieId: cat.B.id } });
  await creer('agent1', { cin: 'JH55667', rib: '145780000012312312312312', data: { matricule: 'SPC010', nom: 'Bouzid', prenom: 'Youssef', email: 'y.bouzid@ca-soussmassa.ma', role: 'AGENT', serviceId: services.SPC.id, fonctionId: fonctions['Conseiller en artisanat'].id, categorieId: cat.C.id } });
  await creer('agent2', { cin: 'JK77889', rib: '145780000045645645645645', data: { matricule: 'SPC011', nom: 'Lahcen', prenom: 'Samira', email: 's.lahcen@ca-soussmassa.ma', role: 'AGENT', serviceId: services.SPC.id, fonctionId: fonctions['Conseiller en artisanat'].id, categorieId: cat.C.id } });
  await creer('agent3', { cin: 'JM12121', rib: '145780000078978978978978', data: { matricule: 'SFE010', nom: 'Amzil', prenom: 'Omar', email: 'o.amzil@ca-soussmassa.ma', role: 'AGENT', serviceId: services.SFE.id, fonctionId: fonctions['Animateur de formation'].id, categorieId: cat.C.id } });
  await creer('chauffeur', { cin: 'JT34343', rib: '145780000032132132132132', data: { matricule: 'SAF020', nom: 'Oubella', prenom: 'Mustapha', email: 'm.oubella@ca-soussmassa.ma', role: 'AGENT', serviceId: services.SAF.id, fonctionId: fonctions.Chauffeur.id, categorieId: cat.D.id } });

  await prisma.service.update({ where: { id: services.DIR.id }, data: { responsableId: u.directeur.id } });
  await prisma.service.update({ where: { id: services.SAF.id }, data: { responsableId: u.chefSaf.id } });
  await prisma.service.update({ where: { id: services.SPC.id }, data: { responsableId: u.chefSpc.id } });
  await prisma.service.update({ where: { id: services.SFE.id }, data: { responsableId: u.chefSfe.id } });

  await prisma.circuitValidation.create({
    data: {
      nom: 'Circuit standard des ordres de mission',
      type: 'MISSION',
      etapes: {
        create: [
          { ordre: 1, libelle: 'Visa du chef de service', typeEtape: 'RESPONSABLE_SERVICE' },
          { ordre: 2, libelle: 'Approbation du Directeur', typeEtape: 'UTILISATEUR', utilisateurId: u.directeur.id },
        ],
      },
    },
  });
  await prisma.circuitValidation.create({
    data: {
      nom: 'Circuit standard des notes de frais',
      type: 'NOTE_FRAIS',
      etapes: {
        create: [
          { ordre: 1, libelle: 'Visa du chef de service', typeEtape: 'RESPONSABLE_SERVICE' },
          { ordre: 2, libelle: 'Contrôle du service financier', typeEtape: 'ROLE', role: 'FINANCIER' },
        ],
      },
    },
  });

  const projet = await prisma.projet.findUnique({ where: { code: 'SALON-2026' } });
  await prisma.budget.createMany({
    data: [
      { annee, libelle: `Budget global des déplacements ${annee}`, type: 'GLOBAL', montantInitial: 500000 },
      { annee, libelle: `Déplacements — Promotion et commercialisation ${annee}`, type: 'SERVICE', serviceId: services.SPC.id, montantInitial: 150000 },
      { annee, libelle: `Déplacements — Formation et encadrement ${annee}`, type: 'SERVICE', serviceId: services.SFE.id, montantInitial: 100000 },
      { annee, libelle: `Déplacements — Administratif et financier ${annee}`, type: 'SERVICE', serviceId: services.SAF.id, montantInitial: 50000 },
      { annee, libelle: `Projet ${projet.libelle}`, type: 'PROJET', projetId: projet.id, montantInitial: 80000 },
    ],
  });
  return { services, u };
}

/** Quelques missions dans différents états, pour découvrir l'application. */
async function demo({ dest }, { services, u }) {
  const jour = (offset, h = 8) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    d.setHours(h, 0, 0, 0);
    return d;
  };
  const budgetSpc = await prisma.budget.findFirst({ where: { type: 'SERVICE', serviceId: services.SPC.id } });
  const budgetSfe = await prisma.budget.findFirst({ where: { type: 'SERVICE', serviceId: services.SFE.id } });
  const circuitM = await prisma.circuitValidation.findFirst({ where: { type: 'MISSION' } });
  const circuitN = await prisma.circuitValidation.findFirst({ where: { type: 'NOTE_FRAIS' } });

  // 1. Mission clôturée et remboursée.
  const m1 = await prisma.mission.create({
    data: {
      numero: await prochainNumero('OM'),
      objet: 'Participation au Salon national de l’artisanat',
      description: 'Stand de la Chambre et accompagnement de 12 coopératives.',
      destinationId: dest.Casablanca.id,
      dateDepart: jour(-30, 7),
      dateRetour: jour(-27, 19),
      moyenTransport: 'TRAIN',
      demandeurId: u.agent1.id,
      serviceId: services.SPC.id,
      budgetId: budgetSpc.id,
      circuitId: circuitM.id,
      statut: 'CLOTURE',
      fraisTransportEstimes: 900,
      coutEstime: 3670,
      soumisLe: jour(-40),
      approuveLe: jour(-38),
      clotureLe: jour(-26),
      participants: { create: [{ userId: u.agent1.id, chefMission: true }] },
      validations: {
        create: [
          { objetType: 'MISSION', etapeOrdre: 1, etapeLibelle: 'Visa du chef de service', validateurId: u.chefSpc.id, decision: 'APPROUVE', createdAt: jour(-39) },
          { objetType: 'MISSION', etapeOrdre: 2, etapeLibelle: 'Approbation du Directeur', validateurId: u.directeur.id, decision: 'APPROUVE', createdAt: jour(-38) },
        ],
      },
    },
  });
  await prisma.noteFrais.create({
    data: {
      numero: await prochainNumero('NF'),
      missionId: m1.id,
      agentId: u.agent1.id,
      circuitId: circuitN.id,
      statut: 'REMBOURSEE',
      joursIndemnises: 4,
      tauxJournalier: 280,
      totalIndemnites: 1120,
      totalDepenses: 2620,
      totalRetenu: 2560,
      avanceDeduite: 0,
      montantARembourser: 3680,
      soumiseLe: jour(-25),
      valideeLe: jour(-22),
      rembourseeLe: jour(-20),
      modePaiement: 'VIREMENT',
      referencePaiement: 'VIR-2026-0412',
      validations: {
        create: [
          { objetType: 'NOTE_FRAIS', etapeOrdre: 1, etapeLibelle: 'Visa du chef de service', validateurId: u.chefSpc.id, decision: 'APPROUVE', createdAt: jour(-24) },
          { objetType: 'NOTE_FRAIS', etapeOrdre: 2, etapeLibelle: 'Contrôle du service financier', validateurId: u.finance.id, decision: 'APPROUVE', createdAt: jour(-22) },
        ],
      },
      lignes: {
        create: [
          { date: jour(-30), categorie: 'TRANSPORT', description: 'Train Marrakech–Casablanca A/R + car Agadir–Marrakech', montant: 860, montantRetenu: 860, statutControle: 'CONFORME' },
          { date: jour(-30), categorie: 'HEBERGEMENT', description: 'Hôtel 3 nuits', montant: 1500, montantRetenu: 1500, statutControle: 'CONFORME' },
          { date: jour(-29), categorie: 'TAXI', description: 'Taxis hôtel–salon', montant: 260, montantRetenu: 200, depassementPlafond: true, statutControle: 'CONFORME' },
        ],
      },
    },
  });

  // 2. Mission approuvée à venir, avec véhicule de service.
  const vehicule = await prisma.vehicule.findFirst({ where: { modele: 'Duster' } });
  await prisma.mission.create({
    data: {
      numero: await prochainNumero('OM'),
      objet: 'Encadrement des coopératives de tapis — Taznakht et Tata',
      destinationId: dest.Tata.id,
      dateDepart: jour(7, 7),
      dateRetour: jour(9, 18),
      moyenTransport: 'VOITURE_SERVICE',
      vehiculeId: vehicule.id,
      demandeurId: u.agent3.id,
      serviceId: services.SFE.id,
      budgetId: budgetSfe.id,
      circuitId: circuitM.id,
      statut: 'APPROUVE',
      coutEstime: 2450,
      soumisLe: jour(-3),
      approuveLe: jour(-1),
      participants: { create: [{ userId: u.agent3.id, chefMission: true }, { userId: u.chauffeur.id }] },
      validations: {
        create: [
          { objetType: 'MISSION', etapeOrdre: 1, etapeLibelle: 'Visa du chef de service', validateurId: u.chefSfe.id, decision: 'APPROUVE' },
          { objetType: 'MISSION', etapeOrdre: 2, etapeLibelle: 'Approbation du Directeur', validateurId: u.directeur.id, decision: 'APPROUVE' },
        ],
      },
    },
  });

  // 3. Mission en attente de visa du chef de service.
  await prisma.mission.create({
    data: {
      numero: await prochainNumero('OM'),
      objet: 'Préparation du Salon régional — repérage à Taroudant',
      destinationId: dest.Taroudant.id,
      dateDepart: jour(14, 8),
      dateRetour: jour(14, 17),
      moyenTransport: 'VOITURE_PERSONNELLE',
      demandeurId: u.agent2.id,
      serviceId: services.SPC.id,
      budgetId: budgetSpc.id,
      circuitId: circuitM.id,
      etapeCourante: 1,
      statut: 'EN_ATTENTE',
      fraisTransportEstimes: 400,
      coutEstime: 600,
      soumisLe: new Date(),
      participants: { create: [{ userId: u.agent2.id, chefMission: true }] },
    },
  });

  // 4. Brouillon.
  await prisma.mission.create({
    data: {
      objet: 'Rencontre B2B avec les acheteurs — Dakar',
      destinationId: dest.Dakar.id,
      dateDepart: jour(40, 10),
      dateRetour: jour(44, 20),
      moyenTransport: 'AVION',
      demandeurId: u.chefSpc.id,
      serviceId: services.SPC.id,
      budgetId: budgetSpc.id,
      fraisTransportEstimes: 6500,
      coutEstime: 28300,
      participants: { create: [{ userId: u.chefSpc.id, chefMission: true }, { userId: u.agent1.id }] },
    },
  });
}

async function main() {
  if (await prisma.user.count()) {
    console.log('La base contient déjà des utilisateurs : seed ignoré.');
    return;
  }
  const r = await referentiels();
  const c = await comptes(r);
  if (process.argv.includes('--demo')) await demo(r, c);
  console.log('Données initiales créées.');
  console.log(`Comptes de démonstration (mot de passe : ${MOT_DE_PASSE_DEMO}) :`);
  console.log('  admin@ca-soussmassa.ma (administrateur), directeur@…, chef.spc@…, finance@…, y.bouzid@… (agent)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
