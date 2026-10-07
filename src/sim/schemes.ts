// Ready-made game styles ("schemes"). Pure data: any field left out falls
// back to DEFAULT_SCHEME.

import { DEFAULT_SCHEME, type Scheme } from './types';

export interface SchemePreset {
  id: string;
  name: string;
  blurb: string;
  scheme: Partial<Scheme>;
}

export const SCHEME_PRESETS: SchemePreset[] = [
  {
    id: 'standard',
    name: 'Standard',
    blurb: 'The classic mix: all weapons, mines, drums and crates.',
    scheme: {},
  },
  {
    id: 'quick',
    name: 'Quick',
    blurb: 'Short turns, less health, sudden death after 5 minutes. Great on a phone.',
    scheme: { turnTime: 30, startHp: 60, roundTime: 5, tardisPerTeam: 3 },
  },
  {
    id: 'pro',
    name: 'Pro',
    blurb: 'Tight 30-second turns, fewer mines and crates. Skill over luck.',
    scheme: { turnTime: 30, mines: 4, drums: 2, crateChance: 0.3, roundTime: 15 },
  },
  {
    id: 'chaos',
    name: 'Chaos',
    blurb: 'Mines everywhere, drums galore, a crate every turn and a superweapon each.',
    scheme: { mines: 16, drums: 8, crateChance: 1, startHp: 150, roundTime: 10, supers: 1 },
  },
  {
    id: 'bng',
    name: 'Bazookas & Grenades',
    blurb: 'Only the Spore Bazooka and Pebble Grenade. Pure aiming skill.',
    scheme: { weapons: { bazooka: -1, grenade: -1 }, mines: 0, drums: 0, crateChance: 0.25 },
  },
  {
    id: 'artillery',
    name: 'Artillery',
    blurb: 'No walking or jumping: you fight from where you land.',
    scheme: { movement: false, weapons: { bazooka: -1, grenade: -1, cluster: 3, shotgun: -1, airstrike: 1 }, mines: 0 },
  },
  {
    id: 'roperace',
    name: 'Rope Race',
    blurb: 'No fighting: swing on the Silk Rope from the start to the flag. Fastest time over 3 tries wins.',
    scheme: {
      race: true,
      raceRounds: 3,
      tardisPerTeam: 1,
      weapons: { rope: -1, parachute: -1 },
      mines: 0,
      drums: 0,
      crateChance: 0,
      fallDamage: false,
      windMax: 0,
      turnTime: 60,
      retreatTime: 0,
      roundTime: 60,
    },
  },
];

export function presetScheme(id: string): Scheme {
  const p = SCHEME_PRESETS.find((x) => x.id === id) ?? SCHEME_PRESETS[0];
  return { ...DEFAULT_SCHEME, ...p.scheme };
}
