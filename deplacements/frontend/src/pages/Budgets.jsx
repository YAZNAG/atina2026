import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, PiggyBank, TrendingUp, Clock, Wallet, AlertTriangle, Info as InfoIcone } from 'lucide-react';
import api, { lire, messageErreur } from '../api/client';
import { useDonnees, action } from '../hooks/useDonnees';
import { useAuth } from '../context/AuthContext';
import {
  Chargement,
  Erreur,
  Vide,
  EnTete,
  Carte,
  Badge,
  StatutMission,
  Modale,
  Champ,
  Select,
  Indicateur,
  Jauge,
  Confirmation,
  Tableau,
  Spinner,
} from '../components/ui';
import { mad, nombre, date, nomComplet, LIBELLES, options } from '../lib/format';

const ANNEE_COURANTE = new Date().getFullYear();
const ANNEES = Array.from({ length: 6 }, (_, i) => ANNEE_COURANTE + 1 - i);
const TON_TYPE = { GLOBAL: 'brique', SERVICE: 'bleu', PROJET: 'violet' };

const pourcent = (t) => `${nombre(t, 1)} %`;

function BadgesAlerte({ s }) {
  if (s.depasse) return <Badge ton="rouge">Dépassé</Badge>;
  if (s.enAlerte) return <Badge ton="orange">Seuil d’alerte atteint</Badge>;
  return null;
}

const perimetre = (b) => (b.type === 'SERVICE' ? b.service?.nom : b.type === 'PROJET' ? (b.projet ? `${b.projet.code} — ${b.projet.libelle}` : null) : 'Toute la Chambre');

export default function Budgets() {
  const { peut } = useAuth();
  const gestion = peut('budget:gerer');
  const [annee, setAnnee] = useState(ANNEE_COURANTE);
  const [detail, setDetail] = useState(null);
  const [formulaire, setFormulaire] = useState(null); // { budget } (null = création)
  const [aSupprimer, setASupprimer] = useState(null);

  const { donnees, chargement, erreur, recharger } = useDonnees(() => lire('/budgets', { annee }), [annee]);
  const budgets = donnees || [];

  // Synthèse : le budget global s'il existe (les budgets de service/projet en sont des sous-enveloppes), sinon le cumul.
  const synthese = useMemo(() => {
    const globaux = budgets.filter((b) => b.type === 'GLOBAL');
    const base = globaux.length ? globaux : budgets;
    const s = base.reduce(
      (a, b) => {
        for (const k of ['montant', 'previsionnel', 'engage', 'realise', 'consomme', 'disponible']) a[k] += Number(b.situation[k] || 0);
        return a;
      },
      { montant: 0, previsionnel: 0, engage: 0, realise: 0, consomme: 0, disponible: 0 }
    );
    s.taux = s.montant > 0 ? (s.consomme / s.montant) * 100 : 0;
    s.source = globaux.length ? (globaux.length > 1 ? 'Budgets globaux' : 'Budget global') : `Cumul des ${budgets.length} budget${budgets.length > 1 ? 's' : ''}`;
    s.alertes = budgets.filter((b) => b.situation.enAlerte || b.situation.depasse).length;
    return s;
  }, [budgets]);

  const supprimer = async () => {
    const r = await action(() => api.delete(`/budgets/${aSupprimer.id}`), 'Budget supprimé');
    if (r) {
      setASupprimer(null);
      recharger();
    }
  };

  return (
    <div>
      <EnTete
        titre="Budgets des déplacements"
        sousTitre="Suivi de la consommation des enveloppes budgétaires"
        actions={
          <>
            <select className="input w-auto" value={annee} onChange={(e) => setAnnee(Number(e.target.value))} aria-label="Année">
              {ANNEES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            {gestion && (
              <button className="btn-primary" onClick={() => setFormulaire({ budget: null })}>
                <Plus className="h-4 w-4" /> Nouveau budget
              </button>
            )}
          </>
        }
      />

      <div className="mb-4 flex gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600">
        <InfoIcone className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" />
        <p>
          <strong>Prévisionnel</strong> : missions en attente de validation · <strong>Engagé</strong> : coût estimé restant des missions approuvées non soldées ·{' '}
          <strong>Réalisé</strong> : dépenses effectives (notes remboursées, prestations payées par la Chambre) · <strong>Consommé</strong> : réalisé des missions soldées, sinon
          le plus élevé de l’estimé et du réalisé · <strong>Disponible</strong> = montant − consommé.
        </p>
      </div>

      {chargement && !donnees ? (
        <Chargement />
      ) : erreur ? (
        <Erreur message={erreur} onRetry={recharger} />
      ) : budgets.length === 0 ? (
        <Carte>
          <Vide
            titre={`Aucun budget pour ${annee}`}
            texte={gestion ? 'Créez le budget global de l’année puis, si besoin, des budgets par service ou par projet.' : 'Aucun budget de votre périmètre n’est défini pour cette année.'}
            action={
              gestion && (
                <button className="btn-primary btn-sm" onClick={() => setFormulaire({ budget: null })}>
                  <Plus className="h-4 w-4" /> Nouveau budget
                </button>
              )
            }
          />
        </Carte>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Indicateur libelle="Montant alloué" valeur={mad(synthese.montant)} detail={synthese.source} icone={PiggyBank} />
            <Indicateur libelle="Consommé" valeur={mad(synthese.consomme)} detail={`${pourcent(synthese.taux)} · réalisé ${mad(synthese.realise)}`} icone={TrendingUp} ton="orange" />
            <Indicateur
              libelle="Engagé et prévisionnel"
              valeur={mad(synthese.engage + synthese.previsionnel)}
              detail={`engagé ${mad(synthese.engage)} · prév. ${mad(synthese.previsionnel)}`}
              icone={Clock}
              ton="bleu"
            />
            <Indicateur
              libelle="Disponible"
              valeur={mad(synthese.disponible)}
              detail={synthese.alertes ? `${synthese.alertes} budget${synthese.alertes > 1 ? 's' : ''} en alerte` : 'Aucune alerte'}
              icone={Wallet}
              ton="vert"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {budgets.map((b) => (
              <CarteBudget
                key={b.id}
                b={b}
                gestion={gestion}
                onOuvrir={() => setDetail(b)}
                onModifier={() => setFormulaire({ budget: b })}
                onSupprimer={() => setASupprimer(b)}
              />
            ))}
          </div>
        </>
      )}

      <ModaleDetail budget={detail} onFermer={() => setDetail(null)} />
      <FormulaireBudget
        ouvert={!!formulaire}
        budget={formulaire?.budget}
        anneeDefaut={annee}
        onFermer={() => setFormulaire(null)}
        onFait={(a) => {
          setFormulaire(null);
          if (a && a !== annee) setAnnee(a);
          else recharger();
        }}
      />
      <Confirmation
        ouverte={!!aSupprimer}
        titre="Supprimer le budget"
        message={aSupprimer && `Supprimer « ${aSupprimer.libelle} » ? Impossible si des missions y sont imputées.`}
        libelleOk="Supprimer"
        ton="danger"
        onAnnuler={() => setASupprimer(null)}
        onConfirmer={supprimer}
      />
    </div>
  );
}

function CarteBudget({ b, gestion, onOuvrir, onModifier, onSupprimer }) {
  const s = b.situation;
  const stop = (fn) => (e) => {
    e.stopPropagation();
    fn();
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOuvrir}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOuvrir())}
      className={`card cursor-pointer p-4 transition hover:border-brand-300 hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:p-5 ${
        s.depasse ? 'border-red-300' : s.enAlerte ? 'border-amber-300' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge ton={TON_TYPE[b.type]}>{LIBELLES.typeBudget[b.type]}</Badge>
            <BadgesAlerte s={s} />
          </div>
          <h3 className="mt-1.5 font-semibold text-stone-900">{b.libelle}</h3>
          <p className="text-xs text-stone-500">{perimetre(b)}</p>
        </div>
        {gestion && (
          <div className="flex shrink-0 gap-1">
            <button className="btn-ghost btn-sm" onClick={stop(onModifier)} aria-label="Modifier le budget" title="Modifier">
              <Pencil className="h-4 w-4" />
            </button>
            <button className="btn-ghost btn-sm text-red-600 hover:bg-red-50" onClick={stop(onSupprimer)} aria-label="Supprimer le budget" title="Supprimer">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
          <span className="text-stone-600">
            <strong className="text-stone-900">{mad(s.consomme)}</strong> sur {mad(s.montant)}
          </span>
          <span className={`font-semibold ${s.depasse ? 'text-red-600' : s.enAlerte ? 'text-amber-700' : 'text-emerald-700'}`}>{pourcent(s.tauxConsommation)}</span>
        </div>
        <Jauge taux={s.tauxConsommation} seuil={b.seuilAlerte} />
        <p className="mt-1 text-right text-xs text-stone-400">Seuil d’alerte : {b.seuilAlerte} %</p>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <Chiffre libelle="Prévisionnel" valeur={s.previsionnel} />
        <Chiffre libelle="Engagé" valeur={s.engage} />
        <Chiffre libelle="Réalisé" valeur={s.realise} />
        <Chiffre libelle="Disponible" valeur={s.disponible} ton={s.disponible < 0 ? 'text-red-600' : 'text-emerald-700'} />
      </dl>
      {b.montantAjuste !== null && b.montantAjuste !== undefined && (
        <p className="mt-2 text-xs text-stone-500">
          Montant initial {mad(b.montantInitial)}, ajusté à {mad(b.montantAjuste)}
        </p>
      )}
    </div>
  );
}

function Chiffre({ libelle, valeur, ton = 'text-stone-900' }) {
  return (
    <div>
      <dt className="text-xs text-stone-500">{libelle}</dt>
      <dd className={`font-medium ${ton}`}>{mad(valeur)}</dd>
    </div>
  );
}

/** Détail d'un budget : situation et missions imputées. */
function ModaleDetail({ budget, onFermer }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    if (!budget) return;
    setD(null);
    setErreur(null);
    lire(`/budgets/${budget.id}`)
      .then(setD)
      .catch((e) => setErreur(messageErreur(e)));
  }, [budget]);

  const s = d?.situation || budget?.situation;

  return (
    <Modale ouverte={!!budget} onFermer={onFermer} titre={budget?.libelle || 'Budget'} large>
      {budget && s && (
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
            <Badge ton={TON_TYPE[budget.type]}>{LIBELLES.typeBudget[budget.type]}</Badge>
            <span>{perimetre(budget)}</span>
            <span>· {budget.annee}</span>
            <BadgesAlerte s={s} />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-sm">
              <span>
                Consommé <strong>{mad(s.consomme)}</strong> sur {mad(s.montant)}
              </span>
              <span className="font-semibold">{pourcent(s.tauxConsommation)}</span>
            </div>
            <Jauge taux={s.tauxConsommation} seuil={budget.seuilAlerte} />
          </div>
          <dl className="grid grid-cols-2 gap-3 rounded-lg bg-stone-50 p-3 text-sm sm:grid-cols-4">
            <Chiffre libelle="Prévisionnel" valeur={s.previsionnel} />
            <Chiffre libelle="Engagé" valeur={s.engage} />
            <Chiffre libelle="Réalisé" valeur={s.realise} />
            <Chiffre libelle="Disponible" valeur={s.disponible} ton={s.disponible < 0 ? 'text-red-600' : 'text-emerald-700'} />
          </dl>
        </div>
      )}

      <h4 className="mb-2 text-sm font-semibold text-stone-700">Missions imputées</h4>
      {erreur ? (
        <Erreur message={erreur} />
      ) : !d ? (
        <Chargement />
      ) : d.missions.length === 0 ? (
        <Vide titre="Aucune mission imputée" texte="Les missions sont imputées sur ce budget lors de leur création." />
      ) : (
        <div className="-mx-5 border-y border-stone-100 sm:mx-0 sm:rounded-lg sm:border">
          <Tableau>
            <thead>
              <tr>
                <th>Mission</th>
                <th>Demandeur</th>
                <th>Statut</th>
                <th className="text-right">Estimé</th>
                <th className="text-right">Réel</th>
                <th className="text-right">Retenu</th>
                <th>Soldée</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {d.missions.map((m) => (
                <tr key={m.id}>
                  <td className="min-w-[200px]">
                    <Link to={`/missions/${m.id}`} className="font-medium text-zellige-700 hover:underline" onClick={onFermer}>
                      {m.numero || `#${m.id}`}
                    </Link>
                    <p className="text-xs text-stone-500">
                      {m.objet} · {date(m.dateDepart)}
                    </p>
                  </td>
                  <td className="whitespace-nowrap">{nomComplet(m.demandeur)}</td>
                  <td>
                    <StatutMission statut={m.statut} />
                  </td>
                  <td className="whitespace-nowrap text-right">{mad(m.coutEstime)}</td>
                  <td className="whitespace-nowrap text-right">{mad(m.coutReel)}</td>
                  <td className="whitespace-nowrap text-right font-medium">{mad(m.coutRetenu)}</td>
                  <td>{m.soldee ? <Badge ton="vert">Oui</Badge> : <Badge>Non</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </Tableau>
        </div>
      )}
    </Modale>
  );
}

const VIDE = { type: 'GLOBAL', annee: ANNEE_COURANTE, libelle: '', serviceId: '', projetId: '', montantInitial: '', montantAjuste: '', seuilAlerte: 80 };

/** Création / modification d'un budget (service financier). */
function FormulaireBudget({ ouvert, budget, anneeDefaut, onFermer, onFait }) {
  const [form, setForm] = useState(VIDE);
  const [erreurs, setErreurs] = useState({});
  const [envoi, setEnvoi] = useState(false);
  const [services, setServices] = useState([]);
  const [projets, setProjets] = useState([]);

  useEffect(() => {
    if (!ouvert) return;
    setErreurs({});
    setForm(
      budget
        ? {
            type: budget.type,
            annee: budget.annee,
            libelle: budget.libelle,
            serviceId: budget.serviceId ?? '',
            projetId: budget.projetId ?? '',
            montantInitial: String(budget.montantInitial ?? ''),
            montantAjuste: budget.montantAjuste === null || budget.montantAjuste === undefined ? '' : String(budget.montantAjuste),
            seuilAlerte: budget.seuilAlerte ?? 80,
          }
        : { ...VIDE, annee: anneeDefaut }
    );
    Promise.all([lire('/referentiels/services'), lire('/referentiels/projets')])
      .then(([s, p]) => {
        setServices(s);
        setProjets(p);
      })
      .catch(() => {});
  }, [ouvert, budget, anneeDefaut]);

  const maj = (champ) => (e) => setForm((f) => ({ ...f, [champ]: e.target.value }));
  const nombreOuNull = (v) => (String(v).trim() === '' ? null : Number(String(v).replace(',', '.')));

  const enregistrer = async (e) => {
    e.preventDefault();
    const err = {};
    const annee = Number(form.annee);
    const montantInitial = nombreOuNull(form.montantInitial);
    const montantAjuste = nombreOuNull(form.montantAjuste);
    const seuil = Number(form.seuilAlerte);
    if (!form.libelle.trim()) err.libelle = 'Libellé requis';
    if (!(annee >= 2000 && annee <= 2100)) err.annee = 'Année invalide';
    if (form.type === 'SERVICE' && !form.serviceId) err.serviceId = 'Choisissez un service';
    if (form.type === 'PROJET' && !form.projetId) err.projetId = 'Choisissez un projet';
    if (montantInitial === null || !(montantInitial >= 0)) err.montantInitial = 'Montant requis';
    if (montantAjuste !== null && !(montantAjuste >= 0)) err.montantAjuste = 'Montant invalide';
    if (!(seuil >= 1 && seuil <= 100)) err.seuilAlerte = 'Entre 1 et 100 %';
    setErreurs(err);
    if (Object.keys(err).length) return;

    const corps = {
      type: form.type,
      annee,
      libelle: form.libelle.trim(),
      serviceId: form.type === 'SERVICE' ? Number(form.serviceId) : null,
      projetId: form.type === 'PROJET' ? Number(form.projetId) : null,
      montantInitial,
      montantAjuste,
      seuilAlerte: Math.round(seuil),
    };
    setEnvoi(true);
    const r = await action(() => (budget ? api.put(`/budgets/${budget.id}`, corps) : api.post('/budgets', corps)), budget ? 'Budget modifié' : 'Budget créé');
    setEnvoi(false);
    if (r) onFait(annee);
  };

  const servicesActifs = services.filter((s) => s.actif !== false || String(s.id) === String(form.serviceId));
  const projetsActifs = projets.filter((p) => p.actif !== false || String(p.id) === String(form.projetId));

  return (
    <Modale
      ouverte={ouvert}
      onFermer={onFermer}
      titre={budget ? 'Modifier le budget' : 'Nouveau budget'}
      pied={
        <>
          <button className="btn-secondary" onClick={onFermer}>
            Annuler
          </button>
          <button type="submit" form="form-budget" className="btn-primary" disabled={envoi}>
            {envoi && <Spinner className="h-4 w-4 text-white" />} Enregistrer
          </button>
        </>
      }
    >
      <form id="form-budget" onSubmit={enregistrer} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <Champ label="Type" requis>
          <Select options={options(LIBELLES.typeBudget)} value={form.type} onChange={maj('type')} />
        </Champ>
        <Champ label="Année" requis erreur={erreurs.annee}>
          <input type="number" className="input" min="2000" max="2100" value={form.annee} onChange={maj('annee')} />
        </Champ>
        <Champ label="Libellé" requis erreur={erreurs.libelle} className="sm:col-span-2">
          <input className="input" value={form.libelle} onChange={maj('libelle')} placeholder="Ex. : Budget global des déplacements" />
        </Champ>
        {form.type === 'SERVICE' && (
          <Champ label="Service" requis erreur={erreurs.serviceId} className="sm:col-span-2">
            <Select vide="Choisir un service…" options={servicesActifs.map((s) => ({ value: s.id, label: s.nom }))} value={form.serviceId} onChange={maj('serviceId')} />
          </Champ>
        )}
        {form.type === 'PROJET' && (
          <Champ label="Projet" requis erreur={erreurs.projetId} className="sm:col-span-2">
            <Select
              vide="Choisir un projet…"
              options={projetsActifs.map((p) => ({ value: p.id, label: `${p.code} — ${p.libelle}` }))}
              value={form.projetId}
              onChange={maj('projetId')}
            />
          </Champ>
        )}
        <Champ label="Montant initial (MAD)" requis erreur={erreurs.montantInitial}>
          <input type="number" inputMode="decimal" min="0" step="0.01" className="input" value={form.montantInitial} onChange={maj('montantInitial')} />
        </Champ>
        <Champ label="Montant ajusté (MAD)" erreur={erreurs.montantAjuste} aide="Remplace le montant initial s’il est renseigné">
          <input type="number" inputMode="decimal" min="0" step="0.01" className="input" value={form.montantAjuste} onChange={maj('montantAjuste')} />
        </Champ>
        <Champ label="Seuil d’alerte (%)" requis erreur={erreurs.seuilAlerte} aide="Alerte envoyée quand la consommation atteint ce taux">
          <input type="number" min="1" max="100" step="1" className="input" value={form.seuilAlerte} onChange={maj('seuilAlerte')} />
        </Champ>
        {budget && (
          <p className="flex items-start gap-1.5 text-xs text-stone-500 sm:col-span-2 sm:self-end">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> La modification réarme les alertes de seuil de ce budget.
          </p>
        )}
      </form>
    </Modale>
  );
}
