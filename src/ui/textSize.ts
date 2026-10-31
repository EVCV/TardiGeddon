// Text size: the whole interface scales together, text and buttons alike, so
// words never spill out of a button, up to 200%.
// "Auto" follows the device: in the apps, the phone's text size setting
// (iOS Dynamic Type, Android's font size; ui/device.ts. The Android WebView's
// own text-only enlarging is off); in a browser, the browser handles its own
// text and page zoom, so 100%.
// Menus get the full size and scroll when they no longer fit the screen. In a
// match the HUD grows only as far as the screen has room for (like a phone's
// tab bar), so it never covers the battlefield.
// Kept on this device (`tardigeddon.textsize`). The game world (canvas) isn't scaled.

import { tk } from '../i18n/tk';
import { deviceDisplay, onDeviceDisplayChange } from './device';

export type TextSize = 'auto' | '1' | '1.15' | '1.3' | '1.5' | '1.75' | '2';

/** Ids and names (English: shown with t()). */
export const TEXT_SIZES: [TextSize, string][] = [
  ['auto', tk('Auto')],
  ['1', tk('Normal')],
  ['1.15', tk('Large')],
  ['1.3', tk('Larger')],
  ['1.5', tk('Very large')],
  ['1.75', tk('Huge')],
  ['2', tk('Largest')],
];

const KEY = 'tardigeddon.textsize';
/** The largest size: 200%, as Apple and WCAG ask for. */
export const MAX_SCALE = 2;
/**
 * The screen the HUD (and the phone menu, without scrolling) lays out on,
 * after scaling, must be at least this big: a landscape phone (about 360px
 * tall) gets up to about 120%, a tablet or computer up to 200%.
 */
const MIN_HEIGHT = 300;
const MIN_WIDTH = 640;
/** Narrower than this after scaling, the full menu's columns no longer fit: the phone menu instead. */
const FULL_MENU_WIDTH = 1000;
/** The screens that always get the phone menu (landscape phones and tablets). */
const PHONE_SCREEN = '(max-height: 500px), (pointer: coarse) and (orientation: landscape) and (max-height: 900px)';
let thisPage: TextSize | null = null;

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

/** The device's own text scale (1 outside the apps). */
export function deviceTextScale(): number {
  return deviceDisplay().fontScale;
}

/** The most this screen has room for in a match. */
export function maxScaleHere(): number {
  if (typeof innerHeight !== 'number' || !innerHeight) return MAX_SCALE;
  return Math.max(1, Math.min(MAX_SCALE, innerHeight / MIN_HEIGHT, innerWidth / MIN_WIDTH));
}

const round = (s: number) => Math.round(s * 100) / 100;

/** The size chosen (Auto: the device's), 100% to 200%: the menus' scale. */
export function menuScale(): number {
  const v = textSize();
  const s = v === 'auto' ? deviceTextScale() : Number(v);
  return round(Math.max(1, Math.min(MAX_SCALE, Number.isFinite(s) ? s : 1)));
}

/** The scale in a match: the size chosen, as far as the screen has room. */
export function uiScale(): number {
  return round(Math.min(maxScaleHere(), menuScale()));
}

export function applyTextSize(): void {
  const hud = uiScale();
  const menu = menuScale();
  const root = document.documentElement;
  // #ui (the HUD and everything else) is zoomed by --ui-scale; menus by
  // --menu-boost on top, making --menu-scale in all.
  root.style.setProperty('--ui-scale', String(hud));
  root.style.setProperty('--menu-scale', String(menu));
  root.style.setProperty('--menu-boost', String(round(menu / hud)));
  root.toggleAttribute('data-scaled', menu > 1);
  // The phone menu (the "Phones" blocks in style.css): on phones and tablets,
  // and on bigger screens when the text is too big for the full menu.
  const phone = matchMedia(PHONE_SCREEN).matches || (menu > 1 && innerWidth / menu < FULL_MENU_WIDTH);
  root.toggleAttribute('data-phone-menu', phone);
  // Bigger than the phone menu has room for (the screen it lays out on, after
  // scaling, is under MIN_HEIGHT): its pages scroll instead of fitting the screen.
  const zoom = Number(getComputedStyle(root).getPropertyValue('--ui-zoom')) || 1;
  root.toggleAttribute('data-big-text', phone && innerHeight / (menu * zoom) < MIN_HEIGHT - 1);
}

/** Is the menu the phone menu (screens you tap through) now? */
export function phoneMenu(): boolean {
  return document.documentElement.hasAttribute('data-phone-menu');
}

/** At start-up: apply the saved size, and follow the device's. */
export function initTextSize(): void {
  applyTextSize();
  // Turning the phone, or resizing the window, changes the room there is.
  addEventListener('resize', applyTextSize);
  onDeviceDisplayChange(applyTextSize);
}
