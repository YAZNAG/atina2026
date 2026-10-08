import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('jeton');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401 && !error.config.url.includes('/auth/login')) {
      localStorage.removeItem('jeton');
      if (window.location.pathname !== '/connexion') window.location.href = '/connexion';
    }
    return Promise.reject(error);
  }
);

/** Message d'erreur lisible, détails de validation inclus. */
export function messageErreur(e) {
  const d = e?.response?.data;
  if (!d) return e?.message || 'Erreur réseau';
  if (Array.isArray(d.details) && d.details.length) {
    return `${d.message} : ${d.details.map((x) => x.message || x.numero || x.type).filter(Boolean).join(' ; ')}`;
  }
  return d.message || 'Erreur';
}

/** GET qui renvoie directement `data`. */
export const lire = async (url, params) => (await api.get(url, { params })).data.data;
/** GET paginé : { data, meta } */
export const lirePage = async (url, params) => (await api.get(url, { params })).data;

/** Ouvre un fichier binaire (PDF, Excel) renvoyé par l'API, avec le jeton. */
export async function ouvrirFichier(url, { telecharger = false, nom } = {}) {
  const r = await api.get(url, { responseType: 'blob' });
  const blobUrl = URL.createObjectURL(r.data);
  const dispo = r.headers['content-disposition'] || '';
  const nomFichier = nom || decodeURIComponent((dispo.match(/filename\*?=(?:UTF-8'')?"?([^";]+)/) || [])[1] || 'document');
  if (telecharger || !/pdf|image/.test(r.data.type)) {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = nomFichier;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } else if (!window.open(blobUrl, '_blank')) {
    // Fenêtre bloquée : téléchargement à la place.
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = nomFichier;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
}

export default api;
