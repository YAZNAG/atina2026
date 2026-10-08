import { Link } from 'react-router-dom';
import { CheckCheck } from 'lucide-react';
import api, { lire } from '../api/client';
import { useDonnees, action } from '../hooks/useDonnees';
import { Carte, Chargement, EnTete, Erreur, Vide } from '../components/ui';
import { dateHeure } from '../lib/format';

export default function Notifications() {
  const { donnees, chargement, erreur, recharger } = useDonnees(() => lire('/notifications', { limit: 100 }));

  const marquer = async (n) => {
    if (!n.lu) {
      await api.post(`/notifications/${n.id}/lue`);
      recharger();
    }
  };

  return (
    <>
      <EnTete
        titre="Notifications"
        sousTitre={donnees ? `${donnees.nonLues} non lue(s)` : null}
        actions={
          donnees?.nonLues > 0 && (
            <button className="btn-secondary" onClick={async () => (await action(() => api.post('/notifications/tout-lire'), 'Tout est marqué comme lu')) && recharger()}>
              <CheckCheck className="h-4 w-4" /> Tout marquer comme lu
            </button>
          )
        }
      />
      {chargement && !donnees ? (
        <Chargement />
      ) : erreur ? (
        <Erreur message={erreur} onRetry={recharger} />
      ) : (
        <Carte corps="p-0">
          {donnees.items.length === 0 ? (
            <Vide titre="Aucune notification" />
          ) : (
            <ul className="divide-y divide-stone-100">
              {donnees.items.map((n) => {
                const contenu = (
                  <div className={`flex gap-3 px-4 py-3 sm:px-5 ${n.lu ? '' : 'bg-brand-50/50'}`}>
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.lu ? 'bg-transparent' : 'bg-brand-600'}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm ${n.lu ? 'text-stone-700' : 'font-semibold text-stone-900'}`}>{n.titre}</p>
                      <p className="mt-0.5 whitespace-pre-line text-sm text-stone-600">{n.message}</p>
                      <p className="mt-1 text-xs text-stone-400">{dateHeure(n.createdAt)}</p>
                    </div>
                  </div>
                );
                return (
                  <li key={n.id} onClick={() => marquer(n)}>
                    {n.lien ? (
                      <Link to={n.lien} className="block hover:bg-stone-50">
                        {contenu}
                      </Link>
                    ) : (
                      contenu
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Carte>
      )}
    </>
  );
}
