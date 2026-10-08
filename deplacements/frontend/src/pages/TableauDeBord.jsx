import { Link } from 'react-router-dom';
import { Plane, PlusCircle, Receipt, Wallet, CheckSquare, Clock, TrendingUp, MapPin } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { lire } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useDonnees } from '../hooks/useDonnees';
import { Carte, Chargement, EnTete, Erreur, Indicateur, Jauge, StatutMission, Vide } from '../components/ui';
import { mad, date, dateLongue, nombre } from '../lib/format';

const abrege = (v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)} k` : String(v));

function ListeMissions({ missions, vide }) {
  if (!missions.length) return <p className="py-6 text-center text-sm text-stone-500">{vide}</p>;
  return (
    <ul className="divide-y divide-stone-100">
      {missions.map((m) => (
        <li key={m.id}>
          <Link to={`/missions/${m.id}`} className="flex items-start gap-3 py-3 hover:bg-stone-50 sm:px-1">
            <div className="rounded-lg bg-zellige-50 p-2 text-zellige-700">
              <MapPin className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-stone-900">{m.objet}</p>
              <p className="text-xs text-stone-500">
                {m.destination} · du {date(m.dateDepart)} au {date(m.dateRetour)}
              </p>
              <p className="truncate text-xs text-stone-500">{m.participants.join(', ')}</p>
            </div>
            <StatutMission statut={m.statut} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function TableauDeBord() {
  const { utilisateur, peut } = useAuth();
  const { donnees: d, chargement, erreur, recharger } = useDonnees(async () => {
    const [tdb, aValiderM, aValiderN] = await Promise.all([lire('/reporting/tableau-de-bord'), lire('/missions/a-valider'), lire('/notes-frais/a-valider')]);
    return { ...tdb, aValider: aValiderM.length + aValiderN.length };
  });

  if (chargement && !d) return <Chargement />;
  if (erreur) return <Erreur message={erreur} onRetry={recharger} />;

  const vueGlobale = peut('reporting:lire');
  const f = d.finances;

  return (
    <>
      <EnTete
        titre={`Bonjour ${utilisateur.prenom}`}
        sousTitre={dateLongue(new Date())}
        actions={
          <>
            <Link to="/missions/nouvelle" className="btn-primary">
              <PlusCircle className="h-4 w-4" /> Nouvelle mission
            </Link>
            <Link to="/notes-frais" className="btn-secondary">
              <Receipt className="h-4 w-4" /> Mes frais
            </Link>
          </>
        }
      />

      {(d.aValider > 0 || f.mesNotesAFinaliser > 0) && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          {d.aValider > 0 && (
            <Link to="/validations" className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 hover:bg-amber-100">
              <CheckSquare className="h-5 w-5" />
              <span className="text-sm">
                <strong>{d.aValider}</strong> demande{d.aValider > 1 ? 's' : ''} attend{d.aValider > 1 ? 'ent' : ''} votre validation
              </span>
            </Link>
          )}
          {f.mesNotesAFinaliser > 0 && (
            <Link to="/notes-frais?mes=1" className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-brand-900 hover:bg-brand-100">
              <Receipt className="h-5 w-5" />
              <span className="text-sm">
                <strong>{f.mesNotesAFinaliser}</strong> note{f.mesNotesAFinaliser > 1 ? 's' : ''} de frais à compléter ou corriger
              </span>
            </Link>
          )}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicateur libelle={vueGlobale ? 'Missions de l’année' : 'Mes missions'} valeur={d.kpis.nbMissions} detail={`${d.kpis.joursMission} jour(s) de déplacement`} icone={Plane} />
        <Indicateur libelle="En cours" valeur={d.kpis.enCours} detail={`${d.kpis.enAttente} en attente de validation`} icone={Clock} ton="bleu" />
        <Indicateur libelle="Coût retenu" valeur={mad(d.kpis.coutTotal)} detail={`Moyenne ${mad(d.kpis.coutMoyen)}`} icone={TrendingUp} ton="orange" />
        {f.notesARembourser ? (
          <Indicateur libelle="À rembourser" valeur={mad(f.notesARembourser.montant)} detail={`${f.notesARembourser.nb} note(s) validée(s)`} icone={Wallet} ton="vert" />
        ) : (
          <Indicateur libelle="Dépenses réalisées" valeur={mad(d.kpis.coutRealise)} icone={Wallet} ton="vert" />
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Carte titre="Missions en cours">
            <ListeMissions missions={d.missionsEnCours} vide="Aucune mission en cours." />
          </Carte>
          <Carte titre="Prochains départs" actions={<Link to="/calendrier" className="text-sm text-brand-700 hover:underline">Calendrier</Link>}>
            <ListeMissions missions={d.missionsAVenir} vide="Aucun départ programmé." />
          </Carte>
          {vueGlobale && (
            <Carte titre={`Activité ${d.annee}`}>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.parMois} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
                    <XAxis dataKey="libelle" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={abrege} tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip formatter={(v) => mad(v)} labelStyle={{ fontWeight: 600 }} />
                    <Bar dataKey="cout" name="Coût" fill="#a94621" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Carte>
          )}
        </div>

        <div className="space-y-5">
          {d.budgets.length > 0 && (
            <Carte titre="Budgets" actions={<Link to="/budgets" className="text-sm text-brand-700 hover:underline">Détail</Link>}>
              <ul className="space-y-4">
                {d.budgets.map((b) => (
                  <li key={b.id}>
                    <div className="mb-1 flex justify-between gap-2 text-sm">
                      <span className="truncate text-stone-700">{b.libelle}</span>
                      <span className={`shrink-0 font-medium ${b.depasse ? 'text-red-600' : 'text-stone-900'}`}>{nombre(b.tauxConsommation, 1)} %</span>
                    </div>
                    <Jauge taux={b.tauxConsommation} />
                    <p className="mt-1 text-xs text-stone-500">Disponible : {mad(b.disponible)}</p>
                  </li>
                ))}
              </ul>
            </Carte>
          )}
          {f.avancesOuvertes && (
            <Carte titre="Avances non régularisées">
              <p className="text-2xl font-semibold text-stone-900">{mad(f.avancesOuvertes.montant)}</p>
              <p className="text-sm text-stone-500">{f.avancesOuvertes.nb} avance(s) demandée(s) ou versée(s)</p>
              <Link to="/avances" className="btn-secondary btn-sm mt-3">
                Gérer les avances
              </Link>
            </Carte>
          )}
          {vueGlobale && d.parDestination.length > 0 && (
            <Carte titre="Destinations principales">
              <ul className="space-y-2 text-sm">
                {d.parDestination.slice(0, 5).map((x) => (
                  <li key={x.cle} className="flex justify-between gap-2">
                    <span className="truncate text-stone-700">{x.libelle}</span>
                    <span className="shrink-0 text-stone-500">
                      {x.nb} · {mad(x.cout)}
                    </span>
                  </li>
                ))}
              </ul>
            </Carte>
          )}
          {!vueGlobale && d.missionsEnCours.length === 0 && d.missionsAVenir.length === 0 && (
            <Carte>
              <Vide
                titre="Pas de déplacement prévu"
                texte="Créez une demande de mission : elle sera transmise à votre chef de service pour validation."
                action={
                  <Link to="/missions/nouvelle" className="btn-primary btn-sm">
                    Nouvelle mission
                  </Link>
                }
              />
            </Carte>
          )}
        </div>
      </div>
    </>
  );
}
