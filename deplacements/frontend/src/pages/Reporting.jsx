import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Calculator, CalendarClock, Clock, Coins, FileSpreadsheet, FileText, Hourglass, Plane, Receipt, TrendingUp, Wallet } from 'lucide-react';
import { lire, ouvrirFichier } from '../api/client';
import { useDonnees } from '../hooks/useDonnees';
import { useAuth } from '../context/AuthContext';
import { Carte, Champ, Chargement, EnTete, Erreur, Indicateur, Jauge, Select, Spinner, StatutMission, Tableau, Vide } from '../components/ui';
import { LIBELLES, date, mad, nombre, versInputDate } from '../lib/format';

// Couleurs de la charte (terre cuite, zellige, pierre).
const C = {
  brique: '#a94621',
  brique2: '#e07448',
  zellige: '#1f7f8c',
  pierre: '#d6d3d1',
  grille: '#e7e5e4',
  texte: '#78716c',
};
const COULEUR_STATUT = {
  BROUILLON: '#a8a29e',
  EN_ATTENTE: '#f59e0b',
  APPROUVE: '#10b981',
  REFUSE: '#dc2626',
  EN_COURS: '#1f7f8c',
  CLOTURE: '#8b5cf6',
  ANNULE: '#d6d3d1',
};

/** Montant abrégé pour les axes : 12 k, 1,2 M. */
const abrege = (v) => {
  const n = Number(v || 0);
  if (Math.abs(n) >= 1e6) return `${nombre(n / 1e6, 1)} M`;
  if (Math.abs(n) >= 1e3) return `${nombre(n / 1e3, 1)} k`;
  return nombre(n);
};
const tronquer = (t, n = 22) => (t && t.length > n ? `${t.slice(0, n - 1)}…` : t);
const axe = { fontSize: 12, fill: C.texte };

/** Téléchargement avec message d'erreur lisible (la réponse d'erreur arrive en Blob). */
async function telecharger(url, opts) {
  try {
    await ouvrirFichier(url, opts);
  } catch (e) {
    let msg = e?.message || 'Erreur';
    const d = e?.response?.data;
    if (d instanceof Blob) {
      try {
        msg = JSON.parse(await d.text()).message || msg;
      } catch {
        /* réponse non JSON */
      }
    }
    toast.error(msg, { duration: 6000 });
  }
}

const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v != null)).toString();

/** Infobulle commune : libellé + valeurs formatées. */
function Infobulle({ active, payload, label, format = mad }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-stone-800">{payload[0]?.payload?.libelleComplet || label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-stone-600">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.payload?.fill }} />
          {p.name} : <span className="font-medium text-stone-900">{(p.payload?.format || format)(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

/** Carte de graphique avec état vide. */
function Graphique({ titre, vide, hauteur = 260, children, className = '' }) {
  return (
    <Carte titre={titre} className={className}>
      {vide ? (
        <Vide titre="Aucune donnée" texte="Aucune mission comptabilisée pour cette sélection." />
      ) : (
        <div style={{ height: hauteur }}>
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </div>
      )}
    </Carte>
  );
}

/** Barres horizontales (classements). */
function BarresHorizontales({ titre, donnees, couleur, nom = 'Coût' }) {
  const lignes = (donnees || []).map((d) => ({ ...d, libelleCourt: tronquer(d.libelle), libelleComplet: `${d.libelle} — ${d.nb} mission${d.nb > 1 ? 's' : ''}` }));
  return (
    <Graphique titre={titre} vide={!lignes.length} hauteur={Math.max(160, lignes.length * 40 + 40)}>
      <BarChart data={lignes} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barCategoryGap={8}>
        <CartesianGrid horizontal={false} stroke={C.grille} />
        <XAxis type="number" tickFormatter={abrege} tick={axe} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="libelleCourt" width={150} tick={axe} axisLine={false} tickLine={false} />
        <Tooltip content={<Infobulle />} cursor={{ fill: '#f5f5f4' }} />
        <Bar dataKey="cout" name={nom} fill={couleur} radius={[0, 4, 4, 0]} maxBarSize={22} />
      </BarChart>
    </Graphique>
  );
}

export default function Reporting() {
  const { peut } = useAuth();
  const anneeCourante = new Date().getFullYear();
  const [annee, setAnnee] = useState(anneeCourante);
  const [serviceId, setServiceId] = useState('');
  const [export_, setExport] = useState(null);

  const services = useDonnees(() => lire('/referentiels/services'), []);
  const { donnees: d, chargement, erreur, recharger } = useDonnees(
    () => lire('/reporting/tableau-de-bord', { annee, serviceId: serviceId || undefined }),
    [annee, serviceId]
  );

  const exporter = async (type) => {
    setExport(type);
    if (type === 'xlsx') await telecharger(`/reporting/export.xlsx?${qs({ annee, serviceId })}`, { telecharger: true });
    else await telecharger(`/reporting/export.pdf?${qs({ annee, serviceId })}`);
    setExport(null);
  };

  const annees = Array.from({ length: 7 }, (_, i) => anneeCourante + 1 - i);

  return (
    <div>
      <EnTete
        titre="Reporting"
        sousTitre="Analyse des déplacements professionnels et de l'exécution budgétaire"
        actions={
          <>
            <button className="btn-secondary" onClick={() => exporter('xlsx')} disabled={!!export_}>
              {export_ === 'xlsx' ? <Spinner className="h-4 w-4" /> : <FileSpreadsheet className="h-4 w-4 text-emerald-700" />} Excel
            </button>
            <button className="btn-secondary" onClick={() => exporter('pdf')} disabled={!!export_}>
              {export_ === 'pdf' ? <Spinner className="h-4 w-4" /> : <FileText className="h-4 w-4 text-red-700" />} PDF
            </button>
          </>
        }
      />

      <div className="card mb-4 grid grid-cols-1 gap-3 p-3 sm:grid-cols-[10rem_1fr] lg:max-w-2xl">
        <Champ label="Année">
          <Select value={annee} onChange={(e) => setAnnee(Number(e.target.value))} options={annees.map((a) => ({ value: a, label: String(a) }))} />
        </Champ>
        <Champ label="Service">
          <Select
            vide="Tous les services"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            options={(services.donnees || []).map((s) => ({ value: s.id, label: s.nom }))}
          />
        </Champ>
      </div>

      {chargement && !d ? (
        <Chargement />
      ) : erreur ? (
        <Erreur message={erreur} onRetry={recharger} />
      ) : (
        d && <Contenu d={d} chargement={chargement} />
      )}

      {peut('export:comptable') && <ExportComptable />}
    </div>
  );
}

function Contenu({ d, chargement }) {
  const k = d.kpis;
  const moisVides = d.parMois.every((m) => !m.nb && !m.cout);
  const statuts = Object.entries(d.parStatut).map(([s, nb]) => ({
    statut: s,
    libelle: LIBELLES.statutMission[s],
    nb,
    fill: COULEUR_STATUT[s],
    format: (v) => `${nombre(v)} mission${v > 1 ? 's' : ''}`,
  }));
  const budgets = (d.budgets || []).map((b) => ({ ...b, libelleCourt: tronquer(b.libelle, 26), libelleComplet: b.libelle }));
  const f = d.finances || {};

  return (
    <div className={`space-y-4 transition-opacity ${chargement ? 'opacity-60' : ''}`}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicateur libelle="Missions" valeur={nombre(k.nbMissions)} detail={`Approuvées ou réalisées · ${nombre(k.nbDemandes)} demandes`} icone={Plane} />
        <Indicateur libelle="Coût total" valeur={mad(k.coutTotal)} detail="Coût retenu des missions" icone={Coins} ton="bleu" />
        <Indicateur libelle="Coût moyen" valeur={mad(k.coutMoyen)} detail="Par mission" icone={Calculator} ton="orange" />
        <Indicateur libelle="Dépenses réalisées" valeur={mad(k.coutRealise)} detail="Frais effectivement engagés" icone={TrendingUp} ton="vert" />
        <Indicateur libelle="En attente" valeur={nombre(k.enAttente)} detail="Missions à valider" icone={Hourglass} ton="orange" />
        <Indicateur libelle="En cours" valeur={nombre(k.enCours)} detail="Missions sur le terrain" icone={Clock} ton="bleu" />
        <Indicateur libelle="Jours de mission" valeur={nombre(k.joursMission)} icone={CalendarClock} />
        {f.notesARembourser ? (
          <Indicateur libelle="Notes à rembourser" valeur={mad(f.notesARembourser.montant)} detail={`${f.notesARembourser.nb} note(s) validée(s)`} icone={Receipt} ton="vert" />
        ) : f.avancesOuvertes ? (
          <Indicateur libelle="Avances ouvertes" valeur={mad(f.avancesOuvertes.montant)} detail={`${f.avancesOuvertes.nb} avance(s)`} icone={Wallet} ton="vert" />
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Graphique titre={`Missions par mois — ${d.annee}`} vide={moisVides}>
          <BarChart data={d.parMois} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid vertical={false} stroke={C.grille} />
            <XAxis dataKey="libelle" tick={axe} axisLine={false} tickLine={false} interval={0} angle={-35} textAnchor="end" height={40} />
            <YAxis allowDecimals={false} tick={axe} axisLine={false} tickLine={false} />
            <Tooltip content={<Infobulle format={(v) => `${nombre(v)} mission${v > 1 ? 's' : ''}`} />} cursor={{ fill: '#f5f5f4' }} />
            <Bar dataKey="nb" name="Missions" fill={C.brique} radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </Graphique>
        <Graphique titre={`Coût mensuel — ${d.annee}`} vide={moisVides}>
          <LineChart data={d.parMois} margin={{ top: 8, right: 12, bottom: 0, left: -4 }}>
            <CartesianGrid vertical={false} stroke={C.grille} />
            <XAxis dataKey="libelle" tick={axe} axisLine={false} tickLine={false} interval={0} angle={-35} textAnchor="end" height={40} />
            <YAxis tickFormatter={abrege} tick={axe} axisLine={false} tickLine={false} width={48} />
            <Tooltip content={<Infobulle />} />
            <Line type="monotone" dataKey="cout" name="Coût" stroke={C.zellige} strokeWidth={2} dot={{ r: 4, fill: C.zellige }} activeDot={{ r: 6 }} />
          </LineChart>
        </Graphique>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarresHorizontales titre="Coût par service" donnees={d.parService} couleur={C.brique} />
        <Graphique titre="Répartition par statut" hauteur={Math.max(160, statuts.length * 34 + 30)} vide={statuts.every((s) => !s.nb)}>
          <BarChart data={statuts} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 4 }} barCategoryGap={6}>
            <CartesianGrid horizontal={false} stroke={C.grille} />
            <XAxis type="number" allowDecimals={false} tick={axe} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="libelle" width={90} tick={axe} axisLine={false} tickLine={false} />
            <Tooltip content={<Infobulle />} cursor={{ fill: '#f5f5f4' }} />
            <Bar dataKey="nb" name="Missions" radius={[0, 4, 4, 0]} maxBarSize={20}>
              {statuts.map((s) => (
                <Cell key={s.statut} fill={s.fill} />
              ))}
            </Bar>
          </BarChart>
        </Graphique>
        <BarresHorizontales titre="Top destinations (coût)" donnees={d.parDestination} couleur={C.zellige} />
        <BarresHorizontales titre="Top agents (coût par agent)" donnees={d.parAgent} couleur={C.brique2} />
      </div>

      {budgets.length > 0 && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Graphique titre={`Budgets ${d.annee} : montant et consommation`} hauteur={Math.max(180, budgets.length * 56 + 60)}>
            <BarChart data={budgets} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barGap={2} barCategoryGap={12}>
              <CartesianGrid horizontal={false} stroke={C.grille} />
              <XAxis type="number" tickFormatter={abrege} tick={axe} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="libelleCourt" width={170} tick={axe} axisLine={false} tickLine={false} />
              <Tooltip content={<Infobulle />} cursor={{ fill: '#f5f5f4' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="montant" name="Montant" fill={C.pierre} radius={[0, 4, 4, 0]} maxBarSize={16} />
              <Bar dataKey="consomme" name="Consommé" fill={C.brique} radius={[0, 4, 4, 0]} maxBarSize={16} />
            </BarChart>
          </Graphique>
          <Carte titre="Situation des budgets" corps="p-0">
            <Tableau>
              <thead>
                <tr>
                  <th>Budget</th>
                  <th className="text-right">Montant</th>
                  <th className="text-right">Consommé</th>
                  <th className="text-right">Disponible</th>
                  <th className="min-w-[8rem]">Taux</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {budgets.map((b) => (
                  <tr key={b.id}>
                    <td className="min-w-[12rem]">
                      {b.libelle}
                      <span className="block text-xs text-stone-500">{LIBELLES.typeBudget[b.type]}</span>
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums">{mad(b.montant)}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">{mad(b.consomme)}</td>
                    <td className={`whitespace-nowrap text-right tabular-nums ${b.disponible < 0 ? 'font-medium text-red-700' : ''}`}>{mad(b.disponible)}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <Jauge taux={b.tauxConsommation} />
                        <span className={`w-12 text-right text-xs tabular-nums ${b.depasse ? 'text-red-700' : b.enAlerte ? 'text-amber-700' : 'text-stone-600'}`}>
                          {nombre(b.tauxConsommation, 1)} %
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tableau>
          </Carte>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ListeMissions titre="Missions en cours" missions={d.missionsEnCours} vide="Aucune mission en cours" />
        <ListeMissions titre="Prochaines missions approuvées" missions={d.missionsAVenir} vide="Aucune mission à venir" />
      </div>
    </div>
  );
}

function ListeMissions({ titre, missions, vide }) {
  return (
    <Carte titre={titre} corps="p-0">
      {!missions?.length ? (
        <p className="px-4 py-6 text-center text-sm text-stone-500 sm:px-5">{vide}</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {missions.map((m) => (
            <li key={m.id}>
              <Link to={`/missions/${m.id}`} className="block px-4 py-3 hover:bg-stone-50 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-stone-900">{m.numero || `#${m.id}`}</span>
                  <StatutMission statut={m.statut} />
                </div>
                <p className="truncate text-sm text-stone-700">{m.objet}</p>
                <p className="text-xs text-stone-500">
                  {m.destination} · du {date(m.dateDepart)} au {date(m.dateRetour)} · {m.participants.join(', ')}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Carte>
  );
}

/** Export des écritures comptables des notes remboursées. */
function ExportComptable() {
  const debutAnnee = new Date(new Date().getFullYear(), 0, 1);
  const [f, setF] = useState({ du: versInputDate(debutAnnee), au: versInputDate(new Date()), format: 'xlsx' });
  const [envoi, setEnvoi] = useState(false);
  const maj = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const lancer = async (e) => {
    e.preventDefault();
    if (f.au < f.du) {
      toast.error('La date de fin doit être postérieure à la date de début.');
      return;
    }
    setEnvoi(true);
    await telecharger(`/reporting/export-comptable?${qs(f)}`, { telecharger: true });
    setEnvoi(false);
  };
  return (
    <Carte titre="Export comptable" className="mt-4">
      <p className="mb-3 text-sm text-stone-500">
        Écritures des notes de frais remboursées sur la période (débit des comptes de charges, crédit des comptes de tiers et d'avances).
      </p>
      <form onSubmit={lancer} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
        <Champ label="Du" requis>
          <input className="input" type="date" value={f.du} onChange={maj('du')} required />
        </Champ>
        <Champ label="Au" requis>
          <input className="input" type="date" value={f.au} onChange={maj('au')} required />
        </Champ>
        <Champ label="Format">
          <Select
            value={f.format}
            onChange={maj('format')}
            options={[
              { value: 'xlsx', label: 'Excel (.xlsx)' },
              { value: 'csv', label: 'CSV (séparateur ;)' },
            ]}
          />
        </Champ>
        <button className="btn-primary" type="submit" disabled={envoi}>
          {envoi ? <Spinner className="h-4 w-4 text-white" /> : <FileSpreadsheet className="h-4 w-4" />} Exporter
        </button>
      </form>
    </Carte>
  );
}
