// The stats dashboard beside the main menu. Signed in: your tardigrade and
// lifetime stats. Signed out: a nudge to sign in. Hidden when the server has
// accounts turned off.

import { mascotSvg } from './mascot';
import { loadProfiles } from './teams';
import { account, wearHat, wearSkin, type PlayerStats } from '../account/session';

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

/** Fill `box` with the dashboard for the current account state. */
export function renderDashboard(box: HTMLElement, open: (tab: 'profile' | 'shop') => void): void {
  const { me } = account();
  box.innerHTML = '';
  box.classList.toggle('hidden', !me);
  if (!me) return;

  if (!me.user) {
    box.classList.add('dash-teaser');
    box.append(el('h2', 'dash-title', 'Track your stats'));
    const list = el('ul', 'dash-perks');
    for (const t of ['🏆 Wins and win streaks', '💥 Tardigrades popped', '🤦 Your funniest own goals', '🎩 Your hats on every device']) list.append(el('li', '', t));
    const go = el('button', 'big-btn dash-go', 'Sign in');
    go.onclick = () => open('profile');
    box.append(list, go, el('p', 'dash-note', 'Free, and everything in the game stays playable without one.'));
    return;
  }
  box.classList.remove('dash-teaser');

  const s = me.stats;
  const t = totals(s);
  const team = loadProfiles()[0];
  const head = el('button', 'dash-head');
  head.setAttribute('aria-label', 'Open your profile');
  head.onclick = () => open('profile');
  const pic = el('span', 'dash-pic');
  pic.innerHTML = mascotSvg(team.color, wearHat(team.hat), wearSkin(team.skin));
  const who = el('span', 'dash-who');
  who.append(el('span', 'dash-name', me.user.name));
  if (s.streak > 1) who.append(el('span', 'dash-streak', `🔥 ${s.streak} wins in a row`));
  head.append(pic, who);

  const big = el('div', 'dash-big');
  const stat = (parent: HTMLElement, value: string, label: string, cls = 'dash-stat') => {
    const d = el('div', cls);
    d.append(el('div', 'dash-value', value), el('div', 'dash-label', label));
    parent.append(d);
  };
  stat(big, compact(t.won), 'Wins');
  stat(big, t.rate, 'Win rate');

  const grid = el('div', 'dash-grid');
  stat(grid, compact(t.played), 'Games');
  stat(grid, compact(s.bestStreak), 'Best streak');
  stat(grid, compact(s.popped), '💥 Popped');
  stat(grid, compact(s.damage), 'Damage dealt');
  stat(grid, compact(s.selfPopped), '🤦 Own goals');
  stat(grid, compact(s.selfDamage), 'Hurt yourself');

  const wallet = el('div', 'dash-wallet');
  wallet.append(el('span', '', `🪙 ${compact(me.wallet.coins)}`), el('span', '', `🟢 ${compact(me.wallet.slime)} Slime`));
  const split = el('p', 'dash-split', `Online ${s.onlineWon}/${s.onlinePlayed} · vs CPU ${s.cpuWon}/${s.cpuPlayed} won`);

  const buttons = el('div', 'dash-buttons');
  const prof = el('button', 'hud-btn', '👤 Profile');
  prof.onclick = () => open('profile');
  const shop = el('button', 'hud-btn', '🛍️ Shop');
  shop.onclick = () => open('shop');
  buttons.append(prof);
  if (me.shop) buttons.append(shop);

  box.append(head, wallet, big, grid, split);
  if (!t.played) box.append(el('p', 'dash-note', 'Play online, or one-on-one against the CPU, to fill these in.'));
  box.append(buttons);
}
