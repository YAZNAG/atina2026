// Client HTTP « poli » pour un service public dont dépendent toutes les entreprises :
// une requête à la fois, une pause entre deux requêtes, une identité déclarée, aucune
// nouvelle tentative et un arrêt net si le portail refuse ou peine à répondre.

/** Arrêt volontaire de la collecte : on ne force jamais le passage. */
export class CollectStopped extends Error {
  constructor(reason, detail) {
    super(`${reason}${detail ? ` : ${detail}` : ''}`);
    this.reason = reason;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class PoliteClient {
  /**
   * @param {object} o
   * @param {string} o.baseUrl racine du portail
   * @param {string} o.userAgent identité déclarée, avec un moyen de contact
   * @param {number} o.delayMs pause minimale entre deux requêtes
   * @param {number} o.timeoutMs délai maximal d'une requête
   * @param {number} o.maxConsecutiveErrors erreurs serveur ou délais dépassés tolérés d'affilée
   * @param {typeof fetch} [o.fetchImpl]
   */
  constructor({ baseUrl, userAgent, delayMs, timeoutMs, maxConsecutiveErrors, fetchImpl }) {
    this.baseUrl = baseUrl;
    this.userAgent = userAgent;
    this.delayMs = delayMs;
    this.timeoutMs = timeoutMs;
    this.maxConsecutiveErrors = maxConsecutiveErrors;
    this.fetch = fetchImpl ?? globalThis.fetch;
    this.cookies = new Map();
    this.lastRequestAt = 0;
    this.consecutiveErrors = 0;
    this.requestCount = 0;
    this.queue = Promise.resolve();
  }

  url(path) {
    return new URL(path, this.baseUrl).toString();
  }

  get(path) {
    return this.request(path, { method: 'GET' });
  }

  /** Envoie un formulaire PRADO, comme le ferait le navigateur. */
  postForm(path, fields) {
    return this.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
    });
  }

  /** Les appels sont mis en file : jamais deux requêtes en même temps. */
  request(path, init) {
    const run = this.queue.then(() => this.#send(path, init));
    this.queue = run.catch(() => {});
    return run;
  }

  async #send(path, init) {
    const wait = this.lastRequestAt + this.delayMs - Date.now();
    if (wait > 0) await sleep(wait);

    const url = this.url(path);
    const headers = {
      'User-Agent': this.userAgent,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'fr-FR,fr;q=0.9',
      ...init.headers,
    };
    if (this.cookies.size) {
      headers.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    }

    let res;
    try {
      this.requestCount += 1;
      res = await this.fetch(url, {
        ...init,
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      this.lastRequestAt = Date.now();
      const cause = err.cause?.code ?? err.name ?? 'Error';
      this.#error(`réseau ou délai dépassé (${cause})`, url);
      throw new Error(`Requête échouée (${cause}) : ${url}`);
    }
    this.lastRequestAt = Date.now();
    this.#storeCookies(res);

    if (res.status === 403 || res.status === 429) {
      throw new CollectStopped('refus du portail', `HTTP ${res.status} sur ${url}`);
    }
    if (res.status >= 500) {
      this.#error(`HTTP ${res.status}`, url);
      throw new Error(`HTTP ${res.status} : ${url}`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} : ${url}`);

    this.consecutiveErrors = 0;
    return { status: res.status, url: res.url || url, text: await decode(res) };
  }

  #error(what, url) {
    this.consecutiveErrors += 1;
    if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
      throw new CollectStopped('portail en difficulté', `${this.consecutiveErrors} erreurs d'affilée (${what}) sur ${url}`);
    }
  }

  #storeCookies(res) {
    const list = typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie')].filter(Boolean);
    for (const c of list) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      if (i > 0) this.cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }
}

/**
 * Le portail déclare de l'UTF-8 mais laisse quelques octets Latin-1 dans des
 * commentaires : on décode sans échouer, selon le jeu de caractères annoncé.
 */
async function decode(res) {
  const buf = await res.arrayBuffer();
  const charset = /charset=([\w-]+)/i.exec(res.headers.get('content-type') ?? '')?.[1] ?? 'utf-8';
  try {
    return new TextDecoder(charset).decode(buf);
  } catch {
    return new TextDecoder('utf-8').decode(buf);
  }
}
