import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { messageErreur } from '../api/client';
import { Spinner } from '../components/ui';

export default function Connexion() {
  const { utilisateur, connexion } = useAuth();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  if (utilisateur) return <Navigate to="/" replace />;

  const soumettre = async (e) => {
    e.preventDefault();
    setErreur('');
    setEnvoi(true);
    try {
      const u = await connexion(email.trim(), motDePasse);
      navigate(u.doitChangerMdp ? '/profil?mdp=1' : location.state?.depuis || '/', { replace: true });
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-brand-50 via-white to-zellige-50">
      <div className="border-b border-stone-200 bg-white">
        <img src="/api/public/entete" alt="Royaume du Maroc — Chambre d'Artisanat Souss Massa" className="mx-auto h-20 w-auto sm:h-28" />
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold text-stone-900">Gestion des déplacements</h1>
            <p className="mt-1 text-sm text-stone-500">Ordres de mission, frais et remboursements</p>
          </div>
          <form onSubmit={soumettre} className="card space-y-4 p-6">
            <label className="block">
              <span className="label">Adresse e-mail</span>
              <input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            </label>
            <label className="block">
              <span className="label">Mot de passe</span>
              <input className="input" type="password" autoComplete="current-password" required value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
            </label>
            {erreur && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erreur}</p>}
            <button className="btn-primary w-full" disabled={envoi}>
              {envoi ? <Spinner className="h-4 w-4 text-white" /> : <LogIn className="h-4 w-4" />} Se connecter
            </button>
          </form>
          <p className="mt-6 text-center text-xs text-stone-400">Accès réservé au personnel de la Chambre. Les connexions sont journalisées.</p>
        </div>
      </div>
    </div>
  );
}
