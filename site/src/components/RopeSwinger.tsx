// Every so often a tardigrade swings right across the screen on its silk
// rope, the way the game's Silk Rope works: swing, let go at the top, shoot
// the rope again further on. Decoration only: it's one small element moved
// with transforms, it never takes a tap (pointer-events: none), it waits until
// the page has finished loading, and it doesn't come at all for people who
// ask for reduced motion.

import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { mascotSvg } from '../../../src/ui/mascot';
import { TEAM_COLORS } from '../../../src/render/palette';
import { HATS } from '../../../src/render/hats';

/** Seconds before the first swing after the page loads, and between swings. */
const FIRST_DELAY = 4;
const GAP = [22, 40] as const;
/** How far it swings each way from straight down (degrees). */
const ANGLE = 34;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

export function RopeSwinger() {
  const [on, setOn] = useState(false);
  const rig = useRef<HTMLDivElement>(null);
  const rope = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);

  // Only once everything else has loaded, so it never slows the page down;
  // and never while the visitor asks for reduced motion (even if they turn it
  // on with the page open).
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timer = 0;
    const start = () => {
      clearTimeout(timer);
      if (!reduce.matches) timer = window.setTimeout(() => setOn(true), FIRST_DELAY * 1000);
    };
    const onPref = () => {
      if (reduce.matches) {
        clearTimeout(timer);
        setOn(false);
      } else if (document.readyState === 'complete') start();
    };
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });
    reduce.addEventListener('change', onPref);
    return () => {
      window.removeEventListener('load', start);
      reduce.removeEventListener('change', onPref);
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!on || !rig.current || !rope.current || !body.current) return;
    const r = rig.current;
    const line = rope.current;
    const who = body.current;
    let tl: gsap.core.Timeline | null = null;
    let next: gsap.core.Tween | null = null;

    const crossing = () => {
      // A random tardi each time: team colour and hat.
      const hat = pick(HATS.filter((h) => h.id !== 'none')).id;
      who.innerHTML = mascotSvg(pick(TEAM_COLORS), hat);
      const w = window.innerWidth;
      const h = window.innerHeight;
      // Rope length: the tardi swings through the upper part of the screen.
      const len = Math.round(Math.min(h * 0.42, rand(0.24, 0.34) * Math.max(h, 600)));
      const dir = Math.random() < 0.5 ? 1 : -1;
      const sin = Math.sin((ANGLE * Math.PI) / 180);
      const step = 2 * len * sin; // how far each swing carries it
      // Start with the tardi just off one side, swinging in.
      let ax = dir === 1 ? -len * sin - 70 : w + len * sin + 70;
      const swings = Math.ceil((w + 140 + 2 * len * sin) / step) + 1;
      // (A positive rotation swings the rope's end to the left.)
      gsap.set(r, { x: ax, height: len, rotation: ANGLE * dir, autoAlpha: 1 });
      gsap.set(who, { scaleX: dir });
      tl = gsap.timeline({
        onComplete: () => {
          gsap.set(r, { autoAlpha: 0 });
          next = gsap.delayedCall(rand(...GAP), crossing);
        },
      });
      for (let i = 0; i < swings; i++) {
        // A new rope: it shoots up from the tardi to the next anchor.
        tl.fromTo(line, { scaleY: 0 }, { scaleY: 1, duration: 0.14, ease: 'power2.out' });
        // Swing through, faster at the bottom like a pendulum.
        tl.to(r, { rotation: -ANGLE * dir, duration: 1.05, ease: 'sine.inOut' });
        // Let go at the top and catch on further along: the anchor moves on by
        // one swing's width, and the tardi starts the next swing from the back.
        ax += step * dir;
        const x = ax;
        tl.set(r, { x, rotation: ANGLE * dir });
      }
    };
    crossing();
    return () => {
      tl?.kill();
      next?.kill();
    };
  }, [on]);

  if (!on) return null;
  return (
    <div className="swinger" aria-hidden="true">
      <div ref={rig} className="swinger-rig">
        <div ref={rope} className="swinger-rope" />
        <div ref={body} className="swinger-tardi" />
      </div>
    </div>
  );
}
