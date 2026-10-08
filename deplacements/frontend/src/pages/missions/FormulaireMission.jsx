import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Send, AlertTriangle, X, Calculator } from 'lucide-react';
import api, { lire, messageErreur } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useDonnees, action } from '../../hooks/useDonnees';
import { Carte, Champ, Chargement, EnTete, Erreur, Select, Spinner } from '../../components/ui';
import { LIBELLES, mad, nomComplet, options, versInputDateHeure } from '../../lib/format';

const VIDE = {
  objet: '',
  description: '',
  destinationId: '',
  lieuPrecis: '',
  dateDepart: '',
  dateRetour: '',
  moyenTransport: 'VOITURE_SERVICE',
  vehiculeId: '',
  projetId: '',
  budgetId: '',
  participantIds: [],
  chefMissionId: '',
  nbRepasFournis: 0,
  hebergementPrisEnCharge: false,
  fraisTransportEstimes: 0,
  autresFraisEstimes: 0,
};

const nombreOuNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

/** Sélection des personnes concernées avec recherche. */
function Participants({ annuaire, valeur, onChange, chef, onChef }) {
  const [q, setQ] = useState('');
  const choisis = annuaire.filter((u) => valeur.includes(u.id));
  const proposes = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return annuaire.filter((u) => !valeur.includes(u.id) && `${u.prenom} ${u.nom} ${u.matricule} ${u.service?.nom || ''}`.toLowerCase().includes(t)).slice(0, 8);
  }, [q, annuaire, valeur]);

  return (
    <div>
      <ul className="mb-2 space-y-1.5">
        {choisis.map((u) => (
          <li key={u.id} className="flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium text-stone-900">{nomComplet(u)}</span>
              <span className="text-stone-500"> · {u.fonction?.libelle || u.service?.nom}</span>
            </span>
            {valeur.length > 1 && (
              <label className="flex shrink-0 items-center gap-1 text-xs text-stone-600">
                <input type="radio" name="chef" checked={chef === u.id} onChange={() => onChef(u.id)} /> Chef
              </label>
            )}
            <button type="button" className="text-stone-400 hover:text-red-600" onClick={() => onChange(valeur.filter((id) => id !== u.id))} aria-label={`Retirer ${nomComplet(u)}`}>
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <div className="relative">
        <input className="input" placeholder="Ajouter une personne (nom, matricule, service)…" value={q} onChange={(e) => setQ(e.target.value)} />
        {proposes.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-stone-200 bg-white shadow-lg">
            {proposes.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50"
                  onClick={() => {
                    onChange([...valeur, u.id]);
                    setQ('');
                  }}
                >
                  {nomComplet(u)} <span className="text-stone-500">· {u.matricule} · {u.service?.nom}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function FormulaireMission() {
  const { id } = useParams();
  const edition = Boolean(id);
  const { utilisateur, peut } = useAuth();
  const navigate = useNavigate();
  const [f, setF] = useState({ ...VIDE, participantIds: [utilisateur.id] });
  const [envoi, setEnvoi] = useState(false);
  const [estimation, setEstimation] = useState(null);
  const [calcul, setCalcul] = useState(false);
  const [vehicules, setVehicules] = useState([]);

  const { donnees: ref, chargement, erreur } = useDonnees(async () => {
    const [destinations, annuaire, projets, budgets, mission] = await Promise.all([
      lire('/referentiels/destinations'),
      lire('/utilisateurs/annuaire'),
      lire('/referentiels/projets'),
      peut('budget:lire') ? lire('/budgets', { annee: new Date().getFullYear() }) : [],
      edition ? lire(`/missions/${id}`) : null,
    ]);
    if (mission) {
      if (!mission.droits.modifier) {
        navigate(`/missions/${id}`, { replace: true });
        return null;
      }
      setF({
        ...VIDE,
        ...Object.fromEntries(Object.keys(VIDE).map((k) => [k, mission[k] ?? VIDE[k]])),
        dateDepart: versInputDateHeure(mission.dateDepart),
        dateRetour: versInputDateHeure(mission.dateRetour),
        participantIds: mission.participants.map((p) => p.userId),
        chefMissionId: mission.participants.find((p) => p.chefMission)?.userId ?? '',
      });
    }
    return { destinations: destinations.filter((d) => d.actif), annuaire, projets: projets.filter((p) => p.actif), budgets };
  }, [id]);

  const set = (champ) => (e) => setF((x) => ({ ...x, [champ]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));

  const datesValides = f.dateDepart && f.dateRetour && new Date(f.dateRetour) > new Date(f.dateDepart);

  // Estimation en direct des indemnités et des conflits de calendrier.
  useEffect(() => {
    if (!f.destinationId || !datesValides || !f.participantIds.length) {
      setEstimation(null);
      return undefined;
    }
    const t = setTimeout(async () => {
      setCalcul(true);
      try {
        const r = await api.post(
          '/missions/estimation',
          {
            destinationId: Number(f.destinationId),
            dateDepart: new Date(f.dateDepart).toISOString(),
            dateRetour: new Date(f.dateRetour).toISOString(),
            participantIds: f.participantIds,
            nbRepasFournis: Number(f.nbRepasFournis || 0),
            fraisTransportEstimes: Number(f.fraisTransportEstimes || 0),
            autresFraisEstimes: Number(f.autresFraisEstimes || 0),
          },
          { params: { missionId: id, vehiculeId: f.vehiculeId || undefined } }
        );
        setEstimation(r.data.data);
      } catch (e) {
        setEstimation({ erreur: messageErreur(e) });
      } finally {
        setCalcul(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [f.destinationId, f.dateDepart, f.dateRetour, f.participantIds, f.nbRepasFournis, f.fraisTransportEstimes, f.autresFraisEstimes, f.vehiculeId, id, datesValides]);

  // Véhicules libres sur la période.
  useEffect(() => {
    if (f.moyenTransport !== 'VOITURE_SERVICE' || !datesValides) return;
    lire('/vehicules/disponibles', { du: new Date(f.dateDepart).toISOString(), au: new Date(f.dateRetour).toISOString(), missionId: id })
      .then(setVehicules)
      .catch(() => setVehicules([]));
  }, [f.moyenTransport, f.dateDepart, f.dateRetour, id, datesValides]);

  if (chargement || !ref) return <Chargement />;
  if (erreur) return <Erreur message={erreur} />;

  const corps = () => ({
    objet: f.objet.trim(),
    description: f.description?.trim() || null,
    destinationId: Number(f.destinationId),
    lieuPrecis: f.lieuPrecis?.trim() || null,
    dateDepart: new Date(f.dateDepart).toISOString(),
    dateRetour: new Date(f.dateRetour).toISOString(),
    moyenTransport: f.moyenTransport,
    vehiculeId: f.moyenTransport === 'VOITURE_SERVICE' ? nombreOuNull(f.vehiculeId) : null,
    projetId: nombreOuNull(f.projetId),
    ...(peut('budget:lire') && { budgetId: nombreOuNull(f.budgetId) }),
    participantIds: f.participantIds,
    chefMissionId: nombreOuNull(f.chefMissionId),
    nbRepasFournis: Number(f.nbRepasFournis || 0),
    hebergementPrisEnCharge: Boolean(f.hebergementPrisEnCharge),
    fraisTransportEstimes: Number(f.fraisTransportEstimes || 0),
    autresFraisEstimes: Number(f.autresFraisEstimes || 0),
  });

  const enregistrer = async (soumettre) => {
    if (!datesValides) return action(() => Promise.reject(new Error('La date de retour doit suivre la date de départ')));
    setEnvoi(true);
    try {
      const r = await action(() => (edition ? api.put(`/missions/${id}`, corps()) : api.post('/missions', corps())), soumettre ? null : 'Brouillon enregistré');
      if (!r) return;
      const mid = r.data.data.id;
      if (soumettre) await action(() => api.post(`/missions/${mid}/soumettre`), (x) => x.data.message);
      navigate(`/missions/${mid}`);
    } finally {
      setEnvoi(false);
    }
  };

  const parZone = ref.destinations.reduce((acc, d) => {
    (acc[d.zone.libelle] ||= []).push(d);
    return acc;
  }, {});
  const conflits = estimation?.conflits || [];
  const nomUser = (uid) => nomComplet(ref.annuaire.find((u) => u.id === uid));

  return (
    <>
      <EnTete
        titre={edition ? 'Modifier la mission' : 'Nouvelle demande de mission'}
        retour={
          <Link to={edition ? `/missions/${id}` : '/missions'} className="mb-1 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800">
            <ArrowLeft className="h-4 w-4" /> Retour
          </Link>
        }
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          enregistrer(false);
        }}
        className="grid gap-5 lg:grid-cols-3"
      >
        <div className="space-y-5 lg:col-span-2">
          <Carte titre="Objet et destination">
            <div className="grid gap-4 sm:grid-cols-2">
              <Champ label="Objet de la mission" requis className="sm:col-span-2">
                <input className="input" required minLength={3} maxLength={300} value={f.objet} onChange={set('objet')} placeholder="Ex. Participation au Salon national de l'artisanat" />
              </Champ>
              <Champ label="Destination" requis>
                <select className="input" required value={f.destinationId} onChange={set('destinationId')}>
                  <option value="">Choisir…</option>
                  {Object.entries(parZone).map(([zone, ds]) => (
                    <optgroup key={zone} label={zone}>
                      {ds.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.ville}
                          {d.pays !== 'Maroc' ? ` (${d.pays})` : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </Champ>
              <Champ label="Lieu précis" aide="Adresse, organisme, salle…">
                <input className="input" value={f.lieuPrecis || ''} onChange={set('lieuPrecis')} />
              </Champ>
              <Champ label="Description / programme" className="sm:col-span-2">
                <textarea className="input min-h-[90px]" value={f.description || ''} onChange={set('description')} />
              </Champ>
            </div>
          </Carte>

          <Carte titre="Dates et transport">
            <div className="grid gap-4 sm:grid-cols-2">
              <Champ label="Départ" requis>
                <input type="datetime-local" className="input" required value={f.dateDepart} onChange={set('dateDepart')} />
              </Champ>
              <Champ label="Retour" requis erreur={f.dateDepart && f.dateRetour && !datesValides ? 'Le retour doit suivre le départ' : null}>
                <input type="datetime-local" className="input" required min={f.dateDepart} value={f.dateRetour} onChange={set('dateRetour')} />
              </Champ>
              <Champ label="Moyen de transport" requis>
                <Select options={options(LIBELLES.moyenTransport)} value={f.moyenTransport} onChange={set('moyenTransport')} />
              </Champ>
              {f.moyenTransport === 'VOITURE_SERVICE' && (
                <Champ label="Véhicule de service" aide={datesValides ? `${vehicules.length} véhicule(s) libre(s) sur la période` : 'Renseignez les dates pour voir les véhicules libres'}>
                  <Select
                    vide="À affecter plus tard"
                    options={vehicules.map((v) => ({ value: v.id, label: `${v.marque} ${v.modele} — ${v.immatriculation}` }))}
                    value={f.vehiculeId}
                    onChange={set('vehiculeId')}
                  />
                </Champ>
              )}
              <Champ label="Transport estimé (MAD)" aide="Billets, carburant, péages…">
                <input type="number" min="0" step="0.01" className="input" value={f.fraisTransportEstimes} onChange={set('fraisTransportEstimes')} />
              </Champ>
              <Champ label="Autres frais estimés (MAD)">
                <input type="number" min="0" step="0.01" className="input" value={f.autresFraisEstimes} onChange={set('autresFraisEstimes')} />
              </Champ>
            </div>
          </Carte>

          <Carte titre="Personnes concernées">
            <Participants
              annuaire={ref.annuaire}
              valeur={f.participantIds}
              onChange={(ids) => setF((x) => ({ ...x, participantIds: ids, chefMissionId: ids.includes(Number(x.chefMissionId)) ? x.chefMissionId : '' }))}
              chef={Number(f.chefMissionId)}
              onChef={(uid) => setF((x) => ({ ...x, chefMissionId: uid }))}
            />
          </Carte>

          <Carte titre="Prise en charge et imputation">
            <div className="grid gap-4 sm:grid-cols-2">
              <Champ label="Repas fournis par l'organisateur" aide="Déduits des indemnités au taux repas du barème">
                <input type="number" min="0" className="input" value={f.nbRepasFournis} onChange={set('nbRepasFournis')} />
              </Champ>
              <label className="flex items-start gap-2 text-sm text-stone-700 sm:pt-7">
                <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-stone-300 text-brand-600" checked={f.hebergementPrisEnCharge} onChange={set('hebergementPrisEnCharge')} />
                Hébergement pris en charge (organisateur ou réservation directe) : aucune nuitée remboursée à l'agent
              </label>
              <Champ label="Projet">
                <Select vide="Aucun" options={ref.projets.map((p) => ({ value: p.id, label: `${p.code} — ${p.libelle}` }))} value={f.projetId} onChange={set('projetId')} />
              </Champ>
              {peut('budget:lire') && (
                <Champ label="Budget imputé" aide="Par défaut : budget du projet, sinon du service, sinon global">
                  <Select vide="Automatique" options={ref.budgets.map((b) => ({ value: b.id, label: b.libelle }))} value={f.budgetId} onChange={set('budgetId')} />
                </Champ>
              )}
            </div>
          </Carte>
        </div>

        <div className="space-y-5">
          <div className="lg:sticky lg:top-20 space-y-5">
            <Carte titre={<span className="inline-flex items-center gap-2"><Calculator className="h-4 w-4" /> Estimation</span>} actions={calcul && <Spinner className="h-4 w-4" />}>
              {!estimation ? (
                <p className="text-sm text-stone-500">Choisissez la destination et les dates pour calculer les indemnités selon le barème.</p>
              ) : estimation.erreur ? (
                <p className="text-sm text-red-600">{estimation.erreur}</p>
              ) : (
                <div className="space-y-3 text-sm">
                  <p className="text-xs text-stone-500">
                    Zone : {estimation.estimation.zone.libelle} · {estimation.estimation.nuits} nuit(s)
                  </p>
                  <ul className="space-y-2">
                    {estimation.estimation.detail.map((d) => (
                      <li key={d.userId} className="rounded-lg bg-stone-50 p-2.5">
                        <p className="font-medium text-stone-800">{d.nom}</p>
                        {d.sansBareme ? (
                          <p className="text-xs text-amber-700">Aucun barème pour sa catégorie — à compléter par l'administrateur</p>
                        ) : (
                          <p className="text-xs text-stone-600">
                            {String(d.jours).replace('.', ',')} j × {mad(d.tauxJournalier)} = {mad(d.indemnites)}
                            <br />
                            Hébergement (plafond) : {mad(d.hebergement)}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                  <div className="flex justify-between border-t border-stone-100 pt-2">
                    <span className="text-stone-600">Transport + autres</span>
                    <span>{mad(estimation.estimation.transport + estimation.estimation.autres)}</span>
                  </div>
                  <div className="flex justify-between text-base font-semibold text-stone-900">
                    <span>Coût estimé</span>
                    <span>{mad(estimation.estimation.total)}</span>
                  </div>
                </div>
              )}
            </Carte>

            {conflits.length > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <p className="mb-2 flex items-center gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4" /> Conflits de calendrier
                </p>
                <ul className="list-inside list-disc space-y-1">
                  {conflits.map((c, i) => (
                    <li key={i}>
                      {c.type === 'PARTICIPANT' ? `${nomUser(c.userId)} est déjà en mission` : 'Le véhicule est déjà affecté'} (
                      <Link className="underline" to={`/missions/${c.missionId}`}>
                        {c.numero || `#${c.missionId}`}
                      </Link>
                      )
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs">La soumission sera refusée tant que le conflit persiste.</p>
              </div>
            )}

            <div className="card flex flex-col gap-2 p-4">
              <button type="submit" className="btn-secondary" disabled={envoi}>
                <Save className="h-4 w-4" /> Enregistrer le brouillon
              </button>
              <button type="button" className="btn-primary" disabled={envoi || conflits.length > 0} onClick={() => enregistrer(true)}>
                {envoi ? <Spinner className="h-4 w-4 text-white" /> : <Send className="h-4 w-4" />} Enregistrer et soumettre
              </button>
              <p className="text-xs text-stone-500">La demande suivra le circuit de validation de votre service.</p>
            </div>
          </div>
        </div>
      </form>
    </>
  );
}
