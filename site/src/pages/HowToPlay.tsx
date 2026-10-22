// How to play: the controls, a turn, the wind, the kinds of weapon, what's
// on the map, the map styles and game styles, and the ways to play. Keys,
// map styles and game styles come from the game's own code; the rest follows
// the game's Guide (src/ui/guide.ts), so keep the two saying the same things.

import type { ReactNode } from 'react';
import { ACTIONS, defaultControls, keyLabel } from '../../../src/input/controls';
import { DEFAULT_SCHEME } from '../../../src/sim/types';
import { SCHEME_PRESETS } from '../../../src/sim/schemes';
import { MAP_STYLES } from '../../../src/sim/terrain/generate';
import { CPU_SKILLS } from '../../../src/ai/skills';
import { PANEL_WEAPONS, WEAPONS } from '../../../src/sim/weapons';
import { PLAY_URL } from '../config';
import { Link } from '../router';
import { Shot } from '../components/Shot';

const KEYS = defaultControls().keys;

/** Weapons the wind pushes (not the season ones). */
const WINDY = PANEL_WEAPONS.filter((w) => {
  if (w.locked) return false;
  const spec = w.projectile ?? (w.strike ? WEAPONS[w.strike.weapon].projectile : w.shower ? WEAPONS[w.shower.weapon].projectile : undefined);
  return (spec?.windFactor ?? 0) > 0;
});

/** A picture of each map style (site/capture: the "realms" scene). */
const MAP_SHOTS: Record<string, string> = {
  islands: 'shot-realm-islands',
  mainland: 'shot-realm-mainland',
  archipelago: 'shot-realm-archipelago',
  sky: 'shot-realm-sky',
  spires: 'shot-realm-spires',
  canyon: 'shot-realm-canyon',
  caverns: 'shot-realm-caverns',
};

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="paper guide-section" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="display">
        {title}
      </h2>
      {children}
    </section>
  );
}

const CONTENTS = [
  ['start', 'Getting started'],
  ['controls', 'Controls'],
  ['turns', 'Your turn'],
  ['wind', 'Wind'],
  ['weapons', 'Kinds of weapon'],
  ['map', 'Things on the map'],
  ['maps', 'Maps and weather'],
  ['styles', 'Game styles'],
  ['modes', 'Ways to play'],
] as const;

export function HowToPlay() {
  return (
    <div className="page page-wide how-page">
      <h1 className="display section-title">How to play</h1>
      <p className="lead">
        Each team takes turns to move one tardigrade, aim and fire. The last team with anyone left standing wins. Here’s
        everything you need to know, and the game’s own 📖 Guide (in the lobby) has it all too.
      </p>
      <nav className="paper toc" aria-label="On this page">
        <ul>
          {CONTENTS.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`}>{label}</a>
            </li>
          ))}
        </ul>
      </nav>

      <Section id="start" title="Getting started">
        <ol className="steps">
          <li>
            <strong>Open the game</strong> in your browser: <a href={PLAY_URL}>tardigeddon.com/play</a>. Nothing to
            download and no account needed.
          </li>
          <li>
            <strong>New here?</strong> Press 🎓 <em>New? Learn to play</em> in the lobby: a short tutorial walks you
            through moving, aiming and firing. 🎯 <em>Practice</em> gives you targets to hit with unlimited ammo.
          </li>
          <li>
            <strong>Press Play</strong> for a match against the computer, or <em>Play online</em> to play people. Change
            the teams, the game style and the rules in <em>Match setup</em>.
          </li>
        </ol>
        <figure className="screen guide-shot">
          <Shot
            name="shot-home"
            alt="The game's lobby: your team, Play and Play online, Learn to play, Practice, Daily challenge and Replays, and the match setup with every rule."
            width={1600}
            height={900}
          />
        </figure>
      </Section>

      <Section id="controls" title="Controls">
        <div className="two-col">
          <div>
            <h3>Keyboard and mouse</h3>
            <table className="keys">
              <tbody>
                {ACTIONS.filter((a) => !a.id.startsWith('fuse')).map((a) => (
                  <tr key={a.id}>
                    <th scope="row">{a.name}</th>
                    <td>
                      {KEYS[a.id].map((k) => (
                        <kbd key={k}>{keyLabel(k)}</kbd>
                      ))}
                    </td>
                  </tr>
                ))}
                <tr>
                  <th scope="row">Fuse (grenades and bombs)</th>
                  <td>
                    <kbd>1</kbd>–<kbd>5</kbd>
                  </td>
                </tr>
                <tr>
                  <th scope="row">Pick a spot (strikes, Teleport, Girder)</th>
                  <td>Click the map</td>
                </tr>
              </tbody>
            </table>
            <p className="small">
              Every key and mouse button can be changed in the game’s Settings → Controls. Signed in, your controls follow
              you to any device.
            </p>
          </div>
          <div>
            <h3>Phones and tablets</h3>
            <ul>
              <li>
                <strong>◀ ▶</strong> walk, <strong>▲ ▼</strong> aim, <strong>Jump</strong> and <strong>Fire</strong> are
                on-screen buttons. Hold Fire to charge a shot and let go to throw.
              </li>
              <li>
                <strong>Drag from your tardigrade</strong> to aim, and drag the map to look around.
              </li>
              <li>
                <strong>Tap the map</strong> to pick a spot for strikes, the Teleport and the Twig Girder.
              </li>
              <li>
                <strong>The weapon button</strong> (bottom right) opens the weapon panel.
              </li>
              <li>
                In Settings you can make the buttons bigger, swap them to the other side, or choose{' '}
                <em>Tap to fire</em> so you don’t have to hold Fire.
              </li>
            </ul>
          </div>
        </div>
        <figure className="screen guide-shot">
          <Shot
            name="shot-phone"
            alt="The game on a phone held sideways, with big touch buttons for moving, aiming, jumping and firing."
            width={1400}
            height={584}
          />
        </figure>
      </Section>

      <Section id="turns" title="Your turn">
        <ul>
          <li>
            <strong>One tardigrade a turn.</strong> Walk, jump, aim and fire before the timer runs out (
            {DEFAULT_SCHEME.turnTime} seconds in a standard match).
          </li>
          <li>
            <strong>After you fire</strong> you get {DEFAULT_SCHEME.retreatTime} seconds to run for cover.
          </li>
          <li>
            <strong>Pop them all.</strong> A tardigrade pops when its health reaches 0, or if it falls in the water or off
            the map. Big falls hurt too.
          </li>
          <li>
            <strong>Friendly fire:</strong> your own blasts can hurt your team, and you! Don’t stand next to your target.
            You can switch it off in Match setup → Customise.
          </li>
          <li>
            <strong>Sudden death:</strong> when the round clock runs out, every tardigrade drops to 1 health and the water
            starts to rise.
          </li>
        </ul>
      </Section>

      <Section id="wind" title="Wind">
        <ul>
          <li>
            <strong>The bar at the top</strong> of the screen is the wind: ◀ blows left, ▶ blows right, and a longer bar
            is a stronger wind. It changes every turn.
          </li>
          <li>
            <strong>It pushes:</strong> {WINDY.map((w) => `${w.icon} ${w.name}`).join(', ')}.
          </li>
          <li>
            <strong>It doesn’t push</strong> grenades, bombs or anything that bounces or rolls.
          </li>
          <li>
            <strong>Strikes from the sky</strong> land on the spot you pick when there’s no wind, and drift when there is:
            aim upwind to make up for it.
          </li>
        </ul>
      </Section>

      <Section id="weapons" title="Kinds of weapon">
        <ul>
          <li>
            <strong>Hold Fire, let go:</strong> most weapons. Aim, hold Fire to charge, let go to throw. Yellow dots show
            where the shot will start to fly.
          </li>
          <li>
            <strong>Grenades and bombs</strong> bounce, then go off when their fuse runs out: set it from 1 to 5 seconds.
          </li>
          <li>
            <strong>Pick a spot:</strong> strikes, the Teleport and the Twig Girder. Tap or click the map, then press Fire.
          </li>
          <li>
            <strong>Silk Rope:</strong> fire it at the rock to swing, climb with ▲▼ and let go with Jump.{' '}
            <strong>Leaf Parachute:</strong> jump off something, then Fire.
          </li>
        </ul>
        <p>
          Every weapon in the game’s panel has a tag saying how it’s used. See them all on the{' '}
          <Link to="/weapons">Weapons</Link> page.
        </p>
        <figure className="screen guide-shot">
          <Shot
            name="shot-weapons"
            alt="The weapon panel: each weapon with a tag saying how it’s used, such as On impact, Bounces, fuse or From the sky."
            width={1280}
            height={720}
          />
        </figure>
      </Section>

      <Section id="map" title="Things on the map">
        <ul>
          <li>
            <strong>Mines</strong> arm when a tardigrade comes close and go off {DEFAULT_SCHEME.mineFuse} seconds later.
            Some are duds.
          </li>
          <li>
            <strong>Brine drums</strong> burst when hit hard: a big bang and a spray of salty blobs.
          </li>
          <li>
            <strong>Crates</strong> float down on parachutes. Walk into one: weapon crates give you ammo, health crates heal
            and cure poison.
          </li>
          <li>
            <strong>Poison</strong> takes a little health every turn, but never pops a tardigrade on its own.
          </li>
          <li>
            <strong>Armour</strong> (the Armoured style) soaks up half of each hit until it cracks.
          </li>
        </ul>
      </Section>

      <Section id="maps" title="Maps and weather">
        <p>Every match is a new map, in one of {MAP_STYLES.length} styles. Pick one in Customise, or leave it on Surprise me.</p>
        <ul className="map-list">
          {MAP_STYLES.map((m) => (
            <li key={m.id}>
              {MAP_SHOTS[m.id] && (
                <div className="screen map-thumb">
                  <Shot name={MAP_SHOTS[m.id]} alt={`A ${m.name} map.`} width={1200} height={676} />
                </div>
              )}
              <strong>{m.name}:</strong> {m.blurb}
            </li>
          ))}
        </ul>
        <p>
          <strong>Weather</strong> (rain, snow, sunshine, fog and storms) is just for looks: it never moves your shots.
          Except for the very rare tornado, which picks up every tardigrade and drops them somewhere new.
        </p>
      </Section>

      <Section id="styles" title="Game styles">
        <div className="styles-grid">
          {SCHEME_PRESETS.map((p) => (
            <article className="style-card" key={p.id}>
              <h3>{p.name}</h3>
              <p>{p.blurb}</p>
            </article>
          ))}
        </div>
        <p>Or make your own: Customise changes the turn time, health, mines, crates, wind, armour and more.</p>
      </Section>

      <Section id="modes" title="Ways to play">
        <div className="screen guide-side">
          <Shot name="shot-online" alt="The Play online screen: Quick play, Create a room, and a box for a friend's room code." width={900} height={938} />
        </div>
        <ul>
          <li>
            <strong>Against the computer:</strong> {CPU_SKILLS.map((s) => s.name).join(', ')}. Tougher CPUs read the wind
            better and miss less.
          </li>
          <li>
            <strong>Hot-seat:</strong> up to 10 teams taking turns on one device.
          </li>
          <li>
            <strong>Online:</strong> Quick play finds you a match with other players, or create a room and send your friends
            its 5-letter code. You can also watch a room without playing.
          </li>
          <li>
            <strong>Daily challenges:</strong> Target Smash and Rope Race, the same map for everyone, with{' '}
            <Link to="/leaderboards">leaderboards</Link>.
          </li>
          <li>
            <strong>Map editor:</strong> draw your own map, play it, and share it with friends as a file.
          </li>
          <li>
            <strong>Replays:</strong> every match is kept in 🎬 Replays, and the results screen can play the winning shot
            again.
          </li>
        </ul>
      </Section>

      <p className="page-cta">
        <a className="btn btn-play btn-huge" href={PLAY_URL}>
          Play now
        </a>
      </p>
    </div>
  );
}
