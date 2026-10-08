// Starter page: proves the stack (React + GSAP + Lenis + React Bits) works.
// The real website is built on top of this; see docs/WEBSITE.md.

import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { SmoothScroll } from './motion/SmoothScroll';
import SplitText from './reactbits/SplitText';

gsap.registerPlugin(useGSAP);

const FEATURES = [
  { title: 'Hilarious', text: 'Taunts, excuses, victory dances and tardis that curl up and POP.' },
  { title: 'Online', text: 'Quick play with strangers, or a room code for your friends.' },
  { title: 'Armed', text: 'Bazookas, holy water, concrete tuns and a silk rope to swing on.' },
];

export function App() {
  const features = useRef<HTMLElement>(null);

  // Cards rise in as they scroll into view (skipped if reduced motion is on).
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('.card', {
          y: 60,
          opacity: 0,
          duration: 0.8,
          ease: 'back.out(1.6)',
          stagger: 0.15,
          scrollTrigger: { trigger: features.current, start: 'top 75%' },
        });
      });
    },
    { scope: features },
  );

  return (
    <SmoothScroll>
      <header className="hero">
        <SplitText text="TardiGeddon" tag="h1" className="title" delay={60} from={{ opacity: 0, y: 60, rotate: -8 }} to={{ opacity: 1, y: 0, rotate: 0 }} />
        <p className="tagline">Tiny. Indestructible. Armed.</p>
        <a className="play" href="/play/">Play now, it's free</a>
      </header>
      <section className="features" ref={features}>
        {FEATURES.map((f) => (
          <article className="card" key={f.title}>
            <h2>{f.title}</h2>
            <p>{f.text}</p>
          </article>
        ))}
      </section>
      <footer className="footer">© TardiGeddon</footer>
    </SmoothScroll>
  );
}
