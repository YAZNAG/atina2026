import { Fragment, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Database, Download, FileArchive, Play, RefreshCw, Search, X } from 'lucide-react';
import api, { lire, lirePage, ouvrirFichier } from '../../api/client';
import { action, useDonnees } from '../../hooks/useDonnees';
import { useAuth } from '../../context/AuthContext';
import { Badge, Carte, Chargement, Confirmation, EnTete, Erreur, Onglets, Pagination, Select, Spinner, Tableau, Vide } from '../../components/ui';
import { dateHeure, nomComplet, nombre } from '../../lib/format';

// ── Outils ──

const ENTITES = [
  'User', 'Service', 'CategorieAgent', 'Fonction', 'Zone', 'Destination', 'Bareme', 'PlafondFrais', 'Projet', 'CircuitValidation',
  'Mission', 'NoteFrais', 'Avance', 'Budget', 'Vehicule', 'Document', 'Reporting', 'Parametre', 'ModeleDocument', 'Sauvegarde', 'Tache',
];
const ACTIONS = [
  'CREATION', 'MODIFICATION', 'SUPPRESSION', 'DESACTIVATION', 'SOUMISSION', 'APPROBATION', 'REFUS', 'VALIDATION', 'REJET', 'DEMARRAGE',
  'DEMARRAGE_AUTOMATIQUE', 'CLOTURE', 'ANNULATION', 'REVISION', 'AJOUT_LIGNE', 'MODIFICATION_LIGNE', 'SUPPRESSION_LIGNE', 'CONTROLE_LIGNE',
  'DEMANDE', 'VERSEMENT', 'REMBOURSEMENT', 'EXPORT_PDF', 'EXPORT_EXCEL', 'EXPORT_COMPTABLE', 'EDITION_PDF', 'CONSULTATION_DONNEES_SENSIBLES',
  'REINITIALISATION_MOT_DE_PASSE', 'CHANGEMENT_MOT_DE_PASSE', 'TELEVERSEMENT', 'REINITIALISATION', 'SAUVEGARDE', 'TELECHARGEMENT_SAUVEGARDE',
  'TACHE_MANUELLE',
];

const TON_ACTION = (a) =>
  /SUPPRESSION|ANNULATION|REFUS|REJET|DESACTIVATION/.test(a)
    ? 'rouge'
    : /CREATION|AJOUT|APPROBATION|VALIDATION|VERSEMENT|REMBOURSEMENT/.test(a)
      ? 'vert'
      : /SENSIBLES|MOT_DE_PASSE|SAUVEGARDE/.test(a)
        ? 'orange'
        : /MODIFICATION|REVISION/.test(a)
          ? 'bleu'
          : 'gris';

const taille = (o) => {
  if (!o && o !== 0) return '—';
  const u = ['o', 'Ko', 'Mo', 'Go'];
  let v = o;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${nombre(v, i ? 1 : 0)} ${u[i]}`;
};

/** Navigateur et système lisibles à partir du User-Agent. */
function navigateur(ua) {
  if (!ua) return '—';
  const nav =
    (/Edg\//.test(ua) && 'Edge') ||
    (/OPR\//.test(ua) && 'Opera') ||
    (/Firefox\//.test(ua) && 'Firefox') ||
    (/Chrome\//.test(ua) && 'Chrome') ||
    (/Safari\//.test(ua) && 'Safari') ||
    (/curl/i.test(ua) && 'curl') ||
    ua.split(/[ /]/)[0];
  const os =
    (/Android/.test(ua) && 'Android') ||
    (/iPhone|iPad/.test(ua) && 'iOS') ||
    (/Windows/.test(ua) && 'Windows') ||
    (/Mac OS X/.test(ua) && 'macOS') ||
    (/Linux/.test(ua) && 'Linux') ||
    '';
  return os ? `${nav} · ${os}` : nav;
}

const afficherValeur = (v) => {
  if (v === undefined) return <span className="text-stone-300">—</span>;
  if (v === null) return <span className="italic text-stone-400">vide</span>;
  if (typeof v === 'boolean') return v ? 'oui' : 'non';
  if (typeof v === 'object') return <code className="break-all text-xs">{JSON.stringify(v)}</code>;
  const s = String(v);
  // Valeurs JSON sérialisées (paramètres, étapes de circuit) : affichage compact.
  if (/^[[{]/.test(s)) return <code className="break-all text-xs">{s}</code>;
  return <span className="break-words">{s}</span>;
};

/** Différences champ par champ entre les états avant / après. */
function Differences({ avant, apres }) {
  const a = avant && typeof avant === 'object' ? avant : {};
  const b = apres && typeof apres === 'object' ? apres : {};
  const cles = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  if (!cles.length) return <p className="text-sm text-stone-500">Aucun détail enregistré pour cette action.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
          <tr>
            <th className="px-3 py-2">Champ</th>
            <th className="px-3 py-2">Avant</th>
            <th className="px-3 py-2">Après</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {cles.map((k) => {
            const change = avant && apres && JSON.stringify(a[k]) !== JSON.stringify(b[k]);
            return (
              <tr key={k} className={change ? 'bg-amber-50/60' : ''}>
                <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs text-stone-600">{k}</td>
                <td className={`max-w-xs px-3 py-1.5 align-top ${change ? 'text-red-700 line-through decoration-red-300' : 'text-stone-700'}`}>
                  {avant ? afficherValeur(a[k]) : <span className="text-stone-300">—</span>}
                </td>
                <td className={`max-w-xs px-3 py-1.5 align-top ${change ? 'font-medium text-emerald-700' : 'text-stone-700'}`}>
                  {apres ? afficherValeur(b[k]) : <span className="text-stone-300">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EtatListe({ chargement, donnees, erreur, recharger, vide, children }) {
  if (chargement && !donnees) return <Chargement />;
  if (erreur)
    return (
      <div className="p-4">
        <Erreur message={erreur} onRetry={recharger} />
      </div>
    );
  if (!donnees?.data?.length) return <Vide titre={vide} />;
  return <div className={chargement ? 'opacity-60 transition' : ''}>{children}</div>;
}

// ── Onglets ──

function JournalAudit() {
  const [filtres, setFiltres] = useState({ entite: '', action: '', du: '', au: '' });
  const [page, setPage] = useState(1);
  const [ouvert, setOuvert] = useState(null);
  const etat = useDonnees(
    () => lirePage('/admin/audit', { page, limit: 25, ...Object.fromEntries(Object.entries(filtres).filter(([, v]) => v)) }),
    [page, filtres.entite, filtres.action, filtres.du, filtres.au]
  );
  const filtrer = (cle) => (e) => {
    setFiltres((f) => ({ ...f, [cle]: e.target.value }));
    setPage(1);
  };
  const actifs = Object.values(filtres).some(Boolean);

  return (
    <Carte corps="p-0">
      <div className="grid grid-cols-1 gap-2 border-b border-stone-100 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-5">
        <Select options={ENTITES.map((e) => ({ value: e, label: e }))} vide="Toutes les entités" value={filtres.entite} onChange={filtrer('entite')} aria-label="Entité" />
        <div>
          <input className="input" list="actions-audit" placeholder="Action (ex. MODIFICATION)" value={filtres.action} onChange={filtrer('action')} aria-label="Action" />
          <datalist id="actions-audit">
            {ACTIONS.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </div>
        <label className="flex items-center gap-2 text-sm text-stone-500">
          Du <input className="input" type="date" value={filtres.du} onChange={filtrer('du')} />
        </label>
        <label className="flex items-center gap-2 text-sm text-stone-500">
          Au <input className="input" type="date" value={filtres.au} onChange={filtrer('au')} />
        </label>
        {actifs && (
          <button
            className="btn-ghost btn-sm justify-self-start"
            onClick={() => {
              setFiltres({ entite: '', action: '', du: '', au: '' });
              setPage(1);
            }}
          >
            <X className="h-4 w-4" /> Effacer les filtres
          </button>
        )}
      </div>
      <EtatListe {...etat} vide="Aucune entrée dans le journal">
        <Tableau>
          <thead>
            <tr>
              <th className="w-8" />
              <th>Date</th>
              <th>Utilisateur</th>
              <th>Action</th>
              <th>Entité</th>
              <th>Adresse IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {etat.donnees?.data.map((l) => {
              const deplie = ouvert === l.id;
              return (
                <Fragment key={l.id}>
                  <tr className="cursor-pointer" onClick={() => setOuvert(deplie ? null : l.id)} aria-expanded={deplie}>
                    <td>{deplie ? <ChevronDown className="h-4 w-4 text-stone-500" /> : <ChevronRight className="h-4 w-4 text-stone-400" />}</td>
                    <td className="whitespace-nowrap text-stone-600">{dateHeure(l.createdAt)}</td>
                    <td className="whitespace-nowrap">
                      {l.user ? (
                        <>
                          <p className="font-medium text-stone-800">{nomComplet(l.user)}</p>
                          <p className="text-xs text-stone-500">{l.user.email}</p>
                        </>
                      ) : (
                        <span className="text-stone-500">Système</span>
                      )}
                    </td>
                    <td>
                      <Badge ton={TON_ACTION(l.action)}>{l.action}</Badge>
                    </td>
                    <td className="whitespace-nowrap font-mono text-xs">
                      {l.entite}
                      {l.entiteId != null && <span className="text-stone-500"> #{l.entiteId}</span>}
                    </td>
                    <td className="font-mono text-xs text-stone-500">{l.ip || '—'}</td>
                  </tr>
                  {deplie && (
                    <tr className="hover:bg-transparent">
                      <td />
                      <td colSpan={5} className="bg-stone-50/60 pb-4">
                        <Differences avant={l.avant} apres={l.apres} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </Tableau>
        <Pagination meta={etat.donnees?.meta} onPage={setPage} />
      </EtatListe>
    </Carte>
  );
}

function Connexions() {
  const [succes, setSucces] = useState('');
  const [saisie, setSaisie] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(saisie.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [saisie]);
  const etat = useDonnees(() => lirePage('/admin/connexions', { page, limit: 25, succes: succes || undefined, q: q || undefined }), [page, succes, q]);

  return (
    <Carte corps="p-0">
      <div className="grid grid-cols-1 gap-2 border-b border-stone-100 p-3 sm:grid-cols-3 sm:p-4">
        <div className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input className="input pl-9" placeholder="Adresse e-mail…" value={saisie} onChange={(e) => setSaisie(e.target.value)} aria-label="E-mail" />
        </div>
        <Select
          options={[
            { value: '1', label: 'Réussies' },
            { value: '0', label: 'Échouées' },
          ]}
          vide="Toutes les tentatives"
          value={succes}
          onChange={(e) => {
            setSucces(e.target.value);
            setPage(1);
          }}
          aria-label="Résultat"
        />
      </div>
      <EtatListe {...etat} vide="Aucune connexion enregistrée">
        <Tableau>
          <thead>
            <tr>
              <th>Date</th>
              <th>E-mail</th>
              <th>Résultat</th>
              <th>Motif</th>
              <th>Adresse IP</th>
              <th>Navigateur</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {etat.donnees?.data.map((c) => (
              <tr key={c.id}>
                <td className="whitespace-nowrap text-stone-600">{dateHeure(c.createdAt)}</td>
                <td>{c.email}</td>
                <td>{c.succes ? <Badge ton="vert">Réussie</Badge> : <Badge ton="rouge">Échec</Badge>}</td>
                <td className="text-stone-600">{c.motif || '—'}</td>
                <td className="font-mono text-xs text-stone-500">{c.ip || '—'}</td>
                <td className="whitespace-nowrap text-stone-600" title={c.userAgent || ''}>
                  {navigateur(c.userAgent)}
                </td>
              </tr>
            ))}
          </tbody>
        </Tableau>
        <Pagination meta={etat.donnees?.meta} onPage={setPage} />
      </EtatListe>
    </Carte>
  );
}

const TON_EMAIL = { ENVOYE: 'vert', JOURNALISE: 'bleu', ECHEC: 'rouge' };
const LIB_EMAIL = { ENVOYE: 'Envoyé', JOURNALISE: 'Journalisé (SMTP non configuré)', ECHEC: 'Échec' };

function Emails() {
  const [page, setPage] = useState(1);
  const etat = useDonnees(() => lirePage('/admin/emails', { page, limit: 25 }), [page]);
  return (
    <Carte corps="p-0">
      <EtatListe {...etat} vide="Aucun e-mail émis">
        <Tableau>
          <thead>
            <tr>
              <th>Date</th>
              <th>Destinataire</th>
              <th>Sujet</th>
              <th>Statut</th>
              <th>Erreur</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {etat.donnees?.data.map((m) => (
              <tr key={m.id}>
                <td className="whitespace-nowrap text-stone-600">{dateHeure(m.createdAt)}</td>
                <td>{m.destinataire}</td>
                <td className="min-w-[14rem]">{m.sujet}</td>
                <td>
                  <Badge ton={TON_EMAIL[m.statut] || 'gris'}>{LIB_EMAIL[m.statut] || m.statut}</Badge>
                </td>
                <td className="max-w-xs break-words text-xs text-red-700">{m.erreur || ''}</td>
              </tr>
            ))}
          </tbody>
        </Tableau>
        <Pagination meta={etat.donnees?.meta} onPage={setPage} />
      </EtatListe>
    </Carte>
  );
}

function Sauvegardes() {
  const { donnees, chargement, erreur, recharger } = useDonnees(() => lire('/admin/sauvegardes'), []);
  const [confirmer, setConfirmer] = useState(false);
  const [telechargement, setTelechargement] = useState(null);

  const lancer = async () => {
    // Le contrôle est rendu après la fin de la sauvegarde (pg_dump + archive des justificatifs).
    await action(() => api.post('/admin/sauvegardes'), 'Sauvegarde effectuée');
    setConfirmer(false);
    recharger();
  };

  const telecharger = async (s, partie) => {
    setTelechargement(`${s.id}-${partie}`);
    await action(() => ouvrirFichier(`/admin/sauvegardes/${s.id}/${partie}`, { telecharger: true }));
    setTelechargement(null);
  };

  return (
    <Carte
      titre="Sauvegardes"
      corps="p-0"
      actions={
        <>
          <button className="btn-ghost btn-sm" onClick={recharger} aria-label="Actualiser" title="Actualiser">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button className="btn-primary btn-sm" onClick={() => setConfirmer(true)}>
            <Database className="h-4 w-4" /> Lancer une sauvegarde
          </button>
        </>
      }
    >
      <p className="border-b border-stone-100 px-4 py-3 text-xs text-stone-500 sm:px-5">
        Chaque sauvegarde comprend un export complet de la base de données et une archive des justificatifs. Conservez une copie hors du serveur.
      </p>
      {chargement && !donnees ? (
        <Chargement />
      ) : erreur ? (
        <div className="p-4">
          <Erreur message={erreur} onRetry={recharger} />
        </div>
      ) : !donnees.length ? (
        <Vide titre="Aucune sauvegarde" texte="Lancez une première sauvegarde manuelle ; les sauvegardes planifiées apparaîtront aussi ici." />
      ) : (
        <Tableau>
          <thead>
            <tr>
              <th>Date</th>
              <th>Fichier</th>
              <th className="text-right">Taille</th>
              <th>Statut</th>
              <th className="text-right">Téléchargement</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {donnees.map((s) => (
              <tr key={s.id}>
                <td className="whitespace-nowrap text-stone-600">{dateHeure(s.createdAt)}</td>
                <td className="font-mono text-xs">{s.fichier}</td>
                <td className="whitespace-nowrap text-right">{taille(s.taille)}</td>
                <td>
                  {s.statut === 'OK' ? <Badge ton="vert">Réussie</Badge> : <Badge ton="rouge">{s.statut}</Badge>}
                  {s.erreur && <p className="mt-1 max-w-xs text-xs text-red-700">{s.erreur}</p>}
                </td>
                <td className="whitespace-nowrap text-right">
                  {s.statut === 'OK' && (
                    <div className="flex justify-end gap-1">
                      <button className="btn-secondary btn-sm" onClick={() => telecharger(s, 'base')} disabled={Boolean(telechargement)}>
                        {telechargement === `${s.id}-base` ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />} Base
                      </button>
                      <button className="btn-secondary btn-sm" onClick={() => telecharger(s, 'justificatifs')} disabled={Boolean(telechargement)}>
                        {telechargement === `${s.id}-justificatifs` ? <Spinner className="h-4 w-4" /> : <FileArchive className="h-4 w-4" />} Justificatifs
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Tableau>
      )}
      <Confirmation
        ouverte={confirmer}
        titre="Lancer une sauvegarde"
        message="La sauvegarde complète (base de données et justificatifs) peut prendre quelques instants. Continuer ?"
        libelleOk="Lancer"
        onAnnuler={() => setConfirmer(false)}
        onConfirmer={lancer}
      />
    </Carte>
  );
}

const TACHES = [
  { nom: 'demarrer-missions', titre: 'Démarrer les missions', texte: 'Passe « En cours » les missions approuvées dont la date de départ est atteinte.' },
  { nom: 'rappels-cloture', titre: 'Rappels de clôture', texte: 'Rappelle aux agents de clôturer les missions terminées depuis le délai paramétré.' },
  { nom: 'rappels-justificatifs', titre: 'Rappels de justificatifs', texte: 'Rappelle aux participants de saisir ou soumettre leur note de frais et de déposer les justificatifs.' },
  { nom: 'relances-validateurs', titre: 'Relances des validateurs', texte: 'Relance les validateurs dont une demande attend depuis trop longtemps.' },
  { nom: 'echeances-parc', titre: 'Échéances du parc', texte: 'Alerte le service financier des assurances et visites techniques arrivant à échéance sous 30 jours.' },
];

function Taches() {
  const [enCours, setEnCours] = useState(null);
  const [resultats, setResultats] = useState({});

  const executer = async (nom) => {
    setEnCours(nom);
    const r = await action(() => api.post(`/admin/taches/${nom}`), 'Tâche exécutée');
    setEnCours(null);
    if (r) setResultats((x) => ({ ...x, [nom]: { date: new Date(), data: r.data.data } }));
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-500">
        Ces tâches s’exécutent automatiquement chaque jour. Vous pouvez les lancer manuellement ici ; chaque exécution est tracée dans le journal d’audit.
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {TACHES.map((t) => (
          <Carte key={t.nom} corps="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-stone-900">{t.titre}</p>
                <p className="mt-0.5 text-sm text-stone-500">{t.texte}</p>
              </div>
              <button className="btn-secondary btn-sm shrink-0" onClick={() => executer(t.nom)} disabled={Boolean(enCours)}>
                {enCours === t.nom ? <Spinner className="h-4 w-4" /> : <Play className="h-4 w-4" />} Exécuter
              </button>
            </div>
            {resultats[t.nom] && (
              <div className="mt-3">
                <p className="mb-1 text-xs text-stone-500">Résultat du {dateHeure(resultats[t.nom].date)} :</p>
                <pre className="max-h-48 overflow-auto rounded-lg bg-stone-900 p-3 text-xs text-stone-100">{JSON.stringify(resultats[t.nom].data, null, 2)}</pre>
              </div>
            )}
          </Carte>
        ))}
      </div>
    </div>
  );
}

export default function Journaux() {
  const { peut } = useAuth();
  const onglets = [
    { id: 'audit', label: 'Journal d’audit' },
    { id: 'connexions', label: 'Connexions' },
    { id: 'emails', label: 'E-mails' },
    ...(peut('admin:sauvegardes') ? [{ id: 'sauvegardes', label: 'Sauvegardes' }] : []),
    ...(peut('admin:parametres') ? [{ id: 'taches', label: 'Tâches automatiques' }] : []),
  ];
  const [onglet, setOnglet] = useState('audit');

  return (
    <div>
      <EnTete titre="Journaux et sauvegardes" sousTitre="Traçabilité des opérations, connexions, e-mails émis et sauvegardes." />
      <Onglets onglets={onglets} actif={onglet} onChange={setOnglet} />
      {onglet === 'audit' && <JournalAudit />}
      {onglet === 'connexions' && <Connexions />}
      {onglet === 'emails' && <Emails />}
      {onglet === 'sauvegardes' && peut('admin:sauvegardes') && <Sauvegardes />}
      {onglet === 'taches' && peut('admin:parametres') && <Taches />}
    </div>
  );
}
