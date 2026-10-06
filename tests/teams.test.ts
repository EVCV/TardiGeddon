import { describe, expect, it } from 'vitest';
import {
  cleanName,
  dedupeColors,
  defaultProfile,
  loadProfiles,
  matchNames,
  updateProfile,
  TEAM_NAME_MAX,
} from '../src/ui/teams';
import { TEAM_COLORS } from '../src/render/palette';
import { HATS, hatSvg } from '../src/render/hats';
import { createWorld, MAX_TEAMS } from '../src/sim/world';

describe('team profiles', () => {
  it('cleans names: trims, collapses spaces, strips control chars, caps length', () => {
    expect(cleanName('  Moss \t  Boss\u0007 ', 20)).toBe('Moss Boss');
    expect(cleanName('x'.repeat(50), TEAM_NAME_MAX)).toHaveLength(TEAM_NAME_MAX);
  });

  it('loads defaults when storage is unavailable', () => {
    const list = loadProfiles();
    expect(list).toHaveLength(MAX_TEAMS);
    expect(list[0]).toEqual(defaultProfile(0));
    expect(new Set(list.map((p) => p.color)).size).toBe(MAX_TEAMS);
  });

  it('swaps colours when a team takes another team’s colour', () => {
    const list = Array.from({ length: 3 }, (_, i) => defaultProfile(i));
    const next = updateProfile(list, 0, { ...list[0], color: TEAM_COLORS[2] });
    expect(next[0].color).toBe(TEAM_COLORS[2]);
    expect(next[2].color).toBe(TEAM_COLORS[0]);
    expect(list[0].color).toBe(TEAM_COLORS[0]); // input not mutated
  });

  it('repairs duplicate colours from old saves', () => {
    const list = [defaultProfile(0), { ...defaultProfile(1), color: TEAM_COLORS[0] }];
    const fixed = dedupeColors(list);
    expect(fixed[0].color).not.toBe(fixed[1].color);
  });

  it('fills blank tardi names with the defaults', () => {
    const p = { ...defaultProfile(1), names: ['Zed', '', 'Quux', ''] };
    const names = matchNames(p, 1);
    expect(names[0]).toBe('Zed');
    expect(names[2]).toBe('Quux');
    expect(names[1]).toBeTruthy();
    expect(names).toHaveLength(4);
  });
});

describe('hats', () => {
  it('every hat renders to SVG and ids are unique', () => {
    expect(new Set(HATS.map((h) => h.id)).size).toBe(HATS.length);
    for (const h of HATS) {
      const svg = hatSvg(h.id, 0xff0000, 0, 0, 9);
      if (h.id === 'none') expect(svg).toBe('');
      else expect(svg).toMatch(/<(circle|path|polygon) /);
    }
  });
});

describe('custom teams in a match', () => {
  it('carry names, colours and hats into the world', () => {
    const s = createWorld({
      seed: 4,
      teams: [
        { name: 'Moss Bosses', color: TEAM_COLORS[4], cpu: false, hat: 'crown', names: ['Ada', 'Bo', 'Cy', 'Di'] },
        { name: 'Other', color: TEAM_COLORS[1], cpu: true },
      ],
    });
    expect(s.teams[0].name).toBe('Moss Bosses');
    expect(s.teams[0].hat).toBe('crown');
    expect(s.teams[1].hat).toBe('beanie');
    expect(s.tardis.filter((t) => t.team === 0).map((t) => t.name)).toEqual(['Ada', 'Bo', 'Cy', 'Di']);
  });
});
