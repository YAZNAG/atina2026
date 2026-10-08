const prisma = require('../../lib/prisma');
const { creerPdf, section, champs, tableau, signatures } = require('../../lib/pdf');
const { mad, date, dateHeure, LIBELLES, nomComplet } = require('../../lib/format');
const { tousLesParametres } = require('../../lib/parametres');
const { estimer } = require('./service');

const SIGNATAIRES_DEFAUT = [{ libelle: "L'intéressé(e)" }, { libelle: 'Le Chef de service' }, { libelle: 'Le Directeur' }];

async function pdfOrdreMission(m) {
  const [modele, params] = await Promise.all([
    prisma.modeleDocument.findUnique({ where: { code: 'ORDRE_MISSION' } }),
    tousLesParametres(),
  ]);
  const brouillon = !['APPROUVE', 'EN_COURS', 'CLOTURE'].includes(m.statut);
  const { doc, largeur, fin } = await creerPdf({
    titre: modele?.titre || 'ORDRE DE MISSION',
    sousTitre: `N° ${m.numero || '— (non attribué)'}${brouillon ? ` — ${LIBELLES.statutMission[m.statut].toUpperCase()}` : ''}`,
    modele,
  });

  if (brouillon) {
    doc.save();
    doc.rotate(-35, { origin: [300, 420] }).font('Helvetica-Bold').fontSize(70).fillColor('#e7e5e4').opacity(0.6);
    doc.text('PROJET', 120, 400, { lineBreak: false });
    doc.restore();
    doc.opacity(1);
  }

  section(doc, 'Mission');
  champs(
    doc,
    [
      ['Objet', m.objet],
      ['Destination', `${m.destination.ville} (${m.destination.pays}) — ${m.destination.zone.libelle}`],
      ['Lieu précis', m.lieuPrecis || '—'],
      ['Départ', dateHeure(m.dateDepart)],
      ['Retour', dateHeure(m.dateRetour)],
      ['Moyen de transport', LIBELLES.moyenTransport[m.moyenTransport]],
      ...(m.vehicule ? [['Véhicule', `${m.vehicule.marque} ${m.vehicule.modele} — ${m.vehicule.immatriculation}`]] : []),
      ['Service demandeur', m.service.nom],
      ...(m.projet ? [['Projet', `${m.projet.code} — ${m.projet.libelle}`]] : []),
      ['Demandeur', nomComplet(m.demandeur)],
    ],
    largeur
  );
  if (m.description) {
    doc.moveDown(0.3);
    doc.font('Helvetica-Oblique').fontSize(9).fillColor('#44403c').text(m.description, { width: largeur });
  }

  section(doc, 'Personnes missionnées');
  const users = await prisma.user.findMany({
    where: { id: { in: m.participants.map((p) => p.userId) } },
    include: { fonction: true, categorie: true },
  });
  const parId = new Map(users.map((u) => [u.id, u]));
  tableau(
    doc,
    [
      { label: 'Matricule', width: 1 },
      { label: 'Nom et prénom', width: 2.2 },
      { label: 'Fonction', width: 2 },
      { label: 'Catégorie', width: 1.3 },
      { label: 'Rôle', width: 1.1 },
    ],
    m.participants.map((p) => {
      const u = parId.get(p.userId);
      return [u.matricule, nomComplet(u), u.fonction?.libelle || '—', u.categorie?.libelle || '—', p.chefMission ? 'Chef de mission' : 'Membre'];
    }),
    largeur
  );

  section(doc, 'Estimation des frais');
  const est = await estimer({
    destinationId: m.destinationId,
    participantIds: m.participants.map((p) => p.userId),
    dateDepart: m.dateDepart,
    dateRetour: m.dateRetour,
    nbRepasFournis: m.nbRepasFournis,
    fraisTransportEstimes: m.fraisTransportEstimes,
    autresFraisEstimes: m.autresFraisEstimes,
  });
  tableau(
    doc,
    [
      { label: 'Bénéficiaire', width: 2.4 },
      { label: 'Jours', width: 0.8, align: 'right' },
      { label: 'Taux journalier', width: 1.4, align: 'right' },
      { label: 'Indemnités', width: 1.4, align: 'right' },
      { label: 'Hébergement (plafond)', width: 1.6, align: 'right' },
    ],
    [
      ...est.detail.map((d) => [d.nom, d.sansBareme ? '—' : String(d.jours).replace('.', ','), d.sansBareme ? 'Sans barème' : mad(d.tauxJournalier), mad(d.indemnites), mad(d.hebergement)]),
      ['Transport estimé', '', '', '', mad(est.transport)],
      ['Autres frais estimés', '', '', '', mad(est.autres)],
    ],
    largeur,
    { total: ['Coût total estimé', '', '', '', mad(est.total)] }
  );
  if (m.reservations.length) {
    section(doc, 'Réservations');
    tableau(
      doc,
      [
        { label: 'Type', width: 1.4 },
        { label: 'Prestataire / référence', width: 2.4 },
        { label: 'Date', width: 1.1 },
        { label: 'Payé par', width: 1 },
        { label: 'Montant', width: 1.2, align: 'right' },
      ],
      m.reservations.map((r) => [
        LIBELLES.typeReservation[r.type],
        [r.prestataire, r.reference].filter(Boolean).join(' — ') || '—',
        date(r.dateDebut),
        r.payePar === 'CHAMBRE' ? 'Chambre' : 'Agent',
        mad(r.montant),
      ]),
      largeur
    );
  }

  const validations = m.validations.filter((v) => v.decision === 'APPROUVE');
  if (validations.length) {
    section(doc, 'Visas');
    tableau(
      doc,
      [
        { label: 'Étape', width: 2 },
        { label: 'Validé par', width: 2 },
        { label: 'Le', width: 1.3 },
      ],
      validations.map((v) => [v.etapeLibelle, nomComplet(v.validateur), dateHeure(v.createdAt)]),
      largeur
    );
  }

  if (modele?.textePied) doc.moveDown(0.5);
  signatures(doc, modele?.signataires?.length ? modele.signataires : SIGNATAIRES_DEFAUT, largeur, params.organisme?.ville);
  return fin();
}

module.exports = { pdfOrdreMission };
