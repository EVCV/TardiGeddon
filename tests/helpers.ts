import { createWorld, tick } from '../src/sim/world';
import { EMPTY_INPUT, type InputFrame, type SimEvent, type WorldState } from '../src/sim/types';

export function makeWorld(seed = 1234): WorldState {
  return createWorld({
    seed,
    teams: [
      { name: 'Red', color: 0xe04848, cpu: false },
      { name: 'Blue', color: 0x3a7be0, cpu: false },
    ],
  });
}

export function run(s: WorldState, ticks: number, input: InputFrame = EMPTY_INPUT): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) tick(s, input, events);
  return events;
}

/** Run until the given phase is reached (or a tick limit). */
export function runUntilPhase(s: WorldState, phase: string, limit = 5000): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < limit && s.turn.phase !== phase; i++) tick(s, EMPTY_INPUT, events);
  return events;
}
