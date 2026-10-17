import { describe, expect, it } from 'vitest';
import { MAX_NUMBERS, nameProblem, presetTeamName, safeName, safeTeamNames } from '../src/names';
import { DEFAULT_NAMES } from '../src/sim/world';
import { TEAM_NAMES } from '../src/render/palette';
import { HATS } from '../src/render/hats';
import { SHOP_ITEMS } from '../src/shop/catalog';

describe('names other players can see', () => {
  it('allows ordinary names, including every name the game itself uses', () => {
    const ordinary = ['Water Bears', 'Zoë', "O'Brien", 'Mary-Jane', 'Team 42', 'Class Clowns', 'Peacock Pals', 'Sussex Squad', 'Grape Ape', 'Assassins', 'Polka Dot', 'Atlas', 'Basement', 'Therapist', 'Cocktail', 'Kill Squad'];
    for (const n of [...ordinary, ...TEAM_NAMES, ...DEFAULT_NAMES, ...HATS.map((h) => h.name), ...SHOP_ITEMS.map((i) => i.name).filter((n) => /^[\p{L} '’-]+$/u.test(n))]) {
      expect(nameProblem(n), n).toBeNull();
    }
    for (let i = 0; i < 200; i++) expect(nameProblem(presetTeamName(Math.random))).toBeNull();
  });

  it('refuses rude words, even disguised', () => {
    for (const n of ['fuck', 'F u c k', 'sh1t', 'fuuuuck', 'Big Bitch', 'nazi', 'sexy', 'ass', 'kys', 'b00bs']) expect(nameProblem(n), n).toBe('rude');
  });

  it('refuses contact details, websites and social media', () => {
    for (const n of ['bob@gmail.com', 'bob at gmail', 'bob dot com', 'www bob', 'insta bob', 'snap me', 'add me', 'DM me', 'discord bob', 'call me', 'my number', 'tiktok', 'x dot com'])
      expect(nameProblem(n), n).not.toBeNull();
    for (const n of ['07700 900123', 'seven seven zero', 'one two three', '1 2 3']) expect(nameProblem(n), n).toBe('numbers');
  });

  it('refuses symbols, other alphabets and invisible characters', () => {
    for (const n of ['bob_123', 'a/b', 'Нi', '😀', 'bob#1', 'a:b', 'ｂｏｂ@x']) expect(nameProblem(n), n).not.toBeNull();
    expect(safeName('Bo​b', 14, 'X')).toBe('Bob');
  });

  it('refuses pretending to be staff', () => {
    for (const n of ['Admin', 'TardiGeddon', 'Official Mod', 'Moderator Bob', 'support']) expect(nameProblem(n), n).toBe('staff');
  });

  it('counts numbers across the whole team, so a phone number cannot be split over names', () => {
    const t = safeTeamNames('Team 07', ['70', '09', '00', '12'], { team: 18, tardi: 14 }, { team: 'Moss Mob', tardi: ['A', 'B', 'C', 'D'] });
    const digits = [t.name, ...t.names].join('').replace(/\D/g, '').length;
    expect(digits).toBeLessThanOrEqual(MAX_NUMBERS);
    expect(t.name).toBe('Team 07');
    expect(t.names).toEqual(['A', 'B', 'C', 'D']);
  });

  it('uses the fallback for a name that is not allowed', () => {
    expect(safeName('fuck off', 18, 'Moss Mob')).toBe('Moss Mob');
    expect(safeName('  Moss   Mob  ', 18, 'X')).toBe('Moss Mob');
    expect(safeName(42, 18, 'X')).toBe('X');
  });
});

describe('names: words next to each other', () => {
  it("doesn't join whole words into rude ones, but does join spaced-out letters", () => {
    for (const n of ['Glass Hit', 'Thorny Rose', 'Swanky Squad', 'Bus Hitch', 'Pass Hits']) expect(nameProblem(n), n).toBeNull();
    for (const n of ['f u c k', 'sh it', 'S H I T', 'c u n t']) expect(nameProblem(n), n).toBe('rude');
  });
});
