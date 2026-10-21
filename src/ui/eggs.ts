// Which easter eggs (src/eggs.ts) this player has found, kept on this
// device. Finding one shows a short note; the Guide lists them all, with
// riddles for the rest.

import { EGGS, isEgg } from '../eggs';
import { t } from '../i18n/i18n';

const KEY = 'tardigeddon.eggs';
let thisPage: string[] | null = null;
/** Tells the player (set by the game: a banner in a match, else a toast). */
let announce: ((text: string) => void) | null = null;

export function foundEggs(): string[] {
  if (thisPage) return thisPage;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    thisPage = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && isEgg(x)) : [];
  } catch {
    thisPage = [];
  }
  return thisPage;
}

export function onEggFound(fn: ((text: string) => void) | null): void {
  announce = fn;
}

/** Mark an egg found; true the first time. */
export function findEgg(id: string): boolean {
  const have = foundEggs();
  if (!isEgg(id) || have.includes(id)) return false;
  thisPage = [...have, id];
  try {
    localStorage.setItem(KEY, JSON.stringify(thisPage));
  } catch {
    /* kept for this visit */
  }
  const egg = EGGS.find((e) => e.id === id)!;
  const text = t('🥚 Easter egg: {name}! ({n}/{total})', { name: t(egg.name), n: thisPage.length, total: EGGS.length });
  if (announce) announce(text);
  else toast(text);
  return true;
}

/** A note at the top of the screen for a few seconds (outside matches). */
function toast(text: string): void {
  const note = document.createElement('div');
  note.className = 'egg-toast';
  note.setAttribute('role', 'status');
  note.textContent = text;
  document.body.append(note);
  setTimeout(() => note.remove(), 3500);
}
