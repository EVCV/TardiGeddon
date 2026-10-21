// Saved match replays (stats/matchReplay.ts), kept on this device: the last
// few matches, to watch again, save as a file to send to a friend, or open
// one a friend sent.

import type { MatchReplay } from '../stats/matchReplay';

const KEY = 'tardigeddon.replays';
/** How many recent matches are kept. */
export const KEEP = 8;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** The same check as stats/matchReplay isReplay, without loading the game to do it. */
function looksLikeReplay(v: unknown): v is MatchReplay {
  const r = v as MatchReplay;
  return !!r && typeof r === 'object' && r.v === 1 && typeof r.start === 'string' && Array.isArray(r.frames) && typeof r.title === 'string' && typeof r.summary === 'string' && typeof r.at === 'number' && typeof r.ticks === 'number';
}

export function savedReplays(): MatchReplay[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter(looksLikeReplay) : [];
  } catch {
    return [];
  }
}

function store(list: MatchReplay[]): void {
  // Big matches can be large: drop the oldest until it fits.
  for (let n = list.length; n > 0; n--) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list.slice(0, n)));
      return;
    } catch {
      /* too big for the device's storage: try with fewer */
    }
  }
}

export function keepReplay(r: MatchReplay): void {
  store([r, ...savedReplays()].slice(0, KEEP));
}

function forget(at: number): void {
  store(savedReplays().filter((r) => r.at !== at));
}

/** Save a replay as a file (to send to someone). */
function download(r: MatchReplay): void {
  const blob = new Blob([JSON.stringify(r)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tardigeddon-replay-${new Date(r.at).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** The list: watch, save as a file, delete, or open a file. */
export function openReplays(host: HTMLElement, onWatch: (r: MatchReplay) => void): void {
  const overlay = el('div', 'editor-overlay');
  const box = el('div', 'editor practice-choice replays');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Replays');
  const close = () => overlay.remove();
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };
  const list = el('div', 'replay-list');
  const note = el('p', 'account-note');
  note.setAttribute('role', 'status');
  const draw = () => {
    list.innerHTML = '';
    const all = savedReplays();
    if (!all.length) list.append(el('p', 'account-note', 'No replays yet: finish a match and it appears here.'));
    for (const r of all) {
      const row = el('div', 'replay-row');
      const info = el('div', 'replay-info');
      info.append(el('b', '', r.title), el('span', '', `${r.summary} · ${new Date(r.at).toLocaleString()} · ${Math.round(r.ticks / 50 / 60)} min`));
      const watch = el('button', 'hud-btn', '▶ Watch');
      watch.onclick = () => {
        close();
        onWatch(r);
      };
      const save = el('button', 'hud-btn', '💾');
      save.title = 'Save as a file';
      save.setAttribute('aria-label', `Save ${r.title} as a file`);
      save.onclick = () => download(r);
      const del = el('button', 'hud-btn', '🗑');
      del.title = 'Delete';
      del.setAttribute('aria-label', `Delete ${r.title}`);
      del.onclick = () => {
        forget(r.at);
        draw();
      };
      row.append(info, watch, save, del);
      list.append(row);
    }
  };
  const open = el('button', 'hud-btn', '📂 Open a replay file');
  const file = el('input');
  file.type = 'file';
  file.accept = '.json,application/json';
  file.hidden = true;
  open.onclick = () => file.click();
  file.onchange = async () => {
    const f = file.files?.[0];
    if (!f) return;
    try {
      if (f.size > 5_000_000) throw new Error('too big');
      const r = JSON.parse(await f.text()) as unknown;
      if (!looksLikeReplay(r)) throw new Error('not a replay');
      close();
      onWatch(r);
    } catch {
      note.textContent = 'That file isn’t a TardiGeddon replay.';
    }
  };
  const cancel = el('button', 'hud-btn', 'Close');
  cancel.onclick = close;
  box.append(el('h2', 'editor-title', '🎬 Replays'), el('p', 'account-note', `Your last ${KEEP} matches, kept on this device. Save one as a file to send to a friend.`), list, note, open, file, cancel);
  overlay.append(box);
  host.append(overlay);
  draw();
}
