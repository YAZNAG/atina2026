import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronRight, GitBranch, Info as InfoIcone, Pencil, Plus, Trash2, UserCheck, Users, Building2 } from 'lucide-react';
import api, { lire } from '../../api/client';
import { action, useDonnees } from '../../hooks/useDonnees';
import { useAuth } from '../../context/AuthContext';
import { Badge, Carte, Champ, Chargement, Confirmation, EnTete, Erreur, Modale, Select, Spinner, Vide } from '../../components/ui';
import { LIBELLES, mad, nomComplet, options } from '../../lib/format';

const TYPES = { MISSION: 'Ordres de mission', NOTE_FRAIS: 'Notes de frais' };
const ICONE_ETAPE = { RESPONSABLE_SERVICE: Building2, UTILISATEUR: UserCheck, ROLE: Users };

const etapeVide = () => ({ cle: Math.random().toString(36).slice(2), libelle: '', typeEtape: 'RESPONSABLE_SERVICE', role: '', utilisateurId: '', seuilMontant: '' });

/** Qui valide cette étape, en clair. */
function validateurEtape(e) {
  if (e.typeEtape === 'RESPONSABLE_SERVICE') return 'Responsable du service du demandeur';
  if (e.typeEtape === 'UTILISATEUR') return e.utilisateur ? nomComplet(e.utilisateur) : 'Utilisateur désigné';
  return `Rôle : ${LIBELLES.role[e.role] || e.role}`;
}

/** Frise des étapes d'un circuit (verticale sur mobile, horizontale ensuite). */
function Frise({ etapes }) {
  if (!etapes?.length) return <p className="text-sm text-stone-500">Aucune étape.</p>;
  return (
    <ol className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch">
      {etapes.map((e, i) => {
        const Icone = ICONE_ETAPE[e.typeEtape] || UserCheck;
        return (
          <li key={e.id ?? i} className="flex items-center gap-2 sm:items-stretch">
            <div className="flex min-w-0 flex-1 items-start gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 sm:w-56 sm:flex-none">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-700 text-xs font-semibold text-white">{i + 1}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-stone-900" title={e.libelle}>
                  {e.libelle}
                </p>
                <p className="flex items-center gap-1 text-xs text-stone-600">
                  <Icone className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{validateurEtape(e)}</span>
                </p>
                {e.seuilMontant != null && <p className="mt-0.5 text-[11px] font-medium text-amber-700">Au-delà de {mad(e.seuilMontant)}</p>}
              </div>
            </div>
            {i < etapes.length - 1 && <ChevronRight className="hidden h-4 w-4 shrink-0 self-center text-stone-400 sm:block" />}
          </li>
        );
      })}
      <li className="flex items-center">
        <Badge ton="vert">Approuvé</Badge>
      </li>
    </ol>
  );
}

function Regles() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-zellige-100 bg-zellige-50 p-4 text-sm text-zellige-900">
      <InfoIcone className="mt-0.5 h-5 w-5 shrink-0 text-zellige-700" />
      <div className="space-y-1.5">
        <p className="font-semibold">Règles d’application des circuits</p>
        <ul className="list-disc space-y-1 pl-4">
          <li>
            Le circuit retenu est le circuit actif du <strong>service du demandeur</strong> (ou, à défaut, d’un service parent), sinon le circuit{' '}
            <strong>par défaut</strong> du même type. Un seul circuit actif est autorisé par type et par service.
          </li>
          <li>
            <strong>Pas d’auto-validation</strong> : le demandeur n’est jamais validateur de sa propre demande, même s’il est désigné ou détient le rôle.
          </li>
          <li>
            Une étape <strong>sans validateur éligible</strong> (personne d’actif, ou seul le demandeur est concerné) est automatiquement{' '}
            <strong>sautée</strong> et tracée comme « Étape passée ».
          </li>
          <li>
            « Responsable du service » <strong>remonte la hiérarchie</strong> des services (service parent…) jusqu’au premier responsable qui n’est pas le
            demandeur ; à défaut, un validateur à périmètre global (directeur) statue.
          </li>
          <li>Une étape avec seuil ne s’applique que si le montant estimé de la mission ou de la note atteint ce seuil.</li>
          <li>Modifier un circuit remplace ses étapes ; les demandes déjà en cours conservent leur numéro d’étape.</li>
        </ul>
      </div>
    </div>
  );
}

function FormulaireCircuit({ edition, services, annuaire, onFermer, onEnregistre }) {
  const c = edition?.circuit;
  const [form, setForm] = useState(() => ({
    nom: c?.nom || '',
    type: c?.type || edition?.type || 'MISSION',
    serviceId: c?.serviceId ? String(c.serviceId) : '',
    actif: c ? c.actif : true,
    etapes: c?.etapes?.length
      ? c.etapes.map((e) => ({
          cle: String(e.id),
          libelle: e.libelle,
          typeEtape: e.typeEtape,
          role: e.role || '',
          utilisateurId: e.utilisateurId ? String(e.utilisateurId) : '',
          seuilMontant: e.seuilMontant != null ? String(e.seuilMontant) : '',
        }))
      : [etapeVide()],
  }));
  const [envoi, setEnvoi] = useState(false);

  const maj = (cle, v) => setForm((f) => ({ ...f, [cle]: v }));
  const majEtape = (i, cle, v) => setForm((f) => ({ ...f, etapes: f.etapes.map((e, j) => (j === i ? { ...e, [cle]: v } : e)) }));
  const deplacer = (i, d) =>
    setForm((f) => {
      const etapes = [...f.etapes];
      [etapes[i], etapes[i + d]] = [etapes[i + d], etapes[i]];
      return { ...f, etapes };
    });
  const retirer = (i) => setForm((f) => ({ ...f, etapes: f.etapes.filter((_, j) => j !== i) }));
  const ajouter = () => setForm((f) => ({ ...f, etapes: [...f.etapes, etapeVide()] }));

  const enregistrer = async (e) => {
    e.preventDefault();
    const corps = {
      nom: form.nom.trim(),
      type: form.type,
      serviceId: form.serviceId ? Number(form.serviceId) : null,
      actif: form.actif,
      etapes: form.etapes.map((x) => ({
        libelle: x.libelle.trim(),
        typeEtape: x.typeEtape,
        role: x.typeEtape === 'ROLE' ? x.role || null : null,
        utilisateurId: x.typeEtape === 'UTILISATEUR' && x.utilisateurId ? Number(x.utilisateurId) : null,
        seuilMontant: x.seuilMontant !== '' ? Number(x.seuilMontant) : null,
      })),
    };
    setEnvoi(true);
    const r = await action(() => (c ? api.put(`/circuits/${c.id}`, corps) : api.post('/circuits', corps)), c ? 'Circuit modifié' : 'Circuit créé');
    setEnvoi(false);
    if (r) onEnregistre();
  };

  return (
    <Modale
      ouverte
      onFermer={() => !envoi && onFermer()}
      titre={c ? 'Modifier le circuit' : 'Nouveau circuit de validation'}
      large
      pied={
        <>
          <button className="btn-secondary" onClick={onFermer} disabled={envoi}>
            Annuler
          </button>
          <button className="btn-primary" type="submit" form="form-circuit" disabled={envoi || !form.etapes.length}>
            {envoi && <Spinner className="h-4 w-4 text-white" />} Enregistrer
          </button>
        </>
      }
    >
      <form id="form-circuit" onSubmit={enregistrer} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Champ label="Nom du circuit" requis className="sm:col-span-2">
            <input className="input" value={form.nom} onChange={(e) => maj('nom', e.target.value)} required />
          </Champ>
          <Champ label="Objet validé" requis>
            <Select options={options(TYPES)} value={form.type} onChange={(e) => maj('type', e.target.value)} />
          </Champ>
          <Champ label="Service" aide="Vide : circuit par défaut, appliqué aux services sans circuit propre.">
            <Select options={services.map((s) => ({ value: s.id, label: s.nom }))} vide="Par défaut (tous les services)" value={form.serviceId} onChange={(e) => maj('serviceId', e.target.value)} />
          </Champ>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="h-4 w-4 rounded border-stone-300 text-brand-600" checked={form.actif} onChange={(e) => maj('actif', e.target.checked)} />
            <span className="font-medium text-stone-700">Circuit actif</span>
          </label>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-stone-800">Étapes ({form.etapes.length})</h4>
            <button type="button" className="btn-secondary btn-sm" onClick={ajouter}>
              <Plus className="h-4 w-4" /> Ajouter une étape
            </button>
          </div>
          {!form.etapes.length && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Au moins une étape est requise.</p>}
          <ol className="space-y-3">
            {form.etapes.map((x, i) => (
              <li key={x.cle} className="rounded-xl border border-stone-200 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold text-stone-700">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-700 text-xs text-white">{i + 1}</span>
                    Étape {i + 1}
                  </span>
                  <div className="flex gap-1">
                    <button type="button" className="btn-ghost btn-sm" disabled={i === 0} onClick={() => deplacer(i, -1)} aria-label="Monter" title="Monter">
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button type="button" className="btn-ghost btn-sm" disabled={i === form.etapes.length - 1} onClick={() => deplacer(i, 1)} aria-label="Descendre" title="Descendre">
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button type="button" className="btn-ghost btn-sm text-red-600 hover:bg-red-50" onClick={() => retirer(i)} aria-label="Supprimer l’étape" title="Supprimer l’étape">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Champ label="Libellé" requis className="sm:col-span-2">
                    <input className="input" value={x.libelle} onChange={(e) => majEtape(i, 'libelle', e.target.value)} required placeholder="ex. Visa du chef de service" />
                  </Champ>
                  <Champ label="Validateur" requis>
                    <Select options={options(LIBELLES.typeEtape)} value={x.typeEtape} onChange={(e) => majEtape(i, 'typeEtape', e.target.value)} />
                  </Champ>
                  {x.typeEtape === 'UTILISATEUR' && (
                    <Champ label="Utilisateur" requis>
                      <Select
                        options={annuaire.map((u) => ({ value: u.id, label: `${nomComplet(u)}${u.fonction ? ` — ${u.fonction.libelle}` : ''}` }))}
                        vide="Choisir…"
                        value={x.utilisateurId}
                        onChange={(e) => majEtape(i, 'utilisateurId', e.target.value)}
                        required
                      />
                    </Champ>
                  )}
                  {x.typeEtape === 'ROLE' && (
                    <Champ label="Rôle" requis aide="Tout utilisateur actif ayant ce rôle peut statuer.">
                      <Select options={options(LIBELLES.role)} vide="Choisir…" value={x.role} onChange={(e) => majEtape(i, 'role', e.target.value)} required />
                    </Champ>
                  )}
                  {x.typeEtape === 'RESPONSABLE_SERVICE' && (
                    <p className="self-end pb-2 text-xs text-stone-500">Responsable du service du demandeur, avec remontée hiérarchique.</p>
                  )}
                  <Champ label="Seuil de montant (MAD)" aide="Facultatif : l’étape ne s’applique qu’au-delà de ce montant." className="sm:col-span-2">
                    <input
                      className="input sm:max-w-xs"
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={x.seuilMontant}
                      onChange={(e) => majEtape(i, 'seuilMontant', e.target.value)}
                      placeholder="Toujours appliquée"
                    />
                  </Champ>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </form>
    </Modale>
  );
}

export default function Circuits() {
  const { peut } = useAuth();
  const ecriture = peut('admin:referentiels');
  const { donnees: circuits, chargement, erreur, recharger } = useDonnees(() => lire('/circuits'), []);
  const { donnees: listes } = useDonnees(async () => {
    const [services, annuaire] = await Promise.all([lire('/referentiels/services'), lire('/utilisateurs/annuaire')]);
    return { services, annuaire };
  }, []);
  const [edition, setEdition] = useState(null);
  const [aSupprimer, setASupprimer] = useState(null);

  const supprimer = async () => {
    const r = await action(() => api.delete(`/circuits/${aSupprimer.id}`));
    setASupprimer(null);
    if (r) recharger();
  };

  let contenu;
  if (chargement && !circuits) contenu = <Chargement />;
  else if (erreur) contenu = <Erreur message={erreur} onRetry={recharger} />;
  else if (!circuits.length)
    contenu = (
      <Carte>
        <Vide
          titre="Aucun circuit de validation"
          texte="Sans circuit actif, les missions et notes de frais ne peuvent pas être soumises."
          action={
            ecriture && (
              <button className="btn-primary btn-sm" onClick={() => setEdition({})}>
                <Plus className="h-4 w-4" /> Créer un circuit
              </button>
            )
          }
        />
      </Carte>
    );
  else
    contenu = Object.entries(TYPES).map(([type, libelle]) => {
      const liste = circuits.filter((c) => c.type === type);
      return (
        <section key={type} className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-stone-500">
              <GitBranch className="h-4 w-4" /> {libelle}
            </h2>
            {ecriture && (
              <button className="btn-ghost btn-sm" onClick={() => setEdition({ type })}>
                <Plus className="h-4 w-4" /> Ajouter
              </button>
            )}
          </div>
          {!liste.length && (
            <p className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
              Aucun circuit pour ce type : les demandes ne pourront pas être soumises.
            </p>
          )}
          {liste.map((c) => (
            <Carte
              key={c.id}
              className={c.actif ? '' : 'opacity-70'}
              titre={
                <span className="flex flex-wrap items-center gap-2">
                  {c.nom}
                  {c.service ? <Badge ton="bleu">{c.service.nom}</Badge> : <Badge ton="brique">Par défaut</Badge>}
                  {c.actif ? <Badge ton="vert">Actif</Badge> : <Badge>Inactif</Badge>}
                </span>
              }
              actions={
                ecriture && (
                  <>
                    <button className="btn-ghost btn-sm" onClick={() => setEdition({ circuit: c })} aria-label="Modifier" title="Modifier">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button className="btn-ghost btn-sm text-red-600 hover:bg-red-50" onClick={() => setASupprimer(c)} aria-label="Supprimer" title="Supprimer">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )
              }
            >
              <Frise etapes={c.etapes} />
            </Carte>
          ))}
        </section>
      );
    });

  return (
    <div className="space-y-6">
      <EnTete
        titre="Circuits de validation"
        sousTitre="Étapes de validation des ordres de mission et des notes de frais."
        actions={
          ecriture && (
            <button className="btn-primary" onClick={() => setEdition({})}>
              <Plus className="h-4 w-4" /> Nouveau circuit
            </button>
          )
        }
      />
      <Regles />
      {contenu}

      {edition && (
        <FormulaireCircuit
          edition={edition}
          services={listes?.services || []}
          annuaire={listes?.annuaire || []}
          onFermer={() => setEdition(null)}
          onEnregistre={() => {
            setEdition(null);
            recharger();
          }}
        />
      )}

      <Confirmation
        ouverte={Boolean(aSupprimer)}
        titre="Supprimer le circuit"
        message={
          aSupprimer &&
          `Supprimer « ${aSupprimer.nom} » ? S’il a déjà servi à des missions ou notes de frais, il sera seulement désactivé afin de conserver l’historique.`
        }
        libelleOk="Supprimer"
        ton="danger"
        onAnnuler={() => setASupprimer(null)}
        onConfirmer={supprimer}
      />
    </div>
  );
}
