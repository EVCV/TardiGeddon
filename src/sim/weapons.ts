// Data-driven weapon definitions. Behaviour mirrors the classic artillery
// counterparts; names and art are TardiGeddon's own.

export interface ProjectileSpec {
  windFactor: number;
  /** Bounce restitution, or null to explode on impact. */
  bounce: number | null;
  /** Fuse comes from the player's 1-5 s setting. */
  playerFuse: boolean;
  radius: number;
  damage: number;
  speed: number;
  cluster?: { count: number; weapon: string };
  /** Steers towards the turn's target after launch (needs a target). */
  homing?: boolean;
  /** Fixed fuse in ticks (for dropped weapons like dynamite). */
  fuseTicks?: number;
  /** On explosion, spills this many flames ('acid' makes them acid). */
  fire?: { count: number; acid?: boolean };
  /** On explosion, poisons tardis within this radius. */
  poison?: number;
  /** Walks along the ground instead of flying (fired without charging). */
  walker?: { fuseTicks: number; speed: number };
  /** Smashes down through the ground, exploding on each of this many hits. */
  crusher?: { slams: number };
}

export type WeaponKind = 'charge' | 'hitscan' | 'target' | 'instant' | 'rope' | 'parachute' | 'melee' | 'walker' | 'drop';

export interface WeaponDef {
  id: string;
  name: string;
  kind: WeaponKind;
  /** Starting ammo; -1 = unlimited. */
  ammo: number;
  shots: number;
  /** Ends the turn immediately with no retreat time. */
  endsTurn?: boolean;
  projectile?: ProjectileSpec;
  hitscan?: { radius: number; damage: number; range: number };
  strike?: { count: number; spacing: number; weapon: string };
  girder?: { len: number; thick: number };
  melee?: { damage: number; reach: number; vx: number; vy: number };
  /** Rains this many projectiles per 1000 px of map width (map-wide strike). */
  shower?: { per1000: number; weapon: string };
  /** Superweapon: starting ammo comes from the scheme's `supers` setting. */
  super?: boolean;
  /** Hidden from the weapon panel (sub-munitions). */
  hidden?: boolean;
  /**
   * Season weapon, unlocked with Slime (src/shop/catalog.ts). Off unless the
   * match rules list it in Scheme.unlocked; then every team gets it.
   */
  locked?: boolean;
  icon: string;
}

export const WEAPONS: Record<string, WeaponDef> = {
  bazooka: {
    id: 'bazooka',
    name: 'Spore Bazooka',
    kind: 'charge',
    ammo: -1,
    shots: 1,
    icon: '🚀',
    projectile: { windFactor: 1, bounce: null, playerFuse: false, radius: 32, damage: 50, speed: 17 },
  },
  grenade: {
    id: 'grenade',
    name: 'Pebble Grenade',
    kind: 'charge',
    ammo: -1,
    shots: 1,
    icon: '💣',
    projectile: { windFactor: 0, bounce: 0.5, playerFuse: true, radius: 34, damage: 50, speed: 15 },
  },
  cluster: {
    id: 'cluster',
    name: 'Algae Cluster',
    kind: 'charge',
    ammo: 4,
    shots: 1,
    icon: '🟢',
    projectile: {
      windFactor: 0,
      bounce: 0.5,
      playerFuse: true,
      radius: 22,
      damage: 20,
      speed: 15,
      cluster: { count: 5, weapon: 'clusterlet' },
    },
  },
  // Season 1 weapons (locked: unlocked with Slime, see Scheme.unlocked).
  pinball: {
    id: 'pinball',
    name: 'Pollen Pinball',
    kind: 'charge',
    ammo: 3,
    shots: 1,
    locked: true,
    icon: '🟡',
    projectile: { windFactor: 0, bounce: 0.85, playerFuse: true, radius: 28, damage: 40, speed: 16 },
  },
  megaspore: {
    id: 'megaspore',
    name: 'Mega Spore',
    kind: 'charge',
    ammo: 1,
    shots: 1,
    locked: true,
    icon: '🍄',
    projectile: { windFactor: 1.3, bounce: null, playerFuse: false, radius: 55, damage: 70, speed: 12 },
  },
  swarm: {
    id: 'swarm',
    name: 'Spore Swarm',
    kind: 'charge',
    ammo: 2,
    shots: 1,
    locked: true,
    icon: '🫧',
    projectile: {
      windFactor: 0,
      bounce: 0.4,
      playerFuse: true,
      radius: 20,
      damage: 15,
      speed: 15,
      cluster: { count: 8, weapon: 'clusterlet' },
    },
  },
  balloon: {
    id: 'balloon',
    name: 'Water Balloon',
    kind: 'charge',
    ammo: 2,
    shots: 1,
    locked: true,
    icon: '🎈',
    projectile: { windFactor: 1.5, bounce: null, playerFuse: false, radius: 75, damage: 30, speed: 14 },
  },
  clusterlet: {
    id: 'clusterlet',
    name: 'Algae Bomblet',
    kind: 'charge',
    ammo: 0,
    shots: 1,
    hidden: true,
    icon: '•',
    projectile: { windFactor: 0, bounce: null, playerFuse: false, radius: 16, damage: 18, speed: 0 },
  },
  mortar: {
    id: 'mortar',
    name: 'Mortar Pod',
    kind: 'charge',
    ammo: 3,
    shots: 1,
    icon: '🌰',
    projectile: {
      windFactor: 1,
      bounce: null,
      playerFuse: false,
      radius: 22,
      damage: 25,
      speed: 17,
      cluster: { count: 4, weapon: 'mortarlet' },
    },
  },
  mortarlet: {
    id: 'mortarlet',
    name: 'Mortar Fragment',
    kind: 'charge',
    ammo: 0,
    shots: 1,
    hidden: true,
    icon: '•',
    projectile: { windFactor: 0, bounce: null, playerFuse: false, radius: 14, damage: 12, speed: 0 },
  },
  homing: {
    id: 'homing',
    name: 'Homing Spore',
    kind: 'charge',
    ammo: 2,
    shots: 1,
    icon: '🎯',
    projectile: { windFactor: 0, bounce: null, playerFuse: false, radius: 30, damage: 45, speed: 15, homing: true },
  },
  rotifer: {
    id: 'rotifer',
    name: 'Rotifer Roller',
    kind: 'walker',
    ammo: 1,
    shots: 1,
    icon: '🌀',
    projectile: {
      windFactor: 0,
      bounce: null,
      playerFuse: false,
      radius: 48,
      damage: 70,
      speed: 0,
      walker: { fuseTicks: 400, speed: 1.4 },
    },
  },
  bacteria: {
    id: 'bacteria',
    name: 'Bacteria Bomb',
    kind: 'charge',
    ammo: 1,
    shots: 1,
    icon: '🦠',
    projectile: {
      windFactor: 0,
      bounce: 0.5,
      playerFuse: true,
      radius: 34,
      damage: 45,
      speed: 15,
      cluster: { count: 5, weapon: 'bacterlet' },
    },
  },
  bacterlet: {
    id: 'bacterlet',
    name: 'Bacterium',
    kind: 'charge',
    ammo: 0,
    shots: 1,
    hidden: true,
    icon: '•',
    projectile: { windFactor: 0, bounce: null, playerFuse: false, radius: 28, damage: 35, speed: 0 },
  },
  sapbomb: {
    id: 'sapbomb',
    name: 'Hot Sap Bomb',
    kind: 'charge',
    ammo: 2,
    shots: 1,
    icon: '🔥',
    projectile: { windFactor: 0, bounce: null, playerFuse: false, radius: 8, damage: 5, speed: 15, fire: { count: 18 } },
  },
  acidrain: {
    id: 'acidrain',
    name: 'Acid Rain',
    kind: 'target',
    ammo: 1,
    shots: 1,
    icon: '🌧️',
    strike: { count: 5, spacing: 28, weapon: 'aciddrop' },
  },
  aciddrop: {
    id: 'aciddrop',
    name: 'Acid Drop',
    kind: 'charge',
    ammo: 0,
    shots: 1,
    hidden: true,
    icon: '•',
    projectile: { windFactor: 0.6, bounce: null, playerFuse: false, radius: 10, damage: 8, speed: 0, fire: { count: 5, acid: true } },
  },
  dynamite: {
    id: 'dynamite',
    name: 'Sticky Dynamite',
    kind: 'drop',
    ammo: 1,
    shots: 1,
    icon: '🧨',
    projectile: { windFactor: 0, bounce: 0.05, playerFuse: false, radius: 52, damage: 75, speed: 0, fuseTicks: 250 },
  },
  cyanobloom: {
    id: 'cyanobloom',
    name: 'Cyanobloom Cloud',
    kind: 'charge',
    ammo: 2,
    shots: 1,
    icon: '☁️',
    projectile: { windFactor: 0, bounce: 0.5, playerFuse: true, radius: 10, damage: 5, speed: 15, poison: 60 },
  },
  shotgun: {
    id: 'shotgun',
    name: 'Claw Shotgun',
    kind: 'hitscan',
    ammo: -1,
    shots: 2,
    icon: '🔫',
    hitscan: { radius: 10, damage: 25, range: 700 },
  },
  airstrike: {
    id: 'airstrike',
    name: 'Raindrop Strike',
    kind: 'target',
    ammo: 1,
    shots: 1,
    icon: '💧',
    strike: { count: 5, spacing: 26, weapon: 'raindrop' },
  },
  raindrop: {
    id: 'raindrop',
    name: 'Raindrop',
    kind: 'charge',
    ammo: 0,
    shots: 1,
    hidden: true,
    icon: '•',
    projectile: { windFactor: 0.6, bounce: null, playerFuse: false, radius: 24, damage: 30, speed: 0 },
  },
  brine: {
    id: 'brine',
    name: 'Brine Blob',
    kind: 'charge',
    ammo: 0,
    shots: 1,
    hidden: true,
    icon: '•',
    projectile: { windFactor: 0, bounce: null, playerFuse: false, radius: 14, damage: 10, speed: 0 },
  },
  firepunch: {
    id: 'firepunch',
    name: 'Fire Punch',
    kind: 'melee',
    ammo: -1,
    shots: 1,
    icon: '👊',
    melee: { damage: 30, reach: 22, vx: 2.2, vy: -7.5 },
  },
  rope: {
    id: 'rope',
    name: 'Silk Rope',
    kind: 'rope',
    ammo: -1,
    shots: 1,
    icon: '🕸️',
  },
  parachute: {
    id: 'parachute',
    name: 'Leaf Parachute',
    kind: 'parachute',
    ammo: 3,
    shots: 1,
    icon: '🍃',
  },
  girder: {
    id: 'girder',
    name: 'Twig Girder',
    kind: 'target',
    ammo: 3,
    shots: 1,
    icon: '🪵',
    girder: { len: 70, thick: 7 },
  },
  teleport: {
    id: 'teleport',
    name: 'Teleport',
    kind: 'target',
    ammo: 2,
    shots: 1,
    endsTurn: true,
    icon: '✨',
  },
  holywater: {
    id: 'holywater',
    name: 'Holy Water Droplet',
    kind: 'charge',
    ammo: 0,
    shots: 1,
    super: true,
    icon: '💦',
    projectile: { windFactor: 0, bounce: 0.3, playerFuse: false, radius: 90, damage: 100, speed: 14, fuseTicks: 150 },
  },
  tun: {
    id: 'tun',
    name: 'Concrete Tun',
    kind: 'target',
    ammo: 0,
    shots: 1,
    super: true,
    icon: '🗿',
    projectile: { windFactor: 0, bounce: null, playerFuse: false, radius: 36, damage: 40, speed: 0, crusher: { slams: 6 } },
  },
  slideslam: {
    id: 'slideslam',
    name: 'Microscope Slide Slam',
    kind: 'instant',
    ammo: 0,
    shots: 1,
    super: true,
    icon: '🔬',
    shower: { per1000: 8, weapon: 'shard' },
  },
  shard: {
    id: 'shard',
    name: 'Glass Shard',
    kind: 'charge',
    ammo: 0,
    shots: 1,
    hidden: true,
    icon: '•',
    projectile: { windFactor: 0.3, bounce: null, playerFuse: false, radius: 26, damage: 28, speed: 0 },
  },
  skip: {
    id: 'skip',
    name: 'Skip Go',
    kind: 'instant',
    ammo: -1,
    shots: 1,
    endsTurn: true,
    icon: '⏭',
  },
};

// No inherited names: online, weapon ids come from other players, and a lookup
// like WEAPONS['constructor'] must find nothing (it once crashed the server).
Object.setPrototypeOf(WEAPONS, null);

/** Is this a real weapon id (not an inherited object name)? */
export function isWeaponId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(WEAPONS, id);
}

export const PANEL_WEAPONS = Object.values(WEAPONS).filter((w) => !w.hidden);
