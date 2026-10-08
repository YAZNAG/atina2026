import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import api from '../../api/client';
import { action } from '../../hooks/useDonnees';
import { Champ, Modale, Select, Spinner } from '../../components/ui';
import { LIBELLES, date, options, versInputDate } from '../../lib/format';

/** Nombre de jours restants avant une échéance (négatif si dépassée). */
export function joursRestants(d) {
  if (!d) return null;
  const auj = new Date();
  auj.setHours(0, 0, 0, 0);
  const e = new Date(d);
  e.setHours(0, 0, 0, 0);
  return Math.round((e - auj) / 86400000);
}

/** Niveau d'alerte d'une échéance : 'depassee', 'proche' (< 30 jours) ou null. */
export function alerteEcheance(d) {
  const j = joursRestants(d);
  if (j === null) return null;
  if (j < 0) return 'depassee';
  if (j < 30) return 'proche';
  return null;
}

/** Échéance (assurance, visite technique) avec mise en évidence si proche ou dépassée. */
export function Echeance({ libelle, valeur }) {
  const niveau = alerteEcheance(valeur);
  const j = joursRestants(valeur);
  const ton = niveau === 'depassee' ? 'text-red-700' : niveau === 'proche' ? 'text-amber-700' : 'text-stone-800';
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-stone-500">{libelle}</span>
      <span className={`inline-flex items-center gap-1 font-medium ${ton}`}>
        {niveau && <AlertTriangle className="h-3.5 w-3.5" />}
        {valeur ? date(valeur) : 'Non renseignée'}
        {niveau === 'depassee' && <span className="text-xs font-normal">(dépassée)</span>}
        {niveau === 'proche' && <span className="text-xs font-normal">(dans {j} j)</span>}
      </span>
    </div>
  );
}

const CARBURANTS = ['Diesel', 'Essence', 'Hybride', 'Électrique', 'GPL'];
const VIDE = {
  immatriculation: '',
  marque: '',
  modele: '',
  carburant: 'Diesel',
  nbPlaces: 5,
  kilometrage: 0,
  statut: 'DISPONIBLE',
  dateAssurance: '',
  dateVisiteTechnique: '',
};

/** Création / modification d'un véhicule (champs du schéma zod de l'API). */
export function FormulaireVehicule({ ouverte, vehicule, onFermer, onEnregistre }) {
  const [f, setF] = useState(VIDE);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    if (!ouverte) return;
    setF(
      vehicule
        ? {
            immatriculation: vehicule.immatriculation,
            marque: vehicule.marque,
            modele: vehicule.modele,
            carburant: vehicule.carburant || 'Diesel',
            nbPlaces: vehicule.nbPlaces,
            kilometrage: vehicule.kilometrage,
            statut: vehicule.statut,
            dateAssurance: versInputDate(vehicule.dateAssurance),
            dateVisiteTechnique: versInputDate(vehicule.dateVisiteTechnique),
          }
        : VIDE
    );
  }, [ouverte, vehicule]);

  const maj = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const enregistrer = async (e) => {
    e.preventDefault();
    const corps = {
      immatriculation: f.immatriculation.trim(),
      marque: f.marque.trim(),
      modele: f.modele.trim(),
      carburant: f.carburant,
      nbPlaces: Number(f.nbPlaces),
      kilometrage: Number(f.kilometrage),
      statut: f.statut,
      dateAssurance: f.dateAssurance || null,
      dateVisiteTechnique: f.dateVisiteTechnique || null,
    };
    setEnvoi(true);
    const r = await action(
      () => (vehicule ? api.put(`/vehicules/${vehicule.id}`, corps) : api.post('/vehicules', corps)),
      vehicule ? 'Véhicule modifié' : 'Véhicule ajouté'
    );
    setEnvoi(false);
    if (r) onEnregistre?.(r.data.data);
  };

  const carburants = CARBURANTS.includes(f.carburant) || !f.carburant ? CARBURANTS : [...CARBURANTS, f.carburant];

  return (
    <Modale
      ouverte={ouverte}
      onFermer={onFermer}
      titre={vehicule ? `Modifier ${vehicule.immatriculation}` : 'Nouveau véhicule'}
      pied={
        <>
          <button className="btn-secondary" onClick={onFermer}>
            Annuler
          </button>
          <button className="btn-primary" type="submit" form="form-vehicule" disabled={envoi}>
            {envoi && <Spinner className="h-4 w-4 text-white" />} Enregistrer
          </button>
        </>
      }
    >
      <form id="form-vehicule" onSubmit={enregistrer} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Champ label="Immatriculation" requis className="sm:col-span-2">
          <input className="input" value={f.immatriculation} onChange={maj('immatriculation')} required maxLength={30} placeholder="12345-A-33" />
        </Champ>
        <Champ label="Marque" requis>
          <input className="input" value={f.marque} onChange={maj('marque')} required maxLength={60} />
        </Champ>
        <Champ label="Modèle" requis>
          <input className="input" value={f.modele} onChange={maj('modele')} required maxLength={60} />
        </Champ>
        <Champ label="Carburant">
          <Select value={f.carburant} onChange={maj('carburant')} options={carburants.map((c) => ({ value: c, label: c }))} />
        </Champ>
        <Champ label="Nombre de places">
          <input className="input" type="number" min={1} max={60} value={f.nbPlaces} onChange={maj('nbPlaces')} required />
        </Champ>
        <Champ label="Kilométrage">
          <input className="input" type="number" min={0} value={f.kilometrage} onChange={maj('kilometrage')} required />
        </Champ>
        <Champ label="Statut">
          <Select value={f.statut} onChange={maj('statut')} options={options(LIBELLES.statutVehicule)} />
        </Champ>
        <Champ label="Échéance assurance">
          <input className="input" type="date" value={f.dateAssurance} onChange={maj('dateAssurance')} />
        </Champ>
        <Champ label="Échéance visite technique">
          <input className="input" type="date" value={f.dateVisiteTechnique} onChange={maj('dateVisiteTechnique')} />
        </Champ>
      </form>
    </Modale>
  );
}
