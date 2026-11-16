// The story of a video, in words: what's on screen (short captions) and what the
// narrator says (a timed script, spoken by an AI voice or the owner's cloned voice).
// Built from each moment's facts (scout.ts MomentStory): who fired what at whom,
// who popped or went into the water, which teams went out and how many are left.
// Pure and deterministic (the same match gives the same words), so it's tested on
// its own (tests/videostory.test.ts). English only: the videos are in English.

/**
 * One of `list`, picked by `key` (the same key, the same choice). With `said`
 * (the lines already used in this video), the next one not said yet, if any.
 */
export function pick(list, key, said) {
  let h = 2166136261;
  for (const c of String(key)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const at = (h >>> 0) % list.length;
  for (let i = 0; said && i < list.length; i++) {
    const x = list[(at + i) % list.length];
    if (!said.has(x)) {
      said.add(x);
      return x;
    }
  }
  return list[at];
}

const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The weapon's name, from the moment's label ("Concrete Tun: 3 popped" → "Concrete Tun"). */
export const weaponOf = (x) => x.label.split(':')[0];

/** A shot that crossed the map (pixels). */
const LONG = 900;

/** What the game is, in one breath: the first thing a new viewer needs. */
export const EXPLAINER = 'Tiny tardigrades. Very big weapons. One shot a turn. Last team standing wins.';

/** The facts every line uses. */
function facts(x) {
  const s = x.story ?? { shooter: '', team: '', hits: [], teamsBefore: 0, teamsAfter: 0, teamsOut: [], alone: false, range: 0 };
  const foes = s.hits.filter((h) => h.team !== s.team);
  const popped = s.hits.filter((h) => h.out === 'pop');
  const wet = s.hits.filter((h) => h.out === 'water');
  const worst = [...s.hits].sort((a, b) => (b.out ? 1000 : b.dmg) - (a.out ? 1000 : a.dmg))[0];
  return {
    ...s,
    foes,
    popped,
    wet,
    worst,
    weapon: weaponOf(x),
    who: s.shooter || 'A tardigrade',
    n: x.pops + x.drowned,
    victim: worst?.name ?? '',
    victimTeam: worst?.team ?? '',
    left: s.teamsAfter,
    out: s.teamsOut.join(' and '),
  };
}

/**
 * The hook: the first words of a Short or a long video, over the action.
 * Promises what's coming without saying how it ends.
 */
export function hook(x) {
  const f = facts(x);
  const key = `${x.fire}${f.who}`;
  if (x.ownGoal) return pick(['Wait for it… 🤦', 'This was a mistake 😬', 'Do NOT do this 🤦'], key);
  if (f.teamsOut.length && f.alone) return pick(['Last one standing. One shot. 😳', 'Down to the last tardigrade…'], key);
  if (f.teamsOut.length) return pick(['One shot. A whole team gone. 💀', 'Watch this team disappear 💀'], key);
  if (f.n >= 3) return pick([`${f.n} tardigrades. One shot. 😳`, `How many can one shot get? 💥`], key);
  if (x.drowned) return pick(['Straight into the sea 🌊', 'Watch the water 🌊'], key);
  if (f.range >= LONG) return pick(['From across the map 🎯', 'Nobody saw this coming 🎯'], key);
  if (f.alone) return pick(['Last one standing. One shot.', 'All alone, and not giving up'], key);
  return pick(['Wait for it… 💥', 'Watch closely 👀', 'This one hurts 💥'], key);
}

/** On screen as the shot starts: who's firing what. */
export function setupCaption(x) {
  const f = facts(x);
  if (!f.shooter) return f.weapon;
  if (f.alone) return `${f.who}, the last of ${f.team}, fires the ${f.weapon}`;
  return `${f.who} (${f.team}) fires the ${f.weapon}`;
}

/** On screen once it's played out: what happened. */
export function resultCaption(x) {
  const f = facts(x);
  const left = f.teamsOut.length && f.left > 1 ? ` · ${plural(f.left, 'team')} left` : '';
  if (x.ownGoal && f.n) return `Own goal! ${plural(f.n, 'tardigrade')} down 🤦${left}`;
  if (x.ownGoal) return 'Own goal! 🤦';
  if (f.teamsOut.length) return `${f.out} are out! 💀${left}`;
  if (x.pops >= 2) return `${x.pops} popped with one shot! 💥`;
  if (x.pops === 1 && x.drowned) return `${plural(f.n, 'tardigrade')} down! 💥`;
  if (x.pops === 1) return `${f.popped[0]?.name || 'One'} popped! 💥`;
  if (x.drowned >= 2) return `${x.drowned} into the water! 🌊`;
  if (x.drowned === 1) return `${f.wet[0]?.name || 'One'} goes for a swim 🌊`;
  if (f.worst) return `${f.worst.dmg} damage to ${f.worst.name}`;
  return 'Missed… 😬';
}

/**
 * What the narrator says about a moment: a line as it's set up and one as it ends.
 * `n`: its place in a countdown (10 … 1), or 0 for none.
 */
export function narrate(x, n = 0, said = undefined) {
  const f = facts(x);
  const key = `${x.fire}${f.who}${n}`;
  const v = { ...f, who: f.who, team: f.team, weapon: f.weapon, before: f.teamsBefore };
  const start = n ? `${pick(['Number', 'At number', 'Coming in at number'], key)} ${n}. ` : '';
  const setup = f.alone
    ? pick(['{who} is the last tardigrade {team} have left, and has the {weapon}.', 'It all rests on {who}, the last of {team}. {weapon}, here goes.', 'Just {who} left for {team}. One shot with the {weapon}.', '{team} are down to {who}. Time for the {weapon}.'], key, said)
    : pick(['{who} from {team} has the {weapon}.', 'Here comes {who} with the {weapon}.', '{team} send in {who}, armed with the {weapon}.', '{who} lines up the {weapon}.', '{who} reaches for the {weapon}.', 'Over to {who}, from {team}. {weapon}.', '{who} has a plan. It involves the {weapon}.', "It's {who}'s turn, and it's the {weapon}."], key, said);
  const context = !n && f.teamsBefore > 2 ? pick([' {before} teams still in it.', ''], key + 'c') : '';
  let result;
  const p1 = f.popped[0]?.name || 'one of them';
  const w1 = f.wet[0]?.name || 'Someone';
  if (x.ownGoal) result = pick(['And… that is an own goal. Oops.', 'Oh no. Wrong target. Own goal!', "That's going to be awkward at the team meeting. Own goal.", 'Friendly fire. Very friendly. Own goal!', "Well, that's one way to do it. Own goal."], key, said);
  else if (f.teamsOut.length) result = fill(pick(['And that is the end of {out}!', '{out}: gone. Wiped off the map.', 'Goodbye, {out}!', "{out} won't be coming back from that.", 'And just like that, {out} are out.'], key, said), v) + (f.left > 1 ? ` ${plural(f.left, 'team')} left.` : '');
  else if (x.pops >= 3) result = pick([`${x.pops} popped with one shot. Incredible.`, `Look at that: ${x.pops} tardigrades popped at once!`, `${x.pops} in one go. That's the shot of the match.`, `One shot, ${x.pops} pops. Ridiculous.`], key, said);
  else if (x.pops === 2) result = pick(['Two popped with one shot!', 'A double! Two tardigrades popped.', 'Two for the price of one!', 'Two pops, one shot. Lovely.', 'And there go two of them.'], key, said);
  else if (x.pops === 1) result = pick([`${p1} pops!`, `And that's it for ${p1}.`, `Bye bye, ${p1}.`, `${p1} is out of here.`, `Pop! So long, ${p1}.`], key, said);
  else if (x.drowned) result = pick([`Splash! ${w1} goes into the water.`, 'Straight into the sea. Tardigrades can survive almost anything… but not that.', `${w1} goes for a swim. A very final swim.`, 'Into the water. Game over for that one.'], key, said);
  else if (f.worst) result = pick([`${f.worst.dmg} damage to ${f.worst.name}. That's going to leave a mark.`, `${f.worst.name} takes ${f.worst.dmg}. Still standing… just.`, `Ouch. ${f.worst.dmg} damage to ${f.worst.name}.`], key, said);
  else result = pick(['Missed. Completely.', "Not quite. Let's call it a warning shot.", 'Well. The ground had it coming.'], key, said);
  return { setup: start + fill(setup, v) + fill(context, v), result: fill(result, v) };
}

/** The narrator's opening for a long video. */
export function intro(kind, info) {
  if (kind === 'countdown')
    return `Tiny tardigrades, very big weapons, and the top ${info.count} shots from ${info.teams}. Let's count them down.`;
  return `Tiny tardigrades, very big weapons. ${info.teams} teams on one map, and only one walks away.`;
}

/** …and its closing. */
export function outro(kind, info) {
  const play = 'TardiGeddon is free to play in your browser, at tardigeddon dot com slash play.';
  if (kind === 'countdown') return `And that's your number one. ${play} See you next week.`;
  return info.winner ? `And ${info.winner} win it! ${play}` : `And that's the match. ${play}`;
}

/** SubRip subtitles from `{ start, end, text }` (seconds). */
export function srt(lines) {
  const t = (s) => {
    const ms = Math.round(s * 1000);
    const p = (n, w = 2) => String(n).padStart(w, '0');
    return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
  };
  return lines.map((l, i) => `${i + 1}\n${t(l.start)} --> ${t(l.end)}\n${l.text}\n`).join('\n');
}

/** The narration script: each line with the time to start it, for the voice. */
export function script(lines) {
  const t = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  return lines.map((l) => `[${t(l.start)}] ${l.text}`).join('\n');
}
