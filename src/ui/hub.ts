// The main menu: a top bar (logo, page tabs, wallet, profile) over one page
// at a time: Lobby (match setup), Stats, Shop and Account. Everything is a
// page rather than a pop-up. Stats, Shop and Account only appear when the
// server has accounts turned on (docs/ACCOUNTS.md).

import { keepPlace } from './scroll';
import { usage } from '../usage/usage';
import { closeNewThing, newThing, newThingSeen } from './drops';
import { seasonSky } from './seasonSky';
import { renderGuidePage } from './guide';
import { newNewsState, renderNewsPage } from './news';
import { onNews } from '../news/feed';
import { mascotSvg } from './mascot';
import { loadProfiles } from './teams';
import { buildLobby, type Lobby, type MatchSetup } from './menu';
import { newSignInState, renderAccountPage, renderStatsPage } from './account';
import { newShopState, renderShop } from './shop';
import { EARLY_BIRD_COINS, FOUNDER_COINS, INVITE_MATCHES } from '../shop/rewards';
import { promoItem, shopItem } from '../shop/catalog';
import { newSalesState, renderSalesPage } from './sales';
import { newSettingsState, renderSettingsPage } from './settings';
import { compact } from './dashboard';
import { playMusic, previewMusic } from '../audio/music';
import { LEGAL } from './account';
import { account, newsAsked, onAccountChange, peekInvite, refreshAccount, savedInvite, setNews, takeInviteNews, takePrizeNews, wearHat, wearSkin } from '../account/session';
import { newsWording } from './newsSignup';
import { showRewardPop } from './rewardPop';
import { t } from '../i18n/i18n';
import { tk } from '../i18n/tk';

export type HubTab = 'lobby' | 'stats' | 'shop' | 'account' | 'settings' | 'sales' | 'guide' | 'news';

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
  /** The page showing now. */
  tab: () => HubTab;
  /** Step back one screen (a page to the lobby, match setup to the lobby's home). False if there's nowhere to go. */
  back: () => boolean;
  /** Open the Account page at "choose a new password", for the token from a reset email. */
  resetPassword: (token: string) => void;
}

const TABS: [HubTab, string, string][] = [
  ['lobby', '🏠', tk('Lobby')],
  ['stats', '📊', tk('Stats')],
  ['shop', '🛍️', tk('Shop')],
  ['account', '👤', tk('Account')],
  ['settings', '⚙️', tk('Settings')],
  // Only for the owner (me.admin).
  ['sales', '📈', tk('Sales')],
  // Not in the top bar: opened from the lobby and Settings.
  ['guide', '📖', tk('Guide')],
  ['news', '📰', tk('News')],
];

/** The Founder pack's thank-you has been shown (for this visit: the menu is rebuilt after each match). */
let founderThanked = false;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function showHub(
  root: HTMLElement,
  onStart: (s: MatchSetup) => void,
  onOnline?: () => void,
  onTutorial: () => void = () => {},
  onPractice: () => void = () => {},
  onChallenge: () => void = () => {},
  onReplays: () => void = () => {},
  onMapEditor: () => void = () => {},
  tab: HubTab = 'lobby',
): Hub {
  root.innerHTML = '';
  const shell = el('div', 'menu hub');
  const bar = el('header', 'hub-bar');
  const barInner = el('div', 'hub-bar-inner');
  const logo = el('button', 'hub-logo');
  logo.setAttribute('aria-label', t('TardiGeddon: lobby'));
  const tabs = el('nav', 'seg hub-tabs');
  tabs.setAttribute('aria-label', t('Menu'));
  const right = el('div', 'hub-right');
  // Phones: instead of the tabs, a Back button and the page's name.
  const backBtn = el('button', 'hud-btn hub-back', t('← Back'));
  backBtn.onclick = () => go('lobby');
  const title = el('h1', 'hub-title');
  barInner.append(backBtn, logo, title, tabs, right);
  bar.append(barInner);
  const notice = el('div', 'hub-notice hidden');
  notice.setAttribute('role', 'status');
  // Something new (a seasonal world, new looks in the Shop): until it's closed.
  const news = el('div', 'hub-news hidden');
  const page = el('main', 'hub-page');
  shell.append(bar, notice, news, page, footer());
  seasonSky(shell);
  root.append(shell);
  // The menu's own theme (it starts after the first tap or key press: browsers block sound before that).
  playMusic('menu');

  let status = '';
  let previewDismissed = false;
  const shopState = newShopState();
  const signInState = newSignInState();
  const salesState = newSalesState();
  const settingsState = newSettingsState();
  const newsState = newNewsState();
  let lobby: Lobby | null = null;

  const ctx: HubContext = {
    busy: false,
    run: (fn) => void run(fn),
    go: (to) => go(to),
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

  const go = (to: HubTab, msg = '') => {
    if (!shell.isConnected) return;
    tab = to;
    status = msg;
    usage('page', { page: to });
    // A track being tried in the shop stops when you leave it.
    if (to !== 'shop') previewMusic(null);
    if (to === 'lobby') lobby = null; // rebuilt fresh
    render();
    shell.scrollTo({ top: 0 });
    // Fresh stats and items each visit (a match or a purchase may have just finished).
    if (to !== 'lobby') void refreshAccount();
  };

  const renderBar = () => {
    const { me } = account();
    const team = loadProfiles()[0];
    logo.innerHTML = `<span class="hub-logo-pic">${mascotSvg(team.color, wearHat(team.hat), wearSkin(team.skin))}</span><span class="hub-logo-text">Tardi<span>Geddon</span></span>`;
    logo.onclick = () => go('lobby');

    tabs.innerHTML = '';
    // Without accounts there's only the lobby and Settings.
    for (const [id, icon, label] of TABS) {
      if (id === 'sales' && !me?.admin) continue;
      if (id === 'guide' || id === 'news') continue;
      if (!me && id !== 'lobby' && id !== 'settings') continue;
      const b = el('button', 'seg-btn' + (tab === id ? ' on' : '') + (id === 'sales' ? ' tab-owner' : ''));
      b.append(el('span', 'tab-icon', icon), el('span', 'tab-label', t(label)));
      b.setAttribute('aria-label', t(label));
      if (tab === id) b.setAttribute('aria-current', 'page');
      b.onclick = () => go(id);
      tabs.append(b);
    }

    const shownTab = TABS.find(([id]) => id === tab)?.[2];
    title.textContent = shownTab ? t(shownTab) : '';
    right.innerHTML = '';
    if (!me) return;
    if (me.user) {
      const coins = el('button', 'chip chip-coins', `🪙 ${compact(me.wallet.coins)}`);
      coins.setAttribute('aria-label', t('{n} coins: open the shop', { n: me.wallet.coins }));
      coins.onclick = () => {
        if (me.shop) {
          usage('coinstap', { from: 'wallet' });
          shopState.category = 'coins';
        }
        go('shop');
      };
      const slime = el('button', 'chip chip-slime', `🟢 ${compact(me.wallet.slime)}`);
      slime.setAttribute('aria-label', t('{n} Slime: open the shop', { n: me.wallet.slime }));
      slime.onclick = () => {
        shopState.category = 'weapon';
        go('shop');
      };
      const who = el('button', 'chip hub-me');
      who.setAttribute('aria-label', t('Signed in as {name}: your account', { name: me.user.name }));
      if (me.creatorBadge) who.append(el('span', 'founder-badge', '⭐'));
      else if (me.supporterBadge) who.append(el('span', 'founder-badge', me.supporterBadge === 'patron' ? '💖' : '💛'));
      else if (me.earlyBird) who.append(el('span', 'founder-badge', me.founder ? '🌱' : '🐣'));
      who.append(el('span', 'hub-me-name', me.user.name));
      who.onclick = () => go('account');
      right.append(coins, slime, who);
    } else {
      const signIn = el('button', 'chip hub-me', t('Sign in'));
      signIn.onclick = () => go('account');
      right.append(signIn);
    }
  };

  let drawnTab: HubTab | null = null;
  const render = () => {
    // Redrawing the same page (a setting changed): stay where you were in it.
    const putBack = drawnTab === tab ? keepPlace(page) : null;
    draw();
    drawnTab = tab;
    putBack?.();
  };
  const draw = () => {
    if (!shell.isConnected) return off();
    const { me, loaded } = account();
    // The tab may have gone (accounts off, or a failed load); until the account loads, it shows "Loading…".
    if (loaded && !me && tab !== 'lobby' && tab !== 'settings' && tab !== 'guide' && tab !== 'news') tab = 'lobby';
    if (loaded && tab === 'sales' && !me?.admin) tab = 'lobby';
    shell.dataset.tab = tab;
    renderBar();

    // The Founder pack has just been given: say thank you (once: the server only says so once).
    if ((me?.founderNew || me?.earlyBirdNew) && !founderThanked) {
      founderThanked = true;
      status = me.founderNew
        ? t('🌱 Thanks for being here from the start! Your Founder and Early bird packs are in: two worlds, two music tracks, two dances, two hats, two gravestones and {coins} coins. Find them in ✎ Customise team and the World button.', { coins: FOUNDER_COINS + EARLY_BIRD_COINS })
        : t('🐣 Thanks for joining early! Your Early bird pack is in: a world, a music track, a dance, a hat, a gravestone and {coins} coins. Find them in ✎ Customise team and the World button.', { coins: EARLY_BIRD_COINS });
    }
    // Invite rewards that came in (both sides), and a welcome for an invite link opened while signed out.
    if (shell.isConnected) showInviteNews(go);
    // A contest prize the owner put on this account (told once).
    if (shell.isConnected) showPrizeNews();
    // Signed in and never asked about email news: ask once (never ticked for them).
    if (loaded && me?.user && me.newsletter && !me.newsletter.asked && !newsAskedThisVisit && tab === 'lobby') {
      newsAskedThisVisit = true;
      setTimeout(askAboutNews, 1500);
    }
    if (loaded && me && !me.user && !inviteWelcomed) {
      const code = savedInvite();
      if (code) {
        inviteWelcomed = true;
        void welcomeInvite(code, () => {
          signInState.mode = 'signup';
          go('account');
        });
      }
    }
    notice.innerHTML = '';
    const shown = status || (me?.preview && !previewDismissed ? t("Preview build: accounts and payments aren't connected here, so signing in and buying won't work.") : '');
    notice.classList.toggle('hidden', !shown);
    if (shown) {
      notice.append(el('span', '', shown));
      const x = el('button', 'hub-notice-x', '×');
      x.setAttribute('aria-label', t('Dismiss'));
      x.onclick = () => {
        if (!status) previewDismissed = true;
        ctx.notify('');
      };
      notice.append(x);
    }

    const fresh = tab === 'lobby' ? newThing() : null;
    news.innerHTML = '';
    news.classList.toggle('hidden', !fresh || newThingSeen(fresh.id));
    shell.classList.toggle('has-news', !news.classList.contains('hidden'));
    if (fresh && !newThingSeen(fresh.id)) {
      const look = el('button', 'hud-btn hub-news-go', t('Take a look'));
      look.onclick = () => {
        closeNewThing(fresh.id);
        if (fresh.open === 'looks') lobby?.looks();
        else go('shop');
        render();
      };
      const x = el('button', 'hub-notice-x', '×');
      x.setAttribute('aria-label', t('Dismiss'));
      x.onclick = () => {
        closeNewThing(fresh.id);
        render();
      };
      news.append(el('span', '', fresh.text), look, x);
    }

    if (tab === 'lobby') {
      if (!lobby) {
        lobby = buildLobby(onStart, onOnline, go, onTutorial, onPractice, onChallenge, onReplays, onMapEditor, () => {
          shopState.category = 'coins';
          go('shop');
        });
        page.replaceChildren(lobby.el);
      } else lobby.refresh();
      return;
    }
    lobby = null;
    if (tab === 'settings') {
      page.replaceChildren(renderSettingsPage(ctx, settingsState));
      return;
    }
    if (tab === 'guide') {
      page.replaceChildren(renderGuidePage(ctx, onTutorial, onPractice));
      return;
    }
    if (tab === 'news') {
      page.replaceChildren(renderNewsPage(ctx, newsState));
      return;
    }
    if (!loaded || !me) {
      page.replaceChildren(el('p', 'page-loading', t('Loading…')));
      return;
    }
    page.replaceChildren(
      tab === 'stats'
        ? renderStatsPage(me, ctx)
        : tab === 'shop'
          ? renderShop(me, ctx, shopState)
          : tab === 'sales'
            ? renderSalesPage(me, ctx, salesState)
            : renderAccountPage(me, ctx, signInState),
    );
  };

  const offAccount = onAccountChange(render);
  // The website's newest posts arrived (src/news/feed.ts): the News page and the lobby's dot.
  const offNews = onNews(render);
  const off = () => {
    offAccount();
    offNews();
  };
  render();
  return {
    go,
    tab: () => tab,
    back: () => {
      if (tab !== 'lobby') {
        go('lobby');
        return true;
      }
      return lobby?.back() ?? false;
    },
    resetPassword: (token) => {
      signInState.mode = 'reset';
      signInState.token = token;
      go('account');
    },
  };
}

/** The invite-link welcome is shown once a visit. */
let inviteWelcomed = false;
/** The email news question: once a visit at most (and never again once answered). */
let newsAskedThisVisit = false;

/** "Want TardiGeddon news by email?": yes subscribes the account's email; "not now" doesn't ask again. */
function askAboutNews(): void {
  if (document.querySelector('.reward-overlay, .checkout-overlay, .editor-overlay')) return;
  showRewardPop({
    badge: '📬',
    title: t('Want the news by email?'),
    text: newsWording(),
    button: t('📬 Yes please'),
    go: () => void setNews(true, 'prompt').catch(() => {}),
    other: { label: t('Not now'), go: () => void newsAsked().catch(() => {}) },
  });
}

/** Invite rewards the server reported (src/account/session.ts takeInviteNews), as pop-ups: your own first, then your friends'. */
function showInviteNews(go: (tab: HubTab) => void): void {
  const news = takeInviteNews();
  if (!news) return;
  const friends = () => {
    if (!news.friends) return;
    showRewardPop({
      badge: '🥳',
      title: news.friends === 1 ? t('A friend joined!') : t('{n} friends joined!', { n: news.friends }),
      text: news.friends === 1
        ? t('A friend made an account with your code and played their first matches, so you both get coins. Keep inviting!')
        : t('{n} friends made accounts with your code and played their first matches, so you all get coins. Keep inviting!', { n: news.friends }),
      coins: news.coins,
      button: t('Brilliant!'),
      other: { label: t('Invite more friends'), go: () => go('account') },
    });
  };
  const mine = news.mine;
  if (!mine) return friends();
  showRewardPop({
    badge: mine.creator ? '⭐' : '🎁',
    title: t('Your reward is in!'),
    text: mine.creator
      ? t('Thanks for joining with {name}’s code! Here are {coins} free coins and the Superfan pack. Find the looks in ✎ Customise team.', { name: mine.creator, coins: mine.coins })
      : t('Thanks for joining with a friend’s code! You both got {coins} free coins. Spend them in the Shop.', { coins: mine.coins }),
    coins: mine.coins,
    items: mine.items,
    button: t('Brilliant!'),
    go: friends,
  });
}

/** Looks the owner gave as a contest prize (src/account/session.ts takePrizeNews), as a pop-up. */
function showPrizeNews(): void {
  const news = takePrizeNews();
  if (!news?.items.length) return;
  const names = news.items.map((id) => t((shopItem(id) ?? promoItem(id))?.name ?? id)).join(', ');
  showRewardPop({
    badge: '🏆',
    title: t('You won a prize!'),
    text: t('Congratulations! {items} are now in your collection. Find them in ✎ Customise team.', { items: names }),
    items: news.items,
    button: t('Brilliant!'),
  });
}

/** Opened a friend's or creator's invite link, signed out: say what they'll get for making an account. */
async function welcomeInvite(code: string, signUp: () => void): Promise<void> {
  const p = await peekInvite(code);
  if (p.kind === 'unknown') return;
  showRewardPop({
    badge: p.kind === 'creator' ? '⭐' : '🎁',
    title: p.kind === 'creator' ? t('{name} invited you!', { name: p.name }) : t('A friend invited you!'),
    text: p.kind === 'creator'
      ? t('Make your account and play {matches} matches to get {coins} free coins and the Superfan pack: looks you can’t buy.', { matches: INVITE_MATCHES, coins: p.coins })
      : t('Make your account and play {matches} matches: you get {coins} free coins, and so does your friend.', { matches: INVITE_MATCHES, coins: p.coins }),
    coins: p.coins,
    items: p.kind === 'creator' ? p.items : [],
    button: t('Make my account'),
    go: signUp,
    other: { label: t('Maybe later') },
  });
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
    link(LEGAL + 'terms-of-service', t('Terms')),
    link(LEGAL + 'privacy-policy', t('Privacy')),
    link(LEGAL + 'cookie-policy', t('Cookies')),
    link(LEGAL + 'childrens-privacy', t("Children's privacy")),
    link(LEGAL + 'community-guidelines', t('Community')),
    link('mailto:support@tardigeddon.com', t('Support')),
    el('span', 'hub-version', `v${typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'}`),
  );
  return f;
}

