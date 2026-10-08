import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Camera, FileUp, Paperclip, X } from 'lucide-react';
import api, { messageErreur, ouvrirFichier } from '../../api/client';
import { Modale, Champ, Select, Spinner } from '../../components/ui';
import { LIBELLES, options } from '../../lib/format';

const TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const TAILLE_MAX = 10 * 1024 * 1024;

/** Vérifie format et taille d'un justificatif ; renvoie un message d'erreur ou null. */
export function verifierFichier(f) {
  if (!f) return null;
  const heic = /\.(heic|heif)$/i.test(f.name);
  if (!TYPES.includes(f.type) && !heic) return 'Format non accepté : PDF, JPEG, PNG, WEBP ou HEIC uniquement';
  if (f.size > TAILLE_MAX) return 'Fichier trop volumineux (10 Mo maximum)';
  return null;
}

/** Téléverse un justificatif rattaché à la note ; renvoie l'identifiant du document. */
export async function televerserJustificatif(fichier, noteId) {
  const fd = new FormData();
  fd.append('fichier', fichier);
  fd.append('noteFraisId', String(noteId));
  fd.append('categorie', 'JUSTIFICATIF');
  const r = await api.post('/documents', fd);
  return r.data.data.id;
}

const supprimerDocument = (id) => api.delete(`/documents/${id}`).catch(() => {});

const taille = (o) => (o < 1024 * 1024 ? `${Math.max(1, Math.round(o / 1024))} Ko` : `${(o / 1024 / 1024).toFixed(1)} Mo`);

/** Ouvre un justificatif déjà enregistré. */
export function LienJustificatif({ document, court = false }) {
  if (!document) return null;
  return (
    <button
      type="button"
      className="inline-flex max-w-[180px] items-center gap-1 text-left text-sm text-zellige-700 hover:underline"
      onClick={() => ouvrirFichier(`/documents/${document.id}`).catch((e) => toast.error(messageErreur(e)))}
      title={document.nomOriginal}
    >
      <Paperclip className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{court ? 'Voir' : document.nomOriginal}</span>
    </button>
  );
}

/** Ajout rapide d'un justificatif à une dépense existante qui n'en a pas. */
export function AjoutJustificatif({ noteId, ligne, onFait }) {
  const [envoi, setEnvoi] = useState(false);
  const ref = useRef(null);

  const choisir = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const err = verifierFichier(f);
    if (err) {
      toast.error(err);
      return;
    }
    setEnvoi(true);
    let docId;
    try {
      docId = await televerserJustificatif(f, noteId);
      await api.put(`/notes-frais/${noteId}/lignes/${ligne.id}`, { documentId: docId });
      toast.success('Justificatif ajouté');
      onFait?.();
    } catch (er) {
      if (docId) supprimerDocument(docId);
      toast.error(messageErreur(er), { duration: 6000 });
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <>
      <input ref={ref} type="file" className="hidden" accept="image/*,application/pdf" onChange={choisir} />
      <button type="button" className="btn-secondary btn-sm" disabled={envoi} onClick={() => ref.current?.click()}>
        {envoi ? <Spinner className="h-3.5 w-3.5" /> : <FileUp className="h-3.5 w-3.5" />} Ajouter
      </button>
    </>
  );
}

const jour = (d) => (d ? String(d).slice(0, 10) : '');

/** Modale d'ajout / de modification d'une dépense, avec téléversement du justificatif. */
export default function LigneForm({ ouverte, onFermer, noteId, ligne, mission, onEnregistre }) {
  const [form, setForm] = useState({});
  const [fichier, setFichier] = useState(null);
  const [erreurs, setErreurs] = useState({});
  const [envoi, setEnvoi] = useState(false);
  const refFichier = useRef(null);
  const refPhoto = useRef(null);

  useEffect(() => {
    if (!ouverte) return;
    setForm({
      date: ligne ? jour(ligne.date) : jour(mission?.dateDepart),
      categorie: ligne?.categorie || '',
      montant: ligne ? String(ligne.montant) : '',
      description: ligne?.description || '',
    });
    setFichier(null);
    setErreurs({});
  }, [ouverte, ligne, mission]);

  const maj = (champ) => (e) => setForm((f) => ({ ...f, [champ]: e.target.value }));

  const choisir = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const err = verifierFichier(f);
    setErreurs((x) => ({ ...x, fichier: err }));
    if (!err) setFichier(f);
  };

  const enregistrer = async (e) => {
    e.preventDefault();
    const err = {};
    if (!form.date) err.date = 'Date requise';
    if (!form.categorie) err.categorie = 'Catégorie requise';
    const montant = Number(String(form.montant).replace(',', '.'));
    if (!(montant > 0)) err.montant = 'Montant positif requis';
    setErreurs(err);
    if (Object.keys(err).length) return;

    setEnvoi(true);
    let docId;
    try {
      if (fichier) docId = await televerserJustificatif(fichier, noteId);
      const corps = {
        date: form.date,
        categorie: form.categorie,
        montant,
        description: form.description.trim() || null,
        ...(docId && { documentId: docId }),
      };
      if (ligne) await api.put(`/notes-frais/${noteId}/lignes/${ligne.id}`, corps);
      else await api.post(`/notes-frais/${noteId}/lignes`, corps);
      toast.success(ligne ? 'Dépense modifiée' : 'Dépense ajoutée');
      onEnregistre?.();
      onFermer();
    } catch (er) {
      if (docId) supprimerDocument(docId);
      toast.error(messageErreur(er), { duration: 6000 });
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Modale
      ouverte={ouverte}
      onFermer={onFermer}
      titre={ligne ? 'Modifier la dépense' : 'Ajouter une dépense'}
      pied={
        <>
          <button type="button" className="btn-secondary" onClick={onFermer}>
            Annuler
          </button>
          <button type="submit" form="form-ligne" className="btn-primary" disabled={envoi}>
            {envoi && <Spinner className="h-4 w-4 text-white" />} Enregistrer
          </button>
        </>
      }
    >
      <form id="form-ligne" onSubmit={enregistrer} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <Champ label="Date" requis erreur={erreurs.date}>
          <input type="date" className="input" value={form.date || ''} onChange={maj('date')} />
        </Champ>
        <Champ label="Catégorie" requis erreur={erreurs.categorie}>
          <Select vide="Choisir…" options={options(LIBELLES.categorieFrais)} value={form.categorie} onChange={maj('categorie')} />
        </Champ>
        <Champ label="Montant (MAD)" requis erreur={erreurs.montant} className="sm:col-span-2">
          <input type="number" inputMode="decimal" min="0" step="0.01" className="input" value={form.montant || ''} onChange={maj('montant')} />
        </Champ>
        <Champ label="Description" className="sm:col-span-2" aide="Ex. : « Train Agadir–Rabat », « Hôtel 2 nuits »…">
          <textarea className="input min-h-[70px]" maxLength={500} value={form.description || ''} onChange={maj('description')} />
        </Champ>

        <div className="sm:col-span-2">
          <span className="label">Justificatif</span>
          {ligne?.document && !fichier && (
            <div className="mb-2 flex items-center gap-2 text-sm text-stone-600">
              Actuel : <LienJustificatif document={ligne.document} />
            </div>
          )}
          {fichier ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2 text-emerald-800">
                <Paperclip className="h-4 w-4 shrink-0" />
                <span className="truncate">{fichier.name}</span>
                <span className="shrink-0 text-xs text-emerald-700">({taille(fichier.size)})</span>
              </span>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setFichier(null)} aria-label="Retirer le fichier">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <input ref={refFichier} type="file" className="hidden" accept="image/*,application/pdf" onChange={choisir} />
              <input ref={refPhoto} type="file" className="hidden" accept="image/*" capture="environment" onChange={choisir} />
              <button type="button" className="btn-secondary btn-sm" onClick={() => refFichier.current?.click()}>
                <FileUp className="h-4 w-4" /> {ligne?.document ? 'Remplacer le fichier' : 'Choisir un fichier'}
              </button>
              <button type="button" className="btn-secondary btn-sm sm:hidden" onClick={() => refPhoto.current?.click()}>
                <Camera className="h-4 w-4" /> Photographier le ticket
              </button>
            </div>
          )}
          {erreurs.fichier ? (
            <p className="mt-1 text-xs text-red-600">{erreurs.fichier}</p>
          ) : (
            <p className="mt-1 text-xs text-stone-500">PDF, JPEG, PNG, WEBP ou HEIC — 10 Mo maximum. Obligatoire pour soumettre la plupart des dépenses.</p>
          )}
        </div>
      </form>
    </Modale>
  );
}
