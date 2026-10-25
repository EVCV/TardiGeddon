// Daily challenge scores (src/challenge/daily.ts). The game sends a run's
// input frames; the server plays them through the sim itself to get the
// score, so a leaderboard entry can't be made up. One row per player, day
// and challenge: their best run. Names shown are account names (checked
// when the account is made, src/names.ts).

import type { Pool } from 'pg';
import { CHARGE_STYLES } from '../src/sim/types';
import { challengeDay, playBack, unpackFrames, type ChallengeKind, type ChallengeResult } from '../src/challenge/daily';
import { cleanFrame } from './room';

export const BOARD_SIZE = 50;

export async function migrateChallenges(db: Pool): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS challenge_score (
      day     date NOT NULL,
      kind    text NOT NULL,
      user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      score   bigint NOT NULL,
      value   integer NOT NULL,
      ticks   integer NOT NULL,
      at      timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (day, kind, user_id)
    );
    CREATE INDEX IF NOT EXISTS challenge_score_board ON challenge_score (day, kind, score DESC, at);
  `);
}

/** Days a run may be for: today, or yesterday (a run that finished just after midnight UTC). */
export function acceptableDay(day: unknown, now: Date = new Date()): day is string {
  if (typeof day !== 'string') return false;
  return day === challengeDay(now) || day === challengeDay(new Date(now.getTime() - 86_400_000));
}

/** Check a run by playing it; null if the frames aren't a real run. */
export function checkRun(kind: ChallengeKind, day: string, packed: unknown, charge?: unknown): ChallengeResult | null {
  const frames = unpackFrames(packed, cleanFrame);
  if (!frames) return null;
  // The player's way of charging throws (Settings → Controls) shapes the run, so it's played back with it.
  const style = CHARGE_STYLES.find((c) => c === charge) ?? 'normal';
  return playBack(kind, day, { name: 'Player', color: 0xe04848, cpu: false, charge: style }, frames);
}

/** Keep the run if it beats the player's best for the day. Returns their best afterwards. */
export async function saveRun(db: Pool, userId: string, kind: ChallengeKind, day: string, r: ChallengeResult): Promise<number> {
  const q = await db.query(
    `INSERT INTO challenge_score (day, kind, user_id, score, value, ticks) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (day, kind, user_id) DO UPDATE
       SET score = EXCLUDED.score, value = EXCLUDED.value, ticks = EXCLUDED.ticks, at = now()
       WHERE challenge_score.score < EXCLUDED.score
     RETURNING score`,
    [day, kind, userId, r.score, r.value, r.ticks],
  );
  if (q.rows[0]) return Number(q.rows[0].score);
  const best = await db.query('SELECT score FROM challenge_score WHERE day = $1 AND kind = $2 AND user_id = $3', [day, kind, userId]);
  return Number(best.rows[0]?.score ?? r.score);
}

export interface BoardRow {
  rank: number;
  name: string;
  value: number;
  ticks: number;
  /** This row is the player asking. */
  you?: boolean;
}

/** The day's top runs (best first; earlier runs win ties), plus the asker's own place if they're further down. */
export async function board(db: Pool, kind: ChallengeKind, day: string, userId?: string): Promise<{ rows: BoardRow[]; me: BoardRow | null }> {
  const r = await db.query(
    `SELECT u.name, s.value, s.ticks, s.user_id,
            rank() OVER (ORDER BY s.score DESC, s.at) AS rank
       FROM challenge_score s JOIN "user" u ON u.id = s.user_id
      WHERE s.day = $1 AND s.kind = $2 AND s.score >= 0
      ORDER BY s.score DESC, s.at
      LIMIT $3`,
    [day, kind, BOARD_SIZE],
  );
  const rows: BoardRow[] = r.rows.map((x) => ({ rank: Number(x.rank), name: String(x.name), value: Number(x.value), ticks: Number(x.ticks), ...(x.user_id === userId ? { you: true } : {}) }));
  let me: BoardRow | null = rows.find((x) => x.you) ?? null;
  if (!me && userId) {
    const m = await db.query(
      `SELECT name, value, ticks, rank FROM (
         SELECT u.name, s.value, s.ticks, s.user_id, rank() OVER (ORDER BY s.score DESC, s.at) AS rank
           FROM challenge_score s JOIN "user" u ON u.id = s.user_id
          WHERE s.day = $1 AND s.kind = $2 AND s.score >= 0
       ) t WHERE user_id = $3`,
      [day, kind, userId],
    );
    const x = m.rows[0];
    if (x) me = { rank: Number(x.rank), name: String(x.name), value: Number(x.value), ticks: Number(x.ticks), you: true };
  }
  return { rows, me };
}
