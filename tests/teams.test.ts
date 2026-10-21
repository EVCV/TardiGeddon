import { describe, expect, it } from 'vitest';
import {
  cleanName,
  dedupeColors,
  defaultProfile,
  loadProfiles,
  matchNames,
  nextColor,
  updateProfile,
  TEAM_NAME_MAX,
} from '../src/ui/teams';
import { CB_COLORS, TEAM_COLORS, TEAM_SYMBOLS, VIEW, shown, teamSymbol } from '../src/render/palette';
import { canUse } from '../src/shop/catalog';
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

  it('starts the teams in different free hats, so they look apart', () => {
    const hats = Array.from({ length: 5 }, (_, i) => defaultProfile(i).hat);
    expect(new Set(hats).size).toBe(5);
    for (const h of hats) expect(canUse('hat', h, [])).toBe(true);
  });

  it('steps through every colour with the colour dot, swapping with the team that had it', () => {
    const seen = new Set<number>();
    let c = TEAM_COLORS[0];
    for (let i = 0; i < TEAM_COLORS.length; i++) seen.add((c = nextColor(c)));
    expect(seen.size).toBe(TEAM_COLORS.length);
    const list = [defaultProfile(0), defaultProfile(1)];
    const out = updateProfile(list, 1, { ...list[1], color: nextColor(list[1].color) });
    expect(out[1].color).toBe(TEAM_COLORS[2]);
    expect(out[0].color).toBe(TEAM_COLORS[0]);
  });
});

describe('colour-blind mode', () => {
  it('swaps each team colour for its own safe colour and symbol, and leaves the rest alone', () => {
    expect(CB_COLORS).toHaveLength(TEAM_COLORS.length);
    expect(new Set(CB_COLORS).size).toBe(CB_COLORS.length);
    expect(new Set(TEAM_SYMBOLS).size).toBe(TEAM_COLORS.length);
    expect(shown(TEAM_COLORS[2])).toBe(TEAM_COLORS[2]);
    expect(teamSymbol(TEAM_COLORS[2])).toBe('');
    VIEW.colourBlind = true;
    try {
      TEAM_COLORS.forEach((c, i) => {
        expect(shown(c)).toBe(CB_COLORS[i]);
        expect(teamSymbol(c)).toBe(TEAM_SYMBOLS[i] + ' ');
      });
      expect(shown(0x123456)).toBe(0x123456);
    } finally {
      VIEW.colourBlind = false;
    }
  });
});
