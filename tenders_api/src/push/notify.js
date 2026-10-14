// Tournée de notifications : pour chaque téléphone inscrit, les nouveaux avis qui
// correspondent à ses alertes (une seule notification groupée) et les rappels de date
// limite pour ses avis enregistrés. Lancée une fois par jour, à une heure décente.
import { PushConfigError, UNREGISTERED } from './fcm.js';
import { matchesPrefs } from './prefs.js';

const TEXT = {
  fr: {
    one: "Nouvel appel d'offres",
    many: (n) => `${n} nouveaux appels d'offres`,
    more: (n) => `et ${n} autre${n > 1 ? 's' : ''}`,
    reminder: (d) => (d <= 1 ? 'Date limite demain' : `Date limite dans ${d} jours`),
    category: { travaux: 'Travaux', services: 'Services', fournitures: 'Fournitures' },
  },
  ar: {
    one: 'طلب عروض جديد',
    many: (n) => `${n} طلبات عروض جديدة`,
    more: (n) => `و${n} أخرى`,
    reminder: (d) => (d <= 1 ? 'آخر أجل غدًا' : `آخر أجل بعد ${d} أيام`),
    category: { travaux: 'أشغال', services: 'خدمات', fournitures: 'توريدات' },
  },
};

/** Jours calendaires (heure de Casablanca) entre maintenant et la date limite. */
export function daysUntil(deadlineIso, nowMs) {
  const day = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca' }).format(new Date(ms));
  return Math.round((Date.parse(day(Date.parse(deadlineIso))) - Date.parse(day(nowMs))) / 86400000);
}

const short = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Une notification pour une liste de nouveaux avis. */
export function newTendersMessage(list, lang) {
  const tx = TEXT[lang] ?? TEXT.fr;
  const first = list[0];
  if (list.length === 1) {
    return {
      title: tx.one,
      body: short(`${tx.category[first.category] ?? ''} · ${first.city} — ${first.title}`, 180),
      data: { type: 'tender', tenderId: first.id, tag: 'nouveaux' },
    };
  }
  const titles = list.slice(0, 2).map((t) => short(t.title, 70));
  const rest = list.length - titles.length;
  return {
    title: tx.many(list.length),
    body: `${titles.join(' · ')}${rest > 0 ? ` ${tx.more(rest)}` : ''}`,
    data: { type: 'list', tag: 'nouveaux' },
  };
}

export function reminderMessage(t, days, lang) {
  const tx = TEXT[lang] ?? TEXT.fr;
  return {
    title: tx.reminder(days),
    body: short(`${t.reference} — ${t.title}`, 180),
    data: { type: 'tender', tenderId: t.id, tag: `rappel-${t.id}` },
  };
}

/** Rappels envoyés par téléphone et par tournée, au plus. */
const MAX_REMINDERS = 3;

/**
 * Un avis n'est « nouveau » que s'il a été publié dans la semaine : la toute première
 * collecte découvre des milliers d'avis anciens, qu'il ne faut pas annoncer.
 */
const FRESH_MS = 7 * 86400000;

/**
 * @param {object} o
 * @param {import('../db.js').TenderStore} o.store
 * @param {{ send: (token: string, m: object) => Promise<string> }} o.sender
 * @param {() => Date} [o.now]
 */
export async function notify({ store, sender, now = () => new Date(), log = () => {} }) {
  const stats = { devices: 0, sent: 0, newTenders: 0, reminders: 0, removed: 0, errors: 0 };
  const nowMs = now().getTime();

  for (const d of store.devices()) {
    stats.devices += 1;
    const plan = [];

    if (d.prefs.newTenders) {
      const fresh = store
        .newTendersSince(d.lastNotifiedAt, nowMs)
        .filter((t) => Date.parse(t.publishedAt ?? t.firstSeenAt) >= nowMs - FRESH_MS)
        .filter((t) => matchesPrefs(t, d.prefs) && !store.wasSent(d.token, t.id, 'nouveau'));
      if (fresh.length) plan.push({ kind: 'nouveau', ids: fresh.map((t) => t.id), message: newTendersMessage(fresh, d.lang) });
    }

    if (d.prefs.deadlineReminders && d.saved.length) {
      const due = store
        .tendersByIds(d.saved)
        .map((t) => ({ t, days: daysUntil(t.deadline, nowMs) }))
        .filter(({ t, days }) => days >= 0 && days <= d.prefs.reminderDays && Date.parse(t.deadline) > nowMs)
        .filter(({ t }) => !store.wasSent(d.token, t.id, 'rappel'))
        .sort((a, b) => a.days - b.days)
        .slice(0, MAX_REMINDERS);
      for (const { t, days } of due) {
        plan.push({ kind: 'rappel', ids: [t.id], message: reminderMessage(t, days, d.lang) });
      }
    }

    let delivered = true;
    for (const item of plan) {
      let result;
      try {
        result = await sender.send(d.token, item.message);
      } catch (err) {
        if (err instanceof PushConfigError) throw err;
        // Panne passagère : ce téléphone sera retenté à la prochaine tournée.
        stats.errors += 1;
        delivered = false;
        log(`Envoi échoué : ${err.message}`);
        break;
      }
      if (result === UNREGISTERED) {
        store.deleteDevice(d.token);
        stats.removed += 1;
        delivered = false;
        break;
      }
      store.recordSent(d.token, item.ids, item.kind, now().toISOString());
      stats.sent += 1;
      if (item.kind === 'nouveau') stats.newTenders += item.ids.length;
      else stats.reminders += 1;
    }
    if (delivered) store.markNotified(d.token, now().toISOString());
  }
  return stats;
}
