import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { action } from '../hooks/useDonnees';
import { Carte, Champ, EnTete, Info } from '../components/ui';
import { LIBELLES, dateHeure } from '../lib/format';

export default function Profil() {
  const { utilisateur: u, rafraichir } = useAuth();
  const [params] = useSearchParams();
  const [f, setF] = useState({ actuel: '', nouveau: '', confirmation: '' });
  const obligatoire = u.doitChangerMdp || params.get('mdp') === '1';

  const changer = async (e) => {
    e.preventDefault();
    if (f.nouveau !== f.confirmation) return action(() => Promise.reject(new Error('Les deux mots de passe diffèrent')));
    const r = await action(() => api.post('/auth/mot-de-passe', { actuel: f.actuel, nouveau: f.nouveau }), 'Mot de passe modifié');
    if (r) {
      setF({ actuel: '', nouveau: '', confirmation: '' });
      rafraichir();
    }
  };

  return (
    <>
      <EnTete titre="Mon profil" />
      {obligatoire && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Pour des raisons de sécurité, vous devez choisir un nouveau mot de passe avant de continuer.
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Carte titre="Informations">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Info libelle="Nom">{`${u.prenom} ${u.nom}`}</Info>
            <Info libelle="Matricule">{u.matricule}</Info>
            <Info libelle="E-mail">{u.email}</Info>
            <Info libelle="Téléphone">{u.telephone}</Info>
            <Info libelle="Rôle">{LIBELLES.role[u.role]}</Info>
            <Info libelle="Service">{u.service?.nom}</Info>
            <Info libelle="Fonction">{u.fonction?.libelle}</Info>
            <Info libelle="Catégorie (barème)">{u.categorie?.libelle}</Info>
            <Info libelle="CIN">{u.cin}</Info>
            <Info libelle="RIB">{u.rib}</Info>
            <Info libelle="Dernière connexion">{dateHeure(u.derniereConnexion)}</Info>
            {u.servicesDiriges?.length > 0 && <Info libelle="Services dirigés">{u.servicesDiriges.map((s) => s.nom).join(', ')}</Info>}
          </dl>
          <p className="mt-4 text-xs text-stone-500">Pour corriger ces informations, adressez-vous à l'administrateur.</p>
        </Carte>
        <Carte titre="Changer de mot de passe">
          <form onSubmit={changer} className="space-y-4">
            <Champ label="Mot de passe actuel" requis>
              <input className="input" type="password" autoComplete="current-password" required value={f.actuel} onChange={(e) => setF({ ...f, actuel: e.target.value })} />
            </Champ>
            <Champ label="Nouveau mot de passe" requis aide="10 caractères minimum, avec majuscule, minuscule et chiffre.">
              <input className="input" type="password" autoComplete="new-password" required minLength={10} value={f.nouveau} onChange={(e) => setF({ ...f, nouveau: e.target.value })} />
            </Champ>
            <Champ label="Confirmation" requis erreur={f.confirmation && f.nouveau !== f.confirmation ? 'Les deux saisies diffèrent' : null}>
              <input className="input" type="password" autoComplete="new-password" required value={f.confirmation} onChange={(e) => setF({ ...f, confirmation: e.target.value })} />
            </Champ>
            <button className="btn-primary">
              <KeyRound className="h-4 w-4" /> Enregistrer
            </button>
          </form>
        </Carte>
      </div>
    </>
  );
}
