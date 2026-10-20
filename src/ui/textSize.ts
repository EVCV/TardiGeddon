// Text size: the whole interface (menus and the in-match HUD) scales
// together, text and buttons alike, so words never spill out of a button.
// "Auto" follows the device: in the Android app, the phone's font size
// setting (DisplayPlugin; the WebView's own text-only enlarging is off);
// in a browser, the browser handles its own text and page zoom, so 100%.
// Kept on this device (`tardigeddon.textsize`). The game world (canvas) isn't scaled.

import { Capacitor, registerPlugin } from '@capacitor/core';

export type TextSize = 'auto' | '1' | '1.15' | '1.3' | '1.5';

export const TEXT_SIZES: [TextSize, string][] = [
  ['auto', 'Auto'],
  ['1', 'Normal'],
  ['1.15', 'Large'],
  ['1.3', 'Larger'],
  ['1.5', 'Largest'],
];

const KEY = 'tardigeddon.textsize';
/** The largest size. */
const MAX_SCALE = 1.5;
/**
 * The screen the interface lays out on, after scaling, must be at least this
 * big: a landscape phone (about 360px tall) gets up to about 120%, a tablet or
 * computer the full 150%.
 */
const MIN_HEIGHT = 300;
const MIN_WIDTH = 640;
let device = 1;
let thisPage: TextSize | null = null;

const Display = registerPlugin<{ fontScale(): Promise<{ scale: number }> }>('Display');

export function textSize(): TextSize {
  if (thisPage) return thisPage;
  try {
    const v = localStorage.getItem(KEY);
    if (TEXT_SIZES.some(([id]) => id === v)) return v as TextSize;
  } catch {
    /* storage blocked */
  }
  return 'auto';
}

export function setTextSize(v: TextSize): void {
  thisPage = v;
  try {
    localStorage.setItem(KEY, v);
  } catch {
    // Storage blocked: lasts until the page closes.
  }
  applyTextSize();
}

/** The device's own font scale (1 outside the Android app). */
export function deviceTextScale(): number {
  return device;
}

/** The most this screen has room for. */
export function maxScaleHere(): number {
  if (typeof innerHeight !== 'number' || !innerHeight) return MAX_SCALE;
  return Math.max(1, Math.min(MAX_SCALE, innerHeight / MIN_HEIGHT, innerWidth / MIN_WIDTH));
}

/** The scale in use now. */
export function uiScale(): number {
  const v = textSize();
  const s = v === 'auto' ? device : Number(v);
  return Math.round(Math.max(1, Math.min(maxScaleHere(), Number.isFinite(s) ? s : 1)) * 100) / 100;
}

export function applyTextSize(): void {
  const s = uiScale();
  const root = document.documentElement;
  root.style.setProperty('--ui-scale', String(s));
  root.toggleAttribute('data-scaled', s > 1);
}

/** At start-up: apply the saved size, then (in the app) ask the phone for its font size. */
export async function initTextSize(): Promise<void> {
  applyTextSize();
  // Turning the phone, or resizing the window, changes the room there is.
  addEventListener('resize', applyTextSize);
  if (Capacitor.getPlatform() !== 'android') return;
  try {
    const { scale } = await Display.fontScale();
    if (typeof scale === 'number' && scale > 0) device = Math.round(scale * 100) / 100;
  } catch {
    // An older app without the plugin: 100%.
  }
  applyTextSize();
}
