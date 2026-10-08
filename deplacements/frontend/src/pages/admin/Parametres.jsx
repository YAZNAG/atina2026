import { useEffect, useRef, useState } from 'react';
import { FileText, ImageUp, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import api, { lire } from '../../api/client';
import { action, useDonnees } from '../../hooks/useDonnees';
import { Badge, Carte, Champ, Chargement, Confirmation, EnTete, Erreur, Onglets, Select, Spinner } from '../../components/ui';
import { LIBELLES, dateHeure } from '../../lib/format';

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'].map((m, i) => ({
  value: String(i + 1),
  label: m,
}));

const COMPTES = [...Object.entries(LIBELLES.categorieFrais), ['INDEMNITES', 'Indemnités de déplacement']];

const ONGLETS = [
  { id: 'general', label: 'Général' },
  { id: 'comptabilite', label: 'Comptabilité' },
  { id: 'identite', label: 'Identité visuelle' },
  { id: 'modeles', label: 'Modèles de documents' },
];

const NOMS_MODELES = { ORDRE_MISSION: 'Ordre de mission', NOTE_FRAIS: 'État des frais (note de frais)' };

/** Paramètres de l'API → état du formulaire (tout en chaînes pour les champs numériques). */
function versForm(p) {
  const s = (v) => (v === undefined || v === null ? '' : String(v));
  return {
    organisme: {
      nom: s(p.organisme?.nom),
      adresse: s(p.organisme?.adresse),
      telephone: s(p.organisme?.telephone),
      email: s(p.organisme?.email),
      ville: s(p.organisme?.ville),
    },
    devise: p.devise || 'MAD',
    tauxTVA: s(p.tauxTVA),
    exerciceDebutMois: s(p.exerciceDebutMois || 1),
    anneeFiscale: s(p.anneeFiscale),
    dureeConservationAnnees: s(p.dureeConservationAnnees),
    regles_indemnites: {
      heureLimiteDepart: s(p.regles_indemnites?.heureLimiteDepart),
      heureLimiteRetour: s(p.regles_indemnites?.heureLimiteRetour),
      dureeMinJourneeH: s(p.regles_indemnites?.dureeMinJourneeH),
    },
    rappels: { joursApresRetour: s(p.rappels?.joursApresRetour), joursRelanceValidation: s(p.rappels?.joursRelanceValidation) },
    bloquerDepassementBudget: Boolean(p.bloquerDepassementBudget),
    comptabilite: {
      journal: s(p.comptabilite?.journal),
      compteCredit: s(p.comptabilite?.compteCredit),
      libelleCompteCredit: s(p.comptabilite?.libelleCompteCredit),
      comptes: Object.fromEntries(COMPTES.map(([k]) => [k, s(p.comptabilite?.comptes?.[k])])),
    },
  };
}

function versApi(f) {
  const n = Number;
  return {
    organisme: Object.fromEntries(Object.entries(f.organisme).map(([k, v]) => [k, v.trim()])),
    devise: 'MAD',
    tauxTVA: n(f.tauxTVA),
    exerciceDebutMois: n(f.exerciceDebutMois),
    anneeFiscale: n(f.anneeFiscale),
    dureeConservationAnnees: n(f.dureeConservationAnnees),
    regles_indemnites: {
      heureLimiteDepart: n(f.regles_indemnites.heureLimiteDepart),
      heureLimiteRetour: n(f.regles_indemnites.heureLimiteRetour),
      dureeMinJourneeH: n(f.regles_indemnites.dureeMinJourneeH),
    },
    rappels: { joursApresRetour: n(f.rappels.joursApresRetour), joursRelanceValidation: n(f.rappels.joursRelanceValidation) },
    bloquerDepassementBudget: f.bloquerDepassementBudget,
    comptabilite: {
      journal: f.comptabilite.journal.trim(),
      compteCredit: f.comptabilite.compteCredit.trim(),
      libelleCompteCredit: f.comptabilite.libelleCompteCredit.trim(),
      comptes: Object.fromEntries(Object.entries(f.comptabilite.comptes).map(([k, v]) => [k, v.trim()])),
    },
  };
}

function Nombre({ value, onChange, ...props }) {
  return <input className="input" type="number" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} required {...props} />;
}

function ImageIdentite({ type, titre, description, personnalise, onChange }) {
  const [version, setVersion] = useState(() => Date.now());
  const [envoi, setEnvoi] = useState(false);
  const [confirmer, setConfirmer] = useState(false);
  const input = useRef(null);

  const televerser = async (e) => {
    const fichier = e.target.files?.[0];
    e.target.value = '';
    if (!fichier) return;
    const fd = new FormData();
    fd.append('fichier', fichier);
    setEnvoi(true);
    const r = await action(() => api.post(`/admin/parametres/${type}`, fd), 'Image enregistrée');
    setEnvoi(false);
    if (r) {
      setVersion(Date.now()); // contourne le cache navigateur (max-age=300)
      onChange();
    }
  };

  const retablir = async () => {
    const r = await action(() => api.delete(`/admin/parametres/${type}`), 'Image par défaut rétablie');
    setConfirmer(false);
    if (r) {
      setVersion(Date.now());
      onChange();
    }
  };

  return (
    <Carte titre={titre} actions={personnalise ? <Badge ton="bleu">Personnalisé</Badge> : <Badge>Par défaut</Badge>}>
      <p className="mb-3 text-sm text-stone-500">{description}</p>
      <div className="flex min-h-[8rem] items-center justify-center rounded-lg border border-dashed border-stone-300 bg-[repeating-conic-gradient(#f5f5f4_0_25%,#fff_0_50%)] bg-[length:16px_16px] p-3">
        <img src={`/api/public/${type}?v=${version}`} alt={titre} className={`max-w-full object-contain ${type === 'logo' ? 'max-h-28' : 'max-h-40'}`} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <input ref={input} type="file" accept="image/png,image/jpeg" className="hidden" onChange={televerser} />
        <button className="btn-secondary btn-sm" onClick={() => input.current?.click()} disabled={envoi}>
          {envoi ? <Spinner className="h-4 w-4" /> : <ImageUp className="h-4 w-4" />} Téléverser (PNG/JPEG)
        </button>
        {personnalise && (
          <button className="btn-ghost btn-sm" onClick={() => setConfirmer(true)}>
            <RotateCcw className="h-4 w-4" /> Rétablir l’image par défaut
          </button>
        )}
      </div>
      <Confirmation
        ouverte={confirmer}
        titre="Rétablir l’image par défaut"
        message="L’image personnalisée ne sera plus utilisée dans l’application ni sur les documents PDF."
        libelleOk="Rétablir"
        onAnnuler={() => setConfirmer(false)}
        onConfirmer={retablir}
      />
    </Carte>
  );
}

function Modele({ modele, onEnregistre }) {
  const init = () => ({
    titre: modele.titre || '',
    texteIntro: modele.texteIntro || '',
    textePied: modele.textePied || '',
    signataires: (Array.isArray(modele.signataires) && modele.signataires.length ? modele.signataires : [{ libelle: '' }]).map((s) => s.libelle || ''),
    afficherEntete: modele.afficherEntete !== false,
  });
  const [form, setForm] = useState(init);
  const [envoi, setEnvoi] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setForm(init()), [modele]);

  const maj = (cle, v) => setForm((f) => ({ ...f, [cle]: v }));
  const majSignataire = (i, v) => setForm((f) => ({ ...f, signataires: f.signataires.map((s, j) => (j === i ? v : s)) }));

  const enregistrer = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    const r = await action(
      () =>
        api.put(`/admin/modeles/${modele.code}`, {
          titre: form.titre.trim(),
          texteIntro: form.texteIntro.trim() || null,
          textePied: form.textePied.trim() || null,
          signataires: form.signataires.map((s) => s.trim()).filter(Boolean).map((libelle) => ({ libelle })),
          afficherEntete: form.afficherEntete,
        }),
      'Modèle enregistré'
    );
    setEnvoi(false);
    if (r) onEnregistre();
  };

  const signatairesValides = form.signataires.some((s) => s.trim());

  return (
    <Carte
      titre={
        <span className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-brand-700" /> {NOMS_MODELES[modele.code] || modele.code}
        </span>
      }
    >
      <form onSubmit={enregistrer} className="space-y-4">
        <Champ label="Titre du document" requis>
          <input className="input" value={form.titre} onChange={(e) => maj('titre', e.target.value)} required maxLength={200} />
        </Champ>
        <Champ label="Texte d’introduction" aide={`${form.texteIntro.length}/3000 caractères`}>
          <textarea className="input min-h-[90px]" value={form.texteIntro} onChange={(e) => maj('texteIntro', e.target.value)} maxLength={3000} />
        </Champ>
        <Champ label="Texte de pied de page" aide={`${form.textePied.length}/1000 caractères`}>
          <textarea className="input min-h-[60px]" value={form.textePied} onChange={(e) => maj('textePied', e.target.value)} maxLength={1000} />
        </Champ>
        <div>
          <span className="label">
            Signataires <span className="text-red-600">*</span> <span className="font-normal text-stone-500">(1 à 4 cases de signature)</span>
          </span>
          <div className="space-y-2">
            {form.signataires.map((s, i) => (
              <div key={i} className="flex gap-2">
                <span className="flex h-9 w-7 shrink-0 items-center justify-center text-xs font-semibold text-stone-500">{i + 1}.</span>
                <input className="input" value={s} onChange={(e) => majSignataire(i, e.target.value)} placeholder="ex. Le Chef de service" maxLength={100} />
                <button
                  type="button"
                  className="btn-ghost btn-sm text-red-600 hover:bg-red-50"
                  disabled={form.signataires.length <= 1}
                  onClick={() => maj('signataires', form.signataires.filter((_, j) => j !== i))}
                  aria-label="Retirer ce signataire"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          {form.signataires.length < 4 && (
            <button type="button" className="btn-ghost btn-sm mt-2" onClick={() => maj('signataires', [...form.signataires, ''])}>
              <Plus className="h-4 w-4" /> Ajouter un signataire
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 rounded border-stone-300 text-brand-600" checked={form.afficherEntete} onChange={(e) => maj('afficherEntete', e.target.checked)} />
          <span className="font-medium text-stone-700">Afficher l’en-tête (logo et bandeau) sur le document</span>
        </label>
        <div className="flex flex-col-reverse items-start gap-2 border-t border-stone-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-stone-500">Dernière modification : {dateHeure(modele.updatedAt)}</span>
          <button className="btn-primary" type="submit" disabled={envoi || !signatairesValides}>
            {envoi ? <Spinner className="h-4 w-4 text-white" /> : <Save className="h-4 w-4" />} Enregistrer le modèle
          </button>
        </div>
      </form>
    </Carte>
  );
}

export default function Parametres() {
  const [onglet, setOnglet] = useState('general');
  const { donnees: parametres, chargement, erreur, recharger } = useDonnees(() => lire('/admin/parametres'), []);
  const modeles = useDonnees(() => lire('/admin/modeles'), []);
  const [form, setForm] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    if (parametres) setForm(versForm(parametres));
  }, [parametres]);

  const set = (chemin, v) =>
    setForm((f) => {
      const [a, b, c] = chemin.split('.');
      if (c) return { ...f, [a]: { ...f[a], [b]: { ...f[a][b], [c]: v } } };
      if (b) return { ...f, [a]: { ...f[a], [b]: v } };
      return { ...f, [a]: v };
    });
  const lie = (chemin) => {
    const v = chemin.split('.').reduce((o, k) => o?.[k], form);
    return { value: v ?? '', onChange: (x) => set(chemin, x) };
  };
  const lieTexte = (chemin) => {
    const { value, onChange } = lie(chemin);
    return { value, onChange: (e) => onChange(e.target.value) };
  };

  const enregistrer = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    const r = await action(() => api.put('/admin/parametres', versApi(form)), 'Paramètres enregistrés');
    setEnvoi(false);
    if (r) recharger();
  };

  const boutonEnregistrer = (
    <div className="flex justify-end">
      <button className="btn-primary" type="submit" disabled={envoi}>
        {envoi ? <Spinner className="h-4 w-4 text-white" /> : <Save className="h-4 w-4" />} Enregistrer les paramètres
      </button>
    </div>
  );

  let contenu;
  if (chargement && !parametres) contenu = <Chargement />;
  else if (erreur) contenu = <Erreur message={erreur} onRetry={recharger} />;
  else if (!form) contenu = <Chargement />;
  else if (onglet === 'general')
    contenu = (
      <form onSubmit={enregistrer} className="space-y-5">
        <Carte titre="Organisme">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Champ label="Nom de l’organisme" requis className="sm:col-span-2">
              <input className="input" {...lieTexte('organisme.nom')} required />
            </Champ>
            <Champ label="Adresse" className="sm:col-span-2">
              <input className="input" {...lieTexte('organisme.adresse')} />
            </Champ>
            <Champ label="Ville" aide="Utilisée pour « Fait à … » sur les documents.">
              <input className="input" {...lieTexte('organisme.ville')} />
            </Champ>
            <Champ label="Téléphone">
              <input className="input" type="tel" {...lieTexte('organisme.telephone')} />
            </Champ>
            <Champ label="E-mail" className="sm:col-span-2">
              <input className="input" type="email" {...lieTexte('organisme.email')} />
            </Champ>
          </div>
        </Carte>

        <Carte titre="Exercice et fiscalité">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Champ label="Devise" aide="Toutes les opérations sont tenues en dirhams.">
              <input className="input" value="MAD — Dirham marocain" disabled readOnly />
            </Champ>
            <Champ label="Taux de TVA (%)" requis>
              <Nombre {...lie('tauxTVA')} min="0" max="100" step="0.01" />
            </Champ>
            <Champ label="Début de l’exercice" requis>
              <Select options={MOIS} value={form.exerciceDebutMois} onChange={(e) => set('exerciceDebutMois', e.target.value)} />
            </Champ>
            <Champ label="Année fiscale en cours" requis>
              <Nombre {...lie('anneeFiscale')} min="2000" max="2100" step="1" />
            </Champ>
            <Champ label="Conservation des pièces (années)" requis aide="10 ans au titre de l’article 22 du Code de commerce.">
              <Nombre {...lie('dureeConservationAnnees')} min="1" max="50" step="1" />
            </Champ>
          </div>
        </Carte>

        <Carte titre="Règles de calcul des indemnités">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Champ label="Heure limite de départ (h)" requis aide="Départ avant cette heure : journée de départ entière, sinon ½ journée.">
              <Nombre {...lie('regles_indemnites.heureLimiteDepart')} min="0" max="24" step="0.5" />
            </Champ>
            <Champ label="Heure limite de retour (h)" requis aide="Retour à partir de cette heure : journée de retour entière, sinon ½ journée.">
              <Nombre {...lie('regles_indemnites.heureLimiteRetour')} min="0" max="24" step="0.5" />
            </Champ>
            <Champ label="Durée minimale d’une journée (h)" requis aide="Mission sur un seul jour : journée entière à partir de cette durée, sinon ½ journée.">
              <Nombre {...lie('regles_indemnites.dureeMinJourneeH')} min="0" max="24" step="0.5" />
            </Champ>
          </div>
        </Carte>

        <Carte titre="Rappels et contrôle budgétaire">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Champ label="Rappel après le retour (jours)" requis aide="Délai avant rappel de clôture et de dépôt des justificatifs.">
              <Nombre {...lie('rappels.joursApresRetour')} min="0" max="60" step="1" />
            </Champ>
            <Champ label="Relance des validateurs (jours)" requis aide="Délai d’attente avant de relancer un validateur.">
              <Nombre {...lie('rappels.joursRelanceValidation')} min="1" max="30" step="1" />
            </Champ>
            <label className="flex items-start gap-2 rounded-lg border border-stone-200 px-3 py-2.5 text-sm sm:col-span-2">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-stone-300 text-brand-600"
                checked={form.bloquerDepassementBudget}
                onChange={(e) => set('bloquerDepassementBudget', e.target.checked)}
              />
              <span>
                <span className="font-medium text-stone-700">Bloquer les dépassements de budget</span>
                <span className="block text-xs text-stone-500">
                  Si coché, une mission dont le coût estimé dépasse le disponible de son budget ne peut pas recevoir l’approbation finale ; sinon le dépassement est seulement signalé.
                </span>
              </span>
            </label>
          </div>
        </Carte>
        {boutonEnregistrer}
      </form>
    );
  else if (onglet === 'comptabilite')
    contenu = (
      <form onSubmit={enregistrer} className="space-y-5">
        <Carte titre="Export comptable">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Champ label="Code journal" requis>
              <input className="input font-mono" {...lieTexte('comptabilite.journal')} required maxLength={10} />
            </Champ>
            <Champ label="Compte de crédit" requis aide="Compte de tiers crédité (frais à payer).">
              <input className="input font-mono" {...lieTexte('comptabilite.compteCredit')} required maxLength={20} />
            </Champ>
            <Champ label="Libellé du compte de crédit">
              <input className="input" {...lieTexte('comptabilite.libelleCompteCredit')} />
            </Champ>
          </div>
        </Carte>
        <Carte titre="Comptes de charge par catégorie">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {COMPTES.map(([cle, libelle]) => (
              <Champ key={cle} label={libelle}>
                <input className="input font-mono" {...lieTexte(`comptabilite.comptes.${cle}`)} maxLength={20} placeholder="ex. 6143" />
              </Champ>
            ))}
          </div>
          <p className="mt-3 text-xs text-stone-500">Comptes du plan comptable marocain (CGNC) utilisés pour l’imputation des débits dans l’export comptable.</p>
        </Carte>
        {boutonEnregistrer}
      </form>
    );
  else if (onglet === 'identite')
    contenu = (
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ImageIdentite
          type="logo"
          titre="Logo"
          description="Affiché dans le menu de l’application. PNG carré, fond transparent recommandé."
          personnalise={Boolean(parametres.logo)}
          onChange={recharger}
        />
        <ImageIdentite
          type="entete"
          titre="En-tête des documents"
          description="Bandeau imprimé en haut des ordres de mission et états de frais (PDF), également affiché sur l’écran de connexion. Format paysage recommandé."
          personnalise={Boolean(parametres.entete)}
          onChange={recharger}
        />
      </div>
    );
  else if (onglet === 'modeles')
    contenu = modeles.chargement && !modeles.donnees ? (
      <Chargement />
    ) : modeles.erreur ? (
      <Erreur message={modeles.erreur} onRetry={modeles.recharger} />
    ) : (
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {['ORDRE_MISSION', 'NOTE_FRAIS'].map((code) => {
          const m = modeles.donnees.find((x) => x.code === code) || { code, titre: '', signataires: [], afficherEntete: true };
          return <Modele key={code} modele={m} onEnregistre={modeles.recharger} />;
        })}
      </div>
    );

  return (
    <div>
      <EnTete titre="Paramètres" sousTitre="Organisme, règles de calcul, comptabilité, identité visuelle et modèles de documents." />
      <Onglets onglets={ONGLETS} actif={onglet} onChange={setOnglet} />
      {contenu}
    </div>
  );
}
