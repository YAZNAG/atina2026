import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  Pencil,
  Send,
  Check,
  XCircle,
  Play,
  Flag,
  Ban,
  RotateCcw,
  Receipt,
  Trash2,
  Plus,
  Paperclip,
  CheckCircle2,
  Circle,
  SkipForward,
} from 'lucide-react';
import api, { lire, ouvrirFichier } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useDonnees, action } from '../../hooks/useDonnees';
import {
  Badge,
  Carte,
  Champ,
  Chargement,
  Confirmation,
  EnTete,
  Erreur,
  Info,
  Modale,
  Onglets,
  Select,
  StatutAvance,
  StatutMission,
  StatutNote,
  Tableau,
  Vide,
} from '../../components/ui';
import { LIBELLES, date, dateHeure, mad, nomComplet, options, versInputDate } from '../../lib/format';

function Circuit({ mission }) {
  const etapes = mission.circuit?.etapes || [];
  if (!etapes.length) return <p className="text-sm text-stone-500">La mission n'a pas encore été soumise.</p>;
  return (
    <ol className="space-y-4">
      {etapes.map((e) => {
        const v = [...mission.validations].reverse().find((x) => x.etapeOrdre === e.ordre);
        const courante = mission.statut === 'EN_ATTENTE' && mission.etapeCourante === e.ordre;
        const Icone = v?.decision === 'APPROUVE' ? CheckCircle2 : v?.decision === 'REFUSE' ? XCircle : v?.decision === 'SAUTE' ? SkipForward : Circle;
        const couleur = v?.decision === 'APPROUVE' ? 'text-emerald-600' : v?.decision === 'REFUSE' ? 'text-red-600' : courante ? 'text-amber-500' : 'text-stone-300';
        return (
          <li key={e.id} className="flex gap-3">
            <Icone className={`mt-0.5 h-5 w-5 shrink-0 ${couleur}`} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-stone-900">
                {e.ordre}. {e.libelle}
                {courante && (
                  <Badge ton="orange" className="ml-2">
                    En attente
                  </Badge>
                )}
              </p>
              <p className="text-xs text-stone-500">
                {e.typeEtape === 'UTILISATEUR' ? nomComplet(e.utilisateur) : e.typeEtape === 'ROLE' ? LIBELLES.role[e.role] : 'Responsable du service'}
                {e.seuilMontant ? ` · au-delà de ${mad(e.seuilMontant)}` : ''}
              </p>
              {v && (
                <p className="mt-1 text-xs text-stone-600">
                  {LIBELLES.decision[v.decision]}
                  {v.validateur ? ` par ${nomComplet(v.validateur)}` : ''} le {dateHeure(v.createdAt)}
                  {v.commentaire && <span className="block italic text-stone-500">« {v.commentaire} »</span>}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const RESA_VIDE = { type: 'BILLET_TRAIN', prestataire: '', reference: '', description: '', dateDebut: '', dateFin: '', nbNuits: 0, montant: '', payePar: 'CHAMBRE', beneficiaireId: '' };

function Reservations({ mission, recharger }) {
  const [edition, setEdition] = useState(null);
  const [fichier, setFichier] = useState(null);
  const peutGerer = mission.droits.gererReservations;

  const enregistrer = async () => {
    const f = edition;
    let documentId = f.documentId ?? null;
    if (fichier) {
      const fd = new FormData();
      fd.append('fichier', fichier);
      fd.append('missionId', mission.id);
      fd.append('categorie', 'RESERVATION');
      const r = await action(() => api.post('/documents', fd));
      if (!r) return;
      documentId = r.data.data.id;
    }
    const corps = {
      type: f.type,
      prestataire: f.prestataire || null,
      reference: f.reference || null,
      description: f.description || null,
      dateDebut: new Date(f.dateDebut).toISOString(),
      dateFin: f.dateFin ? new Date(f.dateFin).toISOString() : null,
      nbNuits: Number(f.nbNuits || 0),
      montant: Number(f.montant),
      payePar: f.payePar,
      beneficiaireId: f.beneficiaireId ? Number(f.beneficiaireId) : null,
      documentId,
    };
    const ok = await action(
      () => (f.id ? api.put(`/missions/${mission.id}/reservations/${f.id}`, corps) : api.post(`/missions/${mission.id}/reservations`, corps)),
      'Réservation enregistrée'
    );
    if (ok) {
      setEdition(null);
      setFichier(null);
      recharger();
    }
  };

  const supprimer = async (r) => {
    if (!window.confirm('Supprimer cette réservation ?')) return;
    if (await action(() => api.delete(`/missions/${mission.id}/reservations/${r.id}`), 'Réservation supprimée')) recharger();
  };

  const set = (k) => (e) => setEdition((x) => ({ ...x, [k]: e.target.value }));

  return (
    <Carte
      titre="Billets, transport et nuitées"
      corps="p-0"
      actions={
        peutGerer && (
          <button className="btn-secondary btn-sm" onClick={() => setEdition({ ...RESA_VIDE, dateDebut: versInputDate(mission.dateDepart) })}>
            <Plus className="h-4 w-4" /> Ajouter
          </button>
        )
      }
    >
      {mission.reservations.length === 0 ? (
        <Vide titre="Aucune réservation" texte="Enregistrez ici les billets et nuitées réservés ou payés pour la mission." />
      ) : (
        <Tableau>
          <thead>
            <tr>
              <th>Type</th>
              <th>Prestataire / réf.</th>
              <th>Dates</th>
              <th>Payé par</th>
              <th className="text-right">Montant</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {mission.reservations.map((r) => (
              <tr key={r.id}>
                <td>
                  {LIBELLES.typeReservation[r.type]}
                  {r.nbNuits > 0 && <span className="block text-xs text-stone-500">{r.nbNuits} nuit(s)</span>}
                </td>
                <td>
                  {[r.prestataire, r.reference].filter(Boolean).join(' — ') || '—'}
                  {r.document && (
                    <button className="flex items-center gap-1 text-xs text-brand-700 hover:underline" onClick={() => ouvrirFichier(`/documents/${r.document.id}`)}>
                      <Paperclip className="h-3 w-3" /> {r.document.nomOriginal}
                    </button>
                  )}
                </td>
                <td className="whitespace-nowrap">
                  {date(r.dateDebut)}
                  {r.dateFin && ` → ${date(r.dateFin)}`}
                </td>
                <td>{r.payePar === 'CHAMBRE' ? <Badge ton="bleu">Chambre</Badge> : <Badge>Agent</Badge>}</td>
                <td className="whitespace-nowrap text-right">{mad(r.montant)}</td>
                <td className="whitespace-nowrap text-right">
                  {peutGerer && (
                    <>
                      <button
                        className="btn-ghost btn-sm"
                        aria-label="Modifier"
                        onClick={() => setEdition({ ...RESA_VIDE, ...r, dateDebut: versInputDate(r.dateDebut), dateFin: versInputDate(r.dateFin), beneficiaireId: r.beneficiaireId ?? '' })}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button className="btn-ghost btn-sm text-red-600" aria-label="Supprimer" onClick={() => supprimer(r)}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Tableau>
      )}
      <Modale
        ouverte={Boolean(edition)}
        onFermer={() => setEdition(null)}
        titre={edition?.id ? 'Modifier la réservation' : 'Nouvelle réservation'}
        pied={
          <>
            <button className="btn-secondary" onClick={() => setEdition(null)}>
              Annuler
            </button>
            <button className="btn-primary" disabled={!edition?.dateDebut || edition?.montant === ''} onClick={enregistrer}>
              Enregistrer
            </button>
          </>
        }
      >
        {edition && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ label="Type" requis>
              <Select options={options(LIBELLES.typeReservation)} value={edition.type} onChange={set('type')} />
            </Champ>
            <Champ label="Payé par" requis>
              <Select
                options={[
                  { value: 'CHAMBRE', label: 'La Chambre (prise en charge directe)' },
                  { value: 'AGENT', label: "L'agent (à reporter sur sa note de frais)" },
                ]}
                value={edition.payePar}
                onChange={set('payePar')}
              />
            </Champ>
            <Champ label="Prestataire">
              <input className="input" value={edition.prestataire || ''} onChange={set('prestataire')} />
            </Champ>
            <Champ label="Référence / n° de billet">
              <input className="input" value={edition.reference || ''} onChange={set('reference')} />
            </Champ>
            <Champ label="Date" requis>
              <input type="date" className="input" value={edition.dateDebut} onChange={set('dateDebut')} />
            </Champ>
            <Champ label="Date de fin">
              <input type="date" className="input" value={edition.dateFin || ''} onChange={set('dateFin')} />
            </Champ>
            {edition.type === 'HEBERGEMENT' && (
              <Champ label="Nombre de nuits">
                <input type="number" min="0" className="input" value={edition.nbNuits} onChange={set('nbNuits')} />
              </Champ>
            )}
            <Champ label="Montant (MAD)" requis>
              <input type="number" min="0" step="0.01" className="input" value={edition.montant} onChange={set('montant')} />
            </Champ>
            <Champ label="Bénéficiaire" aide="Vide = tous les participants">
              <Select vide="Tous" options={mission.participants.map((p) => ({ value: p.userId, label: nomComplet(p.user) }))} value={edition.beneficiaireId} onChange={set('beneficiaireId')} />
            </Champ>
            <Champ label="Billet / facture (PDF ou photo)">
              <input type="file" accept="image/*,application/pdf" className="input" onChange={(e) => setFichier(e.target.files[0] || null)} />
            </Champ>
            <Champ label="Description" className="sm:col-span-2">
              <input className="input" value={edition.description || ''} onChange={set('description')} />
            </Champ>
          </div>
        )}
      </Modale>
    </Carte>
  );
}

function Echanges({ mission }) {
  const { utilisateur } = useAuth();
  const { donnees, recharger } = useDonnees(() => lire(`/missions/${mission.id}/messages`), [mission.id]);
  const [texte, setTexte] = useState('');
  const envoyer = async (e) => {
    e.preventDefault();
    if (!texte.trim()) return;
    if (await action(() => api.post(`/missions/${mission.id}/messages`, { contenu: texte.trim() }))) {
      setTexte('');
      recharger();
    }
  };
  return (
    <Carte titre="Échanges">
      {!donnees ? (
        <Chargement />
      ) : donnees.length === 0 ? (
        <p className="pb-4 text-sm text-stone-500">Aucun message. Les échanges sont visibles par le demandeur, les participants et les validateurs.</p>
      ) : (
        <ul className="mb-4 space-y-3">
          {donnees.map((m) => {
            const moi = m.auteur.id === utilisateur.id;
            return (
              <li key={m.id} className={`flex ${moi ? 'justify-end' : ''}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${moi ? 'bg-brand-700 text-white' : 'bg-stone-100 text-stone-800'}`}>
                  <p className={`text-xs ${moi ? 'text-brand-100' : 'text-stone-500'}`}>
                    {nomComplet(m.auteur)} · {dateHeure(m.createdAt)}
                  </p>
                  <p className="whitespace-pre-line">{m.contenu}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <form onSubmit={envoyer} className="flex gap-2">
        <input className="input" placeholder="Écrire un message…" value={texte} onChange={(e) => setTexte(e.target.value)} maxLength={4000} />
        <button className="btn-primary" disabled={!texte.trim()}>
          <Send className="h-4 w-4" />
        </button>
      </form>
    </Carte>
  );
}

function Historique({ mission }) {
  const { donnees } = useDonnees(() => lire(`/missions/${mission.id}/historique`), [mission.id, mission.updatedAt]);
  if (!donnees) return <Chargement />;
  return (
    <Carte titre="Historique des modifications" corps="p-0">
      <ul className="divide-y divide-stone-100">
        {donnees.audits.map((a) => (
          <li key={a.id} className="px-4 py-3 text-sm sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-stone-900">{a.action.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())}</span>
              <span className="text-xs text-stone-500">
                {a.user ? nomComplet(a.user) : 'Système'} · {dateHeure(a.createdAt)}
              </span>
            </div>
            {a.apres && a.avant && (
              <ul className="mt-1 space-y-0.5 text-xs text-stone-600">
                {Object.keys(a.apres)
                  .filter((k) => !['updatedAt', 'createdAt'].includes(k))
                  .slice(0, 8)
                  .map((k) => (
                    <li key={k}>
                      <span className="font-medium">{k}</span> : <span className="text-stone-400 line-through">{String(a.avant[k] ?? '—')}</span> → {String(a.apres[k] ?? '—')}
                    </li>
                  ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </Carte>
  );
}

function Documents({ mission, recharger }) {
  const [fichier, setFichier] = useState(null);
  const envoyer = async () => {
    const fd = new FormData();
    fd.append('fichier', fichier);
    fd.append('missionId', mission.id);
    fd.append('categorie', 'MISSION');
    if (await action(() => api.post('/documents', fd), 'Document ajouté')) {
      setFichier(null);
      recharger();
    }
  };
  return (
    <Carte titre="Pièces de la mission">
      {mission.documents.length === 0 ? (
        <p className="mb-4 text-sm text-stone-500">Invitation, programme, compte rendu… Les pièces sont chiffrées et conservées pendant la durée légale.</p>
      ) : (
        <ul className="mb-4 divide-y divide-stone-100">
          {mission.documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <button className="flex min-w-0 items-center gap-2 text-brand-700 hover:underline" onClick={() => ouvrirFichier(`/documents/${d.id}`)}>
                <Paperclip className="h-4 w-4 shrink-0" />
                <span className="truncate">{d.nomOriginal}</span>
              </button>
              <span className="shrink-0 text-xs text-stone-500">{dateHeure(d.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input type="file" accept="image/*,application/pdf" className="input" onChange={(e) => setFichier(e.target.files[0] || null)} />
        <button className="btn-secondary shrink-0" disabled={!fichier} onClick={envoyer}>
          <Plus className="h-4 w-4" /> Joindre
        </button>
      </div>
    </Carte>
  );
}

export default function DetailMission() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const onglet = params.get('onglet') || 'infos';
  const { utilisateur } = useAuth();
  const navigate = useNavigate();
  const [dialogue, setDialogue] = useState(null);
  const { donnees: m, chargement, erreur, recharger } = useDonnees(() => lire(`/missions/${id}`), [id]);

  if (chargement && !m) return <Chargement />;
  if (erreur) return <Erreur message={erreur} onRetry={recharger} />;

  const d = m.droits;
  const post = async (chemin, corps, msg) => {
    const r = await action(() => api.post(`/missions/${m.id}/${chemin}`, corps), msg);
    if (r) {
      setDialogue(null);
      recharger();
    }
  };
  const maNote = m.notesFrais.find((n) => n.agentId === utilisateur.id);
  const saisirFrais = async () => {
    if (maNote) return navigate(`/notes-frais/${maNote.id}`);
    const r = await action(() => api.post('/notes-frais', { missionId: m.id }), 'Note de frais créée');
    if (r) navigate(`/notes-frais/${r.data.data.id}`);
  };
  const supprimer = async () => {
    if (await action(() => api.delete(`/missions/${m.id}`), 'Brouillon supprimé')) navigate('/missions');
  };
  const nomParticipant = (uid) => nomComplet(m.participants.find((p) => p.userId === uid)?.user);

  return (
    <>
      <EnTete
        retour={
          <Link to="/missions" className="mb-1 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800">
            <ArrowLeft className="h-4 w-4" /> Missions
          </Link>
        }
        titre={m.objet}
        sousTitre={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-stone-700">{m.numero || 'Brouillon non numéroté'}</span>
            <StatutMission statut={m.statut} />
            <span>
              {m.destination.ville} · {dateHeure(m.dateDepart)} → {dateHeure(m.dateRetour)}
            </span>
          </span>
        }
        actions={
          <>
            {d.modifier && (
              <Link to={`/missions/${m.id}/modifier`} className="btn-secondary">
                <Pencil className="h-4 w-4" /> Modifier
              </Link>
            )}
            {d.soumettre && (
              <button className="btn-primary" onClick={() => post('soumettre', {}, (r) => r.data.message)}>
                <Send className="h-4 w-4" /> Soumettre
              </button>
            )}
            {d.valider && (
              <>
                <button className="btn-success" onClick={() => setDialogue('approuver')}>
                  <Check className="h-4 w-4" /> Approuver
                </button>
                <button className="btn-danger" onClick={() => setDialogue('refuser')}>
                  <XCircle className="h-4 w-4" /> Refuser
                </button>
              </>
            )}
            {d.demarrer && (
              <button className="btn-secondary" onClick={() => post('demarrer', {}, 'Mission démarrée')}>
                <Play className="h-4 w-4" /> Démarrer
              </button>
            )}
            {d.cloturer && (
              <button className="btn-secondary" onClick={() => setDialogue('cloturer')}>
                <Flag className="h-4 w-4" /> Clôturer
              </button>
            )}
            {d.saisirFrais && (
              <button className="btn-primary" onClick={saisirFrais}>
                <Receipt className="h-4 w-4" /> {maNote ? 'Ma note de frais' : 'Saisir mes frais'}
              </button>
            )}
            {d.reviser && (
              <button className="btn-secondary" onClick={() => post('reviser', {}, 'Mission repassée en brouillon')}>
                <RotateCcw className="h-4 w-4" /> Réviser
              </button>
            )}
            <button className="btn-secondary" onClick={() => ouvrirFichier(`/missions/${m.id}/pdf`)}>
              <FileText className="h-4 w-4" /> Ordre de mission
            </button>
            {d.annuler && (
              <button className="btn-ghost text-red-600" onClick={() => setDialogue('annuler')}>
                <Ban className="h-4 w-4" /> Annuler
              </button>
            )}
            {d.modifier && !m.numero && (
              <button className="btn-ghost text-red-600" onClick={supprimer} aria-label="Supprimer le brouillon">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </>
        }
      />

      {m.motifRefus && ['REFUSE', 'ANNULE'].includes(m.statut) && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>{m.statut === 'REFUSE' ? 'Motif du refus' : "Motif d'annulation"} :</strong> {m.motifRefus}
        </div>
      )}

      <Onglets
        actif={onglet}
        onChange={(o) => setParams({ onglet: o }, { replace: true })}
        onglets={[
          { id: 'infos', label: 'Informations' },
          { id: 'reservations', label: 'Réservations', compteur: m.reservations.length },
          { id: 'frais', label: 'Frais et avances', compteur: m.notesFrais.length + m.avances.length },
          { id: 'echanges', label: 'Échanges' },
          { id: 'documents', label: 'Pièces', compteur: m.documents.length },
          { id: 'historique', label: 'Historique' },
        ]}
      />

      {onglet === 'infos' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <Carte titre="Mission">
              <dl className="grid gap-4 sm:grid-cols-2">
                <Info libelle="Destination">
                  {m.destination.ville} ({m.destination.pays}) — {m.destination.zone.libelle}
                </Info>
                <Info libelle="Lieu précis">{m.lieuPrecis}</Info>
                <Info libelle="Départ">{dateHeure(m.dateDepart)}</Info>
                <Info libelle="Retour">{dateHeure(m.dateRetour)}</Info>
                <Info libelle="Transport">{LIBELLES.moyenTransport[m.moyenTransport]}</Info>
                <Info libelle="Véhicule">{m.vehicule ? `${m.vehicule.marque} ${m.vehicule.modele} — ${m.vehicule.immatriculation}` : null}</Info>
                <Info libelle="Demandeur">{nomComplet(m.demandeur)}</Info>
                <Info libelle="Service">{m.service.nom}</Info>
                <Info libelle="Projet">{m.projet ? `${m.projet.code} — ${m.projet.libelle}` : null}</Info>
                <Info libelle="Budget imputé">{m.budget?.libelle}</Info>
                <Info libelle="Repas fournis">{m.nbRepasFournis}</Info>
                <Info libelle="Hébergement pris en charge">{m.hebergementPrisEnCharge ? 'Oui' : 'Non'}</Info>
              </dl>
              {m.description && <p className="mt-4 whitespace-pre-line border-t border-stone-100 pt-4 text-sm text-stone-700">{m.description}</p>}
            </Carte>
            <Carte titre="Personnes concernées" corps="p-0">
              <ul className="divide-y divide-stone-100">
                {m.participants.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm sm:px-5">
                    <span>
                      <span className="font-medium text-stone-900">{nomComplet(p.user)}</span>
                      <span className="text-stone-500"> · {p.user.matricule}</span>
                    </span>
                    {p.chefMission && <Badge ton="brique">Chef de mission</Badge>}
                  </li>
                ))}
              </ul>
            </Carte>
          </div>
          <div className="space-y-5">
            <Carte titre="Coûts">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-stone-600">Transport estimé</dt>
                  <dd>{mad(m.fraisTransportEstimes)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-stone-600">Autres frais estimés</dt>
                  <dd>{mad(m.autresFraisEstimes)}</dd>
                </div>
                <div className="flex justify-between border-t border-stone-100 pt-2 text-base font-semibold">
                  <dt>Coût estimé total</dt>
                  <dd>{mad(m.coutEstime)}</dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-stone-500">Indemnités et nuitées calculées selon le barème en vigueur ; le détail figure sur l'ordre de mission.</p>
            </Carte>
            <Carte titre="Circuit de validation">
              <Circuit mission={m} />
            </Carte>
          </div>
        </div>
      )}

      {onglet === 'reservations' && <Reservations mission={m} recharger={recharger} />}

      {onglet === 'frais' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Carte titre="Notes de frais" corps="p-0">
            {m.notesFrais.length === 0 ? (
              <Vide titre="Aucune note de frais" texte="Chaque participant saisit sa note après approbation de la mission." />
            ) : (
              <ul className="divide-y divide-stone-100">
                {m.notesFrais.map((n) => (
                  <li key={n.id}>
                    <Link to={`/notes-frais/${n.id}`} className="flex items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-stone-50 sm:px-5">
                      <span>
                        <span className="font-medium">{n.numero || 'Brouillon'}</span> · {nomParticipant(n.agentId)}
                      </span>
                      <span className="flex items-center gap-2">
                        {mad(n.montantARembourser)} <StatutNote statut={n.statut} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Carte>
          <Carte
            titre="Avances"
            corps="p-0"
            actions={
              m.participants.some((p) => p.userId === utilisateur.id) &&
              ['EN_ATTENTE', 'APPROUVE', 'EN_COURS'].includes(m.statut) && (
                <Link to={`/avances?missionId=${m.id}`} className="btn-secondary btn-sm">
                  Demander une avance
                </Link>
              )
            }
          >
            {m.avances.length === 0 ? (
              <Vide titre="Aucune avance" />
            ) : (
              <ul className="divide-y divide-stone-100">
                {m.avances.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm sm:px-5">
                    <span>
                      <span className="font-medium">{a.numero || 'Demande'}</span> · {nomParticipant(a.agentId)}
                    </span>
                    <span className="flex items-center gap-2">
                      {mad(a.montant)} <StatutAvance statut={a.statut} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Carte>
        </div>
      )}

      {onglet === 'echanges' && <Echanges mission={m} />}
      {onglet === 'documents' && <Documents mission={m} recharger={recharger} />}
      {onglet === 'historique' && <Historique mission={m} />}

      <Confirmation
        ouverte={dialogue === 'approuver'}
        titre="Approuver la mission"
        message={`Vous validez l'étape « ${m.circuit?.etapes.find((e) => e.ordre === m.etapeCourante)?.libelle || ''} ».`}
        motif="Commentaire (facultatif)"
        libelleOk="Approuver"
        ton="success"
        onAnnuler={() => setDialogue(null)}
        onConfirmer={(c) => post('decision', { decision: 'APPROUVE', commentaire: c || undefined }, 'Validation enregistrée')}
      />
      <Confirmation
        ouverte={dialogue === 'refuser'}
        titre="Refuser la mission"
        message="Le demandeur sera notifié avec votre motif."
        motif="Motif du refus"
        motifRequis
        libelleOk="Refuser"
        ton="danger"
        onAnnuler={() => setDialogue(null)}
        onConfirmer={(c) => post('decision', { decision: 'REFUSE', commentaire: c }, 'Mission refusée')}
      />
      <Confirmation
        ouverte={dialogue === 'annuler'}
        titre="Annuler la mission"
        message="Les participants seront notifiés. Cette action est définitive."
        motif="Motif d'annulation"
        motifRequis
        libelleOk="Annuler la mission"
        ton="danger"
        onAnnuler={() => setDialogue(null)}
        onConfirmer={(c) => post('annuler', { motif: c }, 'Mission annulée')}
      />
      <Confirmation
        ouverte={dialogue === 'cloturer'}
        titre="Clôturer la mission"
        message="Les participants seront invités à saisir leur note de frais avec les justificatifs."
        libelleOk="Clôturer"
        onAnnuler={() => setDialogue(null)}
        onConfirmer={() => post('cloturer', {}, 'Mission clôturée')}
      />
    </>
  );
}
