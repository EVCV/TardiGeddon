// Accounts and the shop, served from the game server's HTTP port:
//   /api/auth/*           Better Auth (email + password; Google / Apple when configured)
//   GET  /api/me          who is signed in, what they own, what the shop offers
//   POST /api/shop/checkout   start a Stripe Checkout for one item
//   POST /api/stripe/webhook  Stripe tells us a payment completed / was refunded
//
// Everything is optional: with no DATABASE_URL the game server runs exactly
// as before (no accounts), and with no STRIPE_SECRET_KEY the shop is closed.
// See docs/ACCOUNTS.md for setup.

import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import { Pool } from 'pg';
import Stripe from 'stripe';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import { CURRENCY, SHOP_ITEMS, shopItem } from '../src/shop/catalog';
import type { MeResponse } from '../src/account/session';

export type { MeResponse };
import { NO_STATS, migrate, ownedItems, playerStats, purgeExpired, recordPurchase, recordResults, revokePurchase, type MatchResult } from './store';

export interface AccountsEnv {
  DATABASE_URL?: string;
  BETTER_AUTH_SECRET?: string;
  /** This server's public URL, e.g. https://server.tardigeddon.com */
  BETTER_AUTH_URL?: string;
  /** Where players are sent back to after paying or signing in with Google/Apple. */
  GAME_URL?: string;
  /** Extra comma-separated origins allowed to call the API (the game's origin is always allowed). */
  TRUSTED_ORIGINS?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  /** "on" to let Stripe Tax work out VAT for the buyer's country (needs Stripe Tax set up; prices stay VAT-inclusive). */
  STRIPE_AUTOMATIC_TAX?: string;
  /**
   * "on" to use Stripe Managed Payments (Stripe as merchant of record). Off by
   * default: EVCV Limited is the seller, as the Terms say. Needs STRIPE_TAX_CODE.
   */
  STRIPE_MANAGED_PAYMENTS?: string;
  /** Stripe product tax code for shop items (e.g. txcd_…), required by Managed Payments. */
  STRIPE_TAX_CODE?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_CLIENT_SECRET?: string;
  APPLE_APP_BUNDLE_IDENTIFIER?: string;
}

const MAX_BODY = 64 * 1024;

export type Accounts = Awaited<ReturnType<typeof createAccounts>>;

export async function createAccounts(env: AccountsEnv, opts: { db?: Pool; stripe?: Stripe } = {}) {
  if (!env.DATABASE_URL && !opts.db) throw new Error('DATABASE_URL is not set');
  const db = opts.db ?? new Pool({ connectionString: env.DATABASE_URL, max: 5 });
  const baseURL = env.BETTER_AUTH_URL ?? 'http://localhost:8787';
  // On a public server, a missing or guessable secret would let anyone forge sign-ins.
  if (baseURL.startsWith('https://') && (env.BETTER_AUTH_SECRET ?? '').length < 32) {
    throw new Error('BETTER_AUTH_SECRET must be set to a random string of at least 32 characters');
  }
  const gameUrl = env.GAME_URL ?? 'http://localhost:5173/';
  const gameOrigin = new URL(gameUrl);
  const origins = new Set([
    gameOrigin.origin,
    // The same site with or without "www." (https://example.com <-> https://www.example.com).
    `${gameOrigin.protocol}//${gameOrigin.hostname.startsWith('www.') ? gameOrigin.hostname.slice(4) : 'www.' + gameOrigin.hostname}${gameOrigin.port ? ':' + gameOrigin.port : ''}`,
    ...(env.TRUSTED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  ]);

  const socialProviders: Record<string, { clientId: string; clientSecret: string; appBundleIdentifier?: string }> = {};
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
  }
  if (env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET) {
    socialProviders.apple = {
      clientId: env.APPLE_CLIENT_ID,
      clientSecret: env.APPLE_CLIENT_SECRET,
      appBundleIdentifier: env.APPLE_APP_BUNDLE_IDENTIFIER,
    };
  }

  const options = {
    database: db,
    baseURL,
    secret: env.BETTER_AUTH_SECRET,
    // Apple posts its sign-in result back from its own origin.
    trustedOrigins: [...origins, ...(socialProviders.apple ? ['https://appleid.apple.com'] : [])],
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    socialProviders,
    // Fly.io passes the player's IP in this header. It is used, in memory only,
    // to rate-limit sign-in attempts; it is never written to the database.
    advanced: { ipAddress: { ipAddressHeaders: ['fly-client-ip', 'x-forwarded-for'] } },
    // Keep sessions minimal (the Privacy Policy says we don't store IP addresses).
    databaseHooks: {
      session: {
        create: { before: async (session) => ({ data: { ...session, ipAddress: null, userAgent: null } }) },
      },
    },
    telemetry: { enabled: false },
    // App stores require in-app account deletion. Inventory rows go with it (ON DELETE CASCADE).
    user: {
      deleteUser: {
        enabled: true,
        // Purchase records stay for the accounts (tax), but no longer point at anyone.
        afterDelete: async (user: { id: string }) => {
          await db.query('UPDATE purchase SET user_id = NULL WHERE user_id = $1', [user.id]);
        },
      },
    },
  } satisfies BetterAuthOptions;

  // Better Auth's own tables first (ours reference "user"), then ours.
  const { runMigrations } = await getMigrations(options);
  await runMigrations();
  await migrate(db);
  const auth = betterAuth(options);

  // Expired sign-ins and one-time codes are deleted, not just ignored.
  const purge = setInterval(() => void purgeExpired(db).catch((e) => console.error('purge failed', e)), 60 * 60_000);
  purge.unref();
  await purgeExpired(db);

  const tax = env.STRIPE_AUTOMATIC_TAX === 'on';
  const testMode = !(env.STRIPE_SECRET_KEY ?? '').includes('_live_');
  const stripe = opts.stripe ?? (env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null);
  const authHandler = toNodeHandler(auth);

  async function userFrom(headers: IncomingHttpHeaders): Promise<MeResponse['user']> {
    const s = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
    return s ? { id: s.user.id, name: s.user.name, email: s.user.email, createdAt: new Date(s.user.createdAt).toISOString() } : null;
  }

  /** CORS for the game's own origin(s), with cookies. */
  function cors(req: IncomingMessage, res: ServerResponse): void {
    const origin = req.headers.origin;
    if (origin && !origins.has(origin)) {
      // The browser will refuse to use our answer; say why in the server log.
      console.warn(`api: request from untrusted origin ${origin} (allowed: ${[...origins].join(', ')})`);
    }
    if (origin && origins.has(origin)) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('access-control-allow-credentials', 'true');
      res.setHeader('access-control-allow-headers', 'content-type');
      res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
      res.setHeader('vary', 'origin');
    }
  }

  function json(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  }

  async function checkout(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!stripe) return json(res, 503, { error: 'The shop is not open yet.' });
    const user = await userFrom(req.headers);
    if (!user) return json(res, 401, { error: 'Please sign in first.' });
    let body: { item?: unknown; consent?: unknown };
    try {
      body = JSON.parse((await readBody(req)).toString('utf8')) as typeof body;
    } catch {
      return json(res, 400, { error: 'Bad request.' });
    }
    // Prices come from the catalogue here, never from the browser.
    const item = typeof body.item === 'string' ? shopItem(body.item) : undefined;
    if (!item) return json(res, 400, { error: 'No such item.' });
    if ((await ownedItems(db, user.id)).includes(item.id)) return json(res, 409, { error: 'You already own that.' });
    // UK consumer law: digital content supplied straight away needs the buyer's express
    // consent and acknowledgement that they lose the 14-day right to cancel (Terms §5).
    if (body.consent !== true) return json(res, 400, { error: 'Please confirm you want the item straight away.' });
    const back = new URL(gameUrl);
    back.searchParams.set('shop', 'done');
    const cancel = new URL(gameUrl);
    cancel.searchParams.set('shop', 'cancel');
    let session: { url: string | null };
    try {
      session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: CURRENCY,
            unit_amount: item.price,
            // Catalogue prices include VAT (only needs saying when Stripe Tax is on).
            ...(tax ? { tax_behavior: 'inclusive' as const } : {}),
            product_data: { name: `TardiGeddon: ${item.name}`, ...(env.STRIPE_TAX_CODE ? { tax_code: env.STRIPE_TAX_CODE } : {}) },
          },
        },
      ],
      ...(tax ? { automatic_tax: { enabled: true } } : {}),
      // Stripe turns Managed Payments on by default for new accounts; we only use it when asked to.
      managed_payments: { enabled: env.STRIPE_MANAGED_PAYMENTS === 'on' },
      client_reference_id: user.id,
      metadata: { userId: user.id, item: item.id, immediateSupplyConsent: new Date().toISOString() },
      customer_email: user.email,
      success_url: back.toString(),
      cancel_url: cancel.toString(),
      });
    } catch (e) {
      // Usually a Stripe setting (e.g. no business name yet). Shown to players only with test keys.
      const why = e instanceof Error ? e.message : String(e);
      console.error('checkout: Stripe refused:', why);
      return json(res, 502, { error: testMode ? `Stripe said: ${why}` : "The shop couldn't start your payment. Please try again later." });
    }
    json(res, 200, { url: session.url });
  }

  /** Last CPU-match report per player, to stop a page spamming the stats. */
  const lastReport = new Map<string, number>();

  /**
   * The game reports a finished match against the CPU (online matches are
   * counted by the server itself). Players could fake these, but they only
   * affect their own stats, so sanity limits are enough.
   */
  async function reportCpuMatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const user = await userFrom(req.headers);
    if (!user) return json(res, 401, { error: 'Please sign in first.' });
    let body: Record<string, unknown>;
    try {
      body = JSON.parse((await readBody(req)).toString('utf8')) as Record<string, unknown>;
    } catch {
      return json(res, 400, { error: 'Bad request.' });
    }
    const now = Date.now();
    if (now - (lastReport.get(user.id) ?? 0) < 20_000) return json(res, 429, { error: 'Too many reports.' });
    lastReport.set(user.id, now);
    const count = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0);
    await recordResults(db, [
      {
        userId: user.id,
        mode: 'cpu',
        won: body.won === true,
        popped: count(body.popped, 40),
        damage: count(body.damage, 20_000),
        selfDamage: count(body.selfDamage, 20_000),
        selfPopped: count(body.selfPopped, 40),
      },
    ]);
    json(res, 200, { ok: true });
  }

  async function webhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!stripe || !env.STRIPE_WEBHOOK_SECRET) return json(res, 503, { error: 'Not configured.' });
    const raw = await readBody(req);
    let event: { type: string; livemode?: boolean; data: { object: Record<string, unknown> } };
    try {
      // Proves the request really came from Stripe.
      event = (await stripe.webhooks.constructEventAsync(raw, String(req.headers['stripe-signature'] ?? ''), env.STRIPE_WEBHOOK_SECRET)) as unknown as typeof event;
    } catch {
      return json(res, 400, { error: 'Bad signature.' });
    }
    // A test-mode payment must never grant anything on a server taking real money (and vice versa).
    const liveKey = (env.STRIPE_SECRET_KEY ?? '').startsWith('sk_live_') || (env.STRIPE_SECRET_KEY ?? '').startsWith('rk_live_');
    if (env.STRIPE_SECRET_KEY && event.livemode !== undefined && event.livemode !== liveKey) return json(res, 200, { ignored: 'wrong mode' });
    const o = event.data.object;
    const str = (v: unknown): string | null => (typeof v === 'string' ? v : v && typeof v === 'object' && 'id' in v ? String((v as { id: unknown }).id) : null);
    if (
      (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') &&
      o.payment_status === 'paid'
    ) {
      const meta = (o.metadata ?? {}) as Record<string, string>;
      if (meta.userId && meta.item && shopItem(meta.item)) {
        await recordPurchase(db, {
          sessionId: String(o.id),
          userId: meta.userId,
          item: meta.item,
          amount: Number(o.amount_total ?? 0),
          currency: String(o.currency ?? CURRENCY),
          paymentIntent: str(o.payment_intent),
        });
      }
    } else if (event.type === 'charge.refunded' && o.refunded === true) {
      const pi = str(o.payment_intent);
      if (pi) await revokePurchase(db, pi, 'refunded');
    } else if (event.type === 'charge.dispute.created') {
      const pi = str(o.payment_intent);
      if (pi) await revokePurchase(db, pi, 'disputed');
    }
    json(res, 200, { received: true });
  }

  return {
    db,
    auth,
    /** Handle an /api request; returns false for any other URL. */
    async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
      const path = (req.url ?? '').split('?')[0];
      if (!path.startsWith('/api/')) return false;
      try {
        if (path === '/api/stripe/webhook' && req.method === 'POST') {
          await webhook(req, res);
          return true;
        }
        cors(req, res);
        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
        } else if (path.startsWith('/api/auth/')) {
          // Refused sign-ins are logged with the reason (never the email or password).
          res.on('finish', () => {
            if (res.statusCode >= 400) console.warn(`auth: ${req.method} ${path} -> ${res.statusCode} (origin ${req.headers.origin ?? 'none'})`);
          });
          await authHandler(req, res);
        } else if (path === '/api/me' && req.method === 'GET') {
          const user = await userFrom(req.headers);
          const me: MeResponse = {
            user,
            owned: user ? await ownedItems(db, user.id) : [],
            stats: user ? await playerStats(db, user.id) : { ...NO_STATS },
            shop: stripe !== null && SHOP_ITEMS.length > 0,
            providers: Object.keys(socialProviders),
          };
          json(res, 200, me);
        } else if (path === '/api/stats/match' && req.method === 'POST') {
          await reportCpuMatch(req, res);
        } else if (path === '/api/shop/checkout' && req.method === 'POST') {
          await checkout(req, res);
        } else {
          json(res, 404, { error: 'Not found.' });
        }
      } catch (e) {
        console.error('api error', path, e);
        if (!res.headersSent) json(res, 500, { error: 'Something went wrong. Please try again.' });
      }
      return true;
    },
    /** Who these request headers (cookies) belong to, and what they own; nobody if signed out. */
    async playerFor(headers: IncomingHttpHeaders): Promise<{ userId?: string; owned: string[] }> {
      const user = await userFrom(headers);
      return user ? { userId: user.id, owned: await ownedItems(db, user.id) } : { owned: [] };
    },
    /** Add a finished online match to the players' stats. */
    async recordResults(results: MatchResult[]): Promise<void> {
      await recordResults(db, results);
    },
    async close(): Promise<void> {
      clearInterval(purge);
      await db.end();
    },
  };
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
