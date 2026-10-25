// Accessibility settings (Settings → Accessibility), kept on this device:
// colour-blind friendly team colours with a symbol per team, high contrast
// (WCAG 2.2: 7:1 text, solid panels, thick focus rings) and calmer effects.
// They change what this player sees only, never the match.

import { VIEW } from '../render/palette';

export interface AccessSettings {
  colourBlind: boolean;
  highContrast: boolean;
  /** Fewer flashes and less movement. Starts on if the device asks for reduced motion. */
  calm: boolean;
  /** Words on screen for the game's sounds (ui/captions.ts). */
  captions: boolean;
  /** Prompts in a match saying what to do next with the weapon in hand (ui/hud.ts). */
  hints: boolean;
}

const KEY = 'tardigeddon.access';

function deviceWantsCalm(): boolean {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function deviceWantsContrast(): boolean {
  try {
    return matchMedia('(prefers-contrast: more)').matches;
  } catch {
    return false;
  }
}

let current: AccessSettings | null = null;

export function accessSettings(): AccessSettings {
  if (current) return current;
  let saved: Partial<AccessSettings> = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<AccessSettings>;
  } catch {
    /* storage blocked or junk: defaults */
  }
  current = {
    colourBlind: saved.colourBlind === true,
    highContrast: typeof saved.highContrast === 'boolean' ? saved.highContrast : deviceWantsContrast(),
    calm: typeof saved.calm === 'boolean' ? saved.calm : deviceWantsCalm(),
    captions: saved.captions === true,
    hints: saved.hints !== false,
  };
  return current;
}

export function saveAccessSettings(next: AccessSettings): void {
  current = { ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* lasts for this visit */
  }
  applyAccess();
}

/** Push the settings to the page (classes on <html>) and the game view (VIEW). */
export function applyAccess(): void {
  const a = accessSettings();
  VIEW.colourBlind = a.colourBlind;
  VIEW.highContrast = a.highContrast;
  VIEW.calm = a.calm;
  const root = document.documentElement;
  root.classList.toggle('cb', a.colourBlind);
  root.classList.toggle('hc', a.highContrast);
  root.classList.toggle('calm', a.calm);
}
