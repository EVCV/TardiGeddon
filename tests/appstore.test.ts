// App Store purchases (server/appStore.ts): the account tag, the storefront
// countries, Apple's root certificate, and Apple's own signature checks run for
// real against a stand-in certificate chain shaped like Apple's (made with
// openssl). Granting and refunds are in accounts.test.ts.
import { describe, expect, it } from 'vitest';
import { createHash, sign as signData } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appStoreAccountToken, appStoreApi } from '../server/appStore';
import { countryFromStorefront } from '../server/storefronts';
import { appStoreAccountTokenWeb } from '../src/shop/appStoreAccount';

describe('the account tag on App Store purchases', () => {
  it('is the same UUID in the app and on the server, and differs per player', async () => {
    for (const id of ['user_1', 'abcDEF123', 'x'.repeat(40)]) {
      const server = appStoreAccountToken(id);
      expect(server).toBe(await appStoreAccountTokenWeb(id));
      // A valid UUID (version 8, RFC 9562 variant), as StoreKit requires.
      expect(server).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
    expect(appStoreAccountToken('a')).not.toBe(appStoreAccountToken('b'));
  });
});

describe('App Store storefronts', () => {
  it('become two-letter countries', () => {
    expect(countryFromStorefront('JPN')).toBe('JP');
    expect(countryFromStorefront('GBR')).toBe('GB');
    expect(countryFromStorefront('USA')).toBe('US');
    expect(countryFromStorefront('BRA')).toBe('BR');
    expect(countryFromStorefront('jpn')).toBe('JP');
    expect(countryFromStorefront('XXX')).toBeNull();
    expect(countryFromStorefront(undefined)).toBeNull();
  });
});

describe("Apple's root certificate", () => {
  it('is Apple Root CA - G3, as apple.com/certificateauthority publishes it', () => {
    const der = readFileSync(new URL('../server/apple/AppleRootCA-G3.cer', import.meta.url));
    expect(createHash('sha256').update(der).digest('hex').toUpperCase()).toBe('63343ABFB89A6A03EBB57E9B3F5FA7BE7C4F5C756F3017B3A8C488C3653E9179');
  });
});

let openssl = true;
try {
  execFileSync('openssl', ['version']);
} catch {
  openssl = false;
}

/** A stand-in for Apple's chain: a root, an intermediate and a signing certificate with Apple's markers. */
function makeChain(marked = true): { root: Buffer; x5c: string[]; key: string } {
  const dir = mkdtempSync(join(tmpdir(), 'appstore-'));
  const run = (...args: string[]) => execFileSync('openssl', args, { cwd: dir, stdio: 'pipe' });
  const key = (name: string) => run('ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', `${name}.key`);
  writeFileSync(join(dir, 'ext.cnf'), [
    '[intermediate]', 'basicConstraints = critical,CA:TRUE', 'keyUsage = critical,keyCertSign,cRLSign', ...(marked ? ['1.2.840.113635.100.6.2.1 = DER:05:00'] : []),
    '[leaf]', 'basicConstraints = critical,CA:FALSE', 'keyUsage = critical,digitalSignature', ...(marked ? ['1.2.840.113635.100.6.11.1 = DER:05:00'] : []),
  ].join('\n'));
  key('root');
  run('req', '-new', '-x509', '-key', 'root.key', '-subj', '/CN=Test Root', '-days', '30', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign', '-out', 'root.pem');
  for (const [name, issuer] of [['intermediate', 'root'], ['leaf', 'intermediate']]) {
    key(name);
    run('req', '-new', '-key', `${name}.key`, '-subj', `/CN=Test ${name}`, '-out', `${name}.csr`);
    run('x509', '-req', '-in', `${name}.csr`, '-CA', `${issuer}.pem`, '-CAkey', `${issuer}.key`, '-CAcreateserial', '-days', '30', '-extfile', 'ext.cnf', '-extensions', name, '-out', `${name}.pem`);
  }
  const der = (name: string) => run('x509', '-in', `${name}.pem`, '-outform', 'DER');
  return { root: der('root'), x5c: ['leaf', 'intermediate', 'root'].map((n) => der(n).toString('base64')), key: readFileSync(join(dir, 'leaf.key'), 'utf8') };
}

/** Sign a payload as the App Store does: ES256, with the chain in the header. */
function jws(payload: object, chain: { x5c: string[]; key: string }): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = `${b64({ alg: 'ES256', x5c: chain.x5c })}.${b64(payload)}`;
  const sig = signData('sha256', Buffer.from(head), { key: chain.key, dsaEncoding: 'ieee-p1363' });
  return `${head}.${sig.toString('base64url')}`;
}

describe.skipIf(!openssl)("Apple's signature checks (server/appStore.ts)", () => {
  const chain = makeChain();
  const api = appStoreApi({ APPLE_APP_ID: '1234567890' }, { roots: [chain.root], onlineChecks: false })!;
  const now = Date.now();
  const transaction = (over: object = {}) => ({
    transactionId: '2000000123456789',
    originalTransactionId: '2000000123456789',
    bundleId: 'com.tardigeddon.app',
    productId: 'coins_500',
    purchaseDate: now,
    signedDate: now,
    quantity: 1,
    type: 'Consumable',
    inAppOwnershipType: 'PURCHASED',
    appAccountToken: appStoreAccountToken('player-1'),
    environment: 'Production',
    storefront: 'JPN',
    storefrontId: '143462',
    transactionReason: 'PURCHASE',
    ...over,
  });

  it('is off without the app’s Apple ID', () => {
    expect(appStoreApi({}, { roots: [chain.root] })).toBeNull();
    expect(appStoreApi({ APPLE_APP_ID: 'abc' }, { roots: [chain.root] })).toBeNull();
  });

  it('accepts a genuine purchase from the live store or the sandbox, and reads it', async () => {
    expect(await api.purchase(jws(transaction(), chain))).toEqual({
      transactionId: '2000000123456789',
      productId: 'coins_500',
      consumable: true,
      appAccountToken: appStoreAccountToken('player-1'),
      revoked: false,
      sandbox: false,
      region: 'JP',
    });
    const sandbox = await api.purchase(jws(transaction({ environment: 'Sandbox', storefront: 'GBR' }), chain));
    expect(sandbox).toMatchObject({ sandbox: true, region: 'GB' });
    expect(await api.purchase(jws(transaction({ revocationDate: now, revocationReason: 0 }), chain))).toMatchObject({ revoked: true });
  });

  it('refuses one for another app, a changed one, or one not signed through Apple’s chain', async () => {
    expect(await api.purchase(jws(transaction({ bundleId: 'com.someone.else' }), chain))).toBeNull();
    expect(await api.purchase(jws(transaction({ environment: 'Xcode' }), chain))).toBeNull();
    // Changed after signing: a bigger pack.
    const [h, , s] = jws(transaction(), chain).split('.');
    const forged = `${h}.${Buffer.from(JSON.stringify(transaction({ productId: 'coins_10000' }))).toString('base64url')}.${s}`;
    expect(await api.purchase(forged)).toBeNull();
    // Signed by someone else's certificates, or ones without Apple's markers.
    expect(await api.purchase(jws(transaction(), makeChain()))).toBeNull();
    const unmarked = makeChain(false);
    const unmarkedApi = appStoreApi({ APPLE_APP_ID: '1234567890' }, { roots: [unmarked.root], onlineChecks: false })!;
    expect(await unmarkedApi.purchase(jws(transaction(), unmarked))).toBeNull();
    expect(await api.purchase('not a purchase')).toBeNull();
  });

  it('reads refund notifications, and only genuine ones for our app', async () => {
    const note = (over: object = {}, tx: object = {}) =>
      jws(
        {
          notificationType: 'REFUND',
          notificationUUID: '6f1b4b1e-1c62-4ba8-9a4b-0d5b2f0a8c11',
          version: '2.0',
          signedDate: now,
          data: { environment: 'Production', bundleId: 'com.tardigeddon.app', appAppleId: 1234567890, signedTransactionInfo: jws(transaction({ revocationDate: now, ...tx }), chain) },
          ...over,
        },
        chain,
      );
    const n = await api.notification(note());
    expect(n).toMatchObject({ type: 'REFUND', purchase: { transactionId: '2000000123456789', revoked: true } });
    expect(await api.notification(note({ data: { environment: 'Production', bundleId: 'com.someone.else', appAppleId: 1234567890 } }))).toBeNull();
    expect(await api.notification(note({ data: { environment: 'Production', bundleId: 'com.tardigeddon.app', appAppleId: 999 } }))).toBeNull();
    expect(await api.notification(jws({ notificationType: 'REFUND', notificationUUID: 'x', version: '2.0', signedDate: now, data: {} }, makeChain()))).toBeNull();
  });
});
