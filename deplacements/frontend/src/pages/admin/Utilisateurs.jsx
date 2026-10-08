import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Pencil, Plus, Search, ShieldAlert, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { lire, lirePage, messageErreur } from '../../api/client';
import { action, useDonnees } from '../../hooks/useDonnees';
import { useAuth } from '../../context/AuthContext';
import { Badge, Carte, Champ, Chargement, Confirmation, EnTete, Erreur, Modale, Pagination, Select, Spinner, Tableau, Vide } from '../../components/ui';
import { LIBELLES, dateHeure, options } from '../../lib/format';

const TON_ROLE = { AGENT: 'gris', VALIDATEUR: 'bleu', FINANCIER: 'violet', ADMIN: 'brique' };

const FORM_VIDE = {
  matricule: '',
  nom: '',
  prenom: '',
  email: '',
  role: 'AGENT',
  perimetreGlobal: false,
  telephone: '',
  serviceId: '',
  fonctionId: '',
  categorieId: '',
  actif: true,
  cin: '',
  rib: '',
};

const versForm = (u) => ({
  matricule: u.matricule || '',
  nom: u.nom || '',
  prenom: u.prenom || '',
  email: u.email || '',
  role: u.role || 'AGENT',
  perimetreGlobal: Boolean(u.perimetreGlobal),
  telephone: u.telephone || '',
  serviceId: u.serviceId ? String(u.serviceId) : '',
  fonctionId: u.fonctionId ? String(u.fonctionId) : '',
  categorieId: u.categorieId ? String(u.categorieId) : '',
  actif: u.actif !== false,
  cin: u.cin || '',
  rib: u.rib || '',
});

const idOuNull = (v) => (v ? Number(v) : null);
const texteOuNull = (v) => (v && v.trim() ? v.trim() : null);

const versApi = (f) => ({
  matricule: f.matricule.trim(),
  nom: f.nom.trim(),
  prenom: f.prenom.trim(),
  email: f.email.trim(),
  role: f.role,
  perimetreGlobal: f.role === 'VALIDATEUR' ? f.perimetreGlobal : false,
  telephone: texteOuNull(f.telephone),
  serviceId: idOuNull(f.serviceId),
  fonctionId: idOuNull(f.fonctionId),
  categorieId: idOuNull(f.categorieId),
  actif: f.actif,
  cin: texteOuNull(f.cin),
  rib: f.rib ? f.rib.replace(/\s+/g, '') || null : null,
});

/** Affiche une seule fois un mot de passe provisoire, avec bouton copier. */
function ModaleMotDePasse({ info, onFermer }) {
  const [copie, setCopie] = useState(false);
  useEffect(() => setCopie(false), [info]);
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(info.motDePasse);
      setCopie(true);
      toast.success('Mot de passe copié');
    } catch {
      toast.error('Copie impossible : sélectionnez le texte manuellement');
    }
  };
  return (
    <Modale
      ouverte={Boolean(info)}
      onFermer={onFermer}
      titre="Mot de passe provisoire"
      pied={
        <button className="btn-primary" onClick={onFermer}>
          J’ai noté le mot de passe
        </button>
      }
    >
      {info && (
        <div className="space-y-3 text-sm">
          <p className="text-stone-600">
            {info.titre} pour <strong>{info.nom}</strong> ({info.email}). Ce mot de passe ne sera <strong>plus affiché</strong> : communiquez-le
            de façon sécurisée. Il devra être changé à la première connexion.
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-stone-300 bg-stone-50 p-2">
            <code className="flex-1 select-all break-all px-2 font-mono text-base text-stone-900">{info.motDePasse}</code>
            <button className="btn-secondary btn-sm" onClick={copier}>
              {copie ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />} Copier
            </button>
          </div>
          <p className="text-xs text-stone-500">Un e-mail contenant ce mot de passe a également été adressé à l’utilisateur (voir Journaux › E-mails).</p>
        </div>
      )}
    </Modale>
  );
}

function FormulaireUtilisateur({ edition, listes, onFermer, onEnregistre }) {
  const { utilisateur: moi } = useAuth();
  const [form, setForm] = useState(FORM_VIDE);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const id = edition?.id;
  const soiMeme = id && id === moi?.id;

  useEffect(() => {
    if (!edition) return;
    setErreur(null);
    if (!id) {
      setForm(FORM_VIDE);
      return;
    }
    // Fiche complète : CIN et RIB déchiffrés (consultation journalisée par l'API).
    let annule = false;
    setChargement(true);
    lire(`/utilisateurs/${id}`)
      .then((u) => !annule && setForm(versForm(u)))
      .catch((e) => !annule && setErreur(messageErreur(e)))
      .finally(() => !annule && setChargement(false));
    return () => {
      annule = true;
    };
  }, [edition, id]);

  const maj = (cle) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => {
      const n = { ...f, [cle]: v };
      // La fonction choisie propose sa catégorie si aucune n'est encore renseignée.
      if (cle === 'fonctionId' && v && !f.categorieId) {
        const fct = listes.fonctions.find((x) => String(x.id) === v);
        if (fct?.categorieId) n.categorieId = String(fct.categorieId);
      }
      return n;
    });
  };

  const enregistrer = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    const corps = versApi(form);
    const r = await action(() => (id ? api.put(`/utilisateurs/${id}`, corps) : api.post('/utilisateurs', corps)), id ? 'Utilisateur modifié' : 'Utilisateur créé');
    setEnvoi(false);
    if (r) onEnregistre(r.data.data, !id);
  };

  const optServices = listes.services.map((s) => ({ value: s.id, label: s.actif === false ? `${s.nom} (inactif)` : s.nom }));
  const optFonctions = listes.fonctions.map((f) => ({ value: f.id, label: f.libelle }));
  const optCategories = listes.categories.map((c) => ({ value: c.id, label: `${c.code} — ${c.libelle}` }));

  return (
    <Modale
      ouverte={Boolean(edition)}
      onFermer={() => !envoi && onFermer()}
      titre={id ? 'Modifier l’utilisateur' : 'Nouvel utilisateur'}
      large
      pied={
        <>
          <button className="btn-secondary" onClick={onFermer} disabled={envoi}>
            Annuler
          </button>
          <button className="btn-primary" type="submit" form="form-utilisateur" disabled={envoi || chargement || Boolean(erreur)}>
            {envoi && <Spinner className="h-4 w-4 text-white" />} Enregistrer
          </button>
        </>
      }
    >
      {chargement ? (
        <Chargement />
      ) : erreur ? (
        <Erreur message={erreur} />
      ) : (
        <form id="form-utilisateur" onSubmit={enregistrer} className="space-y-5">
          <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Identité</legend>
            <Champ label="Matricule" requis>
              <input className="input" value={form.matricule} onChange={maj('matricule')} required maxLength={30} />
            </Champ>
            <Champ label="Adresse e-mail" requis aide="Sert d’identifiant de connexion.">
              <input className="input" type="email" value={form.email} onChange={maj('email')} required autoComplete="off" />
            </Champ>
            <Champ label="Nom" requis>
              <input className="input" value={form.nom} onChange={maj('nom')} required maxLength={80} />
            </Champ>
            <Champ label="Prénom" requis>
              <input className="input" value={form.prenom} onChange={maj('prenom')} required maxLength={80} />
            </Champ>
            <Champ label="Téléphone">
              <input className="input" type="tel" value={form.telephone} onChange={maj('telephone')} maxLength={30} />
            </Champ>
          </fieldset>

          <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Affectation et droits</legend>
            <Champ label="Rôle" requis aide={soiMeme ? 'Vous ne pouvez pas retirer vos propres droits d’administration.' : undefined}>
              <Select options={options(LIBELLES.role)} value={form.role} onChange={maj('role')} disabled={soiMeme} />
            </Champ>
            <Champ label="Service">
              <Select options={optServices} vide="Aucun service" value={form.serviceId} onChange={maj('serviceId')} />
            </Champ>
            <Champ label="Fonction">
              <Select options={optFonctions} vide="Aucune fonction" value={form.fonctionId} onChange={maj('fonctionId')} />
            </Champ>
            <Champ label="Catégorie d’agents" aide="Détermine les barèmes d’indemnités et les plafonds applicables.">
              <Select options={optCategories} vide="Aucune catégorie" value={form.categorieId} onChange={maj('categorieId')} />
            </Champ>
            {form.role === 'VALIDATEUR' && (
              <label className="flex items-start gap-2 rounded-lg border border-stone-200 px-3 py-2.5 text-sm sm:col-span-2">
                <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-stone-300 text-brand-600" checked={form.perimetreGlobal} onChange={maj('perimetreGlobal')} />
                <span>
                  <span className="font-medium text-stone-700">Périmètre global (directeur)</span>
                  <span className="block text-xs text-stone-500">
                    Voit les missions de tous les services et valide à défaut de responsable de service éligible.
                  </span>
                </span>
              </label>
            )}
            <label className="flex items-start gap-2 rounded-lg border border-stone-200 px-3 py-2.5 text-sm sm:col-span-2">
              <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-stone-300 text-brand-600" checked={form.actif} onChange={maj('actif')} disabled={soiMeme} />
              <span>
                <span className="font-medium text-stone-700">Compte actif</span>
                <span className="block text-xs text-stone-500">Un compte inactif ne peut plus se connecter ni être désigné comme validateur.</span>
              </span>
            </label>
          </fieldset>

          <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Données personnelles (chiffrées)</legend>
            {id && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 sm:col-span-2">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <p>
                  <strong>Données sensibles — consultation tracée.</strong> L’affichage de la CIN et du RIB en clair a été enregistré dans le journal
                  d’audit (loi 09-08).
                </p>
              </div>
            )}
            <Champ label="CIN">
              <input className="input font-mono" value={form.cin} onChange={maj('cin')} maxLength={20} autoComplete="off" />
            </Champ>
            <Champ label="RIB" aide="24 chiffres, pour les virements de remboursement.">
              <input className="input font-mono" value={form.rib} onChange={maj('rib')} maxLength={40} autoComplete="off" inputMode="numeric" />
            </Champ>
          </fieldset>
          {!id && (
            <p className="rounded-lg bg-stone-50 p-3 text-xs text-stone-600">
              Un mot de passe provisoire sera généré et affiché une seule fois après la création ; il est aussi envoyé par e-mail.
            </p>
          )}
        </form>
      )}
    </Modale>
  );
}

export default function Utilisateurs() {
  const [filtres, setFiltres] = useState({ q: '', role: '', serviceId: '' });
  const [saisie, setSaisie] = useState('');
  const [page, setPage] = useState(1);
  const [edition, setEdition] = useState(null);
  const [mdp, setMdp] = useState(null);
  const [aReinitialiser, setAReinitialiser] = useState(null);

  // Recherche différée pour ne pas interroger l'API à chaque frappe.
  useEffect(() => {
    const t = setTimeout(() => {
      setFiltres((f) => (f.q === saisie.trim() ? f : { ...f, q: saisie.trim() }));
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [saisie]);

  const { donnees, chargement, erreur, recharger } = useDonnees(
    () => lirePage('/utilisateurs', { page, limit: 20, q: filtres.q || undefined, role: filtres.role || undefined, serviceId: filtres.serviceId || undefined }),
    [page, filtres.q, filtres.role, filtres.serviceId]
  );
  const { donnees: listes } = useDonnees(async () => {
    const [services, fonctions, categories] = await Promise.all([
      lire('/referentiels/services'),
      lire('/referentiels/fonctions'),
      lire('/referentiels/categories-agents'),
    ]);
    return { services, fonctions, categories };
  }, []);

  const filtrer = (cle) => (e) => {
    setFiltres((f) => ({ ...f, [cle]: e.target.value }));
    setPage(1);
  };

  const enregistre = (u, creation) => {
    setEdition(null);
    recharger();
    if (creation && u?.motDePasseProvisoire) {
      setMdp({ titre: 'Compte créé', nom: `${u.prenom} ${u.nom}`, email: u.email, motDePasse: u.motDePasseProvisoire });
    }
  };

  const reinitialiser = async () => {
    const u = aReinitialiser;
    const r = await action(() => api.post(`/utilisateurs/${u.id}/reinitialiser-mot-de-passe`), 'Mot de passe réinitialisé');
    setAReinitialiser(null);
    if (r) {
      setMdp({ titre: 'Nouveau mot de passe', nom: `${u.prenom} ${u.nom}`, email: u.email, motDePasse: r.data.data.motDePasseProvisoire });
      recharger();
    }
  };

  const utilisateurs = donnees?.data || [];
  const listesPretes = listes || { services: [], fonctions: [], categories: [] };

  return (
    <div>
      <EnTete
        titre="Utilisateurs"
        sousTitre="Comptes, rôles, rattachement aux services et catégories d’agents."
        actions={
          <button className="btn-primary" onClick={() => setEdition({})}>
            <UserPlus className="h-4 w-4" /> Nouvel utilisateur
          </button>
        }
      />

      <Carte corps="p-0">
        <div className="grid grid-cols-1 gap-2 border-b border-stone-100 p-3 sm:grid-cols-3 sm:p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input className="input pl-9" placeholder="Nom, e-mail, matricule…" value={saisie} onChange={(e) => setSaisie(e.target.value)} aria-label="Rechercher" />
          </div>
          <Select options={options(LIBELLES.role)} vide="Tous les rôles" value={filtres.role} onChange={filtrer('role')} aria-label="Rôle" />
          <Select
            options={listesPretes.services.map((s) => ({ value: s.id, label: s.nom }))}
            vide="Tous les services"
            value={filtres.serviceId}
            onChange={filtrer('serviceId')}
            aria-label="Service"
          />
        </div>

        {chargement && !donnees ? (
          <Chargement />
        ) : erreur ? (
          <div className="p-4">
            <Erreur message={erreur} onRetry={recharger} />
          </div>
        ) : !utilisateurs.length ? (
          <Vide
            titre="Aucun utilisateur"
            texte={filtres.q || filtres.role || filtres.serviceId ? 'Aucun compte ne correspond aux filtres.' : undefined}
            action={
              <button className="btn-primary btn-sm" onClick={() => setEdition({})}>
                <Plus className="h-4 w-4" /> Créer un compte
              </button>
            }
          />
        ) : (
          <div className={chargement ? 'opacity-60' : ''}>
            <Tableau>
              <thead>
                <tr>
                  <th>Matricule</th>
                  <th>Nom</th>
                  <th>E-mail</th>
                  <th>Rôle</th>
                  <th>Service</th>
                  <th>Catégorie</th>
                  <th>État</th>
                  <th>Dernière connexion</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {utilisateurs.map((u) => (
                  <tr key={u.id}>
                    <td className="font-mono text-xs">{u.matricule}</td>
                    <td className="whitespace-nowrap">
                      <p className="font-medium text-stone-900">
                        {u.nom} {u.prenom}
                      </p>
                      {u.fonction && <p className="text-xs text-stone-500">{u.fonction.libelle}</p>}
                    </td>
                    <td className="text-stone-600">{u.email}</td>
                    <td>
                      <div className="flex flex-col items-start gap-1">
                        <Badge ton={TON_ROLE[u.role]}>{LIBELLES.role[u.role]}</Badge>
                        {u.perimetreGlobal && <span className="text-[11px] text-stone-500">Périmètre global</span>}
                      </div>
                    </td>
                    <td className="text-stone-600">{u.service?.nom || '—'}</td>
                    <td className="whitespace-nowrap text-stone-600" title={u.categorie?.libelle}>
                      {u.categorie ? `Cat. ${u.categorie.code}` : '—'}
                    </td>
                    <td>
                      <div className="flex flex-col items-start gap-1">
                        {u.actif ? <Badge ton="vert">Actif</Badge> : <Badge>Inactif</Badge>}
                        {u.doitChangerMdp && <Badge ton="orange">MdP provisoire</Badge>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap text-stone-600">{u.derniereConnexion ? dateHeure(u.derniereConnexion) : 'Jamais'}</td>
                    <td className="whitespace-nowrap text-right">
                      <button className="btn-ghost btn-sm" onClick={() => setEdition({ id: u.id })} title="Modifier" aria-label="Modifier">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button className="btn-ghost btn-sm" onClick={() => setAReinitialiser(u)} title="Réinitialiser le mot de passe" aria-label="Réinitialiser le mot de passe">
                        <KeyRound className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tableau>
            <Pagination meta={donnees.meta} onPage={setPage} />
          </div>
        )}
      </Carte>

      <FormulaireUtilisateur edition={edition} listes={listesPretes} onFermer={() => setEdition(null)} onEnregistre={enregistre} />

      <Confirmation
        ouverte={Boolean(aReinitialiser)}
        titre="Réinitialiser le mot de passe"
        message={
          aReinitialiser &&
          `Un nouveau mot de passe provisoire sera généré pour ${aReinitialiser.prenom} ${aReinitialiser.nom}. L’ancien ne fonctionnera plus et le compte sera déverrouillé. Continuer ?`
        }
        libelleOk="Réinitialiser"
        onAnnuler={() => setAReinitialiser(null)}
        onConfirmer={reinitialiser}
      />

      <ModaleMotDePasse info={mdp} onFermer={() => setMdp(null)} />
    </div>
  );
}
