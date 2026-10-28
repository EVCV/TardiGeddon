// How the player has been doing against the CPU lately, kept on this device:
// +n after n wins in a row, -n after n losses. The CPU (src/ai/cpu.ts) uses it
// to now and then play a turn a little better, or a little worse, so matches
// stay close without it ever being obvious.

const KEY = 'tardigeddon.cpuForm';

/** The player's current run against the CPU. */
export function cpuForm(): number {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isFinite(n) ? Math.max(-5, Math.min(5, n)) : 0;
  } catch {
    return 0;
  }
}

/** A match against the CPU has ended. */
export function noteCpuResult(won: boolean): void {
  const was = cpuForm();
  const now = won ? Math.max(0, was) + 1 : Math.min(0, was) - 1;
  try {
    localStorage.setItem(KEY, String(Math.max(-5, Math.min(5, now))));
  } catch {
    // can't save: the CPU just plays as chosen
  }
}
