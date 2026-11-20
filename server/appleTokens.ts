// Sign in with Apple: giving Apple's tokens back when an account is deleted.
//
// Apple asks every app with Sign in with Apple to call its REST API's revoke
// endpoint when a player deletes their account, so the app also disappears
// from "Apps using Apple ID" in the player's Apple settings. Revoking needs a
// refresh (or access) token, which we only get by exchanging an authorization
// code with Apple, signed with our Sign in with Apple key:
//
// - the iOS app's own sheet hands the app a code alongside the ID token; the
//   app sends it to POST /api/app/apple-code once signed in, and we exchange it
//   here for the app's bundle ID;
// - Apple's web page (the website, and the Android app's browser tab): Better
//   Auth exchanges the code itself and keeps the tokens in its "account" table.
//
// On deletion, every token we hold for the player is revoked (best effort: the
// account is deleted whatever Apple says). docs/IOS.md §2b.

import { createPrivateKey, sign } from 'node:crypto';
import type { Pool } from 'pg';

/** Our Sign in with Apple key (developer.apple.com → Keys), from the server's secrets. */
export interface AppleKey {
  teamId: string;
  keyId: string;
  /** The .p8 file's text (PEM). Newlines may be written as \n in the secret. */
  privateKey: string;
}

export interface AppleKeyEnv {
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_PRIVATE_KEY?: string;
}

export function appleKeyFromEnv(env: AppleKeyEnv): AppleKey | null {
  const teamId = env.APPLE_TEAM_ID?.trim();
  const keyId = env.APPLE_KEY_ID?.trim();
  const privateKey = pemKey(env.APPLE_PRIVATE_KEY);
  return teamId && keyId && privateKey ? { teamId, keyId, privateKey } : null;
}

/**
 * The .p8 key as PEM, however it was pasted into the secret: as is, with \n for
 * newlines, or on one line with spaces (PowerShell's "$(cat file)" does that).
 */
function pemKey(raw: string | undefined): string | undefined {
  const text = raw?.replace(/\\n/g, '\n').trim();
  if (!text) return undefined;
  const m = /-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/.exec(text);
  if (!m) return text;
  const body = m[2].replace(/\s+/g, '');
  return `-----BEGIN ${m[1]}-----\n${body.match(/.{1,64}/g)!.join('\n')}\n-----END ${m[1]}-----`;
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString('base64url');

/**
 * A client secret for Apple's REST API: a short-lived JWT signed with our key
 * (ES256), for one client: the app's bundle ID or the website's Services ID.
 */
export function appleClientSecret(key: AppleKey, clientId: string, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: key.keyId }));
  const body = b64url(JSON.stringify({ iss: key.teamId, iat, exp: iat + 300, aud: 'https://appleid.apple.com', sub: clientId }));
  const sig = sign('sha256', Buffer.from(`${head}.${body}`), { key: createPrivateKey(key.privateKey), dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${b64url(sig)}`;
}

/** Apple's REST API, or a stand-in for tests. */
export interface AppleTokenApi {
  /** An authorization code → the refresh token and the Apple user it is for, or null if Apple refuses it. */
  exchange(code: string, clientId: string): Promise<{ refreshToken: string; sub: string } | null>;
  /** Give a token back. Throws if Apple can't be reached or refuses. */
  revoke(token: string, hint: 'refresh_token' | 'access_token', clientId: string): Promise<void>;
}

const APPLE = 'https://appleid.apple.com/auth';

/**
 * The real API. `secretFor` gives the client secret for a client: made from
 * our key when we have it, else the website's ready-made APPLE_CLIENT_SECRET.
 */
export function appleTokenApi(secretFor: (clientId: string) => string | null, fetchFn: typeof fetch = fetch): AppleTokenApi {
  const post = (path: string, form: Record<string, string>) =>
    fetchFn(`${APPLE}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(10_000),
    });
  return {
    async exchange(code, clientId) {
      const secret = secretFor(clientId);
      if (!secret) return null;
      const r = await post('token', { client_id: clientId, client_secret: secret, code, grant_type: 'authorization_code' });
      if (!r.ok) return null;
      const t = (await r.json()) as { refresh_token?: string; id_token?: string };
      // The ID token came straight from Apple over HTTPS, so its claims can be read as they are.
      const sub = t.id_token ? (JSON.parse(Buffer.from(t.id_token.split('.')[1] ?? '', 'base64url').toString() || '{}') as { sub?: string }).sub : undefined;
      return t.refresh_token && sub ? { refreshToken: t.refresh_token, sub } : null;
    },
    async revoke(token, hint, clientId) {
      const secret = secretFor(clientId);
      if (!secret) throw new Error(`no client secret for ${clientId}`);
      const r = await post('revoke', { client_id: clientId, client_secret: secret, token, token_type_hint: hint });
      if (!r.ok) throw new Error(`Apple revoke failed (${r.status})`);
    },
  };
}

export async function migrateAppleTokens(db: Pool): Promise<void> {
  // Gone with the account (and revoked just before: revokeAppleTokens).
  await db.query(`
    CREATE TABLE IF NOT EXISTS apple_token (
      user_id       text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      client_id     text NOT NULL,
      refresh_token text NOT NULL,
      updated_at    timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, client_id)
    )`);
}

/** The Apple user (Apple's "sub") a player signed in with, if they did. */
export async function appleSubOf(db: Pool, userId: string): Promise<string[]> {
  const r = await db.query<{ accountId: string }>(`SELECT "accountId" FROM account WHERE "userId" = $1 AND "providerId" = 'apple'`, [userId]);
  return r.rows.map((x) => x.accountId);
}

/**
 * The iOS app's authorization code, sent once signed in: exchanged for a
 * refresh token and kept, but only if it is for the Apple user this account
 * signed in with. Returns whether one was kept.
 */
export async function keepAppleCode(db: Pool, api: AppleTokenApi, userId: string, code: string, clientId: string): Promise<boolean> {
  const subs = await appleSubOf(db, userId);
  if (subs.length === 0) return false;
  const t = await api.exchange(code, clientId);
  if (!t || !subs.includes(t.sub)) return false;
  await db.query(
    `INSERT INTO apple_token (user_id, client_id, refresh_token) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, client_id) DO UPDATE SET refresh_token = EXCLUDED.refresh_token, updated_at = now()`,
    [userId, clientId, t.refreshToken],
  );
  return true;
}

/**
 * Just before an account is deleted: revoke every Apple token we hold for it
 * (the app's, and the website's from Better Auth's sign-in). Never throws, so
 * deleting the account always goes ahead; failures are logged without the token.
 */
export async function revokeAppleTokens(db: Pool, api: AppleTokenApi, userId: string, webClientId: string | undefined): Promise<number> {
  const tokens: { token: string; hint: 'refresh_token' | 'access_token'; clientId: string }[] = [];
  try {
    const app = await db.query<{ client_id: string; refresh_token: string }>('SELECT client_id, refresh_token FROM apple_token WHERE user_id = $1', [userId]);
    for (const r of app.rows) tokens.push({ token: r.refresh_token, hint: 'refresh_token', clientId: r.client_id });
    if (webClientId) {
      const web = await db.query<{ refreshToken: string | null; accessToken: string | null }>(
        `SELECT "refreshToken", "accessToken" FROM account WHERE "userId" = $1 AND "providerId" = 'apple'`,
        [userId],
      );
      for (const r of web.rows) {
        if (r.refreshToken) tokens.push({ token: r.refreshToken, hint: 'refresh_token', clientId: webClientId });
        else if (r.accessToken) tokens.push({ token: r.accessToken, hint: 'access_token', clientId: webClientId });
      }
    }
  } catch (e) {
    console.error('apple: could not read tokens to revoke', e instanceof Error ? e.message : e);
    return 0;
  }
  let revoked = 0;
  for (const t of tokens) {
    try {
      await api.revoke(t.token, t.hint, t.clientId);
      revoked++;
    } catch (e) {
      console.error(`apple: revoking a token for ${t.clientId} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return revoked;
}
