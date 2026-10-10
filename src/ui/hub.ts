// The main menu: a top bar (logo, page tabs, wallet, profile) over one page
// at a time: Lobby (match setup), Stats, Shop and Account. Everything is a
// page rather than a pop-up. Stats, Shop and Account only appear when the
// server has accounts turned on (docs/ACCOUNTS.md).

import { mascotSvg } from './mascot';
import { loadProfiles } from './teams';
import { buildLobby, type Lobby, type MatchSetup } from './menu';
import { newSignInState, renderAccountPage, renderStatsPage } from './account';
import { newShopState, renderShop } from './shop';
import { compact } from './dashboard';
import { LEGAL } from './account';
import { account, onAccountChange, refreshAccount, wearHat, wearSkin } from '../account/session';

export type HubTab = 'lobby' | 'stats' | 'shop' | 'account';

/** What the pages get from the hub. */
export interface HubContext {
  /** An action is running: buttons that start another should be disabled. */
  busy: boolean;
  /** Run an action, showing its error (if any) in the notice bar. */
  run: (fn: () => Promise<void>) => void;
  go: (tab: HubTab) => void;
  /** Show a message in the notice bar ('' clears it) and redraw. */
  notify: (msg: string) => void;
  rerender: () => void;
}

export interface Hub {
  go: (tab: HubTab, notice?: string) => void;
}

const TABS: [HubTab, string, string][] = [
  ['lobby', '🏠', 'Lobby'],
  ['stats', '📊', 'Stats'],
  ['shop', '🛍️', 'Shop'],
  ['account', '👤', 'Account'],
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function showHub(root: HTMLElement, onStart: (s: MatchSetup) => void, onOnline?: () => void, tab: HubTab = 'lobby'): Hub {
  root.innerHTML = '';
  const shell = el('div', 'menu hub');
  const bar = el('header', 'hub-bar');
  const barInner = el('div', 'hub-bar-inner');
  const logo = el('button', 'hub-logo');
  logo.setAttribute('aria-label', 'TardiGeddon: lobby');
  const tabs = el('nav', 'seg hub-tabs');
  tabs.setAttribute('aria-label', 'Menu');
  const right = el('div', 'hub-right');
  barInner.append(logo, tabs, right);
  bar.append(barInner);
  const notice = el('div', 'hub-notice hidden');
  notice.setAttribute('role', 'status');
  const page = el('main', 'hub-page');
  shell.append(scene(), bar, notice, page, footer());
  root.append(shell);

  let status = '';
  const shopState = newShopState();
  const signInState = newSignInState();
  let lobby: Lobby | null = null;

  const ctx: HubContext = {
    busy: false,
    run: (fn) => void run(fn),
    go: (t) => go(t),
    notify: (msg) => {
      status = msg;
      render();
    },
    rerender: () => render(),
  };

  const run = async (fn: () => Promise<void>) => {
    if (ctx.busy) return;
    ctx.busy = true;
    status = '';
    render();
    try {
      await fn();
    } catch (e) {
      status = e instanceof Error ? e.message : String(e);
    }
    ctx.busy = false;
    render();
  };

  const go = (t: HubTab, msg = '') => {
    if (!shell.isConnected) return;
    tab = t;
    status = msg;
    if (t === 'lobby') lobby = null; // rebuilt fresh
    render();
    shell.scrollTo({ top: 0 });
    // Fresh stats and items each visit (a match or a purchase may have just finished).
    if (t !== 'lobby') void refreshAccount();
  };

  const renderBar = () => {
    const { me } = account();
    const team = loadProfiles()[0];
    logo.innerHTML = `<span class="hub-logo-pic">${mascotSvg(team.color, wearHat(team.hat), wearSkin(team.skin))}</span><span class="hub-logo-text">Tardi<span>Geddon</span></span>`;
    logo.onclick = () => go('lobby');

    tabs.innerHTML = '';
    // Without accounts there's only the lobby, so no tabs at all.
    tabs.classList.toggle('hidden', !me);
    for (const [t, icon, label] of TABS) {
      const b = el('button', 'seg-btn' + (tab === t ? ' on' : ''));
      b.append(el('span', 'tab-icon', icon), el('span', 'tab-label', label));
      b.setAttribute('aria-label', label);
      if (tab === t) b.setAttribute('aria-current', 'page');
      b.onclick = () => go(t);
      tabs.append(b);
    }

    right.innerHTML = '';
    if (!me) return;
    if (me.user) {
      const coins = el('button', 'chip chip-coins', `🪙 ${compact(me.wallet.coins)}`);
      coins.setAttribute('aria-label', `${me.wallet.coins} coins: open the shop`);
      coins.onclick = () => {
        if (me.shop) shopState.category = 'coins';
        go('shop');
      };
      const slime = el('button', 'chip chip-slime', `🟢 ${compact(me.wallet.slime)}`);
      slime.setAttribute('aria-label', `${me.wallet.slime} Slime: open the shop`);
      slime.onclick = () => {
        shopState.category = 'weapon';
        go('shop');
      };
      const who = el('button', 'chip hub-me');
      who.setAttribute('aria-label', `Signed in as ${me.user.name}: your account`);
      who.append(el('span', 'hub-me-name', me.user.name));
      who.onclick = () => go('account');
      right.append(coins, slime, who);
    } else {
      const signIn = el('button', 'chip hub-me', 'Sign in');
      signIn.onclick = () => go('account');
      right.append(signIn);
    }
  };

  const render = () => {
    if (!shell.isConnected) return off();
    const { me, loaded } = account();
    // The tab may have gone (accounts off, or a failed load).
    if (!me && tab !== 'lobby') tab = 'lobby';
    shell.dataset.tab = tab;
    renderBar();

    notice.innerHTML = '';
    notice.classList.toggle('hidden', !status);
    if (status) {
      notice.append(el('span', '', status));
      const x = el('button', 'hub-notice-x', '×');
      x.setAttribute('aria-label', 'Dismiss');
      x.onclick = () => ctx.notify('');
      notice.append(x);
    }

    if (tab === 'lobby') {
      if (!lobby) {
        lobby = buildLobby(onStart, onOnline, go);
        page.replaceChildren(lobby.el);
      } else lobby.refresh();
      return;
    }
    lobby = null;
    if (!loaded || !me) {
      page.replaceChildren(el('p', 'page-loading', 'Loading…'));
      return;
    }
    page.replaceChildren(tab === 'stats' ? renderStatsPage(me, ctx) : tab === 'shop' ? renderShop(me, ctx, shopState) : renderAccountPage(me, ctx, signInState));
  };

  const off = onAccountChange(render);
  render();
  return { go };
}

/** Cartoon hills, water and rising bubbles behind the menu (decoration only). */
function scene(): HTMLElement {
  const box = el('div', 'hub-scene');
  box.setAttribute('aria-hidden', 'true');
  box.innerHTML = `
    <svg class="scene-hills" viewBox="0 0 1600 300" preserveAspectRatio="none">
      <path d="M0 170 C160 90 300 110 420 150 S700 60 860 120 S1150 170 1300 100 S1520 90 1600 130 V300 H0 Z" fill="#9fd8b0" stroke="#2b1b24" stroke-width="4"/>
      <path d="M0 220 C120 170 260 180 380 210 S640 150 820 195 S1100 230 1240 180 S1480 170 1600 205 V300 H0 Z" fill="#6fbf8a" stroke="#2b1b24" stroke-width="4"/>
      <path d="M0 262 Q100 250 200 262 T400 262 T600 262 T800 262 T1000 262 T1200 262 T1400 262 T1600 262 V300 H0 Z" fill="#2f86d6" stroke="#2b1b24" stroke-width="4"/>
    </svg>
    ${Array.from({ length: 10 }, (_, i) => `<span class="scene-bubble" style="--i:${i}"></span>`).join('')}`;
  return box;
}

declare const __APP_VERSION__: string;

/** Links to the legal pages, support and the game's version. */
function footer(): HTMLElement {
  const f = el('footer', 'hub-footer');
  const link = (href: string, text: string) => {
    const a = el('a', '', text);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    return a;
  };
  f.append(
    link('https://tardigeddon.com/', 'tardigeddon.com'),
    link(LEGAL + 'terms-of-service', 'Terms'),
    link(LEGAL + 'privacy-policy', 'Privacy'),
    link(LEGAL + 'cookie-policy', 'Cookies'),
    link(LEGAL + 'childrens-privacy', "Children's privacy"),
    link(LEGAL + 'community-guidelines', 'Community'),
    link('mailto:support@tardigeddon.com', 'Support'),
    el('span', 'hub-version', `v${typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'}`),
  );
  return f;
}
