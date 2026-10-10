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
import { migrate } from '../server/store';

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
    const r = await post('/api/shop/checkout', { item: 'coins:500', price: 1, consent: true }, cookie);
    expect(r.status).toBe(200);
    expect(((await r.json()) as { url: string }).url).toContain('checkout.stripe.test');
    const p = checkouts.at(-1)!;
    expect(p.line_items?.[0].price_data?.unit_amount).toBe(499);
    expect(p.line_items?.[0].price_data?.product_data?.name).toBe('TardiGeddon: 550 coins (500 + 50 bonus)');
    // EVCV is the seller: Stripe's Managed Payments stays off unless configured.
    expect(p.managed_payments).toEqual({ enabled: false });
    // The biggest packs also need "18 or over, or a parent or carer agreed".
    expect((await post('/api/shop/checkout', { item: 'coins:5000', consent: true }, cookie)).status).toBe(400);
    expect((await post('/api/shop/checkout', { item: 'coins:5000', consent: true, grownUp: true }, cookie)).status).toBe(200);
    expect(checkouts.at(-1)!.metadata).toHaveProperty('grownUpConfirmed');
    // One Stripe customer per player, reused; an invoice (receipt) per purchase.
    expect(p.customer).toMatch(/^cus_test_/);
    expect(p.invoice_creation).toEqual({ enabled: true });
    await post('/api/shop/checkout', { item: 'coins:200', consent: true }, cookie);
    expect(checkouts.at(-1)!.customer).toBe(p.customer);
    // ...and their purchases page opens on that customer.
    const portal = await post('/api/shop/portal', {}, cookie);
    expect(portal.status).toBe(200);
    expect(((await portal.json()) as { url: string }).url).toBe(`https://billing.stripe.test/${p.customer}`);
    expect(p.metadata).toMatchObject({ userId: id, item: 'coins:500' });
    expect(Date.parse(String(p.metadata?.immediateSupplyConsent))).toBeGreaterThan(0);
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
    expect(await accounts.playerFor({ cookie })).toEqual({ userId: id, owned: ['hat:pirate'] });

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
    const r = await post('/api/shop/checkout', { item: 'coins:200', consent: true }, cookie);
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
