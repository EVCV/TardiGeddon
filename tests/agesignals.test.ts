import { describe, expect, it, vi } from 'vitest';
import { coinRules, mayBeMinor, mayChange, withTimeout } from '../src/shop/ageSignals';

// Brazil's Digital ECA and US state app-store laws: Google Play's age band only changes buying coins.
describe('age signals and the coin shop', () => {
  it('changes nothing for adults, players who share nothing, or when Play is unavailable', () => {
    expect(coinRules(null)).toEqual({});
    expect(coinRules({ status: 'shared', lower: 18 })).toEqual({});
    expect(coinRules({ status: 'not_shared' })).toEqual({});
    expect(coinRules({ status: 'error', message: 'APP_NOT_OWNED' })).toEqual({});
    expect(coinRules({ status: 'shared', lower: 18, change: 'approved' })).toEqual({});
  });

  it("tells under-18s a parent must say yes, and doesn't let them say they're 18", () => {
    for (const [lower, upper] of [[0, 12], [13, 15], [16, 17]]) {
      const r = coinRules({ status: 'shared', lower, upper });
      expect(r.blocked).toBeUndefined();
      expect(r.note).toMatch(/parent or carer/);
      expect(r.minor).toBe(true);
    }
    expect(coinRules({ status: 'shared', lower: 13, upper: 15, change: 'approved' }).note).toMatch(/parent/);
    expect(coinRules({ status: 'shared', lower: 18 }).minor).toBeUndefined();
  });

  it('counts a custom top band below 18 (e.g. "15 and over") as possibly under 18', () => {
    expect(mayBeMinor(15, undefined)).toBe(true);
    expect(mayBeMinor(18, undefined)).toBe(false);
    expect(mayBeMinor(undefined, 12)).toBe(true);
    expect(mayBeMinor(undefined, undefined)).toBe(false);
    expect(coinRules({ status: 'shared', lower: 15 }).minor).toBe(true);
  });

  it('switches buying coins off while a parent has not approved this version', () => {
    expect(coinRules({ status: 'shared', lower: 13, upper: 15, change: 'pending' }).blocked).toMatch(/until a parent/);
    expect(coinRules({ status: 'shared', lower: 13, upper: 15, change: 'declined' }).blocked).toMatch(/hasn’t approved/);
  });

  it('asks the player to confirm their age with Google Play where the law requires it', () => {
    expect(coinRules({ status: 'verification_required' }).blocked).toMatch(/Play Store/);
  });

  it('asks again after the app comes back only when the answer can change', () => {
    expect(mayChange({ status: 'verification_required' })).toBe(true);
    expect(mayChange({ status: 'shared', lower: 13, upper: 15, change: 'pending' })).toBe(true);
    expect(mayChange({ status: 'shared', lower: 13, upper: 15, change: 'declined' })).toBe(true);
    expect(mayChange({ status: 'error' })).toBe(true);
    expect(mayChange({ status: 'shared', lower: 18 })).toBe(false);
    expect(mayChange({ status: 'shared', lower: 13, upper: 15, change: 'approved' })).toBe(false);
    expect(mayChange({ status: 'not_shared' })).toBe(false);
  });

  it("doesn't wait for ever on a Play Store that never answers", async () => {
    vi.useFakeTimers();
    try {
      const never = withTimeout(new Promise(() => {}), 15_000);
      vi.advanceTimersByTime(15_000);
      expect(await never).toEqual({ status: 'error', message: 'timeout' });
      // A failure is an error too, and a quick answer comes through as it is.
      expect(await withTimeout(Promise.reject(new Error('x')), 15_000)).toEqual({ status: 'error' });
      expect(await withTimeout(Promise.resolve({ status: 'not_shared' }), 15_000)).toEqual({ status: 'not_shared' });
    } finally {
      vi.useRealTimers();
    }
  });
});
