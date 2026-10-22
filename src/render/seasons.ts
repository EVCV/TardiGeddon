// Seasonal events, on autopilot: each runs between two dates every year and
// brings a free world look for its season (render/arenas.ts, `season`).
// While one is on, the lobby says so and "Surprise me" picks its world half
// the time. Nothing to switch on or off: add a row here for a new event.

export interface Season {
  id: string;
  name: string;
  emoji: string;
  /** First and last day, as [month (1-12), day]. An event may wrap past New Year. */
  from: [number, number];
  to: [number, number];
  /** The free world for the season (an ARENAS id). */
  arena: string;
}

export const SEASONS: Season[] = [
  { id: 'newyear', name: 'New Year', emoji: '🎆', from: [12, 30], to: [1, 3], arena: 'fireworks' },
  { id: 'valentine', name: 'Valentine’s week', emoji: '💘', from: [2, 10], to: [2, 16], arena: 'sweetheart' },
  { id: 'spring', name: 'Spring blossom', emoji: '🌸', from: [3, 20], to: [4, 20], arena: 'blossom' },
  { id: 'summer', name: 'Summer holidays', emoji: '🏖️', from: [7, 20], to: [8, 31], arena: 'beach' },
  { id: 'halloween', name: 'Spooky season', emoji: '🎃', from: [10, 20], to: [11, 2], arena: 'pumpkin' },
  { id: 'winter', name: 'Winter festival', emoji: '❄️', from: [12, 10], to: [12, 29], arena: 'frostfair' },
];

const dayOfYear = (m: number, d: number) => m * 32 + d;

/**
 * The event on now, if any. By the UTC date, like the server, so the game
 * never offers a seasonal world the server would then refuse.
 */
export function currentSeason(now: Date = new Date()): Season | null {
  const today = dayOfYear(now.getUTCMonth() + 1, now.getUTCDate());
  for (const s of SEASONS) {
    const a = dayOfYear(...s.from);
    const b = dayOfYear(...s.to);
    if (a <= b ? today >= a && today <= b : today >= a || today <= b) return s;
  }
  return null;
}

/** "2 Nov": the event's last day, for the lobby. */
export function seasonEnds(s: Season): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${s.to[1]} ${months[s.to[0] - 1]}`;
}

/** Is this world one only usable in its season, and is that season on? */
export function seasonArenaOpen(arenaId: string, now: Date = new Date()): boolean {
  const s = SEASONS.find((x) => x.arena === arenaId);
  return !s || currentSeason(now)?.id === s.id;
}
