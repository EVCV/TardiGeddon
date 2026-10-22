// Players you've blocked: they're never put in your quick-play matches, and
// if you meet them in a private room their names are hidden from you. Kept on
// this device (`tardigeddon.blocked`). Players are known by the id the server
// gives them (LobbySlot.pid): the same on every visit for signed-in players,
// new each visit for guests.

import { t } from '../i18n/i18n';
import { tk } from '../i18n/tk';

export interface BlockedPlayer {
  pid: string;
  /** The team name you saw when you blocked them, so you know who's on the list. */
  name: string;
  /** When (ms since 1970). */
  at: number;
}

const KEY = 'tardigeddon.blocked';
/** Oldest blocks drop off past this many (the server reads at most 500). */
const MAX = 300;
let thisPage: BlockedPlayer[] | null = null;

export function blockedPlayers(): BlockedPlayer[] {
  if (thisPage) return thisPage;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter(
      (b): b is BlockedPlayer => !!b && typeof b === 'object' && typeof (b as BlockedPlayer).pid === 'string' && typeof (b as BlockedPlayer).name === 'string',
    );
  } catch {
    return [];
  }
}

function save(list: BlockedPlayer[]): void {
  thisPage = list.slice(-MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(thisPage));
  } catch {
    // Storage blocked: the list lasts until the page closes.
  }
}

export function isBlocked(pid: string | undefined): boolean {
  return !!pid && blockedPlayers().some((b) => b.pid === pid);
}

export function block(pid: string, name: string): void {
  if (!isBlocked(pid)) save([...blockedPlayers(), { pid, name, at: Date.now() }]);
}

export function unblock(pid: string): void {
  save(blockedPlayers().filter((b) => b.pid !== pid));
}

/** Teams in the match on screen whose names are hidden (their players are blocked). */
let hidden = new Set<number>();

export function hideTeams(ids: Iterable<number>): void {
  hidden = new Set(ids);
}

export const BLOCKED_TEAM = tk('Blocked player');

/** A team's name as this player sees it. */
export function teamLabel(team: { id: number; name: string }): string {
  return hidden.has(team.id) ? t(BLOCKED_TEAM) : team.name;
}

/** A tardi's name as this player sees it. */
export function tardiLabel(tardi: { team: number; name: string }): string {
  return hidden.has(tardi.team) ? '' : tardi.name;
}
