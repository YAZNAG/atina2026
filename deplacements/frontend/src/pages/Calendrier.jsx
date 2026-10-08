import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarDays, Car, ChevronLeft, ChevronRight, LayoutGrid, List, MapPin, Users } from 'lucide-react';
import { lire } from '../api/client';
import { useDonnees } from '../hooks/useDonnees';
import { Badge, Carte, Chargement, EnTete, Erreur, Select, StatutMission, Vide } from '../components/ui';
import { LIBELLES, dateHeure, dateLongue, nomComplet } from '../lib/format';

// ── Outils de dates (heure locale) ──
const JOUR_MS = 86400000;
const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const debutJour = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const ajouterJours = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const p2 = (n) => String(n).padStart(2, '0');
const cleJour = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${p2(x.getMonth() + 1)}-${p2(x.getDate())}`;
};
/** Nombre de jours calendaires entre deux dates (a → b). */
const ecartJours = (a, b) => Math.round((debutJour(b) - debutJour(a)) / JOUR_MS);
const heure = (d) => new Date(d).toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' });
const titreMois = (d) => {
  const t = d.toLocaleDateString('fr-MA', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Couleurs par statut (classes écrites en entier pour Tailwind). */
const COULEURS = {
  EN_ATTENTE: { barre: 'bg-amber-100 text-amber-900 border-amber-400', pastille: 'bg-amber-400', bord: 'border-l-amber-400' },
  APPROUVE: { barre: 'bg-emerald-100 text-emerald-900 border-emerald-500', pastille: 'bg-emerald-500', bord: 'border-l-emerald-500' },
  EN_COURS: { barre: 'bg-zellige-100 text-zellige-700 border-zellige-500', pastille: 'bg-zellige-500', bord: 'border-l-zellige-500' },
  CLOTURE: { barre: 'bg-violet-100 text-violet-900 border-violet-500', pastille: 'bg-violet-500', bord: 'border-l-violet-500' },
};
const STATUTS_AFFICHES = ['EN_ATTENTE', 'APPROUVE', 'EN_COURS', 'CLOTURE'];
const MAX_LIGNES = 3;

/**
 * Conflits : un même participant ou un même véhicule engagé sur deux missions dont les périodes se chevauchent.
 * @returns {{ liste: object[], parMission: Map<number, object[]>, jours: Set<string> }}
 */
function detecterConflits(missions) {
  const liste = [];
  for (let i = 0; i < missions.length; i += 1) {
    for (let j = i + 1; j < missions.length; j += 1) {
      const a = missions[i];
      const b = missions[j];
      const du = new Date(Math.max(new Date(a.dateDepart), new Date(b.dateDepart)));
      const au = new Date(Math.min(new Date(a.dateRetour), new Date(b.dateRetour)));
      if (du >= au) continue;
      const personnes = (a.participants || [])
        .filter((p) => (b.participants || []).some((q) => q.userId === p.userId))
        .map((p) => p.user);
      const vehicule = a.vehiculeId && a.vehiculeId === b.vehiculeId ? a.vehicule : null;
      if (personnes.length || vehicule) liste.push({ cle: `${a.id}-${b.id}`, a, b, personnes, vehicule, du, au });
    }
  }
  const parMission = new Map();
  const jours = new Set();
  for (const c of liste) {
    [c.a.id, c.b.id].forEach((id) => parMission.set(id, [...(parMission.get(id) || []), c]));
    for (let d = debutJour(c.du); d <= c.au; d = ajouterJours(d, 1)) jours.add(cleJour(d));
  }
  return { liste, parMission, jours };
}

const estMobile = () => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)').matches;

export default function Calendrier() {
  const navigate = useNavigate();
  const [mois, setMois] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [vue, setVue] = useState(() => (estMobile() ? 'liste' : 'mois'));
  const [serviceId, setServiceId] = useState('');
  const [vehiculeId, setVehiculeId] = useState('');
  const [jourChoisi, setJourChoisi] = useState(null);

  // Grille lundi → dimanche couvrant le mois.
  const { semaines, debutGrille, finGrille } = useMemo(() => {
    const decalage = (mois.getDay() + 6) % 7;
    const debut = ajouterJours(mois, -decalage);
    const nbJours = new Date(mois.getFullYear(), mois.getMonth() + 1, 0).getDate();
    const nbSemaines = Math.ceil((decalage + nbJours) / 7);
    const s = Array.from({ length: nbSemaines }, (_, i) => Array.from({ length: 7 }, (__, k) => ajouterJours(debut, i * 7 + k)));
    const fin = ajouterJours(debut, nbSemaines * 7);
    fin.setMilliseconds(-1);
    return { semaines: s, debutGrille: debut, finGrille: fin };
  }, [mois]);

  const referentiels = useDonnees(() => Promise.all([lire('/referentiels/services'), lire('/vehicules')]), []);
  const [services, vehicules] = referentiels.donnees || [[], []];

  const { donnees, chargement, erreur, recharger } = useDonnees(
    () =>
      lire('/missions/calendrier', {
        du: debutGrille.toISOString(),
        au: finGrille.toISOString(),
        serviceId: serviceId || undefined,
        vehiculeId: vehiculeId || undefined,
      }),
    [debutGrille.getTime(), serviceId, vehiculeId]
  );
  const missions = useMemo(() => (donnees || []).filter((m) => STATUTS_AFFICHES.includes(m.statut)), [donnees]);
  const conflits = useMemo(() => detecterConflits(missions), [missions]);

  // Conflits dont la période touche le mois affiché.
  const debutMois = mois;
  const finMois = new Date(mois.getFullYear(), mois.getMonth() + 1, 1);
  const conflitsDuMois = conflits.liste.filter((c) => c.du < finMois && c.au >= debutMois);

  const changerMois = (n) => {
    setMois((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
    setJourChoisi(null);
  };
  const aujourdhui = () => {
    const d = new Date();
    setMois(new Date(d.getFullYear(), d.getMonth(), 1));
    setJourChoisi(cleJour(d));
  };

  const missionsDuJour = (jour) => {
    const d = debutJour(jour);
    const f = ajouterJours(d, 1);
    return missions.filter((m) => new Date(m.dateDepart) < f && new Date(m.dateRetour) >= d);
  };

  return (
    <div>
      <EnTete
        titre="Calendrier des déplacements"
        sousTitre="Missions en attente, approuvées, en cours et clôturées"
        actions={
          <div className="inline-flex rounded-lg border border-stone-300 bg-white p-0.5" role="group" aria-label="Choix de la vue">
            {[
              { id: 'mois', label: 'Mois', icone: LayoutGrid },
              { id: 'liste', label: 'Liste', icone: List },
            ].map((v) => (
              <button
                key={v.id}
                onClick={() => setVue(v.id)}
                aria-pressed={vue === v.id}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
                  vue === v.id ? 'bg-brand-700 text-white' : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                <v.icone className="h-4 w-4" /> {v.label}
              </button>
            ))}
          </div>
        }
      />

      {/* Navigation et filtres */}
      <div className="card mb-4 flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <button className="btn-secondary btn-sm" onClick={() => changerMois(-1)} aria-label="Mois précédent">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button className="btn-secondary btn-sm" onClick={aujourdhui}>
            Aujourd'hui
          </button>
          <button className="btn-secondary btn-sm" onClick={() => changerMois(1)} aria-label="Mois suivant">
            <ChevronRight className="h-4 w-4" />
          </button>
          <h2 className="ml-2 text-lg font-semibold text-stone-900">{titreMois(mois)}</h2>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:w-[32rem]">
          <Select
            aria-label="Filtrer par service"
            vide="Tous les services"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            options={services.map((s) => ({ value: s.id, label: s.nom }))}
          />
          <Select
            aria-label="Filtrer par véhicule"
            vide="Tous les véhicules"
            value={vehiculeId}
            onChange={(e) => setVehiculeId(e.target.value)}
            options={vehicules.map((v) => ({ value: v.id, label: `${v.immatriculation} — ${v.marque} ${v.modele}` }))}
          />
        </div>
      </div>

      <Legende />

      {chargement && !donnees ? (
        <Chargement />
      ) : erreur ? (
        <Erreur message={erreur} onRetry={recharger} />
      ) : (
        <>
          {vue === 'mois' ? (
            <>
              <GrilleMois
                semaines={semaines}
                mois={mois}
                missions={missions}
                conflits={conflits}
                jourChoisi={jourChoisi}
                onJour={(j) => setJourChoisi((c) => (c === j ? null : j))}
                onMission={(m) => navigate(`/missions/${m.id}`)}
              />
              {jourChoisi && (
                <Carte titre={`Missions du ${dateLongue(jourChoisi + 'T12:00:00')}`} className="mt-4" corps="p-0">
                  <ListeMissionsJour missions={missionsDuJour(new Date(jourChoisi + 'T00:00:00'))} conflits={conflits} jour={jourChoisi} />
                </Carte>
              )}
            </>
          ) : (
            <VueListe mois={mois} missionsDuJour={missionsDuJour} conflits={conflits} />
          )}

          <Carte
            className="mt-4"
            titre={
              <span className="inline-flex items-center gap-2">
                <AlertTriangle className={`h-4 w-4 ${conflitsDuMois.length ? 'text-red-600' : 'text-stone-400'}`} />
                Conflits du mois
                {conflitsDuMois.length > 0 && <Badge ton="rouge">{conflitsDuMois.length}</Badge>}
              </span>
            }
            corps="p-0"
          >
            {conflitsDuMois.length === 0 ? (
              <p className="px-4 py-4 text-sm text-stone-500 sm:px-5">
                Aucun conflit détecté parmi les missions affichées (participant ou véhicule engagé sur deux missions simultanées).
              </p>
            ) : (
              <ul className="divide-y divide-stone-100">
                {conflitsDuMois.map((c) => (
                  <li key={c.cle} className="px-4 py-3 text-sm sm:px-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                      {c.personnes.map((u) => (
                        <Badge key={u.id} ton="rouge">
                          <Users className="mr-1 h-3 w-3" /> {nomComplet(u)}
                        </Badge>
                      ))}
                      {c.vehicule && (
                        <Badge ton="rouge">
                          <Car className="mr-1 h-3 w-3" /> {c.vehicule.immatriculation}
                        </Badge>
                      )}
                      <span className="text-stone-500">
                        du {dateHeure(c.du)} au {dateHeure(c.au)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-stone-700">
                      {[c.a, c.b].map((m) => (
                        <Link key={m.id} to={`/missions/${m.id}`} className="font-medium text-brand-700 hover:underline">
                          {m.numero || `#${m.id}`} — {m.destination?.ville}
                        </Link>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Carte>
        </>
      )}
    </div>
  );
}

function Legende() {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-stone-600">
      {STATUTS_AFFICHES.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${COULEURS[s].pastille}`} /> {LIBELLES.statutMission[s]}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5 text-red-600" /> Conflit (participant ou véhicule)
      </span>
    </div>
  );
}

/** Vue mensuelle : une ligne par semaine, chaque mission est une barre sur ses jours. */
function GrilleMois({ semaines, mois, missions, conflits, jourChoisi, onJour, onMission }) {
  const cleAujourdhui = cleJour(new Date());
  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-stone-200 bg-stone-50 text-center text-xs font-semibold uppercase tracking-wide text-stone-500">
        {JOURS.map((j) => (
          <div key={j} className="py-2">
            {j}
          </div>
        ))}
      </div>
      {semaines.map((semaine) => {
        const debut = semaine[0];
        const fin = ajouterJours(debut, 7);
        // Segments de la semaine, placés sur des lignes sans chevauchement.
        const segments = missions
          .filter((m) => new Date(m.dateDepart) < fin && new Date(m.dateRetour) >= debut)
          .map((m) => ({
            m,
            de: Math.max(0, ecartJours(debut, m.dateDepart)),
            a: Math.min(6, ecartJours(debut, m.dateRetour)),
            coupeGauche: new Date(m.dateDepart) < debut,
            coupeDroite: new Date(m.dateRetour) >= fin,
          }))
          .sort((x, y) => x.de - y.de || y.a - y.de - (x.a - x.de));
        const finsLignes = [];
        for (const s of segments) {
          let l = finsLignes.findIndex((f) => f < s.de);
          if (l === -1) l = finsLignes.length;
          finsLignes[l] = s.a;
          s.ligne = l;
        }
        const caches = Array(7).fill(0);
        segments.filter((s) => s.ligne >= MAX_LIGNES).forEach((s) => {
          for (let k = s.de; k <= s.a; k += 1) caches[k] += 1;
        });
        return (
          <div key={debut.getTime()} className="relative min-h-[7rem] border-b border-stone-200 last:border-b-0">
            {/* Fond cliquable : un bouton par jour */}
            <div className="absolute inset-0 grid grid-cols-7">
              {semaine.map((j) => {
                const cle = cleJour(j);
                const horsMois = j.getMonth() !== mois.getMonth();
                return (
                  <button
                    key={cle}
                    type="button"
                    onClick={() => onJour(cle)}
                    aria-label={dateLongue(j)}
                    className={`border-l border-stone-100 first:border-l-0 hover:bg-stone-50 ${horsMois ? 'bg-stone-50/70' : ''} ${
                      jourChoisi === cle ? '!bg-brand-50 ring-1 ring-inset ring-brand-300' : ''
                    }`}
                  />
                );
              })}
            </div>
            {/* Premier plan : numéros de jour et barres */}
            <div className="pointer-events-none relative grid grid-cols-7 gap-y-1 pb-2" style={{ gridAutoRows: 'minmax(1.25rem, auto)' }}>
              {semaine.map((j, k) => {
                const cle = cleJour(j);
                const horsMois = j.getMonth() !== mois.getMonth();
                return (
                  <div key={cle} className="flex items-center justify-between px-1.5 pt-1" style={{ gridColumn: k + 1, gridRow: 1 }}>
                    <span
                      className={`inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-1 text-xs font-medium ${
                        cle === cleAujourdhui ? 'bg-brand-700 text-white' : horsMois ? 'text-stone-400' : 'text-stone-700'
                      }`}
                    >
                      {j.getDate()}
                    </span>
                    {conflits.jours.has(cle) && <AlertTriangle className="h-3.5 w-3.5 text-red-600" aria-label="Conflit ce jour" />}
                  </div>
                );
              })}
              {segments
                .filter((s) => s.ligne < MAX_LIGNES)
                .map((s) => {
                  const enConflit = conflits.parMission.has(s.m.id);
                  const c = COULEURS[s.m.statut];
                  return (
                    <button
                      key={`${s.m.id}-${s.de}`}
                      type="button"
                      onClick={() => onMission(s.m)}
                      title={`${s.m.numero || ''} ${s.m.objet}\n${s.m.destination?.ville} — ${dateHeure(s.m.dateDepart)} → ${dateHeure(
                        s.m.dateRetour
                      )}\n${LIBELLES.statutMission[s.m.statut]}${enConflit ? '\n⚠ Conflit' : ''}`}
                      style={{ gridColumn: `${s.de + 1} / ${s.a + 2}`, gridRow: s.ligne + 2 }}
                      className={`pointer-events-auto mx-0.5 flex min-w-0 items-center gap-1 truncate px-1.5 py-0.5 text-left text-[11px] font-medium leading-tight hover:brightness-95 ${c.barre} ${
                        s.coupeGauche ? 'rounded-l-none' : 'rounded-l border-l-[3px]'
                      } ${s.coupeDroite ? 'rounded-r-none' : 'rounded-r'} ${enConflit ? 'ring-2 ring-inset ring-red-500' : ''}`}
                    >
                      {enConflit && <AlertTriangle className="h-3 w-3 shrink-0 text-red-600" />}
                      <span className="truncate">
                        {s.m.destination?.ville}
                        <span className="hidden font-normal opacity-75 lg:inline"> · {s.m.numero || s.m.objet}</span>
                      </span>
                    </button>
                  );
                })}
              {caches.map(
                (n, k) =>
                  n > 0 && (
                    <span key={`plus-${k}`} className="px-1.5 text-[11px] font-medium text-stone-500" style={{ gridColumn: k + 1, gridRow: MAX_LIGNES + 2 }}>
                      +{n} autre{n > 1 ? 's' : ''}
                    </span>
                  )
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Ligne de mission (vue liste et détail d'un jour). */
function LigneMission({ m, conflits, jour }) {
  const enConflit = conflits.parMission.get(m.id) || [];
  const conflitCeJour = jour ? enConflit.some((c) => cleJour(c.du) <= jour && cleJour(c.au) >= jour) : enConflit.length > 0;
  const nbJours = ecartJours(m.dateDepart, m.dateRetour) + 1;
  const rang = jour ? ecartJours(m.dateDepart, jour + 'T12:00:00') + 1 : null;
  return (
    <li>
      <Link to={`/missions/${m.id}`} className={`block border-l-4 px-4 py-3 hover:bg-stone-50 sm:px-5 ${COULEURS[m.statut]?.bord}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-stone-900">{m.numero || `#${m.id}`}</span>
          <StatutMission statut={m.statut} />
          {conflitCeJour && (
            <Badge ton="rouge">
              <AlertTriangle className="mr-1 h-3 w-3" /> Conflit
            </Badge>
          )}
          {nbJours > 1 && rang && (
            <span className="text-xs text-stone-500">
              Jour {rang}/{nbJours}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-stone-700">{m.objet}</p>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" /> {m.destination?.ville}
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" />
            {nbJours > 1 ? `${dateHeure(m.dateDepart)} → ${dateHeure(m.dateRetour)}` : `${heure(m.dateDepart)} → ${heure(m.dateRetour)}`}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> {(m.participants || []).map((p) => nomComplet(p.user)).join(', ') || '—'}
          </span>
          {m.vehicule && (
            <span className="inline-flex items-center gap-1">
              <Car className="h-3.5 w-3.5" /> {m.vehicule.immatriculation}
            </span>
          )}
          <span>{m.service?.nom}</span>
        </div>
      </Link>
    </li>
  );
}

function ListeMissionsJour({ missions, conflits, jour }) {
  if (!missions.length) return <Vide titre="Aucune mission ce jour" />;
  return (
    <ul className="divide-y divide-stone-100">
      {missions.map((m) => (
        <LigneMission key={m.id} m={m} conflits={conflits} jour={jour} />
      ))}
    </ul>
  );
}

/** Vue liste : chronologique, groupée par jour du mois. */
function VueListe({ mois, missionsDuJour, conflits }) {
  const nbJours = new Date(mois.getFullYear(), mois.getMonth() + 1, 0).getDate();
  const jours = Array.from({ length: nbJours }, (_, i) => new Date(mois.getFullYear(), mois.getMonth(), i + 1))
    .map((j) => ({ j, cle: cleJour(j), missions: missionsDuJour(j) }))
    .filter((x) => x.missions.length);
  if (!jours.length) {
    return (
      <div className="card">
        <Vide titre="Aucune mission ce mois-ci" texte="Changez de mois ou modifiez les filtres." />
      </div>
    );
  }
  const cleAujourdhui = cleJour(new Date());
  return (
    <div className="space-y-3">
      {jours.map(({ j, cle, missions }) => (
        <section key={cle} className="card overflow-hidden">
          <h3
            className={`flex items-center justify-between gap-2 border-b border-stone-100 px-4 py-2 text-sm font-semibold sm:px-5 ${
              cle === cleAujourdhui ? 'bg-brand-50 text-brand-800' : 'bg-stone-50 text-stone-700'
            }`}
          >
            <span className="first-letter:uppercase">{dateLongue(j)}</span>
            {conflits.jours.has(cle) && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
                <AlertTriangle className="h-3.5 w-3.5" /> Conflit
              </span>
            )}
          </h3>
          <ListeMissionsJour missions={missions} conflits={conflits} jour={cle} />
        </section>
      ))}
    </div>
  );
}
