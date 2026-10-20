// Accounts and the shop, served from the game server's HTTP port:
//   /api/auth/*           Better Auth (email + password; Google / Apple when configured)
//   GET  /api/me          who is signed in, what they own, what the shop offers
//   POST /api/shop/checkout   start a Stripe Checkout for one item
//   POST /api/stripe/webhook  Stripe tells us a payment completed / was refunded
//
// Everything is optional: with no DATABASE_URL the game server runs exactly
// as before (no accounts), and with no STRIPE_SECRET_KEY the shop is closed.
// See docs/ACCOUNTS.md for setup.

import { createHash } from 'node:crypto';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import { Pool } from 'pg';
import Stripe from 'stripe';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { APIError } from 'better-auth/api';
import { NAME_PROBLEM_TEXT, nameProblem, safeName, tidyName } from '../src/names';
import { getMigrations } from 'better-auth/db/migration';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import { CURRENCY, GIFTS_PER_DAY, GIFT_MIN_ACCOUNT_HOURS, bundle, coinPack, formatNumber, giftable, packForPlayProduct, packTotal, shopItem, type CoinPack } from '../src/shop/catalog';
import type { MeResponse } from '../src/account/session';
import { japanAlertEmail, resetEmail, smtpMailer, verifyEmail, type MailEnv, type Mailer, type Mail } from './mail';
import { DEFAULT_JPY_PER_GBP, JAPAN_LIMIT_YEN } from '../src/shop/japan';

export type { MeResponse };
import { NO_STATS, earnSlime, setStripeCustomerId, stripeCustomerId, unlockBundle, unlockItem, walletOf, migrate, ownedItems, playerStats, purgeExpired, recordPurchase, recordResults, revokePurchase, salesReport, japanAlertsDue, buyGift, redeemGift, cancelGift, giftsSent, controlsOf, saveControlsFor, type MatchResult } from './store';
import { sanitiseControls } from '../src/input/controls';
import { googlePlayApi, playAccountTag, type PlayApi, type PlayEnv } from './googlePlay';

export interface AccountsEnv extends MailEnv, PlayEnv {
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
   * "on" to use Stripe Managed Payments (Stripe as merchant of record), as
   * production does and the Terms (5.1.3) and Privacy Policy (4.0.4) say
   * (docs/ACCOUNTS.md). Off (e.g. in tests), EVCV Limited is the seller. Needs STRIPE_TAX_CODE.
   */
  STRIPE_MANAGED_PAYMENTS?: string;
  /** Stripe product tax code for shop items (e.g. txcd_…), required by Managed Payments. */
  STRIPE_TAX_CODE?: string;
  /** "off" to skip creating an invoice (downloadable receipt) for each purchase. */
  STRIPE_INVOICES?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_CLIENT_SECRET?: string;
  APPLE_APP_BUNDLE_IDENTIFIER?: string;
  /** Comma-separated emails that may see the sales page (confirmed email only). */
  ADMIN_EMAILS?: string;
  /** Yen per pound for the Japan coins figure (default src/shop/japan.ts DEFAULT_JPY_PER_GBP, set high on purpose). */
  JPY_PER_GBP?: string;
  /** Where the Japan coins alerts go (default support@tardigeddon.com). */
  JAPAN_ALERT_EMAIL?: string;
}

const MAX_BODY = 64 * 1024;

export type Accounts = Awaited<ReturnType<typeof createAccounts>>;

export async function createAccounts(env: AccountsEnv, opts: { db?: Pool; stripe?: Stripe; mailer?: Mailer | null; play?: PlayApi | null } = {}) {
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

  // Password reset and email confirmation need an email service (SMTP_* secrets).
  const mailer = opts.mailer === undefined ? smtpMailer(env) : opts.mailer;
  /** Not awaited: a slow email service mustn't hold up the request, or show by its timing whether an account exists. */
  const send = (mail: Mail) => {
    if (!mailer) return;
    // Never log addresses (docs/SECURITY.md), not even inside the email service's error.
    mailer(mail).catch((e: unknown) =>
      console.error(`mail: "${mail.subject}" not sent: ${(e instanceof Error ? e.message : String(e)).replace(/\S+@\S+/g, '<address>')}`),
    );
  };
  /** A link into the game: the game finishes the job (choose a new password, confirm the email). */
  const gameLink = (param: string, token: string) => {
    const u = new URL(gameUrl);
    u.searchParams.set(param, token);
    return u.href;
  };

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

  /** A player name tidied, or a refusal the sign-up form shows. */
  const checkedName = (raw: unknown): string => {
    const name = tidyName(raw, 32);
    const problem = name ? nameProblem(name) : null;
    if (!name) throw new APIError('BAD_REQUEST', { message: 'Please choose a player name.' });
    if (problem) throw new APIError('BAD_REQUEST', { message: NAME_PROBLEM_TEXT[problem] });
    return name;
  };

  const options = {
    database: db,
    baseURL,
    secret: env.BETTER_AUTH_SECRET,
    // Apple posts its sign-in result back from its own origin.
    trustedOrigins: [...origins, ...(socialProviders.apple ? ['https://appleid.apple.com'] : [])],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      // Signed out everywhere once the password changes (whoever knew the old one too).
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      ...(mailer
        ? {
            sendResetPassword: async ({ user, token }: { user: { email: string; name: string }; token: string }) =>
              send(resetEmail(user.email, user.name, gameLink('reset', token))),
          }
        : {}),
    },
    ...(mailer
      ? {
          emailVerification: {
            sendOnSignUp: true,
            expiresIn: 24 * 60 * 60,
            sendVerificationEmail: async ({ user, token }: { user: { email: string; name: string }; token: string }) =>
              send(verifyEmail(user.email, user.name, gameLink('verify', token))),
          },
        }
      : {}),
    // 3 of these emails a minute per IP address, so nobody can use us to flood an inbox.
    rateLimit: {
      customRules: {
        '/request-password-reset': { window: 60, max: 3 },
        '/send-verification-email': { window: 60, max: 3 },
      },
    },
    socialProviders,
    // Fly.io passes the player's IP in this header. It is used, in memory only,
    // to rate-limit sign-in attempts; it is never written to the database.
    advanced: { ipAddress: { ipAddressHeaders: ['fly-client-ip', 'x-forwarded-for'] } },
    // Keep sessions minimal (the Privacy Policy says we don't store IP addresses).
    databaseHooks: {
      // The player name is shown to other players (on gifts): safe for children, no contact details.
      user: {
        create: { before: async (user) => ({ data: { ...user, name: checkedName(user.name) } }) },
        update: { before: async (user) => (typeof user.name === 'string' ? { data: { ...user, name: checkedName(user.name) } } : { data: user }) },
      },
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

  // Managed Payments: Stripe is the seller (merchant of record) and handles VAT and sales tax
  // everywhere, sends its own receipts, and needs a tax code for what's sold.
  const managed = env.STRIPE_MANAGED_PAYMENTS === 'on';
  // Stripe Tax on our own account (not needed, or allowed, with Managed Payments).
  const tax = env.STRIPE_AUTOMATIC_TAX === 'on' && !managed;
  // Video games, downloaded, non-subscription, permanent rights: Stripe's own example for a coin bundle.
  const taxCode = env.STRIPE_TAX_CODE || (managed ? 'txcd_10201000' : undefined);
  const testMode = !(env.STRIPE_SECRET_KEY ?? '').includes('_live_');
  const stripe = opts.stripe ?? (env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null);
  const authHandler = toNodeHandler(auth);
  // Google Play Billing (coins bought in the Android app): off without a service account.
  const play = opts.play !== undefined ? opts.play : googlePlayApi(env);
  // Refunds and chargebacks made through Google Play take the coins back (as Stripe's do).
  const checkVoided = async () => {
    if (!play) return;
    for (const v of await play.voided(Date.now() - 7 * 24 * 3600_000)) {
      await revokePurchase(db, `gplay:${v.purchaseToken}`, v.voidedReason === 7 ? 'disputed' : 'refunded');
    }
  };
  const voidedTimer = setInterval(() => void checkVoided().catch((e) => console.error('google play refunds check failed', e)), 60 * 60_000);
  voidedTimer.unref();

  // Japan's Payment Services Act: email the owner as Japanese players' unspent
  // paid coins near ¥10 million (src/shop/japan.ts), once per level.
  const rate = Number(env.JPY_PER_GBP);
  const jpyPerGbp = Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_JPY_PER_GBP;
  const alertTo = (env.JAPAN_ALERT_EMAIL ?? '').trim() || 'support@tardigeddon.com';
  const checkJapan = async () => {
    const { yen, levels } = await japanAlertsDue(db, jpyPerGbp);
    if (levels.length) send(japanAlertEmail(alertTo, yen, Math.max(...levels), JAPAN_LIMIT_YEN, gameUrl));
  };
  const japanTimer = setInterval(() => void checkJapan().catch((e) => console.error('japan coins check failed', e)), 60 * 60_000);
  japanTimer.unref();

  async function userFrom(headers: IncomingHttpHeaders): Promise<MeResponse['user']> {
    const s = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
    return s ? { id: s.user.id, name: s.user.name, email: s.user.email, emailVerified: s.user.emailVerified, createdAt: new Date(s.user.createdAt).toISOString() } : null;
  }

  const admins = new Set((env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean));
  /** The owner: an email listed in ADMIN_EMAILS, and confirmed, so nobody can sign up as it. */
  const isAdmin = (user: MeResponse['user']): boolean => !!user && user.emailVerified === true && admins.has(user.email.toLowerCase());

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

  /** Sent from one of the game's own origins, as JSON (which other sites can't send without asking us first). */
  function fromGame(req: IncomingMessage): boolean {
    const origin = req.headers.origin;
    const type = req.headers['content-type'] ?? '';
    return typeof origin === 'string' && origins.has(origin) && type.startsWith('application/json');
  }

  function json(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(JSON.stringify(body));
  }

  async function checkout(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!stripe) return json(res, 503, { error: 'The shop is not open yet.' });
    const user = await userFrom(req.headers);
    if (!user) return json(res, 401, { error: 'Please sign in first.' });
    let body: { item?: unknown; consent?: unknown; grownUp?: unknown };
    try {
      body = JSON.parse((await readBody(req)).toString('utf8')) as typeof body;
    } catch {
      return json(res, 400, { error: 'Bad request.' });
    }
    // Money only ever buys coin packs; prices come from the catalogue, never the browser.
    const item = typeof body.item === 'string' ? coinPack(body.item) : undefined;
    if (!item) return json(res, 400, { error: 'No such coin pack.' });
    // UK consumer law: digital content supplied straight away needs the buyer's express
    // consent and acknowledgement that they lose the 14-day right to cancel (Terms §5).
    if (body.consent !== true) return json(res, 400, { error: 'Please confirm you want the coins straight away.' });
    // Every pack: 18 or over, or a parent or carer has agreed (Terms 5.1.1).
    if (body.grownUp !== true) return json(res, 400, { error: "Please confirm you're 18 or over, or that a parent or carer has agreed." });
    const back = new URL(gameUrl);
    back.searchParams.set('shop', 'done');
    const cancel = new URL(gameUrl);
    cancel.searchParams.set('shop', 'cancel');
    let session: { url: string | null };
    try {
      const customer = await stripeCustomer(user);
      session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: CURRENCY,
            unit_amount: item.price,
            // Catalogue prices include VAT. Must be said whenever Stripe works out tax, or it adds tax on top.
            ...(tax || managed ? { tax_behavior: 'inclusive' as const } : {}),
            product_data: { name: `TardiGeddon: ${formatNumber(packTotal(item))} coins${item.bonus ? ` (${formatNumber(item.coins)} + ${formatNumber(item.bonus)} bonus)` : ''}`, ...(taxCode ? { tax_code: taxCode } : {}) },
          },
        },
      ],
      ...(tax ? { automatic_tax: { enabled: true } } : {}),
      // Stripe turns Managed Payments on by default for new accounts; we only use it when asked to.
      managed_payments: { enabled: managed },
      client_reference_id: user.id,
      metadata: { userId: user.id, item: item.id, immediateSupplyConsent: new Date().toISOString(), grownUpConfirmed: new Date().toISOString() },
      // The player's own Stripe customer, so all their purchases appear in the purchases portal.
      customer,
      // An invoice per purchase: a receipt they can download from the portal any time.
      // (With Managed Payments, Stripe sends its own receipts instead.)
      ...(managed || env.STRIPE_INVOICES === 'off' ? {} : { invoice_creation: { enabled: true } }),
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

  /** The player's Stripe customer id, created on their first purchase. */
  async function stripeCustomer(user: NonNullable<MeResponse['user']>): Promise<string> {
    const known = await stripeCustomerId(db, user.id);
    if (known) return known;
    const c = await stripe!.customers.create({ email: user.email, name: user.name, metadata: { userId: user.id } });
    return setStripeCustomerId(db, user.id, c.id);
  }

  /** Stripe's own page where players see their purchases, download receipts and update billing details. */
  async function purchasesPortal(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!stripe) return json(res, 503, { error: 'The shop is not open yet.' });
    const user = await userFrom(req.headers);
    if (!user) return json(res, 401, { error: 'Please sign in first.' });
    // With Managed Payments there are no invoices for the page to list: Stripe emails the receipts.
    if (managed) return json(res, 404, { error: 'Your receipts are in the emails from Stripe. For help with a purchase, email support@tardigeddon.com.' });
    const customer = await stripeCustomerId(db, user.id);
    // The purchases page is made with the first coin purchase. Items bought directly,
    // before coins existed (test payments only), have no page: don't claim "nothing bought".
    if (!customer) return json(res, 404, { error: 'Your purchases page appears after your first coin purchase. For anything bought before then, email support@tardigeddon.com for a receipt.' });
    try {
      const portal = await stripe.billingPortal.sessions.create({ customer, return_url: gameUrl });
      json(res, 200, { url: portal.url });
    } catch (e) {
      // e.g. the Customer Portal hasn't been set up in the Stripe dashboard yet.
      const why = e instanceof Error ? e.message : String(e);
      console.error('portal: Stripe refused:', why);
      json(res, 502, { error: testMode ? `Stripe said: ${why}` : "Your purchases page isn't available right now. Please try again later." });
    }
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
    const result: MatchResult = {
      userId: user.id,
      mode: 'cpu',
      won: body.won === true,
      popped: count(body.popped, 40),
      damage: count(body.damage, 20_000),
      selfDamage: count(body.selfDamage, 20_000),
      selfPopped: count(body.selfPopped, 40),
    };
    await recordResults(db, [result]);
    json(res, 200, { ok: true, slime: await earnSlime(db, result) });
  }

  /** Spend coins or Slime on a shop item. */
  async function unlock(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const user = await userFrom(req.headers);
    if (!user) return json(res, 401, { error: 'Please sign in first.' });
    let body: { item?: unknown };
    try {
      body = JSON.parse((await readBody(req)).toString('utf8')) as typeof body;
    } catch {
      return json(res, 400, { error: 'Bad request.' });
    }
    // A whole bundle at once.
    const set = typeof body.item === 'string' ? bundle(body.item) : undefined;
    if (set) {
      const r = await unlockBundle(db, user.id, set.id);
      if (r === 'owned') return json(res, 409, { error: 'You already have everything in that bundle.' });
      if (r === 'poor') return json(res, 402, { error: 'Not enough coins.' });
      return json(res, 200, { ok: true });
    }
    const item = typeof body.item === 'string' ? shopItem(body.item) : undefined;
    if (!item) return json(res, 400, { error: 'No such item.' });
    const r = await unlockItem(db, user.id, item.id);
    if (r === 'owned') return json(res, 409, { error: 'You already have that.' });
    if (r === 'poor') return json(res, 402, { error: item.coins !== undefined ? 'Not enough coins.' : 'Not enough Slime yet: keep playing!' });
    json(res, 200, { ok: true });
  }

  /** Save the player's control settings (Settings page). */
  async function saveSettings(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const user = await userFrom(req.headers);
    if (!user) return json(res, 401, { error: 'Please sign in first.' });
    const body = await readJson(req);
    const controls = sanitiseControls(body?.controls);
    if (!controls) return json(res, 400, { error: 'Bad request.' });
    await saveControlsFor(db, user.id, controls);
    json(res, 200, { ok: true });
  }

  /** Gift-code tries per player per minute: codes can't be guessed by brute force. */
  const redeemTries = new Map<string, { at: number; n: number }>();

  async function readJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
    try {
      const v = JSON.parse((await readBody(req)).toString('utf8')) as unknown;
      return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  /** Buy a gift with your coins: you get a one-use code to pass on. */
  async function giftBuy(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const user = await userFrom(req.headers);
    if (!user) return json(res, 401, { error: 'Please sign in first.' });
    // A confirmed email and a day-old account, so a stolen card can't be turned straight into gifts.
    if (!user.emailVerified) return json(res, 403, { error: 'Confirm your email first (on the Account page) to send gifts.' });
    if (Date.now() - Date.parse(user.createdAt) < GIFT_MIN_ACCOUNT_HOURS * 3600_000) {
      return json(res, 403, { error: 'New accounts can send gifts after their first day.' });
    }
    const body = await readJson(req);
    if (!body || typeof body.item !== 'string' || !giftable(body.item)) return json(res, 400, { error: 'That can’t be given as a gift.' });
    const r = await buyGift(db, user.id, body.item, typeof body.message === 'string' ? body.message : 'none');
    if (!r.ok) {
      if (r.why === 'poor') return json(res, 402, { error: 'Not enough coins.' });
      if (r.why === 'limit') return json(res, 429, { error: `You can send up to ${GIFTS_PER_DAY} gifts a day. Try again tomorrow.` });
      return json(res, 400, { error: 'That can’t be given as a gift.' });
    }
    json(res, 200, { code: r.code });
  }

  /** Claim a gift with its code. */
  async function giftRedeem(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const user = await userFrom(req.headers);
    if (!user) return json(res, 401, { error: 'Please sign in first.' });
    const now = Date.now();
    const t = redeemTries.get(user.id);
    const tries = t && now - t.at < 60_000 ? t : { at: now, n: 0 };
    if (tries.n >= 10) return json(res, 429, { error: 'Too many tries. Wait a minute and check the code.' });
    tries.n++;
    redeemTries.set(user.id, tries);
    const body = await readJson(req);
    const code = body && typeof body.code === 'string' ? body.code.slice(0, 40) : '';
    if (!code) return json(res, 400, { error: 'Type in the gift code.' });
    const r = await redeemGift(db, user.id, code);
    if (!r.ok) {
      const why = {
        unknown: "That code doesn't match a gift. Check it and try again.",
        used: 'That gift has already been claimed.',
        own: "That's a gift you bought: give the code to a friend.",
        owned: 'You already have everything in that gift. The code still works, so it can go to someone else.',
      }[r.why];
      return json(res, r.why === 'unknown' ? 404 : 409, { error: why });
    }
    // Names from before the name rules came in are only shown if they pass them.
    json(res, 200, { item: r.item, items: r.items, from: r.from ? safeName(r.from, 32, '') || null : null, message: r.message });
  }

  /**
   * A coin pack bought in the Android app: check the purchase with Google,
   * grant its coins once, then consume it (so it can be bought again). The
   * app sends any purchase it hasn't heard back about again later, so this
   * must be safe to call more than once for the same purchase.
   */
  const playChecks = new Map<string, number[]>();
  /** Purchases being checked right now, by token (see googlePlayPurchase). */
  const playInFlight = new Map<string, Promise<void>>();
  async function googlePlayPurchase(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!play) return json(res, 503, { error: 'Buying in the app is not open yet.' });
    const user = await userFrom(req.headers);
    if (!user) return json(res, 401, { error: 'Please sign in first.' });
    // Each check is a call to Google: a few a minute is plenty for any player.
    const now = Date.now();
    const recent = (playChecks.get(user.id) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= 20) return json(res, 429, { error: 'Too many tries. Please wait a minute.' });
    playChecks.set(user.id, [...recent, now]);
    const body = await readJson(req);
    const productId = typeof body?.productId === 'string' ? body.productId : '';
    const token = typeof body?.token === 'string' && body.token.length <= 4000 ? body.token : '';
    // Only coin packs, priced in the Play Console; never trust the app's word for what was bought.
    const pack = packForPlayProduct(productId);
    if (!pack || !token) return json(res, 400, { error: 'No such coin pack.' });
    // The app reports a new purchase twice at once (its Buy button, and Google's
    // "purchases updated" signal). Done side by side, both would try to consume it
    // and Google refuses the second; so the second waits, then finds it done.
    const before = playInFlight.get(token) ?? Promise.resolve();
    const mine = before.then(() => settlePlayPurchase(res, user, pack, productId, token));
    // What the next report waits on: never fails, and is what gets removed once done.
    const tracked = mine.catch(() => {});
    playInFlight.set(token, tracked);
    try {
      await mine;
    } finally {
      // Forget it, unless another report of the same purchase has queued behind it.
      if (playInFlight.get(token) === tracked) playInFlight.delete(token);
    }
  }

  /** Check one Google Play purchase with Google, grant it once, and consume it. */
  async function settlePlayPurchase(res: ServerResponse, user: NonNullable<MeResponse['user']>, pack: CoinPack, productId: string, token: string): Promise<void> {
    if (!play) return json(res, 503, { error: 'Buying in the app is not open yet.' });
    const p = await play.getProduct(productId, token);
    if (!p) return json(res, 400, { error: "Google Play doesn't know that purchase." });
    if (p.purchaseState === 2) return json(res, 202, { pending: true });
    if (p.purchaseState !== 0) return json(res, 400, { error: 'That purchase was cancelled.' });
    // Bought while signed in to a different account (or not in our app at all): not this player's.
    if (p.obfuscatedExternalAccountId !== playAccountTag(user.id)) {
      return json(res, 403, { error: 'That purchase was made on a different TardiGeddon account. Sign in to that account to get the coins.' });
    }
    const id = `gplay:${createHash('sha256').update(token).digest('hex')}`;
    if (p.consumptionState === 1) {
      // Already delivered (consumed after we granted it): nothing more to do, if it was ours.
      const known = await db.query('SELECT 1 FROM purchase WHERE id = $1 AND user_id = $2', [id, user.id]);
      return known.rowCount ? json(res, 200, { ok: true, coins: 0 }) : json(res, 409, { error: 'That purchase has already been used.' });
    }
    // Licence testers' purchases (purchaseType 0) cost nothing: count them as £0, so the sales page stays true.
    const granted = await recordPurchase(db, {
      sessionId: id,
      userId: user.id,
      item: pack.id,
      amount: p.purchaseType === 0 ? 0 : pack.price,
      currency: CURRENCY,
      paymentIntent: `gplay:${token}`,
      region: p.regionCode,
    });
    // Not consumed (Google down, or it refused): the app sends it again next time, which
    // grants nothing twice and tries again. Meanwhile it's acknowledged, so Google
    // doesn't refund it after three days (which would take the coins back).
    await play.consume(productId, token).catch(async (e: unknown) => {
      console.error('google play consume failed', e);
      if (p.acknowledgementState !== 1) await play.acknowledge(productId, token).catch((e2: unknown) => console.error('google play acknowledge failed', e2));
    });
    json(res, 200, { ok: true, coins: granted ? packTotal(pack) : 0 });
  }

  async function giftCancel(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const user = await userFrom(req.headers);
    if (!user) return json(res, 401, { error: 'Please sign in first.' });
    const body = await readJson(req);
    const id = body && typeof body.id === 'number' && Number.isSafeInteger(body.id) ? body.id : 0;
    if (!(await cancelGift(db, user.id, id))) return json(res, 409, { error: 'That gift has already been claimed or cancelled.' });
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
      if (meta.userId && meta.item && (coinPack(meta.item) || shopItem(meta.item))) {
        await recordPurchase(db, {
          sessionId: String(o.id),
          userId: meta.userId,
          item: meta.item,
          amount: Number(o.amount_total ?? 0),
          currency: String(o.currency ?? CURRENCY),
          paymentIntent: str(o.payment_intent),
          region: (o.customer_details as { address?: { country?: unknown } } | null | undefined)?.address?.country as string | undefined,
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
        } else if (req.method === 'POST' && !path.startsWith('/api/auth/') && !fromGame(req)) {
          // Our own POSTs (shop, stats) only from the game's own pages, as JSON: a page on
          // another site, even one on a sibling subdomain, can't spend a player's coins.
          // (Better Auth checks its own /api/auth/* requests the same way.)
          json(res, 403, { error: 'Please use the game at tardigeddon.com.' });
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
            wallet: user ? await walletOf(db, user.id) : { coins: 0, slime: 0 },
            stats: user ? await playerStats(db, user.id) : { ...NO_STATS },
            // Whether coins can be bought (Slime unlocks work without Stripe).
            shop: stripe !== null,
            // The "Purchases & receipts" page (not with Managed Payments: Stripe emails receipts).
            receipts: stripe !== null && !managed,
            providers: Object.keys(socialProviders),
            // Whether password reset and email confirmation work (an email service is set up).
            mail: mailer !== null,
          };
          if (user) me.controls = await controlsOf(db, user.id);
          // Coin packs can be bought in the Android app (Google Play Billing).
          if (play) me.playBilling = true;
          if (isAdmin(user)) me.admin = true;
          json(res, 200, me);
        } else if (path === '/api/gift/buy' && req.method === 'POST') {
          await giftBuy(req, res);
        } else if (path === '/api/gift/redeem' && req.method === 'POST') {
          await giftRedeem(req, res);
        } else if (path === '/api/gift/cancel' && req.method === 'POST') {
          await giftCancel(req, res);
        } else if (path === '/api/gift/sent' && req.method === 'GET') {
          const user = await userFrom(req.headers);
          if (!user) json(res, 401, { error: 'Please sign in first.' });
          else json(res, 200, { gifts: await giftsSent(db, user.id) });
        } else if (path === '/api/admin/sales' && req.method === 'GET') {
          // Anyone else gets "not found", so the page isn't even known to exist.
          const days = Number(new URL(req.url ?? '', 'http://x').searchParams.get('days'));
          if (!isAdmin(await userFrom(req.headers))) json(res, 404, { error: 'Not found.' });
          else json(res, 200, await salesReport(db, [1, 7, 30, 365].includes(days) ? days : 0, jpyPerGbp));
        } else if (path === '/api/settings' && req.method === 'POST') {
          await saveSettings(req, res);
        } else if (path === '/api/stats/match' && req.method === 'POST') {
          await reportCpuMatch(req, res);
        } else if (path === '/api/shop/unlock' && req.method === 'POST') {
          await unlock(req, res);
        } else if (path === '/api/shop/portal' && req.method === 'POST') {
          await purchasesPortal(req, res);
        } else if (path === '/api/shop/google' && req.method === 'POST') {
          await googlePlayPurchase(req, res);
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
    /** Take back coins for Google Play refunds and chargebacks now (also runs hourly). */
    checkVoided,
    /** Email the owner if Japan's unspent coins reached a new alert level (also runs hourly). */
    checkJapan,
    /** Who these request headers (cookies) belong to, and what they own; nobody if signed out. */
    async playerFor(headers: IncomingHttpHeaders): Promise<{ userId?: string; owned: string[] }> {
      const user = await userFrom(headers);
      return user ? { userId: user.id, owned: await ownedItems(db, user.id) } : { owned: [] };
    },
    /** Add a finished online match to the players' stats. */
    async recordResults(results: MatchResult[]): Promise<void> {
      await recordResults(db, results);
      for (const r of results) await earnSlime(db, r);
    },
    /** Tests only: forget the per-player rate limits. */
    resetLimits(): void {
      lastReport.clear();
      redeemTries.clear();
    },
    async close(): Promise<void> {
      clearInterval(purge);
      clearInterval(voidedTimer);
      clearInterval(japanTimer);
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
