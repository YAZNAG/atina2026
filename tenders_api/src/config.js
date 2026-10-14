// Configuration par variables d'environnement (fichier .env lu au démarrage).
import { existsSync, readFileSync } from 'node:fs';

/** Charge `.env` sans écraser les variables déjà définies. */
export function loadEnvFile(path = '.env') {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    // « VALEUR   # commentaire » : le commentaire de fin de ligne est retiré.
    const raw = /^(['"])/.test(m[2]) ? m[2] : m[2].replace(/\s+#.*$/, '');
    const value = raw.replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

const int = (v, d) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : d;
};

export class ConfigError extends Error {}

export function readConfig(env = process.env) {
  const contact = (env.COLLECT_CONTACT ?? '').trim();
  const pageSize = int(env.PMMP_PAGE_SIZE, 100);
  const config = {
    port: int(env.PORT, 4100),
    dbPath: env.DB_PATH || 'data/tenders.db',
    corsOrigins: (env.CORS_ORIGINS ?? '*').split(',').map((s) => s.trim()).filter(Boolean),

    baseUrl: env.PMMP_BASE_URL || 'https://www.marchespublics.gov.ma/',
    searchPath: env.PMMP_SEARCH_PATH || 'index.php?page=entreprise.EntrepriseAdvancedSearch&AllCons',
    contact,
    userAgent: `Safa9atBot/1.0 (veille des appels d'offres; +${contact || 'contact non renseigné'})`,
    delayMs: Math.max(2000, int(env.PMMP_DELAY_MS, 3000)),
    timeoutMs: int(env.PMMP_TIMEOUT_MS, 30000),
    maxConsecutiveErrors: Math.min(10, Math.max(1, int(env.PMMP_MAX_ERRORS, 3))),
    pageSize: [10, 20, 50, 100, 500].includes(pageSize) ? pageSize : 100,
    maxPages: Math.max(1, int(env.PMMP_MAX_PAGES, 80)),
    detailsPerRun: Math.max(0, int(env.PMMP_DETAILS_PER_RUN, 400)),
    window: env.COLLECT_WINDOW ?? '00:00-07:00',
    collectAt: env.COLLECT_AT ?? '02:30',

    // Bons de commande (module /bdc/ du portail).
    bdcEnabled: env.BDC_ENABLED !== 'false',
    bdcListPath: env.BDC_LIST_PATH || 'bdc/entreprise/consultation/',
    bdcMaxPages: Math.max(1, int(env.BDC_MAX_PAGES, 200)),
    bdcDetailsPerRun: Math.max(0, int(env.BDC_DETAILS_PER_RUN, 200)),

    // Notifications : clé du compte de service Firebase (fichier JSON), heure d'envoi.
    fcmServiceAccount: (env.FCM_SERVICE_ACCOUNT ?? '').trim(),
    notifyAt: env.NOTIFY_AT ?? '08:30',

    // Résumés IA (Claude) : actifs dès qu'une clé d'API Anthropic est fournie.
    aiEnabled: Boolean((env.ANTHROPIC_API_KEY ?? '').trim() || (env.ANTHROPIC_AUTH_TOKEN ?? '').trim()),
    aiModel: (env.AI_MODEL ?? '').trim() || 'claude-opus-5-5',
    aiEffort: ['low', 'medium', 'high', 'xhigh', 'max'].includes(env.AI_EFFORT) ? env.AI_EFFORT : 'low',
    aiDailyLimit: Math.max(0, int(env.AI_DAILY_LIMIT, 300)),
    aiPrecomputePerRun: Math.max(0, int(env.AI_PRECOMPUTE_PER_RUN, 100)),
  };
  return config;
}

/** La collecte exige un contact : l'administrateur du portail doit pouvoir nous joindre. */
export function assertCanCollect(config) {
  if (!config.contact) {
    throw new ConfigError(
      'COLLECT_CONTACT est vide : renseignez une adresse e-mail ou une URL de contact, ' +
        "elle est envoyée au portail dans l'en-tête User-Agent.",
    );
  }
}

/** « 00:00-07:00 » → l'heure de Casablanca `date` est-elle dans la plage ? Vide = toujours. */
export function inWindow(window, date = new Date()) {
  const m = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(window ?? '');
  if (!m) return true;
  const hm = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Casablanca',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
  const [h, mi] = hm.split(':').map(Number);
  const now = h * 60 + mi;
  const start = +m[1] * 60 + +m[2];
  const end = +m[3] * 60 + +m[4];
  return start <= end ? now >= start && now < end : now >= start || now < end;
}
