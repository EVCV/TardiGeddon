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
}

export type WeaponKind = 'charge' | 'hitscan' | 'target' | 'instant';

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
  /** Hidden from the weapon panel (sub-munitions). */
  hidden?: boolean;
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
  teleport: {
    id: 'teleport',
    name: 'Teleport',
    kind: 'target',
    ammo: 2,
    shots: 1,
    endsTurn: true,
    icon: '✨',
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

export const PANEL_WEAPONS = Object.values(WEAPONS).filter((w) => !w.hidden);
