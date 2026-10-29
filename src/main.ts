import '@fontsource/luckiest-guy';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/800.css';
import './style.css';
import { enforceLandscape } from './ui/landscape';
import { initTextSize } from './ui/textSize';
import { applyAccess } from './ui/access';
import { lang, loadLang, t } from './i18n/i18n';
import { setUsagePlace, startUsage, usage, usageLoad } from './usage/usage';
import { confirmEmail, finishStorePurchases, listenForAppSignIn, refreshAccount, saveInvite } from './account/session';
import { showHub, type Hub } from './ui/hub';
import type { Match, MatchMode } from './match';
import { choosePractice } from './ui/learn';
import type { ChallengeKind } from './challenge/meta';
import { chooseChallenge } from './ui/challenge';
import { openReplays } from './ui/replays';
import type { MatchReplay } from './stats/matchReplay';
import { loadProfiles } from './ui/teams';
import type { CpuSkill } from './ai/skills';
import { audioRunning, pauseAudio, unlockAudio } from './audio/mixer';
import { refreshMusic } from './audio/music';
import { attachNative, isNativeApp, platform } from './native';
import { onStorePurchasesUpdated } from './shop/storeBilling';
import type { MatchSetup } from './ui/menu';
import type { ServerMsg } from './net/protocol';
type OnlineModule = typeof import('./ui/online');
import type { NetClient } from './net/client';
import type { Lockstep } from './net/lockstep';
import { presetScheme } from './sim/schemes';

const touchMode = matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch');
  void initTextSize();
  applyAccess();
async function boot(): Promise<void> {
  void initTextSize();
  if (touchMode) enforceLandscape();
  // The player's language (if not English) loads alongside the font.
  const langReady = loadLang();
  try {
    await document.fonts.load('16px "Luckiest Guy"');
  } catch {
    /* fall back to system font */
  }
  await langReady;
  // Anonymous counts of what's used (docs/USAGE.md).
  startUsage(platform(), lang());

  // Browsers only allow sound after a tap or key press: start the menu music on the first one.
  // A touch only counts once the finger lifts (pointerup / touchend / click), not on pointerdown,
  // so listen for all of them until the sound has really started.
  const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;
  const firstTouch = () => {
    unlockAudio();
    refreshMusic();
    if (audioRunning()) for (const g of GESTURES) window.removeEventListener(g, firstTouch, true);
  };
  for (const g of GESTURES) window.addEventListener(g, firstTouch, true);
  // No music from a tab in the background.
  document.addEventListener('visibilitychange', () => pauseAudio(document.hidden));

  const ui = document.getElementById('ui')!;
  let current: Match | null = null;
  let hub = null as Hub | null; // set by menu()
  let onlineScreen = null as ReturnType<OnlineModule['showOnline']> | null; // set by online()
  /** Bumped by every new screen, so a match that finishes loading late doesn't start over it. */
  let screen = 0;

  const menu = () => {
    screen++;
    current?.destroy();
    current = null;
    onlineScreen = null;
    setUsagePlace('menu');
    hub = showHub(ui, (setup) => start(setup), () => online(), () => tutorial(), () => choosePractice(ui, practice), () => chooseChallenge(ui, challenge), () => openReplays(ui, watch), () => void mapEditor());
  };
  /** Start a match, loading the game (renderer and all) the first time. */
  const play = async (mode: MatchMode, onMenu: () => void, onAgain: () => void): Promise<Match | null> => {
    const mine = ++screen;
    const pressed = performance.now();
    current?.destroy();
    current = null;
    hub = onlineScreen = null;
    ui.innerHTML = `<p class="loading-game" role="status">${t('Loading…')}</p>`;
    unlockAudio();
    const { Match, gameApp } = await loadGame();
    const app = await gameApp();
    if (mine !== screen) return null; // they went somewhere else meanwhile
    ui.innerHTML = '';
    current = new Match(app, ui, mode, onMenu, onAgain);
    // From pressing Play to the match running: the game's download (the first time) and its start.
    usageLoad('match', pressed);
    return current;
  };
  const start = (setup: MatchSetup) => void play({ kind: 'local', setup }, menu, () => start({ ...setup, seed: (Math.random() * 1e9) | 0 }));
  const tutorial = () => void play({ kind: 'tutorial' }, menu, tutorial);
  const challenge = (kind: ChallengeKind) => void play({ kind: 'challenge', challenge: kind }, menu, () => challenge(kind));
  const watch = (replay: MatchReplay) => void play({ kind: 'replay', replay }, menu, () => watch(replay));
  const mapEditor = async () => {
    const { openMapEditor } = await import('./ui/editor');
    openMapEditor(ui, {
      onPlay: (map) => start({ players: [false, true], teams: loadProfiles().slice(0, 2), scheme: { ...presetScheme('standard'), customMap: map }, seed: (Math.random() * 1e9) | 0, cpuSkill: 'normal' }),
      onClose: menu, // the Map list in Customise picks up new maps
    });
  };
  const practice = (endless: boolean) => void play({ kind: 'practice', endless }, menu, () => practice(endless));
  const online = async (opts: Parameters<OnlineModule['showOnline']>[2] = {}) => {
    const mine = ++screen;
    current?.destroy();
    current = null;
    hub = null;
    setUsagePlace('menu');
    usage('page', { page: 'online' });
    const { showOnline } = await import('./ui/online');
    if (mine !== screen) return;
    onlineScreen = showOnline(ui, { onBack: menu, onStart: (c, ls) => void startOnline(c, ls) }, opts);
  };
  const startOnline = async (client: NetClient, ls: Lockstep) => {
    // Frames the server sends while the game is still loading: kept, then handed over.
    const early: ServerMsg[] = [];
    const off = client.on((msg) => {
      if (msg.t === 'frames' || msg.t === 'hash') early.push(msg);
    });
    let m: Match | null = null;
    m = await play(
      { kind: 'online', client, ls },
      () => {
        client.close();
        menu();
      },
      () => online({ client, room: m?.lastRoom ?? undefined }),
    );
    off();
    for (const msg of early) {
      if (msg.t === 'frames') ls.onFrames(msg.from, msg.f);
      else if (msg.t === 'hash') ls.onHash(msg.tick, msg.h);
    }
    if (m) m.onNetStart = (next) => void startOnline(client, next);
  };
  // Phone apps: the back button steps back through the screens; pausing silences the game.
  attachNative({
    onBack: () => {
      if (current) current.back();
      else if (onlineScreen) onlineScreen.back();
      else if (!hub?.back()) return false;
      return true;
    },
    onPause: (paused) => {
      pauseAudio(paused);
      // Back in the app: a coin purchase may have finished meanwhile (e.g. a slow payment).
      if (!paused) void finishStorePurchases();
    },
  });

  const params = new URLSearchParams(location.search);
  // Debug/test hook: ?autostart=cpu skips the menu.
  const auto = params.get('autostart');
  const room = params.get('room');
  if (auto === 'tutorial') tutorial();
  else if (auto === 'practice') practice(params.get('endless') !== null);
  else if (auto === 'targets' || auto === 'rope') challenge(auto);
  else if (auto) {
    // ?autostart=cpu|hotseat, optionally &players=N (first slot human, rest CPU),
    // &style=PRESET (game style), &map=STYLE (map style) and &seed=N.
    const n = Number(params.get('players')) || 2;
    const players = Array.from({ length: n }, (_, i) => (auto === 'hotseat' ? false : i > 0));
    const skill = (params.get('skill') ?? 'normal') as CpuSkill;
    const scheme = { ...presetScheme(params.get('style') ?? 'standard'), mapStyle: params.get('map') ?? undefined };
    start({ players, teams: loadProfiles().slice(0, n), scheme, seed: Number(params.get('seed')) || 12345, cpuSkill: skill });
  } else if (room) {
    // Invite link: ?room=CODE
    online({ code: room.toUpperCase() });
  } else {
    menu();
    // From opening the page to the menu showing.
    usageLoad('menu', 0);
  }

  // The game itself downloads, and its renderer starts, as soon as the first
  // screen is up, so Play (or a match an invite link joins) starts at once.
  setTimeout(() => void loadGame().then((g) => g.gameApp()), 0);

  // Links from our emails: ?reset=TOKEN (choose a new password), ?verify=TOKEN (confirm the email).
  // Taken out of the address bar straight away, so they don't linger in history.
  const reset = params.get('reset');
  const verify = params.get('verify');
  if (reset || verify) history.replaceState(null, '', location.pathname);
  if (reset) hub?.resetPassword(reset);

  // A friend's or creator's invite link (?invite=CODE): kept until the player has an account (refreshAccount uses it).
  const invite = params.get('invite');
  if (invite && /^[A-Za-z0-9-]{3,20}$/.test(invite)) {
    saveInvite(invite);
    history.replaceState(null, '', location.pathname);
  }

  // Who's signed in (and what they own); the menu updates when this lands.
  const before = (await refreshAccount())?.wallet.coins ?? 0;
  // Android app: back from signing in with Apple in a browser tab.
  listenForAppSignIn((message) => hub?.go('account', message || undefined));
  // Android app: any coin purchase that never reached the server (app closed, no signal).
  void finishStorePurchases();
  onStorePurchasesUpdated(() => void finishStorePurchases());
  if (verify) {
    try {
      await confirmEmail(verify);
      hub?.go('account', t('Thanks! Your email is confirmed.'));
    } catch (e) {
      hub?.go('account', e instanceof Error ? e.message : String(e));
    }
  }
  // Back from Stripe's payment page.
  const shop = params.get('shop');
  if (shop) {
    history.replaceState(null, '', location.pathname);
    if (shop === 'done' || shop === 'cancel') usage('checkout', { store: 'stripe', step: shop });
    if (shop === 'done') {
      hub?.go('shop', t('Thanks! Your coins will appear in your wallet in a moment.'));
      // Stripe tells the server a few seconds after paying, so check back a few times.
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        if (((await refreshAccount())?.wallet.coins ?? 0) > before) break;
      }
    } else hub?.go('shop', t('Payment cancelled: nothing was charged.'));
  }
}

/** The game (match, renderer, HUD, CPU): its own download, fetched once. */
let game: Promise<typeof import('./match')> | null = null;
function loadGame(): Promise<typeof import('./match')> {
  return (game ??= import('./match'));
}

void boot();

// Offline play: keep the game on the device (scripts/offline.ts). Not in the
// phone apps (already on the phone) or while developing.
if (import.meta.env.PROD && !isNativeApp() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* no offline copy this time: everything still works online */
    });
  });
}
