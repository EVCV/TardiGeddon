// Saved team profiles (name, colour, hat, tardi names), one per player slot.
// Stored per device; storage may be missing or blocked, so every access is guarded.

import { DEFAULT_NAMES, MAX_TEAMS } from '../sim/rosters';
import { safeName, tidyName } from '../names';
import { TEAM_COLORS, TEAM_NAMES } from '../render/palette';
import { HATS } from '../render/hats';
import { SKINS } from '../render/skins';
import { AIM_STYLES, FX_STYLES } from '../render/cosmetics';
import { DANCES, GRAVES } from '../render/finales';
import { defaultEmblem, isEmblem } from '../render/emblems';

export interface TeamProfile {
  name: string;
  color: number;
  hat: string;
  skin: string;
  /** Aim marker style and explosion effect (shop cosmetics). */
  aim: string;
  fx: string;
  /** Victory dance and gravestone (shop cosmetics; everyone in the match sees them). */
  dance: string;
  grave: string;
  /** Team badge (render/emblems.ts): free, built from ready-made parts. */
  emblem: string;
  /** Up to 4 tardi names; blanks fall back to the defaults. */
  names: string[];
}

const KEY = 'tardigeddon.teams';
export const TEAM_NAME_MAX = 18;
export const TARDI_NAME_MAX = 14;

export function defaultTardiNames(slot: number): string[] {
  return DEFAULT_NAMES.slice(slot * 4, slot * 4 + 4);
}

/** Free hats handed out to the slots by default, so the teams don't all look alike. */
const DEFAULT_HATS = ['beanie', 'cap', 'tophat', 'flower', 'crown'];

export function defaultProfile(slot: number): TeamProfile {
  return { name: TEAM_NAMES[slot], color: TEAM_COLORS[slot], hat: DEFAULT_HATS[slot % DEFAULT_HATS.length], skin: 'classic', aim: 'classic', fx: 'classic', dance: 'classic', grave: 'classic', emblem: defaultEmblem(slot), names: ['', '', '', ''] };
}

/** The next team colour after this one (the colour dot in the lobby steps through them). */
export function nextColor(c: number): number {
  return TEAM_COLORS[(TEAM_COLORS.indexOf(c) + 1) % TEAM_COLORS.length];
}

/** Trim, collapse spaces, drop control and invisible characters and cap the length. */
export function cleanName(s: string, max: number): string {
  return tidyName(s, max);
}

function valid(p: unknown, slot: number): TeamProfile {
  const d = defaultProfile(slot);
  if (!p || typeof p !== 'object') return d;
  const v = p as Partial<TeamProfile>;
  return {
    name: safeName(v.name, TEAM_NAME_MAX, d.name),
    color: typeof v.color === 'number' && TEAM_COLORS.includes(v.color) ? v.color : d.color,
    hat: typeof v.hat === 'string' && HATS.some((h) => h.id === v.hat) ? v.hat : d.hat,
    skin: typeof v.skin === 'string' && SKINS.some((k) => k.id === v.skin) ? v.skin : d.skin,
    aim: typeof v.aim === 'string' && AIM_STYLES.some((a) => a.id === v.aim) ? v.aim : d.aim,
    fx: typeof v.fx === 'string' && FX_STYLES.some((f) => f.id === v.fx) ? v.fx : d.fx,
    dance: typeof v.dance === 'string' && DANCES.some((x) => x.id === v.dance) ? v.dance : d.dance,
    grave: typeof v.grave === 'string' && GRAVES.some((x) => x.id === v.grave) ? v.grave : d.grave,
    emblem: isEmblem(v.emblem) ? v.emblem : d.emblem,
    names: Array.from({ length: 4 }, (_, i) =>
      Array.isArray(v.names) ? safeName(v.names[i], TARDI_NAME_MAX, '') : '',
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
