// Home page: the mascot, the pitch, real clips and screenshots from the
// game, and a big "Play now". Facts (weapon count, map styles, game styles)
// come straight from the game's own data so they never go stale.

import { useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { PANEL_WEAPONS } from '../../../src/sim/weapons';
import { SCHEME_PRESETS } from '../../../src/sim/schemes';
import { MAP_STYLES } from '../../../src/sim/terrain/generate';
import { CPU_SKILLS } from '../../../src/ai/skills';
import { LANGS } from '../../../src/i18n/i18n';
import { MAX_TEAMS } from '../../../src/sim/rosters';
import { weaponUse } from '../../../src/ui/weaponUse';
import { TEAM_COLORS, TEAM_NAMES, hex } from '../../../src/render/palette';
import { HATS } from '../../../src/render/hats';
import { EMBLEM_COLORS, EMBLEM_ICONS, EMBLEM_PATTERNS, EMBLEM_SHAPES } from '../../../src/render/emblems';
import { prefersReducedMotion } from '../motion/SmoothScroll';
import { startedFromHtml } from '../boot';
import SplitText from '../reactbits/SplitText';
import { Mascot } from '../components/Mascot';
import { Clip } from '../components/Clip';
import { Shot } from '../components/Shot';
import { Link } from '../router';
import { PLAY_URL } from '../config';
import { EGGS } from '../../../src/eggs';

const WEAPONS = PANEL_WEAPONS.filter((w) => w.id !== 'skip');
const WEARABLE_HATS = HATS.filter((h) => h.id !== 'none');

/** Every emblem the builder can make: shape × picture × two colours × pattern. */
const EMBLEMS = EMBLEM_SHAPES.length * EMBLEM_ICONS.length * EMBLEM_COLORS.length * EMBLEM_COLORS.length * EMBLEM_PATTERNS.length;
const EMBLEM_COUNT = EMBLEMS >= 2e6 ? `over ${Math.floor(EMBLEMS / 1e6)} million` : EMBLEMS >= 1e6 ? 'over a million' : `${EMBLEMS.toLocaleString('en-GB')}`;

const FACTS = [
  { n: WEAPONS.length, label: 'weapons' },
  { n: MAP_STYLES.length, label: 'map styles' },
  { n: SCHEME_PRESETS.length, label: 'game styles' },
  { n: MAX_TEAMS, label: 'teams in a match' },
  { n: LANGS.length, label: 'languages' },
];

export function Home() {
  const root = useRef<HTMLDivElement>(null);
  // No entrance for the title with reduced motion, or when the page's HTML is
  // already on screen (written at build time): don't hide it again to play one.
  const [still] = useState(() => prefersReducedMotion() || startedFromHtml());


  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        // The mascot bobs about, as tardis do while they wait for their turn.
        gsap.to('.hero-mascot', { y: -14, rotation: -5, duration: 1.3, ease: 'sine.inOut', yoyo: true, repeat: -1 });
        if (!still) {
          gsap.from('.hero .reveal', { y: 34, opacity: 0, duration: 0.8, ease: 'back.out(1.7)', stagger: 0.12, delay: 0.35 });
          gsap.from('.hero-screen', { y: 80, rotation: 4, opacity: 0, duration: 1, ease: 'back.out(1.4)', delay: 0.5 });
        }
        gsap.from('.fact', {
          y: 30,
          opacity: 0,
          duration: 0.6,
          ease: 'back.out(2)',
          stagger: 0.07,
          scrollTrigger: { trigger: '.facts', start: 'top 90%' },
        });
        for (const row of gsap.utils.toArray<HTMLElement>('.feature')) {
          gsap.from(row.querySelectorAll('.feature-media, .feature-text'), {
            y: 70,
            opacity: 0,
            duration: 0.9,
            ease: 'back.out(1.4)',
            stagger: 0.12,
            scrollTrigger: { trigger: row, start: 'top 80%' },
          });
        }
        gsap.from('.weapon-chip', {
          scale: 0,
          opacity: 0,
          duration: 0.5,
          ease: 'back.out(2.5)',
          stagger: 0.03,
          scrollTrigger: { trigger: '.weapon-cloud', start: 'top 85%' },
        });
        for (const grid of gsap.utils.toArray<HTMLElement>('.pop-grid')) {
          gsap.from(grid.children, {
            y: 50,
            opacity: 0,
            duration: 0.7,
            ease: 'back.out(1.6)',
            stagger: 0.08,
            scrollTrigger: { trigger: grid, start: 'top 82%' },
          });
        }
        // The eggs wobble now and then, as if something's about to hatch.
        gsap.to('.egg-eggs .egg', {
          keyframes: { rotation: [0, -14, 12, -8, 6, 0] },
          duration: 0.9,
          ease: 'sine.inOut',
          stagger: 0.15,
          repeat: -1,
          repeatDelay: 1.6,
        });
        gsap.from('.egg-card', {
          scale: 0.85,
          rotation: -3,
          opacity: 0,
          duration: 0.8,
          ease: 'back.out(2)',
          scrollTrigger: { trigger: '.egg-hunt', start: 'top 85%' },
        });
        gsap.to('.cta-mascot', { rotation: 8, duration: 0.35, ease: 'sine.inOut', yoyo: true, repeat: -1 });
      });
    },
    { scope: root },
  );

  return (
    <div ref={root}>
      <section className="hero">
        <div className="hero-head">
          <Mascot className="hero-mascot" label="The TardiGeddon mascot: a tardigrade in a red beanie" />
          {still ? (
            <h1 className="display hero-title">
              Tardi<span className="geddon">Geddon</span>
            </h1>
          ) : (
            <SplitText
              text="TardiGeddon"
              tag="h1"
              className="display hero-title"
              delay={60}
              from={{ opacity: 0, y: 60, rotate: -8 }}
              to={{ opacity: 1, y: 0, rotate: 0 }}
            />
          )}
          <p className="hero-tagline reveal">Tiny. Indestructible. Armed.</p>
        </div>
        <div className="hero-text">
          <p className="hero-pitch reveal">
            A turn-based artillery game starring the toughest animals on Earth. Lob spore bazookas, call down raindrop
            strikes, drop a Concrete Tun on your mates and swing across the map on a silk rope. Against the computer, round
            one device, or online.
          </p>
          <div className="hero-actions reveal">
            <a className="btn btn-play btn-huge" href={PLAY_URL}>
              Play now
            </a>
            <ul className="badges" aria-label="Good to know">
              <li>Free</li>
              <li>No ads</li>
              <li>No download</li>
              <li>Never pay-to-win</li>
            </ul>
            <p className="hero-free">
              Plays in your browser on computers, phones and tablets. <strong>Android app coming soon.</strong>
            </p>
          </div>
        </div>
        <figure className="hero-screen screen">
          <Clip name="clip-tun" label="Gameplay: a Concrete Tun smashes down through the ground onto a huddle of tardigrades, knocking one into the sea, and the other team lobs a grenade back." />
        </figure>
      </section>

      <ul className="facts" aria-label="In numbers">
        {FACTS.map((f) => (
          <li className="fact" key={f.label}>
            <strong>{f.n}</strong> {f.label}
          </li>
        ))}
      </ul>

      <section className="egg-hunt" aria-labelledby="egg-hunt-title">
        <Link to="/eggs" className="egg-card">
          <span className="egg-sticker" aria-hidden="true">
            Shh! Top secret
          </span>
          <span className="egg-eggs" aria-hidden="true">
            <span className="egg">🥚</span>
            <span className="egg">🥚</span>
            <span className="egg">🥚</span>
          </span>
          <span className="egg-text">
            <span id="egg-hunt-title" className="display egg-title">
              Whoa, what’s this?!
            </span>
            <span className="egg-lead">
              There are <strong>{EGGS.length} secret easter eggs</strong> hidden in TardiGeddon. We won’t tell you where,
              but we will give you riddles. Can you find them all?
            </span>
            <span className="btn btn-play egg-go">Start the egg hunt →</span>
          </span>
        </Link>
      </section>

      <section className="features" aria-label="What's in the game">
        <article className="feature">
          <div className="feature-media screen">
            <Shot
              name="shot-crater"
              alt="A deep shaft blasted through the ground, with a tardigrade standing at the bottom of it."
              width={1280}
              height={720}
            />
          </div>
          <div className="feature-text">
            <h2 className="display">Blow up the scenery</h2>
            <p>
              Every blast takes a bite out of the map. Mind the wind, bounce grenades round corners, set off mines and brine
              drums, or skip the subtlety and drop a Concrete Tun: it smashes down through the ground, slamming six times on
              the way.
            </p>
            <p className="feature-link">
              <Link to="/weapons">See all {WEAPONS.length} weapons →</Link>
            </p>
          </div>
        </article>

        <article className="feature flip">
          <div className="feature-media realm-mosaic">
            {(['sky', 'spires', 'canyon', 'caverns'] as const).map((id) => (
              <div className="screen" key={id}>
                <Shot name={`shot-realm-${id}`} alt={`A ${MAP_STYLES.find((m) => m.id === id)!.name} map.`} width={1200} height={676} />
              </div>
            ))}
          </div>
          <div className="feature-text">
            <h2 className="display">A new world every match</h2>
            <p>
              {MAP_STYLES.length} kinds of map, from floating Sky Realms to tunnel-riddled Caverns and towering Spires, each
              one different every time. Rain, snow, sunshine, fog and storms roll in (and once in a blue moon, a tornado that
              scatters everyone). Seasonal worlds turn up for Halloween, winter, summer and more.
            </p>
          </div>
        </article>

        <article className="feature">
          <div className="feature-media screen">
            <Clip name="clip-rope" label="Rope Race: a tardigrade swings from rope to rope under a rocky ceiling." />
          </div>
          <div className="feature-text">
            <h2 className="display">Swing on a silk rope</h2>
            <p>
              Fire the Silk Rope, swing, let go and fire it again: it gets you anywhere. Or play Rope Race, where nobody fights
              and the fastest run to the flag wins.
            </p>
          </div>
        </article>

        <article className="feature flip">
          <div className="feature-media screen screen-tall">
            <Shot
              name="shot-emblem"
              alt="The team emblem builder: a cupcake on a blue cloud, with rows of shapes, pictures, colours and patterns to choose from."
              width={762}
              height={1350}
            />
          </div>
          <div className="feature-text">
            <h2 className="display">Make the team yours</h2>
            <p>
              Name your team and every tardigrade, pick a colour and a hat, and build an emblem from {EMBLEM_COUNT}{' '}
              combinations. Unlock skins, aim styles, explosion effects, victory dances and gravestones, and show them off to
              everyone you play.
            </p>
            <ul className="squad" aria-label="Some of the default teams">
              {TEAM_NAMES.slice(0, 5).map((name, i) => (
                <li className="squad-member" key={name}>
                  <Mascot color={TEAM_COLORS[i]} hat={WEARABLE_HATS[i % WEARABLE_HATS.length].id} label="" />
                  <span style={{ color: hex(TEAM_COLORS[i]) }}>{name}</span>
                </li>
              ))}
            </ul>
          </div>
        </article>

        <article className="feature">
          <div className="feature-media screen">
            <Shot
              name="shot-challenge"
              alt="Target Smash: a row of target tardigrades along a hilltop, waiting to be popped."
              width={1600}
              height={900}
            />
          </div>
          <div className="feature-text">
            <h2 className="display">A new challenge every day</h2>
            <p>
              Target Smash and Rope Race: the same map for everyone, every day. Sign in to post your best run, and see how you
              stack up. Every score is checked by playing the run back on our server, so no cheating.
            </p>
            <p className="feature-link">
              <Link to="/leaderboards">Today’s leaderboards →</Link>
            </p>
          </div>
        </article>

        <article className="feature flip">
          <div className="feature-media screen">
            <Clip name="clip-victory" label="A Raindrop Strike finishes off the last enemies, then the winner dances in the confetti saying Too easy!" />
          </div>
          <div className="feature-text">
            <h2 className="display">Win with style</h2>
            <p>
              Tardigrades taunt, make excuses and shout their last words before they curl up and pop. Win, and your team
              dances in the confetti. Then see who did the damage, share the result, or watch the winning shot again.
            </p>
          </div>
        </article>

        <article className="feature">
          <div className="feature-media feature-pair">
            <div className="screen">
              <Shot
                name="shot-phone"
                alt="The game on a phone held sideways, with big touch buttons for moving, aiming, jumping and firing."
                width={1400}
                height={584}
              />
            </div>
            <div className="screen screen-card">
              <Shot
                name="shot-lobby"
                alt="An online room with its five-letter code, three teams and a Start match button."
                width={900}
                height={1022}
              />
            </div>
          </div>
          <div className="feature-text">
            <h2 className="display">Play anywhere, with anyone</h2>
            <p>
              Touch controls on phones and tablets, keyboard and mouse on computers. Take on the computer ({CPU_SKILLS.map((s) => s.name).join(', ')}),
              pass one device round for battles of up to {MAX_TEAMS} teams, or play online: Quick play finds you a match, or
              make a room and send your friends the code.
            </p>
          </div>
        </article>
      </section>

      <section className="band weapons-band">
        <h2 className="display section-title">{WEAPONS.length} ways to ruin someone's day</h2>
        <ul className="weapon-cloud">
          {WEAPONS.map((w) => (
            <li className={`weapon-chip${w.super ? ' super' : ''}`} key={w.id} title={`${weaponUse(w).label}: ${w.blurb ?? ''}`}>
              <span aria-hidden="true">{w.icon}</span> {w.name}
            </li>
          ))}
        </ul>
        <p className="band-note">
          Gold ones are superweapons: find them in crates, or switch them on in the game settings.{' '}
          <Link to="/weapons">What does each one do?</Link>
        </p>
      </section>

      <section className="band">
        <h2 className="display section-title">Fair and friendly</h2>
        <div className="pop-grid promise-grid">
          <article className="paper promise">
            <span className="promise-icon" aria-hidden="true">
              🎁
            </span>
            <h3>Free, with no ads</h3>
            <p>Every map, mode and weapon is free to play. No adverts, no tracking, no account needed.</p>
          </article>
          <article className="paper promise">
            <span className="promise-icon" aria-hidden="true">
              ⚖️
            </span>
            <h3>Never pay-to-win</h3>
            <p>
              Coins only buy looks. Weapons unlock with Slime, which you earn by playing and can never buy.
            </p>
          </article>
          <article className="paper promise">
            <span className="promise-icon" aria-hidden="true">
              🛡️
            </span>
            <h3>Safe to play online</h3>
            <p>No chat, names checked for anything rude or personal, and Report and Block on every player.</p>
          </article>
        </div>
      </section>

      <section className="band">
        <h2 className="display section-title">Made for everyone</h2>
        <div className="pop-grid promise-grid">
          <article className="paper promise">
            <span className="promise-icon" aria-hidden="true">
              🎨
            </span>
            <h3>Easy on the eyes</h3>
            <p>A colour-blind palette with a symbol for each team, high contrast, calmer effects and bigger text.</p>
          </article>
          <article className="paper promise">
            <span className="promise-icon" aria-hidden="true">
              🎮
            </span>
            <h3>Your controls</h3>
            <p>Change every key and button, swap the touch buttons round, or tap to fire instead of holding.</p>
          </article>
          <article className="paper promise">
            <span className="promise-icon" aria-hidden="true">
              🌍
            </span>
            <h3>Your language</h3>
            <p>{LANGS.map((l) => l.name).join(', ')}.</p>
          </article>
        </div>
      </section>

      <section className="band android-band">
        <div className="paper android-card">
          <div className="android-text">
            <span className="soon">Coming soon</span>
            <h2 className="display">TardiGeddon for Android</h2>
            <p>
              The whole game as an app on Google Play, with the same account, stats and unlocks as the browser. Until then, it
              plays great in your phone’s browser.
            </p>
          </div>
          <div className="screen android-shot">
            <Shot
              name="shot-phone"
              alt="The game on a phone held sideways, with big touch buttons for moving, aiming, jumping and firing."
              width={1400}
              height={584}
            />
          </div>
        </div>
      </section>

      <section className="cta">
        <Mascot className="cta-mascot" color={0x3cb34a} hat="crown" label="" />
        <h2 className="display">Ready to rumble?</h2>
        <a className="btn btn-play btn-huge" href={PLAY_URL}>
          Play now, it's free
        </a>
        <p>
          New to it? <Link to="/how-to-play">Here’s how to play.</Link>
        </p>
      </section>
    </div>
  );
}
