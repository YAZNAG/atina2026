import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Coins, Fuel, Gauge, Pencil, Route, Wrench } from 'lucide-react';
import { lire, lirePage } from '../../api/client';
import { useDonnees } from '../../hooks/useDonnees';
import { useAuth } from '../../context/AuthContext';
import { Carte, Chargement, EnTete, Erreur, Indicateur, Info, Onglets, StatutVehicule } from '../../components/ui';
import { mad, nombre } from '../../lib/format';
import { Echeance, FormulaireVehicule } from './commun';
import { OngletCarburant, OngletCarnet, OngletEntretien, OngletMissions } from './OngletsVehicule';

const STATUTS_EXCLUS = ['BROUILLON', 'REFUSE', 'ANNULE'];

export default function DetailVehicule() {
  const { id } = useParams();
  const { peut, utilisateur } = useAuth();
  const gerer = peut('vehicule:gerer');
  const [onglet, setOnglet] = useState('carnet');
  const [edition, setEdition] = useState(false);

  const vehicule = useDonnees(() => lire(`/vehicules/${id}`), [id]);
  const stats = useDonnees(() => lire(`/vehicules/${id}/statistiques`), [id]);
  const missions = useDonnees(() => {
    const du = new Date();
    du.setMonth(du.getMonth() - 6);
    const au = new Date();
    au.setMonth(au.getMonth() + 6);
    return lire('/missions/calendrier', { vehiculeId: id, du: du.toISOString(), au: au.toISOString() });
  }, [id]);
  // Missions de l'agent avec ce véhicule (pour la saisie du carnet de bord sans droit de gestion).
  const mesMissions = useDonnees(
    () => (gerer || !peut('carnet:saisir') ? Promise.resolve([]) : lirePage('/missions', { mes: 1, limit: 200 }).then((r) => r.data)),
    [id, gerer]
  );
  const mesMissionsVehicule = useMemo(
    () =>
      (mesMissions.donnees || []).filter(
        (m) => m.vehiculeId === Number(id) && !STATUTS_EXCLUS.includes(m.statut) && (m.participants || []).some((p) => p.userId === utilisateur?.id)
      ),
    [mesMissions.donnees, id, utilisateur]
  );

  const actualiser = () => {
    vehicule.recharger();
    stats.recharger();
  };

  if (vehicule.chargement && !vehicule.donnees) return <Chargement />;
  if (vehicule.erreur) return <Erreur message={vehicule.erreur} onRetry={vehicule.recharger} />;
  const v = vehicule.donnees;
  const s = stats.donnees;
  const missionsVehicule = missions.donnees || [];
  const peutCarnet = peut('carnet:saisir') && (gerer || mesMissionsVehicule.length > 0);

  return (
    <div>
      <EnTete
        retour={
          <Link to="/parc" className="mb-1 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800">
            <ArrowLeft className="h-4 w-4" /> Parc automobile
          </Link>
        }
        titre={
          <span className="inline-flex flex-wrap items-center gap-3">
            <span className="font-mono">{v.immatriculation}</span> <StatutVehicule statut={v.statut} />
          </span>
        }
        sousTitre={`${v.marque} ${v.modele}`}
        actions={
          gerer && (
            <button className="btn-secondary" onClick={() => setEdition(true)}>
              <Pencil className="h-4 w-4" /> Modifier
            </button>
          )
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Carte titre="Fiche du véhicule" className="lg:col-span-1">
          <dl className="grid grid-cols-2 gap-4">
            <Info libelle="Carburant">{v.carburant}</Info>
            <Info libelle="Places">{v.nbPlaces}</Info>
            <Info libelle="Kilométrage">{nombre(v.kilometrage)} km</Info>
            <Info libelle="Statut">
              <StatutVehicule statut={v.statut} />
            </Info>
          </dl>
          <div className="mt-4 space-y-1.5 border-t border-stone-100 pt-3">
            <Echeance libelle="Assurance" valeur={v.dateAssurance} />
            <Echeance libelle="Visite technique" valeur={v.dateVisiteTechnique} />
          </div>
        </Carte>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:col-span-2">
          {stats.erreur ? (
            <div className="col-span-full">
              <Erreur message={stats.erreur} onRetry={stats.recharger} />
            </div>
          ) : (
            <>
              <Indicateur libelle="Km parcourus" valeur={s ? `${nombre(s.kmParcourus)} km` : '…'} detail="Selon le carnet de bord" icone={Route} ton="bleu" />
              <Indicateur libelle="Carburant" valeur={s ? `${nombre(s.litres, 2)} L` : '…'} detail="Total des pleins" icone={Fuel} />
              <Indicateur
                libelle="Consommation"
                valeur={s ? (s.consommationL100 != null ? `${nombre(s.consommationL100, 2)} L/100` : '—') : '…'}
                detail="Litres / km parcourus"
                icone={Gauge}
                ton="vert"
              />
              <Indicateur libelle="Coût carburant" valeur={s ? mad(s.coutCarburant) : '…'} icone={Fuel} ton="orange" />
              <Indicateur libelle="Coût entretien" valeur={s ? mad(s.coutEntretien) : '…'} icone={Wrench} ton="orange" />
              <Indicateur libelle="Coût par km" valeur={s ? (s.coutParKm != null ? mad(s.coutParKm) : '—') : '…'} detail="Carburant + entretien" icone={Coins} />
            </>
          )}
        </div>
      </div>

      <Onglets
        actif={onglet}
        onChange={setOnglet}
        onglets={[
          { id: 'carnet', label: 'Carnet de bord' },
          { id: 'carburant', label: 'Carburant' },
          { id: 'entretien', label: 'Entretien' },
          { id: 'missions', label: 'Missions', compteur: missionsVehicule.length },
        ]}
      />
      <div className="card overflow-hidden">
        {onglet === 'carnet' && (
          <OngletCarnet
            vehicule={v}
            missions={gerer ? missionsVehicule : mesMissionsVehicule}
            peutSaisir={peutCarnet}
            missionObligatoire={!gerer}
            onAjout={actualiser}
          />
        )}
        {onglet === 'carburant' && <OngletCarburant vehicule={v} missions={missionsVehicule} peutSaisir={gerer} onAjout={actualiser} />}
        {onglet === 'entretien' && <OngletEntretien vehicule={v} peutSaisir={gerer} onAjout={actualiser} />}
        {onglet === 'missions' && <OngletMissions etat={missions} />}
      </div>

      <FormulaireVehicule
        ouverte={edition}
        vehicule={v}
        onFermer={() => setEdition(false)}
        onEnregistre={() => {
          setEdition(false);
          actualiser();
        }}
      />
    </div>
  );
}
