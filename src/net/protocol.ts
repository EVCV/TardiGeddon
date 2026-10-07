// Messages between the browser and the online game server (JSON over a
// WebSocket). Shared by both sides, so it must stay DOM-free.
//
// Online play is lockstep: the server runs the simulation and streams the
// input frame it used for every tick. Clients replay those frames through
// the same deterministic sim, so everyone sees the same match.

import type { Command, InputFrame, Scheme } from '../sim/types';
import type { TeamConfig } from '../sim/world';

export const PROTOCOL_VERSION = 2;

/** A player's team as shown in the lobby. */
export interface LobbyTeam {
  name: string;
  color: number;
  hat: string;
  /** Tardi names (cleaned up by the server). */
  names: string[];
}

export interface LobbySlot {
  team: LobbyTeam;
  cpu: boolean;
  host: boolean;
  connected: boolean;
}

/** A frame on the wire: 0 for "nothing pressed", else [held, pressed, cmd?]. */
export type WireFrame = 0 | [number, number] | [number, number, Command];

export type ClientMsg =
  | { t: 'create'; v: number; team: LobbyTeam }
  | { t: 'join'; v: number; code: string; team: LobbyTeam; token?: string }
  /** Quick play: wait in the queue to be matched with other players. */
  | { t: 'quick'; v: number; team: LobbyTeam }
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
  | { t: 'leave' };

export type ServerMsg =
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
