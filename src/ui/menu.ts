// The Lobby page of the menu hub (ui/hub.ts): a hero card with your team,
// match setup (teams, CPU skill, game style plus a Customise panel), the
// Play buttons and the career panel.

import { mascotSvg } from './mascot';
import { CPU_SKILLS, type CpuSkill } from '../ai/cpu';
import { SCHEME_PRESETS, presetScheme } from '../sim/schemes';
import { DEFAULT_SCHEME, type Scheme } from '../sim/types';
import { MAX_TEAMS } from '../sim/world';
import { MAP_STYLES } from '../sim/terrain/generate';
import { hex } from '../render/palette';
import { loadProfiles, saveProfiles, updateProfile, type TeamProfile } from './teams';
import { openTeamEditor } from './teamEditor';
import { renderDashboard } from './dashboard';
import { account, wearHat, wearSkin } from '../account/session';
import type { HubTab } from './hub';
import { tutorialSeen } from './tutorial';

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
  { key: 'tardisPerTeam', label: 'Tardigrades per team', options: [['2', 2], ['3', 3], ['4', 4]] },
  { key: 'turnTime', label: 'Turn time', options: [['20s', 20], ['30s', 30], ['45s', 45], ['60s', 60], ['90s', 90]] },
  { key: 'roundTime', label: 'Sudden death after', options: [['3 min', 3], ['5 min', 5], ['10 min', 10], ['15 min', 15], ['20 min', 20]] },
  { key: 'startHp', label: 'Starting health', options: [['50', 50], ['60', 60], ['100', 100], ['150', 150], ['200', 200]] },
  { key: 'mines', label: 'Mines', options: [['None', 0], ['Few', 4], ['Normal', 8], ['Lots', 16]] },
  { key: 'drums', label: 'Brine drums', options: [['None', 0], ['Few', 3], ['Lots', 8]] },
  { key: 'crateChance', label: 'Crates', options: [['Off', 0], ['Rare', 0.25], ['Normal', 0.5], ['Every turn', 1]] },
  { key: 'supers', label: 'Superweapons', options: [['Crates only', 0], ['1 each', 1]] },
  { key: 'windMax', label: 'Wind', options: [['Off', 0], ['Light', 0.5], ['Normal', 1]] },
  { key: 'fallDamage', label: 'Fall damage', options: [['On', true], ['Off', false]] },
  {
    key: 'friendlyFire',
    label: 'Friendly fire',
    options: [['On', true], ['Off', false]],
    hint: 'On: your own weapons can hurt your own team, and you. Off: they only hurt the other teams.',
  },
  { key: 'movement', label: 'Walking', options: [['On', true], ['Off (Artillery)', false]] },
  {
    key: 'mapStyle',
    label: 'Map',
    options: [['Surprise me', 'random'], ...MAP_STYLES.map((m): [string, string] => [m.name, m.id])],
    hint: 'What kind of land you fight on. Surprise me picks a different one every match.',
  },
  {
    key: 'armour',
    label: 'Armour',
    options: [['None', 0], ['Light', 25], ['Heavy', 50]],
    hint: 'Armour plates soak up half of each hit until they are used up.',
  },
  {
    key: 'weather',
    label: 'Weather',
    options: [['On', true], ['Off', false]],
    hint: 'Rain, snow, sunshine and fog. Very rarely, a tornado throws every tardigrade somewhere new.',
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
}

export function buildLobby(
  onStart: (s: MatchSetup) => void,
  onOnline: (() => void) | undefined,
  go: (tab: HubTab) => void,
  onTutorial: () => void,
  onPractice: () => void,
): Lobby {
  const root = document.createElement('div');
  const saved = load();
  const styleOptions = SCHEME_PRESETS.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
  root.className = 'page lobby';
  root.innerHTML = `
      <section class="card lobby-hero">
        <div class="hero-art">
          <div class="mascot"></div>
          <button class="chip hero-edit">✎ Customise team</button>
        </div>
        <div class="hero-text">
          <h1 class="title">Tardi<span>Geddon</span></h1>
          <p class="tagline">Tiny. Indestructible. Armed.</p>
          <p class="hero-team"></p>
        </div>
      </section>
      <section class="card lobby-setup">
        <div class="setup-head phone-only">
          <button class="hud-btn setup-back">← Back</button>
          <h2 class="card-title">Match setup</h2>
          <button class="big-btn play setup-play">Play ▶</button>
        </div>
        <h2 class="card-title setup-title">Match setup</h2>
        <div class="players-row">
          <label>Players
            <select name="players">${PLAYER_COUNTS.map((n) => `<option value="${n}">${n}</option>`).join('')}</select>
          </label>
          <label>CPU skill
            <select name="cpuSkill">${CPU_SKILLS.map((k) => `<option value="${k.id}">${k.name}</option>`).join('')}</select>
          </label>
        </div>
        <div class="slots"></div>
        <p class="players-hint">Tap a team to switch Human / CPU · ✎ to edit. Humans share this device and take turns.</p>
        <div class="style-row">
          <label>Game style
            <select name="style">${styleOptions}<option value="custom">Custom</option></select>
          </label>
          <button class="hud-btn customise">Customise</button>
        </div>
        <p class="style-blurb"></p>
        <div class="custom-panel hidden"></div>
      </section>
      <section class="card lobby-play">
        <div class="menu-buttons">
          <button class="big-btn play">Play<span class="play-sum phone-only" aria-hidden="true"></span></button>
          <div class="menu-row">
            <button class="big-btn secondary online-btn">Play online</button>
            <button class="big-btn secondary setup-btn phone-only">Match setup</button>
          </div>
        </div>
        <div class="lobby-learn">
          <button class="hud-btn learn-btn">🎓 Tutorial</button>
          <button class="hud-btn practice-btn">🎯 Practice</button>
          <button class="hud-btn guide-btn">📖 Guide</button>
          <button class="hud-btn controls-btn">⚙️ Controls</button>
        </div>
      </section>
      <aside class="card dash hidden" aria-label="Your career"></aside>
      <nav class="lobby-nav phone-only" aria-label="Menu"></nav>`;
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
    slots.innerHTML = '';
    players.forEach((cpu, i) => {
      const p = profiles[i];
      const slot = document.createElement('div');
      slot.className = 'slot' + (cpu ? ' cpu' : '');
      slot.style.setProperty('--team', hex(p.color));
      // Main area toggles Human/CPU; the pencil opens the team editor.
      const toggle = document.createElement('button');
      toggle.className = 'slot-main';
      toggle.setAttribute('aria-label', `${p.name}: ${cpu ? 'CPU' : 'Human'} (tap to switch)`);
      const pic = document.createElement('span');
      pic.className = 'slot-pic';
      pic.innerHTML = mascotSvg(p.color, wearHat(p.hat), wearSkin(p.skin));
      const name = document.createElement('span');
      name.className = 'slot-name';
      name.textContent = p.name; // player-entered text: never innerHTML
      const kind = document.createElement('span');
      kind.className = 'slot-kind';
      kind.textContent = cpu ? '🤖 CPU' : '👤 Human';
      toggle.append(pic, name, kind);
      toggle.onclick = () => {
        players[i] = !players[i];
        renderSlots();
        persist();
      };
      const editBtn = document.createElement('button');
      editBtn.className = 'slot-edit';
      editBtn.textContent = '✎';
      editBtn.setAttribute('aria-label', `Edit ${p.name}`);
      editBtn.onclick = () =>
        openTeamEditor(overlayHost(root), i, p, (next) => {
          profiles = updateProfile(profiles, i, next);
          saveProfiles(profiles);
          renderSlots();
          renderHero();
        });
      slot.append(toggle, editBtn);
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
    const style = styleSel.value === 'custom' ? 'Custom rules' : (SCHEME_PRESETS.find((p) => p.id === styleSel.value)?.name ?? '');
    playSum.textContent = `${humans === players.length ? `${humans} players` : humans === 1 ? `vs ${players.length - 1} CPU` : `${players.length} teams`} · ${style}`;
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
    panel.innerHTML = '';
    for (const f of FIELDS) {
      const label = document.createElement('label');
      label.textContent = f.label;
      if (f.hint) label.title = f.hint;
      const sel = document.createElement('select');
      const value = sc[f.key];
      // Show the nearest option if a preset uses a value not in the list.
      let best = 0;
      f.options.forEach(([text, v], i) => {
        const o = document.createElement('option');
        o.textContent = text;
        o.value = String(i);
        sel.append(o);
        if (typeof v === 'number' && typeof value === 'number') {
          if (Math.abs(v - value) < Math.abs((f.options[best][1] as number) - value)) best = i;
        } else if (v === value) best = i;
      });
      sel.value = String(best);
      sel.onchange = () => {
        // Editing any field switches to Custom, starting from what was shown.
        custom = { ...current(), [f.key]: f.options[Number(sel.value)][1] };
        styleSel.value = 'custom';
        refresh(false);
      };
      label.append(sel);
      panel.append(label);
    }
    if (sc.weapons) {
      const note = document.createElement('p');
      note.className = 'custom-note';
      note.textContent = 'This style limits the weapons available.';
      panel.append(note);
    }
  };

  const refresh = (rebuild = true) => {
    const id = styleSel.value;
    // Friendly fire surprises new players: always say whether it's on.
    const ff = current().friendlyFire
      ? ' Friendly fire on: your own blasts can hurt your team, and you.'
      : ' Friendly fire off: your blasts only hurt the other teams.';
    blurb.textContent =
      (id === 'custom' ? 'Your own rules: change anything below.' : (SCHEME_PRESETS.find((p) => p.id === id)?.blurb ?? '')) + ff;
    if (rebuild || !panel.classList.contains('hidden')) renderPanel();
    persist();
  };

  styleSel.value = saved.style;
  if (!styleSel.value) styleSel.value = 'standard';
  styleSel.onchange = () => refresh();
  customiseBtn.onclick = () => {
    panel.classList.toggle('hidden');
    root.classList.toggle('rules-open', !panel.classList.contains('hidden'));
    customiseBtn.textContent = panel.classList.contains('hidden') ? 'Customise' : 'Done';
  };
  refresh();

  const mascot = root.querySelector<HTMLElement>('.mascot')!;
  const heroTeam = root.querySelector<HTMLElement>('.hero-team')!;
  const renderHero = () => {
    const p = profiles[0];
    mascot.innerHTML = mascotSvg(p.color, wearHat(p.hat), wearSkin(p.skin));
    heroTeam.textContent = `Your team: ${p.name}`; // player-entered text: never innerHTML
    heroTeam.style.setProperty('--team', hex(p.color));
  };
  root.querySelector<HTMLButtonElement>('.hero-edit')!.onclick = () =>
    openTeamEditor(overlayHost(root), 0, profiles[0], (next) => {
      profiles = updateProfile(profiles, 0, next);
      saveProfiles(profiles);
      renderSlots();
      renderHero();
    });
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
    if (me) {
      tile('stats', '📊', 'Stats');
      tile('shop', '🛍️', 'Shop', me.user ? `🪙 ${me.wallet.coins} · 🟢 ${me.wallet.slime}` : '');
      tile('account', '👤', me.user ? me.user.name : 'Sign in');
    }
    tile('settings', '⚙️', 'Settings');
  };
  const dash = root.querySelector<HTMLElement>('.dash')!;
  const refreshAccountBits = () => {
    // Hats may have been bought or lost (signed out), or changed in the shop: redraw the team pictures.
    profiles = loadProfiles();
    renderSlots();
    renderHero();
    renderDashboard(dash, go);
    root.classList.toggle('solo', !account().me);
    renderNav();
  };
  refreshAccountBits();

  const learnBtn = root.querySelector<HTMLButtonElement>('.learn-btn')!;
  learnBtn.onclick = onTutorial;
  // Never tried the tutorial on this device: point it out.
  if (!tutorialSeen()) {
    learnBtn.textContent = '🎓 New? Learn to play';
    learnBtn.classList.add('learn-new');
  }
  root.querySelector<HTMLButtonElement>('.controls-btn')!.onclick = () => go('settings');
  root.querySelector<HTMLButtonElement>('.practice-btn')!.onclick = onPractice;
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
  };
}
