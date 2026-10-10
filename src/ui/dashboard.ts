// The career panel beside the match setup in the lobby. Signed in: your
// tardigrade, wallet and lifetime stats. Signed out: a nudge to sign in.
// Hidden when the server has accounts turned off.

import { mascotSvg } from './mascot';
import { loadProfiles } from './teams';
import { SHOP_ITEMS, formatNumber } from '../shop/catalog';
import { WEAPONS } from '../sim/weapons';
import { account, wearHat, wearSkin, type PlayerStats } from '../account/session';
import type { HubTab } from './hub';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** 1234 -> "1,234", 25300 -> "25.3k". */
export function compact(n: number): string {
  return n >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : n.toLocaleString('en-GB');
}

export function totals(s: PlayerStats): { played: number; won: number; rate: string } {
  const played = s.onlinePlayed + s.cpuPlayed;
  const won = s.onlineWon + s.cpuWon;
  return { played, won, rate: played ? `${Math.round((won / played) * 100)}%` : '–' };
}

/** A stat tile: big number over a small label. */
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

  box.append(el('h2', 'card-title', me.user ? 'Career' : 'Your career'));
  if (!me.user) {
    box.classList.add('dash-teaser');
    const list = el('ul', 'dash-perks');
    for (const t of ['🏆 Wins and win streaks', '💥 Tardigrades popped', '🤦 Your funniest own goals', '🟢 Earn Slime to unlock weapons', '🎩 Your hats on every device']) list.append(el('li', '', t));
    const signIn = el('button', 'big-btn dash-go', 'Sign in');
    signIn.onclick = () => go('account');
    box.append(list, signIn, el('p', 'dash-note', 'Free, and everything in the game stays playable without one.'));
    return;
  }
  box.classList.remove('dash-teaser');

  const s = me.stats;
  const t = totals(s);
  const team = loadProfiles()[0];
  const head = el('button', 'dash-head');
  head.setAttribute('aria-label', 'Open your account');
  head.onclick = () => go('account');
  const pic = el('span', 'dash-pic');
  pic.innerHTML = mascotSvg(team.color, wearHat(team.hat), wearSkin(team.skin));
  const who = el('span', 'dash-who');
  who.append(el('span', 'dash-name', me.user.name));
  who.append(el('span', 'dash-streak', s.streak > 1 ? `🔥 ${s.streak} wins in a row` : `${compact(t.played)} games played`));
  head.append(pic, who);

  const grid = el('div', 'dash-grid');
  grid.append(
    statTile(compact(t.won), 'Wins', 'gold'),
    statTile(t.rate, 'Win rate', 'gold'),
    statTile(compact(s.bestStreak), 'Best streak'),
    statTile(compact(s.popped), '💥 Popped'),
    statTile(compact(s.damage), 'Damage dealt'),
    statTile(compact(s.selfPopped), '🤦 Own goals'),
    statTile(compact(s.selfDamage), 'Hurt yourself'),
    statTile(compact(t.played), 'Games'),
  );

  // Collection progress: what you've unlocked out of the whole shop.
  const owned = SHOP_ITEMS.filter((i) => me.owned.includes(i.id)).length;
  const coll = el('button', 'dash-collection');
  coll.onclick = () => go('shop');
  const bar = el('span', 'dash-bar');
  const fill = el('span', 'dash-bar-fill');
  fill.style.width = `${Math.round((owned / SHOP_ITEMS.length) * 100)}%`;
  bar.append(fill);
  coll.append(el('span', 'dash-coll-label', `🎩 Collection ${owned}/${SHOP_ITEMS.length} unlocked`), bar);

  const buttons = el('div', 'dash-buttons');
  const stats = el('button', 'hud-btn', '📊 All stats');
  stats.onclick = () => go('stats');
  const shop = el('button', 'hud-btn', '🛍️ Shop');
  shop.onclick = () => go('shop');
  buttons.append(stats, shop);

  box.append(head, grid, coll);

  // The next thing Slime can unlock: the cheapest Slime item not owned yet.
  const next = SHOP_ITEMS.filter((i) => i.slime !== undefined && !me.owned.includes(i.id)).sort((a, b) => a.slime! - b.slime!)[0];
  if (next) {
    const goal = el('button', 'dash-goal');
    goal.setAttribute('aria-label', `Next Slime unlock: ${next.name}`);
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
      el('span', 'dash-goal-label', 'Next Slime unlock'),
      el('b', '', next.name),
      gbar,
      el('span', 'dash-goal-label', ready ? '✅ Ready to unlock in the shop!' : `🟢 ${formatNumber(have)} / ${formatNumber(next.slime!)} Slime`),
    );
    goal.append(art, info);
    box.append(goal);
  }
  if (!t.played) box.append(el('p', 'dash-note', 'Play online, or one-on-one against the CPU, to fill these in.'));
  box.append(buttons);
}
