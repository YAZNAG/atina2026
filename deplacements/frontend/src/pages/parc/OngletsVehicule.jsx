import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import api, { lire } from '../../api/client';
import { action, useDonnees } from '../../hooks/useDonnees';
import { Champ, Chargement, Erreur, Modale, Select, Spinner, StatutMission, Tableau, Vide } from '../../components/ui';
import { date, dateHeure, mad, nombre, nomComplet, versInputDate } from '../../lib/format';

const aujourdhui = () => versInputDate(new Date());
const libelleMission = (m) => `${m.numero || `#${m.id}`} — ${m.destination?.ville || ''} (${date(m.dateDepart)})`;
const optionsMissions = (missions) => missions.map((m) => ({ value: m.id, label: libelleMission(m) }));
const nulSiVide = (v) => (v === '' || v === undefined ? null : v);
const nombreOuNul = (v) => (v === '' || v === undefined || v === null ? null : Number(v));

/** Formulaire en modale avec bouton d'envoi commun. */
function ModaleFormulaire({ ouverte, titre, onFermer, onEnvoyer, envoi, children }) {
  return (
    <Modale
      ouverte={ouverte}
      onFermer={onFermer}
      titre={titre}
      pied={
        <>
          <button className="btn-secondary" onClick={onFermer}>
            Annuler
          </button>
          <button className="btn-primary" type="submit" form="form-onglet-vehicule" disabled={envoi}>
            {envoi && <Spinner className="h-4 w-4 text-white" />} Enregistrer
          </button>
        </>
      }
    >
      <form
        id="form-onglet-vehicule"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          onEnvoyer();
        }}
      >
        {children}
      </form>
    </Modale>
  );
}

/** Bandeau d'action en tête d'onglet. */
function BarreOnglet({ texte, bouton }) {
  return (
    <div className="flex flex-col gap-2 border-b border-stone-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <p className="text-sm text-stone-500">{texte}</p>
      {bouton}
    </div>
  );
}

function Etat({ etat, children, vide }) {
  if (etat.chargement && !etat.donnees) return <Chargement />;
  if (etat.erreur) return <div className="p-4"><Erreur message={etat.erreur} onRetry={etat.recharger} /></div>;
  if (!etat.donnees?.length) return <Vide titre={vide} />;
  return children;
}

// ── Carnet de bord ──
export function OngletCarnet({ vehicule, missions, peutSaisir, missionObligatoire, onAjout }) {
  const etat = useDonnees(() => lire(`/vehicules/${vehicule.id}/carnet`), [vehicule.id]);
  const [ouverte, setOuverte] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [f, setF] = useState({});
  const maj = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const ouvrir = () => {
    setF({ date: aujourdhui(), missionId: missions.length === 1 ? String(missions[0].id) : '', kmDepart: vehicule.kilometrage, kmArrivee: '', trajet: '', observations: '' });
    setOuverte(true);
  };
  const distance = f.kmArrivee !== '' && f.kmDepart !== '' ? Number(f.kmArrivee) - Number(f.kmDepart) : null;

  const envoyer = async () => {
    setEnvoi(true);
    const r = await action(
      () =>
        api.post(`/vehicules/${vehicule.id}/carnet`, {
          date: f.date,
          missionId: nombreOuNul(f.missionId),
          kmDepart: Number(f.kmDepart),
          kmArrivee: Number(f.kmArrivee),
          trajet: f.trajet.trim(),
          observations: nulSiVide(f.observations?.trim()),
        }),
      'Trajet enregistré au carnet de bord'
    );
    setEnvoi(false);
    if (r) {
      setOuverte(false);
      etat.recharger();
      onAjout?.();
    }
  };

  return (
    <>
      <BarreOnglet
        texte="Trajets effectués avec le véhicule (kilométrage relevé au départ et à l'arrivée)."
        bouton={
          peutSaisir && (
            <button className="btn-primary btn-sm" onClick={ouvrir}>
              <Plus className="h-4 w-4" /> Saisir un trajet
            </button>
          )
        }
      />
      <Etat etat={etat} vide="Aucun trajet au carnet de bord">
        <Tableau>
          <thead>
            <tr>
              <th>Date</th>
              <th>Mission</th>
              <th>Conducteur</th>
              <th>Trajet</th>
              <th className="text-right">Km départ</th>
              <th className="text-right">Km arrivée</th>
              <th className="text-right">Distance</th>
              <th>Observations</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {(etat.donnees || []).map((c) => (
              <tr key={c.id}>
                <td className="whitespace-nowrap">{date(c.date)}</td>
                <td className="whitespace-nowrap">{c.mission ? <Link className="text-brand-700 hover:underline" to={`/missions/${c.mission.id}`}>{c.mission.numero || `#${c.mission.id}`}</Link> : '—'}</td>
                <td className="whitespace-nowrap">{nomComplet(c.conducteur)}</td>
                <td className="min-w-[12rem]">{c.trajet}</td>
                <td className="text-right tabular-nums">{nombre(c.kmDepart)}</td>
                <td className="text-right tabular-nums">{nombre(c.kmArrivee)}</td>
                <td className="whitespace-nowrap text-right font-medium tabular-nums">{nombre(c.kmArrivee - c.kmDepart)} km</td>
                <td className="min-w-[10rem] text-stone-600">{c.observations || '—'}</td>
              </tr>
            ))}
          </tbody>
        </Tableau>
      </Etat>

      <ModaleFormulaire ouverte={ouverte} titre="Saisir un trajet" onFermer={() => setOuverte(false)} onEnvoyer={envoyer} envoi={envoi}>
        <Champ label="Date" requis>
          <input className="input" type="date" value={f.date || ''} onChange={maj('date')} required />
        </Champ>
        <Champ label="Mission" requis={missionObligatoire} aide={missionObligatoire ? 'Vos missions avec ce véhicule' : 'Optionnelle'}>
          <Select value={f.missionId} onChange={maj('missionId')} vide={missionObligatoire ? 'Choisir…' : 'Aucune'} options={optionsMissions(missions)} required={missionObligatoire} />
        </Champ>
        <Champ label="Km au départ" requis>
          <input className="input" type="number" min={0} value={f.kmDepart ?? ''} onChange={maj('kmDepart')} required />
        </Champ>
        <Champ
          label="Km à l'arrivée"
          requis
          erreur={distance !== null && distance < 0 ? 'Inférieur au kilométrage de départ' : undefined}
          aide={distance !== null && distance >= 0 ? `Distance : ${nombre(distance)} km` : undefined}
        >
          <input className="input" type="number" min={0} value={f.kmArrivee ?? ''} onChange={maj('kmArrivee')} required />
        </Champ>
        <Champ label="Trajet" requis className="sm:col-span-2">
          <input className="input" value={f.trajet || ''} onChange={maj('trajet')} required maxLength={300} placeholder="Agadir → Taroudant → Agadir" />
        </Champ>
        <Champ label="Observations" className="sm:col-span-2">
          <textarea className="input min-h-[70px]" value={f.observations || ''} onChange={maj('observations')} maxLength={1000} />
        </Champ>
      </ModaleFormulaire>
    </>
  );
}

// ── Carburant ──
export function OngletCarburant({ vehicule, missions, peutSaisir, onAjout }) {
  const etat = useDonnees(() => lire(`/vehicules/${vehicule.id}/pleins`), [vehicule.id]);
  const [ouverte, setOuverte] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [f, setF] = useState({});
  const maj = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const ouvrir = () => {
    setF({ date: aujourdhui(), missionId: '', litres: '', montant: '', kilometrage: vehicule.kilometrage, station: '' });
    setOuverte(true);
  };
  const envoyer = async () => {
    setEnvoi(true);
    const r = await action(
      () =>
        api.post(`/vehicules/${vehicule.id}/pleins`, {
          date: f.date,
          missionId: nombreOuNul(f.missionId),
          litres: Number(f.litres),
          montant: Number(f.montant),
          kilometrage: nombreOuNul(f.kilometrage),
          station: nulSiVide(f.station?.trim()),
        }),
      'Plein enregistré'
    );
    setEnvoi(false);
    if (r) {
      setOuverte(false);
      etat.recharger();
      onAjout?.();
    }
  };

  const pleins = etat.donnees || [];
  const totalLitres = pleins.reduce((a, p) => a + Number(p.litres), 0);
  const totalMontant = pleins.reduce((a, p) => a + Number(p.montant), 0);

  return (
    <>
      <BarreOnglet
        texte="Pleins de carburant enregistrés pour ce véhicule."
        bouton={
          peutSaisir && (
            <button className="btn-primary btn-sm" onClick={ouvrir}>
              <Plus className="h-4 w-4" /> Ajouter un plein
            </button>
          )
        }
      />
      <Etat etat={etat} vide="Aucun plein enregistré">
        <Tableau>
          <thead>
            <tr>
              <th>Date</th>
              <th>Station</th>
              <th>Mission</th>
              <th className="text-right">Kilométrage</th>
              <th className="text-right">Litres</th>
              <th className="text-right">Prix / L</th>
              <th className="text-right">Montant</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {pleins.map((p) => (
              <tr key={p.id}>
                <td className="whitespace-nowrap">{date(p.date)}</td>
                <td>{p.station || '—'}</td>
                <td className="whitespace-nowrap">{p.mission ? <Link className="text-brand-700 hover:underline" to={`/missions/${p.mission.id}`}>{p.mission.numero || `#${p.mission.id}`}</Link> : '—'}</td>
                <td className="whitespace-nowrap text-right tabular-nums">{p.kilometrage != null ? `${nombre(p.kilometrage)} km` : '—'}</td>
                <td className="whitespace-nowrap text-right tabular-nums">{nombre(p.litres, 2)} L</td>
                <td className="whitespace-nowrap text-right tabular-nums">{Number(p.litres) > 0 ? mad(Number(p.montant) / Number(p.litres)) : '—'}</td>
                <td className="whitespace-nowrap text-right font-medium tabular-nums">{mad(p.montant)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-stone-200 bg-stone-50 font-semibold">
              <td colSpan={4}>Total</td>
              <td className="whitespace-nowrap text-right tabular-nums">{nombre(totalLitres, 2)} L</td>
              <td />
              <td className="whitespace-nowrap text-right tabular-nums">{mad(totalMontant)}</td>
            </tr>
          </tfoot>
        </Tableau>
      </Etat>

      <ModaleFormulaire ouverte={ouverte} titre="Ajouter un plein" onFermer={() => setOuverte(false)} onEnvoyer={envoyer} envoi={envoi}>
        <Champ label="Date" requis>
          <input className="input" type="date" value={f.date || ''} onChange={maj('date')} required />
        </Champ>
        <Champ label="Mission" aide="Optionnelle">
          <Select value={f.missionId} onChange={maj('missionId')} vide="Aucune" options={optionsMissions(missions)} />
        </Champ>
        <Champ label="Litres" requis>
          <input className="input" type="number" min={0.01} step="0.01" value={f.litres ?? ''} onChange={maj('litres')} required />
        </Champ>
        <Champ label="Montant (MAD)" requis aide={Number(f.litres) > 0 && Number(f.montant) > 0 ? `Soit ${mad(Number(f.montant) / Number(f.litres))} / L` : undefined}>
          <input className="input" type="number" min={0.01} step="0.01" value={f.montant ?? ''} onChange={maj('montant')} required />
        </Champ>
        <Champ label="Kilométrage au compteur">
          <input className="input" type="number" min={0} value={f.kilometrage ?? ''} onChange={maj('kilometrage')} />
        </Champ>
        <Champ label="Station">
          <input className="input" value={f.station || ''} onChange={maj('station')} maxLength={200} />
        </Champ>
      </ModaleFormulaire>
    </>
  );
}

// ── Entretien ──
export function OngletEntretien({ vehicule, peutSaisir, onAjout }) {
  const etat = useDonnees(() => lire(`/vehicules/${vehicule.id}/entretiens`), [vehicule.id]);
  const [ouverte, setOuverte] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [f, setF] = useState({});
  const maj = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const ouvrir = () => {
    setF({ date: aujourdhui(), type: '', description: '', montant: '', kilometrage: vehicule.kilometrage, garage: '', prochainEntretienKm: '', prochainEntretienDate: '' });
    setOuverte(true);
  };
  const envoyer = async () => {
    setEnvoi(true);
    const r = await action(
      () =>
        api.post(`/vehicules/${vehicule.id}/entretiens`, {
          date: f.date,
          type: f.type.trim(),
          description: nulSiVide(f.description?.trim()),
          montant: Number(f.montant || 0),
          kilometrage: nombreOuNul(f.kilometrage),
          garage: nulSiVide(f.garage?.trim()),
          prochainEntretienKm: nombreOuNul(f.prochainEntretienKm),
          prochainEntretienDate: nulSiVide(f.prochainEntretienDate),
        }),
      'Entretien enregistré'
    );
    setEnvoi(false);
    if (r) {
      setOuverte(false);
      etat.recharger();
      onAjout?.();
    }
  };

  const entretiens = etat.donnees || [];
  return (
    <>
      <BarreOnglet
        texte="Révisions, réparations et contrôles du véhicule."
        bouton={
          peutSaisir && (
            <button className="btn-primary btn-sm" onClick={ouvrir}>
              <Plus className="h-4 w-4" /> Ajouter un entretien
            </button>
          )
        }
      />
      <Etat etat={etat} vide="Aucun entretien enregistré">
        <Tableau>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Description</th>
              <th>Garage</th>
              <th className="text-right">Kilométrage</th>
              <th className="text-right">Montant</th>
              <th>Prochain entretien</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {entretiens.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap">{date(e.date)}</td>
                <td className="whitespace-nowrap font-medium">{e.type}</td>
                <td className="min-w-[12rem] text-stone-600">{e.description || '—'}</td>
                <td>{e.garage || '—'}</td>
                <td className="whitespace-nowrap text-right tabular-nums">{e.kilometrage != null ? `${nombre(e.kilometrage)} km` : '—'}</td>
                <td className="whitespace-nowrap text-right font-medium tabular-nums">{mad(e.montant)}</td>
                <td className="whitespace-nowrap">
                  {[e.prochainEntretienKm != null && `${nombre(e.prochainEntretienKm)} km`, e.prochainEntretienDate && date(e.prochainEntretienDate)].filter(Boolean).join(' ou ') || '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-stone-200 bg-stone-50 font-semibold">
              <td colSpan={5}>Total</td>
              <td className="whitespace-nowrap text-right tabular-nums">{mad(entretiens.reduce((a, e) => a + Number(e.montant), 0))}</td>
              <td />
            </tr>
          </tfoot>
        </Tableau>
      </Etat>

      <ModaleFormulaire ouverte={ouverte} titre="Ajouter un entretien" onFermer={() => setOuverte(false)} onEnvoyer={envoyer} envoi={envoi}>
        <Champ label="Date" requis>
          <input className="input" type="date" value={f.date || ''} onChange={maj('date')} required />
        </Champ>
        <Champ label="Type" requis>
          <input className="input" list="types-entretien" value={f.type || ''} onChange={maj('type')} required maxLength={100} />
          <datalist id="types-entretien">
            {['Vidange', 'Révision', 'Pneumatiques', 'Freins', 'Visite technique', 'Carrosserie', 'Réparation'].map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Champ>
        <Champ label="Description" className="sm:col-span-2">
          <textarea className="input min-h-[70px]" value={f.description || ''} onChange={maj('description')} maxLength={1000} />
        </Champ>
        <Champ label="Montant (MAD)" requis>
          <input className="input" type="number" min={0} step="0.01" value={f.montant ?? ''} onChange={maj('montant')} required />
        </Champ>
        <Champ label="Kilométrage">
          <input className="input" type="number" min={0} value={f.kilometrage ?? ''} onChange={maj('kilometrage')} />
        </Champ>
        <Champ label="Garage" className="sm:col-span-2">
          <input className="input" value={f.garage || ''} onChange={maj('garage')} maxLength={200} />
        </Champ>
        <Champ label="Prochain entretien (km)">
          <input className="input" type="number" min={0} value={f.prochainEntretienKm ?? ''} onChange={maj('prochainEntretienKm')} />
        </Champ>
        <Champ label="Prochain entretien (date)">
          <input className="input" type="date" value={f.prochainEntretienDate || ''} onChange={maj('prochainEntretienDate')} />
        </Champ>
      </ModaleFormulaire>
    </>
  );
}

// ── Missions ──
export function OngletMissions({ etat }) {
  return (
    <>
      <BarreOnglet texte="Missions utilisant ce véhicule, six mois avant et après aujourd'hui (hors brouillons, refusées et annulées)." />
      <Etat etat={etat} vide="Aucune mission sur la période">
        <Tableau>
          <thead>
            <tr>
              <th>N°</th>
              <th>Objet</th>
              <th>Destination</th>
              <th>Départ</th>
              <th>Retour</th>
              <th>Participants</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {(etat.donnees || []).map((m) => (
              <tr key={m.id}>
                <td className="whitespace-nowrap">
                  <Link className="font-medium text-brand-700 hover:underline" to={`/missions/${m.id}`}>
                    {m.numero || `#${m.id}`}
                  </Link>
                </td>
                <td className="min-w-[14rem]">{m.objet}</td>
                <td className="whitespace-nowrap">{m.destination?.ville}</td>
                <td className="whitespace-nowrap">{dateHeure(m.dateDepart)}</td>
                <td className="whitespace-nowrap">{dateHeure(m.dateRetour)}</td>
                <td className="min-w-[10rem]">{(m.participants || []).map((p) => nomComplet(p.user)).join(', ')}</td>
                <td>
                  <StatutMission statut={m.statut} />
                </td>
              </tr>
            ))}
          </tbody>
        </Tableau>
      </Etat>
    </>
  );
}
