// The owner's play statistics, on the Sales page: anonymous counts of what's
// used (docs/USAGE.md). Totals per day only; nothing here can tell players
// apart. English only, like the rest of the Sales page.

import { usageReport } from '../account/session';
import { USAGE_COIN_TAPS, USAGE_DEVICES, USAGE_LENGTHS, USAGE_LOADS, USAGE_PLACES, USAGE_TUTORIAL, USAGE_WAITS, type UsageReport } from '../usage/catalog';
import { COIN_PACKS, packTotal } from '../shop/catalog';
import { formatNumber } from '../shop/catalog';
import { CPU_SKILLS } from '../ai/skills';
import { statTile } from './dashboard';
import type { HubContext } from './hub';

export interface UsageState {
  report: UsageReport | null;
  /** The period `report` is for, or -1 while nothing has loaded. */
  loadedDays: number;
  error: string;
}

export function newUsageState(): UsageState {
  return { report: null, loadedDays: -1, error: '' };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function card(title: string, ...body: HTMLElement[]): HTMLElement {
  const c = el('section', 'card');
  c.append(el('h2', 'card-title', title), ...body);
  return c;
}

/** A list with one bar per row; `keepOrder` leaves rows as given, else longest first. */
function bars(rows: { label: string; value: number; text?: string }[], empty: string, keepOrder = false): HTMLElement {
  const shown = rows.filter((r) => r.value > 0);
  if (!shown.length) return el('p', 'account-note', empty);
  if (!keepOrder) shown.sort((a, b) => b.value - a.value);
  const max = Math.max(...shown.map((r) => r.value), 1);
  const list = el('ol', 'sales-bars');
  for (const r of shown) {
    const li = el('li', 'sales-row');
    const text = r.text ?? formatNumber(r.value);
    li.title = `${r.label}: ${text}`;
    const bar = el('span', 'sales-bar');
    bar.style.width = `${Math.max(2, (r.value / max) * 100)}%`;
    const track = el('span', 'sales-track');
    track.append(bar);
    li.append(el('span', 'sales-label', r.label), track, el('span', 'sales-value', text));
    list.append(li);
  }
  return list;
}

const hours = (secs: number) => (secs >= 36_000 ? formatNumber(Math.round(secs / 3600)) : (secs / 3600).toFixed(1)) + ' h';
const minsSecs = (secs: number) => (secs >= 60 ? `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s` : `${Math.round(secs)}s`);
const percent = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '–');

const MODE_NAMES: Record<string, string> = { cpu: 'vs CPU', hotseat: 'Same device', online: 'Online', tutorial: 'Tutorial', practice: 'Practice', targets: 'Daily targets', rope: 'Daily rope race', race: 'Rope Race' };
const PAGE_NAMES: Record<string, string> = { lobby: '🏠 Lobby', stats: '📊 Stats', shop: '🛍️ Shop', account: '👤 Account', settings: '⚙️ Settings', sales: '📈 Sales', guide: '📖 Guide', looks: '🏞️ World picker', team: '✎ Team editor', practice: '🎯 Practice chooser', online: '🌐 Online', news: '📰 News' };
const PLATFORM_NAMES: Record<string, string> = { web: 'Browser', android: 'Android app', ios: 'iOS app' };
const DEVICE_NAMES: Record<string, string> = { phone: 'Phone', tablet: 'Tablet', desktop: 'Computer' };
const LANG_NAMES: Record<string, string> = { en: 'English', es: 'Spanish', 'pt-BR': 'Portuguese (Brazil)', de: 'German', fr: 'French', ja: 'Japanese' };

const ERROR_NAMES: Record<string, string> = { error: 'Script error', promise: 'Unhandled promise', webgl: 'Graphics lost (WebGL)', audio: 'Sound failed', desync: 'Online out of step' };
const PLACE_NAMES: Record<string, string> = { menu: 'Menus', ...MODE_NAMES, replay: 'Watching a replay', watch: 'Watching online' };
const STEP_NAMES: Record<string, string> = { walk: '1 Walk', jump: '2 Jump', aim: '3 Aim', look: '4 Look around', weapons: '5 Open weapons', pick: '6 Pick the bazooka', fire: '7 Fire', hit: '8 Hit the dummy', strike: '9 Airstrike', wind: '10 Wind', done: '✓ Finished' };
const TAP_NAMES: Record<string, string> = { banner: 'Lobby banner', hero: 'Lobby picture chip', nav: 'Lobby menu tile', wallet: 'Wallet chip (top bar)', looks: 'World picker card', tab: 'Shop tab', item: 'Shop item (short of coins)', bundle: 'Shop bundle (short of coins)' };
const STORE_NAMES: Record<string, string> = { stripe: 'Stripe', play: 'Google Play', appstore: 'App Store' };
const END_NAMES: Record<string, string> = { matched: 'Matched', cpu: 'Chose the CPU', gaveup: 'Gave up', error: 'Error (server full)', disconnected: 'Disconnected' };

/** "mode=cpu&skill=normal" read back (values are plain: no escaping, and "60m+" keeps its plus). */
function readDetail(detail: string): Map<string, string> {
  return new Map(detail ? detail.split('&').map((p) => p.split('=') as [string, string]) : []);
}

/** Totals by event, each with its details read back. */
function totals(r: UsageReport) {
  const by = new Map<string, { d: Map<string, string>; n: number }[]>();
  for (const row of r.rows) {
    const list = by.get(row.event) ?? [];
    list.push({ d: readDetail(row.detail), n: row.count });
    by.set(row.event, list);
  }
  const of = (e: string) => by.get(e) ?? [];
  const sum = (e: string, keep: (d: Map<string, string>) => boolean = () => true) => of(e).reduce((s, x) => (keep(x.d) ? s + x.n : s), 0);
  /** Sums of an event by one of its details. */
  const split = (e: string, key: string, keep: (d: Map<string, string>) => boolean = () => true) => {
    const m = new Map<string, number>();
    for (const x of of(e)) if (keep(x.d)) m.set(x.d.get(key) ?? '', (m.get(x.d.get(key) ?? '') ?? 0) + x.n);
    return m;
  };
  return { sum, split };
}

/** The Play cards for the Sales page's period (`days`, 0 = all kept). */
export function usageCards(ctx: HubContext, state: UsageState, days: number): HTMLElement[] {
  if (state.loadedDays !== days) {
    state.loadedDays = days;
    state.error = '';
    state.report = null;
    usageReport(days)
      .then((r) => {
        if (state.loadedDays === days) state.report = r;
      })
      .catch((e: unknown) => {
        state.error = e instanceof Error ? e.message : String(e);
      })
      .finally(() => ctx.rerender());
  }
  const about = el('p', 'account-note', "Anonymous counts from the game, added up per day: never who, so there are no per-player numbers (returning players are in Play Console and App Store Connect). Players who turned off \"Share anonymous statistics\", or whose browser asks not to be tracked, aren't counted.");
  const r = state.report;
  if (!r) return [card('🎮 Play', state.error ? el('p', 'account-note', state.error) : el('p', 'page-loading', 'Loading…'), about)];

  const { sum, split } = totals(r);
  const opens = sum('app');
  const visits = sum('visit');
  const onScreen = sum('seconds');
  const started = sum('match');
  const played = sum('playtime');
  const finished = sum('result', (d) => d.get('outcome') !== 'left');

  const tiles = el('div', 'stats-grid sales-quad');
  tiles.append(
    statTile(formatNumber(opens), 'Times opened'),
    statTile(hours(onScreen), 'On screen'),
    statTile(visits ? minsSecs(onScreen / visits) : '–', 'Average visit'),
    statTile(formatNumber(started), 'Matches started'),
    statTile(hours(played), 'In matches'),
    statTile(started ? minsSecs(played / started) : '–', 'Average match'),
    statTile(percent(finished, started), 'Played to the end'),
  );

  const opened = (title: string, key: string, names: Record<string, string>) => [
    el('h3', 'usage-sub', title),
    bars([...split(key === 'platform' ? 'app' : key, key)].map(([k, n]) => ({ label: names[k] ?? k, value: n, text: `${formatNumber(n)} · ${percent(n, opens)}` })), 'None yet.'),
  ];

  const lengths = split('visit', 'length');
  const modes = split('match', 'mode');
  const modeTime = split('playtime', 'mode');
  const modeLeft = split('result', 'mode', (d) => d.get('outcome') === 'left');

  const cpu = CPU_SKILLS.map(({ id, name }) => {
    const out = split('result', 'outcome', (d) => d.get('mode') === 'cpu' && d.get('skill') === id);
    const won = out.get('won') ?? 0;
    const lost = out.get('lost') ?? 0;
    const left = out.get('left') ?? 0;
    const games = won + lost + (out.get('draw') ?? 0);
    return { label: name, value: games + left, text: `${formatNumber(games)} played · player won ${percent(won, won + lost)} · ${formatNumber(left)} left early` };
  });

  // Errors: by kind, and where they happened.
  const errorsBy = split('error', 'kind');
  const errorPlaces = split('error', 'where');
  const errorTotal = sum('error');

  // The tutorial: how many reach each step, as a share of those who start it.
  const steps = split('tutorial', 'step');
  const began = steps.get('walk') ?? 0;

  // Get coins, from the first tap to paying.
  const taps = sum('coinstap');
  const packs = sum('coinspack');
  const checkout = split('checkout', 'step');
  const paying = (step: string) => checkout.get(step) ?? 0;
  const funnel = [
    { label: 'Tapped Get coins', value: taps },
    { label: 'Chose a pack', value: packs },
    { label: 'Started paying', value: paying('start') },
    { label: 'Completed', value: paying('done') },
  ].map((x) => ({ ...x, text: `${formatNumber(x.value)} · ${percent(x.value, taps)}` }));
  const byStore = [...split('checkout', 'store', (d) => d.get('step') === 'start')].map(([store, n]) => {
    const step = split('checkout', 'step', (d) => d.get('store') === store);
    const of = (k: string) => step.get(k) ?? 0;
    const parts = [`${formatNumber(of('done'))} done`, ...(['cancel', 'fail', 'pending'] as const).filter((k) => of(k)).map((k) => `${formatNumber(of(k))} ${{ cancel: 'cancelled', fail: 'failed', pending: 'waiting' }[k]}`)];
    return { label: STORE_NAMES[store] ?? store, value: n, text: `${formatNumber(n)} → ${parts.join(' · ')}` };
  });
  const packNames = new Map(COIN_PACKS.map((p) => [p.id, `🪙 ${formatNumber(packTotal(p))}`]));

  // Loading time, by bucket, with the kinds of device in each.
  const loading = (what: string) => {
    const all = split('load', 'time', (d) => d.get('what') === what);
    const total = [...all.values()].reduce((a, b) => a + b, 0);
    return bars(
      USAGE_LOADS.map((b) => {
        const dev = split('load', 'device', (d) => d.get('what') === what && d.get('time') === b);
        const n = all.get(b) ?? 0;
        const by = USAGE_DEVICES.filter((k) => dev.get(k)).map((k) => `${DEVICE_NAMES[k]} ${formatNumber(dev.get(k) ?? 0)}`);
        return { label: b, value: n, text: [percent(n, total), ...by].join(' · ') };
      }),
      'Nothing timed yet.',
      true,
    );
  };

  // Online quick play (counted by the server).
  const waits = split('quick', 'wait');
  const ends = split('quick', 'end');
  const waitTotal = sum('quick');
  const rooms = (kind: string, action: string) => sum('room', (d) => d.get('kind') === kind && d.get('action') === action);
  const roomTiles = el('div', 'stats-grid sales-quad');
  roomTiles.append(
    statTile(formatNumber(rooms('private', 'created')), 'Private rooms made'),
    statTile(formatNumber(rooms('private', 'joined')), 'Joined by code'),
    statTile(formatNumber(rooms('private', 'started') + rooms('quick', 'started')), 'Online matches'),
    statTile(formatNumber(rooms('private', 'rematch') + rooms('quick', 'rematch')), 'Rematches'),
  );

  const daily = r.days.slice(-31).map((d) => ({ label: d.day, value: d.opens, text: `${formatNumber(d.opens)} opens · ${hours(d.minutes * 60)}` }));

  return [
    card('🎮 Play', tiles, about),
    card('Where it was opened', ...opened('App', 'platform', PLATFORM_NAMES), ...opened('Device', 'device', DEVICE_NAMES), ...opened('Language', 'lang', LANG_NAMES)),
    card('How long a visit lasts', bars(USAGE_LENGTHS.map((l) => ({ label: l, value: lengths.get(l) ?? 0, text: `${formatNumber(lengths.get(l) ?? 0)} · ${percent(lengths.get(l) ?? 0, visits)}` })), 'No visits yet.', true)),
    card('Menu pages opened', bars([...split('page', 'page')].map(([k, n]) => ({ label: PAGE_NAMES[k] ?? k, value: n })), 'None yet.')),
    card(
      'Ways to play',
      bars(
        [...modes].map(([k, n]) => ({
          label: MODE_NAMES[k] ?? k,
          value: n,
          text: `${formatNumber(n)} started · ${hours(modeTime.get(k) ?? 0)} · ${percent(modeLeft.get(k) ?? 0, n)} left early`,
        })),
        'No matches yet.',
      ),
    ),
    card('Against the CPU, by level', bars(cpu, 'No matches against the CPU yet.', true), el('p', 'account-note', 'Aim for Normal near 50%: the CPU sharpens up after a player\'s winning run and eases off after a losing one (src/ai/form.ts).')),
    card('Weapons fired by players', bars([...split('weapon', 'weapon')].map(([k, n]) => ({ label: k, value: n })).slice(0, 40), 'No shots yet.')),
    card(
      'Learn to play: how far players get',
      bars(USAGE_TUTORIAL.map((k) => ({ label: STEP_NAMES[k] ?? k, value: steps.get(k) ?? 0, text: `${formatNumber(steps.get(k) ?? 0)} · ${percent(steps.get(k) ?? 0, began)}` })), 'Nobody has started the tutorial yet.', true),
      el('p', 'account-note', 'Each step as a share of players who began. A big drop between two steps is where new players give up.'),
    ),
    card(
      '🪙 Get coins: from tap to paid',
      bars(funnel, 'Nobody has tapped Get coins yet.', true),
      el('h3', 'usage-sub', 'By store: started → how it ended'),
      bars(byStore, 'No checkouts yet.'),
      el('h3', 'usage-sub', 'Where Get coins was tapped'),
      bars(USAGE_COIN_TAPS.map((k) => ({ label: TAP_NAMES[k] ?? k, value: sum('coinstap', (d) => d.get('from') === k) })), 'No taps yet.'),
      el('h3', 'usage-sub', 'Packs chosen'),
      bars([...split('coinspack', 'pack')].map(([k, n]) => ({ label: packNames.get(k) ?? k, value: n, text: `${formatNumber(n)} · ${percent(n, packs)}` })), 'No packs chosen yet.'),
      el('p', 'account-note', "Browser payments count as done when Stripe sends the player back; the money itself is in the sales above. \"Waiting\" is a store payment that hadn't gone through yet."),
    ),
    card(
      'Loading time',
      el('h3', 'usage-sub', 'Opening the game to the menu'),
      loading('menu'),
      el('h3', 'usage-sub', 'Play to the match running'),
      loading('match'),
      el('p', 'account-note', 'The first match of a visit includes downloading the game itself; later ones are quicker.'),
    ),
    card(
      '🌐 Online quick play',
      roomTiles,
      el('h3', 'usage-sub', 'How the wait ended'),
      bars([...ends].map(([k, n]) => ({ label: END_NAMES[k] ?? k, value: n, text: `${formatNumber(n)} · ${percent(n, waitTotal)}` })), 'Nobody has used quick play yet.'),
      el('h3', 'usage-sub', 'How long players waited'),
      bars(USAGE_WAITS.map((w) => ({ label: w, value: waits.get(w) ?? 0, text: `${formatNumber(waits.get(w) ?? 0)} · ${percent(waits.get(w) ?? 0, waitTotal)}` })), 'No waits yet.', true),
    ),
    card(
      '⚠️ Errors',
      bars([...errorsBy].map(([k, n]) => ({ label: ERROR_NAMES[k] ?? k, value: n, text: `${formatNumber(n)} · ${percent(n, errorTotal)}` })), 'No errors counted. 🎉'),
      el('h3', 'usage-sub', 'Where'),
      bars(USAGE_PLACES.map((k) => ({ label: PLACE_NAMES[k] ?? k, value: errorPlaces.get(k) ?? 0 })), 'Nowhere yet.'),
      el('p', 'account-note', `Kinds and places only, never the message (it could hold a player's name). At most a few per visit, so one broken device can't fill this. ${opens ? `About ${(errorTotal / opens).toFixed(2)} per time opened.` : ''}`),
    ),
    card('By day', bars(daily, 'No days yet.', true)),
  ];
}
