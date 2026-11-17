import { describe, expect, it } from 'vitest';
// @ts-expect-error: a plain JS module (scripts/videos/story.mjs), no types
import { hook, narrate, pick, resultCaption, script, setupCaption, srt } from '../scripts/videos/story.mjs';

// The words of the videos (scripts/videos/story.mjs): captions and narration
// built from what happened in a moment.
const base = {
  from: 0, to: 500, score: 300, peak: 200, fire: 100, tally: 300, weapon: 'concrete', label: 'Concrete Tun: 2 popped',
  pops: 2, drowned: 0, damage: 300, ownGoal: false,
  story: {
    shooter: 'Squish', team: 'Brave Pebbles', teamsBefore: 3, teamsAfter: 3, teamsOut: [] as string[], alone: false, range: 600, turnNo: 2,
    hits: [
      { name: 'Bubbles', team: 'Speedy Biscuits', dmg: 284, out: 'pop' },
      { name: 'Pudge', team: 'Mighty Puddles', dmg: 155, out: 'pop' },
    ],
  },
};

describe('video story', () => {
  it('says who fires what, and what happened', () => {
    expect(setupCaption(base)).toBe('Squish (Brave Pebbles) fires the Concrete Tun');
    expect(resultCaption(base)).toBe('2 popped with one shot! 💥');
    const n = narrate(base, 7);
    expect(n.setup).toMatch(/^(Number|At number|Coming in at number) 7\. /);
    expect(n.setup).toContain('Concrete Tun');
    expect(n.result.length).toBeGreaterThan(5);
    // No placeholders left over.
    expect(n.setup + n.result).not.toMatch(/[{}]/);
  });

  it('tells a team going out, an own goal, a swim and a miss apart', () => {
    const out = { ...base, story: { ...base.story, teamsOut: ['Mighty Puddles'], teamsAfter: 2 } };
    expect(resultCaption(out)).toBe('Mighty Puddles are out! 💀 · 2 teams left');
    expect(narrate(out).result).toContain('Mighty Puddles');
    const own = { ...base, ownGoal: true, pops: 1 };
    expect(resultCaption(own)).toMatch(/^Own goal!/);
    expect(hook(own)).toMatch(/…|mistake|NOT/);
    const swim = { ...base, pops: 0, drowned: 1, story: { ...base.story, hits: [{ name: 'Nibs', team: 'Speedy Biscuits', dmg: 0, out: 'water' }] } };
    expect(resultCaption(swim)).toBe('Nibs goes for a swim 🌊');
    expect(resultCaption({ ...base, pops: 2, drowned: 1 })).toBe('3 tardigrades down! 💥');
    const miss = { ...base, pops: 0, story: { ...base.story, hits: [] } };
    expect(resultCaption(miss)).toBe('Missed… 😬');
  });

  it('copes with a moment scouted before stories were kept', () => {
    const old = { ...base, story: undefined };
    expect(setupCaption(old)).toBe('Concrete Tun');
    expect(narrate(old).setup).not.toMatch(/undefined|[{}]/);
  });

  it('picks the same words for the same moment every time', () => {
    expect(pick(['a', 'b', 'c'], 'x1')).toBe(pick(['a', 'b', 'c'], 'x1'));
    expect(narrate(base, 3)).toEqual(narrate(base, 3));
  });

  it('never says the same line twice in one video', () => {
    const said = new Set<string>();
    const a = narrate(base, 3, said);
    const b = narrate(base, 2, said);
    expect(b.result).not.toBe(a.result);
  });

  it('says "the last of …" at most twice a video', () => {
    const said = new Set<string>();
    const alone = { ...base, story: { ...base.story, alone: true } };
    const lines = [1, 2, 3, 4, 5].map((n) => narrate({ ...alone, fire: n * 100 }, n, said).setup);
    expect(lines.filter((l) => /last|rests on|Just |down to/.test(l)).length).toBe(2);
  });

  it("opens a Short of a kind on that kind's promise, never twice the same", () => {
    const hooks = new Set<string>();
    const a = hook(base, 'water', hooks);
    const b = hook(base, 'water', hooks);
    expect(a).toMatch(/🌊/);
    expect(b).not.toBe(a);
  });

  it('writes subtitles and a timed script', () => {
    const lines = [
      { start: 0, end: 2.5, text: 'Hello' },
      { start: 65.25, end: 68, text: 'Bye' },
    ];
    expect(srt(lines)).toBe('1\n00:00:00,000 --> 00:00:02,500\nHello\n\n2\n00:01:05,250 --> 00:01:08,000\nBye\n');
    expect(script(lines)).toBe('[0:00] Hello\n[1:05] Bye');
  });
});
