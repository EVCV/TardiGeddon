import { describe, expect, it } from 'vitest';
import { REVIEW_DAYS, REVIEW_GAP_DAYS, REVIEW_MATCHES, afterMatch, type ReviewRecord } from '../src/review';

const fresh: ReviewRecord = { matches: 0, days: [], asked: '' };

function play(r: ReviewRecord, results: boolean[], day: string): { record: ReviewRecord; asks: number } {
  let asks = 0;
  for (const won of results) {
    const next = afterMatch(r, won, day);
    r = next.record;
    if (next.ask) asks++;
  }
  return { record: r, asks };
}

describe('asking for a review', () => {
  it('waits for enough matches on enough different days', () => {
    // Lots of wins on one day: not yet.
    let { record, asks } = play(fresh, Array(REVIEW_MATCHES * 3).fill(true), '2026-11-01');
    expect(asks).toBe(0);
    ({ record, asks } = play(record, [true], '2026-11-02'));
    expect(asks).toBe(0);
    expect(REVIEW_DAYS).toBe(3);
    ({ record, asks } = play(record, [true], '2026-11-03'));
    expect(asks).toBe(1);
    expect(record.asked).toBe('2026-11-03');
  });

  it('only asks after a win', () => {
    const played = play(fresh, [true, true, true, true], '2026-11-01').record;
    const later = play(played, [true], '2026-11-02').record;
    const lost = afterMatch(later, false, '2026-11-03');
    expect(lost.ask).toBe(false);
    expect(afterMatch(lost.record, true, '2026-11-03').ask).toBe(true);
  });

  it('then not again for a couple of months', () => {
    const asked: ReviewRecord = { matches: 50, days: ['2026-11-01', '2026-11-02', '2026-11-03'], asked: '2026-11-03' };
    expect(afterMatch(asked, true, '2026-11-20').ask).toBe(false);
    const gap = new Date(Date.parse('2026-11-03') + REVIEW_GAP_DAYS * 86_400_000).toISOString().slice(0, 10);
    expect(afterMatch(asked, true, gap).ask).toBe(true);
  });

  it('keeps only a few days, however long someone plays', () => {
    let r = fresh;
    for (let d = 1; d <= 28; d++) r = afterMatch(r, false, `2026-11-${String(d).padStart(2, '0')}`).record;
    expect(r.days).toHaveLength(REVIEW_DAYS);
    expect(r.matches).toBe(28);
  });
});
