import { describe, expect, it } from 'vitest';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { googlePlayApi, INTEGRITY_MAX_AGE_MS, integrityNonce, integrityProblem, playAccountTag, type IntegrityVerdict } from '../server/googlePlay';
import { integrityNonceWeb } from '../src/shop/playIntegrity';
import { playAccountTagWeb } from '../src/shop/playAccount';
import { COIN_PACKS, packForPlayProduct, playProductId } from '../src/shop/catalog';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KEY = JSON.stringify({
  client_email: 'billing@tardigeddon.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
});

/** A stand-in for Google: records the requests, answers from `routes`. */
function fakeGoogle(routes: (url: string, init: RequestInit) => { status?: number; body?: unknown }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === 'https://oauth2.googleapis.com/token') return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }));
    const r = routes(url, init);
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as typeof fetch;
  return { calls, fetchFn };
}

describe('Google Play billing (server)', () => {
  it('is off without a service account', () => {
    expect(googlePlayApi({})).toBeNull();
  });

  it('signs in with a signed JWT (and reuses the token), then checks a purchase', async () => {
    const g = fakeGoogle(() => ({ body: { purchaseState: 0, consumptionState: 0, obfuscatedExternalAccountId: 'abc' } }));
    // A base64 key works too (easier to paste into fly secrets).
    const api = googlePlayApi({ GOOGLE_PLAY_SERVICE_ACCOUNT: Buffer.from(KEY).toString('base64') }, g.fetchFn)!;
    const p = await api.getProduct('coins_500', 'tok/en+1');
    expect(p?.purchaseState).toBe(0);
    await api.getProduct('coins_500', 'again');
    const signIns = g.calls.filter((c) => c.url.includes('oauth2'));
    expect(signIns).toHaveLength(1);
    const assertion = new URLSearchParams(String(signIns[0].init.body)).get('assertion')!;
    const [head, claims, sig] = assertion.split('.');
    expect(createVerify('RSA-SHA256').update(`${head}.${claims}`).verify(publicKey, Buffer.from(sig, 'base64url'))).toBe(true);
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toMatchObject({
      iss: 'billing@tardigeddon.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/androidpublisher https://www.googleapis.com/auth/playintegrity',
    });
    const check = g.calls.find((c) => c.url.includes('/purchases/products/'))!;
    expect(check.url).toBe('https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.tardigeddon.app/purchases/products/coins_500/tokens/tok%2Fen%2B1');
    expect((check.init.headers as Record<string, string>).authorization).toBe('Bearer tok');
  });

  it("treats a token Google doesn't know as no purchase, and other failures as errors", async () => {
    const api = googlePlayApi({ GOOGLE_PLAY_SERVICE_ACCOUNT: KEY }, fakeGoogle((u) => ({ status: u.includes('made-up') ? 400 : 500 })).fetchFn)!;
    expect(await api.getProduct('coins_500', 'made-up')).toBeNull();
    await expect(api.getProduct('coins_500', 'x')).rejects.toThrow('500');
  });

  it('consumes, and pages through refunds', async () => {
    const g = fakeGoogle((url, init) => {
      if (url.includes(':consume')) return init.method === 'POST' ? {} : { status: 405 };
      return url.includes('token=p2')
        ? { body: { voidedPurchases: [{ purchaseToken: 'b', voidedReason: 7 }] } }
        : { body: { voidedPurchases: [{ purchaseToken: 'a' }], tokenPagination: { nextPageToken: 'p2' } } };
    });
    const api = googlePlayApi({ GOOGLE_PLAY_SERVICE_ACCOUNT: KEY }, g.fetchFn)!;
    await api.consume('coins_200', 't');
    expect(g.calls.some((c) => c.url.endsWith('/purchases/products/coins_200/tokens/t:consume'))).toBe(true);
    expect((await api.voided(0)).map((v) => v.purchaseToken)).toEqual(['a', 'b']);
  });

  it('the app and the server tag purchases with the same account hash', async () => {
    expect(await playAccountTagWeb('user-123')).toBe(playAccountTag('user-123'));
    expect(playAccountTag('user-123')).not.toBe(playAccountTag('user-124'));
    expect(playAccountTag('user-123')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('maps every coin pack to a valid Play product id and back', () => {
    for (const p of COIN_PACKS) {
      expect(playProductId(p)).toMatch(/^[a-z0-9_.]+$/);
      expect(packForPlayProduct(playProductId(p))).toBe(p);
    }
    expect(packForPlayProduct('hat_crown')).toBeUndefined();
    // coins_200 was deleted in the Play Console; deleted ids can't be reused.
    expect(playProductId(COIN_PACKS[0])).toBe('coins_200_1');
    expect(packForPlayProduct('coins_200')).toBeUndefined();
  });

  it('asks Google to open Play Integrity verdicts', async () => {
    const verdict = { accountDetails: { appLicensingVerdict: 'LICENSED' } };
    const g = fakeGoogle((url) => (url.includes('/bad:') ? { status: 500 } : { body: { tokenPayloadExternal: verdict } }));
    const api = googlePlayApi({ GOOGLE_PLAY_SERVICE_ACCOUNT: KEY, GOOGLE_PLAY_PACKAGE: 'com.tardigeddon.app' }, g.fetchFn)!;
    expect(await api.decodeIntegrity('sealed')).toEqual(verdict);
    const call = g.calls.find((c) => c.url.includes('playintegrity'))!;
    expect(call.url).toBe('https://playintegrity.googleapis.com/v1/com.tardigeddon.app:decodeIntegrityToken');
    expect(call.init.method).toBe('POST');
    expect(JSON.parse(String(call.init.body))).toEqual({ integrity_token: 'sealed' });
    // A token Google can't read is no verdict; Google failing is an error.
    expect(await googlePlayApi({ GOOGLE_PLAY_SERVICE_ACCOUNT: KEY }, fakeGoogle(() => ({ status: 400 })).fetchFn)!.decodeIntegrity('x')).toBeNull();
    await expect(googlePlayApi({ GOOGLE_PLAY_SERVICE_ACCOUNT: KEY, GOOGLE_PLAY_PACKAGE: 'bad' }, g.fetchFn)!.decodeIntegrity('x')).rejects.toThrow('500');
  });

  it('makes the same Play Integrity nonce in the app and on the server, with nothing personal in it', async () => {
    for (const what of ['buy:tok/en+1', 'check:abc', '']) {
      expect(await integrityNonceWeb(what)).toBe(integrityNonce(what));
      expect(integrityNonce(what)).toMatch(/^[A-Za-z0-9_-]{43}$/); // URL-safe base64, 16 to 500 characters
    }
    expect(integrityNonce('buy:tok')).not.toContain('tok');
  });

  it('accepts a Play Integrity verdict only for our app from Play, a licensed account and a genuine phone', () => {
    const now = 1_800_000_000_000;
    const want = { pkg: 'com.tardigeddon.app', nonce: integrityNonce('buy:t'), now };
    const good: IntegrityVerdict = {
      requestDetails: { requestPackageName: 'com.tardigeddon.app', nonce: want.nonce, timestampMillis: String(now - 1000) },
      appIntegrity: { appRecognitionVerdict: 'PLAY_RECOGNIZED', packageName: 'com.tardigeddon.app' },
      deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_BASIC_INTEGRITY', 'MEETS_DEVICE_INTEGRITY'] },
      accountDetails: { appLicensingVerdict: 'LICENSED' },
    };
    const with_ = (c: Partial<IntegrityVerdict>) => integrityProblem({ ...good, ...c }, want);
    expect(integrityProblem(good, want)).toBeNull();
    const req = good.requestDetails!;
    expect(with_({ requestDetails: { ...req, nonce: integrityNonce('buy:other') } })).toBe('request');
    expect(with_({ requestDetails: { ...req, requestPackageName: 'com.copycat' } })).toBe('request');
    expect(with_({ requestDetails: { ...req, timestampMillis: String(now - INTEGRITY_MAX_AGE_MS - 1) } })).toBe('request');
    expect(with_({ requestDetails: { ...req, timestampMillis: String(now + 5 * 60_000) } })).toBe('request');
    expect(with_({ requestDetails: { ...req, timestampMillis: undefined } })).toBe('request');
    expect(with_({ appIntegrity: { appRecognitionVerdict: 'UNRECOGNIZED_VERSION', packageName: 'com.tardigeddon.app' } })).toBe('app');
    expect(with_({ appIntegrity: { appRecognitionVerdict: 'UNEVALUATED' } })).toBe('app');
    expect(with_({ accountDetails: { appLicensingVerdict: 'UNLICENSED' } })).toBe('licence');
    expect(with_({ accountDetails: { appLicensingVerdict: 'UNEVALUATED' } })).toBe('licence');
    expect(with_({ deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_BASIC_INTEGRITY'] } })).toBe('device');
    expect(with_({ deviceIntegrity: {} })).toBe('device');
  });
});
