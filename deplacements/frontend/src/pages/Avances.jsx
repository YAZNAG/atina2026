import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Banknote, Ban, Wallet, Hourglass, Receipt } from 'lucide-react';
import api, { lire, messageErreur } from '../api/client';
import { useDonnees, action } from '../hooks/useDonnees';
import { useAuth } from '../context/AuthContext';
import {
  Chargement,
  Erreur,
  Vide,
  EnTete,
  Carte,
  StatutAvance,
  StatutMission,
  Modale,
  Champ,
  Select,
  Onglets,
  Indicateur,
  Confirmation,
  Tableau,
  Spinner,
} from '../components/ui';
import { mad, date, nomComplet, versInputDate, LIBELLES, options } from '../lib/format';

const MODES_VERSEMENT = { VIREMENT: LIBELLES.modePaiement.VIREMENT, CHEQUE: LIBELLES.modePaiement.CHEQUE, ESPECES: LIBELLES.modePaiement.ESPECES };

export default function Avances() {
  const { utilisateur, peut } = useAuth();
  const gestion = peut('avance:gerer');
  const [vue, setVue] = useState(gestion ? 'toutes' : 'mes');
  const [statut, setStatut] = useState('');
  const [demande, setDemande] = useState(false);
  const [aVerser, setAVerser] = useState(null);
  const [aAnnuler, setAAnnuler] = useState(null);

  const toutes = gestion && vue === 'toutes';
  const { donnees, chargement, erreur, recharger } = useDonnees(
    () => lire('/avances', { statut: statut || undefined, mes: toutes ? undefined : 1 }),
    [statut, toutes]
  );
  const avances = donnees || [];

  const synthese = useMemo(() => {
    const somme = (l) => l.reduce((a, x) => a + Number(x.montant || 0), 0);
    const demandees = avances.filter((a) => a.statut === 'DEMANDEE');
    const versees = avances.filter((a) => a.statut === 'VERSEE');
    return { nbDemandees: demandees.length, demandees: somme(demandees), nbVersees: versees.length, versees: somme(versees) };
  }, [avances]);

  const peutAnnuler = (a) => a.statut === 'DEMANDEE' && (gestion || a.agentId === utilisateur?.id);

  const annuler = async (commentaire) => {
    const r = await action(() => api.post(`/avances/${aAnnuler.id}/annuler`, commentaire ? { commentaire } : {}), 'Avance annulée');
    if (r) {
      setAAnnuler(null);
      recharger();
    }
  };

  const actions = (a) => (
    <div className="flex flex-wrap justify-end gap-1">
      {gestion && a.statut === 'DEMANDEE' && (
        <button className="btn-success btn-sm" onClick={() => setAVerser(a)}>
          <Banknote className="h-3.5 w-3.5" /> Verser
        </button>
      )}
      {peutAnnuler(a) && (
        <button className="btn-secondary btn-sm text-red-700" onClick={() => setAAnnuler(a)}>
          <Ban className="h-3.5 w-3.5" /> Annuler
        </button>
      )}
    </div>
  );

  return (
    <div>
      <EnTete
        titre="Avances sur frais"
        sousTitre="Avances versées avant la mission et déduites de la note de frais"
        actions={
          <button className="btn-primary" onClick={() => setDemande(true)}>
            <Plus className="h-4 w-4" /> Demander une avance
          </button>
        }
      />

      {gestion && (
        <Onglets
          onglets={[
            { id: 'toutes', label: 'Toutes les avances' },
            { id: 'mes', label: 'Mes avances' },
          ]}
          actif={vue}
          onChange={setVue}
        />
      )}

      {donnees && (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Indicateur
            libelle={toutes ? 'Demandes à verser' : 'Demandes en attente'}
            valeur={mad(synthese.demandees)}
            detail={`${synthese.nbDemandees} demande${synthese.nbDemandees > 1 ? 's' : ''}`}
            icone={Hourglass}
            ton="orange"
          />
          <Indicateur
            libelle="Versées, à régulariser"
            valeur={mad(synthese.versees)}
            detail={`${synthese.nbVersees} avance${synthese.nbVersees > 1 ? 's' : ''} en attente de note de frais remboursée`}
            icone={Wallet}
            ton="bleu"
          />
        </div>
      )}

      <Carte corps="p-0">
        <div className="flex flex-col gap-3 border-b border-stone-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="sm:w-56">
            <Select aria-label="Statut" vide="Tous les statuts" options={options(LIBELLES.statutAvance)} value={statut} onChange={(e) => setStatut(e.target.value)} />
          </div>
          <p className="text-xs text-stone-500">
            Le solde de régularisation est positif si la Chambre doit à l’agent, négatif si l’agent doit reverser un trop-perçu.
          </p>
        </div>

        {chargement && !donnees ? (
          <Chargement />
        ) : erreur ? (
          <div className="p-4">
            <Erreur message={erreur} onRetry={recharger} />
          </div>
        ) : avances.length === 0 ? (
          <Vide
            titre="Aucune avance"
            texte={statut ? 'Aucune avance avec ce statut.' : 'Vous pouvez demander une avance pour une mission en attente, approuvée ou en cours.'}
          />
        ) : (
          <>
            {/* Mobile : cartes */}
            <ul className="divide-y divide-stone-100 md:hidden">
              {avances.map((a) => (
                <li key={a.id} className="space-y-1.5 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-stone-900">{a.numero || 'Demande'}</span>
                    <StatutAvance statut={a.statut} />
                  </div>
                  {toutes && <p className="text-sm text-stone-700">{nomComplet(a.agent)}</p>}
                  <LienMission mission={a.mission} />
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">{mad(a.montant)}</span>
                    <span className="text-xs text-stone-500">Demandée le {date(a.createdAt)}</span>
                  </div>
                  <Versement a={a} />
                  <Regularisation a={a} />
                  {(peutAnnuler(a) || (gestion && a.statut === 'DEMANDEE')) && <div className="pt-1">{actions(a)}</div>}
                </li>
              ))}
            </ul>

            {/* Écran large : tableau */}
            <div className="hidden md:block">
              <Tableau>
                <thead>
                  <tr>
                    <th>Numéro</th>
                    {toutes && <th>Agent</th>}
                    <th>Mission</th>
                    <th className="text-right">Montant</th>
                    <th>Statut</th>
                    <th>Versement</th>
                    <th>Régularisation</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {avances.map((a) => (
                    <tr key={a.id}>
                      <td className="whitespace-nowrap">
                        <div className="font-medium text-stone-900">{a.numero || '—'}</div>
                        <div className="text-xs text-stone-500">Demandée le {date(a.createdAt)}</div>
                      </td>
                      {toutes && <td className="whitespace-nowrap">{nomComplet(a.agent)}</td>}
                      <td className="min-w-[200px]">
                        <LienMission mission={a.mission} />
                        {a.commentaire && <p className="mt-0.5 text-xs italic text-stone-500">« {a.commentaire} »</p>}
                      </td>
                      <td className="whitespace-nowrap text-right font-medium">{mad(a.montant)}</td>
                      <td>
                        <StatutAvance statut={a.statut} />
                      </td>
                      <td className="whitespace-nowrap">
                        <Versement a={a} />
                      </td>
                      <td className="whitespace-nowrap">
                        <Regularisation a={a} vide="—" />
                      </td>
                      <td>{actions(a)}</td>
                    </tr>
                  ))}
                </tbody>
              </Tableau>
            </div>
          </>
        )}
      </Carte>

      <ModaleDemande ouverte={demande} onFermer={() => setDemande(false)} onFait={recharger} />
      <ModaleVersement
        avance={aVerser}
        onFermer={() => setAVerser(null)}
        onFait={() => {
          setAVerser(null);
          recharger();
        }}
      />
      <Confirmation
        ouverte={!!aAnnuler}
        titre="Annuler la demande d’avance"
        message={aAnnuler && `Annuler la demande de ${mad(aAnnuler.montant)}${aAnnuler.agentId !== utilisateur?.id ? ` de ${nomComplet(aAnnuler.agent)}` : ''} ?`}
        motif={aAnnuler && aAnnuler.agentId !== utilisateur?.id ? 'Motif (communiqué à l’agent)' : 'Commentaire (facultatif)'}
        libelleOk="Annuler la demande"
        ton="danger"
        onAnnuler={() => setAAnnuler(null)}
        onConfirmer={annuler}
      />
    </div>
  );
}

function LienMission({ mission }) {
  if (!mission) return null;
  return (
    <div className="min-w-0">
      <Link to={`/missions/${mission.id}`} className="text-sm font-medium text-zellige-700 hover:underline">
        {mission.numero || `Mission #${mission.id}`}
      </Link>
      <p className="truncate text-xs text-stone-500">
        {mission.objet} · départ {date(mission.dateDepart)}
      </p>
    </div>
  );
}

function Versement({ a }) {
  if (!a.verseeLe) return <span className="text-sm text-stone-400">—</span>;
  return (
    <div className="text-sm">
      <span className="text-stone-700">Le {date(a.verseeLe)}</span>
      <span className="block text-xs text-stone-500">
        {LIBELLES.modePaiement[a.modeVersement] || a.modeVersement}
        {a.referenceVersement && ` · réf. ${a.referenceVersement}`}
      </span>
    </div>
  );
}

function Regularisation({ a, vide = null }) {
  const solde = a.soldeRegularisation;
  if ((solde === null || solde === undefined) && !a.noteFrais) return vide ? <span className="text-sm text-stone-400">{vide}</span> : null;
  return (
    <div className="text-sm">
      {solde !== null && solde !== undefined && (
        <span className={`font-medium ${Number(solde) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
          {Number(solde) < 0 ? `Trop-perçu ${mad(-solde)}` : `Solde ${mad(solde)}`}
        </span>
      )}
      {a.noteFrais && (
        <Link to={`/notes-frais/${a.noteFrais.id}`} className="flex items-center gap-1 text-xs text-zellige-700 hover:underline">
          <Receipt className="h-3 w-3" /> Note {a.noteFrais.numero || `#${a.noteFrais.id}`}
        </Link>
      )}
      {a.regulariseeLe && <span className="block text-xs text-stone-500">le {date(a.regulariseeLe)}</span>}
    </div>
  );
}

/** Demande d'avance sur une de mes missions. */
function ModaleDemande({ ouverte, onFermer, onFait }) {
  const { utilisateur } = useAuth();
  const [missions, setMissions] = useState(null);
  const [erreurChargement, setErreurChargement] = useState(null);
  const [form, setForm] = useState({ missionId: '', montant: '', commentaire: '' });
  const [erreurs, setErreurs] = useState({});
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    if (!ouverte) return;
    setForm({ missionId: '', montant: '', commentaire: '' });
    setErreurs({});
    setMissions(null);
    setErreurChargement(null);
    lire('/missions', { mes: 1, statut: 'EN_ATTENTE,APPROUVE,EN_COURS', limit: 100 })
      .then((l) => setMissions(l.filter((m) => !m.participants || m.participants.some((p) => p.userId === utilisateur?.id))))
      .catch((e) => setErreurChargement(messageErreur(e)));
  }, [ouverte, utilisateur?.id]);

  const mission = missions?.find((m) => String(m.id) === String(form.missionId));

  const envoyer = async (e) => {
    e.preventDefault();
    const err = {};
    if (!form.missionId) err.missionId = 'Choisissez une mission';
    const montant = Number(String(form.montant).replace(',', '.'));
    if (!(montant > 0)) err.montant = 'Montant positif requis';
    setErreurs(err);
    if (Object.keys(err).length) return;
    setEnvoi(true);
    const r = await action(
      () =>
        api.post('/avances', {
          missionId: Number(form.missionId),
          montant,
          ...(form.commentaire.trim() && { commentaire: form.commentaire.trim() }),
        }),
      'Demande d’avance enregistrée'
    );
    setEnvoi(false);
    if (r) {
      onFermer();
      onFait();
    }
  };

  return (
    <Modale
      ouverte={ouverte}
      onFermer={onFermer}
      titre="Demander une avance"
      pied={
        <>
          <button className="btn-secondary" onClick={onFermer}>
            Annuler
          </button>
          <button type="submit" form="form-avance" className="btn-primary" disabled={envoi || !missions?.length}>
            {envoi && <Spinner className="h-4 w-4 text-white" />} Envoyer la demande
          </button>
        </>
      }
    >
      {erreurChargement ? (
        <Erreur message={erreurChargement} />
      ) : !missions ? (
        <Chargement />
      ) : missions.length === 0 ? (
        <Vide titre="Aucune mission éligible" texte="Une avance peut être demandée pour une mission en attente, approuvée ou en cours à laquelle vous participez." />
      ) : (
        <form id="form-avance" onSubmit={envoyer} className="space-y-4" noValidate>
          <Champ label="Mission" requis erreur={erreurs.missionId}>
            <Select
              vide="Choisir une mission…"
              options={missions.map((m) => ({ value: m.id, label: `${m.numero || 'Brouillon'} — ${m.objet} (${date(m.dateDepart)})` }))}
              value={form.missionId}
              onChange={(e) => setForm({ ...form, missionId: e.target.value })}
            />
          </Champ>
          {mission && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-stone-50 p-3 text-xs text-stone-600">
              <StatutMission statut={mission.statut} />
              <span>
                {mission.destination?.ville} · du {date(mission.dateDepart)} au {date(mission.dateRetour)}
              </span>
              {Number(mission.coutEstime) > 0 && <span>· coût estimé {mad(mission.coutEstime)}</span>}
            </div>
          )}
          <Champ label="Montant demandé (MAD)" requis erreur={erreurs.montant}>
            <input type="number" inputMode="decimal" min="0" step="0.01" className="input" value={form.montant} onChange={(e) => setForm({ ...form, montant: e.target.value })} />
          </Champ>
          <Champ label="Commentaire" aide="Justification de la demande (facultatif)">
            <textarea className="input min-h-[70px]" maxLength={1000} value={form.commentaire} onChange={(e) => setForm({ ...form, commentaire: e.target.value })} />
          </Champ>
          <p className="text-xs text-stone-500">L’avance sera versée par le service financier une fois la mission approuvée, puis déduite de votre note de frais.</p>
        </form>
      )}
    </Modale>
  );
}

/** Versement d'une avance demandée (service financier). */
function ModaleVersement({ avance, onFermer, onFait }) {
  const [form, setForm] = useState({});
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    if (avance) setForm({ montant: String(avance.montant), modeVersement: 'VIREMENT', referenceVersement: '', date: versInputDate(new Date()) });
  }, [avance]);

  const missionNonApprouvee = avance && !['APPROUVE', 'EN_COURS'].includes(avance.mission?.statut);
  const montant = Number(String(form.montant || '').replace(',', '.'));

  const verser = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    const r = await action(
      () =>
        api.post(`/avances/${avance.id}/verser`, {
          montant,
          modeVersement: form.modeVersement,
          ...(form.referenceVersement.trim() && { referenceVersement: form.referenceVersement.trim() }),
          ...(form.date && { date: form.date }),
        }),
      'Avance versée'
    );
    setEnvoi(false);
    if (r) onFait();
  };

  return (
    <Modale
      ouverte={!!avance}
      onFermer={onFermer}
      titre="Verser l’avance"
      pied={
        <>
          <button className="btn-secondary" onClick={onFermer}>
            Annuler
          </button>
          <button type="submit" form="form-versement" className="btn-success" disabled={envoi || !(montant > 0) || missionNonApprouvee}>
            {envoi && <Spinner className="h-4 w-4 text-white" />} Confirmer le versement
          </button>
        </>
      }
    >
      {avance && (
        <form id="form-versement" onSubmit={verser} className="space-y-4">
          <div className="rounded-lg bg-stone-50 p-3 text-sm text-stone-700">
            <p>
              <strong>{nomComplet(avance.agent)}</strong> — demande de {mad(avance.montant)} du {date(avance.createdAt)}
            </p>
            <p className="text-xs text-stone-500">
              {avance.mission?.numero} · {avance.mission?.objet}
            </p>
            {avance.commentaire && <p className="mt-1 text-xs italic">« {avance.commentaire} »</p>}
          </div>
          {missionNonApprouvee && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              La mission est « {LIBELLES.statutMission[avance.mission?.statut] || avance.mission?.statut} » : le versement n’est possible qu’une fois la mission approuvée.
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Champ label="Montant versé (MAD)" requis aide="Ajustable par rapport au montant demandé">
              <input type="number" inputMode="decimal" min="0" step="0.01" className="input" value={form.montant || ''} onChange={(e) => setForm({ ...form, montant: e.target.value })} />
            </Champ>
            <Champ label="Mode de versement" requis>
              <Select options={options(MODES_VERSEMENT)} value={form.modeVersement} onChange={(e) => setForm({ ...form, modeVersement: e.target.value })} />
            </Champ>
            <Champ label="Référence" aide="N° de virement, de chèque…">
              <input className="input" maxLength={100} value={form.referenceVersement || ''} onChange={(e) => setForm({ ...form, referenceVersement: e.target.value })} />
            </Champ>
            <Champ label="Date du versement">
              <input type="date" className="input" value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Champ>
          </div>
        </form>
      )}
    </Modale>
  );
}
