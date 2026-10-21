// The career panel beside the match setup in the lobby. Signed in: your
// tardigrade, wallet and lifetime stats. Signed out: a nudge to sign in.
// Hidden when the server has accounts turned off.

import { mascotSvg } from './mascot';
import { loadProfiles } from './teams';
import { SHOP_ITEMS, formatNumber } from '../shop/catalog';
import { WEAPONS } from '../sim/weapons';
import { account, wearHat, wearSkin, type PlayerStats } from '../account/session';
import type { HubTab } from './hub';
import { lang, t } from '../i18n/i18n';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** 1234 -> "1,234", 25300 -> "25.3k". */
export function compact(n: number): string {
  return n >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : n.toLocaleString(lang() === 'en' ? 'en-GB' : lang());
}

export function totals(s: PlayerStats): { played: number; won: number; rate: string } {
  const played = s.onlinePlayed + s.cpuPlayed;
  const won = s.onlineWon + s.cpuWon;
  return { played, won, rate: played ? `${Math.round((won / played) * 100)}%` : '–' };
}

/** A stat tile: big number over a small label (already in the player's language). */
export function statTile(value: string, label: string, cls = ''): HTMLElement {
  const d = el('div', 'stat-tile' + (cls ? ' ' + cls : ''));
  d.append(el('div', 'stat-value', value), el('div', 'stat-label', label));
  return d;
}

/** Fill `box` with the career panel for the current account state. */
export function renderDashboard(box: HTMLElement, go: (tab: HubTab) => void): void {
  const { me } = account();
  box.innerHTML = '';
  box.classList.toggle('hidden', !me);
  if (!me) return;

  box.append(el('h2', 'card-title', me.user ? t('Career') : t('Your career')));
  if (!me.user) {
    box.classList.add('dash-teaser');
    const list = el('ul', 'dash-perks');
    for (const perk of [
      `🏆 ${t('Wins and win streaks')}`,
      `💥 ${t('Tardigrades popped')}`,
      `🤦 ${t('Your funniest own goals')}`,
      `🟢 ${t('Earn Slime to unlock weapons')}`,
      `🎩 ${t('Your hats on every device')}`,
    ])
      list.append(el('li', '', perk));
    const signIn = el('button', 'big-btn dash-go', t('Sign in'));
    signIn.onclick = () => go('account');
    box.append(list, signIn, el('p', 'dash-note', t('Free, and everything in the game stays playable without one.')));
    return;
  }
  box.classList.remove('dash-teaser');

  const s = me.stats;
  const tot = totals(s);
  const team = loadProfiles()[0];
  const head = el('button', 'dash-head');
  head.setAttribute('aria-label', t('Open your account'));
  head.onclick = () => go('account');
  const pic = el('span', 'dash-pic');
  pic.innerHTML = mascotSvg(team.color, wearHat(team.hat), wearSkin(team.skin));
  const who = el('span', 'dash-who');
  who.append(el('span', 'dash-name', me.user.name));
  who.append(el('span', 'dash-streak', s.streak > 1 ? `🔥 ${t('{n} wins in a row', { n: s.streak })}` : tot.played === 1 ? t('1 game played') : t('{n} games played', { n: compact(tot.played) })));
  head.append(pic, who);

  const grid = el('div', 'dash-grid');
  grid.append(
    statTile(compact(tot.won), t('Wins'), 'gold'),
    statTile(tot.rate, t('Win rate'), 'gold'),
    statTile(compact(s.bestStreak), t('Best streak')),
    statTile(compact(s.popped), `💥 ${t('Popped')}`),
    statTile(compact(s.damage), t('Damage dealt')),
    statTile(compact(s.selfPopped), `🤦 ${t('Own goals')}`),
    statTile(compact(s.selfDamage), t('Hurt yourself')),
    statTile(compact(tot.played), t('Games')),
  );

  // Collection progress: what you've unlocked out of the whole shop.
  const owned = SHOP_ITEMS.filter((i) => me.owned.includes(i.id)).length;
  const coll = el('button', 'dash-collection');
  coll.onclick = () => go('shop');
  const bar = el('span', 'dash-bar');
  const fill = el('span', 'dash-bar-fill');
  fill.style.width = `${Math.round((owned / SHOP_ITEMS.length) * 100)}%`;
  bar.append(fill);
  coll.append(el('span', 'dash-coll-label', `🎩 ${t('Collection {owned}/{total} unlocked', { owned, total: SHOP_ITEMS.length })}`), bar);

  const buttons = el('div', 'dash-buttons');
  const stats = el('button', 'hud-btn', `📊 ${t('All stats')}`);
  stats.onclick = () => go('stats');
  const shop = el('button', 'hud-btn', `🛍️ ${t('Shop')}`);
  shop.onclick = () => go('shop');
  buttons.append(stats, shop);

  box.append(head, grid, coll);

  // The next thing Slime can unlock: the cheapest Slime item not owned yet.
  const next = SHOP_ITEMS.filter((i) => i.slime !== undefined && !me.owned.includes(i.id)).sort((a, b) => a.slime! - b.slime!)[0];
  if (next) {
    const goal = el('button', 'dash-goal');
    goal.setAttribute('aria-label', t('Next Slime unlock: {name}', { name: t(next.name) }));
    goal.onclick = () => go('shop');
    const art = el('span', 'dash-goal-art');
    art.innerHTML =
      next.kind === 'weapon'
        ? `<span class="shop-weapon-icon">${WEAPONS[next.ref]?.icon ?? '💥'}</span>`
        : mascotSvg(team.color, next.kind === 'hat' ? next.ref : wearHat(team.hat), next.kind === 'skin' ? next.ref : wearSkin(team.skin));
    const info = el('span', 'dash-goal-info');
    const have = me.wallet.slime;
    const ready = have >= next.slime!;
    const gbar = el('span', 'dash-bar');
    const gfill = el('span', 'dash-bar-fill');
    gfill.style.width = `${Math.min(100, Math.round((have / next.slime!) * 100))}%`;
    gbar.append(gfill);
    info.append(
      el('span', 'dash-goal-label', t('Next Slime unlock')),
      el('b', '', t(next.name)),
      gbar,
      el('span', 'dash-goal-label', ready ? `✅ ${t('Ready to unlock in the shop!')}` : `🟢 ${t('{have} / {need} Slime', { have: formatNumber(have), need: formatNumber(next.slime!) })}`),
    );
    goal.append(art, info);
    box.append(goal);
  }
  if (!tot.played) box.append(el('p', 'dash-note', t('Play online, or one-on-one against the CPU, to fill these in.')));
  box.append(buttons);
}
