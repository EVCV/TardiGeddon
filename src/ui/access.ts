// Accessibility settings (Settings → Accessibility), kept on this device:
// team symbols, colour-blind friendly team colours, high contrast (WCAG 2.2:
// 7:1 text, solid panels, thick focus rings), dark mode and calmer effects.
// They change what this player sees only, never the match.
// Settings the player hasn't changed follow the device (ui/device.ts): Dark
// Mode, Differentiate Without Color or Colour correction, Increase Contrast
// and Reduce Motion, so the game matches the rest of the phone.

import { VIEW } from '../render/palette';
import { deviceDisplay, onDeviceDisplayChange, type DeviceDisplay } from './device';

export type DarkSetting = 'auto' | 'on' | 'off';

export interface AccessSettings {
  /** A symbol beside every team's name (● ▲ ■ …), so teams never differ by colour alone. */
  symbols: boolean;
  colourBlind: boolean;
  highContrast: boolean;
  /** Dark menus and HUD, and a dimmed sky in matches. Auto: as the device. */
  dark: DarkSetting;
  /** Fewer flashes and less movement. Starts on if the device asks for reduced motion. */
  calm: boolean;
  /** Words on screen for the game's sounds (ui/captions.ts). */
  captions: boolean;
  /** Prompts in a match saying what to do next with the weapon in hand (ui/hud.ts). */
  hints: boolean;
}

const KEY = 'tardigeddon.access';

/** What each setting is until the player changes it. */
function defaults(d: DeviceDisplay): AccessSettings {
  return { symbols: true, colourBlind: d.noColour, highContrast: d.contrast, dark: 'auto', calm: d.calm, captions: false, hints: true };
}

/** Only what the player changed (the rest follows the device). */
let saved: Partial<AccessSettings> | null = null;

function load(): Partial<AccessSettings> {
  if (saved) return saved;
  saved = {};
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
    for (const k of ['symbols', 'colourBlind', 'highContrast', 'calm', 'captions', 'hints'] as const) {
      if (typeof raw[k] === 'boolean') saved[k] = raw[k];
    }
    if (raw.dark === 'auto' || raw.dark === 'on' || raw.dark === 'off') saved.dark = raw.dark;
  } catch {
    /* storage blocked or junk: defaults */
  }
  return saved;
}

export function accessSettings(): AccessSettings {
  return { ...defaults(deviceDisplay()), ...load() };
}

export function saveAccessSettings(next: AccessSettings): void {
  // A setting put back to what the device asks for follows the device again.
  const base = defaults(deviceDisplay());
  const keep: Partial<AccessSettings> = {};
  for (const k of Object.keys(base) as (keyof AccessSettings)[]) {
    if (next[k] !== base[k]) (keep as Record<string, unknown>)[k] = next[k];
  }
  saved = keep;
  try {
    localStorage.setItem(KEY, JSON.stringify(keep));
  } catch {
    /* lasts for this visit */
  }
  applyAccess();
}

/** Is the dark look on now? */
export function darkOn(a: AccessSettings = accessSettings()): boolean {
  return a.dark === 'on' || (a.dark === 'auto' && deviceDisplay().dark);
}

let watching = false;

/** Push the settings to the page (classes on <html>) and the game view (VIEW). */
export function applyAccess(): void {
  if (!watching) {
    watching = true;
    onDeviceDisplayChange(applyAccess);
  }
  const a = accessSettings();
  const dark = darkOn(a);
  VIEW.symbols = a.symbols;
  VIEW.colourBlind = a.colourBlind;
  VIEW.highContrast = a.highContrast;
  VIEW.calm = a.calm;
  VIEW.dark = dark;
  const root = document.documentElement;
  root.classList.toggle('cb', a.colourBlind);
  root.classList.toggle('hc', a.highContrast);
  root.classList.toggle('calm', a.calm);
  root.classList.toggle('dark', dark);
  // Native form controls and scrollbars match.
  root.style.colorScheme = dark ? 'dark' : 'light';
}
