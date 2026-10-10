// Saved team profiles (name, colour, hat, tardi names), one per player slot.
// Stored per device; storage may be missing or blocked, so every access is guarded.

import { DEFAULT_NAMES, MAX_TEAMS } from '../sim/world';
import { TEAM_COLORS, TEAM_NAMES } from '../render/palette';
import { HATS } from '../render/hats';
import { SKINS } from '../render/skins';

export interface TeamProfile {
  name: string;
  color: number;
  hat: string;
  skin: string;
  /** Up to 4 tardi names; blanks fall back to the defaults. */
  names: string[];
}

const KEY = 'tardigeddon.teams';
export const TEAM_NAME_MAX = 18;
export const TARDI_NAME_MAX = 14;

export function defaultTardiNames(slot: number): string[] {
  return DEFAULT_NAMES.slice(slot * 4, slot * 4 + 4);
}

export function defaultProfile(slot: number): TeamProfile {
  return { name: TEAM_NAMES[slot], color: TEAM_COLORS[slot], hat: 'beanie', skin: 'classic', names: ['', '', '', ''] };
}

/** Trim, collapse spaces, drop control characters and cap the length. */
export function cleanName(s: string, max: number): string {
  return s
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function valid(p: unknown, slot: number): TeamProfile {
  const d = defaultProfile(slot);
  if (!p || typeof p !== 'object') return d;
  const v = p as Partial<TeamProfile>;
  return {
    name: typeof v.name === 'string' && cleanName(v.name, TEAM_NAME_MAX) ? cleanName(v.name, TEAM_NAME_MAX) : d.name,
    color: typeof v.color === 'number' && TEAM_COLORS.includes(v.color) ? v.color : d.color,
    hat: typeof v.hat === 'string' && HATS.some((h) => h.id === v.hat) ? v.hat : d.hat,
    skin: typeof v.skin === 'string' && SKINS.some((k) => k.id === v.skin) ? v.skin : d.skin,
    names: Array.from({ length: 4 }, (_, i) =>
      Array.isArray(v.names) && typeof v.names[i] === 'string' ? cleanName(v.names[i], TARDI_NAME_MAX) : '',
    ),
  };
}

export function loadProfiles(): TeamProfile[] {
  let raw: unknown[] = [];
  try {
    const s = localStorage.getItem(KEY);
    if (s) raw = JSON.parse(s) as unknown[];
  } catch {
    /* ignore */
  }
  const list = Array.from({ length: MAX_TEAMS }, (_, i) => valid(Array.isArray(raw) ? raw[i] : undefined, i));
  return dedupeColors(list);
}

export function saveProfiles(list: TeamProfile[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

/** Give any team whose colour repeats an earlier team's colour the first unused colour. */
export function dedupeColors(list: TeamProfile[]): TeamProfile[] {
  const used = new Set<number>();
  return list.map((p) => {
    if (!used.has(p.color)) {
      used.add(p.color);
      return p;
    }
    const free = TEAM_COLORS.find((c) => !used.has(c) && !list.some((q) => q.color === c)) ?? TEAM_COLORS.find((c) => !used.has(c))!;
    used.add(free);
    return { ...p, color: free };
  });
}

/** Set a slot's profile; if its new colour belongs to another team, they swap colours. */
export function updateProfile(list: TeamProfile[], slot: number, next: TeamProfile): TeamProfile[] {
  const out = list.map((p) => ({ ...p, names: [...p.names] }));
  const other = out.findIndex((p, i) => i !== slot && p.color === next.color);
  if (other >= 0) out[other].color = out[slot].color;
  out[slot] = { ...next, names: [...next.names] };
  return out;
}

/** Tardi names for a match: the custom ones, with blanks filled from the defaults. */
export function matchNames(p: TeamProfile, slot: number): string[] {
  const d = defaultTardiNames(slot);
  return d.map((name, i) => p.names[i] || name);
}
