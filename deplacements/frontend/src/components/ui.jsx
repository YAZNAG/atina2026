import { useEffect, useState } from 'react';
import { Loader2, X, Inbox, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { LIBELLES } from '../lib/format';

export function Spinner({ className = '' }) {
  return <Loader2 className={`h-5 w-5 animate-spin text-brand-600 ${className}`} aria-label="Chargement" />;
}

export function Chargement({ texte = 'Chargement…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-stone-500">
      <Spinner /> {texte}
    </div>
  );
}

export function Erreur({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
      <AlertTriangle className="h-6 w-6" />
      <p>{message}</p>
      {onRetry && (
        <button className="btn-secondary btn-sm" onClick={onRetry}>
          Réessayer
        </button>
      )}
    </div>
  );
}

export function Vide({ titre = 'Aucun élément', texte, action }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <Inbox className="h-10 w-10 text-stone-300" />
      <p className="font-medium text-stone-700">{titre}</p>
      {texte && <p className="max-w-md text-sm text-stone-500">{texte}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function EnTete({ titre, sousTitre, actions, retour }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {retour}
        <h1 className="truncate text-xl font-semibold text-stone-900 sm:text-2xl">{titre}</h1>
        {sousTitre && <p className="mt-0.5 text-sm text-stone-500">{sousTitre}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Carte({ titre, actions, children, className = '', corps = 'p-4 sm:p-5' }) {
  return (
    <section className={`card ${className}`}>
      {(titre || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-stone-100 px-4 py-3 sm:px-5">
          <h2 className="font-semibold text-stone-800">{titre}</h2>
          {actions && <div className="flex gap-2">{actions}</div>}
        </div>
      )}
      <div className={corps}>{children}</div>
    </section>
  );
}

const TONS = {
  gris: 'bg-stone-100 text-stone-700 ring-stone-200',
  bleu: 'bg-zellige-50 text-zellige-700 ring-zellige-100',
  vert: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  orange: 'bg-amber-50 text-amber-800 ring-amber-200',
  rouge: 'bg-red-50 text-red-700 ring-red-200',
  brique: 'bg-brand-50 text-brand-800 ring-brand-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
};

export function Badge({ ton = 'gris', children, className = '' }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONS[ton]} ${className}`}>{children}</span>;
}

const TON_MISSION = { BROUILLON: 'gris', EN_ATTENTE: 'orange', APPROUVE: 'vert', REFUSE: 'rouge', EN_COURS: 'bleu', CLOTURE: 'violet', ANNULE: 'gris' };
const TON_NOTE = { BROUILLON: 'gris', SOUMISE: 'orange', VALIDEE: 'bleu', REJETEE: 'rouge', REMBOURSEE: 'vert' };
const TON_AVANCE = { DEMANDEE: 'orange', VERSEE: 'bleu', REGULARISEE: 'vert', ANNULEE: 'gris' };
const TON_CONTROLE = { EN_ATTENTE: 'orange', CONFORME: 'vert', NON_CONFORME: 'rouge' };
const TON_VEHICULE = { DISPONIBLE: 'vert', EN_MISSION: 'bleu', EN_ENTRETIEN: 'orange', HORS_SERVICE: 'gris' };

export const StatutMission = ({ statut }) => <Badge ton={TON_MISSION[statut]}>{LIBELLES.statutMission[statut]}</Badge>;
export const StatutNote = ({ statut }) => <Badge ton={TON_NOTE[statut]}>{LIBELLES.statutNote[statut]}</Badge>;
export const StatutAvance = ({ statut }) => <Badge ton={TON_AVANCE[statut]}>{LIBELLES.statutAvance[statut]}</Badge>;
export const StatutControle = ({ statut }) => <Badge ton={TON_CONTROLE[statut]}>{LIBELLES.statutControle[statut]}</Badge>;
export const StatutVehicule = ({ statut }) => <Badge ton={TON_VEHICULE[statut]}>{LIBELLES.statutVehicule[statut]}</Badge>;

export function Modale({ ouverte, onFermer, titre, children, pied, large = false }) {
  useEffect(() => {
    if (!ouverte) return undefined;
    const echap = (e) => e.key === 'Escape' && onFermer?.();
    window.addEventListener('keydown', echap);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', echap);
      document.body.style.overflow = '';
    };
  }, [ouverte, onFermer]);
  if (!ouverte) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-0 sm:items-center sm:p-4" onMouseDown={onFermer}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        className={`flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl ${large ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3.5">
          <h3 className="font-semibold text-stone-900">{titre}</h3>
          <button className="btn-ghost btn-sm" onClick={onFermer} aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {pied && <div className="flex flex-wrap justify-end gap-2 border-t border-stone-100 px-5 py-3">{pied}</div>}
      </div>
    </div>
  );
}

/** Champ de formulaire avec libellé, aide et erreur. */
export function Champ({ label, aide, erreur, requis, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      {label && (
        <span className="label">
          {label} {requis && <span className="text-red-600">*</span>}
        </span>
      )}
      {children}
      {aide && !erreur && <span className="mt-1 block text-xs text-stone-500">{aide}</span>}
      {erreur && <span className="mt-1 block text-xs text-red-600">{erreur}</span>}
    </label>
  );
}

export function Select({ options, vide, value, onChange, ...props }) {
  return (
    <select className="input" value={value ?? ''} onChange={onChange} {...props}>
      {vide !== undefined && <option value="">{vide}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Pagination({ meta, onPage }) {
  if (!meta || meta.pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-2 border-t border-stone-100 px-4 py-3 text-sm text-stone-600">
      <span>
        {meta.total} résultat{meta.total > 1 ? 's' : ''} — page {meta.page}/{meta.pages}
      </span>
      <div className="flex gap-1">
        <button className="btn-secondary btn-sm" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)} aria-label="Page précédente">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button className="btn-secondary btn-sm" disabled={meta.page >= meta.pages} onClick={() => onPage(meta.page + 1)} aria-label="Page suivante">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function Onglets({ onglets, actif, onChange }) {
  return (
    <div className="-mx-4 mb-4 overflow-x-auto border-b border-stone-200 px-4 sm:mx-0 sm:px-0">
      <nav className="flex gap-1">
        {onglets.map((o) => (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition ${
              actif === o.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            {o.label}
            {o.compteur > 0 && <span className="ml-1.5 rounded-full bg-stone-100 px-1.5 text-xs text-stone-600">{o.compteur}</span>}
          </button>
        ))}
      </nav>
    </div>
  );
}

/** Indicateur chiffré pour les tableaux de bord. */
export function Indicateur({ libelle, valeur, detail, icone: Icone, ton = 'brique' }) {
  const fonds = { brique: 'bg-brand-50 text-brand-700', bleu: 'bg-zellige-50 text-zellige-700', vert: 'bg-emerald-50 text-emerald-700', orange: 'bg-amber-50 text-amber-700' };
  return (
    <div className="card flex items-start gap-3 p-4">
      {Icone && (
        <div className={`rounded-lg p-2 ${fonds[ton]}`}>
          <Icone className="h-5 w-5" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{libelle}</p>
        <p className="mt-0.5 truncate text-xl font-semibold text-stone-900">{valeur}</p>
        {detail && <p className="text-xs text-stone-500">{detail}</p>}
      </div>
    </div>
  );
}

/** Barre de progression budgétaire. */
export function Jauge({ taux, seuil = 80 }) {
  const t = Math.max(0, Math.min(100, taux));
  const couleur = taux > 100 ? 'bg-red-600' : taux >= seuil ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100" role="progressbar" aria-valuenow={taux} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${couleur}`} style={{ width: `${t}%` }} />
    </div>
  );
}

/** Demande de confirmation, avec saisie de motif optionnelle ou obligatoire. */
export function Confirmation({ ouverte, titre, message, libelleOk = 'Confirmer', ton = 'primary', motif, motifRequis, onAnnuler, onConfirmer }) {
  const [texte, setTexte] = useState('');
  const [envoi, setEnvoi] = useState(false);
  useEffect(() => {
    if (ouverte) setTexte('');
  }, [ouverte]);
  const valider = async () => {
    setEnvoi(true);
    try {
      await onConfirmer(texte.trim());
    } finally {
      setEnvoi(false);
    }
  };
  return (
    <Modale
      ouverte={ouverte}
      onFermer={onAnnuler}
      titre={titre}
      pied={
        <>
          <button className="btn-secondary" onClick={onAnnuler}>
            Annuler
          </button>
          <button className={`btn-${ton}`} disabled={envoi || (motifRequis && texte.trim().length < 3)} onClick={valider}>
            {envoi && <Spinner className="h-4 w-4 text-white" />} {libelleOk}
          </button>
        </>
      }
    >
      {message && <p className="text-sm text-stone-600">{message}</p>}
      {motif && (
        <Champ label={motif} requis={motifRequis} className="mt-3">
          <textarea className="input min-h-[90px]" value={texte} onChange={(e) => setTexte(e.target.value)} autoFocus />
        </Champ>
      )}
    </Modale>
  );
}

/** Paire libellé / valeur pour les fiches. */
export function Info({ libelle, children }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">{libelle}</dt>
      <dd className="mt-0.5 text-sm text-stone-900">{children ?? '—'}</dd>
    </div>
  );
}

/** Tableau responsive (défilement horizontal sur mobile). */
export function Tableau({ children }) {
  return (
    <div className="overflow-x-auto">
      <table className="table-base">{children}</table>
    </div>
  );
}
