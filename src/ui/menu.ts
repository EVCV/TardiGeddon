// The Lobby page of the menu hub (ui/hub.ts): a hero card with your team,
// match setup (teams, CPU skill, game style plus a Customise panel), the
// Play buttons and the career panel.

import { keepPlaceAfter } from './scroll';
import { mascotSvg } from './mascot';
import { emblemSvg } from '../render/emblems';
import { CPU_SKILLS, type CpuSkill } from '../ai/skills';
import { SCHEME_PRESETS, presetScheme } from '../sim/schemes';
import { DEFAULT_SCHEME, type Scheme } from '../sim/types';
import { MAX_TEAMS } from '../sim/rosters';
import { MAP_STYLES } from '../sim/terrain/generate';
import { hex, shown, teamSymbol } from '../render/palette';
import { loadProfiles, nextColor, saveProfiles, updateProfile, type TeamProfile } from './teams';
import { openTeamEditor } from './teamEditor';
import { arenaLabel, openLooks } from './looks';
import { findEgg } from './eggs';
import { currentSeason, seasonEnds } from '../render/seasons';
import { arenaTheme } from '../render/arenas';
import { renderDashboard } from './dashboard';
import { account, wearHat, wearSkin } from '../account/session';
import type { HubTab } from './hub';
import { tutorialSeen } from './learn';
import { myMaps } from './myMaps';
import { lang, t } from '../i18n/i18n';
import { tk } from '../i18n/tk';

export interface MatchSetup {
  /** One entry per team: true = CPU, false = human. */
  players: boolean[];
  /** Team profiles for the slots in play (same length as players). */
  teams: TeamProfile[];
  scheme: Scheme;
  seed: number;
  /** How well CPU teams play. */
  cpuSkill: CpuSkill;
}

const STORE_KEY = 'tardigeddon.menu';

interface Saved {
  style: string;
  custom: Scheme;
  players: boolean[];
  cpuSkill: CpuSkill;
}

const PLAYER_COUNTS = [2, 3, 4, 6, 8, 10];
const DEFAULT_PLAYERS = [false, true];

// Per-device convenience only: storage can be missing or blocked.
function load(): Saved {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Saved;
      const players = Array.isArray(v.players) && v.players.length >= 2 && v.players.length <= MAX_TEAMS ? v.players : DEFAULT_PLAYERS;
      const cpuSkill = CPU_SKILLS.some((k) => k.id === v.cpuSkill) ? v.cpuSkill : 'normal';
      return { style: v.style ?? 'standard', custom: { ...DEFAULT_SCHEME, ...v.custom }, players, cpuSkill };
    }
  } catch {
    /* ignore */
  }
  return { style: 'standard', custom: { ...DEFAULT_SCHEME }, players: DEFAULT_PLAYERS, cpuSkill: 'normal' };
}

function save(v: Saved): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

/** Editable fields in the Customise panel. */
interface Field {
  key: keyof Scheme;
  label: string;
  options: [string, number | boolean | string][];
  /** What it means, on hover. */
  hint?: string;
}

const FIELDS: Field[] = [
  { key: 'tardisPerTeam', label: tk('Tardigrades per team'), options: [['2', 2], ['3', 3], ['4', 4]] },
  { key: 'turnTime', label: tk('Turn time'), options: [[tk('20s'), 20], [tk('30s'), 30], [tk('45s'), 45], [tk('60s'), 60], [tk('90s'), 90]] },
  { key: 'roundTime', label: tk('Sudden death after'), options: [[tk('3 min'), 3], [tk('5 min'), 5], [tk('10 min'), 10], [tk('15 min'), 15], [tk('20 min'), 20]] },
  { key: 'startHp', label: tk('Starting health'), options: [['50', 50], ['60', 60], ['100', 100], ['150', 150], ['200', 200]] },
  { key: 'mines', label: tk('Mines'), options: [[tk('None'), 0], [tk('Few'), 4], [tk('Normal'), 8], [tk('Lots'), 16]] },
  { key: 'drums', label: tk('Brine drums'), options: [[tk('None'), 0], [tk('Few'), 3], [tk('Lots'), 8]] },
  { key: 'crateChance', label: tk('Crates'), options: [[tk('Off'), 0], [tk('Rare'), 0.25], [tk('Normal'), 0.5], [tk('Every turn'), 1]] },
  { key: 'supers', label: tk('Superweapons'), options: [[tk('Crates only'), 0], [tk('1 each'), 1]] },
  { key: 'windMax', label: tk('Wind'), options: [[tk('Off'), 0], [tk('Light'), 0.5], [tk('Normal'), 1]] },
  { key: 'fallDamage', label: tk('Fall damage'), options: [[tk('On'), true], [tk('Off'), false]] },
  {
    key: 'friendlyFire',
    label: tk('Friendly fire'),
    options: [[tk('On'), true], [tk('Off'), false]],
    hint: tk('On: your own weapons can hurt your own team, and you. Off: they only hurt the other teams.'),
  },
  { key: 'movement', label: tk('Walking'), options: [[tk('On'), true], [tk('Off (Artillery)'), false]] },
  {
    key: 'mapStyle',
    label: tk('Map'),
    options: [[tk('Surprise me'), 'random'], ...MAP_STYLES.map((m): [string, string] => [m.name, m.id])],
    hint: tk('What kind of land you fight on. Surprise me picks a different one every match.'),
  },
  {
    key: 'armour',
    label: tk('Armour'),
    options: [[tk('None'), 0], [tk('Light'), 25], [tk('Heavy'), 50]],
    hint: tk('Armour plates soak up half of each hit until they are used up.'),
  },
  {
    key: 'aimGuide',
    label: tk('Shot path guide'),
    options: [[tk('Off'), 0], [tk('Short'), 1], [tk('Full'), 2]],
    hint: tk('While you charge a shot, dots show where it will fly (wind included). Short shows the start of the path; Full shows all of it.'),
  },
  {
    key: 'weather',
    label: tk('Weather'),
    options: [[tk('On'), true], [tk('Off'), false]],
    hint: tk('Rain, snow, sunshine and fog. Very rarely, a tornado throws every tardigrade somewhere new.'),
  },
];

/** The game style last chosen in the menu (used by the online lobby). */
export function savedScheme(): { style: string; custom: Scheme } {
  const v = load();
  return { style: v.style, custom: v.custom };
}

/** Pop-ups go above the whole menu (top bar and footer included), not inside the page. */
const overlayHost = (fallback: HTMLElement): HTMLElement => document.getElementById('ui') ?? fallback;

export interface Lobby {
  el: HTMLElement;
  /** Redraw what depends on the account (hats owned, stats). */
  refresh: () => void;
  /** Phones: back from a sub-screen (match setup) to the lobby's home screen; false if already there. */
  back: () => boolean;
  /** Open the World, music and sounds picker. */
  looks: () => void;
}

export function buildLobby(
  onStart: (s: MatchSetup) => void,
  onOnline: (() => void) | undefined,
  go: (tab: HubTab) => void,
  onTutorial: () => void,
  onPractice: () => void,
  onChallenge: () => void,
  onReplays: () => void,
  onMapEditor: () => void,
  /** The shop, at the coin packs. */
  onCoins: () => void = () => go('shop'),
): Lobby {
  const root = document.createElement('div');
  const saved = load();
  const styleOptions = SCHEME_PRESETS.map((p) => `<option value="${p.id}">${t(p.name)}</option>`).join('');
  root.className = 'page lobby';
  root.innerHTML = `
      <section class="card lobby-hero">
        <div class="hero-art">
          <div class="mascot"></div>
          <button class="chip hero-edit">✎ ${t('Customise team')}</button>
          <button class="chip hero-looks" title="${t('The world you play in, your match music and sounds')}">🏞️ ${t('World: {name}', { name: '<span class="looks-now"></span>' })}</button>
          <button class="chip hero-coins" hidden>${t('🪙 Get coins')}</button>
        </div>
        <div class="hero-text">
          <h1 class="title">Tardi<span>Geddon</span></h1>
          <p class="tagline">${t('Tiny. Indestructible. Armed.')}</p>
          <p class="hero-team"></p>
          <p class="hero-season" hidden></p>
          <button class="hero-coins-banner" hidden><span>${t('🪙 Coin packs: new hats, skins, worlds and more for your team.')}</span> <b>${t('Get coins')} →</b></button>
        </div>
      </section>
      <section class="card lobby-setup">
        <div class="setup-head phone-only">
          <button class="hud-btn setup-back">${t('← Back')}</button>
          <h2 class="card-title">${t('Match setup')}</h2>
          <button class="big-btn play setup-play">${t('Play')} ▶</button>
        </div>
        <h2 class="card-title setup-title">${t('Match setup')}</h2>
        <div class="players-row">
          <label>${t('Players')}
            <select name="players">${PLAYER_COUNTS.map((n) => `<option value="${n}">${n}</option>`).join('')}</select>
          </label>
          <label>${t('CPU skill')}
            <select name="cpuSkill">${CPU_SKILLS.map((k) => `<option value="${k.id}">${t(k.name)}</option>`).join('')}</select>
          </label>
        </div>
        <div class="slots"></div>
        <p class="players-hint">${t('Tap a team to switch Human / CPU · the colour dot to change its colour · ✎ to edit. Humans share this device and take turns.')}</p>
        <div class="style-row">
          <label>${t('Game style')}
            <select name="style">${styleOptions}<option value="custom">${t('Custom')}</option></select>
          </label>
          <button class="hud-btn customise">${t('Customise')}</button>
        </div>
        <p class="style-blurb"></p>
        <div class="custom-panel hidden"></div>
      </section>
      <section class="card lobby-play">
        <div class="menu-buttons">
          <button class="big-btn play">${t('Play')}<span class="play-sum phone-only" aria-hidden="true"></span></button>
          <div class="menu-row">
            <button class="big-btn secondary online-btn">${t('Play online')}</button>
            <button class="big-btn secondary setup-btn phone-only">${t('Match setup')}</button>
          </div>
        </div>
        <div class="lobby-learn">
          <button class="hud-btn learn-btn">🎓 ${t('Tutorial')}</button>
          <button class="hud-btn practice-btn">🎯 ${t('Practice')}</button>
          <button class="hud-btn challenge-btn">🏆 ${t('Daily challenge')}</button>
          <button class="hud-btn replays-btn">🎬 ${t('Replays')}</button>
          <button class="hud-btn mapeditor-btn">🗺️ ${t('Map editor')}</button>
          <button class="hud-btn guide-btn">📖 ${t('Guide')}</button>
          <button class="hud-btn controls-btn">⚙️ ${t('Controls')}</button>
        </div>
      </section>
      <aside class="card dash hidden" aria-label="${t('Your career')}"></aside>
      <nav class="lobby-nav phone-only" aria-label="${t('Menu')}"></nav>`;
  // Phones: the lobby is screens you tap through (home, match setup) instead of one long page.
  root.dataset.view = 'home';
  const show = (view: 'home' | 'setup') => {
    root.dataset.view = view;
    root.scrollTop = 0;
  };

  const styleSel = root.querySelector<HTMLSelectElement>('select[name=style]')!;
  const blurb = root.querySelector<HTMLParagraphElement>('.style-blurb')!;
  const panel = root.querySelector<HTMLDivElement>('.custom-panel')!;
  const customiseBtn = root.querySelector<HTMLButtonElement>('.customise')!;
  let custom: Scheme = { ...saved.custom };
  let players = [...saved.players];
  const countSel = root.querySelector<HTMLSelectElement>('select[name=players]')!;
  const slots = root.querySelector<HTMLDivElement>('.slots')!;

  let profiles = loadProfiles();
  const renderSlots = () => {
    keepPlaceAfter(root);
    slots.innerHTML = '';
    players.forEach((cpu, i) => {
      const p = profiles[i];
      const slot = document.createElement('div');
      slot.className = 'slot' + (cpu ? ' cpu' : '');
      slot.style.setProperty('--team', hex(shown(p.color)));
      // Main area toggles Human/CPU; the pencil opens the team editor.
      const toggle = document.createElement('button');
      toggle.className = 'slot-main';
      toggle.setAttribute('aria-label', cpu ? t('{name}: CPU (tap to switch)', { name: p.name }) : t('{name}: Human (tap to switch)', { name: p.name }));
      const pic = document.createElement('span');
      pic.className = 'slot-pic';
      pic.innerHTML = mascotSvg(shown(p.color), wearHat(p.hat), wearSkin(p.skin));
      const name = document.createElement('span');
      name.className = 'slot-name';
      name.textContent = teamSymbol(p.color) + p.name; // player-entered text: never innerHTML
      const kind = document.createElement('span');
      kind.className = 'slot-kind';
      kind.textContent = cpu ? `🤖 ${t('CPU')}` : `👤 ${t('Human')}`;
      const badge = document.createElement('span');
      badge.className = 'team-emblem';
      badge.innerHTML = emblemSvg(p.emblem, t('{name} emblem', { name: p.name }));
      toggle.append(pic, badge, name, kind);
      toggle.onclick = () => {
        players[i] = !players[i];
        renderSlots();
        persist();
      };
      // Colour dot: one tap steps to the next colour (a team that had it gets this one's).
      const colourBtn = document.createElement('button');
      colourBtn.className = 'slot-colour';
      colourBtn.title = t('Change colour');
      colourBtn.setAttribute('aria-label', t("Change {name}'s colour", { name: p.name }));
      colourBtn.onclick = () => {
        profiles = updateProfile(profiles, i, { ...p, color: nextColor(p.color) });
        saveProfiles(profiles);
        renderSlots();
        renderHero();
      };
      const editBtn = document.createElement('button');
      editBtn.className = 'slot-edit';
      editBtn.textContent = '✎';
      editBtn.setAttribute('aria-label', t('Edit {name}', { name: p.name }));
      editBtn.onclick = () =>
        openTeamEditor(overlayHost(root), i, p, (next) => {
          profiles = updateProfile(profiles, i, next);
          saveProfiles(profiles);
          renderSlots();
          renderHero();
        });
      slot.append(toggle, colourBtn, editBtn);
      slots.append(slot);
    });
  };
  const skillSel = root.querySelector<HTMLSelectElement>('select[name=cpuSkill]')!;
  skillSel.value = saved.cpuSkill;
  skillSel.onchange = () => persist();
  const playSum = root.querySelector<HTMLElement>('.play-sum')!;
  const persist = () => {
    save({ style: styleSel.value, custom, players, cpuSkill: skillSel.value as CpuSkill });
    // Phones: what PLAY will start, under the button.
    const humans = players.filter((cpu) => !cpu).length;
    const preset = SCHEME_PRESETS.find((p) => p.id === styleSel.value);
    const style = styleSel.value === 'custom' ? t('Custom rules') : preset ? t(preset.name) : '';
    const who =
      humans === players.length
        ? t('{n} players', { n: humans })
        : humans === 1
          ? t('vs {n} CPU', { n: players.length - 1 })
          : t('{n} teams', { n: players.length });
    playSum.textContent = `${who} · ${style}`;
  };
  countSel.value = String(PLAYER_COUNTS.includes(players.length) ? players.length : 2);
  if (players.length !== Number(countSel.value)) players = players.slice(0, Number(countSel.value));
  countSel.onchange = () => {
    const n = Number(countSel.value);
    // Keep existing choices; new slots default to CPU.
    players = Array.from({ length: n }, (_, i) => players[i] ?? true);
    renderSlots();
    persist();
  };
  renderSlots();

  const current = (): Scheme => (styleSel.value === 'custom' ? { ...custom } : presetScheme(styleSel.value));

  const renderPanel = () => {
    const sc = current();
    keepPlaceAfter(root);
    panel.innerHTML = '';
    for (const base of FIELDS) {
      const label = document.createElement('label');
      label.textContent = t(base.label);
      if (base.hint) label.title = t(base.hint);
      const sel = document.createElement('select');
      // The Map list also has the maps made in the map editor (the map itself goes in customMap).
      const mine = base.key === 'mapStyle' ? myMaps() : [];
      if (sc.customMap && base.key === 'mapStyle' && !mine.some((m) => m.map === sc.customMap)) mine.push({ name: t('Your map'), map: sc.customMap, at: 0 });
      const f: Field = mine.length ? { ...base, options: [...base.options, ...mine.map((m): [string, string] => [`🗺️ ${m.name}`, `my:${m.name}`])] } : base;
      const value = base.key === 'mapStyle' && sc.customMap ? `my:${mine.find((m) => m.map === sc.customMap)!.name}` : sc[f.key];
      // Show the nearest option if a preset uses a value not in the list.
      let best = 0;
      f.options.forEach(([text, v], i) => {
        const o = document.createElement('option');
        o.textContent = t(text);
        o.value = String(i);
        sel.append(o);
        if (typeof v === 'number' && typeof value === 'number') {
          if (Math.abs(v - value) < Math.abs((f.options[best][1] as number) - value)) best = i;
        } else if (v === value) best = i;
      });
      sel.value = String(best);
      sel.onchange = () => {
        // Editing any field switches to Custom, starting from what was shown.
        const v = f.options[Number(sel.value)][1];
        const my = typeof v === 'string' && v.startsWith('my:') ? mine.find((m) => `my:${m.name}` === v) : undefined;
        custom = base.key === 'mapStyle' ? { ...current(), mapStyle: my ? undefined : (v as string), customMap: my?.map } : { ...current(), [f.key]: v };
        styleSel.value = 'custom';
        refresh(false);
      };
      label.append(sel);
      panel.append(label);
    }
    if (sc.weapons) {
      const note = document.createElement('p');
      note.className = 'custom-note';
      note.textContent = t('This style limits the weapons available.');
      panel.append(note);
    }
  };

  const refresh = (rebuild = true) => {
    const id = styleSel.value;
    // Friendly fire surprises new players: always say whether it's on.
    const ff = current().friendlyFire
      ? t('Friendly fire on: your own blasts can hurt your team, and you.')
      : t('Friendly fire off: your blasts only hurt the other teams.');
    const presetBlurb = SCHEME_PRESETS.find((p) => p.id === id)?.blurb;
    blurb.textContent = (id === 'custom' ? t('Your own rules: change anything below.') : presetBlurb ? t(presetBlurb) : '') + ' ' + ff;
    if (rebuild || !panel.classList.contains('hidden')) renderPanel();
    persist();
  };

  styleSel.value = saved.style;
  if (!styleSel.value) styleSel.value = 'standard';
  styleSel.onchange = () => refresh();
  customiseBtn.onclick = () => {
    panel.classList.toggle('hidden');
    root.classList.toggle('rules-open', !panel.classList.contains('hidden'));
    customiseBtn.textContent = panel.classList.contains('hidden') ? t('Customise') : t('Done');
  };
  refresh();

  const mascot = root.querySelector<HTMLElement>('.mascot')!;
  // Easter egg: the lobby tardigrade is ticklish (ten pokes and it flips).
  let tickles = 0;
  mascot.onclick = () => {
    if (++tickles < 10) return;
    tickles = 0;
    mascot.classList.remove('flip');
    void mascot.offsetWidth; // restart the animation
    mascot.classList.add('flip');
    findEgg('tickle');
  };
  const heroTeam = root.querySelector<HTMLElement>('.hero-team')!;
  const renderHero = () => {
    const p = profiles[0];
    mascot.innerHTML = mascotSvg(shown(p.color), wearHat(p.hat), wearSkin(p.skin));
    heroTeam.textContent = t('Your team: {name}', { name: p.name }); // player-entered text: never innerHTML
    heroTeam.style.setProperty('--team', hex(shown(p.color)));
  };
  root.querySelector<HTMLButtonElement>('.hero-edit')!.onclick = () =>
    openTeamEditor(overlayHost(root), 0, profiles[0], (next) => {
      profiles = updateProfile(profiles, 0, next);
      saveProfiles(profiles);
      renderSlots();
      renderHero();
    });
  // Looks (world, music, sounds) right on the lobby, not only in the Shop.
  const looksNow = root.querySelector<HTMLElement>('.looks-now')!;
  const renderLooks = () => (looksNow.textContent = arenaLabel());
  // A seasonal event on now (render/seasons.ts): say so, with its free world.
  const season = currentSeason();
  if (season) {
    const p = root.querySelector<HTMLElement>('.hero-season')!;
    p.hidden = false;
    // The end date in the player's language (English keeps its own short form).
    const ends = lang() === 'en' ? seasonEnds(season) : new Date(2000, season.to[0] - 1, season.to[1]).toLocaleDateString(lang(), { day: 'numeric', month: 'short' });
    p.textContent = `${season.emoji} ${t('{season}! The {world} world is free until {date}.', { season: t(season.name), world: t(arenaTheme(season.arena).name), date: ends })}`;
  }
  const looks = () => openLooks(overlayHost(root), () => go('shop'), renderLooks, onCoins);
  root.querySelector<HTMLButtonElement>('.hero-looks')!.onclick = looks;
  const nav = root.querySelector<HTMLElement>('.lobby-nav')!;
  const renderNav = () => {
    const { me } = account();
    nav.innerHTML = '';
    const tile = (tab: HubTab, icon: string, label: string, extra = '') => {
      const b = document.createElement('button');
      b.className = 'nav-tile';
      b.dataset.go = tab;
      const i = document.createElement('span');
      i.className = 'nav-icon';
      i.textContent = icon;
      const l = document.createElement('span');
      l.className = 'nav-label';
      l.textContent = label; // may be the player's name: never innerHTML
      b.append(i, l);
      if (extra) {
        const x = document.createElement('span');
        x.className = 'nav-extra';
        x.textContent = extra;
        b.append(x);
      }
      b.onclick = () => go(tab);
      nav.append(b);
    };
    // Coins first and in gold, where they can be bought here.
    if (me?.shop) {
      tile('shop', '🪙', t('Get coins'));
      const coins = nav.lastElementChild as HTMLButtonElement;
      coins.classList.add('nav-coins');
      coins.onclick = onCoins;
    }
    if (me) {
      tile('stats', '📊', t('Stats'));
      tile('shop', '🛍️', t('Shop'), me.user ? `🪙 ${me.wallet.coins} · 🟢 ${me.wallet.slime}` : '');
      tile('account', '👤', me.user ? me.user.name : t('Sign in'));
    }
    tile('settings', '⚙️', t('Settings'));
  };
  const dash = root.querySelector<HTMLElement>('.dash')!;
  const refreshAccountBits = () => {
    // Hats may have been bought or lost (signed out), or changed in the shop: redraw the team pictures.
    profiles = loadProfiles();
    renderSlots();
    renderHero();
    renderLooks();
    renderDashboard(dash, go);
    root.classList.toggle('solo', !account().me);
    // Get coins: only where coins can be bought (the server's shop is on, and this app or browser can pay).
    const shop = account().me?.shop === true;
    for (const b of root.querySelectorAll<HTMLButtonElement>('.hero-coins, .hero-coins-banner')) {
      b.hidden = !shop;
      b.onclick = onCoins;
    }
    renderNav();
  };
  refreshAccountBits();

  const learnBtn = root.querySelector<HTMLButtonElement>('.learn-btn')!;
  learnBtn.onclick = onTutorial;
  // Never tried the tutorial on this device: point it out.
  if (!tutorialSeen()) {
    learnBtn.textContent = `🎓 ${t('New? Learn to play')}`;
    learnBtn.classList.add('learn-new');
  }
  root.querySelector<HTMLButtonElement>('.controls-btn')!.onclick = () => go('settings');
  root.querySelector<HTMLButtonElement>('.practice-btn')!.onclick = onPractice;
  root.querySelector<HTMLButtonElement>('.challenge-btn')!.onclick = onChallenge;
  root.querySelector<HTMLButtonElement>('.replays-btn')!.onclick = onReplays;
  root.querySelector<HTMLButtonElement>('.mapeditor-btn')!.onclick = onMapEditor;
  root.querySelector<HTMLButtonElement>('.guide-btn')!.onclick = () => go('guide');
  const onlineBtn = root.querySelector<HTMLButtonElement>('.online-btn')!;
  if (onOnline) onlineBtn.onclick = onOnline;
  else onlineBtn.remove();

  root.querySelector<HTMLButtonElement>('.setup-btn')!.onclick = () => show('setup');
  root.querySelector<HTMLButtonElement>('.setup-back')!.onclick = () => show('home');
  const play = () =>
    onStart({
      players: [...players],
      teams: profiles.slice(0, players.length),
      scheme: current(),
      seed: (Math.random() * 1e9) | 0,
      cpuSkill: skillSel.value as CpuSkill,
    });
  for (const b of root.querySelectorAll<HTMLButtonElement>('.play')) b.onclick = play;
  return {
    el: root,
    refresh: refreshAccountBits,
    back: () => {
      if (root.dataset.view === 'home') return false;
      show('home');
      return true;
    },
    looks,
  };
}

