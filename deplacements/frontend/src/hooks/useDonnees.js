import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { messageErreur } from '../api/client';

/**
 * Charge des données asynchrones et expose { donnees, chargement, erreur, recharger }.
 * @param {() => Promise<any>} charger
 * @param {any[]} deps
 */
export function useDonnees(charger, deps = []) {
  const [donnees, setDonnees] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const ref = useRef(charger);
  ref.current = charger;

  const recharger = useCallback(async () => {
    setChargement(true);
    try {
      setDonnees(await ref.current());
      setErreur(null);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setChargement(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    recharger();
  }, [recharger]);

  return { donnees, setDonnees, chargement, erreur, recharger };
}

/** Exécute une action avec toast de succès/erreur. Renvoie le résultat ou undefined en cas d'échec. */
export async function action(fn, succes) {
  try {
    const r = await fn();
    const msg = typeof succes === 'function' ? succes(r) : succes || r?.data?.message;
    if (msg) toast.success(msg);
    return r ?? true;
  } catch (e) {
    toast.error(messageErreur(e), { duration: 6000 });
    return undefined;
  }
}
