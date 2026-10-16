// Google Play Billing, server side: coin packs bought in the Android app.
// The app hands us a purchase token; we ask Google (the Play Developer API,
// with the service account in GOOGLE_PLAY_SERVICE_ACCOUNT) whether it's a
// real, completed purchase of that pack by this player, grant the coins once
// (store.ts recordPurchase), then "consume" it so the pack can be bought again.
// Refunds and chargebacks come from the voided-purchases list (checked hourly).
// docs/GOOGLE_PLAY.md §7 has the set-up steps.

import { createHash, createSign } from 'node:crypto';

export interface PlayEnv {
  /** The service account's JSON key, as is or base64-encoded. */
  GOOGLE_PLAY_SERVICE_ACCOUNT?: string;
  /** The app's package name (default com.tardigeddon.app). */
  GOOGLE_PLAY_PACKAGE?: string;
}

/** What Google says about a one-time purchase (purchases.products.get). */
export interface ProductPurchase {
  /** 0 purchased, 1 cancelled, 2 pending (e.g. paying cash at a shop). */
  purchaseState: number;
  /** 0 not yet consumed, 1 consumed. */
  consumptionState: number;
  /** Absent for real purchases; 0 test (licence testers), 1 promo code, 2 rewarded. */
  purchaseType?: number;
  orderId?: string;
  /** What the app set when it started the purchase: playAccountTag(userId). */
  obfuscatedExternalAccountId?: string;
}

export interface VoidedPurchase {
  purchaseToken: string;
  /** 0 other, 1 remorse, 2 not received, 3 defective, 4 accidental, 5 fraud, 6 friendly fraud, 7 chargeback. */
  voidedReason?: number;
}

export interface PlayApi {
  /** Null if Google doesn't know the token (made up, or for another app). */
  getProduct(productId: string, token: string): Promise<ProductPurchase | null>;
  consume(productId: string, token: string): Promise<void>;
  /** Purchases refunded or charged back since this time. */
  voided(sinceMs: number): Promise<VoidedPurchase[]>;
}

/**
 * The account tag the app attaches to a purchase (Google's "obfuscated
 * account id"): a hash, so Google never sees our account ids.
 */
export function playAccountTag(userId: string): string {
  return createHash('sha256').update(`tardigeddon:${userId}`).digest('hex').slice(0, 64);
}

const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

function parseServiceAccount(raw: string): ServiceAccount {
  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  const sa = JSON.parse(text) as ServiceAccount;
  if (!sa.client_email || !sa.private_key) throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT is not a service account key (no client_email / private_key)');
  return sa;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/** Null when Google Play Billing isn't set up on this server (no service account). */
export function googlePlayApi(env: PlayEnv, fetchFn: typeof fetch = fetch): PlayApi | null {
  if (!env.GOOGLE_PLAY_SERVICE_ACCOUNT) return null;
  const sa = parseServiceAccount(env.GOOGLE_PLAY_SERVICE_ACCOUNT);
  const pkg = env.GOOGLE_PLAY_PACKAGE || 'com.tardigeddon.app';
  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
  let access: { token: string; until: number } | null = null;

  /** An OAuth access token for the service account (signed JWT, cached for its hour). */
  async function accessToken(): Promise<string> {
    if (access && Date.now() < access.until) return access.token;
    const now = Math.floor(Date.now() / 1000);
    const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: tokenUri, iat: now, exp: now + 3600 }));
    const sig = createSign('RSA-SHA256').update(`${head}.${claims}`).sign(sa.private_key);
    const r = await fetchFn(tokenUri, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${b64url(sig)}` }),
    });
    if (!r.ok) throw new Error(`Google sign-in for the Play API failed (${r.status})`);
    const data = (await r.json()) as { access_token: string; expires_in?: number };
    access = { token: data.access_token, until: Date.now() + ((data.expires_in ?? 3600) - 120) * 1000 };
    return access.token;
  }

  async function api(method: 'GET' | 'POST', path: string): Promise<Response> {
    return fetchFn(`${API}/${encodeURIComponent(pkg)}/${path}`, { method, headers: { authorization: `Bearer ${await accessToken()}` } });
  }

  const productPath = (productId: string, token: string) =>
    `purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`;

  return {
    async getProduct(productId, token) {
      const r = await api('GET', productPath(productId, token));
      // Google answers 400 or 404 for tokens it doesn't recognise.
      if (r.status === 400 || r.status === 404 || r.status === 410) return null;
      if (!r.ok) throw new Error(`Google Play purchase check failed (${r.status})`);
      return (await r.json()) as ProductPurchase;
    },
    async consume(productId, token) {
      const r = await api('POST', `${productPath(productId, token)}:consume`);
      if (!r.ok) throw new Error(`Google Play consume failed (${r.status})`);
    },
    async voided(sinceMs) {
      const out: VoidedPurchase[] = [];
      let page = '';
      for (let i = 0; i < 20; i++) {
        const q = new URLSearchParams({ startTime: String(Math.floor(sinceMs)), type: '0', maxResults: '1000' });
        if (page) q.set('token', page);
        const r = await api('GET', `purchases/voidedpurchases?${q}`);
        if (!r.ok) throw new Error(`Google Play voided purchases check failed (${r.status})`);
        const data = (await r.json()) as { voidedPurchases?: VoidedPurchase[]; tokenPagination?: { nextPageToken?: string } };
        out.push(...(data.voidedPurchases ?? []));
        page = data.tokenPagination?.nextPageToken ?? '';
        if (!page) break;
      }
      return out;
    },
  };
}
