// How the videos sound (docs/social/VIDEOS.md §4). The game's tracks are bright
// synth tunes made for playing, too shrill and loud behind a video, so in
// videos they are played 5 notes lower (same tempo), with the sharp top end
// softened, and at about half YouTube's full loudness. Busy matches get the
// lively tracks, duels the calm ones.

import { execFileSync } from 'node:child_process';

/** For matches of 4 teams or more. */
export const LIVELY = ['disco', 'classic', 'chiptune', 'shanty', 'boss'];
/** For duels and small matches. */
export const CALM = ['lofi', 'space', 'menu', 'daybreak', 'spooky'];

/** A game track for a video: `n` picks a different one for each video in a set. */
export function trackFor(teams, n) {
  const pool = teams >= 4 ? LIVELY : CALM;
  return `game:${pool[((n % pool.length) + pool.length) % pool.length]}`;
}

/** A number from a name, so a video keeps its track if it's made again. */
export const nameNumber = (name) => [...name].reduce((a, c) => a + c.charCodeAt(0), 0);

let rubberband;
/** ffmpeg's pitch shifter, if this ffmpeg has it. */
function hasRubberband() {
  if (rubberband === undefined) {
    try {
      rubberband = / rubberband /.test(execFileSync('ffmpeg', ['-hide_banner', '-filters'], { encoding: 'utf8' }));
    } catch {
      rubberband = false;
    }
    if (!rubberband) console.warn('  (this ffmpeg has no rubberband filter: the game music stays at its own pitch)');
  }
  return rubberband;
}

/** The audio filter: warm the game's own tracks, then even loudness at -20 LUFS (any music). */
export function musicFilter(gameTrack) {
  const warm = gameTrack ? [...(hasRubberband() ? ['rubberband=pitch=0.7491:formant=preserved'] : []), 'lowpass=f=3500'] : [];
  return [...warm, 'loudnorm=I=-20:TP=-2:LRA=11'].join(',');
}
