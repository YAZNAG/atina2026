import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PlusCircle, Search, Users } from 'lucide-react';
import { lirePage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useDonnees } from '../../hooks/useDonnees';
import { Carte, Chargement, EnTete, Erreur, Pagination, Select, StatutMission, Tableau, Vide } from '../../components/ui';
import { LIBELLES, date, mad, nomComplet, options } from '../../lib/format';

export default function ListeMissions() {
  const { peut } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const vueLarge = peut('mission:lire_perimetre', 'mission:lire_tout');
  const filtres = {
    q: params.get('q') || '',
    statut: params.get('statut') || '',
    mes: params.get('mes') ?? (vueLarge ? '' : '1'),
    page: Number(params.get('page') || 1),
  };
  const [recherche, setRecherche] = useState(filtres.q);

  const maj = (champs) => {
    const p = new URLSearchParams(params);
    Object.entries({ page: '', ...champs }).forEach(([k, v]) => (v === '' || v === null ? p.delete(k) : p.set(k, v)));
    setParams(p, { replace: true });
  };

  const { donnees, chargement, erreur, recharger } = useDonnees(
    () => lirePage('/missions', { ...filtres, limit: 20 }),
    [filtres.q, filtres.statut, filtres.mes, filtres.page]
  );

  return (
    <>
      <EnTete
        titre="Missions"
        sousTitre="Ordres de mission et déplacements"
        actions={
          peut('mission:creer') && (
            <Link to="/missions/nouvelle" className="btn-primary">
              <PlusCircle className="h-4 w-4" /> Nouvelle mission
            </Link>
          )
        }
      />
      <Carte corps="p-0">
        <form
          className="grid gap-3 border-b border-stone-100 p-4 sm:grid-cols-[1fr_200px_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            maj({ q: recherche.trim() });
          }}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
            <input className="input pl-9" placeholder="N°, objet, destination…" value={recherche} onChange={(e) => setRecherche(e.target.value)} onBlur={() => maj({ q: recherche.trim() })} />
          </div>
          <Select vide="Tous les statuts" options={options(LIBELLES.statutMission)} value={filtres.statut} onChange={(e) => maj({ statut: e.target.value })} />
          {vueLarge && (
            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input type="checkbox" className="h-4 w-4 rounded border-stone-300 text-brand-600" checked={filtres.mes === '1'} onChange={(e) => maj({ mes: e.target.checked ? '1' : '0' })} />
              Mes missions uniquement
            </label>
          )}
        </form>

        {chargement && !donnees ? (
          <Chargement />
        ) : erreur ? (
          <div className="p-4">
            <Erreur message={erreur} onRetry={recharger} />
          </div>
        ) : donnees.data.length === 0 ? (
          <Vide
            titre="Aucune mission"
            texte={filtres.q || filtres.statut ? 'Aucun résultat pour ces critères.' : 'Les missions que vous demandez ou auxquelles vous participez apparaîtront ici.'}
          />
        ) : (
          <>
            {/* Mobile : cartes */}
            <ul className="divide-y divide-stone-100 md:hidden">
              {donnees.data.map((m) => (
                <li key={m.id}>
                  <Link to={`/missions/${m.id}`} className="block px-4 py-3 hover:bg-stone-50">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-stone-900">{m.objet}</p>
                      <StatutMission statut={m.statut} />
                    </div>
                    <p className="mt-1 text-xs text-stone-500">
                      {m.numero || 'Brouillon'} · {m.destination.ville} · {date(m.dateDepart)} → {date(m.dateRetour)}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-stone-500">
                      <Users className="h-3 w-3" /> {m.participants.map((p) => nomComplet(p.user)).join(', ')}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
            {/* Écran large : tableau */}
            <div className="hidden md:block">
              <Tableau>
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Objet</th>
                    <th>Destination</th>
                    <th>Dates</th>
                    <th>Participants</th>
                    <th>Service</th>
                    <th className="text-right">Coût estimé</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {donnees.data.map((m) => (
                    <tr key={m.id} className="cursor-pointer" onClick={() => navigate(`/missions/${m.id}`)}>
                      <td className="whitespace-nowrap font-medium text-stone-900">{m.numero || <span className="text-stone-400">—</span>}</td>
                      <td className="max-w-xs">
                        <Link to={`/missions/${m.id}`} className="line-clamp-2 hover:text-brand-700" onClick={(e) => e.stopPropagation()}>
                          {m.objet}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap">{m.destination.ville}</td>
                      <td className="whitespace-nowrap text-stone-600">
                        {date(m.dateDepart)}
                        <br />
                        {date(m.dateRetour)}
                      </td>
                      <td className="max-w-[14rem] text-stone-600">{m.participants.map((p) => nomComplet(p.user)).join(', ')}</td>
                      <td className="text-stone-600">{m.service.nom}</td>
                      <td className="whitespace-nowrap text-right">{mad(m.coutEstime)}</td>
                      <td>
                        <StatutMission statut={m.statut} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Tableau>
            </div>
            <Pagination meta={donnees.meta} onPage={(page) => maj({ page: String(page) })} />
          </>
        )}
      </Carte>
    </>
  );
}
