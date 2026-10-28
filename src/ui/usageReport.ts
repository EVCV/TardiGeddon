// The owner's play statistics, on the Sales page: anonymous counts of what's
// used (docs/USAGE.md). Totals per day only; nothing here can tell players
// apart. English only, like the rest of the Sales page.

import { usageReport } from '../account/session';
import { USAGE_LENGTHS, type UsageReport } from '../usage/catalog';
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
const PAGE_NAMES: Record<string, string> = { lobby: '🏠 Lobby', stats: '📊 Stats', shop: '🛍️ Shop', account: '👤 Account', settings: '⚙️ Settings', sales: '📈 Sales', guide: '📖 Guide', looks: '🏞️ World picker', team: '✎ Team editor', practice: '🎯 Practice chooser', online: '🌐 Online' };
const PLATFORM_NAMES: Record<string, string> = { web: 'Browser', android: 'Android app', ios: 'iOS app' };
const DEVICE_NAMES: Record<string, string> = { phone: 'Phone', tablet: 'Tablet', desktop: 'Computer' };
const LANG_NAMES: Record<string, string> = { en: 'English', es: 'Spanish', 'pt-BR': 'Portuguese (Brazil)', de: 'German', fr: 'French', ja: 'Japanese' };

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
  const opens = sum('open');
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
    bars([...split('open', key)].map(([k, n]) => ({ label: names[k] ?? k, value: n, text: `${formatNumber(n)} · ${percent(n, opens)}` })), 'None yet.'),
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
    card('By day', bars(daily, 'No days yet.', true)),
  ];
}
