// The Guide: how the game works, in short cards: the basics, the wind,
// the kinds of weapon, the things on the map (mines, brine drums, crates)
// and playing online (quick play, private rooms with friends, staying safe).
// A page of the menu hub (reached from the lobby and Settings); the online
// part also shows on the online screen.

import { MAP_STYLES } from '../sim/terrain/generate';
import { WEAPONS } from '../sim/weapons';
import { DEFAULT_SCHEME } from '../sim/types';
import type { HubContext } from './hub';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** A card: a title and a list of points ("**Bold:** rest" puts the start in bold). */
function card(section: string, title: string, points: string[], intro?: string): HTMLElement {
  const c = el('section', 'card guide-card');
  c.dataset.section = section;
  c.append(el('h2', 'card-title', title));
  if (intro) c.append(el('p', 'account-note', intro));
  const ul = el('ul', 'guide-list');
  for (const p of points) {
    const li = el('li');
    const m = /^\*\*(.+?)\*\*\s*(.*)$/.exec(p);
    // No space before punctuation straight after the bold part.
    if (m) li.append(el('b', '', m[1]), /^[,.;:]/.test(m[2]) ? '' : ' ', m[2]);
    else li.textContent = p;
    ul.append(li);
  }
  c.append(ul);
  return c;
}

const names = (pred: (id: string) => boolean) =>
  Object.values(WEAPONS)
    .filter((w) => !w.hidden && !w.locked && pred(w.id))
    .map((w) => `${w.icon} ${w.name}`)
    .join(', ');

/** Weapons the wind pushes: their own shot, or the drops they rain down. */
function windWeapons(): string {
  return names((id) => {
    const w = WEAPONS[id];
    const spec = w.projectile ?? (w.strike ? WEAPONS[w.strike.weapon].projectile : w.shower ? WEAPONS[w.shower.weapon].projectile : undefined);
    return (spec?.windFactor ?? 0) > 0;
  });
}

/** Playing online: the card, shared with the online screen. */
export function onlineGuide(): HTMLElement {
  return card(
    'online',
    '🌐 Playing online',
    [
      '**Quick play:** play people you don’t know. Tap Quick play and you’re matched with up to 3 other players. Everyone gets a made-up team name, so nobody sees the names you typed. Tired of waiting? Tap “Play a CPU instead”.',
      '**With friends:** tap “Create a room”, then share the 5-letter room code or the invite link. Your friends type the code in the Room code box and tap Join (or just open the link). The host can add CPU teams, picks the game style and starts the match.',
      '**Slow or dropped connection?** You’ll see ⚠️ Slow connection, and if it stops for a few seconds the game reconnects by itself and puts you back in your place. While you’re away, the computer plays your turns.',
      '**Rematch:** after a match everyone goes back to the room, so you can play again straight away.',
      '**Stats and Slime:** sign in to earn Slime and keep your stats from online games.',
      '**Staying safe:** there is no chat. Names are checked for anything rude or personal. Use ⚑ Report or 🚫 Block next to a player in the room, or the 👥 button in a match. Blocked players never join your quick-play games.',
    ],
    'Online play needs an internet connection; everything else works without one.',
  );
}

export function renderGuidePage(ctx: HubContext, onTutorial: () => void, onPractice: () => void): HTMLElement {
  const root = el('div', 'page page-guide');

  const start = el('section', 'card guide-card guide-start');
  start.append(el('h2', 'card-title', '📖 Guide'), el('p', 'account-note', 'New here? The tutorial walks you through the controls. Practice gives you unlimited ammo and targets to hit: pop 10 of them, or keep going with endless targets.'));
  const row = el('div', 'guide-buttons');
  const tut = el('button', 'big-btn', '🎓 Tutorial');
  tut.onclick = onTutorial;
  const prac = el('button', 'big-btn secondary', '🎯 Practice');
  prac.onclick = onPractice;
  const keys = el('button', 'hud-btn', '⚙️ Controls');
  keys.onclick = () => ctx.go('settings');
  row.append(tut, prac, keys);
  start.append(row);

  root.append(
    start,
    card('basics', '🎮 The basics', [
      '**Take turns:** each team plays one tardigrade per turn. Walk, jump, aim and fire before the timer runs out.',
      '**Last team standing wins.** A tardigrade pops when its health reaches 0, or if it falls in the water or off the map.',
      '**After you fire** you get a few seconds to run for cover.',
      '**Friendly fire:** watch out, your own weapons can hurt your own team, and you too! Don’t stand next to your target, and keep your team out of your blasts. You can turn it off in Match setup → Customise → Friendly fire, and then your weapons only hurt the other teams.',
      '**Sudden death:** when the round clock runs out, every tardigrade drops to 1 health and the water starts to rise.',
    ]),
    card(
      'wind',
      '💨 Wind',
      [
        '**The bar at the top** of the screen is the wind. ◀ means it blows left, ▶ means right. More arrows and a longer bar mean a stronger wind.',
        '**It changes every turn**, so check it before you fire.',
        `**It pushes:** ${windWeapons()}, and some season weapons.`,
        '**It doesn’t push** grenades, bombs or anything that rolls and bounces.',
        '**Rain from the sky** (strikes) falls on your target when there’s no wind, and drifts with it when there is: aim upwind to make up for it.',
        '**Parachutes and flames** drift with the wind too.',
      ],
    ),
    card('weapons', '🎯 Kinds of weapon', [
      '**Hold Fire, let go:** most weapons. Aim with ▲▼ (or drag from your tardigrade), hold Fire to charge, let go to shoot.',
      '**Grenades and bombs** have a fuse: set it with the ⏱ button or keys 1–5.',
      '**Pick a spot:** strikes, Teleport and the Twig Girder. Tap or click the map to choose where, then press Fire. There’s no aiming, so ▲▼ disappear.',
      '**Twig Girder:** tap where to build, turn it with ▲▼, then Fire. It can rest on the ground or bridge a gap, but not be buried in it, or go through a tardigrade.',
      '**Silk Rope:** aim and Fire to swing; ▲▼ climb, Jump lets go. While you aim, dots show where it will catch (a green ring) or that nothing is in reach (a red ✕). Miss, and it says how far short you were. **Leaf Parachute:** jump off something, then Fire.',
    ]),
    card('map', '🛢️ Things on the map', [
      `**Mines:** they arm when a tardigrade comes close and go off ${DEFAULT_SCHEME.mineFuse} seconds later. Some are duds. A blast nearby sets them off at once.`,
      '**Brine drums:** barrels of salty water. Hit one hard enough (one good blast) and it bursts: a big bang, then a spray of brine blobs that pop wherever they land. Keep your own team away from them, and use them to hurt anyone standing close.',
      '**Crates:** float down on parachutes. Walk into one to take it: weapon crates give you extra ammo, health crates heal and cure poison. A blast breaks crates open.',
      '**Poison** (the Cyanobloom Cloud) takes a little health at the start of every turn, but never pops a tardigrade on its own.',
      '**Armour** (the Armoured game style, or Customise → Armour): the grey +number by a tardigrade’s health. It takes half of each hit until it’s used up, and is gone in sudden death.',
    ]),
    card('realms', '🌍 Maps and weather', [
      `**Every match is a different kind of map:** ${MAP_STYLES.map((m) => m.name).join(', ')}. Pick one in Match setup → Customise → Map, or leave it on Surprise me.`,
      '**Weather** (rain, snow, sunshine, fog, storms) is just for looks: it never moves your shots. The rain and snow do lean with the wind, though.',
      '**Tornadoes** are very rare. One picks up every tardigrade and drops them somewhere new. Storms bring them more often. Turn weather off in Customise if you’d rather not.',
      '**Change how the world looks** with 🏞️ World on the lobby: Surprise me picks a different look every match.',
    ]),
    onlineGuide(),
  );
  return root;
}
