// Title screen and match setup: game style presets plus a Customise panel.

import { MASCOT_SVG } from './mascot';
import { SCHEME_PRESETS, presetScheme } from '../sim/schemes';
import { DEFAULT_SCHEME, type Scheme } from '../sim/types';

export interface MatchSetup {
  mode: 'cpu' | 'hotseat';
  scheme: Scheme;
  seed: number;
}

const STORE_KEY = 'tardigeddon.menu';

interface Saved {
  style: string;
  custom: Scheme;
}

// Per-device convenience only: storage can be missing or blocked.
function load(): Saved {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Saved;
      return { style: v.style ?? 'standard', custom: { ...DEFAULT_SCHEME, ...v.custom } };
    }
  } catch {
    /* ignore */
  }
  return { style: 'standard', custom: { ...DEFAULT_SCHEME } };
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
  { key: 'windMax', label: 'Wind', options: [['Off', 0], ['Light', 0.5], ['Normal', 1]] },
  { key: 'fallDamage', label: 'Fall damage', options: [['On', true], ['Off', false]] },
  { key: 'movement', label: 'Walking', options: [['On', true], ['Off (Artillery)', false]] },
];

export function showMenu(root: HTMLElement, onStart: (s: MatchSetup) => void): void {
  const saved = load();
  const styleOptions = SCHEME_PRESETS.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
  root.innerHTML = `
    <div class="menu">
      <div class="menu-card">
        <div class="mascot">${MASCOT_SVG}</div>
        <h1 class="title">Tardi<span>Geddon</span></h1>
        <p class="tagline">Tiny. Indestructible. Armed.</p>
        <div class="menu-buttons">
          <button class="big-btn" data-mode="cpu">Play vs CPU</button>
          <button class="big-btn secondary" data-mode="hotseat">2 Players (same device)</button>
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
    save({ style: id, custom });
  };

  styleSel.value = saved.style;
  if (!styleSel.value) styleSel.value = 'standard';
  styleSel.onchange = () => refresh();
  customiseBtn.onclick = () => {
    panel.classList.toggle('hidden');
    customiseBtn.textContent = panel.classList.contains('hidden') ? 'Customise' : 'Done';
  };
  refresh();

  for (const b of root.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
    b.onclick = () => {
      onStart({ mode: b.dataset.mode as MatchSetup['mode'], scheme: current(), seed: (Math.random() * 1e9) | 0 });
    };
  }
}
