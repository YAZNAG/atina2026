// Envoi par Firebase Cloud Messaging (API HTTP v1), sans SDK : un jeton d'accès OAuth
// est obtenu en signant un JWT avec la clé du compte de service, puis chaque message
// part en une requête. Android et iOS passent tous deux par FCM.
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

/** Clé de compte de service illisible, ou accès refusé par Google : rien ne partira. */
export class PushConfigError extends Error {}

/** Le jeton du téléphone n'est plus valable (app désinstallée, jeton renouvelé). */
export const UNREGISTERED = 'unregistered';

const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

/** JWT RS256 signé par la clé privée du compte de service. */
export function signJwt(account, nowSec) {
  const head = b64url({ alg: 'RS256', typ: 'JWT', kid: account.private_key_id });
  const claims = b64url({
    iss: account.client_email,
    scope: SCOPE,
    aud: account.token_uri,
    iat: nowSec,
    exp: nowSec + 3600,
  });
  const signature = createSign('RSA-SHA256').update(`${head}.${claims}`).sign(account.private_key);
  return `${head}.${claims}.${signature.toString('base64url')}`;
}

export function readServiceAccount(path) {
  let account;
  try {
    account = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new PushConfigError(`Compte de service illisible (${path}) : ${err.message}`);
  }
  for (const k of ['project_id', 'client_email', 'private_key']) {
    if (!account[k]) throw new PushConfigError(`Compte de service incomplet : « ${k} » manquant`);
  }
  return { token_uri: 'https://oauth2.googleapis.com/token', ...account };
}

export class FcmSender {
  /**
   * @param {object} o
   * @param {object} o.account compte de service (JSON téléchargé depuis Firebase)
   * @param {typeof fetch} [o.fetchImpl]
   * @param {() => number} [o.nowMs]
   */
  constructor({ account, fetchImpl, nowMs = Date.now }) {
    this.account = account;
    this.fetch = fetchImpl ?? globalThis.fetch;
    this.nowMs = nowMs;
    this.cached = null;
  }

  async accessToken() {
    const now = Math.floor(this.nowMs() / 1000);
    if (this.cached && this.cached.exp - 60 > now) return this.cached.token;
    const res = await this.fetch(this.account.token_uri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: signJwt(this.account, now),
      }).toString(),
      signal: AbortSignal.timeout(20000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) {
      throw new PushConfigError(`Jeton Google refusé (HTTP ${res.status}) : ${body.error_description ?? body.error ?? ''}`);
    }
    this.cached = { token: body.access_token, exp: now + (body.expires_in ?? 3600) };
    return this.cached.token;
  }

  /**
   * Envoie une notification à un téléphone. Renvoie « ok » ou [UNREGISTERED] ;
   * lève [PushConfigError] (accès refusé) ou Error (panne passagère).
   *
   * @param {string} token
   * @param {{ title: string, body: string, data?: Record<string, string> }} message
   */
  async send(token, { title, body, data = {} }) {
    const access = await this.accessToken();
    const url = `https://fcm.googleapis.com/v1/projects/${this.account.project_id}/messages:send`;
    const res = await this.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          data,
          // `tag` : une nouvelle alerte du même type remplace la précédente.
          android: { priority: 'high', notification: { tag: data.tag } },
          apns: { payload: { aps: { sound: 'default', 'thread-id': 'appels_offres' } } },
        },
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok) return 'ok';

    const err = (await res.json().catch(() => ({}))).error ?? {};
    const codes = (err.details ?? []).map((d) => d.errorCode).filter(Boolean);
    if (res.status === 404 || codes.includes('UNREGISTERED')) return UNREGISTERED;
    if (res.status === 400 && /registration token/i.test(err.message ?? '')) return UNREGISTERED;
    if (res.status === 401 || res.status === 403 || codes.includes('SENDER_ID_MISMATCH')) {
      if (codes.includes('SENDER_ID_MISMATCH')) return UNREGISTERED;
      throw new PushConfigError(`FCM refuse l'envoi (HTTP ${res.status}) : ${err.message ?? ''}`);
    }
    throw new Error(`FCM HTTP ${res.status} : ${err.message ?? ''}`);
  }
}
