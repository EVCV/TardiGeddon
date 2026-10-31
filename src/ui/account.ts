// The Account and Stats pages of the menu hub (ui/hub.ts). Account: sign in
// or create an account; once signed in, your details, sign out and delete.
// Stats: your lifetime stats and your collection.

import { tierFor } from '../stats/rank';
import { NAME_PROBLEM_TEXT, nameProblem } from '../names';
import { mascotSvg } from './mascot';
import { loadProfiles } from './teams';
import { compact, statTile, totals } from './dashboard';
import { SHOP_ITEMS, formatNumber } from '../shop/catalog';
import { type MeResponse, type PlayerStats, wearHat, wearSkin, deleteAccount, enterInvite, managePurchases, refreshAccount, requestPasswordReset, resendConfirmation, resetPassword, signIn, signInWith, signOut, signUp } from '../account/session';
import { INVITE_COINS, INVITE_DAYS, INVITE_MATCHES, INVITE_MAX } from '../shop/rewards';
import { webGameUrl } from '../native';
import type { HubContext } from './hub';
import { itemArt } from './shop';
import { lang, t } from '../i18n/i18n';
import { tk } from '../i18n/tk';

/** Apple's logo, for the Sign in with Apple button. */
const APPLE_LOGO =
  '<svg class="apple-logo" viewBox="0 0 814 1000" aria-hidden="true"><path fill="currentColor" d="M788 341c-6 4-108 62-108 190 0 149 131 202 135 203-1 3-21 72-69 142-43 62-88 124-156 124s-86-40-164-40c-77 0-104 41-167 41s-106-57-156-127C45 792 0 668 0 551 0 362 123 262 244 262c64 0 118 42 158 42 38 0 98-45 171-45 28 0 128 3 194 82zM553 165c30-36 52-86 52-136 0-7-1-14-2-19-49 2-108 33-143 74-28 32-54 82-54 133 0 8 1 15 2 18 3 1 9 1 14 1 45 0 101-30 131-71z"/></svg>';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const PROVIDER_NAMES: Record<string, string> = { google: 'Google', apple: 'Apple' };
export const LEGAL = 'https://tardigeddon.com/legal/';

/** A translated sentence with {placeholders} filled by nodes (e.g. links) or text. */
export function withNodes(text: string, parts: Record<string, Node | string>): (Node | string)[] {
  return text.split(/(\{\w+\})/).filter((s) => s).map((s) => {
    const m = /^\{(\w+)\}$/.exec(s);
    return m && m[1] in parts ? parts[m[1]] : s;
  });
}

/** A link to one of the legal pages, opening in a new tab. */
export function legalLink(slug: string, text: string): HTMLAnchorElement {
  const a = el('a', '', text);
  a.href = LEGAL + slug;
  a.target = '_blank';
  a.rel = 'noopener';
  return a;
}

/** Your team's tardi, wearing what you've picked (and own). */
function myTardi(): string {
  const team = loadProfiles()[0];
  return mascotSvg(team.color, wearHat(team.hat), wearSkin(team.skin));
}

/** Sign-in state that survives re-renders (e.g. after a failed sign-in). */
export interface SignInState {
  /** forgot: ask for a reset link; reset: choose a new password (from the emailed link). */
  mode: 'signin' | 'signup' | 'forgot' | 'reset';
  draft: Record<string, string>;
  /** The token from a password reset link. */
  token?: string;
}

export const newSignInState = (): SignInState => ({ mode: 'signin', draft: { name: '', email: '', password: '' } });

/** The Account page. */
export function renderAccountPage(me: MeResponse, ctx: HubContext, form: SignInState): HTMLElement {
  const page = el('div', 'page page-account');
  // A reset link works whoever is signed in on this device.
  if (form.mode === 'reset' && form.token) {
    const card = el('section', 'card account-reset');
    card.append(el('h2', 'card-title', t('Choose a new password')), resetForm(ctx, form));
    page.append(card);
    return page;
  }
  if (!me.user) {
    // One wide card: your tardi and why to sign in, beside the form.
    const card = el('section', 'card account-split');
    const pitch = el('div', 'account-pitch');
    const art = el('div', 'account-art');
    art.innerHTML = myTardi();
    const list = el('ul', 'dash-perks');
    for (const perk of [
      t('📊 Your stats: wins, streaks, pops and own goals'),
      t('🟢 Earn Slime by playing, and unlock season weapons'),
      t('🎩 Hats, skins, aim styles and effects on every device'),
      t('🆓 Free: everything in the game stays playable without one'),
    ])
      list.append(el('li', '', perk));
    pitch.append(art, el('h2', 'card-title', t('Why sign in?')), list);
    const formBox = el('div', 'account-form-box');
    if (form.mode === 'forgot') formBox.append(el('h2', 'card-title', t('Forgot your password?')), forgotForm(ctx, form));
    else formBox.append(el('h2', 'card-title', form.mode === 'signup' ? t('Create your account') : t('Welcome back')), signInForm(me, ctx, form));
    card.append(pitch, formBox);
    page.append(card);
    return page;
  }

  const user = me.user;
  const card = el('section', 'card account-card');
  const head = el('div', 'profile-card');
  const pic = el('div', 'profile-pic');
  pic.innerHTML = myTardi();
  const who = el('div', 'profile-who');
  who.append(el('div', 'profile-name', user.name), el('div', 'profile-email', user.email));
  const since = new Date(user.createdAt);
  if (!Number.isNaN(since.getTime())) {
    who.append(el('div', 'profile-since', t('Playing since {date}', { date: since.toLocaleDateString(lang() === 'en' ? undefined : lang(), { month: 'long', year: 'numeric' }) })));
  }
  head.append(pic, who);
  const wallet = el('div', 'account-wallet');
  wallet.append(statTile(`🪙 ${formatNumber(me.wallet.coins)}`, t('Coins')), statTile(`🟢 ${formatNumber(me.wallet.slime)}`, t('Slime')));
  card.append(head, wallet, el('p', 'account-note', t('Change your team name, colours, hat and skin with ✎ in the lobby.')));
  if (me.mail && user.emailVerified === false) {
    const box = el('div', 'account-verify');
    box.append(el('p', '', t("📧 Please confirm your email: we sent a link to {email}. It's how you get back in if you ever forget your password.", { email: user.email })));
    const again = el('button', 'hud-btn', t('Send the link again'));
    again.disabled = ctx.busy;
    again.onclick = () =>
      ctx.run(async () => {
        await resendConfirmation(user.email);
        ctx.notify(t('Sent! It can take a minute; check your spam folder too.'));
      });
    box.append(again);
    card.append(box);
  }

  if (me.earlyBird) {
    const f = el('p', 'account-founder', me.founder ? t('🌱 Founder: you were here from the start. Thank you!') : t('🐣 Early bird: you joined in the first months. Thank you!'));
    card.append(f);
  }

  const manage = el('section', 'card account-manage');
  manage.append(el('h2', 'card-title', t('Manage')));
  if (me.shop && me.receipts !== false) {
    const receipts = el('button', 'hud-btn', t('🧾 Purchases & receipts'));
    receipts.disabled = ctx.busy;
    receipts.onclick = () => ctx.run(managePurchases);
    manage.append(receipts);
  }
  const out = el('button', 'hud-btn', t('Sign out'));
  out.disabled = ctx.busy;
  out.onclick = () => ctx.run(signOut);
  const del = el('button', 'link-btn account-delete', t('Delete account'));
  del.disabled = ctx.busy;
  del.onclick = () => {
    const pw = prompt(t('This permanently deletes your account, your stats and everything you own in the shop. Type your password to confirm (leave empty if you sign in with Google or Apple).'));
    if (pw === null) return;
    ctx.run(async () => {
      await deleteAccount(pw);
      ctx.notify(t('Your account has been deleted.'));
    });
  };
  const legal = el('p', 'account-note');
  legal.append(legalLink('terms-of-service', t('Terms')), ' · ', legalLink('privacy-policy', t('Privacy')), ' · ', legalLink('childrens-privacy', t("Children's privacy")));
  manage.append(out, del, legal);
  page.append(card);
  if (me.invite) page.append(inviteCard(me, me.invite, ctx));
  page.append(manage);
  return page;
}

/** Invite friends: your code to share, a friend's code to type in (new players), and how it's going. */
function inviteCard(me: MeResponse, inv: NonNullable<MeResponse['invite']>, ctx: HubContext): HTMLElement {
  const card = el('section', 'card account-invite');
  card.append(el('h2', 'card-title', t('🎁 Invite friends')));
  card.append(
    el('p', '', t('Give a friend your code. When they’ve made an account with it, confirmed their email and played {matches} matches, you both get {coins} free coins (for up to {max} friends a month).', { matches: INVITE_MATCHES, coins: INVITE_COINS, max: INVITE_MAX })),
  );
  const note = el('p', 'account-note');
  note.setAttribute('role', 'status');
  const row = el('div', 'invite-row');
  const link = `${webGameUrl()}?invite=${inv.code}`;
  const share = el('button', 'hud-btn invite-share', t('Your code: {code} 📋', { code: inv.code }));
  share.onclick = async () => {
    const text = t('Play TardiGeddon with me! Use my code {code} when you make your account: {link}', { code: inv.code, link });
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        note.textContent = t('Copied: send it to a friend.');
      }
    } catch {
      note.textContent = t('Your code is {code}.', { code: inv.code });
    }
  };
  row.append(share);
  card.append(row);
  if (inv.rewardedEver || inv.waiting) {
    card.append(el('p', 'account-note', t('Friends rewarded this month: {n} of {max} ({all} in all) · waiting for {w} to confirm their email and play', { n: inv.rewarded, max: INVITE_MAX, all: inv.rewardedEver, w: inv.waiting })));
  }
  if (inv.invited === 'waiting') {
    card.append(el('p', 'account-note', me.user?.emailVerified === false ? t('Your friend’s code is in: confirm your email and play {matches} matches for your {coins} coins.', { matches: INVITE_MATCHES, coins: INVITE_COINS }) : t('Your friend’s code is in: play {matches} matches for your {coins} coins.', { matches: INVITE_MATCHES, coins: INVITE_COINS })));
  } else if (inv.invited === 'rewarded') {
    card.append(el('p', 'account-note', t('You joined with a friend’s code, and you both got your coins.')));
  } else if (inv.canEnter) {
    const add = el('div', 'join-row');
    const input = el('input', 'code-input');
    input.placeholder = t('Friend’s or creator’s code');
    input.maxLength = 20;
    input.autocapitalize = 'characters';
    input.setAttribute('aria-label', t('Friend’s or creator’s code'));
    const go = el('button', 'hud-btn', t('Add'));
    go.disabled = ctx.busy;
    go.onclick = () =>
      ctx.run(async () => {
        const r = await enterInvite(input.value);
        await refreshAccount();
        const said: Record<typeof r, string> = {
          ok: t('Thanks! Your friend’s code is in.'),
          unknown: t('No one has that code. Check it and try again.'),
          self: t('That’s your own code: you need a friend’s.'),
          already: t('You’ve already added a friend’s code.'),
          late: t('Friend’s codes can only be added in your first {days} days.', { days: INVITE_DAYS }),
          newer: t('That code belongs to a newer account than yours: only codes from players who were here first work.'),
        };
        ctx.notify(said[r]);
      });
    add.append(input, go);
    card.append(el('p', 'account-note', t('Did a friend or a creator invite you? Add their code in your first {days} days:', { days: INVITE_DAYS })), add);
  }
  card.append(note);
  if (me.creator) card.append(creatorBox(me.creator));
  return card;
}

/** A creator's own numbers: their code, players who joined with it, and their share (totals only). */
function creatorBox(c: NonNullable<MeResponse['creator']>): HTMLElement {
  const box = el('div', 'account-verify');
  box.append(el('p', '', t('🎥 Your creator code: {code}. Players who join with it get free coins, and you get {percent}% of what they spend for {months} months.', { code: c.code, percent: c.percent, months: c.months })));
  box.append(el('p', 'account-note', t('{n} players joined with your code, and {p} have bought coins.', { n: c.players, p: c.payers })));
  for (const x of c.totals) {
    const money = (minor: number) => new Intl.NumberFormat(lang(), { style: 'currency', currency: x.currency.toUpperCase() }).format(minor / 100);
    box.append(el('p', 'account-note', t('Earned {earned} · paid to you {paid} · still to come {owed}', { earned: money(x.earned), paid: money(x.paid), owed: money(x.owed) })));
  }
  return box;
}

function signInForm(me: MeResponse, ctx: HubContext, state: SignInState): HTMLElement {
  const { providers } = me;
  const { draft } = state;
  const form = el('form', 'account-form');
  const tabs = el('div', 'seg');
  for (const [m, label] of [['signin', tk('Sign in')], ['signup', tk('Create account')]] as const) {
    const b = el('button', 'seg-btn' + (state.mode === m ? ' on' : ''), t(label));
    b.type = 'button';
    b.onclick = () => {
      state.mode = m;
      ctx.notify('');
    };
    tabs.append(b);
  }
  form.append(tabs);
  const field = (name: string, type: string, label: string, auto: string) => {
    const inp = el('input', 'field');
    inp.name = name;
    inp.type = type;
    inp.placeholder = label;
    inp.required = true;
    inp.autocomplete = auto as AutoFill;
    inp.setAttribute('aria-label', label);
    inp.value = draft[name] ?? '';
    inp.oninput = () => (draft[name] = inp.value);
    form.append(inp);
    return inp;
  };
  const signup = state.mode === 'signup';
  const name = signup ? field('name', 'text', t('Player name'), 'nickname') : null;
  if (name) {
    name.maxLength = 30;
    name.title = t('Letters and spaces. No real full name, contact details or social media.');
  }
  const email = field('email', 'email', t('Email'), 'email');
  const pw = field('password', 'password', signup ? t('Password (8+ characters)') : t('Password'), signup ? 'new-password' : 'current-password');
  if (signup) {
    pw.minLength = 8;
    // Age self-declaration (Children's Privacy Policy §1.1) and acceptance of the Terms.
    const agree = el('label', 'account-check');
    const box = el('input');
    box.type = 'checkbox';
    // Checked in onsubmit with a clear message: the browser's own bubble is easy to miss.
    box.name = 'agree';
    box.checked = draft.agree === '1';
    box.onchange = () => (draft.agree = box.checked ? '1' : '');
    const text = el('span');
    text.append(
      ...withNodes(t("I'm 13 or older and agree to the {terms}. See how we use your data in the {privacy}."), {
        terms: legalLink('terms-of-service', t('Terms')),
        privacy: legalLink('privacy-policy', t('Privacy Policy')),
      }),
    );
    agree.append(box, text);
    form.append(agree);
  }
  const submit = el('button', 'big-btn', signup ? t('Create account') : t('Sign in'));
  submit.type = 'submit';
  submit.disabled = ctx.busy;
  form.append(submit);
  if (!signup && me.mail) {
    const forgot = el('button', 'link-btn account-forgot', t('Forgot password?'));
    forgot.type = 'button';
    forgot.onclick = () => {
      state.mode = 'forgot';
      ctx.notify('');
    };
    form.append(forgot);
  }
  form.onsubmit = (e) => {
    e.preventDefault();
    if (signup && draft.agree !== '1') {
      ctx.notify(t("Please tick the box to confirm you're 13 or older and agree to the Terms."));
      return;
    }
    // Other players may see the player name: the same rules as the server, told straight away.
    const problem = signup ? nameProblem(name!.value) : null;
    if (problem) {
      ctx.notify(t('Player name: {problem}', { problem: t(NAME_PROBLEM_TEXT[problem]) }));
      return;
    }
    ctx.run(async () => {
      await (signup ? signUp(name!.value.trim(), email.value.trim(), pw.value) : signIn(email.value.trim(), pw.value));
      // Signing out later shows "Sign in", not "Create account".
      state.mode = 'signin';
      draft.password = '';
    });
  };
  for (const p of providers) {
    const b = el('button', `hud-btn account-provider account-provider-${p}`, t('Continue with {provider}', { provider: PROVIDER_NAMES[p] ?? p }));
    // Apple's button: black, with its logo (Apple's design guidelines for Sign in with Apple).
    if (p === 'apple') b.insertAdjacentHTML('afterbegin', APPLE_LOGO);
    b.type = 'button';
    b.disabled = ctx.busy;
    b.onclick = () => ctx.run(() => signInWith(p));
    form.append(b);
  }
  if (providers.length) {
    const note = el('p', 'account-note');
    note.append(
      ...withNodes(t("Continuing with Google or Apple means you're 13 or older and agree to the {terms}."), {
        terms: legalLink('terms-of-service', t('Terms')),
      }),
    );
    form.append(note);
  }
  return form;
}

/** An email or password box for the small forms below. */
function input(type: string, label: string, auto: string, value = ''): HTMLInputElement {
  const inp = el('input', 'field');
  inp.type = type;
  inp.placeholder = label;
  inp.required = true;
  inp.autocomplete = auto as AutoFill;
  inp.setAttribute('aria-label', label);
  inp.value = value;
  return inp;
}

function backToSignIn(ctx: HubContext, state: SignInState): HTMLButtonElement {
  const b = el('button', 'link-btn', t('Back to sign in'));
  b.type = 'button';
  b.onclick = () => {
    state.mode = 'signin';
    state.token = undefined;
    ctx.notify('');
  };
  return b;
}

/** Forgot password: ask for a reset link by email. */
function forgotForm(ctx: HubContext, state: SignInState): HTMLElement {
  const form = el('form', 'account-form');
  form.append(el('p', 'account-note', t("Type the email you signed up with and we'll send you a link to choose a new password.")));
  const email = input('email', t('Email'), 'email', state.draft.email);
  email.oninput = () => (state.draft.email = email.value);
  const submit = el('button', 'big-btn', t('Email me a link'));
  submit.type = 'submit';
  submit.disabled = ctx.busy;
  form.append(email, submit, backToSignIn(ctx, state));
  form.onsubmit = (e) => {
    e.preventDefault();
    ctx.run(async () => {
      await requestPasswordReset(email.value.trim());
      state.mode = 'signin';
      // The same answer whether or not there's an account, so this can't be used to check emails.
      ctx.notify(t("If there's an account for that email, we've sent a link. It can take a minute; check your spam folder too."));
    });
  };
  return form;
}

/** From the emailed link: choose a new password. */
function resetForm(ctx: HubContext, state: SignInState): HTMLElement {
  const form = el('form', 'account-form');
  const pw = input('password', t('New password (8+ characters)'), 'new-password');
  const again = input('password', t('Type it again'), 'new-password');
  pw.minLength = 8;
  again.minLength = 8;
  const submit = el('button', 'big-btn', t('Save new password'));
  submit.type = 'submit';
  submit.disabled = ctx.busy;
  const newLink = el('button', 'link-btn', t('Ask for a new link'));
  newLink.type = 'button';
  newLink.onclick = () => {
    state.mode = 'forgot';
    state.token = undefined;
    ctx.notify('');
  };
  form.append(pw, again, submit, newLink);
  form.onsubmit = (e) => {
    e.preventDefault();
    if (pw.value !== again.value) {
      ctx.notify(t("The two passwords don't match. Please type them again."));
      return;
    }
    ctx.run(async () => {
      await resetPassword(state.token ?? '', pw.value);
      state.mode = 'signin';
      state.token = undefined;
      state.draft.password = '';
      // Every device was signed out, this one included.
      await refreshAccount();
      ctx.notify(t('Password changed! Sign in with your new password.'));
    });
  };
  return form;
}

/** The Stats page: lifetime stats, the online/CPU split and your collection.
 *  Signed out, the same layout shows empty, behind a sign-in card. */
export function renderStatsPage(me: MeResponse, ctx: HubContext): HTMLElement {
  const page = el('div', 'page page-stats');
  const s = me.user ? me.stats : null;
  /** A number, or a dash while signed out. */
  const v = (f: (s: PlayerStats) => string) => (s ? f(s) : '–');
  const tot = s ? totals(s) : null;

  const head = el('section', 'card stats-head');
  const pic = el('div', 'profile-pic');
  pic.innerHTML = myTardi();
  const who = el('div', 'profile-who');
  who.append(el('div', 'profile-name', me.user?.name ?? t('You')));
  if (s && s.streak > 1) who.append(el('div', 'dash-streak', t('🔥 {n} wins in a row', { n: s.streak })));
  if (s) {
    // Quick-play rank: settles after a few rated matches.
    const tier = tierFor(s.rating);
    const rank = el('div', 'rank-badge', s.ratedGames > 0 ? `${tier.emoji} ${t(tier.name)} · ${s.rating}` : `${tier.emoji} ${t('Unranked: play quick play to get a rank')}`);
    rank.title = t('Your quick-play rank. Winning quick-play matches against signed-in players moves it up; quick play finds you players of a similar rank.');
    who.append(rank);
  }
  head.append(pic, who);
  const big = el('div', 'stats-big');
  big.append(
    statTile(tot ? compact(tot.won) : '–', t('Wins'), 'gold'),
    statTile(tot ? tot.rate : '–', t('Win rate'), 'gold'),
    statTile(tot ? compact(tot.played) : '–', t('Games')),
    statTile(v((s) => compact(s.bestStreak)), t('Best streak')),
  );
  head.append(big);

  const fight = el('section', 'card');
  fight.append(el('h2', 'card-title', t('Combat')));
  const g1 = el('div', 'stats-grid');
  g1.append(
    statTile(v((s) => compact(s.popped)), t('💥 Tardigrades popped')),
    statTile(v((s) => compact(s.damage)), t('Damage dealt')),
    statTile(v((s) => compact(s.selfPopped)), t('🤦 Own goals')),
    statTile(v((s) => compact(s.selfDamage)), t('Hurt yourself')),
  );
  fight.append(g1);

  const modes = el('section', 'card');
  modes.append(el('h2', 'card-title', t('Where you play')));
  const g2 = el('div', 'stats-grid');
  const rate = (w: number, p: number) => (p ? `${Math.round((w / p) * 100)}%` : '–');
  g2.append(
    statTile(v((s) => `${compact(s.onlineWon)}/${compact(s.onlinePlayed)}`), t('🌍 Online won')),
    statTile(v((s) => rate(s.onlineWon, s.onlinePlayed)), t('Online win rate')),
    statTile(v((s) => `${compact(s.cpuWon)}/${compact(s.cpuPlayed)}`), t('🤖 vs CPU won')),
    statTile(v((s) => rate(s.cpuWon, s.cpuPlayed)), t('CPU win rate')),
  );
  modes.append(g2);
  if (tot && !tot.played) modes.append(el('p', 'account-note', t('Stats count online games, and one-on-one games against the CPU, played while signed in.')));

  const coll = el('section', 'card stats-collection');
  const mine = SHOP_ITEMS.filter((i) => me.owned.includes(i.id));
  coll.append(el('h2', 'card-title', t('Collection · {n}/{total}', { n: me.user ? mine.length : 0, total: SHOP_ITEMS.length })));
  if (me.user && mine.length) {
    const grid = el('div', 'collection-grid');
    for (const item of mine) {
      const c = el('div', 'hat-btn');
      c.innerHTML = itemArt(item);
      c.append(el('span', '', t(item.name)));
      grid.append(c);
    }
    coll.append(grid, el('p', 'account-note', t('Pick hats, skins, aim styles and effects in the ✎ team editor in the lobby; unlocked weapons appear in the matches you start.')));
  } else {
    const p = el('p', 'account-note', me.user ? t('Nothing unlocked yet.') + ' ' : t('Hats, skins, aim styles, effects and weapons you unlock show up here.') + ' ');
    const go = el('button', 'link-btn', t('Have a look in the shop'));
    go.onclick = () => ctx.go('shop');
    p.append(go);
    coll.append(p);
  }
  page.append(head, fight, modes, coll);
  if (me.user) return page;

  // Signed out: the empty layout, faded, with a sign-in card on top.
  page.classList.add('locked');
  page.setAttribute('aria-hidden', 'true');
  page.inert = true;
  const wrap = el('div', 'page stats-locked');
  const card = el('section', 'card stats-teaser');
  const go = el('button', 'big-btn', t('Sign in'));
  go.onclick = () => ctx.go('account');
  card.append(el('h2', 'card-title', t('Track your stats')), el('p', '', t('Sign in to count your wins, streaks, pops and own goals, online and against the CPU.')), go);
  wrap.append(page, card);
  return wrap;
}
