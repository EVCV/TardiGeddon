// The owner's Sales page: coin packs sold, money in, refunds, and what
// players spend coins and Slime on. Only shown to accounts listed in the
// server's ADMIN_EMAILS (docs/ACCOUNTS.md); totals only, never who bought what.

import { salesReport, type MeResponse, type SalesReport } from '../account/session';
import { bundle, coinPack, formatNumber, packTotal, shopItem } from '../shop/catalog';
import { statTile } from './dashboard';
import type { HubContext } from './hub';

export interface SalesState {
  days: number;
  report: SalesReport | null;
  /** The period `report` is for, or -1 while nothing has loaded. */
  loadedDays: number;
  error: string;
}

export function newSalesState(): SalesState {
  return { days: 30, report: null, loadedDays: -1, error: '' };
}

const PERIODS: [number, string][] = [
  [1, 'Today'],
  [7, '7 days'],
  [30, '30 days'],
  [365, 'Year'],
  [0, 'All time'],
];

/** Currencies Stripe counts in whole units rather than hundredths. */
const WHOLE = new Set(['jpy', 'krw', 'vnd', 'clp', 'isk', 'huf', 'twd', 'ugx']);

function money(minor: number, currency: string): string {
  const units = WHOLE.has(currency) ? minor : minor / 100;
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency.toUpperCase() }).format(units);
  } catch {
    return `${units.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

const KIND_ICON: Record<string, string> = { hat: '🎩', skin: '🎨', aim: '🎯', fx: '💥', arena: '🏞️', music: '🎵', sound: '🔊', weapon: '🔫' };

/** A shop id as a name people recognise. */
function itemName(id: string): string {
  const item = shopItem(id);
  if (item) return `${KIND_ICON[item.kind] ?? ''} ${item.name}`;
  const set = bundle(id);
  if (set) return `🎁 ${set.name} bundle`;
  const pack = coinPack(id);
  if (pack) return `🪙 ${formatNumber(packTotal(pack))} coins`;
  return id;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** A ranked list with one bar per row, longest first; the numbers are always written out. */
function barList(rows: { label: string; value: number; text: string }[], empty: string): HTMLElement {
  if (!rows.length) return el('p', 'account-note', empty);
  const max = Math.max(...rows.map((r) => r.value), 1);
  const list = el('ol', 'sales-bars');
  for (const r of rows) {
    const li = el('li', 'sales-row');
    li.title = `${r.label}: ${r.text}`;
    const bar = el('span', 'sales-bar');
    bar.style.width = `${Math.max(2, (r.value / max) * 100)}%`;
    const track = el('span', 'sales-track');
    track.append(bar);
    li.append(el('span', 'sales-label', r.label), track, el('span', 'sales-value', r.text));
    list.append(li);
  }
  return list;
}

function card(title: string, ...body: HTMLElement[]): HTMLElement {
  const c = el('section', 'card');
  c.append(el('h2', 'card-title', title), ...body);
  return c;
}

export function renderSalesPage(_me: MeResponse, ctx: HubContext, state: SalesState): HTMLElement {
  const page = el('div', 'page page-sales');

  const pills = el('div', 'seg shop-pills');
  for (const [days, label] of PERIODS) {
    const b = el('button', 'seg-btn' + (state.days === days ? ' on' : ''), label);
    b.onclick = () => {
      state.days = days;
      ctx.rerender();
    };
    pills.append(b);
  }
  const refresh = el('button', 'hud-btn', '↻ Refresh');
  refresh.onclick = () => {
    state.loadedDays = -1;
    ctx.rerender();
  };
  const head = el('div', 'sales-head');
  head.append(pills, refresh);
  page.append(head);

  if (state.loadedDays !== state.days) {
    const want = state.days;
    state.loadedDays = want;
    state.error = '';
    salesReport(want)
      .then((r) => {
        if (state.days === want) state.report = r;
      })
      .catch((e: unknown) => {
        state.error = e instanceof Error ? e.message : String(e);
      })
      .finally(() => ctx.rerender());
  }
  const r = state.report;
  if (state.error) page.append(el('p', 'account-note', state.error));
  if (!r || r.days !== state.days) {
    page.append(el('p', 'page-loading', 'Loading…'));
    return page;
  }

  // Money, per currency (Stripe may charge in the buyer's own currency).
  const byCurrency = new Map<string, { amount: number; refunded: number }>();
  for (const p of r.packs) {
    const m = byCurrency.get(p.currency) ?? { amount: 0, refunded: 0 };
    m.amount += p.amount;
    m.refunded += p.refundedAmount;
    byCurrency.set(p.currency, m);
  }
  const currencies = [...byCurrency].sort((a, b) => b[1].amount - a[1].amount);
  const takings = currencies.length ? currencies.map(([c, m]) => money(m.amount, c)).join(' + ') : money(0, 'gbp');
  const sold = r.packs.reduce((s, p) => s + p.sold, 0);
  const refunds = r.packs.reduce((s, p) => s + p.refunded, 0);
  const coins = r.spends.filter((s) => s.currency === 'coins');
  const slime = r.spends.filter((s) => s.currency === 'slime');
  const coinsSpent = coins.reduce((s, x) => s + x.amount, 0);

  const big = el('section', 'card');
  const tiles = el('div', 'stats-big sales-big');
  tiles.append(statTile(takings, 'Paid by players', 'gold'), statTile(formatNumber(sold), 'Coin packs sold', 'gold'), statTile(
      refunds && currencies.length === 1 ? `${refunds} · ${money(currencies[0][1].refunded, currencies[0][0])}` : formatNumber(refunds),
      'Refunds',
    ), statTile(`🪙 ${formatNumber(coinsSpent)}`, 'Coins spent'));
  const people = el('div', 'stats-grid sales-people');
  people.append(
    statTile(formatNumber(r.players.total), 'Players (all time)'),
    statTile(formatNumber(r.players.joined), r.days || r.resetAt ? 'New players' : 'Signed up'),
    statTile(formatNumber(r.players.buyers), 'Paying players'),
    statTile(
      r.players.buyers && currencies.length === 1 ? money(Math.round(currencies[0][1].amount / r.players.buyers), currencies[0][0]) : '–',
      'Average per paying player',
    ),
  );
  if (r.resetAt) {
    const when = new Date(r.resetAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    big.append(el('p', 'account-note', `Counting from ${when}, when the figures were last started from zero.`));
  }
  big.append(tiles, people, el('p', 'account-note', "Money is what players paid in this period, VAT included, before refunds. Refunds count on the day they happened. Stripe's dashboard shows what reaches your bank after VAT and fees."));
  page.append(big);

  page.append(
    card(
      'Coin packs',
      barList(
        r.packs
          .filter((p) => p.sold || p.refunded)
          .map((p) => ({
            label: `${itemName(p.item)}${byCurrency.size > 1 ? ` · ${p.currency.toUpperCase()}` : ''}`,
            value: p.amount,
            text: `${p.sold} sold · ${money(p.amount, p.currency)}${p.refunded ? ` · ${p.refunded} refunded` : ''}`,
          })),
        'No coin packs bought in this period.',
      ),
    ),
    card(
      'What coins buy',
      barList(
        coins.slice(0, 20).map((s) => ({ label: itemName(s.item), value: s.amount, text: `${s.buys} × · 🪙 ${formatNumber(s.amount)}` })),
        'Nothing bought with coins in this period.',
      ),
    ),
    card(
      'Weapons unlocked with Slime',
      barList(
        slime.slice(0, 20).map((s) => ({ label: itemName(s.item), value: s.buys, text: `${s.buys} × · 🟢 ${formatNumber(s.amount)}` })),
        'No Slime unlocks in this period.',
      ),
    ),
    card(
      'Most owned (all time)',
      barList(
        r.owners.slice(0, 20).map((o) => ({ label: itemName(o.item), value: o.owners, text: `${formatNumber(o.owners)} ${o.owners === 1 ? 'player' : 'players'}` })),
        'Nobody owns anything yet.',
      ),
    ),
  );
  return page;
}
