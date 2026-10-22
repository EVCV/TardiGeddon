// Names other players can see (team names, tardigrade names, the account's
// player name) must be safe for children and must not carry a way to get in
// touch: no rude words, no phone numbers, emails, links or social handles,
// and nothing that looks like the game's staff. Shared by the game (to tell
// the player straight away) and the server (which has the final say).
//
// Strangers never see typed names at all: quick-play teams get made-up names
// (presetTeamName). This filter covers private rooms with friends, and the
// player's own screen.

import { tk } from './i18n/tk';

export type NameProblem = 'chars' | 'numbers' | 'rude' | 'contact' | 'staff';

/** Why a name was refused, for the player. */
export const NAME_PROBLEM_TEXT: Record<NameProblem, string> = {
  chars: tk('Names can only use letters, spaces, - and ’.'),
  numbers: tk('Names can only have a couple of numbers in them.'),
  rude: tk('That name isn’t allowed. Please pick a friendly one.'),
  contact: tk('Names can’t include contact details, websites or social media.'),
  staff: tk('Names can’t pretend to be the game’s staff.'),
};

// Rude or unsafe words found anywhere inside a word, even with letters
// swapped for numbers or spaced out (sh1t, f u c k).
const RUDE_ANYWHERE = [
  'fuck', 'fuk', 'fck', 'shit', 'cunt', 'nigg', 'nigga', 'faggot', 'fagot', 'wanker', 'twat', 'bitch', 'biatch', 'whore', 'slut',
  'porn', 'penis', 'vagin', 'dildo', 'pussy', 'asshole', 'arsehole', 'bastard', 'bollock', 'bellend', 'tosser', 'jizz',
  'nazi', 'hitler', 'retard', 'paedo', 'pedophile', 'paedophile', 'killyourself', 'suicide', 'cocaine', 'jihad', 'terrorist',
  'motherf', 'blowjob', 'handjob', 'boner', 'erection', 'orgasm', 'masturb', 'clitoris', 'genital', 'testicle', 'scrotum',
];
// Rude words that are only rude on their own (so "class", "peacock" and "Sussex" are fine).
const RUDE_WORDS = [
  'ass', 'arse', 'wank', 'horny', 'cock', 'dick', 'rape', 'raped', 'rapist', 'pedo', 'kys', 'nude', 'nudes', 'naked', 'sex', 'sexy', 'boob', 'boobs',
  'tit', 'tits', 'titty', 'cum', 'anal', 'piss', 'crap', 'damn', 'hell', 'weed', 'meth', 'heroin', 'kkk', 'fag', 'spaz', 'prick',
  'slag', 'skank', 'hoe', 'hoes', 'thot', 'milf', 'xxx', 'butt', 'poo', 'poop', 'fart', 'wtf', 'stfu', 'gtfo', 'lmfao',
];
// Ways to get in touch outside the game.
const CONTACT_ANYWHERE = [
  'gmail', 'hotmail', 'icloud', 'outlook', 'yahoo', 'protonmail', 'instagram', 'snapchat', 'tiktok', 'discord', 'whatsapp',
  'telegram', 'facebook', 'youtube', 'twitter', 'reddit', 'twitch', 'roblox', 'fortnite', 'minecraft', 'xbox',
  'dotcom', 'dotco', 'dotnet', 'dotorg', 'www', 'http', 'addme', 'textme', 'callme', 'msgme', 'messageme', 'dmme', 'myphone',
  'mynumber', 'phonenumber', 'whereilive', 'myaddress', 'myschool',
];
const CONTACT_WORDS = ['aol', 'steam', 'psn', 'insta', 'ig', 'snap', 'sc', 'tt', 'dc', 'kik', 'fb', 'yt', 'x', 'com', 'net', 'org', 'dm', 'dms', 'pm', 'email', 'mail', 'phone', 'text', 'call', 'number', 'uk', 'at', 'dot'];
// Words that might be fine one at a time, but say "contact me" together with a contact word.
const CONTACT_ALONE_OK = new Set(['at', 'dot', 'x', 'uk', 'text', 'call', 'mail', 'number', 'net', 'sc', 'tt', 'dc', 'pm', 'ig']);
// Pretending to run the game.
const STAFF_ANYWHERE = ['tardigeddon', 'administrator', 'moderator'];
const STAFF_WORDS = ['admin', 'mod', 'mods', 'staff', 'official', 'support', 'dev', 'developer', 'owner', 'helpdesk'];

const NUMBER_WORDS = new Set([
  'zero', 'oh', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
  'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'double', 'triple',
]);

/** Most digits and number words one team (all its names together) may use: no phone numbers spread across names. */
export const MAX_NUMBERS = 2;

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g' };

/** Lower case, accents taken off: "Zoë" is "zoe". */
function plain(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Letters only, digits read as the letters they look like. */
function letters(s: string): string {
  return plain(s)
    .replace(/[0-9]/g, (d) => LEET[d] ?? '')
    .replace(/[^a-z]/g, '');
}

/**
 * The pieces to look for rude words in: each word, and runs of one- or
 * two-letter bits joined up ("f u c k", "sh it"), each also with repeated
 * letters squashed ("fuuuck" is "fuck"). Whole words aren't joined to each
 * other, so "Glass Hit" is fine.
 */
function pieces(s: string): string[] {
  const out: string[] = [];
  let run = '';
  for (const tok of plain(s).split(/[^a-z0-9]+/).filter(Boolean)) {
    const w = letters(tok);
    out.push(w);
    if (w.length <= 2) run += w;
    else {
      if (run.length > 2) out.push(run);
      run = '';
    }
  }
  if (run.length > 2) out.push(run);
  return out.flatMap((p) => [p, p.replace(/(.)\1+/g, '$1')]);
}

/** The name's words, digits read as letters. */
function words(s: string): string[] {
  return plain(s)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .flatMap((w) => {
      const read = w.replace(/[0-9]/g, (d) => LEET[d] ?? '');
      return read === w ? [w] : [w, read];
    });
}

/** How many digits and number words a name uses. */
export function numbersIn(s: string): number {
  const digits = (s.match(/[0-9]/g) ?? []).length;
  const spelled = plain(s)
    .split(/[^a-z]+/)
    .filter((w) => NUMBER_WORDS.has(w)).length;
  return digits + spelled;
}

/** What's wrong with a name, or null if it may be shown. Empty names are fine (a default is used). */
export function nameProblem(raw: string): NameProblem | null {
  const s = raw.trim();
  if (!s) return null;
  // Latin letters (accents are fine), digits, spaces, hyphens and apostrophes only:
  // no @ . / : _ # or lookalike letters from other alphabets.
  if (!/^[a-z0-9 '’-]*$/.test(plain(s))) return 'chars';
  const runs = pieces(s);
  const all = letters(s);
  const ws = words(s);
  if (runs.some((r) => RUDE_ANYWHERE.some((w) => r.includes(w))) || ws.some((w) => RUDE_WORDS.includes(w))) return 'rude';
  if (runs.some((r) => STAFF_ANYWHERE.some((w) => r.includes(w))) || ws.some((w) => STAFF_WORDS.includes(w))) return 'staff';
  // Contact details are looked for across words too ("add me", "dot com").
  if ([...runs, all].some((r) => CONTACT_ANYWHERE.some((w) => r.includes(w)))) return 'contact';
  const contact = ws.filter((w) => CONTACT_WORDS.includes(w));
  if (contact.some((w) => !CONTACT_ALONE_OK.has(w)) || contact.length >= 2) return 'contact';
  if (numbersIn(s) > MAX_NUMBERS) return 'numbers';
  return null;
}

/** Control characters out, spaces tidied, length capped. */
export function tidyName(s: unknown, max: number): string {
  if (typeof s !== 'string') return '';
  return s
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** The name tidied, or the fallback if it isn't allowed (or is empty). */
export function safeName(s: unknown, max: number, fallback: string): string {
  const t = tidyName(s, max);
  return t && !nameProblem(t) ? t : fallback;
}

/**
 * A team's names made safe together: each name on its own, then numbers
 * counted across all of them (a phone number can't be split over five names).
 */
export function safeTeamNames(name: unknown, names: unknown[], max: { team: number; tardi: number }, fallback: { team: string; tardi: string[] }): { name: string; names: string[] } {
  const team = safeName(name, max.team, fallback.team);
  const tardis = fallback.tardi.map((d, i) => safeName(names[i], max.tardi, d));
  let budget = MAX_NUMBERS;
  const fit = (n: string, d: string) => {
    const k = numbersIn(n);
    if (k > budget) return d;
    budget -= k;
    return n;
  };
  return { name: fit(team, fallback.team), names: tardis.map((n, i) => fit(n, fallback.tardi[i])) };
}

const ADJECTIVES = ['Mossy', 'Bubbly', 'Soggy', 'Speedy', 'Tiny', 'Mighty', 'Sneaky', 'Jolly', 'Fuzzy', 'Bouncy', 'Brave', 'Sleepy', 'Zippy', 'Wobbly', 'Cosmic', 'Sparkly', 'Squishy', 'Plucky', 'Dizzy', 'Gusty'];
const NOUNS = ['Rockets', 'Puddles', 'Sprouts', 'Bears', 'Pebbles', 'Spores', 'Droplets', 'Biscuits', 'Nuggets', 'Gloops', 'Mochis', 'Tumbles', 'Lilies', 'Bubbles', 'Ripples', 'Crumbs'];

/** A made-up team name, for quick play with strangers: e.g. "Mossy Rockets". */
export function presetTeamName(random: () => number): string {
  const pick = <T>(xs: T[]) => xs[Math.floor(random() * xs.length) % xs.length];
  return `${pick(ADJECTIVES)} ${pick(NOUNS)}`;
}
