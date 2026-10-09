// Home page: the mascot, the pitch, real clips and screenshots from the
// game, and a big "Play now". Facts (weapon count, game styles, teams) come
// straight from the game's own data so they never go stale.

import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { PANEL_WEAPONS } from '../../../src/sim/weapons';
import { SCHEME_PRESETS } from '../../../src/sim/schemes';
import { TEAM_COLORS, TEAM_NAMES, hex } from '../../../src/render/palette';
import { HATS } from '../../../src/render/hats';
import { prefersReducedMotion } from '../motion/SmoothScroll';
import SplitText from '../reactbits/SplitText';
import { Mascot } from '../components/Mascot';
import { Clip } from '../components/Clip';
import { Shot } from '../components/Shot';
import { PLAY_URL } from '../config';

const WEAPONS = PANEL_WEAPONS.filter((w) => w.id !== 'skip');
const WEARABLE_HATS = HATS.filter((h) => h.id !== 'none');

export function Home() {
  const root = useRef<HTMLDivElement>(null);
  const [reduced] = useState(prefersReducedMotion);

  useEffect(() => {
    document.title = 'TardiGeddon: tiny, indestructible, armed';
  }, []);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        // The mascot bobs about, as tardis do while they wait for their turn.
        gsap.to('.hero-mascot', { y: -14, rotation: -5, duration: 1.3, ease: 'sine.inOut', yoyo: true, repeat: -1 });
        gsap.from('.hero .reveal', { y: 34, opacity: 0, duration: 0.8, ease: 'back.out(1.7)', stagger: 0.12, delay: 0.35 });
        gsap.from('.hero-screen', { y: 80, rotation: 4, opacity: 0, duration: 1, ease: 'back.out(1.4)', delay: 0.5 });
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
        gsap.from('.style-card', {
          y: 50,
          opacity: 0,
          duration: 0.7,
          ease: 'back.out(1.6)',
          stagger: 0.08,
          scrollTrigger: { trigger: '.styles-grid', start: 'top 80%' },
        });
        gsap.from('.squad-member', {
          y: 60,
          opacity: 0,
          duration: 0.6,
          ease: 'back.out(2)',
          stagger: 0.05,
          scrollTrigger: { trigger: '.squad', start: 'top 85%' },
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
          {reduced ? (
            <h1 className="display hero-title">TardiGeddon</h1>
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
            A turn-based artillery game starring the toughest animals on Earth. Lob spore bazookas, drop a Concrete Tun on
            your mates and swing across the map on a silk rope.
          </p>
          <div className="hero-actions reveal">
            <a className="btn btn-play btn-huge" href={PLAY_URL}>
              Play now
            </a>
            <p className="hero-free">Free in your browser. No download, no sign-up needed, no ads.</p>
          </div>
        </div>
        <figure className="hero-screen screen">
          <Clip name="clip-tun" label="Gameplay: a Concrete Tun smashes down through the ground onto a huddle of tardigrades." />
        </figure>
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
              Every blast takes a bite out of the map. Mind the wind, bounce grenades round corners, set mines and brine
              drums off, or skip the subtlety and drop a Concrete Tun: it smashes down through the ground, slamming six
              times on the way.
            </p>
          </div>
        </article>

        <article className="feature flip">
          <div className="feature-media screen">
            <Clip name="clip-rope" label="Rope Race: a tardigrade swings from rope to rope under a rocky ceiling." />
          </div>
          <div className="feature-text">
            <h2 className="display">Swing on a silk rope</h2>
            <p>
              Throw the Silk Rope, swing, let go and throw it again: it gets you anywhere. Or play Rope Race, where nobody
              fights and the fastest run to the flag over three tries wins.
            </p>
          </div>
        </article>

        <article className="feature">
          <div className="feature-media screen">
            <Clip name="clip-victory" label="A Raindrop Strike finishes off the last enemies, then the winner dances in the confetti saying Too easy!" />
          </div>
          <div className="feature-text">
            <h2 className="display">Win with style</h2>
            <p>
              Tardis taunt, make excuses and shout their last words before they curl up and pop. Wipe out the other teams
              and yours does a victory dance in the confetti.
            </p>
          </div>
        </article>

        <article className="feature flip">
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
              Touch controls on phones and tablets, keyboard on computers. Take on the CPU, pass one device round for
              hot-seat battles of up to 10 teams, or play online: Quick Play finds you a match, or make a room and send
              your friends the code.
            </p>
          </div>
        </article>
      </section>

      <section className="band weapons-band">
        <h2 className="display section-title">{WEAPONS.length} ways to ruin someone's day</h2>
        <ul className="weapon-cloud">
          {WEAPONS.map((w) => (
            <li className={`weapon-chip${w.super ? ' super' : ''}`} key={w.id}>
              <span aria-hidden="true">{w.icon}</span> {w.name}
            </li>
          ))}
        </ul>
        <p className="band-note">Gold ones are superweapons: find them in crates, or switch them on in the game settings.</p>
      </section>

      <section className="band">
        <h2 className="display section-title">Pick your kind of chaos</h2>
        <div className="styles-grid">
          {SCHEME_PRESETS.map((p) => (
            <article className="style-card paper" key={p.id}>
              <h3>{p.name}</h3>
              <p>{p.blurb}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="band squad-band">
        <h2 className="display section-title">Dress your squad</h2>
        <p className="band-lead">Name your team and your tardis, then pick a colour and a hat.</p>
        <ul className="squad">
          {TEAM_NAMES.map((name, i) => (
            <li className="squad-member" key={name}>
              <Mascot color={TEAM_COLORS[i]} hat={WEARABLE_HATS[i % WEARABLE_HATS.length].id} label="" />
              <span style={{ color: hex(TEAM_COLORS[i]) }}>{name}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="cta">
        <Mascot className="cta-mascot" color={0x3cb34a} hat="crown" label="" />
        <h2 className="display">Ready to rumble?</h2>
        <a className="btn btn-play btn-huge" href={PLAY_URL}>
          Play now, it's free
        </a>
      </section>
    </div>
  );
}
