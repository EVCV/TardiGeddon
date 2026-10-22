// The map editor: start from a blank shore or a generated map, paint land
// and rub it out, then save it on the device, save it as a file to send to
// a friend, or play on it. Maps are kept as terrain/custom.ts strings, which
// a match's rules can carry (online too: the server checks them).
// Its own download (main.ts loads it when opened).

import { createTerrain, type Terrain } from '../sim/terrain/terrain';
import { MAP_STYLES, generateMap, type MapStyle } from '../sim/terrain/generate';
import { CUSTOM_MAX_LENGTH, decodeCustomMap, encodeCustomMap } from '../sim/terrain/custom';
import { nameProblem, NAME_PROBLEM_TEXT } from '../names';
import { cleanName } from './teams';
import { deleteMyMap, looksLikeMyMap, myMaps, saveMyMap, type MyMap } from './myMaps';
import { t } from '../i18n/i18n';

const W = 2000;
const H = 1000;
/** Where the water starts (as in sim/world createWorld). */
const WATER = H - 70;
const SKY = [191, 232, 255];
const LAND = [156, 100, 56];
const GRASS = [90, 168, 58];
const SEA = [47, 134, 214];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** A plain shore to start from: flat land just above the water, with sloping ends. */
function blankShore(): Terrain {
  const shore = createTerrain(W, H);
  for (let x = 160; x < W - 160; x++) {
    const top = WATER - 120;
    for (let y = top; y < H; y++) shore.mask[y * W + x] = 1;
  }
  return shore;
}

export function openMapEditor(host: HTMLElement, opts: { start?: MyMap; onPlay: (map: string) => void; onClose: () => void }): void {
  let terrain: Terrain = (opts.start && decodeCustomMap(opts.start.map)) || blankShore();
  let name = opts.start?.name ?? '';
  let erase = false;
  let size = 18;
  const undo: Uint8Array[] = [];

  const overlay = el('div', 'map-editor');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', t('Map editor'));
  const bar = el('div', 'map-editor-bar');
  const canvas = el('canvas', 'map-editor-canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.setAttribute('aria-label', t('The map: drag to paint land, or rub it out'));
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const note = el('p', 'map-editor-note');
  note.setAttribute('role', 'status');

  /** Recolour a box of the picture from the land mask. */
  const paint = (x0 = 0, y0 = 0, x1 = W, y1 = H) => {
    x0 = Math.max(0, Math.floor(x0));
    y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(W, Math.ceil(x1));
    y1 = Math.min(H, Math.ceil(y1));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * W + x;
        const land = terrain.mask[i] === 1;
        // A grass edge where land meets air above.
        const top = land && (y === 0 || terrain.mask[i - W] === 0 || (y > 2 && terrain.mask[i - 3 * W] === 0));
        const c = land ? (top ? GRASS : LAND) : y >= WATER ? SEA : SKY;
        const k = i * 4;
        img.data[k] = c[0];
        img.data[k + 1] = c[1];
        img.data[k + 2] = c[2];
        img.data[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0, x0, y0, x1 - x0, y1 - y0);
  };

  // Brush stamps only change the land; the picture catches up once per frame,
  // over the whole box they touched. (Redrawing after every stamp was slow
  // with the small brushes, which stamp every few pixels along a stroke.)
  let dirty: { x0: number; y0: number; x1: number; y1: number } | null = null;
  let frame = 0;
  const flush = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    if (dirty) paint(dirty.x0, dirty.y0, dirty.x1, dirty.y1);
    dirty = null;
  };
  const brush = (cx: number, cy: number) => {
    const r = size;
    for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(H, cy + r); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(W, cx + r); x++) {
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) terrain.mask[y * W + x] = erase ? 0 : 1;
      }
    }
    // The grass edge looks a few pixels below changed land: repaint a margin round it.
    const x0 = cx - r - 4;
    const y0 = cy - r - 4;
    const x1 = cx + r + 4;
    const y1 = cy + r + 4;
    dirty = dirty
      ? { x0: Math.min(dirty.x0, x0), y0: Math.min(dirty.y0, y0), x1: Math.max(dirty.x1, x1), y1: Math.max(dirty.y1, y1) }
      : { x0, y0, x1, y1 };
    frame ||= requestAnimationFrame(flush);
  };

  // Drawing: a stroke from each pointer move to the next, so fast strokes don't leave gaps.
  let last: { x: number; y: number } | null = null;
  const at = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  canvas.onpointerdown = (e) => {
    canvas.setPointerCapture(e.pointerId);
    undo.push(terrain.mask.slice());
    if (undo.length > 15) undo.shift();
    last = at(e);
    brush(last.x, last.y);
  };
  canvas.onpointermove = (e) => {
    if (!last) return;
    const p = at(e);
    const steps = Math.max(1, Math.ceil(Math.hypot(p.x - last.x, p.y - last.y) / (size / 2)));
    for (let i = 1; i <= steps; i++) brush(last.x + ((p.x - last.x) * i) / steps, last.y + ((p.y - last.y) * i) / steps);
    last = p;
  };
  canvas.onpointerup = canvas.onpointercancel = () => {
    last = null;
    flush();
  };

  const button = (text: string, label: string, fn: () => void, cls = 'hud-btn') => {
    const b = el('button', cls, text);
    b.setAttribute('aria-label', label);
    b.title = label;
    b.onclick = fn;
    return b;
  };
  const toggleGroup = <T,>(items: [string, string, T][], current: () => T, set: (v: T) => void) => {
    const g = el('div', 'seg');
    const buttons = items.map(([text, label, v]) => {
      const b = button(text, label, () => {
        set(v);
        for (const [i, x] of buttons.entries()) x.classList.toggle('on', items[i][2] === current());
      }, 'seg-btn');
      b.classList.toggle('on', v === current());
      return b;
    });
    g.append(...buttons);
    return g;
  };

  const tools = toggleGroup<boolean>([[t('✏️ Land'), t('Paint land'), false], [t('🧽 Rub out'), t('Rub out land'), true]], () => erase, (v) => (erase = v));
  const sizes = toggleGroup<number>([[t('S'), t('Small brush'), 8], [t('M'), t('Medium brush'), 18], [t('L'), t('Large brush'), 40]], () => size, (v) => (size = v));
  const startFrom = el('select');
  startFrom.setAttribute('aria-label', t('Start from'));
  const fillStartFrom = () => {
    startFrom.replaceChildren(new Option(t('Start from…'), ''), new Option(t('A blank shore'), 'blank'), ...MAP_STYLES.map((m) => new Option(t('{map} (new each time)', { map: t(m.name) }), m.id)));
    for (const m of myMaps()) startFrom.append(new Option(`🗺️ ${m.name}`, `my:${m.name}`));
    startFrom.append(new Option(t('📂 A map file…'), 'file'));
  };
  fillStartFrom();
  const file = el('input');
  file.type = 'file';
  file.accept = '.json,application/json';
  file.hidden = true;
  /** Swap in another map (undoable). */
  const load = (next: Terrain, newName?: string) => {
    undo.push(terrain.mask.slice());
    if (next.w !== W || next.h !== H) {
      // Maps from elsewhere may be another size: copy what fits, from the bottom.
      const fit = createTerrain(W, H);
      for (let y = 0; y < Math.min(H, next.h); y++) {
        for (let x = 0; x < Math.min(W, next.w); x++) fit.mask[(H - 1 - y) * W + x] = next.mask[(next.h - 1 - y) * next.w + x];
      }
      next = fit;
    }
    terrain.mask.set(next.mask);
    if (newName !== undefined) name = nameInput.value = newName;
    paint();
  };
  file.onchange = async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    try {
      if (f.size > 200_000) throw new Error('too big');
      const m = JSON.parse(await f.text()) as unknown;
      const land = looksLikeMyMap(m) && decodeCustomMap(m.map);
      if (!land) throw new Error('not a map');
      load(land, (m as MyMap).name);
      note.textContent = t('Opened “{name}”. Save it to keep it on this device.', { name: (m as MyMap).name });
    } catch {
      note.textContent = t('That file isn’t a TardiGeddon map.');
    }
  };
  startFrom.onchange = () => {
    const v = startFrom.value;
    startFrom.value = '';
    if (!v) return;
    if (v === 'file') return file.click();
    if (v.startsWith('my:')) {
      const m = myMaps().find((x) => x.name === v.slice(3));
      const land = m && decodeCustomMap(m.map);
      if (land) load(land, m.name);
      return;
    }
    load(v === 'blank' ? blankShore() : generateMap({ w: W, h: H, waterY: WATER, seed: (Math.random() * 1e9) | 0, style: v as MapStyle }));
  };
  const nameInput = el('input', 'map-editor-name');
  nameInput.placeholder = t('Map name');
  nameInput.maxLength = 24;
  nameInput.value = name;
  nameInput.setAttribute('aria-label', t('Map name'));
  nameInput.oninput = () => (name = nameInput.value);

  /** The map's name, checked like team names; null (with a note) if it won't do. */
  const checkedName = (): string | null => {
    const n = cleanName(name, 24) || t('My map');
    const problem = nameProblem(n);
    if (problem) {
      note.textContent = t('“{name}”: {problem}', { name: n, problem: t(NAME_PROBLEM_TEXT[problem]) });
      return null;
    }
    return n;
  };
  /** Enough land above the water for a match? */
  const playable = (): boolean => {
    let land = 0;
    for (let x = 0; x < W; x += 10) {
      for (let y = 0; y < WATER - 30; y++) {
        if (terrain.mask[y * W + x]) {
          land++;
          break;
        }
      }
    }
    if (land < 20) {
      note.textContent = t('Draw more land above the water first: tardigrades need somewhere to stand.');
      return false;
    }
    if (encodeCustomMap(terrain).length > CUSTOM_MAX_LENGTH) {
      note.textContent = t('This map is too detailed to share: smooth out some of the little bits (a big brush helps).');
      return false;
    }
    return true;
  };

  const close = () => {
    overlay.remove();
    opts.onClose();
  };
  bar.append(
    button(t('← Back'), t('Leave the map editor'), close),
    tools,
    sizes,
    button('↩', t('Undo'), () => {
      const m = undo.pop();
      if (!m) return;
      terrain.mask.set(m);
      paint();
    }),
    startFrom,
    nameInput,
    button(t('💾 Save'), t('Save on this device'), () => {
      const n = checkedName();
      if (!n || !playable()) return;
      if (!saveMyMap({ name: n, map: encodeCustomMap(terrain), at: Date.now() })) {
        note.textContent = t('This device is out of room: delete a map you don’t need, or save this one as a file.');
        return;
      }
      fillStartFrom();
      note.textContent = t('Saved “{name}”. Pick it in Match setup → Customise → Map, or host it in an online room.', { name: n });
    }),
    button('🗑', t('Delete this map from this device'), () => {
      const n = cleanName(name, 24);
      if (!myMaps().some((m) => m.name === n)) {
        note.textContent = t('This map isn’t saved on this device.');
        return;
      }
      if (!confirm(t('Delete “{name}” from this device?', { name: n }))) return;
      deleteMyMap(n);
      fillStartFrom();
      note.textContent = t('Deleted “{name}”.', { name: n });
    }),
    button('⤓', t('Save as a file (to send to a friend)'), () => {
      const n = checkedName();
      if (!n || !playable()) return;
      const blob = new Blob([JSON.stringify({ name: n, map: encodeCustomMap(terrain), at: Date.now() })], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `tardigeddon-map-${n.replace(/[^A-Za-z0-9]+/g, '-')}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }),
    button(t('▶ Play'), t('Play on this map against the computer'), () => {
      if (!playable()) return;
      // Keep the work: a map you played is saved too (if it has a good name).
      const n = name.trim() ? checkedName() : null;
      if (n) saveMyMap({ name: n, map: encodeCustomMap(terrain), at: Date.now() });
      overlay.remove();
      opts.onPlay(encodeCustomMap(terrain));
    }, 'big-btn'),
  );
  const stage = el('div', 'map-editor-stage');
  stage.append(canvas);
  overlay.append(bar, stage, note, file);
  host.append(overlay);
  paint();
  note.textContent = t('Drag to paint land (or rub it out). The blue at the bottom is water.');
}
