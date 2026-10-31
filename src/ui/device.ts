// The device's own display and accessibility settings that the game follows
// when a setting is on "Auto": text size, dark mode, colour filters and
// contrast. In a browser these come from CSS media queries; in the phone
// apps the native Display plugin (DisplayPlugin.java / DisplayPlugin.swift)
// adds what a web page can't see: iOS Dynamic Type and Differentiate
// Without Color, Android's font size, Colour correction and High contrast
// text. Asked again whenever the app comes back to the front.

import { Capacitor, registerPlugin } from '@capacitor/core';

export interface DeviceDisplay {
  /** The device's text size: 1 is normal (always 1 in a browser, which zooms by itself). */
  fontScale: number;
  /** Dark mode is on. */
  dark: boolean;
  /** iOS Differentiate Without Color, or Android Colour correction. */
  noColour: boolean;
  /** Increase Contrast (iOS), High contrast text (Android), or the browser's "more contrast". */
  contrast: boolean;
  /** Reduce Motion, or the browser's "reduced motion". */
  calm: boolean;
}

interface DisplayPlugin {
  accessibility(): Promise<Partial<Omit<DeviceDisplay, 'calm'>>>;
}

const Display = registerPlugin<DisplayPlugin>('Display');

function query(q: string): boolean {
  try {
    return matchMedia(q).matches;
  } catch {
    return false;
  }
}

let native: Partial<DeviceDisplay> = {};
const listeners: (() => void)[] = [];

/** What the device asks for right now. */
export function deviceDisplay(): DeviceDisplay {
  const scale = native.fontScale;
  return {
    fontScale: typeof scale === 'number' && scale > 0 ? Math.round(scale * 100) / 100 : 1,
    dark: native.dark === true || query('(prefers-color-scheme: dark)'),
    noColour: native.noColour === true,
    contrast: native.contrast === true || query('(prefers-contrast: more)'),
    calm: query('(prefers-reduced-motion: reduce)'),
  };
}

/** Run `fn` whenever the device's settings may have changed. */
export function onDeviceDisplayChange(fn: () => void): void {
  listeners.push(fn);
}

function changed(): void {
  for (const fn of listeners) fn();
}

async function askNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const got = await Display.accessibility();
    if (got && typeof got === 'object') native = got;
  } catch {
    // An older app without the plugin: the browser's own answers only.
  }
  changed();
}

let started = false;

/** At start-up: ask the app, and watch for changes. */
export async function initDeviceDisplay(): Promise<void> {
  if (started) return;
  started = true;
  for (const q of ['(prefers-color-scheme: dark)', '(prefers-contrast: more)', '(prefers-reduced-motion: reduce)']) {
    try {
      matchMedia(q).addEventListener('change', changed);
    } catch {
      /* an old browser: read once */
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void askNative();
  });
  await askNative();
}
