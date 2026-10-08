import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, XCircle, Plane, Receipt } from 'lucide-react';
import api, { lire } from '../api/client';
import { useDonnees, action } from '../hooks/useDonnees';
import { Carte, Chargement, Confirmation, EnTete, Erreur, Vide } from '../components/ui';
import { date, dateHeure, mad, nomComplet } from '../lib/format';

function Ligne({ lien, titre, sousTitre, montant, depuis, onApprouver, onRefuser }) {
  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
      <Link to={lien} className="min-w-0 flex-1 hover:text-brand-700">
        <p className="text-sm font-medium text-stone-900">{titre}</p>
        <p className="text-xs text-stone-500">{sousTitre}</p>
        <p className="text-xs text-stone-400">Soumis le {dateHeure(depuis)}</p>
      </Link>
      <div className="flex items-center gap-2">
        <span className="mr-2 whitespace-nowrap text-sm font-semibold text-stone-900">{mad(montant)}</span>
        <button className="btn-success btn-sm" onClick={onApprouver}>
          <Check className="h-4 w-4" /> Approuver
        </button>
        <button className="btn-danger btn-sm" onClick={onRefuser}>
          <XCircle className="h-4 w-4" /> Refuser
        </button>
      </div>
    </li>
  );
}

export default function Validations() {
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const [missions, notes] = await Promise.all([lire('/missions/a-valider'), lire('/notes-frais/a-valider')]);
    return { missions, notes };
  });
  const [dialogue, setDialogue] = useState(null);

  if (chargement && !donnees) return <Chargement />;
  if (erreur) return <Erreur message={erreur} onRetry={recharger} />;

  const decider = async (commentaire) => {
    const { type, id, decision } = dialogue;
    const url = type === 'mission' ? `/missions/${id}/decision` : `/notes-frais/${id}/decision`;
    if (await action(() => api.post(url, { decision, commentaire: commentaire || undefined }))) {
      setDialogue(null);
      recharger();
    }
  };

  const etape = (o) => o.circuit?.etapes?.find((e) => e.ordre === o.etapeCourante)?.libelle;

  return (
    <>
      <EnTete titre="À valider" sousTitre="Demandes dont l'étape en cours attend votre décision" />
      <div className="space-y-5">
        <Carte titre={<span className="inline-flex items-center gap-2"><Plane className="h-4 w-4" /> Ordres de mission ({donnees.missions.length})</span>} corps="p-0">
          {donnees.missions.length === 0 ? (
            <Vide titre="Aucune mission en attente" />
          ) : (
            <ul className="divide-y divide-stone-100">
              {donnees.missions.map((m) => (
                <Ligne
                  key={m.id}
                  lien={`/missions/${m.id}`}
                  titre={`${m.numero} — ${m.objet}`}
                  sousTitre={`${nomComplet(m.demandeur)} · ${m.destination.ville} · du ${date(m.dateDepart)} au ${date(m.dateRetour)} · ${m.participants.length} pers. · ${etape(m) || ''}`}
                  montant={m.coutEstime}
                  depuis={m.soumisLe}
                  onApprouver={() => setDialogue({ type: 'mission', id: m.id, decision: 'APPROUVE', libelle: m.numero })}
                  onRefuser={() => setDialogue({ type: 'mission', id: m.id, decision: 'REFUSE', libelle: m.numero })}
                />
              ))}
            </ul>
          )}
        </Carte>
        <Carte titre={<span className="inline-flex items-center gap-2"><Receipt className="h-4 w-4" /> Notes de frais ({donnees.notes.length})</span>} corps="p-0">
          {donnees.notes.length === 0 ? (
            <Vide titre="Aucune note de frais en attente" />
          ) : (
            <ul className="divide-y divide-stone-100">
              {donnees.notes.map((n) => (
                <Ligne
                  key={n.id}
                  lien={`/notes-frais/${n.id}`}
                  titre={`${n.numero} — ${nomComplet(n.agent)}`}
                  sousTitre={`Mission ${n.mission.numero} · ${n.mission.objet} · ${etape(n) || ''}`}
                  montant={n.montantARembourser}
                  depuis={n.soumiseLe}
                  onApprouver={() => setDialogue({ type: 'note', id: n.id, decision: 'APPROUVE', libelle: n.numero })}
                  onRefuser={() => setDialogue({ type: 'note', id: n.id, decision: 'REFUSE', libelle: n.numero })}
                />
              ))}
            </ul>
          )}
        </Carte>
        <p className="text-xs text-stone-500">Pour contrôler les justificatifs ligne par ligne, ouvrez la note de frais.</p>
      </div>
      <Confirmation
        ouverte={Boolean(dialogue)}
        titre={dialogue?.decision === 'APPROUVE' ? `Approuver ${dialogue?.libelle}` : `Refuser ${dialogue?.libelle}`}
        message={dialogue?.decision === 'APPROUVE' ? 'La demande passera à l’étape suivante du circuit.' : 'Le demandeur sera notifié avec votre motif.'}
        motif={dialogue?.decision === 'APPROUVE' ? 'Commentaire (facultatif)' : 'Motif'}
        motifRequis={dialogue?.decision === 'REFUSE'}
        libelleOk={dialogue?.decision === 'APPROUVE' ? 'Approuver' : 'Refuser'}
        ton={dialogue?.decision === 'APPROUVE' ? 'success' : 'danger'}
        onAnnuler={() => setDialogue(null)}
        onConfirmer={decider}
      />
    </>
  );
}
