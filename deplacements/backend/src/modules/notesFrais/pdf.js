const prisma = require('../../lib/prisma');
const { creerPdf, section, champs, tableau, signatures } = require('../../lib/pdf');
const { mad, date, dateHeure, LIBELLES, nomComplet } = require('../../lib/format');
const { tousLesParametres } = require('../../lib/parametres');
const { num } = require('../../domain/montants');

const SIGNATAIRES_DEFAUT = [{ libelle: "L'agent" }, { libelle: 'Le Chef de service' }, { libelle: 'Le Service financier' }];

async function pdfNoteFrais(n) {
  const [modele, params, agent] = await Promise.all([
    prisma.modeleDocument.findUnique({ where: { code: 'NOTE_FRAIS' } }),
    tousLesParametres(),
    prisma.user.findUnique({ where: { id: n.agentId }, include: { service: true, fonction: true, categorie: true } }),
  ]);
  const { doc, largeur, fin } = await creerPdf({
    titre: modele?.titre || 'ÉTAT DES FRAIS DE DÉPLACEMENT',
    sousTitre: `N° ${n.numero || '— (brouillon)'} — ${LIBELLES.statutNote[n.statut]}`,
    modele,
  });

  section(doc, 'Agent et mission');
  champs(
    doc,
    [
      ['Agent', `${nomComplet(agent)} (matricule ${agent.matricule})`],
      ['Service', agent.service?.nom || '—'],
      ['Fonction / catégorie', `${agent.fonction?.libelle || '—'} / ${agent.categorie?.libelle || '—'}`],
      ['Ordre de mission', n.mission.numero || '—'],
      ['Objet', n.mission.objet],
      ['Destination', n.mission.destination.ville],
      ['Période', `du ${dateHeure(n.mission.dateDepart)} au ${dateHeure(n.mission.dateRetour)}`],
    ],
    largeur
  );

  section(doc, 'Dépenses');
  tableau(
    doc,
    [
      { label: 'Date', width: 0.9 },
      { label: 'Catégorie', width: 1.1 },
      { label: 'Description', width: 2.2 },
      { label: 'Pièce', width: 0.6, align: 'center' },
      { label: 'Contrôle', width: 1 },
      { label: 'Montant', width: 1.1, align: 'right' },
      { label: 'Retenu', width: 1.1, align: 'right' },
    ],
    n.lignes.map((l) => [
      date(l.date),
      LIBELLES.categorieFrais[l.categorie],
      [l.description, l.depassementPlafond ? '(plafonné)' : '', l.commentaireControle].filter(Boolean).join(' '),
      l.documentId ? 'Oui' : 'Non',
      { EN_ATTENTE: 'À contrôler', CONFORME: 'Conforme', NON_CONFORME: 'Non conforme' }[l.statutControle],
      mad(l.montant),
      mad(l.montantRetenu),
    ]),
    largeur,
    { total: ['', '', 'Total des dépenses', '', '', mad(n.totalDepenses), mad(n.totalRetenu)] }
  );

  section(doc, 'Décompte');
  tableau(
    doc,
    [
      { label: 'Élément', width: 3 },
      { label: 'Montant', width: 1.2, align: 'right' },
    ],
    [
      ['Dépenses retenues', mad(n.totalRetenu)],
      [`Indemnités journalières (${String(num(n.joursIndemnises)).replace('.', ',')} j × ${mad(n.tauxJournalier)}, repas fournis déduits)`, mad(n.totalIndemnites)],
      ['Avance déduite', `- ${mad(n.avanceDeduite)}`],
    ],
    largeur,
    { total: [num(n.montantARembourser) >= 0 ? 'Net à rembourser à l’agent' : 'Trop-perçu à reverser par l’agent', mad(Math.abs(num(n.montantARembourser)))] }
  );

  const vals = n.validations.filter((v) => v.decision === 'APPROUVE');
  if (vals.length || n.rembourseeLe) {
    section(doc, 'Visas et paiement');
    champs(
      doc,
      [
        ...vals.map((v) => [v.etapeLibelle, `${nomComplet(v.validateur)} — ${dateHeure(v.createdAt)}`]),
        ...(n.rembourseeLe ? [['Paiement', `${date(n.rembourseeLe)} — ${n.modePaiement || ''} ${n.referencePaiement || ''}`]] : []),
      ],
      largeur
    );
  }
  signatures(doc, modele?.signataires?.length ? modele.signataires : SIGNATAIRES_DEFAUT, largeur, params.organisme?.ville);
  return fin();
}

module.exports = { pdfNoteFrais };
