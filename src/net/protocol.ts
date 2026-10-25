// Messages between the browser and the online game server (JSON over a
// WebSocket). Shared by both sides, so it must stay DOM-free.
//
// Online play is lockstep: the server runs the simulation and streams the
// input frame it used for every tick. Clients replay those frames through
// the same deterministic sim, so everyone sees the same match.

import type { ChargeStyle, Command, InputFrame, Scheme } from '../sim/types';
import { isWeaponId } from '../sim/weapons';
import type { TeamConfig } from '../sim/world';

export const PROTOCOL_VERSION = 8;

/** A player's team as shown in the lobby. */
export interface LobbyTeam {
  name: string;
  color: number;
  hat: string;
  skin?: string;
  /** Aim marker style and explosion effect. */
  aim?: string;
  fx?: string;
  /** Victory dance, gravestone (shop cosmetics) and team badge (free). */
  dance?: string;
  grave?: string;
  emblem?: string;
  /** Tardi names (cleaned up by the server). */
  names: string[];
  /** How Fire charges this player's throws (Settings → Controls; Team.charge). */
  charge?: ChargeStyle;
}

export interface LobbySlot {
  team: LobbyTeam;
  cpu: boolean;
  host: boolean;
  connected: boolean;
  /** The player's id for blocking and reporting (humans only). */
  pid?: string;
  /** The Founder (🌱) or Early bird (🐣) badge. */
  badge?: 'founder' | 'earlybird';
}

/** A frame on the wire: 0 for "nothing pressed", else [held, pressed, cmd?]. */
export type WireFrame = 0 | [number, number] | [number, number, Command];

export type ClientMsg =
  | { t: 'create'; v: number; team: LobbyTeam }
  | { t: 'join'; v: number; code: string; team: LobbyTeam; token?: string }
  /** Quick play: wait in the queue to be matched with other players (never with anyone in `blocks`, player ids). */
  | { t: 'quick'; v: number; team: LobbyTeam; blocks?: string[] }
  /** Watch a room (spectate): no team, no say. */
  | { t: 'watch'; v: number; code: string }
  | { t: 'quickCancel' }
  /** Tired of waiting: play a CPU straight away. */
  | { t: 'quickCpu' }
  | { t: 'addCpu' }
  | { t: 'removeSlot'; idx: number }
  | { t: 'start'; scheme: Partial<Scheme> }
  /** One local input frame, sent by the active player when it isn't empty/unchanged. */
  | { t: 'input'; f: WireFrame }
  /** Our sim's hash disagreed with the server's: please send a snapshot. */
  | { t: 'resync' }
  | { t: 'leave' }
  /** Report the player in slot `idx` (reason: 'name' | 'contact' | 'cheating' | 'other'). */
  | { t: 'report'; idx: number; reason: string };

export type ServerMsg =
  /** A friend invites you to their room (server/friends.ts). */
  | { t: 'invite'; from: string; code: string }
  | { t: 'room'; code: string; slots: LobbySlot[]; you: number; token: string; started: boolean }
  | { t: 'start'; seed: number; scheme: Partial<Scheme>; teams: TeamConfig[]; you: number }
  /** Frames for consecutive ticks; `from` is the sim tick count before the first one. */
  | { t: 'frames'; from: number; f: WireFrame[] }
  /** World hash after `tick` ticks, for desync detection. */
  | { t: 'hash'; tick: number; h: number }
  /** Full state, for rejoining or recovering from a desync. */
  | { t: 'snapshot'; state: string; teams: TeamConfig[]; you: number }
  /** Quick play: how many players are waiting (including you). */
  | { t: 'queue'; waiting: number }
  | { t: 'error'; msg: string };

export function toWire(f: InputFrame): WireFrame {
  if (f.cmd) return [f.held, f.pressed, f.cmd];
  if (f.held === 0 && f.pressed === 0) return 0;
  return [f.held, f.pressed];
}

export function fromWire(w: WireFrame): InputFrame {
  if (w === 0) return { held: 0, pressed: 0 };
  const f: InputFrame = { held: w[0] | 0, pressed: w[1] | 0 };
  if (w.length === 3) f.cmd = w[2];
  return f;
}

/** Rebuild an input frame from untrusted data: known button bits and command shapes only. */
export function cleanFrame(raw: unknown): InputFrame {
  if (!Array.isArray(raw)) return { held: 0, pressed: 0 };
  const f = fromWire([Number(raw[0]) & 0xff, Number(raw[1]) & 0xff]);
  const c = raw[2] as Record<string, unknown> | undefined;
  if (!c || typeof c !== 'object') return f;
  const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  if (c.t === 'weapon' && typeof c.id === 'string' && isWeaponId(c.id)) f.cmd = { t: 'weapon', id: c.id };
  else if (c.t === 'fuse' && finite(c.s)) f.cmd = { t: 'fuse', s: c.s as number };
  else if (c.t === 'target' && finite(c.x) && finite(c.y)) f.cmd = { t: 'target', x: Math.round(c.x as number), y: Math.round(c.y as number) };
  else if (c.t === 'aim' && finite(c.aim) && (c.facing === 1 || c.facing === -1)) f.cmd = { t: 'aim', facing: c.facing, aim: c.aim as number };
  else if (c.t === 'power' && finite(c.p)) f.cmd = { t: 'power', p: c.p as number };
  else if (c.t === 'skip') f.cmd = { t: 'skip' };
  return f;
}
