// Accounts + shop against a real Postgres. Skipped unless TEST_DATABASE_URL
// points at an empty, throwaway database (it creates tables in it), e.g.
//   TEST_DATABASE_URL=postgres://postgres@localhost:5432/tardi_test npm test
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import Stripe from 'stripe';
import { createAccounts, type Accounts, type MeResponse } from '../server/accounts';
import { wearableTeam } from '../server/room';
import { canWearHat } from '../src/shop/catalog';

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

  beforeAll(async () => {
    accounts = await createAccounts(
      { DATABASE_URL: DB, BETTER_AUTH_SECRET: 'x'.repeat(16) + Math.random(), GAME_URL: GAME, STRIPE_SECRET_KEY: 'sk_test_not_used', STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET },
      { stripe },
    );
    await accounts.db.query('DELETE FROM purchase; DELETE FROM "user";');
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

  it('starts checkout at the catalogue price, only for signed-in players', async () => {
    expect((await post('/api/shop/checkout', { item: 'hat:wizard' })).status).toBe(401);
    expect((await post('/api/shop/portal', {})).status).toBe(401);
    const { cookie, id } = await signUp('two@example.com');
    expect((await post('/api/shop/checkout', { item: 'hat:nope' }, cookie)).status).toBe(400);
    // No checkout without consent to immediate supply (losing the 14-day cancellation right).
    expect((await post('/api/shop/checkout', { item: 'hat:wizard' }, cookie)).status).toBe(400);
    const r = await post('/api/shop/checkout', { item: 'hat:wizard', price: 1, consent: true }, cookie);
    expect(r.status).toBe(200);
    expect(((await r.json()) as { url: string }).url).toContain('checkout.stripe.test');
    const p = checkouts.at(-1)!;
    expect(p.line_items?.[0].price_data?.unit_amount).toBe(199);
    // EVCV is the seller: Stripe's Managed Payments stays off unless configured.
    expect(p.managed_payments).toEqual({ enabled: false });
    // One Stripe customer per player, reused; an invoice (receipt) per purchase.
    expect(p.customer).toMatch(/^cus_test_/);
    expect(p.invoice_creation).toEqual({ enabled: true });
    await post('/api/shop/checkout', { item: 'hat:pirate', consent: true }, cookie);
    expect(checkouts.at(-1)!.customer).toBe(p.customer);
    // ...and their purchases page opens on that customer.
    const portal = await post('/api/shop/portal', {}, cookie);
    expect(portal.status).toBe(200);
    expect(((await portal.json()) as { url: string }).url).toBe(`https://billing.stripe.test/${p.customer}`);
    expect(p.metadata).toMatchObject({ userId: id, item: 'hat:wizard' });
    expect(Date.parse(String(p.metadata?.immediateSupplyConsent))).toBeGreaterThan(0);
  });

  it('grants an item once Stripe confirms payment, once, and takes it back on refund', async () => {
    const { cookie, id } = await signUp('three@example.com');
    expect(await sendWebhook('checkout.session.completed', paid('cs_1', id, 'hat:pirate'), 'whsec_wrong')).toBe(400);
    expect((await me(cookie)).owned).toEqual([]);

    expect(await sendWebhook('checkout.session.completed', paid('cs_1', id, 'hat:pirate'))).toBe(200);
    expect(await sendWebhook('checkout.session.completed', paid('cs_1', id, 'hat:pirate'))).toBe(200); // retry
    expect((await me(cookie)).owned).toEqual(['hat:pirate']);
    expect((await accounts.db.query('SELECT 1 FROM purchase WHERE id = $1', ['cs_1'])).rowCount).toBe(1);
    expect(await accounts.playerFor({ cookie })).toEqual({ userId: id, owned: ['hat:pirate'] });

    // Already owned: no second checkout.
    expect((await post('/api/shop/checkout', { item: 'hat:pirate', consent: true }, cookie)).status).toBe(409);

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
    const r = await post('/api/shop/checkout', { item: 'hat:viking', consent: true }, cookie);
    stripe.checkout.sessions.create = real;
    expect(r.status).toBe(502);
    expect(((await r.json()) as { error: string }).error).toContain('business name');
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
