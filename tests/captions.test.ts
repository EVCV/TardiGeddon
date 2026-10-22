import { describe, expect, it } from 'vitest';
import { captionFor } from '../src/ui/captions';

describe('sound captions', () => {
  it('say what the important sounds mean, and stay quiet for the rest', () => {
    expect(captionFor({ t: 'mineArmed', id: 1 })).toBe('⚠️ Mine ticking');
    expect(captionFor({ t: 'explosion', x: 0, y: 0, r: 40, rect: { x: 0, y: 0, w: 1, h: 1 }, team: 0 })).toBe('💥 Big boom');
    expect(captionFor({ t: 'fire', weapon: 'bazooka', x: 0, y: 0 })).toBe('🚀 Spore Bazooka fired');
    expect(captionFor({ t: 'suddenDeath' })).toBe('⏰ Sudden death!');
    expect(captionFor({ t: 'bounce', x: 0, y: 0 })).toBeNull();
  });
});
