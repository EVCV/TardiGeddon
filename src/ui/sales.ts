// The owner's Sales page: coin packs sold, money in, refunds, and what
// players spend coins and Slime on. Only shown to accounts listed in the
// server's ADMIN_EMAILS (docs/ACCOUNTS.md); totals only, never who bought what.

import { creators, downloadNewsletter, givePrize, newsletterCounts, payCreator, recentPrizes, salesReport, saveCreator, type CreatorReport, type MeResponse, type PrizeRow, type SalesReport } from '../account/session';
import { PRIZE_MAX_ITEMS, PROMO_ITEMS, SHOP_ITEMS, bundle, coinPack, formatNumber, packTotal, promoItem, shopItem, type ItemKind, type ShopItem } from '../shop/catalog';
import { statTile } from './dashboard';
import { newUsageState, usageCards, type UsageState } from './usageReport';
import type { HubContext } from './hub';

export interface SalesState {
  days: number;
  report: SalesReport | null;
  /** The period `report` is for, or -1 while nothing has loaded. */
  loadedDays: number;
  error: string;
  /** Creator codes (server/creators.ts), once loaded. */
  creators: CreatorReport[] | null;
  /** Anonymous play statistics (ui/usageReport.ts). */
  usage: UsageState;
  /** Email news numbers (server/newsletter.ts), once loaded. */
  news?: { subscribed: number; pending: number; unsubscribed: number } | 'loading';
  /** The Give a prize form (server/prizes.ts): kept here so a redraw doesn't empty it. */
  prize: PrizeState;
}

interface PrizeState {
  email: string;
  note: string;
  search: string;
  picked: Set<string>;
  /** What the last attempt did (or why it failed). */
  message: string;
  busy: boolean;
  /** The last grants, once loaded (null: not asked yet). */
  recent: PrizeRow[] | 'loading' | null;
}

export function newSalesState(): SalesState {
  return { days: 30, report: null, loadedDays: -1, error: '', creators: null, usage: newUsageState(), prize: { email: '', note: '', search: '', picked: new Set(), message: '', busy: false, recent: null } };
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

const KIND_ICON: Record<string, string> = { hat: '🎩', skin: '🎨', aim: '🎯', fx: '💥', dance: '💃', grave: '🪦', arena: '🏞️', music: '🎵', sound: '🔊', weapon: '🔫' };

/** A shop id as a name people recognise. */
function itemName(id: string): string {
  const item = shopItem(id) ?? promoItem(id);
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

const countryNames = (() => {
  try {
    return new Intl.DisplayNames(['en-GB'], { type: 'region' });
  } catch {
    return null;
  }
})();
const countryName = (code: string | null): string => (code ? (countryNames?.of(code) ?? code) : 'Country not known');

/**
 * Coins players paid for and haven't spent (right now, whatever the period),
 * and how close Japan is to its Payment Services Act limit (src/shop/japan.ts).
 */
function unspentCard(r: SalesReport): HTMLElement {
  const j = r.japan;
  const share = j.limit ? j.yen / j.limit : 0;
  const meter = el('div', 'japan-meter' + (share >= 0.9 ? ' high' : share >= 0.5 ? ' mid' : ''));
  meter.setAttribute('role', 'meter');
  meter.setAttribute('aria-valuemin', '0');
  meter.setAttribute('aria-valuemax', String(j.limit));
  meter.setAttribute('aria-valuenow', String(j.yen));
  meter.setAttribute('aria-label', 'Japan: unspent paid coins against the ¥10 million limit');
  const fill = el('span', 'japan-fill');
  fill.style.width = `${Math.min(100, share * 100)}%`;
  meter.append(fill);
  const yen = (n: number) => `¥${formatNumber(Math.round(n))}`;
  return card(
    'Unspent coins',
    el('p', 'japan-figure', `🇯🇵 Japan: ${yen(j.yen)} of ${yen(j.limit)} (${(share * 100).toFixed(1)}%)`),
    meter,
    el(
      'p',
      'account-note',
      `What players in Japan paid for coins they haven't spent yet (bonus coins don't count). If it's over ¥10 million on 31 March or 30 September, EVCV must tell the Local Finance Bureau and lodge a deposit; you're emailed at 50%, 75% and 90%. Pounds count at ¥${formatNumber(j.jpyPerGbp)}, on the high side on purpose.`,
    ),
    barList(
      r.unspent.map((u) => ({
        label: `${countryName(u.region)}${u.currency && u.currency !== 'gbp' ? ` · ${u.currency.toUpperCase()}` : ''}`,
        value: u.value,
        text: `🪙 ${formatNumber(u.coins)} · ${money(u.value, u.currency ?? 'gbp')}`,
      })),
      'No unspent paid coins.',
    ),
  );
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
    state.creators = null;
    state.news = undefined;
    state.prize.recent = null;
    state.usage.loadedDays = -1;
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

  // Two squarer cards side by side: the money, and the players.
  const tiles = el('div', 'stats-grid sales-quad sales-big');
  tiles.append(statTile(takings, 'Paid by players', 'gold'), statTile(formatNumber(sold), 'Coin packs sold', 'gold'), statTile(
      refunds && currencies.length === 1 ? `${refunds} · ${money(currencies[0][1].refunded, currencies[0][0])}` : formatNumber(refunds),
      'Refunds',
    ), statTile(`🪙 ${formatNumber(coinsSpent)}`, 'Coins spent'));
  const people = el('div', 'stats-grid sales-quad sales-people');
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
    page.append(el('p', 'account-note sales-reset', `Counting from ${when}, when the figures were last started from zero.`));
  }
  page.append(
    card('💷 Money', tiles, el('p', 'account-note', "What players paid in this period, VAT included, before refunds. Refunds count on the day they happened. Stripe's dashboard shows what reaches your bank after VAT and fees.")),
    card('👥 Players', people),
  );

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
    unspentCard(r),
    card(
      'Most owned (all time)',
      barList(
        r.owners.slice(0, 20).map((o) => ({ label: itemName(o.item), value: o.owners, text: `${formatNumber(o.owners)} ${o.owners === 1 ? 'player' : 'players'}` })),
        'Nobody owns anything yet.',
      ),
    ),
    creatorsCard(ctx, state),
    prizeCard(ctx, state.prize),
    newsletterCard(ctx, state),
    ...usageCards(ctx, state.usage, state.days),
  );
  return page;
}

const KIND_LABEL: Record<string, string> = { hat: 'Hats', skin: 'Skins', aim: 'Aim styles', fx: 'Explosions', dance: 'Victory dances', grave: 'Gravestones', arena: 'Worlds', music: 'Music', sound: 'Sound packs' };

/** Every look that can be a prize: the never-sold ones first (promo, Founder, Early bird, Supporter, Superfan…), then the shop's, by kind. Never weapons. */
function prizeGroups(): { title: string; items: ShopItem[] }[] {
  const groups = [{ title: 'Prize-only looks (never sold)', items: PROMO_ITEMS }];
  for (const kind of Object.keys(KIND_LABEL) as ItemKind[]) groups.push({ title: `${KIND_LABEL[kind]} (shop)`, items: SHOP_ITEMS.filter((i) => i.kind === kind) });
  return groups.filter((g) => g.items.length);
}

/**
 * Give a prize (server/prizes.ts): contest prizes go straight onto one
 * player's account by email, looks only. They show on every platform, and the
 * winner is told once in the game. Nothing here can give coins, Slime or weapons.
 */
function prizeCard(ctx: HubContext, st: PrizeState): HTMLElement {
  const box = el('div', 'creators prize-box');
  if (st.recent === null) {
    st.recent = 'loading';
    recentPrizes()
      .then((r) => (st.recent = r))
      .catch((e: unknown) => {
        st.recent = [];
        st.message = e instanceof Error ? e.message : String(e);
      })
      .finally(() => ctx.rerender());
  }

  const email = el('input', 'code-input');
  email.type = 'email';
  email.placeholder = "Winner's game account email";
  email.autocomplete = 'off';
  email.setAttribute('aria-label', "Winner's game account email");
  email.value = st.email;
  email.oninput = () => (st.email = email.value);
  const note = el('input', 'code-input');
  note.placeholder = 'Note, e.g. which contest (optional)';
  note.maxLength = 200;
  note.setAttribute('aria-label', 'Note');
  note.value = st.note;
  note.oninput = () => (st.note = note.value);
  const who = el('div', 'creator-form');
  who.append(email, note);

  // The picker: a search box over every look; ticks are kept in st.picked (no redraw while ticking, so typing isn't interrupted).
  const search = el('input', 'code-input');
  search.type = 'search';
  search.placeholder = 'Search looks (name, kind)';
  search.setAttribute('aria-label', 'Search looks');
  search.value = st.search;
  const count = el('span', 'account-note');
  const showCount = () => (count.textContent = `${st.picked.size} of up to ${PRIZE_MAX_ITEMS} selected`);
  const clear = el('button', 'link-btn', 'Clear');
  const list = el('div', 'prize-picker');
  list.setAttribute('role', 'group');
  list.setAttribute('aria-label', 'Looks to give');
  const rows: { row: HTMLElement; tick: HTMLInputElement; text: string; head: HTMLElement }[] = [];
  for (const g of prizeGroups()) {
    const head = el('h3', 'usage-sub', g.title);
    list.append(head);
    for (const it of g.items) {
      const label = el('label', 'prize-pick');
      const tick = el('input');
      tick.type = 'checkbox';
      tick.checked = st.picked.has(it.id);
      tick.onchange = () => {
        if (tick.checked) st.picked.add(it.id);
        else st.picked.delete(it.id);
        showCount();
      };
      label.append(tick, el('span', '', `${KIND_ICON[it.kind] ?? ''} ${it.name}`), el('small', '', `${it.id} · ${it.rarity}`));
      list.append(label);
      rows.push({ row: label, tick, text: `${it.name} ${it.id} ${KIND_LABEL[it.kind] ?? ''} ${it.rarity}`.toLowerCase(), head });
    }
  }
  const filter = () => {
    st.search = search.value;
    const q = search.value.trim().toLowerCase();
    const shown = new Set<HTMLElement>();
    for (const r of rows) {
      const hit = !q || r.text.includes(q);
      r.row.hidden = !hit;
      if (hit) shown.add(r.head);
    }
    for (const r of rows) r.head.hidden = !shown.has(r.head);
  };
  search.oninput = filter;
  clear.onclick = () => {
    st.picked.clear();
    for (const r of rows) r.tick.checked = false;
    showCount();
  };
  showCount();
  filter();
  const bar = el('div', 'creator-form');
  bar.append(search, count, clear);

  const give = el('button', 'hud-btn', '🏆 Give prize');
  give.disabled = st.busy;
  const result = el('p', 'account-note prize-result', st.message);
  result.setAttribute('role', 'status');
  const say = (msg: string) => {
    st.message = msg;
    result.textContent = msg;
  };
  give.onclick = async () => {
    const to = st.email.trim();
    const items = [...st.picked];
    if (!to.includes('@')) return say("Type the winner's game account email first.");
    if (!items.length) return say('Tick at least one look.');
    if (!confirm(`Give ${items.length} ${items.length === 1 ? 'look' : 'looks'} to ${to}?\n\n${items.map(itemName).join('\n')}`)) return;
    st.busy = true;
    give.disabled = true;
    try {
      const r = await givePrize(to, items, st.note);
      const name = `${r.player.name} (${r.player.email})`;
      say(
        (r.granted.length ? `Gave ${r.granted.length} ${r.granted.length === 1 ? 'look' : 'looks'} to ${name}: ${r.granted.map(itemName).join(', ')}.` : `Nothing new: ${name} already has all of them.`) +
          (r.alreadyOwned.length && r.granted.length ? ` Already owned, skipped: ${r.alreadyOwned.map(itemName).join(', ')}.` : '') +
          (r.player.emailVerified ? '' : ' Careful: that account has not confirmed its email yet.'),
      );
      if (r.granted.length) {
        st.picked.clear();
        st.note = '';
      }
      st.recent = null;
    } catch (e) {
      say(e instanceof Error ? e.message : String(e));
    } finally {
      st.busy = false;
      ctx.rerender();
    }
  };
  const act = el('div', 'creator-form');
  act.append(give);

  box.append(
    el('p', 'account-note', 'Put contest prizes straight on a winner’s account, found by the email they signed up with. Looks only (never coins, Slime or weapons). They show on every device, and the winner gets a "You won a prize" pop-up the next time they open the game.'),
    who,
    bar,
    list,
    act,
    result,
    el('h3', 'usage-sub', 'Recent prizes'),
  );
  if (st.recent === 'loading' || st.recent === null) box.append(el('p', 'page-loading', 'Loading…'));
  else if (!st.recent.length) box.append(el('p', 'account-note', 'No prizes given yet.'));
  else {
    const ol = el('ol', 'prize-recent');
    for (const p of st.recent) {
      const li = el('li', 'creator-row');
      const when = new Date(p.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      li.append(el('b', '', `${p.name} · ${p.email}`), el('span', '', ` · ${when}`), el('p', 'account-note', p.items.map(itemName).join(', ') + (p.note ? ` — ${p.note}` : '')));
      ol.append(li);
    }
    box.append(ol);
  }
  const c = card('🏆 Give a prize', box);
  c.classList.add('prize-card');
  return c;
}

/**
 * Email news (server/newsletter.ts): how many have signed up, and the lists to
 * import into Utobo. docs/NEWSLETTER.md has the steps.
 */
function newsletterCard(ctx: HubContext, state: SalesState): HTMLElement {
  const box = el('div', 'creators');
  if (state.news === undefined) {
    state.news = 'loading';
    newsletterCounts()
      .then((n) => (state.news = n))
      .catch(() => (state.news = { subscribed: 0, pending: 0, unsubscribed: 0 }))
      .finally(() => ctx.rerender());
  }
  const n = state.news === 'loading' ? null : state.news;
  box.append(
    el('p', 'account-note', n ? `${formatNumber(n.subscribed)} subscribed · ${formatNumber(n.pending)} waiting to confirm · ${formatNumber(n.unsubscribed)} unsubscribed` : 'Loading…'),
    el('p', 'account-note', 'Before each send, import "Subscribed" into the Utobo list called Newsletter, then "Unsubscribed" (as unsubscribed), so nobody who left is emailed. docs/NEWSLETTER.md has the steps.'),
  );
  const row = el('div', 'creator-form');
  for (const [list, label] of [['subscribed', '⬇ Subscribed (CSV)'], ['unsubscribed', '⬇ Unsubscribed (CSV)']] as const) {
    const b = el('button', 'hud-btn', label);
    b.onclick = () => ctx.run(() => downloadNewsletter(list));
    row.append(b);
  }
  box.append(row);
  return card('📬 Email news', box);
}

/**
 * Creator codes (Terms 5.12): who has one, how many players joined with it,
 * what those players paid, the creator's share of our estimated net, and
 * what's been paid to them. You pay creators yourself (bank transfer,
 * PayPal), then record it here.
 */
function creatorsCard(ctx: HubContext, state: SalesState): HTMLElement {
  const box = el('div', 'creators');
  const note = el('p', 'account-note');
  const run = (job: Promise<CreatorReport[]>) =>
    job
      .then((list) => {
        state.creators = list;
        ctx.rerender();
      })
      .catch((e: unknown) => {
        note.textContent = e instanceof Error ? e.message : String(e);
      });
  if (!state.creators) {
    box.append(el('p', 'page-loading', 'Loading…'));
    void run(creators());
    return card('🎥 Creator codes', box);
  }
  if (!state.creators.length) box.append(el('p', 'account-note', 'No creators yet. Add one below: they share the code with their audience.'));
  for (const c of state.creators) {
    const row = el('div', 'creator-row');
    const owed = c.totals.filter((x) => x.owed > 0);
    row.append(
      el('b', '', `${c.code}${c.active ? '' : ' (off)'}`),
      el('span', '', ` ${c.name}${c.account ? ` · account: ${c.account}` : ''} · ${c.percent}% for ${c.months} months`),
      el('p', 'account-note', `${c.players} joined · ${c.payers} paid · ` + (c.totals.length ? c.totals.map((x) => `earned ${money(x.earned, x.currency)}, paid ${money(x.paid, x.currency)}, owed ${money(x.owed, x.currency)}`).join(' · ') : 'nothing earned yet')),
    );
    if (c.byMonth.length) {
      row.append(el('p', 'account-note', c.byMonth.slice(0, 6).map((m) => `${m.month}: players paid ${money(m.gross, m.currency)} → share ${money(m.earned, m.currency)}`).join(' · ')));
    }
    for (const o of owed) {
      const pay = el('button', 'hud-btn', `Mark ${money(o.owed, o.currency)} paid`);
      pay.onclick = () => {
        if (confirm(`Record that you've paid ${c.name} ${money(o.owed, o.currency)}?`)) void run(payCreator(c.code, o.owed, o.currency, ''));
      };
      row.append(pay);
    }
    const toggle = el('button', 'link-btn', c.active ? 'Switch code off' : 'Switch code on');
    toggle.onclick = () => void run(saveCreator({ code: c.code, name: c.name, percent: c.percent, months: c.months, active: !c.active }));
    row.append(toggle);
    box.append(row);
  }
  // Add one.
  const form = el('div', 'creator-form');
  const input = (placeholder: string, type = 'text') => {
    const i = el('input', 'code-input');
    i.placeholder = placeholder;
    i.type = type;
    return i;
  };
  const code = input('Code (e.g. NINJA)');
  const name = input('Name');
  const email = input('Their game account email (optional)', 'email');
  const add = el('button', 'hud-btn', 'Add creator');
  add.onclick = () => void run(saveCreator({ code: code.value, name: name.value, ...(email.value ? { email: email.value } : {}) }));
  form.append(code, name, email, add);
  box.append(
    form,
    note,
    el('p', 'account-note', 'Shares are 10% for 12 months by default, of an estimate of what reaches you: prices less VAT and the store’s or Stripe’s cut. Refunded payments stop counting. Players type the code where a friend’s code goes (or open …/play/?invite=CODE) and get the creator reward: 500 free coins and the Superfan pack (hat, aim, explosion) once they’ve confirmed their email and played 3 matches. Link the creator’s own account (their email) and they get the ⭐ badge and the creator medal emblem.'),
  );
  return card('🎥 Creator codes', box);
}
