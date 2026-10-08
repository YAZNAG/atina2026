import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [utilisateur, setUtilisateur] = useState(null);
  const [chargement, setChargement] = useState(true);

  const rafraichir = useCallback(async () => {
    if (!localStorage.getItem('jeton')) {
      setUtilisateur(null);
      setChargement(false);
      return;
    }
    try {
      const r = await api.get('/auth/moi');
      setUtilisateur(r.data.data);
    } catch {
      localStorage.removeItem('jeton');
      setUtilisateur(null);
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    rafraichir();
  }, [rafraichir]);

  const connexion = async (email, motDePasse) => {
    const r = await api.post('/auth/login', { email, motDePasse });
    localStorage.setItem('jeton', r.data.data.token);
    setUtilisateur(r.data.data.utilisateur);
    return r.data.data.utilisateur;
  };

  const deconnexion = async () => {
    try {
      await api.post('/auth/deconnexion');
    } catch {
      /* jeton déjà expiré */
    }
    localStorage.removeItem('jeton');
    setUtilisateur(null);
  };

  /** Le rôle de l'utilisateur donne-t-il cette permission ? (mêmes clés que l'API) */
  const peut = useCallback((...perms) => perms.some((p) => utilisateur?.permissions?.includes(p)), [utilisateur]);

  return (
    <AuthContext.Provider value={{ utilisateur, chargement, connexion, deconnexion, rafraichir, peut }}>{children}</AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
