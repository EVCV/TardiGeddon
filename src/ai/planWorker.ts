// Runs the CPU's shot planning off the main thread (see Planner in cpu.ts).

import { SKILL_DEFS, choosePlan, type CpuSkill } from './cpu';
import type { WorldState } from '../sim/types';

const scope = self as unknown as { postMessage(m: unknown): void; onmessage: ((e: MessageEvent) => void) | null };
scope.onmessage = (e: MessageEvent<{ id: number; s: WorldState; skill: CpuSkill }>) => {
  const { id, s, skill } = e.data;
  scope.postMessage({ id, plan: choosePlan(s, SKILL_DEFS[skill] ?? SKILL_DEFS.normal) });
};
