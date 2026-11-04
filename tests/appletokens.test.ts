import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, verify } from 'node:crypto';
import { appleClientSecret, appleKeyFromEnv, appleTokenApi } from '../server/appleTokens';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const key = { teamId: 'TEAM123456', keyId: 'KEY1234567', privateKey: pem };
const part = (jwt: string, i: number) => JSON.parse(Buffer.from(jwt.split('.')[i], 'base64url').toString()) as Record<string, unknown>;

describe('Sign in with Apple tokens (revoked when an account is deleted)', () => {
  it('reads the key from the secrets, with \\n written for newlines', () => {
    expect(appleKeyFromEnv({})).toBeNull();
    expect(appleKeyFromEnv({ APPLE_TEAM_ID: 'T', APPLE_KEY_ID: 'K' })).toBeNull();
    const k = appleKeyFromEnv({ APPLE_TEAM_ID: ' T ', APPLE_KEY_ID: 'K', APPLE_PRIVATE_KEY: pem.replace(/\n/g, '\\n') });
    expect(k).toEqual({ teamId: 'T', keyId: 'K', privateKey: pem.trim() });
  });

  it('makes a client secret Apple accepts: ES256, signed with our key, for one client, five minutes', () => {
    const now = Date.UTC(2026, 10, 4);
    const jwt = appleClientSecret(key, 'com.tardigeddon.app', now);
    expect(part(jwt, 0)).toEqual({ alg: 'ES256', kid: 'KEY1234567' });
    expect(part(jwt, 1)).toEqual({ iss: 'TEAM123456', iat: now / 1000, exp: now / 1000 + 300, aud: 'https://appleid.apple.com', sub: 'com.tardigeddon.app' });
    const [h, b, s] = jwt.split('.');
    expect(verify('sha256', Buffer.from(`${h}.${b}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'))).toBe(true);
  });

  it('exchanges a code for a refresh token and the Apple user, and revokes a token', async () => {
    const calls: { url: string; form: URLSearchParams }[] = [];
    const idToken = ['{}', JSON.stringify({ sub: 'apple-user-1' }), 'sig'].map((x) => Buffer.from(x).toString('base64url')).join('.');
    const fake = (async (url: string, init: RequestInit) => {
      const form = new URLSearchParams(String(init.body));
      calls.push({ url, form });
      if (url.endsWith('/token')) return form.get('code') === 'good' ? Response.json({ refresh_token: 'r1', id_token: idToken }) : new Response('{"error":"invalid_grant"}', { status: 400 });
      return new Response('', { status: form.get('token') === 'r1' ? 200 : 400 });
    }) as typeof fetch;
    const api = appleTokenApi((c) => (c === 'com.tardigeddon.app' ? 'secret' : null), fake);

    expect(await api.exchange('good', 'com.tardigeddon.app')).toEqual({ refreshToken: 'r1', sub: 'apple-user-1' });
    expect(calls[0].url).toBe('https://appleid.apple.com/auth/token');
    expect(Object.fromEntries(calls[0].form)).toEqual({ client_id: 'com.tardigeddon.app', client_secret: 'secret', code: 'good', grant_type: 'authorization_code' });
    expect(await api.exchange('bad', 'com.tardigeddon.app')).toBeNull();
    // No secret for that client (no key, and not the website's Services ID): nothing is sent.
    const before = calls.length;
    expect(await api.exchange('good', 'other.client')).toBeNull();
    expect(calls.length).toBe(before);

    await api.revoke('r1', 'refresh_token', 'com.tardigeddon.app');
    expect(calls.at(-1)!.url).toBe('https://appleid.apple.com/auth/revoke');
    expect(Object.fromEntries(calls.at(-1)!.form)).toEqual({ client_id: 'com.tardigeddon.app', client_secret: 'secret', token: 'r1', token_type_hint: 'refresh_token' });
    await expect(api.revoke('nope', 'refresh_token', 'com.tardigeddon.app')).rejects.toThrow(/400/);
    await expect(api.revoke('r1', 'refresh_token', 'other.client')).rejects.toThrow(/no client secret/);
  });
});
