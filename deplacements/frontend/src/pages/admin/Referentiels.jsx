import { useMemo, useState } from 'react';
import { History, Info as InfoIcone, Plus } from 'lucide-react';
import { lire } from '../../api/client';
import { useDonnees } from '../../hooks/useDonnees';
import { Badge, EnTete, Onglets } from '../../components/ui';
import { LIBELLES, mad, nombre, nomComplet, options } from '../../lib/format';
import CrudGenerique, { dateJour, isoJour } from './CrudGenerique';

const actifBadge = (it) => (it.actif ? <Badge ton="vert">Actif</Badge> : <Badge>Inactif</Badge>);
const oui = (v) => (v ? <Badge ton="bleu">Oui</Badge> : <span className="text-stone-400">Non</span>);
const champActif = { cle: 'actif', libelle: 'Actif', type: 'case', defaut: true, aide: 'Décocher pour ne plus le proposer sans le supprimer.' };

const optCategories = (ctx) => (ctx.categories || []).map((c) => ({ value: c.id, label: `${c.code} — ${c.libelle}` }));
const optZones = (ctx) => (ctx.zones || []).map((z) => ({ value: z.id, label: `${z.code} — ${z.libelle}` }));

/** Barème en vigueur à une date (dateDebut ≤ jour ≤ dateFin), le plus récent d'abord. */
function enVigueur(baremes, jour) {
  return baremes
    .filter((b) => isoJour(b.dateDebut) <= jour && (!b.dateFin || isoJour(b.dateFin) >= jour))
    .sort((a, b) => isoJour(b.dateDebut).localeCompare(isoJour(a.dateDebut)))[0];
}

/** Grille des barèmes : une ligne par zone, une colonne par catégorie d'agents. */
function GrilleBaremes({ items, modifier, ajouter, ctx }) {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const categories = [...(ctx.categories || [])].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
  const zones = ctx.zones || [];
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Zone</th>
              {categories.map((c) => (
                <th key={c.id} title={c.libelle}>
                  Cat. {c.code}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {zones.map((z) => (
              <tr key={z.id}>
                <td className="min-w-[10rem]">
                  <p className="font-medium text-stone-800">{z.libelle}</p>
                  <p className="text-xs text-stone-500">
                    {z.code}
                    {z.international && ' · international'}
                  </p>
                </td>
                {categories.map((c) => {
                  const lignes = items.filter((b) => b.zoneId === z.id && b.categorieId === c.id);
                  const b = enVigueur(lignes, aujourdhui);
                  const autres = lignes.length - (b ? 1 : 0);
                  if (!b) {
                    return (
                      <td key={c.id}>
                        <button
                          className="btn-ghost btn-sm text-stone-400"
                          onClick={() => ajouter({ zoneId: z.id, categorieId: c.id, dateDebut: aujourdhui })}
                          title="Définir un barème"
                        >
                          <Plus className="h-3.5 w-3.5" /> Définir
                        </button>
                        {autres > 0 && <p className="text-[11px] text-stone-400">{autres} hors vigueur</p>}
                      </td>
                    );
                  }
                  return (
                    <td key={c.id} className="min-w-[9rem]">
                      <button onClick={() => modifier(b)} className="w-full rounded-lg p-1 text-left hover:bg-brand-50" title="Modifier ce barème">
                        <p className="font-semibold text-stone-900">{mad(b.tauxJournalier)}</p>
                        <p className="text-xs text-stone-500">Repas {mad(b.tauxRepas)}</p>
                        <p className="text-xs text-stone-500">Nuitée ≤ {mad(b.plafondNuitee)}</p>
                        <p className="text-xs text-stone-500">{nombre(b.tauxKilometrique, 2)} MAD/km</p>
                        <p className="mt-0.5 text-[11px] text-stone-400">
                          depuis le {dateJour(b.dateDebut)}
                          {b.dateFin && ` jusqu’au ${dateJour(b.dateFin)}`}
                        </p>
                        {autres > 0 && (
                          <p className="text-[11px] text-zellige-700">
                            <History className="mr-0.5 inline h-3 w-3" />
                            {autres} autre{autres > 1 ? 's' : ''} période{autres > 1 ? 's' : ''}
                          </p>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-stone-500">
        Taux journalier en vigueur au {dateJour(aujourdhui)}. Cliquez sur une cellule pour la modifier ; la « Liste détaillée » affiche toutes les périodes.
      </p>
    </div>
  );
}

const AVERTISSEMENT_BAREMES = (
  <div className="flex items-start gap-2 rounded-xl border border-zellige-100 bg-zellige-50 p-3 text-sm text-zellige-800">
    <InfoIcone className="mt-0.5 h-4 w-4 shrink-0" />
    <p>
      L’historique des barèmes est conservé grâce aux dates de validité : pour une revalorisation, ne modifiez pas le barème existant
      — renseignez sa <strong>date de fin</strong> puis créez un nouveau barème avec une <strong>date de début</strong> postérieure.
      Les missions déjà calculées gardent ainsi le taux applicable à leur date.
    </p>
  </div>
);

function configurations() {
  return {
    services: {
      titre: 'Services',
      nommer: (s) => s.nom,
      colonnes: [
        { cle: 'code', libelle: 'Code', rendu: (s) => <span className="font-mono text-xs">{s.code}</span> },
        { cle: 'nom', libelle: 'Nom', rendu: (s) => <span className="font-medium text-stone-800">{s.nom}</span> },
        { cle: 'parent', libelle: 'Service parent', rendu: (s) => s.parent?.nom || '—' },
        { cle: 'responsable', libelle: 'Responsable', rendu: (s) => (s.responsable ? nomComplet(s.responsable) : <span className="text-amber-700">Non désigné</span>) },
        { cle: 'actif', libelle: 'État', rendu: actifBadge },
      ],
      champs: [
        { cle: 'code', libelle: 'Code', type: 'texte', requis: true, placeholder: 'ex. SAF' },
        { cle: 'nom', libelle: 'Nom', type: 'texte', requis: true },
        {
          cle: 'parentId',
          libelle: 'Service parent',
          type: 'select',
          numerique: true,
          nullable: true,
          vide: 'Aucun (niveau racine)',
          options: (c, f, item) => (c.services || []).filter((s) => s.id !== item?.id).map((s) => ({ value: s.id, label: s.nom })),
          aide: 'Sert à la remontée hiérarchique des validations.',
        },
        {
          cle: 'responsableId',
          libelle: 'Responsable',
          type: 'select',
          numerique: true,
          nullable: true,
          vide: 'Non désigné',
          options: (c) => (c.annuaire || []).map((u) => ({ value: u.id, label: `${nomComplet(u)}${u.service ? ` — ${u.service.nom}` : ''}` })),
          aide: 'Valide les étapes « Responsable du service ».',
        },
        { ...champActif, pleineLargeur: true },
      ],
    },
    'categories-agents': {
      titre: 'Catégories d’agents',
      nommer: (c) => c.libelle,
      colonnes: [
        { cle: 'ordre', libelle: 'Ordre' },
        { cle: 'code', libelle: 'Code', rendu: (c) => <span className="font-mono text-xs">{c.code}</span> },
        { cle: 'libelle', libelle: 'Libellé' },
      ],
      champs: [
        { cle: 'code', libelle: 'Code', type: 'texte', requis: true, placeholder: 'ex. A' },
        { cle: 'ordre', libelle: 'Ordre d’affichage', type: 'nombre' },
        { cle: 'libelle', libelle: 'Libellé', type: 'texte', requis: true, pleineLargeur: true },
      ],
    },
    fonctions: {
      titre: 'Fonctions',
      nommer: (f) => f.libelle,
      colonnes: [
        { cle: 'libelle', libelle: 'Libellé', rendu: (f) => <span className="font-medium text-stone-800">{f.libelle}</span> },
        { cle: 'categorie', libelle: 'Catégorie', rendu: (f) => f.categorie?.libelle || '—' },
        { cle: 'actif', libelle: 'État', rendu: actifBadge },
      ],
      champs: [
        { cle: 'libelle', libelle: 'Libellé', type: 'texte', requis: true, pleineLargeur: true },
        { cle: 'categorieId', libelle: 'Catégorie d’agents', type: 'select', numerique: true, nullable: true, vide: 'Aucune', options: optCategories },
        champActif,
      ],
    },
    zones: {
      titre: 'Zones',
      nommer: (z) => z.libelle,
      colonnes: [
        { cle: 'code', libelle: 'Code', rendu: (z) => <span className="font-mono text-xs">{z.code}</span> },
        { cle: 'libelle', libelle: 'Libellé' },
        { cle: 'international', libelle: 'International', rendu: (z) => oui(z.international) },
      ],
      champs: [
        { cle: 'code', libelle: 'Code', type: 'texte', requis: true, placeholder: 'ex. Z1' },
        { cle: 'libelle', libelle: 'Libellé', type: 'texte', requis: true },
        { cle: 'international', libelle: 'Zone internationale', type: 'case', pleineLargeur: true },
      ],
    },
    destinations: {
      titre: 'Destinations',
      nommer: (d) => `${d.ville} (${d.pays})`,
      colonnes: [
        { cle: 'ville', libelle: 'Ville', rendu: (d) => <span className="font-medium text-stone-800">{d.ville}</span> },
        { cle: 'pays', libelle: 'Pays' },
        { cle: 'zone', libelle: 'Zone', rendu: (d) => (d.zone ? `${d.zone.code} — ${d.zone.libelle}` : '—') },
        { cle: 'distanceKm', libelle: 'Distance', className: 'text-right', rendu: (d) => (d.distanceKm != null ? `${nombre(d.distanceKm)} km` : '—') },
        { cle: 'actif', libelle: 'État', rendu: actifBadge },
      ],
      champs: [
        { cle: 'ville', libelle: 'Ville', type: 'texte', requis: true },
        { cle: 'pays', libelle: 'Pays', type: 'texte', requis: true, defaut: 'Maroc' },
        { cle: 'zoneId', libelle: 'Zone', type: 'select', numerique: true, requis: true, options: optZones },
        { cle: 'distanceKm', libelle: 'Distance depuis le siège (km)', type: 'nombre', nullable: true, aide: 'Utilisée pour les indemnités kilométriques.' },
        { ...champActif, pleineLargeur: true },
      ],
    },
    baremes: {
      titre: 'Barèmes',
      nommer: (b) => `${b.zone?.libelle} / ${b.categorie?.libelle} (depuis le ${dateJour(b.dateDebut)})`,
      avantPropos: AVERTISSEMENT_BAREMES,
      vue: (p) => <GrilleBaremes {...p} />,
      colonnes: [
        { cle: 'zone', libelle: 'Zone', rendu: (b) => b.zone?.libelle || '—' },
        { cle: 'categorie', libelle: 'Catégorie', rendu: (b) => b.categorie?.code || '—' },
        { cle: 'tauxJournalier', libelle: 'Taux journalier', className: 'text-right whitespace-nowrap', rendu: (b) => mad(b.tauxJournalier) },
        { cle: 'tauxRepas', libelle: 'Repas', className: 'text-right whitespace-nowrap', rendu: (b) => mad(b.tauxRepas) },
        { cle: 'plafondNuitee', libelle: 'Plafond nuitée', className: 'text-right whitespace-nowrap', rendu: (b) => mad(b.plafondNuitee) },
        { cle: 'tauxKilometrique', libelle: 'Taux km', className: 'text-right whitespace-nowrap', rendu: (b) => `${nombre(b.tauxKilometrique, 2)} MAD` },
        {
          cle: 'validite',
          libelle: 'Validité',
          className: 'whitespace-nowrap',
          rendu: (b) => {
            const jour = new Date().toISOString().slice(0, 10);
            const actif = isoJour(b.dateDebut) <= jour && (!b.dateFin || isoJour(b.dateFin) >= jour);
            return (
              <span className="flex items-center gap-2">
                {dateJour(b.dateDebut)} → {b.dateFin ? dateJour(b.dateFin) : '…'}
                {actif ? <Badge ton="vert">En vigueur</Badge> : isoJour(b.dateDebut) > jour ? <Badge ton="bleu">À venir</Badge> : <Badge>Échu</Badge>}
              </span>
            );
          },
        },
      ],
      champs: [
        { cle: 'zoneId', libelle: 'Zone', type: 'select', numerique: true, requis: true, options: optZones },
        { cle: 'categorieId', libelle: 'Catégorie d’agents', type: 'select', numerique: true, requis: true, options: optCategories },
        { cle: 'tauxJournalier', libelle: 'Taux journalier (MAD)', type: 'montant', requis: true },
        { cle: 'tauxRepas', libelle: 'Taux repas (MAD)', type: 'montant', defaut: 0 },
        { cle: 'plafondNuitee', libelle: 'Plafond nuitée (MAD)', type: 'montant', defaut: 0 },
        { cle: 'tauxKilometrique', libelle: 'Taux kilométrique (MAD/km)', type: 'montant', defaut: 0 },
        { cle: 'dateDebut', libelle: 'Date de début', type: 'date', requis: true, defaut: new Date().toISOString().slice(0, 10) },
        { cle: 'dateFin', libelle: 'Date de fin', type: 'date', nullable: true, aide: 'Vide = toujours en vigueur.' },
      ],
    },
    plafonds: {
      titre: 'Plafonds de frais',
      nommer: (p) => LIBELLES.categorieFrais[p.categorieFrais],
      colonnes: [
        { cle: 'categorieFrais', libelle: 'Catégorie de frais', rendu: (p) => <span className="font-medium text-stone-800">{LIBELLES.categorieFrais[p.categorieFrais]}</span> },
        { cle: 'categorieAgent', libelle: 'Catégorie d’agents', rendu: (p) => p.categorieAgent?.libelle || <span className="text-stone-500">Toutes</span> },
        { cle: 'montant', libelle: 'Montant', className: 'text-right whitespace-nowrap', rendu: (p) => mad(p.montant) },
        { cle: 'unite', libelle: 'Unité', rendu: (p) => LIBELLES.unitePlafond[p.unite] },
        { cle: 'justificatifObligatoire', libelle: 'Justificatif', rendu: (p) => (p.justificatifObligatoire ? <Badge ton="orange">Obligatoire</Badge> : <span className="text-stone-400">Facultatif</span>) },
      ],
      champs: [
        { cle: 'categorieFrais', libelle: 'Catégorie de frais', type: 'select', requis: true, options: options(LIBELLES.categorieFrais) },
        {
          cle: 'categorieAgentId',
          libelle: 'Catégorie d’agents',
          type: 'select',
          numerique: true,
          nullable: true,
          vide: 'Toutes les catégories',
          options: optCategories,
          aide: 'Un plafond propre à une catégorie prime sur le plafond « toutes ».',
        },
        { cle: 'montant', libelle: 'Montant plafond (MAD)', type: 'montant', requis: true },
        { cle: 'unite', libelle: 'Unité', type: 'select', requis: true, defaut: 'PAR_DEPENSE', options: options(LIBELLES.unitePlafond) },
        { cle: 'justificatifObligatoire', libelle: 'Justificatif obligatoire', type: 'case', defaut: true, pleineLargeur: true },
      ],
    },
    projets: {
      titre: 'Projets',
      nommer: (p) => p.libelle,
      colonnes: [
        { cle: 'code', libelle: 'Code', rendu: (p) => <span className="font-mono text-xs">{p.code}</span> },
        { cle: 'libelle', libelle: 'Libellé', rendu: (p) => <span className="font-medium text-stone-800">{p.libelle}</span> },
        { cle: 'actif', libelle: 'État', rendu: actifBadge },
      ],
      champs: [
        { cle: 'code', libelle: 'Code', type: 'texte', requis: true },
        { cle: 'libelle', libelle: 'Libellé', type: 'texte', requis: true },
        { ...champActif, pleineLargeur: true },
      ],
    },
  };
}

const ONGLETS = [
  { id: 'services', label: 'Services' },
  { id: 'categories-agents', label: 'Catégories d’agents' },
  { id: 'fonctions', label: 'Fonctions' },
  { id: 'zones', label: 'Zones' },
  { id: 'destinations', label: 'Destinations' },
  { id: 'baremes', label: 'Barèmes' },
  { id: 'plafonds', label: 'Plafonds de frais' },
  { id: 'projets', label: 'Projets' },
];

export default function Referentiels() {
  const [onglet, setOnglet] = useState('services');
  // Listes servant aux menus déroulants des différents référentiels.
  const { donnees: ctx, recharger } = useDonnees(async () => {
    const [categories, zones, services, annuaire] = await Promise.all([
      lire('/referentiels/categories-agents'),
      lire('/referentiels/zones'),
      lire('/referentiels/services'),
      lire('/utilisateurs/annuaire'),
    ]);
    return { categories, zones, services, annuaire };
  }, []);
  const config = useMemo(() => configurations(), []);
  const c = config[onglet];

  return (
    <div>
      <EnTete titre="Référentiels et barèmes" sousTitre="Données de base utilisées pour les missions, les indemnités et les notes de frais." />
      <Onglets onglets={ONGLETS} actif={onglet} onChange={setOnglet} />
      <CrudGenerique key={onglet} ressource={onglet} {...c} ctx={ctx || {}} onModifie={recharger} />
    </div>
  );
}
