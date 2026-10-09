// Account & Shop: sign in / create an account, see what you own, buy shop
// items (cosmetic only), sign out, delete the account.

import { mascotSvg } from './mascot';
import { loadProfiles } from './teams';
import { SHOP_ITEMS, formatPrice, type ShopItem } from '../shop/catalog';
import {
  account,
  buy,
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

/** Open the Account & Shop panel. `notice` is shown at the top (e.g. after paying). */
export function openAccount(host: HTMLElement, notice = ''): void {
  const overlay = el('div', 'editor-overlay');
  const box = el('div', 'editor account');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Account and shop');
  overlay.append(box);
  host.append(overlay);

  let mode: 'signin' | 'signup' = 'signin';
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
    box.append(el('h2', 'editor-title', me?.user ? 'Account & Shop' : 'Account'));
    const msg = el('p', 'account-status', status);
    box.append(msg);

    if (!loaded) {
      box.append(el('p', '', 'Loading…'));
    } else if (!me) {
      box.append(el('p', '', "Accounts aren't available right now. You can still play everything without one."));
    } else if (!me.user) {
      box.append(signInForm(me.providers));
    } else {
      const who = el('p', 'account-who');
      who.append('Signed in as ', el('b', '', me.user.name), ` (${me.user.email})`);
      box.append(who, shop(me.owned, me.shop));
    }

    const actions = el('div', 'editor-actions');
    if (me?.user) {
      const del = el('button', 'hud-btn account-delete', 'Delete account');
      del.disabled = busy;
      del.onclick = () => {
        const pw = prompt('This permanently deletes your account and everything you own in the shop. Type your password to confirm (leave empty if you sign in with Google or Apple).');
        if (pw === null) return;
        void run(async () => {
          await deleteAccount(pw);
          status = 'Your account has been deleted.';
        });
      };
      const out = el('button', 'hud-btn', 'Sign out');
      out.disabled = busy;
      out.onclick = () => void run(signOut);
      actions.append(del, out);
    }
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

  /** The item the player tapped Buy on, waiting for them to confirm. */
  let pending: ShopItem | null = null;

  const confirmBuy = (item: ShopItem): HTMLElement => {
    const box = el('div', 'shop-confirm');
    box.append(el('p', '', `Buy the ${item.name} for ${formatPrice(item.price)} (including VAT)? You'll pay on Stripe's secure page and get it straight away.`));
    const consent = el('label', 'account-check');
    const tick = el('input');
    tick.type = 'checkbox';
    const text = el('span');
    text.append(
      "I want it straight away, and I understand that once it's delivered I lose my 14-day right to cancel. My other rights, such as if it doesn't work, aren't affected (",
      legalLink('terms-of-service', 'Terms'),
      ' §5).',
    );
    consent.append(tick, text);
    const row = el('div', 'editor-actions');
    const back = el('button', 'hud-btn', 'Cancel');
    back.onclick = () => {
      pending = null;
      render();
    };
    const pay = el('button', 'big-btn', 'Pay');
    pay.disabled = true;
    tick.onchange = () => (pay.disabled = !tick.checked || busy);
    pay.onclick = () => void run(() => buy(item.id, tick.checked));
    row.append(back, pay);
    box.append(consent, row);
    return box;
  };

  const shop = (owned: string[], open: boolean): HTMLElement => {
    const wrap = el('div', 'account-shop');
    wrap.append(el('h3', '', 'Shop'));
    if (pending && open && !owned.includes(pending.id)) {
      wrap.append(confirmBuy(pending));
      return wrap;
    }
    pending = null;
    wrap.append(el('p', 'account-note', 'Just for looks: nothing in the shop changes how your team plays.'));
    const grid = el('div', 'editor-hats');
    const color = loadProfiles()[0].color;
    for (const item of SHOP_ITEMS) {
      const has = owned.includes(item.id);
      const card = el('div', 'hat-btn shop-item' + (has ? ' on' : ''));
      card.innerHTML = mascotSvg(color, item.ref);
      card.append(el('span', '', item.name));
      if (has) card.append(el('span', 'shop-owned', 'Owned ✓'));
      else {
        const b = el('button', 'hud-btn', open ? formatPrice(item.price) : 'Soon');
        b.disabled = busy || !open;
        b.onclick = () => {
          pending = item;
          status = '';
          render();
        };
        card.append(b);
      }
      grid.append(card);
    }
    wrap.append(grid);
    if (!open) wrap.append(el('p', 'account-note', 'The shop opens soon.'));
    else {
      wrap.append(el('p', 'account-note', 'Prices include VAT. Under 18? Please ask a parent or carer before you buy.'));
      wrap.append(el('p', 'account-note', 'Wear your hats from the ✎ team editor.'));
    }
    return wrap;
  };

  const off = onAccountChange(render);
  render();
  if (!account().loaded) void refreshAccount();
}
