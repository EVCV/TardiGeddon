import { describe, expect, it } from 'vitest';
import { coinRules } from '../src/shop/ageSignals';

// Brazil's Digital ECA: Google Play's age band only changes buying coins.
describe('age signals and the coin shop', () => {
  it('changes nothing for adults, players who share nothing, or when Play is unavailable', () => {
    expect(coinRules(null)).toEqual({});
    expect(coinRules({ status: 'shared', lower: 18 })).toEqual({});
    expect(coinRules({ status: 'not_shared' })).toEqual({});
    expect(coinRules({ status: 'error', message: 'APP_NOT_OWNED' })).toEqual({});
    expect(coinRules({ status: 'shared', lower: 18, change: 'approved' })).toEqual({});
  });

  it('tells under-18s a parent may need to approve purchases', () => {
    for (const [lower, upper] of [[0, 12], [13, 15], [16, 17]]) {
      const r = coinRules({ status: 'shared', lower, upper });
      expect(r.blocked).toBeUndefined();
      expect(r.note).toMatch(/parent or carer/);
    }
    expect(coinRules({ status: 'shared', lower: 13, upper: 15, change: 'approved' }).note).toMatch(/parent/);
  });

  it('switches buying coins off while a parent has not approved this version', () => {
    expect(coinRules({ status: 'shared', lower: 13, upper: 15, change: 'pending' }).blocked).toMatch(/until a parent/);
    expect(coinRules({ status: 'shared', lower: 13, upper: 15, change: 'declined' }).blocked).toMatch(/hasn’t approved/);
  });

  it('asks the player to confirm their age with Google Play where the law requires it', () => {
    expect(coinRules({ status: 'verification_required' }).blocked).toMatch(/Play Store/);
  });
});
