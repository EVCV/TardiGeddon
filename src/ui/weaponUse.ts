// How a weapon is used, as a short tag: thrown and goes off where it hits,
// bounces on a fuse, a spot you pick on the map, a straight shot… Shown on
// each weapon in the match's weapon panel (ui/hud.ts) and on the website's
// Weapons page, so it's worked out from the weapon's data, never written by hand.

import { tk } from '../i18n/tk';
import type { WeaponDef } from '../sim/weapons';

export type WeaponUseId = 'skip' | 'map' | 'sky' | 'spot' | 'homing' | 'straight' | 'close' | 'drop' | 'walks' | 'move' | 'fuse' | 'impact';

/** The tag's label is English: shown with t(label). */
export function weaponUse(def: WeaponDef): { id: WeaponUseId; icon: string; label: string } {
  if (def.id === 'skip') return { id: 'skip', icon: '⏭️', label: tk('Skip') };
  if (def.shower) return { id: 'map', icon: '🌍', label: tk('Whole map') };
  if (def.strike || def.projectile?.crusher) return { id: 'sky', icon: '☁️', label: tk('From the sky') };
  if (def.kind === 'target') return { id: 'spot', icon: '📍', label: tk('Pick a spot') };
  if (def.projectile?.homing) return { id: 'homing', icon: '🎯', label: tk('Homing') };
  if (def.kind === 'hitscan') return { id: 'straight', icon: '➖', label: tk('Straight shot') };
  if (def.kind === 'melee') return { id: 'close', icon: '👊', label: tk('Close up') };
  if (def.kind === 'drop') return { id: 'drop', icon: '⬇️', label: tk('Drop and run') };
  if (def.kind === 'walker') return { id: 'walks', icon: '🐾', label: tk('Walks there') };
  if (def.kind === 'rope' || def.kind === 'parachute') return { id: 'move', icon: '🧭', label: tk('Getting about') };
  if (def.projectile?.bounce !== null && def.projectile?.bounce !== undefined) return { id: 'fuse', icon: '⏱️', label: tk('Bounces, fuse') };
  return { id: 'impact', icon: '💥', label: tk('On impact') };
}
