import { describe, expect, it } from 'vitest';
import { CREATOR_SHAPES, EMBLEM_SHAPES, creatorOnlyEmblem, defaultEmblem, emblemString, emblemSvg, isEmblem, parseEmblem, randomEmblem } from '../src/render/emblems';

describe('the creator medal emblem', () => {
  const medal = emblemString({ shape: EMBLEM_SHAPES.indexOf('medal'), icon: 3, bg: 2, fg: 11, pattern: 0 });

  it('is a real emblem, drawn like the others, but only for creators', () => {
    expect(isEmblem(medal)).toBe(true);
    expect(creatorOnlyEmblem(medal)).toBe(true);
    expect(emblemSvg(medal)).toContain('<path');
    expect(creatorOnlyEmblem(defaultEmblem(0))).toBe(false);
    expect(creatorOnlyEmblem('junk')).toBe(false);
  });

  it('never comes up by chance: not as a team slot’s default, nor from the dice', () => {
    for (let slot = 0; slot < 40; slot++) expect(creatorOnlyEmblem(defaultEmblem(slot))).toBe(false);
    let r = 0;
    const rand = () => (r = (r + 0.0731) % 1);
    for (let i = 0; i < 500; i++) expect(CREATOR_SHAPES).not.toContain(parseEmblem(randomEmblem(rand))!.shape);
  });
});
