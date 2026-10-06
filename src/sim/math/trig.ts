// Deterministic trigonometry.
//
// The simulation must produce bit-identical results on every device so that
// replays and online play stay in sync. IEEE-754 +, -, *, / and Math.sqrt are
// correctly rounded everywhere, but Math.sin/cos/atan2/pow/exp are not
// guaranteed to be. So the sim uses integer angles and a lookup table built
// with basic arithmetic only.

/** Angle units in a full circle. */
export const ANGLE_FULL = 4096;
export const ANGLE_QUARTER = ANGLE_FULL / 4;

const PI = 3.141592653589793;

function taylorSin(x: number): number {
  // x in [-PI/2, PI/2]
  const x2 = x * x;
  let term = x;
  let sum = x;
  for (let n = 1; n < 10; n++) {
    term = (-term * x2) / ((2 * n) * (2 * n + 1));
    sum += term;
  }
  return sum;
}

const SIN_TABLE = new Float64Array(ANGLE_FULL);
for (let i = 0; i < ANGLE_FULL; i++) {
  // Reduce to [-PI/2, PI/2] using symmetry so the series converges quickly.
  let x = (i / ANGLE_FULL) * 2 * PI;
  if (x > PI) x -= 2 * PI;
  if (x > PI / 2) x = PI - x;
  else if (x < -PI / 2) x = -PI - x;
  SIN_TABLE[i] = taylorSin(x);
}

function wrap(a: number): number {
  return ((a % ANGLE_FULL) + ANGLE_FULL) % ANGLE_FULL;
}

/** sin of an integer angle (ANGLE_FULL units per circle). */
export function sinA(a: number): number {
  return SIN_TABLE[wrap(a | 0)];
}

/** cos of an integer angle (ANGLE_FULL units per circle). */
export function cosA(a: number): number {
  return SIN_TABLE[wrap((a | 0) + ANGLE_QUARTER)];
}
