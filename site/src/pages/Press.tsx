// Press kit: everything a journalist, streamer or directory needs to write
// about the game. Facts come from the game's own data where they can.

import { PANEL_WEAPONS } from '../../../src/sim/weapons';
import { MAP_STYLES } from '../../../src/sim/terrain/generate';
import { SCHEME_PRESETS } from '../../../src/sim/schemes';
import { LANGS } from '../../../src/i18n/i18n';
import { MAX_TEAMS } from '../../../src/sim/rosters';
import { CPU_SKILLS } from '../../../src/ai/skills';
import { PLAY_URL, SITE_URL } from '../config';

const WEAPONS = PANEL_WEAPONS.filter((w) => w.id !== 'skip').length;

export const SHORT_DESCRIPTION = 'TardiGeddon is a free turn-based artillery game starring tardigrades, the toughest animals on Earth, that plays in your browser.';

export const LONG_DESCRIPTION = `TardiGeddon is a free turn-based artillery game starring tardigrades. Teams take turns to walk, aim and fire across destructible maps, allowing for the wind, with ${WEAPONS} weapons from the Spore Bazooka to the Concrete Tun. Every match is a new map in one of ${MAP_STYLES.length} styles, from floating Sky Realms to tunnel-riddled Caverns. Play against the computer, with up to ${MAX_TEAMS} teams on one device, or online with friends, plus a new daily challenge with leaderboards. It plays in any modern browser on computers, phones and tablets, with no download, no ads, and nothing to buy that helps you win.`;

const MEDIA = [
  { file: 'og-home.jpg', label: 'Key art (1200×630)' },
  { file: 'logo.png', label: 'Logo (transparent PNG)' },
  { file: 'shot-crater.webp', label: 'A shaft blasted through the ground' },
  { file: 'shot-realm-sky.webp', label: 'Sky Realms, on a sunny day' },
  { file: 'shot-realm-spires.webp', label: 'Spires, in the snow' },
  { file: 'shot-realm-canyon.webp', label: 'Canyon, in the rain' },
  { file: 'shot-challenge.webp', label: 'Target Smash, a daily challenge' },
  { file: 'shot-emblem.webp', label: 'The team emblem builder' },
  { file: 'shot-weapons.webp', label: 'The weapon panel' },
  { file: 'shot-phone.webp', label: 'On a phone, with touch controls' },
  { file: 'shot-home.webp', label: 'The lobby' },
  { file: 'clip-tun.mp4', label: 'Clip: the Concrete Tun' },
  { file: 'clip-rope.mp4', label: 'Clip: Rope Race' },
  { file: 'clip-victory.mp4', label: 'Clip: a win and a victory dance' },
];

export function Press() {
  return (
    <div className="page page-wide press-page">
      <h1 className="display section-title">Press kit</h1>
      <p className="lead">
        Writing about TardiGeddon, streaming it or listing it? Everything you need is here. Use any of it freely to cover
        the game, and get in touch at <a href="mailto:support@tardigeddon.com">support@tardigeddon.com</a> for anything
        else.
      </p>

      <div className="press-grid">
        <section className="paper guide-section" aria-labelledby="facts">
          <h2 id="facts" className="display">
            Fact sheet
          </h2>
          <dl className="facts-list">
            <dt>Game</dt>
            <dd>TardiGeddon</dd>
            <dt>Developer</dt>
            <dd>EVCV Limited, Warwickshire, England</dd>
            <dt>Genre</dt>
            <dd>Turn-based artillery, multiplayer</dd>
            <dt>Platforms</dt>
            <dd>Web browser (computers, phones, tablets). Android app coming soon.</dd>
            <dt>Price</dt>
            <dd>Free. Optional coins for looks only; no ads.</dd>
            <dt>Players</dt>
            <dd>
              1 to {MAX_TEAMS} teams: against the computer ({CPU_SKILLS.map((s) => s.name).join(', ')}), on one device, or
              online
            </dd>
            <dt>Content</dt>
            <dd>
              {WEAPONS} weapons, {MAP_STYLES.length} map styles, {SCHEME_PRESETS.length} game styles, daily challenges,
              a map editor and replays
            </dd>
            <dt>Languages</dt>
            <dd>{LANGS.map((l) => l.name).join(', ')}</dd>
            <dt>Website</dt>
            <dd>
              <a href={SITE_URL}>{SITE_URL.replace('https://', '')}</a> (the game is at{' '}
              <a href={PLAY_URL}>tardigeddon.com/play</a>)
            </dd>
            <dt>Contact</dt>
            <dd>
              <a href="mailto:support@tardigeddon.com">support@tardigeddon.com</a>
            </dd>
          </dl>
        </section>

        <section className="paper guide-section" aria-labelledby="about">
          <h2 id="about" className="display">
            About the game
          </h2>
          <h3>In one line</h3>
          <p>{SHORT_DESCRIPTION}</p>
          <h3>In a paragraph</h3>
          <p>{LONG_DESCRIPTION}</p>
          <h3>Things worth knowing</h3>
          <ul>
            <li>Real tardigrades can survive extreme heat and cold, radiation and even the vacuum of space, which is why ours are so hard to pop.</li>
            <li>Every blast takes a bite out of the map, and the wind changes every turn.</li>
            <li>Fair play: money only buys looks. Weapons unlock with Slime, which you earn by playing.</li>
            <li>Safe online play: no chat, names checked, and Report and Block on every player.</li>
            <li>Accessibility settings include a colour-blind palette, high contrast, calmer effects and rebindable controls.</li>
          </ul>
        </section>
      </div>

      <section className="paper guide-section" aria-labelledby="media">
        <h2 id="media" className="display">
          Logo, screenshots and clips
        </h2>
        <p>All captured from the game itself. Click to open full size, or right-click to save.</p>
        <ul className="press-media">
          {MEDIA.map((m) => (
            <li key={m.file}>
              <a href={`/media/${m.file}`} target="_blank" rel="noopener" download>
                {m.file.endsWith('.mp4') ? (
                  <img src={`/media/${m.file.replace('.mp4', '-poster.webp')}`} alt="" loading="lazy" decoding="async" />
                ) : (
                  <img src={`/media/${m.file}`} alt="" loading="lazy" decoding="async" />
                )}
                <span>{m.label}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="paper guide-section" aria-labelledby="company">
        <h2 id="company" className="display">
          About EVCV Limited
        </h2>
        <p>
          EVCV Limited is an independent company in England (company number 13570383), and the developer and publisher
          of TardiGeddon.
        </p>
      </section>
    </div>
  );
}
