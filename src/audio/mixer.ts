// The one AudioContext, with two volume knobs: music and sound effects.
// The player's sound settings (on/off and volume for each) live here and are
// kept on this device (`tardigeddon.audio` in local storage).

export interface AudioSettings {
  music: boolean;
  /** 0–100. */
  musicVol: number;
  effects: boolean;
  /** 0–100. */
  effectsVol: number;
}

const KEY = 'tardigeddon.audio';
const DEFAULTS: AudioSettings = { music: true, musicVol: 60, effects: true, effectsVol: 80 };

let ctx: AudioContext | null = null;
let musicBus: GainNode | null = null;
let sfxBus: GainNode | null = null;
let current: AudioSettings = load();
const listeners = new Set<() => void>();

function clampVol(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : fallback;
}

function load(): AudioSettings {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<AudioSettings> | null;
    if (!v || typeof v !== 'object') return { ...DEFAULTS };
    return {
      music: typeof v.music === 'boolean' ? v.music : DEFAULTS.music,
      musicVol: clampVol(v.musicVol, DEFAULTS.musicVol),
      effects: typeof v.effects === 'boolean' ? v.effects : DEFAULTS.effects,
      effectsVol: clampVol(v.effectsVol, DEFAULTS.effectsVol),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function audioSettings(): AudioSettings {
  return { ...current };
}

export function saveAudioSettings(next: AudioSettings): void {
  current = { ...next, musicVol: clampVol(next.musicVol, DEFAULTS.musicVol), effectsVol: clampVol(next.effectsVol, DEFAULTS.effectsVol) };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Storage blocked: the settings last until the page closes.
  }
  applyVolumes();
  for (const fn of listeners) fn();
}

/** Called whenever the settings change (e.g. to start or stop the music). */
export function onAudioSettings(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Is any sound on at all? (The in-match 🔊 button.) */
export function anySound(): boolean {
  return current.music || current.effects;
}

/** The in-match 🔊 button: everything off, or everything back on. Returns true when now silent. */
export function toggleAllSound(): boolean {
  const on = !anySound();
  saveAudioSettings({ ...current, music: on, effects: on });
  return !on;
}

// Volume sliders feel even when the gain follows the square of the slider.
const gainFor = (on: boolean, vol: number, scale: number) => (on ? (vol / 100) * (vol / 100) * scale : 0);

function applyVolumes(): void {
  if (!ctx || !musicBus || !sfxBus) return;
  const now = ctx.currentTime;
  musicBus.gain.setTargetAtTime(gainFor(current.music, current.musicVol, 1), now, 0.05);
  sfxBus.gain.setTargetAtTime(gainFor(current.effects, current.effectsVol, 1.25), now, 0.02);
}

/** Make (or wake) the AudioContext. Browsers only allow it after a tap or key press. */
export function unlockAudio(): void {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return;
    }
    musicBus = ctx.createGain();
    sfxBus = ctx.createGain();
    musicBus.gain.value = 0;
    sfxBus.gain.value = 0;
    musicBus.connect(ctx.destination);
    sfxBus.connect(ctx.destination);
    applyVolumes();
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

/** Silence everything while the app is in the background (phone apps, hidden tabs). */
export function pauseAudio(paused: boolean): void {
  if (!ctx) return;
  if (paused) void ctx.suspend();
  else void ctx.resume();
}

/** The context and the bus for sound effects, or null when effects are off (saves making nodes). */
export function sfxOut(): { ctx: AudioContext; out: AudioNode } | null {
  if (!ctx || !sfxBus || !current.effects || current.effectsVol === 0) return null;
  return { ctx, out: sfxBus };
}

/** The context and the bus for music (null before the first tap or key press). */
export function musicOut(): { ctx: AudioContext; out: AudioNode } | null {
  if (!ctx || !musicBus) return null;
  return { ctx, out: musicBus };
}

/** True while music should be making sound. */
export function musicOn(): boolean {
  return current.music && current.musicVol > 0;
}
