// The daily challenges' names, sizes and calendar: no game code, so the
// website can use it too (src/challenge/daily.ts has the rest).

export type ChallengeKind = 'targets' | 'rope';
export const CHALLENGE_KINDS: ChallengeKind[] = ['targets', 'rope'];

export function isChallengeKind(v: unknown): v is ChallengeKind {
  return v === 'targets' || v === 'rope';
}

/** Your turns in the Targets challenge. */
export const TARGET_TURNS = 8;
export const TARGET_COUNT = 8;

/** Today's challenge day, "YYYY-MM-DD" in UTC, so it's the same day for everyone. */
export function challengeDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
