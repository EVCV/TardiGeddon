// Gifts in the shop: give a look or bundle to a friend with a one-use code,
// claim one you were given, and see (or take back) the gifts you've sent.
// Codes are passed on by the players themselves: there's no searching for
// other players, and only preset messages go with a gift.

import { buyGift, cancelGift, redeemGift, sentGifts, type GiftSent, type MeResponse } from '../account/session';
import { GIFTS_PER_DAY, GIFT_MESSAGES, formatNumber, giftable } from '../shop/catalog';
import type { HubContext } from './hub';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export interface GiftsState {
  /** Whose gifts these are: everything is cleared when someone else signs in. */
  user: string | null;
  code: string;
  /** What the last claim gave (shown until the next one). */
  claimed: { name: string; from: string | null; message: string } | null;
  sent: GiftSent[] | null;
  loading: boolean;
}

export const newGiftsState = (): GiftsState => ({ user: null, code: '', claimed: null, sent: null, loading: false });

/** Why this player can't send gifts yet, or '' if they can. */
export function giftBlocker(me: MeResponse): string {
  if (!me.user) return 'Sign in to send gifts.';
  if (!me.user.emailVerified) return 'Confirm your email (on the Account page) to send gifts.';
  if (Date.now() - Date.parse(me.user.createdAt) < 24 * 3600_000) return 'New accounts can send gifts after their first day.';
  return '';
}

/** The Gifts tab: claim a code, and the gifts you've sent. */
export function giftsTab(me: MeResponse, ctx: HubContext, state: GiftsState, nameOf: (id: string) => string): HTMLElement {
  const uid = me.user?.id ?? null;
  // A shared device: never show one player's codes or gifts to the next.
  if (state.user !== uid) Object.assign(state, newGiftsState(), { user: uid });
  const box = el('div', 'gifts');

  const claim = el('section', 'gift-claim');
  claim.append(el('h3', 'shop-section', '🎀 Got a gift code?'));
  const form = el('form', 'gift-form');
  const input = el('input', 'gift-input');
  input.placeholder = 'XXXX-XXXX-XXXX';
  input.value = state.code;
  input.maxLength = 20;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('aria-label', 'Gift code');
  input.oninput = () => (state.code = input.value);
  const go = el('button', 'big-btn', 'Claim gift');
  go.type = 'submit';
  go.disabled = ctx.busy || !me.user;
  form.onsubmit = (e) => {
    e.preventDefault();
    ctx.run(async () => {
      const r = await redeemGift(state.code);
      if (state.user !== uid) return;
      state.code = '';
      state.claimed = { name: nameOf(r.item), from: r.from, message: r.message };
    });
  };
  form.append(input, go);
  claim.append(form);
  if (!me.user) claim.append(el('p', 'account-note', 'Sign in to claim a gift: it goes into your collection on every device.'));
  if (state.claimed) {
    const done = el('div', 'gift-claimed');
    done.append(el('b', '', `🎉 You got ${state.claimed.name}!`));
    if (state.claimed.from) done.append(el('span', '', `From ${state.claimed.from}${state.claimed.message ? `: “${state.claimed.message}”` : ''}`));
    done.append(el('span', '', 'Pick it in the ✎ team editor in the lobby (arenas: use it here in the Shop).'));
    claim.append(done);
  }
  box.append(claim);

  const how = el('section', 'gift-how');
  how.append(
    el('h3', 'shop-section', '🎁 Give a gift'),
    el('p', '', `Pick any look or bundle in the shop and press “Give as a gift”. You pay with your coins and get a one-use code to give your friend however you like. Up to ${GIFTS_PER_DAY} gifts a day. Until your friend claims it, you can take a gift back and get your coins back.`),
    el('p', 'account-note', 'Anyone with the code can claim the gift, so only share it with the person it’s for. Weapons and coins can’t be given.'),
  );
  box.append(how);

  if (me.user) {
    const sent = el('section', 'gift-sent');
    sent.append(el('h3', 'shop-section', 'Gifts you’ve sent'));
    if (state.sent === null) {
      sent.append(el('p', 'account-note', 'Loading…'));
      if (!state.loading) {
        state.loading = true;
        sentGifts()
          .then((g) => {
            // Ignore an answer for someone who has since signed out.
            if (state.user === uid) state.sent = g;
          })
          .catch(() => {
            if (state.user === uid) state.sent = [];
          })
          .finally(() => {
            if (state.user === uid) state.loading = false;
            ctx.rerender();
          });
      }
    } else if (!state.sent.length) {
      sent.append(el('p', 'account-note', 'None yet.'));
    } else {
      const list = el('ul', 'gift-list');
      for (const g of state.sent) {
        const li = el('li', `gift-row ${g.status}`);
        const when = new Date(g.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        li.append(el('span', 'gift-name', nameOf(g.item)), el('span', 'gift-meta', `…${g.hint} · ${when}`));
        const status = { waiting: 'Not claimed yet', claimed: 'Claimed ✓', cancelled: 'Taken back' }[g.status];
        li.append(el('span', 'gift-status', status));
        if (g.status === 'waiting') {
          const back = el('button', 'hud-btn', 'Take back');
          back.disabled = ctx.busy;
          back.onclick = () => {
            if (!confirm(`Take back this gift and get your coins back? The code (…${g.hint}) will stop working.`)) return;
            ctx.run(async () => {
              await cancelGift(g.id);
              state.sent = null;
            });
          };
          li.append(back);
        }
        list.append(li);
      }
      sent.append(list);
    }
    box.append(sent);
  }
  return box;
}

/** The "give as a gift" dialog: pick a message, pay with coins, get the code. */
export function openGiftDialog(me: MeResponse, itemId: string, art: string, from: HTMLElement, onDone: () => void): void {
  const g = giftable(itemId);
  if (!g) return;
  const host = document.getElementById('ui') ?? document.body;
  const overlay = el('div', 'editor-overlay checkout-overlay');
  const box = el('div', 'coin-dialog gift-dialog');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'gift-dialog-title');
  const behind = document.querySelector<HTMLElement>('.hub');
  if (behind) behind.inert = true;
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (behind) behind.inert = false;
    from.focus();
    onDone();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };
  const x = el('button', 'coin-dialog-x', '×');
  x.setAttribute('aria-label', 'Close');
  x.onclick = close;

  const head = el('div', 'coin-dialog-head');
  const pic = el('div', 'coin-dialog-art gift-dialog-art');
  pic.innerHTML = art;
  const title = el('h2', 'coin-dialog-title', `🎀 Gift: ${g.name}`);
  title.id = 'gift-dialog-title';
  head.append(pic, title, el('div', 'coin-dialog-coins', `🪙 ${formatNumber(g.coins)}`));
  const body = el('div', 'coin-dialog-body');
  box.append(x, head, body);

  const blocker = giftBlocker(me);
  if (blocker) {
    body.append(el('p', 'account-note', blocker));
  } else {
    body.append(el('p', 'coin-dialog-small', 'Add a message (optional):'));
    const msgs = el('div', 'gift-msgs');
    let message = 'none';
    const keys = Object.keys(GIFT_MESSAGES);
    for (const k of keys) {
      const b = el('button', 'gift-msg' + (k === message ? ' on' : ''), k === 'none' ? 'No message' : GIFT_MESSAGES[k]);
      b.setAttribute('aria-pressed', String(k === message));
      b.onclick = () => {
        message = k;
        msgs.querySelectorAll('button').forEach((m, i) => {
          m.classList.toggle('on', keys[i] === k);
          m.setAttribute('aria-pressed', String(keys[i] === k));
        });
      };
      msgs.append(b);
    }
    body.append(msgs);
    const error = el('p', 'coin-dialog-error');
    error.setAttribute('role', 'alert');
    const short = me.wallet.coins < g.coins;
    const buy = el('button', 'big-btn coin-dialog-pay', short ? `You need ${formatNumber(g.coins - me.wallet.coins)} more coins` : `Buy gift for 🪙 ${formatNumber(g.coins)}`);
    buy.disabled = short;
    buy.onclick = async () => {
      buy.disabled = true;
      error.textContent = '';
      try {
        const code = await buyGift(itemId, message);
        showCode(code);
      } catch (e) {
        error.textContent = e instanceof Error ? e.message : String(e);
        buy.disabled = false;
      }
    };
    body.append(buy, error, el('p', 'coin-dialog-small', 'You’ll get a one-use code to give your friend. You can take the gift back until they claim it.'));
  }

  const showCode = (code: string) => {
    body.replaceChildren();
    const c = el('div', 'gift-code', code);
    c.setAttribute('aria-label', `Gift code ${code.split('').join(' ')}`);
    const copy = el('button', 'big-btn coin-dialog-pay', '📋 Copy code');
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(code);
        copy.textContent = 'Copied ✓';
      } catch {
        copy.textContent = 'Select the code and copy it';
      }
    };
    body.append(
      el('b', '', 'Here’s your gift code:'),
      c,
      copy,
      el('p', 'coin-dialog-small', 'Send it to your friend. They claim it in Shop → 🎀 Gifts. Keep it safe: it’s only shown once, and anyone with it can claim the gift.'),
    );
    copy.focus();
  };

  overlay.append(box);
  host.append(overlay);
  x.focus();
}
