// Préférences d'alertes envoyées par l'app : validation et correspondance avec un avis.
// La règle est la même que dans l'app (AlertPrefs.matches), pour que le badge de
// l'app et les notifications disent la même chose.
import { searchKey } from '../db.js';
import { REGION_NAMES } from '../pmmp/places.js';

export const CATEGORIES = ['travaux', 'services', 'fournitures'];
export const KINDS = ['ao', 'bdc'];

export class InvalidDevice extends Error {}

const isStr = (v) => typeof v === 'string';

/**
 * Corps de `POST /api/devices` → inscription propre, ou [InvalidDevice].
 * Les limites évitent qu'un appel malveillant remplisse la base.
 */
export function parseDevice(body) {
  const b = body && typeof body === 'object' ? body : {};
  const token = isStr(b.token) ? b.token.trim() : '';
  if (token.length < 20 || token.length > 4096 || /\s/.test(token)) {
    throw new InvalidDevice('token invalide');
  }
  const platform = ['android', 'ios', 'web'].includes(b.platform) ? b.platform : null;
  if (!platform) throw new InvalidDevice('platform doit valoir android, ios ou web');
  const lang = b.lang === 'ar' ? 'ar' : 'fr';

  const p = b.prefs && typeof b.prefs === 'object' ? b.prefs : {};
  const list = (v) => (Array.isArray(v) ? v.filter(isStr) : []);
  const categories = list(p.categories).filter((c) => CATEGORIES.includes(c));
  const kinds = list(p.kinds).filter((k) => KINDS.includes(k));
  const regions = list(p.regions).filter((r) => REGION_NAMES.includes(r));
  const keywords = list(p.keywords).map((k) => k.trim()).filter(Boolean);
  if (keywords.length > 30 || keywords.some((k) => k.length > 80)) {
    throw new InvalidDevice('30 mots-clés de 80 caractères au plus');
  }
  const reminderDays = Number.isInteger(p.reminderDays) && p.reminderDays >= 1 && p.reminderDays <= 30
    ? p.reminderDays
    : 3;

  const saved = list(b.saved);
  if (saved.length > 500 || saved.some((s) => s.length > 100)) {
    throw new InvalidDevice('500 avis enregistrés au plus');
  }

  return {
    token,
    platform,
    lang,
    prefs: {
      newTenders: p.newTenders !== false,
      deadlineReminders: p.deadlineReminders !== false,
      reminderDays,
      categories: Array.isArray(p.categories) ? [...new Set(categories)] : [...CATEGORIES],
      // Applis plus anciennes : sans « kinds », appels d'offres et bons de commande.
      kinds: Array.isArray(p.kinds) ? [...new Set(kinds)] : [...KINDS],
      regions: [...new Set(regions)],
      keywords: [...new Set(keywords)],
    },
    saved: [...new Set(saved)],
  };
}

/** Texte cherché dans un avis : mêmes champs que dans l'app. */
function tenderText(t) {
  return searchKey(
    [t.reference, t.title, t.buyer, t.city, t.region, t.procedure, ...(t.qualifications ?? [])].join(' '),
  );
}

/**
 * Catégorie suivie, région suivie (ou toutes), et au moins un mot-clé s'il y en a.
 */
export function matchesPrefs(t, prefs) {
  if (prefs.kinds && !prefs.kinds.includes(t.kind ?? 'ao')) return false;
  // Un bon de commande sans catégorie connue reste signalé.
  if (t.category ? !prefs.categories.includes(t.category) : t.kind !== 'bdc') return false;
  if (prefs.regions.length && !prefs.regions.includes(t.region)) return false;
  if (!prefs.keywords.length) return true;
  const text = ` ${tenderText(t)} `;
  return prefs.keywords.some((k) => {
    const key = searchKey(k);
    return key && text.includes(key);
  });
}
