import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarCheck, Car, CheckCircle2, Fuel, Gauge, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import api, { lire, messageErreur } from '../../api/client';
import { action, useDonnees } from '../../hooks/useDonnees';
import { useAuth } from '../../context/AuthContext';
import { Champ, Chargement, Confirmation, EnTete, Erreur, Indicateur, Modale, Select, Spinner, StatutVehicule, Vide } from '../../components/ui';
import { LIBELLES, dateHeure, nombre, options, versInputDateHeure } from '../../lib/format';
import { Echeance, FormulaireVehicule, alerteEcheance } from './commun';

export default function Parc() {
  const { peut } = useAuth();
  const gerer = peut('vehicule:gerer');
  const { donnees, chargement, erreur, recharger } = useDonnees(() => lire('/vehicules'), []);
  const [q, setQ] = useState('');
  const [statut, setStatut] = useState('');
  const [edition, setEdition] = useState(null); // null | {} (nouveau) | véhicule
  const [suppression, setSuppression] = useState(null);
  const [dispo, setDispo] = useState(false);

  const vehicules = donnees || [];
  const filtres = useMemo(() => {
    const t = q.trim().toLowerCase();
    return vehicules.filter(
      (v) => (!statut || v.statut === statut) && (!t || `${v.immatriculation} ${v.marque} ${v.modele}`.toLowerCase().includes(t))
    );
  }, [vehicules, q, statut]);

  const nbAlertes = vehicules.filter((v) => alerteEcheance(v.dateAssurance) || alerteEcheance(v.dateVisiteTechnique)).length;

  const supprimer = async () => {
    const r = await action(() => api.delete(`/vehicules/${suppression.id}`), 'Véhicule supprimé');
    setSuppression(null);
    if (r) recharger();
  };

  return (
    <div>
      <EnTete
        titre="Parc automobile"
        sousTitre="Véhicules de service, échéances et disponibilités"
        actions={
          <>
            <button className="btn-secondary" onClick={() => setDispo(true)}>
              <CalendarCheck className="h-4 w-4" /> Disponibilités
            </button>
            {gerer && (
              <button className="btn-primary" onClick={() => setEdition({})}>
                <Plus className="h-4 w-4" /> Nouveau véhicule
              </button>
            )}
          </>
        }
      />

      {chargement && !donnees ? (
        <Chargement />
      ) : erreur ? (
        <Erreur message={erreur} onRetry={recharger} />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Indicateur libelle="Véhicules" valeur={vehicules.length} icone={Car} />
            <Indicateur libelle="Disponibles" valeur={vehicules.filter((v) => v.statut === 'DISPONIBLE').length} icone={CheckCircle2} ton="vert" />
            <Indicateur libelle="En mission" valeur={vehicules.filter((v) => v.statut === 'EN_MISSION').length} icone={Users} ton="bleu" />
            <Indicateur libelle="Échéances à surveiller" valeur={nbAlertes} detail="Assurance ou visite < 30 jours" icone={AlertTriangle} ton="orange" />
          </div>

          <div className="card mb-4 grid grid-cols-1 gap-2 p-3 sm:grid-cols-[1fr_14rem]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
              <input className="input pl-9" placeholder="Immatriculation, marque, modèle…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" />
            </div>
            <Select aria-label="Filtrer par statut" vide="Tous les statuts" value={statut} onChange={(e) => setStatut(e.target.value)} options={options(LIBELLES.statutVehicule)} />
          </div>

          {filtres.length === 0 ? (
            <div className="card">
              <Vide
                titre={vehicules.length ? 'Aucun véhicule ne correspond' : 'Aucun véhicule'}
                texte={vehicules.length ? 'Modifiez la recherche ou le filtre.' : 'Le parc ne contient encore aucun véhicule.'}
                action={
                  gerer && !vehicules.length ? (
                    <button className="btn-primary" onClick={() => setEdition({})}>
                      <Plus className="h-4 w-4" /> Ajouter un véhicule
                    </button>
                  ) : null
                }
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtres.map((v) => (
                <CarteVehicule
                  key={v.id}
                  v={v}
                  gerer={gerer}
                  onModifier={() => setEdition(v)}
                  onSupprimer={() => setSuppression(v)}
                />
              ))}
            </div>
          )}
        </>
      )}

      <FormulaireVehicule
        ouverte={!!edition}
        vehicule={edition?.id ? edition : null}
        onFermer={() => setEdition(null)}
        onEnregistre={() => {
          setEdition(null);
          recharger();
        }}
      />
      <Confirmation
        ouverte={!!suppression}
        titre="Supprimer le véhicule"
        message={
          suppression &&
          `Supprimer définitivement ${suppression.immatriculation} (${suppression.marque} ${suppression.modele}) ? Son carnet de bord, ses pleins et ses entretiens seront également supprimés. Un véhicule affecté à des missions ne peut pas être supprimé : passez-le plutôt « Hors service ».`
        }
        libelleOk="Supprimer"
        ton="danger"
        onAnnuler={() => setSuppression(null)}
        onConfirmer={supprimer}
      />
      <Disponibilites ouverte={dispo} onFermer={() => setDispo(false)} />
    </div>
  );
}

function CarteVehicule({ v, gerer, onModifier, onSupprimer }) {
  const alerte = alerteEcheance(v.dateAssurance) || alerteEcheance(v.dateVisiteTechnique);
  return (
    <article className={`card flex flex-col ${alerte === 'depassee' ? 'border-red-300' : alerte === 'proche' ? 'border-amber-300' : ''}`}>
      <Link to={`/parc/${v.id}`} className="flex-1 rounded-t-xl p-4 hover:bg-stone-50">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-mono text-lg font-semibold text-stone-900">{v.immatriculation}</p>
            <p className="truncate text-sm text-stone-600">
              {v.marque} {v.modele}
            </p>
          </div>
          <StatutVehicule statut={v.statut} />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-600">
          <span className="inline-flex items-center gap-1">
            <Fuel className="h-4 w-4 text-stone-400" /> {v.carburant}
          </span>
          <span className="inline-flex items-center gap-1">
            <Gauge className="h-4 w-4 text-stone-400" /> {nombre(v.kilometrage)} km
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="h-4 w-4 text-stone-400" /> {v.nbPlaces} places
          </span>
        </div>
        <div className="mt-3 space-y-1 border-t border-stone-100 pt-3">
          <Echeance libelle="Assurance" valeur={v.dateAssurance} />
          <Echeance libelle="Visite technique" valeur={v.dateVisiteTechnique} />
        </div>
      </Link>
      {gerer && (
        <div className="flex justify-end gap-1 border-t border-stone-100 px-3 py-2">
          <button className="btn-ghost btn-sm" onClick={onModifier}>
            <Pencil className="h-3.5 w-3.5" /> Modifier
          </button>
          <button className="btn-ghost btn-sm text-red-600 hover:bg-red-50" onClick={onSupprimer}>
            <Trash2 className="h-3.5 w-3.5" /> Supprimer
          </button>
        </div>
      )}
    </article>
  );
}

/** Recherche des véhicules libres sur une période. */
function Disponibilites({ ouverte, onFermer }) {
  const defaut = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(8, 0, 0, 0);
    const f = new Date(d);
    f.setHours(18, 0, 0, 0);
    return { du: versInputDateHeure(d), au: versInputDateHeure(f) };
  };
  const [periode, setPeriode] = useState(defaut);
  const [resultat, setResultat] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);

  const rechercher = async (e) => {
    e.preventDefault();
    if (new Date(periode.au) <= new Date(periode.du)) {
      setErreur('La fin de période doit être postérieure au début.');
      return;
    }
    setEnvoi(true);
    setErreur(null);
    try {
      setResultat(await lire('/vehicules/disponibles', { du: new Date(periode.du).toISOString(), au: new Date(periode.au).toISOString() }));
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Modale ouverte={ouverte} onFermer={onFermer} titre="Disponibilités des véhicules">
      <form onSubmit={rechercher} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Champ label="Du" requis>
          <input className="input" type="datetime-local" value={periode.du} onChange={(e) => setPeriode((p) => ({ ...p, du: e.target.value }))} required />
        </Champ>
        <Champ label="Au" requis>
          <input className="input" type="datetime-local" value={periode.au} onChange={(e) => setPeriode((p) => ({ ...p, au: e.target.value }))} required />
        </Champ>
        <div className="sm:col-span-2">
          <button className="btn-primary w-full sm:w-auto" type="submit" disabled={envoi}>
            {envoi ? <Spinner className="h-4 w-4 text-white" /> : <Search className="h-4 w-4" />} Rechercher
          </button>
        </div>
      </form>
      {erreur && <p className="mt-3 text-sm text-red-600">{erreur}</p>}
      {resultat && (
        <div className="mt-4 border-t border-stone-100 pt-3">
          <p className="mb-2 text-sm text-stone-600">
            {resultat.length
              ? `${resultat.length} véhicule${resultat.length > 1 ? 's' : ''} libre${resultat.length > 1 ? 's' : ''} du ${dateHeure(periode.du)} au ${dateHeure(periode.au)} :`
              : 'Aucun véhicule libre sur cette période.'}
          </p>
          <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
            {resultat.map((v) => (
              <li key={v.id}>
                <Link to={`/parc/${v.id}`} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-stone-50" onClick={onFermer}>
                  <span className="min-w-0">
                    <span className="font-mono font-medium text-stone-900">{v.immatriculation}</span>
                    <span className="ml-2 text-sm text-stone-600">
                      {v.marque} {v.modele} · {v.nbPlaces} places
                    </span>
                  </span>
                  <StatutVehicule statut={v.statut} />
                </Link>
              </li>
            ))}
          </ul>
          {resultat.length > 0 && (
            <p className="mt-2 text-xs text-stone-500">Véhicules hors entretien / hors service et sans mission active sur la période.</p>
          )}
        </div>
      )}
    </Modale>
  );
}
