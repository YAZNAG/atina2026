import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, Search, Receipt } from 'lucide-react';
import api, { lire, lirePage, messageErreur } from '../../api/client';
import { useDonnees } from '../../hooks/useDonnees';
import { useAuth } from '../../context/AuthContext';
import { Chargement, Erreur, Vide, EnTete, Carte, StatutNote, StatutMission, Modale, Select, Pagination, Tableau, Spinner } from '../../components/ui';
import { mad, date, dateHeure, nomComplet, LIBELLES, options } from '../../lib/format';

/** Liste des notes de frais (les miennes, ou celles de mon périmètre). */
export default function ListeNotes() {
  const { peut } = useAuth();
  const navigate = useNavigate();
  const [saisie, setSaisie] = useState('');
  const [q, setQ] = useState('');
  const [statut, setStatut] = useState('');
  const [mes, setMes] = useState(!peut('note:controler'));
  const [page, setPage] = useState(1);
  const [nouvelle, setNouvelle] = useState(false);

  // Recherche différée pour ne pas interroger l'API à chaque frappe.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(saisie.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [saisie]);

  const { donnees, chargement, erreur, recharger } = useDonnees(
    () => lirePage('/notes-frais', { q: q || undefined, statut: statut || undefined, mes: mes ? 1 : undefined, page }),
    [q, statut, mes, page]
  );

  const notes = donnees?.data || [];
  const ouvrir = (id) => navigate(`/notes-frais/${id}`);

  return (
    <div>
      <EnTete
        titre="Notes de frais"
        sousTitre="Saisie des dépenses de mission, validation et remboursement"
        actions={
          <button className="btn-primary" onClick={() => setNouvelle(true)}>
            <Plus className="h-4 w-4" /> Nouvelle note de frais
          </button>
        }
      />

      <Carte corps="p-0">
        <div className="flex flex-col gap-3 border-b border-stone-100 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              className="input pl-9"
              type="search"
              placeholder="Rechercher (numéro, objet de mission, nom de l’agent)…"
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              aria-label="Rechercher"
            />
          </div>
          <div className="sm:w-48">
            <Select
              aria-label="Statut"
              vide="Tous les statuts"
              options={options(LIBELLES.statutNote)}
              value={statut}
              onChange={(e) => {
                setStatut(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap text-sm text-stone-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-stone-300 text-brand-700 focus:ring-brand-500"
              checked={mes}
              onChange={(e) => {
                setMes(e.target.checked);
                setPage(1);
              }}
            />
            Mes notes uniquement
          </label>
        </div>

        {chargement && !donnees ? (
          <Chargement />
        ) : erreur ? (
          <div className="p-4">
            <Erreur message={erreur} onRetry={recharger} />
          </div>
        ) : notes.length === 0 ? (
          <Vide
            titre="Aucune note de frais"
            texte={q || statut ? 'Aucune note ne correspond à ces critères.' : 'Créez une note de frais à partir d’une mission approuvée pour déclarer vos dépenses.'}
            action={
              !q && !statut ? (
                <button className="btn-primary btn-sm" onClick={() => setNouvelle(true)}>
                  <Plus className="h-4 w-4" /> Nouvelle note de frais
                </button>
              ) : null
            }
          />
        ) : (
          <>
            {/* Mobile : cartes */}
            <ul className="divide-y divide-stone-100 md:hidden">
              {notes.map((n) => (
                <li key={n.id}>
                  <button className="block w-full px-4 py-3 text-left hover:bg-stone-50" onClick={() => ouvrir(n.id)}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-stone-900">{n.numero || 'Brouillon'}</span>
                      <StatutNote statut={n.statut} />
                    </div>
                    <p className="mt-1 truncate text-sm text-stone-700">{n.mission?.objet}</p>
                    <p className="text-xs text-stone-500">
                      {n.mission?.numero} · {n.mission?.destination?.ville} · {nomComplet(n.agent)}
                    </p>
                    <div className="mt-1 flex items-center justify-between text-sm">
                      <span className={`font-semibold ${n.montantARembourser < 0 ? 'text-red-600' : 'text-stone-900'}`}>{mad(n.montantARembourser)}</span>
                      <span className="text-xs text-stone-500">Mise à jour {date(n.updatedAt)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>

            {/* Écran large : tableau */}
            <div className="hidden md:block">
              <Tableau>
                <thead>
                  <tr>
                    <th>Numéro</th>
                    <th>Agent</th>
                    <th>Mission</th>
                    <th>Statut</th>
                    <th className="text-right">À rembourser</th>
                    <th>Mise à jour</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {notes.map((n) => (
                    <tr key={n.id} className="cursor-pointer" onClick={() => ouvrir(n.id)}>
                      <td className="whitespace-nowrap font-medium text-brand-700">{n.numero || <span className="italic text-stone-400">Brouillon</span>}</td>
                      <td className="whitespace-nowrap">{nomComplet(n.agent)}</td>
                      <td className="min-w-[220px]">
                        <div className="text-stone-900">{n.mission?.objet}</div>
                        <div className="text-xs text-stone-500">
                          {n.mission?.numero} · {n.mission?.destination?.ville} · {date(n.mission?.dateDepart)}
                        </div>
                      </td>
                      <td>
                        <StatutNote statut={n.statut} />
                      </td>
                      <td className={`whitespace-nowrap text-right font-medium ${n.montantARembourser < 0 ? 'text-red-600' : ''}`}>{mad(n.montantARembourser)}</td>
                      <td className="whitespace-nowrap text-stone-500">{dateHeure(n.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </Tableau>
            </div>
            <Pagination meta={donnees.meta} onPage={setPage} />
          </>
        )}
      </Carte>

      <NouvelleNote ouverte={nouvelle} onFermer={() => setNouvelle(false)} />
    </div>
  );
}

/** Choix d'une mission éligible puis création de la note de frais. */
function NouvelleNote({ ouverte, onFermer }) {
  const { utilisateur } = useAuth();
  const navigate = useNavigate();
  const [missions, setMissions] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(null);

  useEffect(() => {
    if (!ouverte) return;
    setMissions(null);
    setErreur(null);
    lire('/missions', { mes: 1, statut: 'APPROUVE,EN_COURS,CLOTURE', limit: 100 })
      .then((liste) => setMissions(liste.filter((m) => !m.participants || m.participants.some((p) => p.userId === utilisateur?.id))))
      .catch((e) => setErreur(messageErreur(e)));
  }, [ouverte, utilisateur?.id]);

  const creer = async (missionId) => {
    setEnvoi(missionId);
    try {
      const r = await api.post('/notes-frais', { missionId });
      toast.success('Note de frais créée');
      onFermer();
      navigate(`/notes-frais/${r.data.data.id}`);
    } catch (e) {
      const existante = e?.response?.status === 409 && e.response.data?.details?.id;
      if (existante) {
        toast('Une note existe déjà pour cette mission : ouverture.', { icon: 'ℹ️' });
        onFermer();
        navigate(`/notes-frais/${existante}`);
      } else {
        toast.error(messageErreur(e), { duration: 6000 });
      }
    } finally {
      setEnvoi(null);
    }
  };

  return (
    <Modale ouverte={ouverte} onFermer={onFermer} titre="Nouvelle note de frais" large>
      <p className="mb-3 text-sm text-stone-600">
        Choisissez la mission (approuvée, en cours ou clôturée) pour laquelle vous déclarez vos frais. Une seule note est possible par mission.
      </p>
      {erreur ? (
        <Erreur message={erreur} />
      ) : !missions ? (
        <Chargement />
      ) : missions.length === 0 ? (
        <Vide titre="Aucune mission éligible" texte="Vous n’avez pas de mission approuvée, en cours ou clôturée à laquelle vous participez." />
      ) : (
        <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
          {missions.map((m) => (
            <li key={m.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-stone-900">{m.numero}</span>
                  <StatutMission statut={m.statut} />
                </div>
                <p className="truncate text-sm text-stone-700">{m.objet}</p>
                <p className="text-xs text-stone-500">
                  {m.destination?.ville} · du {date(m.dateDepart)} au {date(m.dateRetour)}
                </p>
              </div>
              <button className="btn-primary btn-sm shrink-0" disabled={envoi !== null} onClick={() => creer(m.id)}>
                {envoi === m.id ? <Spinner className="h-4 w-4 text-white" /> : <Receipt className="h-4 w-4" />} Créer la note
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modale>
  );
}
