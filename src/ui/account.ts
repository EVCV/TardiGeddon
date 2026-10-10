// Account panel: sign in / create an account; then a Profile tab (who you
// are, your stats, the hats you own) and a Shop tab (cosmetic items only).

import { mascotSvg } from './mascot';
import { loadProfiles } from './teams';
import { compact, totals } from './dashboard';
import { SHOP_ITEMS, formatNumber } from '../shop/catalog';
import { WEAPONS } from '../sim/weapons';
import { newShopState, renderShop } from './shop';
import {
  type MeResponse,
  account,
  wearHat,
  wearSkin,
  deleteAccount,
  onAccountChange,
  refreshAccount,
  signIn,
  signInWith,
  signOut,
  signUp,
} from '../account/session';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const PROVIDER_NAMES: Record<string, string> = { google: 'Google', apple: 'Apple' };
const LEGAL = 'https://tardigeddon.com/legal/';

/** A link to one of the legal pages, opening in a new tab. */
function legalLink(slug: string, text: string): HTMLAnchorElement {
  const a = el('a', '', text);
  a.href = LEGAL + slug;
  a.target = '_blank';
  a.rel = 'noopener';
  return a;
}

/** Open the Account panel. `notice` is shown at the top (e.g. after paying). */
export function openAccount(host: HTMLElement, notice = '', startTab: 'profile' | 'shop' = 'profile'): void {
  const overlay = el('div', 'editor-overlay');
  const box = el('div', 'editor account');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Account');
  overlay.append(box);
  host.append(overlay);

  let mode: 'signin' | 'signup' = 'signin';
  let tab = startTab;
  // Typed values survive re-renders (e.g. after a failed sign-in).
  const draft: Record<string, string> = { name: '', email: '', password: '' };
  let busy = false;
  let status = notice;
  const close = () => {
    off();
    overlay.remove();
  };
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };

  /** Run an action, showing its error (if any) and disabling buttons meanwhile. */
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    busy = true;
    status = '';
    render();
    try {
      await fn();
    } catch (e) {
      status = e instanceof Error ? e.message : String(e);
    }
    busy = false;
    render();
  };

  const render = () => {
    const { me, loaded } = account();
    box.innerHTML = '';
    box.append(el('h2', 'editor-title', me?.user ? 'Your account' : 'Account'));
    const msg = el('p', 'account-status', status);
    box.append(msg);

    if (!loaded) {
      box.append(el('p', '', 'Loading…'));
    } else if (!me) {
      box.append(el('p', '', "Accounts aren't available right now. You can still play everything without one."));
    } else if (!me.user) {
      box.append(signInForm(me.providers));
    } else {
      const tabs = el('div', 'account-tabs');
      tabs.setAttribute('role', 'tablist');
      for (const [t, label] of [['profile', '👤 Profile'], ['shop', '🛍️ Shop']] as const) {
        const b = el('button', 'hud-btn' + (tab === t ? ' on' : ''), label);
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(tab === t));
        b.onclick = () => {
          tab = t;
          status = '';
          render();
        };
        tabs.append(b);
      }
      box.classList.toggle('wide', tab === 'shop');
      box.append(
        tabs,
        tab === 'profile'
          ? profile(me)
          : renderShop(me, { state: shopState, busy, run: (fn) => void run(fn), rerender: render, legalLink }),
      );
    }

    const actions = el('div', 'editor-actions');
    const done = el('button', 'big-btn', 'Done');
    done.onclick = close;
    actions.append(done);
    box.append(actions);
  };

  const signInForm = (providers: string[]): HTMLElement => {
    const form = el('form', 'account-form');
    const tabs = el('div', 'account-tabs');
    for (const [m, label] of [['signin', 'Sign in'], ['signup', 'Create account']] as const) {
      const b = el('button', 'hud-btn' + (mode === m ? ' on' : ''), label);
      b.type = 'button';
      b.onclick = () => {
        mode = m;
        status = '';
        render();
      };
      tabs.append(b);
    }
    form.append(tabs);
    const field = (name: string, type: string, label: string, auto: string) => {
      const inp = el('input');
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
    const name = mode === 'signup' ? field('name', 'text', 'Player name', 'nickname') : null;
    if (name) name.maxLength = 30;
    const email = field('email', 'email', 'Email', 'email');
    const pw = field('password', 'password', mode === 'signup' ? 'Password (8+ characters)' : 'Password', mode === 'signup' ? 'new-password' : 'current-password');
    if (mode === 'signup') {
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
    const submit = el('button', 'big-btn', mode === 'signup' ? 'Create account' : 'Sign in');
    submit.type = 'submit';
    submit.disabled = busy;
    form.append(submit);
    form.onsubmit = (e) => {
      e.preventDefault();
      const agreed = form.querySelector<HTMLInputElement>('input[name=agree]');
      if (mode === 'signup' && agreed && !agreed.checked) {
        status = "Please tick the box to confirm you're 13 or older and agree to the Terms.";
        render();
        return;
      }
      void run(() => (mode === 'signup' ? signUp(name!.value.trim(), email.value.trim(), pw.value) : signIn(email.value.trim(), pw.value)));
    };
    for (const p of providers) {
      const b = el('button', 'hud-btn account-provider', `Continue with ${PROVIDER_NAMES[p] ?? p}`);
      b.type = 'button';
      b.disabled = busy;
      b.onclick = () => void run(() => signInWith(p));
      form.append(b);
    }
    if (providers.length) {
      const note = el('p', 'account-note');
      note.append("Continuing with Google or Apple means you're 13 or older and agree to the ", legalLink('terms-of-service', 'Terms'), '.');
      form.append(note);
    }
    form.append(el('p', 'account-note', 'An account keeps your shop items on every device. Everything in the game is free to play without one.'));
    return form;
  };

  const profile = (me: MeResponse): HTMLElement => {
    const user = me.user!;
    const wrap = el('div', 'account-profile');
    const team = loadProfiles()[0];
    const card = el('div', 'profile-card');
    const pic = el('div', 'profile-pic');
    pic.innerHTML = mascotSvg(team.color, wearHat(team.hat), wearSkin(team.skin));
    const who = el('div', 'profile-who');
    who.append(el('div', 'profile-name', user.name), el('div', 'profile-email', user.email));
    const since = new Date(user.createdAt);
    if (!Number.isNaN(since.getTime())) {
      who.append(el('div', 'profile-since', `Playing since ${since.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`));
    }
    who.append(el('div', 'profile-wallet', `🪙 ${formatNumber(me.wallet.coins)} coins · 🟢 ${formatNumber(me.wallet.slime)} Slime`));
    card.append(pic, who);

    const t = totals(me.stats);
    const mine = SHOP_ITEMS.filter((i) => me.owned.includes(i.id));
    const stats = el('div', 'profile-stats');
    const tile = (value: string, label: string) => {
      const t = el('div', 'stat-tile');
      t.append(el('div', 'stat-value', value), el('div', 'stat-label', label));
      stats.append(t);
    };
    tile(compact(t.played), 'Games');
    tile(compact(t.won), 'Wins');
    tile(t.rate, 'Win rate');
    tile(compact(me.stats.bestStreak), 'Best streak');
    tile(compact(me.stats.popped), '💥 Popped');
    tile(compact(me.stats.damage), 'Damage dealt');
    tile(compact(me.stats.selfPopped), '🤦 Own goals');
    tile(compact(me.stats.selfDamage), 'Hurt yourself');

    const owned = el('div', 'profile-hats');
    owned.append(el('h3', '', 'Your collection'));
    if (mine.length) {
      const grid = el('div', 'editor-hats');
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
      owned.append(grid, el('p', 'account-note', 'Wear hats and skins from the ✎ team editor; unlocked weapons appear in the matches you start.'));
    } else {
      const p = el('p', 'account-note', 'Nothing unlocked yet. ');
      const go = el('button', 'link-btn', 'Have a look in the shop');
      go.onclick = () => {
        tab = 'shop';
        render();
      };
      p.append(go);
      owned.append(p);
    }
    if (!t.played) owned.append(el('p', 'account-note', 'Stats count online games, and one-on-one games against the CPU, played while signed in.'));

    const manage = el('div', 'profile-manage');
    const out = el('button', 'hud-btn', 'Sign out');
    out.disabled = busy;
    out.onclick = () => void run(signOut);
    const del = el('button', 'link-btn account-delete', 'Delete account');
    del.disabled = busy;
    del.onclick = () => {
      const pw = prompt('This permanently deletes your account, your stats and everything you own in the shop. Type your password to confirm (leave empty if you sign in with Google or Apple).');
      if (pw === null) return;
      void run(async () => {
        await deleteAccount(pw);
        status = 'Your account has been deleted.';
      });
    };
    manage.append(out, del);
    wrap.append(card, stats, owned, manage);
    return wrap;
  };

  const shopState = newShopState();

  const off = onAccountChange(render);
  render();
  // Fresh stats and items every time it opens (a match or a purchase may have just finished).
  void refreshAccount();
}
