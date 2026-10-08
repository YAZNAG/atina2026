import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  FileText,
  Send,
  Check,
  X,
  Banknote,
  RotateCcw,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  CheckCheck,
  Info as InfoIcone,
} from 'lucide-react';
import api, { lire, messageErreur, ouvrirFichier } from '../../api/client';
import { useDonnees, action } from '../../hooks/useDonnees';
import {
  Chargement,
  Erreur,
  Vide,
  EnTete,
  Carte,
  Badge,
  StatutNote,
  StatutMission,
  StatutControle,
  Modale,
  Champ,
  Select,
  Confirmation,
  Info,
  Tableau,
  Spinner,
} from '../../components/ui';
import { mad, nombre, date, dateHeure, nomComplet, versInputDate, LIBELLES, options } from '../../lib/format';
import LigneForm, { AjoutJustificatif, LienJustificatif } from './LigneForm';

const ACTIONS_AUDIT = {
  CREATION: 'Création de la note',
  AJOUT_LIGNE: 'Ajout d’une dépense',
  MODIFICATION_LIGNE: 'Modification d’une dépense',
  SUPPRESSION_LIGNE: 'Suppression d’une dépense',
  SOUMISSION: 'Soumission',
  VALIDATION: 'Validation',
  REJET: 'Rejet',
  CONTROLE_LIGNE: 'Contrôle d’une dépense',
  REMBOURSEMENT: 'Remboursement',
  REVISION: 'Remise en brouillon',
  EDITION_PDF: 'Édition du PDF',
};

const TON_DECISION = { APPROUVE: 'vert', REFUSE: 'rouge', SAUTE: 'gris' };

export default function DetailNote() {
  const { id } = useParams();
  const { donnees: n, chargement, erreur, recharger } = useDonnees(() => lire(`/notes-frais/${id}`), [id]);
  const hist = useDonnees(() => lire(`/notes-frais/${id}/historique`), [id]);

  const [ligneForm, setLigneForm] = useState(null); // { ligne } ou { ligne: null } pour un ajout
  const [aSupprimer, setASupprimer] = useState(null);
  const [nonConforme, setNonConforme] = useState(null);
  const [confirm, setConfirm] = useState(null); // 'soumettre' | 'valider' | 'rejeter' | 'reviser'
  const [remboursement, setRemboursement] = useState(false);
  const [manquants, setManquants] = useState(null);
  const [controleEnCours, setControleEnCours] = useState(false);

  const toutRecharger = () => {
    recharger();
    hist.recharger();
  };

  if (chargement && !n) return <Chargement />;
  if (erreur) return <Erreur message={erreur} onRetry={recharger} />;
  if (!n) return null;

  const d = n.droits || {};
  const lignes = n.lignes || [];
  const aControler = lignes.filter((l) => l.statutControle === 'EN_ATTENTE');
  const etapeCourante = n.statut === 'SOUMISE' ? n.circuit?.etapes?.find((e) => e.ordre === n.etapeCourante) : null;
  const idsManquants = new Set((manquants || []).map((m) => m.ligneId));

  const pdf = () => ouvrirFichier(`/notes-frais/${n.id}/pdf`).catch((e) => toast.error(messageErreur(e)));

  const soumettre = async () => {
    try {
      await api.post(`/notes-frais/${n.id}/soumettre`);
      toast.success('Note de frais soumise');
      setManquants(null);
      setConfirm(null);
      toutRecharger();
    } catch (e) {
      const corps = e?.response?.data;
      setConfirm(null);
      if (Array.isArray(corps?.details) && corps.details.some((x) => x.ligneId)) {
        setManquants(corps.details);
        toast.error(corps.message || 'Justificatifs manquants');
      } else {
        toast.error(messageErreur(e), { duration: 6000 });
      }
    }
  };

  const decider = async (decision, commentaire) => {
    const r = await action(
      () => api.post(`/notes-frais/${n.id}/decision`, { decision, ...(commentaire && { commentaire }) }),
      decision === 'APPROUVE' ? 'Validation enregistrée' : 'Note rejetée'
    );
    if (r) {
      setConfirm(null);
      toutRecharger();
    }
  };

  const reviser = async () => {
    const r = await action(() => api.post(`/notes-frais/${n.id}/reviser`), 'Note repassée en brouillon');
    if (r) {
      setConfirm(null);
      toutRecharger();
    }
  };

  const controler = async (ligne, statutControle, commentaireControle) => {
    const r = await action(
      () => api.post(`/notes-frais/${n.id}/lignes/${ligne.id}/controle`, { statutControle, commentaireControle: commentaireControle || null }),
      'Contrôle enregistré'
    );
    if (r) toutRecharger();
    return r;
  };

  const toutConforme = async () => {
    setControleEnCours(true);
    try {
      for (const l of aControler) {
        await api.post(`/notes-frais/${n.id}/lignes/${l.id}/controle`, { statutControle: 'CONFORME', commentaireControle: null });
      }
      toast.success('Dépenses marquées conformes');
    } catch (e) {
      toast.error(messageErreur(e), { duration: 6000 });
    } finally {
      setControleEnCours(false);
      toutRecharger();
    }
  };

  const supprimer = async () => {
    const r = await action(() => api.delete(`/notes-frais/${n.id}/lignes/${aSupprimer.id}`), 'Dépense supprimée');
    if (r) {
      setASupprimer(null);
      toutRecharger();
    }
  };

  const colonneControle = lignes.some((l) => l.statutControle !== 'EN_ATTENTE') || d.controler || n.statut !== 'BROUILLON';
  const actionsLigne = d.modifier || d.controler;

  return (
    <div>
      <EnTete
        retour={
          <Link to="/notes-frais" className="mb-1 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800">
            <ArrowLeft className="h-4 w-4" /> Notes de frais
          </Link>
        }
        titre={
          <span className="flex flex-wrap items-center gap-2">
            {n.numero ? `Note de frais ${n.numero}` : 'Note de frais (brouillon)'} <StatutNote statut={n.statut} />
          </span>
        }
        sousTitre={
          <>
            {nomComplet(n.agent)}
            {n.agent?.matricule && ` (${n.agent.matricule})`} — mission{' '}
            <Link to={`/missions/${n.missionId}`} className="font-medium text-zellige-700 hover:underline">
              {n.mission?.numero || `#${n.missionId}`}
            </Link>{' '}
            « {n.mission?.objet} »
          </>
        }
        actions={
          <>
            <button className="btn-secondary" onClick={pdf}>
              <FileText className="h-4 w-4" /> PDF
            </button>
            {d.reviser && (
              <button className="btn-secondary" onClick={() => setConfirm('reviser')}>
                <RotateCcw className="h-4 w-4" /> Corriger et resoumettre
              </button>
            )}
            {d.soumettre && (
              <button className="btn-primary" onClick={() => setConfirm('soumettre')} disabled={!lignes.length && !n.totalIndemnites}>
                <Send className="h-4 w-4" /> Soumettre
              </button>
            )}
            {d.valider && (
              <>
                <button className="btn-danger" onClick={() => setConfirm('rejeter')}>
                  <X className="h-4 w-4" /> Rejeter
                </button>
                <button className="btn-success" onClick={() => setConfirm('valider')}>
                  <Check className="h-4 w-4" /> Valider
                </button>
              </>
            )}
            {d.rembourser && (
              <button className="btn-success" onClick={() => setRemboursement(true)}>
                <Banknote className="h-4 w-4" /> Rembourser
              </button>
            )}
          </>
        }
      />

      {/* Bandeaux d'état */}
      <div className="mb-4 space-y-3">
        {n.statut === 'REJETEE' && (
          <Bandeau ton="rouge" titre="Note rejetée">
            <p className="whitespace-pre-line">{n.motifRejet || 'Aucun motif communiqué.'}</p>
            {d.reviser && <p className="mt-1 text-xs">Repassez la note en brouillon pour la corriger, puis soumettez-la à nouveau.</p>}
          </Bandeau>
        )}
        {manquants?.length > 0 && (
          <Bandeau ton="rouge" titre="Justificatifs manquants" onFermer={() => setManquants(null)}>
            <p>Ajoutez une pièce justificative aux dépenses suivantes avant de soumettre :</p>
            <ul className="mt-1 list-inside list-disc">
              {manquants.map((m, i) => (
                <li key={m.ligneId ?? i}>{m.message}</li>
              ))}
            </ul>
          </Bandeau>
        )}
        {etapeCourante && (
          <Bandeau ton="orange" titre="En cours de validation">
            Étape {etapeCourante.ordre} : {etapeCourante.libelle}
            {n.soumiseLe && ` — soumise le ${date(n.soumiseLe)}`}
            {d.valider && <strong className="ml-1">C’est à vous de statuer.</strong>}
          </Bandeau>
        )}
        {n.statut === 'VALIDEE' && d.rembourser && aControler.length > 0 && (
          <Bandeau ton="orange" titre="Contrôle requis avant remboursement">
            {aControler.length} dépense{aControler.length > 1 ? 's' : ''} reste{aControler.length > 1 ? 'nt' : ''} à contrôler.
          </Bandeau>
        )}
        {n.statut === 'REMBOURSEE' && (
          <Bandeau ton="vert" titre={Number(n.montantARembourser) < 0 ? 'Note régularisée' : 'Note remboursée'}>
            Le {date(n.rembourseeLe)} — {LIBELLES.modePaiement[n.modePaiement] || n.modePaiement || '—'}
            {n.referencePaiement && `, réf. ${n.referencePaiement}`}.
          </Bandeau>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Carte
            titre={`Dépenses (${lignes.length})`}
            corps="p-0"
            actions={
              <>
                {d.controler && aControler.length > 0 && (
                  <button className="btn-secondary btn-sm" onClick={toutConforme} disabled={controleEnCours}>
                    {controleEnCours ? <Spinner className="h-3.5 w-3.5" /> : <CheckCheck className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">Tout marquer conforme</span>
                    <span className="sm:hidden">Tout conforme</span>
                  </button>
                )}
                {d.modifier && (
                  <button className="btn-primary btn-sm" onClick={() => setLigneForm({ ligne: null })}>
                    <Plus className="h-3.5 w-3.5" /> Ajouter
                  </button>
                )}
              </>
            }
          >
            {lignes.length === 0 ? (
              <Vide
                titre="Aucune dépense"
                texte={
                  d.modifier
                    ? 'Ajoutez vos dépenses (transport, hébergement, repas…) avec leurs justificatifs. Les indemnités journalières sont calculées automatiquement.'
                    : 'Aucune dépense déclarée sur cette note.'
                }
              />
            ) : (
              <>
                {/* Mobile : cartes empilées */}
                <ul className="divide-y divide-stone-100 md:hidden">
                  {lignes.map((l) => (
                    <li key={l.id} className={`space-y-2 px-4 py-3 ${idsManquants.has(l.id) ? 'bg-red-50' : ''}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-stone-900">{LIBELLES.categorieFrais[l.categorie]}</p>
                          <p className="text-xs text-stone-500">{date(l.date)}</p>
                          {l.description && <p className="mt-0.5 text-sm text-stone-600">{l.description}</p>}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-semibold text-stone-900">{mad(l.montant)}</p>
                          <MontantRetenu ligne={l} />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Justificatif ligne={l} noteId={n.id} modifiable={d.modifier} onFait={toutRecharger} />
                        {colonneControle && <Controle ligne={l} />}
                      </div>
                      {actionsLigne && (
                        <ActionsLigne
                          ligne={l}
                          droits={d}
                          onModifier={() => setLigneForm({ ligne: l })}
                          onSupprimer={() => setASupprimer(l)}
                          onConforme={() => controler(l, 'CONFORME')}
                          onNonConforme={() => setNonConforme(l)}
                          onReinitialiser={() => controler(l, 'EN_ATTENTE')}
                        />
                      )}
                    </li>
                  ))}
                </ul>

                {/* Écran large : tableau */}
                <div className="hidden md:block">
                  <Tableau>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Catégorie</th>
                        <th>Description</th>
                        <th>Justificatif</th>
                        <th className="text-right">Montant</th>
                        <th className="text-right">Retenu</th>
                        {colonneControle && <th>Contrôle</th>}
                        {actionsLigne && <th className="text-right">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {lignes.map((l) => (
                        <tr key={l.id} className={idsManquants.has(l.id) ? 'bg-red-50' : ''}>
                          <td className="whitespace-nowrap">{date(l.date)}</td>
                          <td className="whitespace-nowrap">{LIBELLES.categorieFrais[l.categorie]}</td>
                          <td className="min-w-[160px] max-w-[260px] text-stone-600">{l.description || '—'}</td>
                          <td>
                            <Justificatif ligne={l} noteId={n.id} modifiable={d.modifier} onFait={toutRecharger} />
                          </td>
                          <td className="whitespace-nowrap text-right">{mad(l.montant)}</td>
                          <td className="whitespace-nowrap text-right">
                            <MontantRetenu ligne={l} complet />
                          </td>
                          {colonneControle && (
                            <td className="min-w-[120px]">
                              <Controle ligne={l} />
                            </td>
                          )}
                          {actionsLigne && (
                            <td className="text-right">
                              <ActionsLigne
                                ligne={l}
                                droits={d}
                                onModifier={() => setLigneForm({ ligne: l })}
                                onSupprimer={() => setASupprimer(l)}
                                onConforme={() => controler(l, 'CONFORME')}
                                onNonConforme={() => setNonConforme(l)}
                                onReinitialiser={() => controler(l, 'EN_ATTENTE')}
                              />
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-stone-200 bg-stone-50 font-semibold">
                        <td colSpan={4} className="text-right text-stone-600">
                          Total
                        </td>
                        <td className="whitespace-nowrap text-right">{mad(n.totalDepenses)}</td>
                        <td className="whitespace-nowrap text-right">{mad(n.totalRetenu)}</td>
                        {colonneControle && <td />}
                        {actionsLigne && <td />}
                      </tr>
                    </tfoot>
                  </Tableau>
                </div>
              </>
            )}
          </Carte>

          <Historique validations={n.validations || []} hist={hist} />
        </div>

        <div className="space-y-4">
          <Recapitulatif n={n} />
          <Carte titre="Mission">
            <dl className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Info libelle="Objet">
                  <Link to={`/missions/${n.missionId}`} className="text-zellige-700 hover:underline">
                    {n.mission?.objet}
                  </Link>
                </Info>
              </div>
              <Info libelle="Numéro">{n.mission?.numero}</Info>
              <Info libelle="Statut">{n.mission?.statut && <StatutMission statut={n.mission.statut} />}</Info>
              <Info libelle="Destination">{n.mission?.destination?.ville}</Info>
              <Info libelle="Période">
                {date(n.mission?.dateDepart)} → {date(n.mission?.dateRetour)}
              </Info>
              {n.soumiseLe && <Info libelle="Soumise le">{date(n.soumiseLe)}</Info>}
              {n.valideeLe && <Info libelle="Validée le">{date(n.valideeLe)}</Info>}
            </dl>
          </Carte>
        </div>
      </div>

      {/* Modales */}
      <LigneForm
        ouverte={!!ligneForm}
        onFermer={() => setLigneForm(null)}
        noteId={n.id}
        ligne={ligneForm?.ligne || null}
        mission={n.mission}
        onEnregistre={() => {
          setManquants(null);
          toutRecharger();
        }}
      />
      <Confirmation
        ouverte={!!aSupprimer}
        titre="Supprimer la dépense"
        message={aSupprimer && `Supprimer la dépense « ${LIBELLES.categorieFrais[aSupprimer.categorie]} » du ${date(aSupprimer.date)} (${mad(aSupprimer.montant)}) ?`}
        libelleOk="Supprimer"
        ton="danger"
        onAnnuler={() => setASupprimer(null)}
        onConfirmer={supprimer}
      />
      <Confirmation
        ouverte={!!nonConforme}
        titre="Dépense non conforme"
        message={nonConforme && `${LIBELLES.categorieFrais[nonConforme.categorie]} du ${date(nonConforme.date)} — ${mad(nonConforme.montant)}. Elle ne sera pas retenue dans le remboursement.`}
        motif="Motif de non-conformité"
        motifRequis
        libelleOk="Marquer non conforme"
        ton="danger"
        onAnnuler={() => setNonConforme(null)}
        onConfirmer={async (motif) => {
          if (await controler(nonConforme, 'NON_CONFORME', motif)) setNonConforme(null);
        }}
      />
      <Confirmation
        ouverte={confirm === 'soumettre'}
        titre="Soumettre la note de frais"
        message={`Montant à rembourser : ${mad(n.montantARembourser)}. Une fois soumise, la note ne sera plus modifiable et partira en validation.`}
        libelleOk="Soumettre"
        onAnnuler={() => setConfirm(null)}
        onConfirmer={soumettre}
      />
      <Confirmation
        ouverte={confirm === 'valider'}
        titre="Valider la note de frais"
        message={`Vous validez l’étape « ${etapeCourante?.libelle || ''} » pour un montant de ${mad(n.montantARembourser)}.`}
        motif="Commentaire (facultatif)"
        libelleOk="Valider"
        ton="success"
        onAnnuler={() => setConfirm(null)}
        onConfirmer={(c) => decider('APPROUVE', c)}
      />
      <Confirmation
        ouverte={confirm === 'rejeter'}
        titre="Rejeter la note de frais"
        message="L’agent sera notifié et pourra corriger sa note avant de la soumettre à nouveau."
        motif="Motif du rejet"
        motifRequis
        libelleOk="Rejeter"
        ton="danger"
        onAnnuler={() => setConfirm(null)}
        onConfirmer={(c) => decider('REFUSE', c)}
      />
      <Confirmation
        ouverte={confirm === 'reviser'}
        titre="Corriger la note"
        message="La note repasse en brouillon : vous pourrez modifier vos dépenses puis la soumettre à nouveau. Les contrôles déjà effectués seront réinitialisés."
        libelleOk="Repasser en brouillon"
        onAnnuler={() => setConfirm(null)}
        onConfirmer={reviser}
      />
      <ModaleRemboursement
        ouverte={remboursement}
        note={n}
        aControler={aControler.length}
        onFermer={() => setRemboursement(false)}
        onFait={() => {
          setRemboursement(false);
          toutRecharger();
        }}
      />
    </div>
  );
}

function Bandeau({ ton, titre, children, onFermer }) {
  const styles = {
    rouge: 'border-red-200 bg-red-50 text-red-800',
    orange: 'border-amber-200 bg-amber-50 text-amber-900',
    vert: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  };
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-3 text-sm sm:p-4 ${styles[ton]}`} role={ton === 'rouge' ? 'alert' : 'status'}>
      {ton === 'vert' ? <Check className="mt-0.5 h-5 w-5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />}
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{titre}</p>
        <div className="mt-0.5">{children}</div>
      </div>
      {onFermer && (
        <button className="btn-ghost btn-sm -m-1" onClick={onFermer} aria-label="Masquer">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function MontantRetenu({ ligne, complet = false }) {
  const different = Number(ligne.montantRetenu) !== Number(ligne.montant);
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      {(complet || different) && (
        <span className={different ? 'font-medium text-amber-700' : ''}>
          {!complet && 'Retenu : '}
          {mad(ligne.montantRetenu)}
        </span>
      )}
      {ligne.depassementPlafond && <Badge ton="orange">plafonné</Badge>}
    </span>
  );
}

function Justificatif({ ligne, noteId, modifiable, onFait }) {
  if (ligne.document) return <LienJustificatif document={ligne.document} />;
  if (modifiable) return <AjoutJustificatif noteId={noteId} ligne={ligne} onFait={onFait} />;
  return <Badge ton="orange">Aucun</Badge>;
}

function Controle({ ligne }) {
  return (
    <div className="space-y-0.5">
      <StatutControle statut={ligne.statutControle} />
      {ligne.commentaireControle && <p className="text-xs text-stone-500">{ligne.commentaireControle}</p>}
    </div>
  );
}

function ActionsLigne({ ligne, droits, onModifier, onSupprimer, onConforme, onNonConforme, onReinitialiser }) {
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {droits.modifier && (
        <>
          <button className="btn-ghost btn-sm" onClick={onModifier} aria-label="Modifier la dépense" title="Modifier">
            <Pencil className="h-4 w-4" />
          </button>
          <button className="btn-ghost btn-sm text-red-600 hover:bg-red-50" onClick={onSupprimer} aria-label="Supprimer la dépense" title="Supprimer">
            <Trash2 className="h-4 w-4" />
          </button>
        </>
      )}
      {droits.controler && (
        <>
          {ligne.statutControle !== 'CONFORME' && (
            <button className="btn-sm btn-secondary text-emerald-700" onClick={onConforme} title="Marquer conforme">
              <Check className="h-3.5 w-3.5" /> Conforme
            </button>
          )}
          {ligne.statutControle !== 'NON_CONFORME' && (
            <button className="btn-sm btn-secondary text-red-700" onClick={onNonConforme} title="Marquer non conforme">
              <X className="h-3.5 w-3.5" /> Non conforme
            </button>
          )}
          {ligne.statutControle !== 'EN_ATTENTE' && (
            <button className="btn-ghost btn-sm" onClick={onReinitialiser} title="Remettre à contrôler" aria-label="Remettre à contrôler">
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Ligne({ libelle, valeur, detail, fort, ton }) {
  return (
    <div className={`flex items-start justify-between gap-3 py-2 ${fort ? 'border-t border-stone-200 pt-3' : ''}`}>
      <div className="min-w-0">
        <p className={fort ? 'font-semibold text-stone-900' : 'text-sm text-stone-600'}>{libelle}</p>
        {detail && <p className="text-xs text-stone-500">{detail}</p>}
      </div>
      <p className={`whitespace-nowrap ${fort ? 'text-lg font-bold' : 'text-sm font-medium'} ${ton || 'text-stone-900'}`}>{valeur}</p>
    </div>
  );
}

function Recapitulatif({ n }) {
  const c = n.calcul || {};
  const ind = c.indemnites || {};
  const b = c.bareme;
  const net = Number(n.montantARembourser);
  const nonRetenu = Number(n.totalDepenses) - Number(n.totalRetenu);
  const plafondHebergement = b ? Number(b.plafondNuitee) * (c.nuitsRemboursables || 0) : 0;

  return (
    <Carte titre="Récapitulatif">
      <div className="divide-y divide-stone-100">
        <Ligne libelle="Total des dépenses déclarées" valeur={mad(n.totalDepenses)} />
        <Ligne
          libelle="Dépenses retenues"
          valeur={mad(n.totalRetenu)}
          detail={nonRetenu > 0 ? `${mad(nonRetenu)} non retenus (plafonds ou non-conformité)` : null}
        />
        <Ligne
          libelle="Indemnités journalières"
          valeur={mad(n.totalIndemnites)}
          detail={
            b ? (
              <>
                {nombre(ind.jours ?? n.joursIndemnises, 1)} j × {mad(ind.tauxJournalier ?? n.tauxJournalier)}
                {ind.deductionRepas > 0 && (
                  <>
                    <br />− {c.nbRepasFournis} repas fourni{c.nbRepasFournis > 1 ? 's' : ''} × {mad(b.tauxRepas)} = −{mad(ind.deductionRepas)}
                  </>
                )}
              </>
            ) : (
              'Aucun barème applicable'
            )
          }
        />
        <Ligne libelle="Avance déduite" valeur={Number(n.avanceDeduite) > 0 ? `− ${mad(n.avanceDeduite)}` : mad(0)} />
        {net < 0 ? (
          <Ligne libelle="Trop-perçu à reverser" valeur={mad(-net)} detail="L’avance dépasse les frais retenus : l’agent doit reverser la différence." fort ton="text-red-600" />
        ) : (
          <Ligne libelle="Net à rembourser" valeur={mad(net)} fort ton="text-emerald-700" />
        )}
      </div>

      <div className="mt-3 flex gap-2 rounded-lg bg-stone-50 p-3 text-xs text-stone-600">
        <InfoIcone className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" />
        <div className="space-y-1">
          {b ? (
            <p>
              Barème de la zone de destination pour la catégorie de l’agent : {mad(b.tauxJournalier)} par jour, {mad(b.tauxRepas)} par repas
              {Number(b.plafondNuitee) > 0 && `, hébergement plafonné à ${mad(b.plafondNuitee)} par nuit`}.
            </p>
          ) : (
            <p className="text-amber-700">Aucun barème ne correspond à la zone et à la catégorie de l’agent : les indemnités sont nulles. Contactez l’administrateur.</p>
          )}
          {c.hebergementPrisEnCharge ? (
            <p>Hébergement pris en charge par l’organisateur : aucune nuitée n’est remboursable.</p>
          ) : (
            <p>
              Nuits remboursables : {c.nuitsRemboursables ?? 0}
              {ind.nuits > (c.nuitsRemboursables ?? 0) && ` sur ${ind.nuits} (nuits réglées directement par la Chambre exclues)`}
              {plafondHebergement > 0 && ` — hébergement retenu dans la limite de ${mad(plafondHebergement)}`}.
            </p>
          )}
          <p>Les autres dépenses sont retenues dans la limite des plafonds par catégorie ; une dépense non conforme n’est pas retenue.</p>
        </div>
      </div>

      {n.avances?.length > 0 && (
        <p className="mt-3 text-xs text-stone-500">
          Avance(s) régularisée(s) :{' '}
          {n.avances.map((a) => `${a.numero || `#${a.id}`} (${mad(a.montant)})`).join(', ')} —{' '}
          <Link to="/avances" className="text-zellige-700 hover:underline">
            voir les avances
          </Link>
        </p>
      )}
    </Carte>
  );
}

function Historique({ validations, hist }) {
  const audits = hist.donnees?.audits || [];
  return (
    <Carte titre="Historique">
      <h3 className="mb-2 text-sm font-semibold text-stone-700">Circuit de validation</h3>
      {validations.length === 0 ? (
        <p className="mb-4 text-sm text-stone-500">Aucune décision enregistrée.</p>
      ) : (
        <ol className="mb-5 space-y-3">
          {validations.map((v) => (
            <li key={v.id} className="flex gap-3">
              <span
                className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${v.decision === 'APPROUVE' ? 'bg-emerald-500' : v.decision === 'REFUSE' ? 'bg-red-500' : 'bg-stone-300'}`}
              />
              <div className="min-w-0 flex-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-stone-900">
                    Étape {v.etapeOrdre} — {v.etapeLibelle}
                  </span>
                  <Badge ton={TON_DECISION[v.decision]}>{LIBELLES.decision[v.decision] || v.decision}</Badge>
                </div>
                <p className="text-xs text-stone-500">
                  {v.validateur ? nomComplet(v.validateur) : 'Automatique'} · {dateHeure(v.createdAt)}
                </p>
                {v.commentaire && <p className="mt-0.5 whitespace-pre-line text-stone-600">{v.commentaire}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}

      <h3 className="mb-2 text-sm font-semibold text-stone-700">Journal des opérations</h3>
      {hist.chargement && !hist.donnees ? (
        <Chargement />
      ) : hist.erreur ? (
        <Erreur message={hist.erreur} onRetry={hist.recharger} />
      ) : audits.length === 0 ? (
        <p className="text-sm text-stone-500">Aucune opération journalisée.</p>
      ) : (
        <ul className="divide-y divide-stone-100 text-sm">
          {audits.map((a) => (
            <li key={a.id} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-stone-800">{ACTIONS_AUDIT[a.action] || a.action}</span>
              <span className="text-xs text-stone-500">
                {a.user ? nomComplet(a.user) : 'Système'} · {dateHeure(a.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Carte>
  );
}

function ModaleRemboursement({ ouverte, note, aControler, onFermer, onFait }) {
  const [form, setForm] = useState({ modePaiement: 'VIREMENT', referencePaiement: '', date: versInputDate(new Date()) });
  const [envoi, setEnvoi] = useState(false);
  const net = Number(note.montantARembourser);

  const valider = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    const r = await action(
      () =>
        api.post(`/notes-frais/${note.id}/rembourser`, {
          modePaiement: form.modePaiement,
          ...(form.referencePaiement.trim() && { referencePaiement: form.referencePaiement.trim() }),
          ...(form.date && { date: form.date }),
        }),
      'Remboursement enregistré'
    );
    setEnvoi(false);
    if (r) onFait();
  };

  return (
    <Modale
      ouverte={ouverte}
      onFermer={onFermer}
      titre={net < 0 ? 'Enregistrer le reversement du trop-perçu' : 'Enregistrer le remboursement'}
      pied={
        <>
          <button className="btn-secondary" onClick={onFermer}>
            Annuler
          </button>
          <button type="submit" form="form-remb" className="btn-success" disabled={envoi || aControler > 0}>
            {envoi && <Spinner className="h-4 w-4 text-white" />} Confirmer
          </button>
        </>
      }
    >
      <form id="form-remb" onSubmit={valider} className="space-y-4">
        <div className={`rounded-lg p-3 text-sm ${net < 0 ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>
          {net < 0 ? 'Trop-perçu à reverser par l’agent' : 'Montant à verser à l’agent'} : <strong>{mad(Math.abs(net))}</strong>
          <span className="block text-xs opacity-80">Les avances versées pour cette mission seront marquées comme régularisées.</span>
        </div>
        {aControler > 0 && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            {aControler} dépense{aControler > 1 ? 's sont' : ' est'} encore « À contrôler ». Contrôlez toutes les lignes avant le remboursement.
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Champ label="Mode de paiement" requis>
            <Select options={options(LIBELLES.modePaiement)} value={form.modePaiement} onChange={(e) => setForm({ ...form, modePaiement: e.target.value })} />
          </Champ>
          <Champ label="Date du paiement">
            <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Champ>
          <Champ label="Référence" aide="N° de virement, de chèque…" className="sm:col-span-2">
            <input className="input" maxLength={100} value={form.referencePaiement} onChange={(e) => setForm({ ...form, referencePaiement: e.target.value })} />
          </Champ>
        </div>
      </form>
    </Modale>
  );
}
