// Title screen and match setup: game style presets plus a Customise panel.

import { MASCOT_SVG, mascotSvg } from './mascot';
import { CPU_SKILLS, type CpuSkill } from '../ai/cpu';
import { SCHEME_PRESETS, presetScheme } from '../sim/schemes';
import { DEFAULT_SCHEME, type Scheme } from '../sim/types';
import { MAX_TEAMS } from '../sim/world';
import { hex } from '../render/palette';
import { loadProfiles, saveProfiles, updateProfile, type TeamProfile } from './teams';
import { openTeamEditor } from './teamEditor';
import { openAccount } from './account';
import { account, onAccountChange, wearHat } from '../account/session';

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
  options: [string, number | boolean][];
}

const FIELDS: Field[] = [
  { key: 'tardisPerTeam', label: 'Tardis per team', options: [['2', 2], ['3', 3], ['4', 4]] },
  { key: 'turnTime', label: 'Turn time', options: [['20s', 20], ['30s', 30], ['45s', 45], ['60s', 60], ['90s', 90]] },
  { key: 'roundTime', label: 'Sudden death after', options: [['3 min', 3], ['5 min', 5], ['10 min', 10], ['15 min', 15], ['20 min', 20]] },
  { key: 'startHp', label: 'Starting health', options: [['50', 50], ['60', 60], ['100', 100], ['150', 150], ['200', 200]] },
  { key: 'mines', label: 'Mines', options: [['None', 0], ['Few', 4], ['Normal', 8], ['Lots', 16]] },
  { key: 'drums', label: 'Brine drums', options: [['None', 0], ['Few', 3], ['Lots', 8]] },
  { key: 'crateChance', label: 'Crates', options: [['Off', 0], ['Rare', 0.25], ['Normal', 0.5], ['Every turn', 1]] },
  { key: 'supers', label: 'Superweapons', options: [['Crates only', 0], ['1 each', 1]] },
  { key: 'windMax', label: 'Wind', options: [['Off', 0], ['Light', 0.5], ['Normal', 1]] },
  { key: 'fallDamage', label: 'Fall damage', options: [['On', true], ['Off', false]] },
  { key: 'movement', label: 'Walking', options: [['On', true], ['Off (Artillery)', false]] },
];

/** The game style last chosen in the menu (used by the online lobby). */
export function savedScheme(): { style: string; custom: Scheme } {
  const v = load();
  return { style: v.style, custom: v.custom };
}

export function showMenu(root: HTMLElement, onStart: (s: MatchSetup) => void, onOnline?: () => void): void {
  const saved = load();
  const styleOptions = SCHEME_PRESETS.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
  root.innerHTML = `
    <div class="menu">
      <div class="menu-card">
        <button class="hud-btn account-btn hidden">👤 Account</button>
        <div class="mascot">${MASCOT_SVG}</div>
        <h1 class="title">Tardi<span>Geddon</span></h1>
        <p class="tagline">Tiny. Indestructible. Armed.</p>
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
        <div class="menu-buttons">
          <button class="big-btn play">Play</button>
          <button class="big-btn secondary online-btn">Play online</button>
        </div>
        <div class="style-row">
          <label>Game style
            <select name="style">${styleOptions}<option value="custom">Custom</option></select>
          </label>
          <button class="hud-btn customise">Customise</button>
        </div>
        <p class="style-blurb"></p>
        <div class="custom-panel hidden"></div>
        <details class="controls-help">
          <summary>Controls</summary>
          <p><b>Keyboard:</b> ←/→ walk · ↑/↓ aim · Enter jump (twice = backflip) · hold Space to charge, release to fire ·
          1–5 fuse · Tab or right-click for weapons · click map to target · drag to look around · wheel to zoom</p>
          <p><b>Touch:</b> on-screen pads · tap map to target · drag to look · pinch to zoom</p>
        </details>
      </div>
    </div>`;

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
      pic.innerHTML = mascotSvg(p.color, wearHat(p.hat));
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
        openTeamEditor(root, i, p, (next) => {
          profiles = updateProfile(profiles, i, next);
          saveProfiles(profiles);
          renderSlots();
        });
      slot.append(toggle, editBtn);
      slots.append(slot);
    });
  };
  const skillSel = root.querySelector<HTMLSelectElement>('select[name=cpuSkill]')!;
  skillSel.value = saved.cpuSkill;
  skillSel.onchange = () => persist();
  const persist = () => save({ style: styleSel.value, custom, players, cpuSkill: skillSel.value as CpuSkill });
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
    blurb.textContent =
      id === 'custom' ? 'Your own rules: change anything below.' : (SCHEME_PRESETS.find((p) => p.id === id)?.blurb ?? '');
    if (rebuild || !panel.classList.contains('hidden')) renderPanel();
    persist();
  };

  styleSel.value = saved.style;
  if (!styleSel.value) styleSel.value = 'standard';
  styleSel.onchange = () => refresh();
  customiseBtn.onclick = () => {
    panel.classList.toggle('hidden');
    customiseBtn.textContent = panel.classList.contains('hidden') ? 'Customise' : 'Done';
  };
  refresh();

  const accountBtn = root.querySelector<HTMLButtonElement>('.account-btn')!;
  accountBtn.onclick = () => openAccount(root);
  const showAccount = () => {
    if (!accountBtn.isConnected) return off();
    const { me } = account();
    const user = me?.user;
    // Only shown when the server has accounts turned on (see docs/ACCOUNTS.md).
    accountBtn.classList.toggle('hidden', !me);
    accountBtn.textContent = user ? `👤 ${user.name}` : '👤 Sign in / Shop';
    // Hats may have been bought or lost (signed out): redraw the team pictures.
    renderSlots();
  };
  const off = onAccountChange(showAccount);
  showAccount();

  const onlineBtn = root.querySelector<HTMLButtonElement>('.online-btn')!;
  if (onOnline) onlineBtn.onclick = onOnline;
  else onlineBtn.remove();

  root.querySelector<HTMLButtonElement>('.play')!.onclick = () => {
    onStart({
      players: [...players],
      teams: profiles.slice(0, players.length),
      scheme: current(),
      seed: (Math.random() * 1e9) | 0,
      cpuSkill: skillSel.value as CpuSkill,
    });
  };
}
