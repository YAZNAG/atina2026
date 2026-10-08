import { useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2, AlertTriangle } from 'lucide-react';
import api, { lire, messageErreur } from '../../api/client';
import { action, useDonnees } from '../../hooks/useDonnees';
import { Carte, Champ, Chargement, Erreur, Modale, Select, Spinner, Tableau, Vide } from '../../components/ui';

/**
 * Écran CRUD générique pour un référentiel de l'API (`/referentiels/<ressource>`).
 *
 * Configuration :
 * - colonnes : [{ cle, libelle, rendu?(item, ctx), className? }]
 * - champs : [{ cle, libelle, type: 'texte'|'nombre'|'montant'|'date'|'case'|'select',
 *              requis?, nullable?, numerique? (select d'identifiants), options?(ctx, form, item) | options: [],
 *              vide? (libellé de l'option vide), aide?, defaut?, pleineLargeur?, min?, step? }]
 * - vue?({ items, modifier, ajouter, supprimer, ctx }) : vue alternative (ex. grille des barèmes)
 * - avantPropos? : texte ou nœud affiché en tête
 * - nommer?(item) : libellé de l'élément dans la confirmation de suppression
 * - onModifie?() : appelé après toute écriture (pour recharger les listes dépendantes)
 */

/** Valeur ISO → 'AAAA-MM-JJ' sans décalage de fuseau (champs @db.Date). */
export const isoJour = (d) => (d ? String(d).slice(0, 10) : '');
/** Date seule (champ @db.Date) au format JJ/MM/AAAA, sans décalage de fuseau. */
export const dateJour = (d) => {
  if (!d) return '—';
  const [a, m, j] = isoJour(d).split('-');
  return `${j}/${m}/${a}`;
};

function valeurInitiale(champ, item) {
  const v = item ? item[champ.cle] : undefined;
  const nouveau = !item?.id;
  if (champ.type === 'case') return v === undefined || v === null ? (nouveau ? champ.defaut ?? false : false) : Boolean(v);
  if (champ.type === 'date') return isoJour(v ?? (nouveau ? champ.defaut : null));
  if (v === undefined || v === null) return champ.defaut !== undefined && nouveau ? String(champ.defaut) : '';
  return String(v);
}

/** Convertit l'état du formulaire en corps de requête conforme aux schémas zod de l'API. */
function versApi(champs, form) {
  const corps = {};
  for (const c of champs) {
    if (c.lectureSeule) continue;
    const brut = form[c.cle];
    if (c.type === 'case') {
      corps[c.cle] = Boolean(brut);
      continue;
    }
    const texte = typeof brut === 'string' ? brut.trim() : brut;
    const videV = texte === '' || texte === undefined || texte === null;
    if (videV) {
      // Champ facultatif vidé : null si l'API l'accepte, sinon omis (valeur par défaut à la création).
      if (c.nullable) corps[c.cle] = null;
      continue;
    }
    if (c.type === 'nombre' || c.type === 'montant' || (c.type === 'select' && c.numerique)) corps[c.cle] = Number(texte);
    else corps[c.cle] = texte;
  }
  return corps;
}

function ChampFormulaire({ champ, valeur, onChange, ctx, form, item }) {
  const commun = { id: `champ-${champ.cle}`, disabled: champ.lectureSeule };
  if (champ.type === 'case') {
    return (
      <label className={`flex items-start gap-2 rounded-lg border border-stone-200 px-3 py-2.5 text-sm ${champ.pleineLargeur ? 'sm:col-span-2' : ''}`}>
        <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-stone-300 text-brand-600" checked={Boolean(valeur)} onChange={(e) => onChange(e.target.checked)} {...commun} />
        <span>
          <span className="font-medium text-stone-700">{champ.libelle}</span>
          {champ.aide && <span className="block text-xs text-stone-500">{champ.aide}</span>}
        </span>
      </label>
    );
  }
  let saisie;
  if (champ.type === 'select') {
    const opts = typeof champ.options === 'function' ? champ.options(ctx, form, item) : champ.options || [];
    saisie = <Select options={opts} vide={champ.vide ?? (champ.requis ? 'Choisir…' : '—')} value={valeur} onChange={(e) => onChange(e.target.value)} required={champ.requis} {...commun} />;
  } else {
    const type = champ.type === 'date' ? 'date' : champ.type === 'nombre' || champ.type === 'montant' ? 'number' : 'text';
    saisie = (
      <input
        className="input"
        type={type}
        inputMode={champ.type === 'montant' ? 'decimal' : undefined}
        step={champ.step ?? (champ.type === 'montant' ? '0.01' : champ.type === 'nombre' ? '1' : undefined)}
        min={champ.min ?? (type === 'number' ? 0 : undefined)}
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
        required={champ.requis}
        placeholder={champ.placeholder}
        {...commun}
      />
    );
  }
  return (
    <Champ label={champ.libelle} requis={champ.requis} aide={champ.aide} className={champ.pleineLargeur ? 'sm:col-span-2' : ''}>
      {saisie}
    </Champ>
  );
}

export default function CrudGenerique({ ressource, titre, nommer, colonnes, champs, ctx = {}, vue, avantPropos, onModifie }) {
  const aActif = champs.some((c) => c.cle === 'actif');
  const { donnees, chargement, erreur, recharger } = useDonnees(() => lire(`/referentiels/${ressource}`), [ressource]);
  const [recherche, setRecherche] = useState('');
  const [edition, setEdition] = useState(null); // { item|null }
  const [form, setForm] = useState({});
  const [envoi, setEnvoi] = useState(false);
  const [aSupprimer, setASupprimer] = useState(null);
  const [erreurSuppression, setErreurSuppression] = useState('');
  const [suppression, setSuppression] = useState(false);
  const [modeVue, setModeVue] = useState(vue ? 'vue' : 'liste');

  const items = useMemo(() => {
    const liste = donnees || [];
    const q = recherche.trim().toLowerCase();
    if (!q) return liste;
    return liste.filter((it) => JSON.stringify(it).toLowerCase().includes(q));
  }, [donnees, recherche]);

  /** Ouvre le formulaire : modification de `item`, ou création (éventuellement pré-remplie). */
  const ouvrir = (item = null, preRempli = null) => {
    setForm(Object.fromEntries(champs.map((c) => [c.cle, valeurInitiale(c, item || preRempli)])));
    setEdition({ item });
  };
  const fermer = () => !envoi && setEdition(null);

  const enregistrer = async (e) => {
    e.preventDefault();
    const creation = !edition.item;
    const corps = versApi(champs, form);
    setEnvoi(true);
    const r = await action(
      () => (creation ? api.post(`/referentiels/${ressource}`, corps) : api.put(`/referentiels/${ressource}/${edition.item.id}`, corps)),
      creation ? 'Élément ajouté' : 'Modifications enregistrées'
    );
    setEnvoi(false);
    if (r) {
      setEdition(null);
      recharger();
      onModifie?.();
    }
  };

  const demanderSuppression = (item) => {
    setErreurSuppression('');
    setASupprimer(item);
  };
  const supprimer = async () => {
    setSuppression(true);
    try {
      await api.delete(`/referentiels/${ressource}/${aSupprimer.id}`);
      setASupprimer(null);
      recharger();
      onModifie?.();
    } catch (e) {
      // 409 : élément référencé ailleurs (missions, utilisateurs…) — on l'affiche dans la fenêtre.
      setErreurSuppression(messageErreur(e));
    } finally {
      setSuppression(false);
    }
  };

  const tableau = (
    <Tableau>
      <thead>
        <tr>
          {colonnes.map((c) => (
            <th key={c.cle} className={c.className}>
              {c.libelle}
            </th>
          ))}
          <th className="text-right">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-stone-100">
        {items.map((it) => (
          <tr key={it.id}>
            {colonnes.map((c) => (
              <td key={c.cle} className={c.className}>
                {c.rendu ? c.rendu(it, ctx) : it[c.cle] ?? '—'}
              </td>
            ))}
            <td className="whitespace-nowrap text-right">
              <button className="btn-ghost btn-sm" onClick={() => ouvrir(it)} aria-label="Modifier" title="Modifier">
                <Pencil className="h-4 w-4" />
              </button>
              <button className="btn-ghost btn-sm text-red-600 hover:bg-red-50" onClick={() => demanderSuppression(it)} aria-label="Supprimer" title="Supprimer">
                <Trash2 className="h-4 w-4" />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </Tableau>
  );

  let contenu;
  if (chargement && !donnees) contenu = <Chargement />;
  else if (erreur) contenu = <div className="p-4"><Erreur message={erreur} onRetry={recharger} /></div>;
  else if (!donnees.length)
    contenu = (
      <Vide
        titre={`${titre} : aucun élément`}
        texte="Ce référentiel est vide."
        action={
          <button className="btn-primary btn-sm" onClick={() => ouvrir()}>
            <Plus className="h-4 w-4" /> Ajouter
          </button>
        }
      />
    );
  else if (!items.length) contenu = <Vide titre="Aucun résultat" texte="Aucun élément ne correspond à la recherche." />;
  else if (vue && modeVue === 'vue') contenu = <div className="p-4">{vue({ items, modifier: ouvrir, ajouter: (pre) => ouvrir(null, pre), supprimer: demanderSuppression, ctx })}</div>;
  else contenu = tableau;

  return (
    <>
      {avantPropos && <div className="mb-4">{avantPropos}</div>}
      <Carte
        titre={
          <span className="flex items-center gap-2">
            {titre}
            {donnees && <span className="rounded-full bg-stone-100 px-2 text-xs font-medium text-stone-600">{donnees.length}</span>}
          </span>
        }
        actions={
          <button className="btn-primary btn-sm" onClick={() => ouvrir()}>
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Ajouter</span>
          </button>
        }
        corps="p-0"
      >
        <div className="flex flex-col gap-2 border-b border-stone-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input className="input pl-9" placeholder="Filtrer…" value={recherche} onChange={(e) => setRecherche(e.target.value)} aria-label="Filtrer" />
          </div>
          {vue && (
            <div className="inline-flex rounded-lg border border-stone-200 p-0.5 text-xs">
              {[
                ['vue', 'Grille'],
                ['liste', 'Liste détaillée'],
              ].map(([id, lib]) => (
                <button
                  key={id}
                  className={`rounded-md px-3 py-1.5 font-medium ${modeVue === id ? 'bg-brand-700 text-white' : 'text-stone-600 hover:bg-stone-100'}`}
                  onClick={() => setModeVue(id)}
                >
                  {lib}
                </button>
              ))}
            </div>
          )}
        </div>
        {contenu}
      </Carte>

      <Modale
        ouverte={Boolean(edition)}
        onFermer={fermer}
        titre={edition?.item ? `Modifier — ${titre}` : `Ajouter — ${titre}`}
        large={champs.length > 6}
        pied={
          <>
            <button className="btn-secondary" onClick={fermer} type="button">
              Annuler
            </button>
            <button className="btn-primary" type="submit" form={`form-${ressource}`} disabled={envoi}>
              {envoi && <Spinner className="h-4 w-4 text-white" />} Enregistrer
            </button>
          </>
        }
      >
        {edition && (
          <form id={`form-${ressource}`} onSubmit={enregistrer} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {champs.map((c) => (
              <ChampFormulaire
                key={c.cle}
                champ={c}
                valeur={form[c.cle]}
                onChange={(v) => setForm((f) => ({ ...f, [c.cle]: v }))}
                ctx={ctx}
                form={form}
                item={edition.item}
              />
            ))}
          </form>
        )}
      </Modale>

      <Modale
        ouverte={Boolean(aSupprimer)}
        onFermer={() => !suppression && setASupprimer(null)}
        titre="Confirmer la suppression"
        pied={
          <>
            <button className="btn-secondary" onClick={() => setASupprimer(null)} disabled={suppression}>
              {erreurSuppression ? 'Fermer' : 'Annuler'}
            </button>
            {!erreurSuppression && (
              <button className="btn-danger" onClick={supprimer} disabled={suppression}>
                {suppression && <Spinner className="h-4 w-4 text-white" />} Supprimer
              </button>
            )}
          </>
        }
      >
        <p className="text-sm text-stone-600">
          Supprimer définitivement {aSupprimer && nommer ? <strong>« {nommer(aSupprimer)} »</strong> : 'cet élément'} ? Cette action est tracée dans
          le journal d’audit.
        </p>
        {erreurSuppression && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">{erreurSuppression}</p>
              {aActif && <p className="mt-1 text-xs">Désactivez plutôt l’élément (case « Actif ») s’il ne doit plus être proposé.</p>}
            </div>
          </div>
        )}
      </Modale>
    </>
  );
}
