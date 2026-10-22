// Accounts + shop against a real Postgres. Skipped unless TEST_DATABASE_URL
// points at an empty, throwaway database (it creates tables in it), e.g.
//   TEST_DATABASE_URL=postgres://postgres@localhost:5432/tardi_test npm test
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import Stripe from 'stripe';
import { createAccounts, type Accounts, type MeResponse } from '../server/accounts';
import { ChallengeRun, challengeDay, challengeWorld } from '../src/challenge/daily';
import { createWorld, tick } from '../src/sim/world';
import { CpuPlayer } from '../src/ai/cpu';
import type { SimEvent } from '../src/sim/types';
import type { GiftSent, SalesReport } from '../src/account/session';
import { wearableTeam } from '../server/room';
import { canWearHat, promoFor, PROMOS } from '../src/shop/catalog';
import { migrate, revokePurchase, unspentCoins } from '../server/store';
import type { Mail } from '../server/mail';
import { BUNDLES, bundlePrice } from '../src/shop/catalog';
import { defaultControls, type Controls } from '../src/input/controls';
import { playAccountTag, type PlayApi, type ProductPurchase, type VoidedPurchase } from '../server/googlePlay';

const DB = process.env.TEST_DATABASE_URL;
const WEBHOOK_SECRET = 'whsec_test_secret';
const GAME = 'http://localhost:5173/';

describe('shop hats', () => {
  it('are only wearable once owned', () => {
    expect(canWearHat('beanie', [])).toBe(true);
    expect(canWearHat('wizard', [])).toBe(false);
    expect(canWearHat('wizard', ['hat:wizard'])).toBe(true);
    expect(wearableTeam({ name: 'A', hat: 'wizard' }, []).hat).toBe('beanie');
    expect(wearableTeam({ name: 'A', hat: 'wizard' }, ['hat:wizard']).hat).toBe('wizard');
    expect(wearableTeam({ name: 'A', hat: 'tophat' }, []).hat).toBe('tophat');
  });

  it('include promo-code hats, which only the code unlocks', () => {
    expect(canWearHat('waterbear', [])).toBe(false);
    expect(canWearHat('waterbear', ['hat:waterbear'])).toBe(true);
    expect(promoFor('waterbear')?.items).toEqual(['hat:waterbear']);
    expect(promoFor(' Water-Bear ')?.code).toBe('WATERBEAR');
    expect(promoFor('WATERBEARS')).toBeUndefined();
    // A code with an end date works to the end of that day, then stops.
    PROMOS.push({ code: 'TESTEND', items: ['hat:waterbear'], until: '2026-10-31' });
    try {
      expect(promoFor('testend', Date.parse('2026-10-31T23:00:00Z'))).toBeDefined();
      expect(promoFor('testend', Date.parse('2026-11-01T00:00:01Z'))).toBeUndefined();
    } finally {
      PROMOS.pop();
    }
  });
});

describe.skipIf(!DB)('accounts and shop (Postgres)', () => {
  let accounts: Accounts;
  let server: Server;
  let base = '';
  const stripe = new Stripe('sk_test_not_used');
  const checkouts: Stripe.Checkout.SessionCreateParams[] = [];
  // No network in tests: record what would be sent to Stripe.
  stripe.checkout.sessions.create = (async (p: Stripe.Checkout.SessionCreateParams) => {
    checkouts.push(p);
    return { url: 'https://checkout.stripe.test/s' };
  }) as unknown as typeof stripe.checkout.sessions.create;

  let customers = 0;
  stripe.customers.create = (async () => ({ id: `cus_test_${++customers}` })) as unknown as typeof stripe.customers.create;
  stripe.billingPortal.sessions.create = (async (p: { customer: string }) => ({ url: `https://billing.stripe.test/${p.customer}` })) as unknown as typeof stripe.billingPortal.sessions.create;

  // No Google in tests: purchases the fake knows about, by token.
  const playPurchases = new Map<string, ProductPurchase & { productId: string }>();
  const consumed: string[] = [];
  const acknowledged: string[] = [];
  let consumeFails = false;
  let voided: VoidedPurchase[] = [];
  const play: PlayApi = {
    getProduct: async (productId, token) => {
      const p = playPurchases.get(token);
      return p && p.productId === productId ? p : null;
    },
    consume: async (_productId, token) => {
      if (consumeFails) throw new Error('Google Play consume failed (400)');
      consumed.push(token);
      const p = playPurchases.get(token);
      if (p) p.consumptionState = 1;
    },
    acknowledge: async (_productId, token) => void acknowledged.push(token),
    voided: async () => voided,
  };

  // No email service in tests: keep what would have been sent.
  const sent: Mail[] = [];
  const mailer = async (m: Mail) => void sent.push(m);
  /** The next email to `to` (they're sent in the background, so wait a moment). */
  async function mailTo(to: string, subject: RegExp): Promise<Mail> {
    for (let i = 0; i < 100; i++) {
      const m = sent.find((x) => x.to === to && subject.test(x.subject));
      if (m) return m;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`no email to ${to}`);
  }
  const linkToken = (m: Mail, param: string) => new RegExp(`^${GAME.replace(/[.?/]/g, '\\$&')}\\?${param}=(\\S+)$`, 'm').exec(m.text)?.[1] ?? '';

  beforeAll(async () => {
    accounts = await createAccounts(
      { DATABASE_URL: DB, BETTER_AUTH_SECRET: 'x'.repeat(16) + Math.random(), GAME_URL: GAME, STRIPE_SECRET_KEY: 'sk_test_not_used', STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, ADMIN_EMAILS: 'Boss@example.com', GOOGLE_CLIENT_ID: 'tardi-test.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'not-used' },
      { stripe, mailer, play },
    );
    await accounts.db.query(`DELETE FROM purchase; DELETE FROM spend; DELETE FROM gift; DELETE FROM "user"; DELETE FROM done_once WHERE name LIKE 'japan_alert_%';`);
    server = createServer((req, res) => void accounts.handle(req, res));
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://localhost:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await accounts?.close();
  });

  const post = (path: string, body: unknown, cookie = '') =>
    fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:5173', cookie }, body: JSON.stringify(body) });
  const me = async (cookie: string) => (await (await fetch(base + '/api/me', { headers: { cookie } })).json()) as MeResponse;

  async function signUp(email: string): Promise<{ cookie: string; id: string }> {
    const r = await post('/api/auth/sign-up/email', { email, password: 'correct horse', name: 'Tester' });
    expect(r.status).toBe(200);
    const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    return { cookie, id: (await me(cookie)).user!.id };
  }

  async function sendWebhook(type: string, object: Record<string, unknown>, secret = WEBHOOK_SECRET): Promise<number> {
    const payload = JSON.stringify({ id: 'evt_' + Math.random(), object: 'event', type, data: { object } });
    const header = await stripe.webhooks.generateTestHeaderStringAsync({ payload, secret });
    const r = await fetch(base + '/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': header, 'content-type': 'application/json' }, body: payload });
    return r.status;
  }

  const paid = (session: string, userId: string, item: string) => ({
    id: session,
    payment_status: 'paid',
    metadata: { userId, item },
    amount_total: 199,
    currency: 'gbp',
    payment_intent: 'pi_' + session,
  });

  it('signs up, and shows a signed-out visitor as nobody', async () => {
    expect((await me('')).user).toBeNull();
    const { cookie } = await signUp('one@example.com');
    const m = await me(cookie);
    expect(m.user?.email).toBe('one@example.com');
    expect(m.owned).toEqual([]);
    // Sessions don't keep IP addresses or browser details (Privacy Policy).
    const sess = await accounts.db.query('SELECT "ipAddress", "userAgent" FROM session WHERE "userId" = $1', [m.user!.id]);
    expect(sess.rows).toEqual([{ ipAddress: null, userAgent: null }]);
  });

  it('sells coin packs (only) at the catalogue price, to signed-in players', async () => {
    expect((await post('/api/shop/checkout', { item: 'coins:500' })).status).toBe(401);
    expect((await post('/api/shop/portal', {})).status).toBe(401);
    const { cookie, id } = await signUp('two@example.com');
    expect((await post('/api/shop/checkout', { item: 'coins:3', consent: true }, cookie)).status).toBe(400);
    // Money never buys items (or weapons) directly: only coins.
    expect((await post('/api/shop/checkout', { item: 'hat:wizard', consent: true }, cookie)).status).toBe(400);
    expect((await post('/api/shop/checkout', { item: 'weapon:megaspore', consent: true }, cookie)).status).toBe(400);
    // No checkout without consent to immediate supply (losing the 14-day cancellation right).
    expect((await post('/api/shop/checkout', { item: 'coins:500' }, cookie)).status).toBe(400);
    // Every pack needs "18 or over, or a parent or carer agreed" too, small ones included.
    expect((await post('/api/shop/checkout', { item: 'coins:200', consent: true }, cookie)).status).toBe(400);
    const r = await post('/api/shop/checkout', { item: 'coins:500', price: 1, consent: true, grownUp: true }, cookie);
    expect(r.status).toBe(200);
    expect(((await r.json()) as { url: string }).url).toContain('checkout.stripe.test');
    const p = checkouts.at(-1)!;
    expect(p.line_items?.[0].price_data?.unit_amount).toBe(499);
    expect(p.line_items?.[0].price_data?.product_data?.name).toBe('TardiGeddon: 550 coins (500 + 50 bonus)');
    // EVCV is the seller: Stripe's Managed Payments stays off unless configured.
    expect(p.managed_payments).toEqual({ enabled: false });
    expect(p.line_items?.[0].price_data?.tax_behavior).toBeUndefined();
    expect((await me(cookie)).receipts).toBe(true);
    expect(p.metadata).toHaveProperty('grownUpConfirmed');
    expect((await post('/api/shop/checkout', { item: 'coins:5000', consent: true }, cookie)).status).toBe(400);
    expect((await post('/api/shop/checkout', { item: 'coins:5000', consent: true, grownUp: true }, cookie)).status).toBe(200);
    // One Stripe customer per player, reused; an invoice (receipt) per purchase.
    expect(p.customer).toMatch(/^cus_test_/);
    expect(p.invoice_creation).toEqual({ enabled: true });
    await post('/api/shop/checkout', { item: 'coins:200', consent: true, grownUp: true }, cookie);
    expect(checkouts.at(-1)!.customer).toBe(p.customer);
    // ...and their purchases page opens on that customer.
    const portal = await post('/api/shop/portal', {}, cookie);
    expect(portal.status).toBe(200);
    expect(((await portal.json()) as { url: string }).url).toBe(`https://billing.stripe.test/${p.customer}`);
    expect(p.metadata).toMatchObject({ userId: id, item: 'coins:500' });
    expect(Date.parse(String(p.metadata?.immediateSupplyConsent))).toBeGreaterThan(0);
  });

  it('with Managed Payments, keeps prices VAT-inclusive, sends a tax code and leaves receipts to Stripe', async () => {
    // A second server on the same database, with Stripe as the seller.
    const managed = await createAccounts(
      { DATABASE_URL: DB, BETTER_AUTH_SECRET: 'y'.repeat(16) + Math.random(), GAME_URL: GAME, STRIPE_SECRET_KEY: 'sk_test_not_used', STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, STRIPE_MANAGED_PAYMENTS: 'on', STRIPE_AUTOMATIC_TAX: 'on' },
      { stripe, mailer: null },
    );
    const srv = createServer((req, res) => void managed.handle(req, res));
    await new Promise<void>((r) => srv.listen(0, r));
    const url = `http://localhost:${(srv.address() as AddressInfo).port}`;
    try {
      const send = (path: string, body: unknown, cookie = '') =>
        fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:5173', cookie }, body: JSON.stringify(body) });
      const su = await send('/api/auth/sign-up/email', { email: 'managed@example.com', password: 'correct horse', name: 'Tester' });
      const cookie = su.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
      expect((await send('/api/shop/checkout', { item: 'coins:500', consent: true, grownUp: true }, cookie)).status).toBe(200);
      const p = checkouts.at(-1)!;
      expect(p.managed_payments).toEqual({ enabled: true });
      // Without "inclusive", Stripe would add tax on top of the price the shop shows.
      expect(p.line_items?.[0].price_data?.tax_behavior).toBe('inclusive');
      expect(p.line_items?.[0].price_data?.unit_amount).toBe(499);
      expect(p.line_items?.[0].price_data?.product_data?.tax_code).toBe('txcd_10201000');
      // Not allowed with Managed Payments: Stripe handles tax and receipts itself.
      expect(p.automatic_tax).toBeUndefined();
      expect(p.invoice_creation).toBeUndefined();
      const m = (await (await fetch(url + '/api/me', { headers: { cookie } })).json()) as MeResponse;
      expect(m.receipts).toBe(false);
      expect((await send('/api/shop/portal', {}, cookie)).status).toBe(404);
    } finally {
      srv.close();
      await managed.close();
    }
  });

  it('credits coins once Stripe confirms payment, spends them on items, and takes them back on refund', async () => {
    const { cookie, id } = await signUp('coins@example.com');
    expect((await me(cookie)).wallet).toEqual({ coins: 0, slime: 0 });
    expect((await post('/api/shop/unlock', { item: 'hat:wizard' }, cookie)).status).toBe(402); // no coins yet
    expect(await sendWebhook('checkout.session.completed', paid('cs_c1', id, 'coins:500'))).toBe(200);
    expect(await sendWebhook('checkout.session.completed', paid('cs_c1', id, 'coins:500'))).toBe(200); // retry: once only
    expect((await me(cookie)).wallet.coins).toBe(550); // 500 + 50 bonus
    expect((await post('/api/shop/unlock', { item: 'hat:wizard' }, cookie)).status).toBe(200);
    expect((await post('/api/shop/unlock', { item: 'hat:wizard' }, cookie)).status).toBe(409); // already have it
    expect((await post('/api/shop/unlock', { item: 'skin:gold' }, cookie)).status).toBe(402); // 350 left, costs 500
    // Coins never buy Slime-only things (weapons).
    expect((await post('/api/shop/unlock', { item: 'weapon:megaspore' }, cookie)).status).toBe(402);
    let m = await me(cookie);
    expect(m.wallet).toEqual({ coins: 350, slime: 0 });
    expect(m.owned).toEqual(['hat:wizard']);
    // Refund: the coins go back (all 550 the payment gave), even though some were spent (balance below zero blocks spending).
    await sendWebhook('charge.refunded', { id: 'ch_c1', refunded: true, payment_intent: 'pi_cs_c1' });
    m = await me(cookie);
    expect(m.wallet.coins).toBe(-200);
    expect((await post('/api/shop/unlock', { item: 'hat:party' }, cookie)).status).toBe(402);
  });

  it('sells bundles at their discount, charging only for the looks you are missing, all at once', async () => {
    const { cookie, id } = await signUp('bundles@example.com');
    // Not enough coins: nothing changes.
    expect((await post('/api/shop/unlock', { item: 'bundle:sweet' }, cookie)).status).toBe(402);
    expect(await sendWebhook('checkout.session.completed', paid('cs_bundle1', id, 'coins:2000'))).toBe(200);
    expect((await me(cookie)).wallet.coins).toBe(2400);
    // Owning the party hat (100 of the bundle's 1,800 coins of looks) makes it cheaper.
    expect((await post('/api/shop/unlock', { item: 'hat:party' }, cookie)).status).toBe(200);
    const sweet = BUNDLES.find((b) => b.id === 'bundle:sweet')!;
    const price = bundlePrice(sweet, ['hat:party']);
    expect(price).toBe(Math.round((1450 * 1700) / 1800));
    expect((await post('/api/shop/unlock', { item: 'bundle:sweet' }, cookie)).status).toBe(200);
    const m = await me(cookie);
    expect(m.wallet.coins).toBe(2400 - 100 - price);
    expect([...m.owned].sort()).toEqual([...sweet.items].sort());
    expect((await post('/api/shop/unlock', { item: 'bundle:sweet' }, cookie)).status).toBe(409);
    expect((await post('/api/shop/unlock', { item: 'bundle:nope' }, cookie)).status).toBe(400);
  });

  it('shows the sales page to the owner only, once their email is confirmed', async () => {
    const sales = (cookie: string, days = 30) => fetch(`${base}/api/admin/sales?days=${days}`, { headers: { cookie } });
    const { cookie: someone } = await signUp('someone@example.com');
    expect((await sales(someone)).status).toBe(404);
    expect((await me(someone)).admin).toBeUndefined();
    // Anyone could sign up with the owner's address, so it only counts once confirmed.
    const boss = await signUp('boss@example.com');
    expect((await sales(boss.cookie)).status).toBe(404);
    await accounts.db.query('UPDATE "user" SET "emailVerified" = true WHERE id = $1', [boss.id]);
    expect((await me(boss.cookie)).admin).toBe(true);
    const r = await sales(boss.cookie);
    expect(r.status).toBe(200);
    const report = (await r.json()) as SalesReport;
    expect(report.days).toBe(30);
    // The bundle test above: one 2,000-coin pack, the party hat, then the rest of the Sweet bundle.
    const pack = report.packs.find((p) => p.item === 'coins:2000');
    expect(pack?.sold).toBeGreaterThanOrEqual(1);
    expect(report.spends.find((x) => x.item === 'bundle:sweet')?.buys).toBe(1);
    expect(report.spends.find((x) => x.item === 'hat:party')?.amount).toBeGreaterThanOrEqual(100);
    expect(report.owners.find((o) => o.item === 'hat:party')?.owners).toBeGreaterThanOrEqual(1);
    expect(report.players.total).toBeGreaterThanOrEqual(2);
    // Totals only: nothing about who bought what.
    expect(JSON.stringify(report)).not.toMatch(/@|user_?id/i);
    expect((await (await sales(boss.cookie, 0)).json()).days).toBe(0);

    // A pack bought 60 days ago and refunded today: a refund this week, not a sale.
    await accounts.db.query(
      `INSERT INTO purchase (id, user_id, item, amount, currency, payment_intent, status, created_at)
       VALUES ('cs_old', NULL, 'coins:10000', 9999, 'gbp', 'pi_old', 'paid', now() - interval '60 days')`,
    );
    await revokePurchase(accounts.db, 'pi_old', 'refunded');
    const week = (await (await sales(boss.cookie, 7)).json()) as SalesReport;
    expect(week.packs.find((p) => p.item === 'coins:10000')).toMatchObject({ sold: 0, refunded: 1, refundedAmount: 9999 });
    const year = (await (await sales(boss.cookie, 365)).json()) as SalesReport;
    expect(year.packs.find((p) => p.item === 'coins:10000')).toMatchObject({ sold: 1, amount: 9999, refunded: 1 });

    // Starting the figures from zero: nothing before counts, and nothing is deleted.
    const before = Number((await accounts.db.query<{ n: string }>('SELECT count(*) AS n FROM purchase')).rows[0].n);
    await accounts.db.query(`INSERT INTO done_once (name) VALUES ('sales_reset') ON CONFLICT (name) DO UPDATE SET at = now()`);
    const fresh = (await (await sales(boss.cookie, 0)).json()) as SalesReport;
    expect(fresh.resetAt).not.toBeNull();
    expect(fresh.packs).toEqual([]);
    expect(fresh.spends).toEqual([]);
    expect(fresh.players).toMatchObject({ joined: 0, buyers: 0 });
    expect(fresh.players.total).toBeGreaterThan(0);
    expect(Number((await accounts.db.query<{ n: string }>('SELECT count(*) AS n FROM purchase')).rows[0].n)).toBe(before);
    // A sale after the reset counts.
    expect(await sendWebhook('checkout.session.completed', paid('cs_after_reset', boss.id, 'coins:200'))).toBe(200);
    const after = (await (await sales(boss.cookie, 0)).json()) as SalesReport;
    expect(after.packs).toEqual([expect.objectContaining({ item: 'coins:200', sold: 1 })]);
    expect(after.players.buyers).toBe(1);
    await accounts.db.query(`DELETE FROM done_once WHERE name = 'sales_reset'`);
  });

  it('fills the sales log from unlocks made before it existed, only ever once', async () => {
    const count = async (sql: string) => Number((await accounts.db.query<{ n: string }>(sql)).rows[0].n);
    const unlocks = await count(`SELECT count(*) AS n FROM inventory WHERE source IN ('coins', 'slime')`);
    expect(unlocks).toBeGreaterThan(0);
    await accounts.db.query(`DELETE FROM spend; DELETE FROM done_once`);
    await migrate(accounts.db);
    expect(await count('SELECT count(*) AS n FROM spend')).toBe(unlocks);
    await migrate(accounts.db);
    expect(await count('SELECT count(*) AS n FROM spend')).toBe(unlocks);
    // Emptied on purpose later (a fresh start for the sales page): it stays empty.
    await accounts.db.query('DELETE FROM spend');
    await migrate(accounts.db);
    expect(await count('SELECT count(*) AS n FROM spend')).toBe(0);
  });

  it('only accepts shop and stats requests from the game itself', async () => {
    const { cookie } = await signUp('csrf@example.com');
    const from = (origin: string | null, type = 'application/json') =>
      fetch(base + '/api/shop/unlock', {
        method: 'POST',
        headers: { 'content-type': type, cookie, ...(origin ? { origin } : {}) },
        body: JSON.stringify({ item: 'hat:wizard' }),
      });
    expect((await from('https://evil.example')).status).toBe(403);
    expect((await from(null)).status).toBe(403);
    expect((await from('http://localhost:5173', 'text/plain')).status).toBe(403);
    expect((await from('http://localhost:5173')).status).toBe(402); // allowed through (no coins yet)
  });

  it('records the coins each payment gave, and a refund takes back exactly that', async () => {
    const { cookie, id } = await signUp('bonus@example.com');
    await sendWebhook('checkout.session.completed', paid('cs_b1', id, 'coins:2000'));
    expect((await me(cookie)).wallet.coins).toBe(2400); // 2,000 + 400 bonus
    const row = await accounts.db.query('SELECT coins FROM purchase WHERE id = $1', ['cs_b1']);
    expect(row.rows[0].coins).toBe(2400);
    // Pretend the pack gave fewer coins when it was bought (e.g. before a bonus changed).
    await accounts.db.query('UPDATE purchase SET coins = 2000 WHERE id = $1', ['cs_b1']);
    await sendWebhook('charge.refunded', { id: 'ch_b1', refunded: true, payment_intent: 'pi_cs_b1' });
    expect((await me(cookie)).wallet.coins).toBe(400);
  });

  it('treats coin packs bought before bonus coins as giving their base amount', async () => {
    const { cookie, id } = await signUp('legacy@example.com');
    await sendWebhook('checkout.session.completed', paid('cs_l1', id, 'coins:2000'));
    // An old purchase: no record of the coins it gave, and it gave 2,000 (no bonus then).
    await accounts.db.query('UPDATE purchase SET coins = NULL WHERE id = $1', ['cs_l1']);
    await accounts.db.query('UPDATE wallet SET coins = 2000 WHERE user_id = $1', [id]);
    await migrate(accounts.db);
    expect((await accounts.db.query('SELECT coins FROM purchase WHERE id = $1', ['cs_l1'])).rows[0].coins).toBe(2000);
    // And a refund with no record at all still takes back only the base amount.
    await accounts.db.query('UPDATE purchase SET coins = NULL WHERE id = $1', ['cs_l1']);
    await sendWebhook('charge.refunded', { id: 'ch_l1', refunded: true, payment_intent: 'pi_cs_l1' });
    expect((await me(cookie)).wallet.coins).toBe(0);
  });

  it('pays Slime for matches (CPU games capped per day) and Slime unlocks weapons', async () => {
    const { cookie, id } = await signUp('slime@example.com');
    // Online: 20 for playing, 30 for winning, 5 per pop (up to 8).
    await accounts.recordResults([{ userId: id, mode: 'online', won: true, popped: 3, damage: 0, selfDamage: 0, selfPopped: 0 }]);
    expect((await me(cookie)).wallet.slime).toBe(65);
    // CPU games pay less and stop at 200 a day.
    const r = (await (await post('/api/stats/match', { won: true, popped: 2 }, cookie)).json()) as { slime: number };
    expect(r.slime).toBe(29);
    await accounts.db.query('UPDATE wallet SET cpu_slime_today = 190 WHERE user_id = $1', [id]);
    await accounts.db.query("UPDATE wallet SET cpu_slime_day = current_date WHERE user_id = $1", [id]);
    accounts.resetLimits();
    const r2 = (await (await post('/api/stats/match', { won: true, popped: 2 }, cookie)).json()) as { slime: number };
    expect(r2.slime).toBe(10);
    expect((await me(cookie)).wallet.slime).toBe(65 + 29 + 10);
    // Spend it: 600 for the Pollen Pinball.
    expect((await post('/api/shop/unlock', { item: 'weapon:pinball' }, cookie)).status).toBe(402);
    await accounts.db.query('UPDATE wallet SET slime = 700 WHERE user_id = $1', [id]);
    expect((await post('/api/shop/unlock', { item: 'weapon:pinball' }, cookie)).status).toBe(200);
    const m = await me(cookie);
    expect(m.wallet.slime).toBe(100);
    expect(m.owned).toContain('weapon:pinball');
    expect(await accounts.playerFor({ cookie })).toMatchObject({ owned: ['weapon:pinball'] });
  });

  it('still grants items bought directly for money before coins existed, and takes them back on refund', async () => {
    const { cookie, id } = await signUp('three@example.com');
    expect(await sendWebhook('checkout.session.completed', paid('cs_1', id, 'hat:pirate'), 'whsec_wrong')).toBe(400);
    expect((await me(cookie)).owned).toEqual([]);

    expect(await sendWebhook('checkout.session.completed', paid('cs_1', id, 'hat:pirate'))).toBe(200);
    expect(await sendWebhook('checkout.session.completed', paid('cs_1', id, 'hat:pirate'))).toBe(200); // retry
    expect((await me(cookie)).owned).toEqual(['hat:pirate']);
    expect((await accounts.db.query('SELECT 1 FROM purchase WHERE id = $1', ['cs_1'])).rowCount).toBe(1);
    expect(await accounts.playerFor({ cookie })).toEqual({ userId: id, owned: ['hat:pirate'], rating: 1000 });

    expect(await sendWebhook('charge.refunded', { id: 'ch_1', refunded: true, payment_intent: 'pi_cs_1' })).toBe(200);
    expect((await me(cookie)).owned).toEqual([]);
  });

  it('ignores events from the other Stripe mode', async () => {
    const { cookie, id } = await signUp('six@example.com');
    const payload = JSON.stringify({ id: 'evt_live', object: 'event', type: 'checkout.session.completed', livemode: true, data: { object: paid('cs_live_x', id, 'hat:viking') } });
    const header = await stripe.webhooks.generateTestHeaderStringAsync({ payload, secret: WEBHOOK_SECRET });
    const r = await fetch(base + '/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': header }, body: payload });
    expect(r.status).toBe(200);
    expect((await me(cookie)).owned).toEqual([]); // the tests run with a test key
  });

  it('ignores unpaid sessions and unknown items', async () => {
    const { cookie, id } = await signUp('four@example.com');
    expect((await post('/api/shop/portal', {}, cookie)).status).toBe(404); // nothing bought yet
    await sendWebhook('checkout.session.completed', { ...paid('cs_2', id, 'hat:viking'), payment_status: 'unpaid' });
    await sendWebhook('checkout.session.completed', paid('cs_3', id, 'hat:golden'));
    expect((await me(cookie)).owned).toEqual([]);
  });

  it("keeps where unspent paid coins came from, for Japan's Payment Services Act", async () => {
    const { cookie, id } = await signUp('tokyo@example.com');
    await accounts.db.query(`UPDATE "user" SET "emailVerified" = true, "createdAt" = now() - interval '2 days' WHERE id = $1`, [id]);
    const lots = async () =>
      (
        await accounts.db.query<{ paid: boolean; region: string | null; coins: number; value: number; left_coins: number }>(
          'SELECT paid, region, coins, value, left_coins FROM coin_lot WHERE user_id = $1 ORDER BY id',
          [id],
        )
      ).rows;
    const japan = async () => (await unspentCoins(accounts.db)).filter((u) => u.region === 'JP');
    // Bought in Japan through Google Play: 1,000 paid coins (£9.99) and 150 free bonus coins.
    playPurchases.set('jp1', { productId: 'coins_1000', purchaseState: 0, consumptionState: 0, obfuscatedExternalAccountId: playAccountTag(id), regionCode: 'JP' });
    expect((await post('/api/shop/google', { productId: 'coins_1000', token: 'jp1' }, cookie)).status).toBe(200);
    expect(await lots()).toEqual([
      { paid: true, region: 'JP', coins: 1000, value: 999, left_coins: 1000 },
      { paid: false, region: 'JP', coins: 150, value: 0, left_coins: 150 },
    ]);
    expect(await japan()).toEqual([{ region: 'JP', currency: 'gbp', coins: 1000, value: 999 }]);
    // Spending takes the free coins first: a 200-coin hat leaves 950 paid coins.
    expect((await post('/api/shop/unlock', { item: 'hat:wizard' }, cookie)).status).toBe(200);
    expect((await lots()).map((l) => l.left_coins)).toEqual([950, 0]);
    expect(await japan()).toEqual([{ region: 'JP', currency: 'gbp', coins: 950, value: 949 }]);
    // A gift spends paid coins; cancelling it puts them back where they were.
    const gift = await post('/api/gift/buy', { item: 'hat:pirate', message: 'none' }, cookie);
    expect(gift.status).toBe(200);
    expect((await lots())[0].left_coins).toBe(750);
    const sent = (await (await fetch(base + '/api/gift/sent', { headers: { cookie } })).json()) as { gifts: GiftSent[] };
    expect((await post('/api/gift/cancel', { id: sent.gifts[0].id }, cookie)).status).toBe(200);
    expect((await lots()).map((l) => l.left_coins)).toEqual([950, 0]);
    // Lots always add up to the wallet.
    expect((await me(cookie)).wallet.coins).toBe(950);
    // Refunded: those coins are gone, and so is Japan's figure.
    voided = [{ purchaseToken: 'jp1', voidedReason: 1 }];
    await accounts.checkVoided();
    voided = [];
    expect(await japan()).toEqual([]);
    expect((await me(cookie)).wallet.coins).toBe(-200);
    // The debt comes out of the next pack first (bought in the UK on the website this time).
    expect(await sendWebhook('checkout.session.completed', { ...paid('cs_after_refund', id, 'coins:500'), customer_details: { address: { country: 'GB' } } })).toBe(200);
    expect((await me(cookie)).wallet.coins).toBe(350);
    const left = (await lots()).filter((l) => l.left_coins > 0);
    expect(left).toEqual([{ paid: true, region: 'GB', coins: 500, value: 199, left_coins: 350 }]);
  });

  it('emails the owner as Japan nears the ¥10 million limit, once per level', async () => {
    const { id } = await signUp('osaka@example.com');
    sent.length = 0;
    // £23,000 of unspent paid coins in Japan: ¥5,060,000 at the default ¥220, 50.6% of the limit.
    await accounts.db.query(`INSERT INTO coin_lot (user_id, paid, region, coins, value, currency, left_coins) VALUES ($1, true, 'JP', 1000000, 2300000, 'gbp', 1000000)`, [id]);
    await accounts.checkJapan();
    const mail = await mailTo('support@tardigeddon.com', /Japan coins at 50%/);
    expect(mail.text).toContain('¥5,060,000');
    // Not again for the same level.
    await accounts.checkJapan();
    await new Promise((r) => setTimeout(r, 50));
    expect(sent.filter((m) => /Japan/.test(m.subject))).toHaveLength(1);
    // Past 90%: one more email, for the highest level reached.
    await accounts.db.query(`UPDATE coin_lot SET value = 4200000 WHERE user_id = $1`, [id]);
    await accounts.checkJapan();
    await mailTo('support@tardigeddon.com', /Japan coins at 90%/);
    expect(sent.filter((m) => /Japan/.test(m.subject))).toHaveLength(2);
    await accounts.db.query('DELETE FROM coin_lot WHERE user_id = $1', [id]);
    await accounts.checkJapan();
  });

  it('handles one Google Play purchase reported twice at once: one consume, coins once', async () => {
    const { cookie, id } = await signUp('twice@example.com');
    const buy = () => post('/api/shop/google', { productId: 'coins_500', token: 'dup1' }, cookie);
    playPurchases.set('dup1', { productId: 'coins_500', purchaseState: 0, consumptionState: 0, acknowledgementState: 0, obfuscatedExternalAccountId: playAccountTag(id) });
    const [a, b] = await Promise.all([buy(), buy()]);
    const coins = [((await a.json()) as { coins: number }).coins, ((await b.json()) as { coins: number }).coins].sort();
    expect(coins).toEqual([0, 550]);
    expect(consumed.filter((t) => t === 'dup1')).toHaveLength(1);
    expect(acknowledged).not.toContain('dup1');
    expect((await me(cookie)).wallet.coins).toBe(550);
  });

  it("acknowledges a Google Play purchase Google won't consume, so it isn't refunded, and consumes it next time", async () => {
    const { cookie, id } = await signUp('ack@example.com');
    const buy = (token: string) => post('/api/shop/google', { productId: 'coins_500', token }, cookie);
    consumeFails = true;
    playPurchases.set('ack1', { productId: 'coins_500', purchaseState: 0, consumptionState: 0, acknowledgementState: 0, obfuscatedExternalAccountId: playAccountTag(id) });
    expect(await (await buy('ack1')).json()).toMatchObject({ coins: 550 });
    expect(acknowledged).toContain('ack1');
    expect(consumed).not.toContain('ack1');
    // The app sends it again later: no more coins, and this time it's consumed.
    consumeFails = false;
    expect(await (await buy('ack1')).json()).toMatchObject({ coins: 0 });
    expect(consumed).toContain('ack1');
    expect((await me(cookie)).wallet.coins).toBe(550);
  });

  it('sells coin packs in the Android app through Google Play: checked with Google, granted once, consumed, refundable', async () => {
    const { cookie, id } = await signUp('play@example.com');
    expect((await me(cookie)).playBilling).toBe(true);
    const buy = (token: string, productId = 'coins_500') => post('/api/shop/google', { productId, token }, cookie);
    const tag = playAccountTag(id);
    // Signed out, made-up and non-pack purchases get nothing.
    expect((await post('/api/shop/google', { productId: 'coins_500', token: 't1' })).status).toBe(401);
    expect((await buy('made-up')).status).toBe(400);
    expect((await buy('t1', 'hat_wizard')).status).toBe(400);

    playPurchases.set('t1', { productId: 'coins_500', purchaseState: 0, consumptionState: 0, obfuscatedExternalAccountId: tag });
    const r = await buy('t1');
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ coins: 550 });
    expect((await me(cookie)).wallet.coins).toBe(550);
    expect(consumed).toContain('t1');
    // Sent again (the app retries anything it didn't hear back about): no second grant.
    expect(await (await buy('t1')).json()).toMatchObject({ coins: 0 });
    playPurchases.get('t1')!.consumptionState = 0; // as if the consume had failed
    expect(await (await buy('t1')).json()).toMatchObject({ coins: 0 });
    expect((await me(cookie)).wallet.coins).toBe(550);

    // A purchase still being paid for: nothing yet.
    playPurchases.set('t2', { productId: 'coins_200_1', purchaseState: 2, consumptionState: 0, obfuscatedExternalAccountId: tag });
    expect((await buy('t2', 'coins_200_1')).status).toBe(202);
    // Made on another account: refused (it stays for that account).
    playPurchases.set('t3', { productId: 'coins_200_1', purchaseState: 0, consumptionState: 0, obfuscatedExternalAccountId: playAccountTag('someone-else') });
    expect((await buy('t3', 'coins_200_1')).status).toBe(403);
    // No account tag at all (not started by our app): refused too.
    playPurchases.set('t5', { productId: 'coins_200_1', purchaseState: 0, consumptionState: 0 });
    expect((await buy('t5', 'coins_200_1')).status).toBe(403);
    // A licence tester's purchase grants coins but counts as £0 on the sales page.
    playPurchases.set('t4', { productId: 'coins_200_1', purchaseState: 0, consumptionState: 0, purchaseType: 0, obfuscatedExternalAccountId: tag });
    expect((await buy('t4', 'coins_200_1')).status).toBe(200);
    const rows = await accounts.db.query<{ amount: number; item: string }>(`SELECT amount, item FROM purchase WHERE user_id = $1 ORDER BY item`, [id]);
    expect(rows.rows).toEqual([{ amount: 0, item: 'coins:200' }, { amount: 499, item: 'coins:500' }]);
    expect((await me(cookie)).wallet.coins).toBe(750);

    // Refunded through Google: the coins go back.
    voided = [{ purchaseToken: 't1' }];
    await accounts.checkVoided();
    await accounts.checkVoided(); // the hourly check sees it again: still only once
    expect((await me(cookie)).wallet.coins).toBe(200);
    voided = [];
  });

  it('keeps control settings on the account, cleaned, for signed-in players only', async () => {
    expect((await post('/api/settings', { controls: defaultControls() })).status).toBe(401);
    const { cookie } = await signUp('settings@example.com');
    expect((await me(cookie)).controls).toBeNull();
    expect((await post('/api/settings', { controls: 'nope' }, cookie)).status).toBe(400);
    const mine = { ...defaultControls(), touchSwap: true, keys: { ...defaultControls().keys, fire: ['Mouse0', 'Mouse0', 'Escape'] } };
    expect((await post('/api/settings', { controls: mine }, cookie)).status).toBe(200);
    const saved = (await me(cookie)).controls as Controls;
    expect(saved.keys.fire).toEqual(['Mouse0']);
    expect(saved.touchSwap).toBe(true);
    // Saving again replaces them.
    expect((await post('/api/settings', { controls: defaultControls() }, cookie)).status).toBe(200);
    expect(((await me(cookie)).controls as Controls).keys.fire).toEqual(['Space']);
  });

  it('keeps lifetime stats: online and CPU games, streaks, pops, damage and own goals', async () => {
    const { cookie, id } = await signUp('seven@example.com');
    expect((await me(cookie)).stats.onlinePlayed).toBe(0);
    const r = (won: boolean, mode: 'online' | 'cpu' = 'online') => ({ userId: id, mode, won, popped: 2, damage: 100, selfDamage: 15, selfPopped: 1 });
    await accounts.recordResults([r(true), r(true)]);
    await accounts.recordResults([r(false), { ...r(true), userId: 'nobody' }]);
    await accounts.recordResults([r(true)]);
    // A CPU match reported by the game (silly numbers are capped).
    const rep = await post('/api/stats/match', { won: true, popped: 999, damage: 50, selfDamage: 5, selfPopped: 0 }, cookie);
    expect(rep.status).toBe(200);
    expect((await post('/api/stats/match', { won: true }, cookie)).status).toBe(429); // too soon after the last
    const m = await me(cookie);
    expect(m.stats).toEqual({
      onlinePlayed: 4, onlineWon: 3, cpuPlayed: 1, cpuWon: 1,
      popped: 8 + 40, damage: 450, selfDamage: 65, selfPopped: 4,
      streak: 2, bestStreak: 2,
      // Private-room matches don't change the quick-play rating.
      rating: 1000, ratedGames: 0,
    });
    expect(Date.parse(m.user!.createdAt)).toBeGreaterThan(0);
    expect((await post('/api/stats/match', { won: true })).status).toBe(401);
  });

  it("explains Stripe's refusal when using test keys", async () => {
    const { cookie } = await signUp('eight@example.com');
    const real = stripe.checkout.sessions.create;
    stripe.checkout.sessions.create = (async () => {
      throw new Error('In order to use Checkout, you must set an account or business name.');
    }) as unknown as typeof real;
    const r = await post('/api/shop/checkout', { item: 'coins:200', consent: true, grownUp: true }, cookie);
    stripe.checkout.sessions.create = real;
    expect(r.status).toBe(502);
    expect(((await r.json()) as { error: string }).error).toContain('business name');
  });

  it('emails a reset link into the game, which sets a new password and signs out everywhere', async () => {
    const { cookie } = await signUp('forgetful@example.com');
    expect((await me(cookie)).mail).toBe(true);
    sent.length = 0;

    // The same answer for an unknown email, and nothing is sent.
    expect((await post('/api/auth/request-password-reset', { email: 'nobody@example.com' })).status).toBe(200);
    expect((await post('/api/auth/request-password-reset', { email: 'forgetful@example.com' })).status).toBe(200);
    const mail = await mailTo('forgetful@example.com', /reset/i);
    expect(sent.some((m) => m.to === 'nobody@example.com')).toBe(false);
    const token = linkToken(mail, 'reset');
    expect(token).toMatch(/^\w{20,}$/);
    expect(mail.html).toContain(`${GAME}?reset=${token}`);

    expect((await post('/api/auth/reset-password', { token, newPassword: 'short' })).status).toBe(400);
    expect((await post('/api/auth/reset-password', { token, newPassword: 'brand new password' })).status).toBe(200);
    // Used once only; the old sign-in is gone; only the new password works.
    expect((await post('/api/auth/reset-password', { token, newPassword: 'another password' })).status).toBe(400);
    expect((await me(cookie)).user).toBeNull();
    expect((await post('/api/auth/sign-in/email', { email: 'forgetful@example.com', password: 'correct horse' })).status).toBe(401);
    expect((await post('/api/auth/sign-in/email', { email: 'forgetful@example.com', password: 'brand new password' })).status).toBe(200);
  });

  it('confirms a new email address from the link in the welcome email', async () => {
    sent.length = 0;
    const { cookie } = await signUp('new@example.com');
    expect((await me(cookie)).user!.emailVerified).toBe(false);
    const token = linkToken(await mailTo('new@example.com', /confirm/i), 'verify');
    expect(token.length).toBeGreaterThan(20);
    expect((await fetch(`${base}/api/auth/verify-email?token=${encodeURIComponent(token + 'x')}`, { headers: { cookie } })).status).toBeGreaterThanOrEqual(400);
    const r = await fetch(`${base}/api/auth/verify-email?token=${encodeURIComponent(token)}`, { headers: { cookie } });
    expect(r.status).toBe(200);
    expect((await me(cookie)).user!.emailVerified).toBe(true);
  });

  it("puts a player's name into emails as text, never as HTML", async () => {
    sent.length = 0;
    // HTML can't get into a name at all (src/names.ts)...
    const bad = await post('/api/auth/sign-up/email', { email: 'html@example.com', password: 'correct horse', name: '<img src=x onerror=alert(1)>' });
    expect(bad.status).toBe(400);
    expect(sent.some((m) => m.to === 'html@example.com')).toBe(false);
    // ...and what can is escaped in the email.
    const r = await post('/api/auth/sign-up/email', { email: 'quote@example.com', password: 'correct horse', name: "Zoe O'Brien" });
    expect(r.status).toBe(200);
    const mail = await mailTo('quote@example.com', /confirm/i);
    expect(mail.html).toContain('Zoe O&#39;Brien');
  });

  it('gives looks as gifts with one-use codes, with limits and take-backs', async () => {
    const get = (path: string, cookie: string) => fetch(base + path, { headers: { cookie } });
    const giver = await signUp('giver@example.com');
    const friend = await signUp('friend@example.com');
    const other = await signUp('other@example.com');
    expect(await sendWebhook('checkout.session.completed', paid('cs_gift1', giver.id, 'coins:5000'))).toBe(200);
    const buy = (item: string, message = 'none') => post('/api/gift/buy', { item, message }, giver.cookie);
    const redeem = (code: string, cookie: string) => post('/api/gift/redeem', { code }, cookie);

    // Only from a confirmed email on an account at least a day old.
    expect((await buy('hat:wizard')).status).toBe(403);
    await accounts.db.query('UPDATE "user" SET "emailVerified" = true WHERE id = $1', [giver.id]);
    expect((await buy('hat:wizard')).status).toBe(403);
    await accounts.db.query(`UPDATE "user" SET "createdAt" = now() - interval '2 days' WHERE id = $1`, [giver.id]);

    // Looks and bundles only: never weapons (Slime) or coins.
    expect((await buy('weapon:pinball')).status).toBe(400);
    expect((await buy('coins:200')).status).toBe(400);
    const coins0 = (await me(giver.cookie)).wallet.coins;
    const r = await buy('hat:wizard', 'gg');
    expect(r.status).toBe(200);
    const { code } = (await r.json()) as { code: string };
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    expect((await me(giver.cookie)).wallet.coins).toBe(coins0 - 200);
    // Only a hash of the code is stored.
    const stored = await accounts.db.query<{ code_hash: string; hint: string }>('SELECT code_hash, hint FROM gift WHERE from_user = $1', [giver.id]);
    expect(JSON.stringify(stored.rows)).not.toContain(code.replace(/-/g, ''));
    expect(stored.rows[0].hint).toBe(code.slice(-4));

    // Not for yourself; case and dashes don't matter; once only.
    expect((await redeem(code, giver.cookie)).status).toBe(409);
    expect((await redeem('ZZZZ-ZZZZ-ZZZZ', friend.cookie)).status).toBe(404);
    const got = await redeem(code.toLowerCase().replace(/-/g, ' '), friend.cookie);
    expect(got.status).toBe(200);
    expect(await got.json()).toMatchObject({ item: 'hat:wizard', items: ['hat:wizard'], from: 'Tester', message: 'Good game! 🏆' });
    expect((await me(friend.cookie)).owned).toContain('hat:wizard');
    expect((await redeem(code, other.cookie)).status).toBe(409);

    // Already owned: the code stays good for someone else.
    const again = (await (await buy('hat:wizard')).json()) as { code: string };
    expect((await redeem(again.code, friend.cookie)).status).toBe(409);
    expect((await redeem(again.code, other.cookie)).status).toBe(200);

    // A bundle gives what's missing.
    const set = (await (await buy('bundle:sweet')).json()) as { code: string };
    await accounts.db.query(`INSERT INTO inventory (user_id, item, source) VALUES ($1, 'hat:party', 'coins')`, [friend.id]);
    expect(((await (await redeem(set.code, friend.cookie)).json()) as { items: string[] }).items.sort()).toEqual(['aim:candy', 'fx:confetti', 'skin:candy']);

    // Take back an unclaimed gift: coins back, code dead, and not counted as a sale.
    const coins1 = (await me(giver.cookie)).wallet.coins;
    const back = (await (await buy('hat:pirate')).json()) as { code: string };
    const list = (await (await get('/api/gift/sent', giver.cookie)).json()) as { gifts: GiftSent[] };
    expect(list.gifts.map((g) => g.status)).toEqual(['waiting', 'claimed', 'claimed', 'claimed']);
    expect(JSON.stringify(list)).not.toMatch(/friend|other@/);
    const waiting = list.gifts[0];
    expect((await post('/api/gift/cancel', { id: waiting.id }, friend.cookie)).status).toBe(409);
    expect((await post('/api/gift/cancel', { id: waiting.id }, giver.cookie)).status).toBe(200);
    expect((await post('/api/gift/cancel', { id: waiting.id }, giver.cookie)).status).toBe(409);
    expect((await me(giver.cookie)).wallet.coins).toBe(coins1);
    expect((await redeem(back.code, other.cookie)).status).toBe(404);
    const piratesSold = await accounts.db.query(`SELECT 1 FROM spend WHERE item = 'hat:pirate'`);
    expect(piratesSold.rowCount).toBe(0);

    // At most 5 a day (the one taken back counts too).
    expect((await buy('hat:chef')).status).toBe(200);
    expect((await buy('hat:fez')).status).toBe(429);
    // Code guessing is rate limited.
    accounts.resetLimits();
    for (let i = 0; i < 10; i++) expect((await redeem(`AAAA-AAAA-AAA${'ABCDEFGHJK'[i]}`, other.cookie)).status).toBe(404);
    expect((await redeem('AAAA-AAAA-AAAA', other.cookie)).status).toBe(429);
  });

  it('unlocks a promo code\'s look once per account, through the gift box', async () => {
    const { cookie } = await signUp('promo@example.com');
    const redeem = () => post('/api/gift/redeem', { code: 'water-bear' }, cookie);
    const r = await redeem();
    expect(r.status).toBe(200);
    expect(((await r.json()) as { items: string[] }).items).toEqual(['hat:waterbear']);
    expect((await me(cookie)).owned).toContain('hat:waterbear');
    expect((await redeem()).status).toBe(409);
    expect((await post('/api/gift/redeem', { code: 'water-bear' })).status).toBe(401);
  });

  it('hands a sign-in made in a browser tab to the Android app, only with the verifier the app kept', async () => {
    const challengeFor = (v: string) => createHash('sha256').update(v).digest('base64url');
    const verifier = randomBytes(32).toString('base64url');
    const challenge = challengeFor(verifier);
    const get = (path: string, cookie = '') => fetch(base + path, { redirect: 'manual', headers: { cookie } });

    // The app tells the game which client its Google account picker should ask for.
    expect((await me('')).googleClientId).toBe('tardi-test.apps.googleusercontent.com');

    // The tab starts at the provider, carrying the challenge in a cookie of its own.
    const start = await get(`/api/app/social?provider=google&challenge=${challenge}`);
    expect(start.status).toBe(302);
    expect(start.headers.get('location')).toMatch(/^https:\/\/accounts\.google\.com\//);
    expect(start.headers.getSetCookie().some((c) => c.startsWith(`tardi-app-challenge=${challenge};`))).toBe(true);
    // Unknown providers and bad challenges go straight back to the app.
    expect((await get(`/api/app/social?provider=nope&challenge=${challenge}`)).headers.get('location')).toBe('com.tardigeddon.app://signin?error=unavailable');
    expect((await get('/api/app/social?provider=google&challenge=short')).headers.get('location')).toBe('com.tardigeddon.app://signin?error=unavailable');

    // Back from the provider without a sign-in (cancelled): the app hears so.
    const cancelled = await get('/api/app/return', `tardi-app-challenge=${challenge}`);
    expect(cancelled.headers.get('location')).toBe('com.tardigeddon.app://signin?error=cancelled');

    // Signed in in the tab (as the provider's callback leaves it): a one-time token for the app.
    const { cookie: tab, id } = await signUp('tab@example.com');
    const handOff = async () => {
      const r = await get('/api/app/return', `${tab}; tardi-app-challenge=${challenge}`);
      const to = new URL(r.headers.get('location')!);
      expect(to.protocol + '//' + to.host + to.pathname).toBe('com.tardigeddon.app://signin');
      return to.searchParams.get('token')!;
    };

    // Someone else who caught the link can't use it without the verifier, and it's then used up.
    const stolen = await handOff();
    expect((await post('/api/app/redeem', { token: stolen, verifier: randomBytes(32).toString('base64url') })).status).toBe(400);
    expect((await post('/api/app/redeem', { token: stolen, verifier })).status).toBe(400);
    // Better Auth's own route for these tokens is closed.
    expect((await post('/api/auth/one-time-token/verify', { token: await handOff() })).status).toBe(404);

    // The app, with its verifier: signed in as the same player, once.
    const token = await handOff();
    const r = await post('/api/app/redeem', { token, verifier });
    expect(r.status).toBe(200);
    const app = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    expect((await me(app)).user?.id).toBe(id);
    expect((await post('/api/app/redeem', { token, verifier })).status).toBe(400);
  });

  it('puts daily challenge runs on the leaderboard only after playing them back itself', async () => {
    const day = challengeDay();
    const run = (popEverything: boolean) => {
      // A run made by the CPU's brain, recorded the way the game does.
      const s = createWorld(challengeWorld('targets', day, { name: 'x', color: 0, cpu: false }));
      const r = new ChallengeRun('targets', day);
      const brain = new CpuPlayer('perfect');
      const ev: SimEvent[] = [];
      while (!r.over) {
        const f = r.frameFor(s, s.turn.teamIdx === 0 && popEverything ? brain.next(s) : { held: 0, pressed: 0 });
        tick(s, f, ev);
        r.played(s, f, ev);
        ev.length = 0;
      }
      return { packed: r.packed(), result: r.result(s) };
    };
    expect((await post('/api/challenge/submit', { kind: 'targets', day, frames: [] })).status).toBe(401);
    const a = await signUp('champ@example.com');
    const b = await signUp('lazy@example.com');
    const good = run(true);
    const idle = run(false);
    // Unfinished runs, other days and made-up kinds are refused.
    expect((await post('/api/challenge/submit', { kind: 'targets', day, frames: [-10] }, a.cookie)).status).toBe(400);
    accounts.resetLimits();
    expect((await post('/api/challenge/submit', { kind: 'targets', day: '2001-01-01', frames: good.packed }, a.cookie)).status).toBe(400);
    expect((await post('/api/challenge/submit', { kind: 'chess', day, frames: good.packed }, a.cookie)).status).toBe(400);
    // A real run: the server's own playback gives the same result.
    const r = await post('/api/challenge/submit', { kind: 'targets', day, frames: good.packed }, a.cookie);
    expect(r.status).toBe(200);
    expect(((await r.json()) as { result: unknown }).result).toEqual(good.result);
    expect((await post('/api/challenge/submit', { kind: 'targets', day, frames: good.packed }, a.cookie)).status).toBe(429);
    expect((await post('/api/challenge/submit', { kind: 'targets', day, frames: idle.packed }, b.cookie)).status).toBe(200);
    // A worse run later doesn't replace the best.
    accounts.resetLimits();
    expect((await post('/api/challenge/submit', { kind: 'targets', day, frames: idle.packed }, a.cookie)).status).toBe(200);
    const board = (await (await fetch(`${base}/api/challenge/board?kind=targets&day=${day}`, { headers: { cookie: b.cookie } })).json()) as { rows: { rank: number; name: string; value: number; you?: boolean }[]; me: { rank: number } | null };
    expect(board.rows.map((x) => [x.rank, x.value])).toEqual([[1, good.result.value], [2, 0]]);
    expect(board.rows[1].you).toBe(true);
    expect(board.me?.rank).toBe(2);
    expect((await fetch(`${base}/api/challenge/board?kind=nope`)).status).toBe(400);
  }, 120_000);

  it('rates quick-play matches between accounts, and only those', async () => {
    const a = await signUp('ranked-a@example.com');
    const b = await signUp('ranked-b@example.com');
    const r = (userId: string, won: boolean, ranked: boolean) => ({ userId, mode: 'online' as const, won, popped: 0, damage: 0, selfDamage: 0, selfPopped: 0, ...(ranked ? { ranked } : {}) });
    // A private room: stats, but no rating change.
    await accounts.recordResults([r(a.id, true, false), r(b.id, false, false)]);
    expect((await me(a.cookie)).stats).toMatchObject({ rating: 1000, ratedGames: 0 });
    // Quick play: the winner goes up, the loser down.
    await accounts.recordResults([r(a.id, true, true), r(b.id, false, true)]);
    expect((await me(a.cookie)).stats).toMatchObject({ rating: 1020, ratedGames: 1 });
    expect((await me(b.cookie)).stats).toMatchObject({ rating: 980, ratedGames: 1 });
    // The game server learns it when they connect (for matching).
    expect((await accounts.playerFor({ cookie: a.cookie })).rating).toBe(1020);
  });

  it('makes friends only when both say yes, and only friends see each other online or invite each other', async () => {
    const a = await signUp('friend-a@example.com');
    const b = await signUp('friend-b@example.com');
    const c = await signUp('friend-c@example.com');
    const get = async (cookie: string) => (await (await fetch(base + '/api/friends', { headers: { cookie } })).json()) as {
      code: string; friends: { code: string; online: boolean; room: string | null }[]; requests: { code: string }[]; sent: { code: string }[];
    };
    const invites: string[] = [];
    accounts.setPresence({
      status: (id) => (id === a.id ? { online: true, room: 'ROOMA' } : { online: false, room: null }),
      invite: (_from, name, to) => (invites.push(`${name}->${to}`), 'sent'),
    });
    const codeA = (await get(a.cookie)).code;
    const codeB = (await get(b.cookie)).code;
    expect(codeA).toMatch(/^[A-Z2-9]{8}$/);
    expect((await get(a.cookie)).code).toBe(codeA); // the same every time
    expect((await fetch(base + '/api/friends')).status).toBe(401);
    const add = async (cookie: string, code: string) => (await (await post('/api/friends/add', { code }, cookie)).json()) as { result: string };
    expect((await post('/api/friends/add', { code: 'nope' }, b.cookie)).status).toBe(400);
    expect((await add(b.cookie, codeA)).result).toBe('asked');
    expect((await add(b.cookie, codeB)).result).toBe('self');
    // A request isn't a friendship: no status, no invites yet.
    expect((await get(a.cookie)).requests.map((x) => x.code)).toEqual([codeB]);
    expect((await get(b.cookie)).friends).toEqual([]);
    expect((await post('/api/friends/invite', { code: codeA }, b.cookie)).status).toBe(404);
    // A says yes (adding B's code back): friends both ways.
    expect((await add(a.cookie, codeB)).result).toBe('friends');
    const bView = await get(b.cookie);
    expect(bView.friends).toMatchObject([{ code: codeA, online: true, room: 'ROOMA' }]);
    expect(bView.sent).toEqual([]);
    expect((await (await post('/api/friends/invite', { code: codeA }, b.cookie)).json()).result).toBe('sent');
    expect(invites).toEqual([`Tester->${a.id}`]);
    // A stranger with A's code can only ask.
    expect((await add(c.cookie, codeA)).result).toBe('asked');
    expect((await get(c.cookie)).friends).toEqual([]);
    // Unfriending goes both ways.
    await post('/api/friends/remove', { code: codeB }, a.cookie);
    expect((await get(b.cookie)).friends).toEqual([]);
  });

  it('deleting an account removes what it owned', async () => {
    const { cookie, id } = await signUp('five@example.com');
    await sendWebhook('checkout.session.completed', paid('cs_4', id, 'hat:viking'));
    const r = await post('/api/auth/delete-user', { password: 'correct horse' }, cookie);
    expect(r.status).toBe(200);
    expect((await accounts.db.query('SELECT 1 FROM inventory WHERE user_id = $1', [id])).rowCount).toBe(0);
    const kept = await accounts.db.query('SELECT user_id FROM purchase WHERE id = $1', ['cs_4']);
    expect(kept.rows).toEqual([{ user_id: null }]);
  });
});
