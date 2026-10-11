// The Account and Stats pages of the menu hub (ui/hub.ts). Account: sign in
// or create an account; once signed in, your details, sign out and delete.
// Stats: your lifetime stats and your collection.

import { mascotSvg } from './mascot';
import { loadProfiles } from './teams';
import { compact, statTile, totals } from './dashboard';
import { SHOP_ITEMS, formatNumber } from '../shop/catalog';
import { WEAPONS } from '../sim/weapons';
import { type MeResponse, type PlayerStats, wearHat, wearSkin, deleteAccount, managePurchases, refreshAccount, requestPasswordReset, resendConfirmation, resetPassword, signIn, signInWith, signOut, signUp } from '../account/session';
import type { HubContext } from './hub';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const PROVIDER_NAMES: Record<string, string> = { google: 'Google', apple: 'Apple' };
export const LEGAL = 'https://tardigeddon.com/legal/';

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
    card.append(el('h2', 'card-title', 'Choose a new password'), resetForm(ctx, form));
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
    for (const t of [
      '📊 Your stats: wins, streaks, pops and own goals',
      '🟢 Earn Slime by playing, and unlock season weapons',
      '🎩 Hats and skins that follow you to any device',
      '🆓 Free: everything in the game stays playable without one',
    ])
      list.append(el('li', '', t));
    pitch.append(art, el('h2', 'card-title', 'Why sign in?'), list);
    const formBox = el('div', 'account-form-box');
    if (form.mode === 'forgot') formBox.append(el('h2', 'card-title', 'Forgot your password?'), forgotForm(ctx, form));
    else formBox.append(el('h2', 'card-title', form.mode === 'signup' ? 'Create your account' : 'Welcome back'), signInForm(me, ctx, form));
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
    who.append(el('div', 'profile-since', `Playing since ${since.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`));
  }
  head.append(pic, who);
  const wallet = el('div', 'account-wallet');
  wallet.append(statTile(`🪙 ${formatNumber(me.wallet.coins)}`, 'Coins'), statTile(`🟢 ${formatNumber(me.wallet.slime)}`, 'Slime'));
  card.append(head, wallet, el('p', 'account-note', 'Change your team name, colours, hat and skin with ✎ in the lobby.'));
  if (me.mail && user.emailVerified === false) {
    const box = el('div', 'account-verify');
    box.append(el('p', '', `📧 Please confirm your email: we sent a link to ${user.email}. It's how you get back in if you ever forget your password.`));
    const again = el('button', 'hud-btn', 'Send the link again');
    again.disabled = ctx.busy;
    again.onclick = () =>
      ctx.run(async () => {
        await resendConfirmation(user.email);
        ctx.notify('Sent! It can take a minute; check your spam folder too.');
      });
    box.append(again);
    card.append(box);
  }

  const manage = el('section', 'card account-manage');
  manage.append(el('h2', 'card-title', 'Manage'));
  if (me.shop) {
    const receipts = el('button', 'hud-btn', '🧾 Purchases & receipts');
    receipts.disabled = ctx.busy;
    receipts.onclick = () => ctx.run(managePurchases);
    manage.append(receipts);
  }
  const out = el('button', 'hud-btn', 'Sign out');
  out.disabled = ctx.busy;
  out.onclick = () => ctx.run(signOut);
  const del = el('button', 'link-btn account-delete', 'Delete account');
  del.disabled = ctx.busy;
  del.onclick = () => {
    const pw = prompt('This permanently deletes your account, your stats and everything you own in the shop. Type your password to confirm (leave empty if you sign in with Google or Apple).');
    if (pw === null) return;
    ctx.run(async () => {
      await deleteAccount(pw);
      ctx.notify('Your account has been deleted.');
    });
  };
  const legal = el('p', 'account-note');
  legal.append(legalLink('terms-of-service', 'Terms'), ' · ', legalLink('privacy-policy', 'Privacy'), ' · ', legalLink('childrens-privacy', "Children's privacy"));
  manage.append(out, del, legal);
  page.append(card, manage);
  return page;
}

function signInForm(me: MeResponse, ctx: HubContext, state: SignInState): HTMLElement {
  const { providers } = me;
  const { draft } = state;
  const form = el('form', 'account-form');
  const tabs = el('div', 'seg');
  for (const [m, label] of [['signin', 'Sign in'], ['signup', 'Create account']] as const) {
    const b = el('button', 'seg-btn' + (state.mode === m ? ' on' : ''), label);
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
  const name = signup ? field('name', 'text', 'Player name', 'nickname') : null;
  if (name) name.maxLength = 30;
  const email = field('email', 'email', 'Email', 'email');
  const pw = field('password', 'password', signup ? 'Password (8+ characters)' : 'Password', signup ? 'new-password' : 'current-password');
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
    text.append("I'm 13 or older and agree to the ", legalLink('terms-of-service', 'Terms'), '. See how we use your data in the ', legalLink('privacy-policy', 'Privacy Policy'), '.');
    agree.append(box, text);
    form.append(agree);
  }
  const submit = el('button', 'big-btn', signup ? 'Create account' : 'Sign in');
  submit.type = 'submit';
  submit.disabled = ctx.busy;
  form.append(submit);
  if (!signup && me.mail) {
    const forgot = el('button', 'link-btn account-forgot', 'Forgot password?');
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
      ctx.notify("Please tick the box to confirm you're 13 or older and agree to the Terms.");
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
    const b = el('button', 'hud-btn account-provider', `Continue with ${PROVIDER_NAMES[p] ?? p}`);
    b.type = 'button';
    b.disabled = ctx.busy;
    b.onclick = () => ctx.run(() => signInWith(p));
    form.append(b);
  }
  if (providers.length) {
    const note = el('p', 'account-note');
    note.append("Continuing with Google or Apple means you're 13 or older and agree to the ", legalLink('terms-of-service', 'Terms'), '.');
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
  const b = el('button', 'link-btn', 'Back to sign in');
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
  form.append(el('p', 'account-note', "Type the email you signed up with and we'll send you a link to choose a new password."));
  const email = input('email', 'Email', 'email', state.draft.email);
  email.oninput = () => (state.draft.email = email.value);
  const submit = el('button', 'big-btn', 'Email me a link');
  submit.type = 'submit';
  submit.disabled = ctx.busy;
  form.append(email, submit, backToSignIn(ctx, state));
  form.onsubmit = (e) => {
    e.preventDefault();
    ctx.run(async () => {
      await requestPasswordReset(email.value.trim());
      state.mode = 'signin';
      // The same answer whether or not there's an account, so this can't be used to check emails.
      ctx.notify("If there's an account for that email, we've sent a link. It can take a minute; check your spam folder too.");
    });
  };
  return form;
}

/** From the emailed link: choose a new password. */
function resetForm(ctx: HubContext, state: SignInState): HTMLElement {
  const form = el('form', 'account-form');
  const pw = input('password', 'New password (8+ characters)', 'new-password');
  const again = input('password', 'Type it again', 'new-password');
  pw.minLength = 8;
  again.minLength = 8;
  const submit = el('button', 'big-btn', 'Save new password');
  submit.type = 'submit';
  submit.disabled = ctx.busy;
  const newLink = el('button', 'link-btn', 'Ask for a new link');
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
      ctx.notify("The two passwords don't match. Please type them again.");
      return;
    }
    ctx.run(async () => {
      await resetPassword(state.token ?? '', pw.value);
      state.mode = 'signin';
      state.token = undefined;
      state.draft.password = '';
      // Every device was signed out, this one included.
      await refreshAccount();
      ctx.notify('Password changed! Sign in with your new password.');
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
  const t = s ? totals(s) : null;

  const head = el('section', 'card stats-head');
  const pic = el('div', 'profile-pic');
  pic.innerHTML = myTardi();
  const who = el('div', 'profile-who');
  who.append(el('div', 'profile-name', me.user?.name ?? 'You'));
  if (s && s.streak > 1) who.append(el('div', 'dash-streak', `🔥 ${s.streak} wins in a row`));
  head.append(pic, who);
  const big = el('div', 'stats-big');
  big.append(
    statTile(t ? compact(t.won) : '–', 'Wins', 'gold'),
    statTile(t ? t.rate : '–', 'Win rate', 'gold'),
    statTile(t ? compact(t.played) : '–', 'Games'),
    statTile(v((s) => compact(s.bestStreak)), 'Best streak'),
  );
  head.append(big);

  const fight = el('section', 'card');
  fight.append(el('h2', 'card-title', 'Combat'));
  const g1 = el('div', 'stats-grid');
  g1.append(
    statTile(v((s) => compact(s.popped)), '💥 Tardis popped'),
    statTile(v((s) => compact(s.damage)), 'Damage dealt'),
    statTile(v((s) => compact(s.selfPopped)), '🤦 Own goals'),
    statTile(v((s) => compact(s.selfDamage)), 'Hurt yourself'),
  );
  fight.append(g1);

  const modes = el('section', 'card');
  modes.append(el('h2', 'card-title', 'Where you play'));
  const g2 = el('div', 'stats-grid');
  const rate = (w: number, p: number) => (p ? `${Math.round((w / p) * 100)}%` : '–');
  g2.append(
    statTile(v((s) => `${compact(s.onlineWon)}/${compact(s.onlinePlayed)}`), '🌍 Online won'),
    statTile(v((s) => rate(s.onlineWon, s.onlinePlayed)), 'Online win rate'),
    statTile(v((s) => `${compact(s.cpuWon)}/${compact(s.cpuPlayed)}`), '🤖 vs CPU won'),
    statTile(v((s) => rate(s.cpuWon, s.cpuPlayed)), 'CPU win rate'),
  );
  modes.append(g2);
  if (t && !t.played) modes.append(el('p', 'account-note', 'Stats count online games, and one-on-one games against the CPU, played while signed in.'));

  const coll = el('section', 'card stats-collection');
  const mine = SHOP_ITEMS.filter((i) => me.owned.includes(i.id));
  coll.append(el('h2', 'card-title', `Collection · ${me.user ? mine.length : 0}/${SHOP_ITEMS.length}`));
  const team = loadProfiles()[0];
  if (me.user && mine.length) {
    const grid = el('div', 'collection-grid');
    for (const item of mine) {
      const c = el('div', 'hat-btn');
      c.innerHTML =
        item.kind === 'hat'
          ? mascotSvg(team.color, item.ref, wearSkin(team.skin))
          : item.kind === 'skin'
            ? mascotSvg(team.color, wearHat(team.hat), item.ref)
            : `<span class="shop-weapon-icon">${WEAPONS[item.ref]?.icon ?? '💥'}</span>`;
      c.append(el('span', '', item.name));
      grid.append(c);
    }
    coll.append(grid, el('p', 'account-note', 'Wear hats and skins from the ✎ team editor in the lobby; unlocked weapons appear in the matches you start.'));
  } else {
    const p = el('p', 'account-note', me.user ? 'Nothing unlocked yet. ' : 'Hats, skins and weapons you unlock show up here. ');
    const go = el('button', 'link-btn', 'Have a look in the shop');
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
  const go = el('button', 'big-btn', 'Sign in');
  go.onclick = () => ctx.go('account');
  card.append(el('h2', 'card-title', 'Track your stats'), el('p', '', 'Sign in to count your wins, streaks, pops and own goals, online and against the CPU.'), go);
  wrap.append(page, card);
  return wrap;
}
