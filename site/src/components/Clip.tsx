// A short, muted, looping clip recorded from the game (site/capture/).
// Plays only while on screen. With reduced motion it doesn't play by itself:
// the poster shows, with controls to play it on request.

import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../motion/SmoothScroll';

interface Props {
  name: string;
  /** What happens in the clip, for screen readers. */
  label: string;
  className?: string;
}

export function Clip({ name, label, className = '' }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [reduced] = useState(prefersReducedMotion);

  useEffect(() => {
    const v = ref.current;
    if (!v || reduced) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.2 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [reduced]);

  return (
    <video
      ref={ref}
      className={`clip ${className}`}
      width={1280}
      height={720}
      muted
      loop
      playsInline
      preload="none"
      controls={reduced}
      poster={`/media/${name}-poster.webp`}
      aria-label={label}
    >
      <source src={`/media/${name}.mp4`} type="video/mp4" />
    </video>
  );
}
