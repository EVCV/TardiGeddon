// Background music, synthesised as it plays (WebAudio): no audio files to
// download. A track is data: a tempo, a key, a chord loop, a few instruments
// with rhythm patterns, and a drum kit. Its tune is made up from the chords
// by a little random walk with a fixed seed, so a track always sounds the same.
//
// The menu has its own theme. In matches the player hears the track they
// picked (shop items of kind 'music'; only they hear it, like arenas).
// Music plays through the mixer's music bus (mixer.ts: on/off and volume).

import { musicOn, musicOut, onAudioSettings } from './mixer';

/** A rhythm for one bar: one character per 16th note. '.' is a rest. */
type Pattern = string;

interface Voice {
  wave: OscillatorType;
  gain: number;
  /** A low-pass filter's cut-off in Hz (none: the raw wave). */
  cutoff?: number;
  pattern: Pattern;
}

export interface Track {
  id: string;
  name: string;
  /** Shop art colours. */
  colors: [string, string];
  bpm: number;
  /** 16th notes in a bar: 16 for 4/4, 12 for 6/8. */
  steps: number;
  /** MIDI note of the key (60 = middle C). */
  root: number;
  /** The scale the tune uses, in semitones above the key. */
  scale: number[];
  /** One chord per bar, in semitones above the key. The loop is twice through. */
  chords: number[][];
  /** Off-beat 16ths come this fraction of a step late (a lazy groove). */
  swing?: number;
  /** Seconds of echo on everything (none: dry). */
  echo?: number;
  /** The tune: 'x' starts a note, '-' holds it. */
  lead: Voice & { octave: number };
  /** 'x' the chord's root, 'o' an octave up, '5' its fifth. */
  bass: Voice;
  /** Chords held for the whole bar. */
  pad?: Voice;
  /** Chord notes one after another, on each 'x'. */
  arp?: Voice & { octave: number };
  /** 'x' hit ('o' an open hi-hat). */
  drums: { kick: Pattern; snare: Pattern; hat: Pattern; gain: number };
}

// Chords, in semitones above the key.
const I = [0, 4, 7], ii = [2, 5, 9], IV = [5, 9, 12], V = [7, 11, 14], vi = [-3, 0, 4];
const i = [0, 3, 7], iv = [5, 8, 12], v = [7, 10, 14], III = [3, 7, 10], VI = [-4, 0, 3], VII = [-2, 2, 5];
const Imaj7 = [0, 4, 7, 11], ii7 = [2, 5, 9, 12], V7 = [7, 11, 14, 17], vi7 = [-3, 0, 4, 7], II = [2, 6, 9];

const MAJOR_PENTA = [0, 2, 4, 7, 9];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];

export const TRACKS: Track[] = [
  // Free: the menu's theme, and the standard match music.
  {
    id: 'menu', name: 'Pond Lobby', colors: ['#7fd3f7', '#2a7fb8'], bpm: 88, steps: 16, root: 60, scale: MAJOR_PENTA, chords: [I, vi, IV, V], echo: 0.34,
    lead: { wave: 'triangle', gain: 0.07, octave: 12, pattern: 'x--x--x-x---x---' },
    bass: { wave: 'triangle', gain: 0.12, pattern: 'x.......x...5...' },
    pad: { wave: 'sine', gain: 0.03, pattern: 'x' },
    drums: { kick: 'x.......x.......', snare: '................', hat: '....x.......x...', gain: 0.35 },
  },
  {
    id: 'classic', name: 'Moss Skirmish', colors: ['#7ed957', '#3a8a28'], bpm: 118, steps: 16, root: 62, scale: MAJOR, chords: [I, V, vi, IV],
    lead: { wave: 'square', gain: 0.035, cutoff: 2400, octave: 12, pattern: 'x.x.xx.x..x.x-x.' },
    bass: { wave: 'sawtooth', gain: 0.07, cutoff: 600, pattern: 'x..x..x.x..x..o.' },
    pad: { wave: 'triangle', gain: 0.025, pattern: 'x' },
    drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', gain: 0.45 },
  },
  // Shop music packs (coins).
  {
    id: 'chiptune', name: '8-Bit Puddle', colors: ['#5ce08a', '#1f6e3d'], bpm: 144, steps: 16, root: 64, scale: MAJOR, chords: [I, vi, ii, V],
    lead: { wave: 'square', gain: 0.03, octave: 12, pattern: 'x.xxx.x.x.xxx-x.' },
    bass: { wave: 'triangle', gain: 0.13, pattern: 'x.o.x.o.x.o.x.o.' },
    arp: { wave: 'square', gain: 0.012, octave: 12, pattern: 'xxxxxxxxxxxxxxxx' },
    drums: { kick: 'x...x...x...x...', snare: '....x.......x.x.', hat: 'x.x.x.x.x.x.x.x.', gain: 0.4 },
  },
  {
    id: 'lofi', name: 'Lo-fi Lichen', colors: ['#d9b38c', '#7a5634'], bpm: 76, steps: 16, root: 58, scale: MAJOR_PENTA, chords: [Imaj7, vi7, ii7, V7], swing: 0.22, echo: 0.42,
    lead: { wave: 'sine', gain: 0.08, octave: 12, pattern: 'x-----x---x-----' },
    bass: { wave: 'sine', gain: 0.16, pattern: 'x.....x.x.......' },
    pad: { wave: 'triangle', gain: 0.03, cutoff: 900, pattern: 'x' },
    drums: { kick: 'x......x..x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', gain: 0.3 },
  },
  {
    id: 'spooky', name: 'Spooky Swamp', colors: ['#9b6bd6', '#3d2266'], bpm: 100, steps: 16, root: 57, scale: HARMONIC_MINOR, chords: [i, VI, iv, V], echo: 0.45,
    lead: { wave: 'sawtooth', gain: 0.04, cutoff: 1400, octave: 12, pattern: 'x--x--x-x-------' },
    bass: { wave: 'triangle', gain: 0.14, pattern: 'x.......x..x....' },
    pad: { wave: 'sawtooth', gain: 0.018, cutoff: 500, pattern: 'x' },
    drums: { kick: 'x.......x.......', snare: '....x.......x..x', hat: '..x...x...x...x.', gain: 0.35 },
  },
  {
    id: 'disco', name: 'Disco Droplet', colors: ['#ff6fb5', '#7a1f8f'], bpm: 122, steps: 16, root: 57, scale: DORIAN, chords: [i, IV, VII, i],
    lead: { wave: 'square', gain: 0.03, cutoff: 3000, octave: 12, pattern: 'x..x..x...x.x-..' },
    bass: { wave: 'sawtooth', gain: 0.08, cutoff: 900, pattern: 'x.o.x.o.x.o.x.o.' },
    pad: { wave: 'sawtooth', gain: 0.014, cutoff: 1200, pattern: 'x' },
    drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..o...o...o...o.', gain: 0.45 },
  },
  {
    id: 'space', name: 'Cosmic Crawl', colors: ['#5b6cff', '#141a4d'], bpm: 84, steps: 16, root: 60, scale: LYDIAN, chords: [I, II, vi, II], echo: 0.5,
    lead: { wave: 'sine', gain: 0.08, octave: 12, pattern: 'x-------x---x---' },
    bass: { wave: 'sine', gain: 0.15, pattern: 'x...............' },
    pad: { wave: 'triangle', gain: 0.03, pattern: 'x' },
    arp: { wave: 'triangle', gain: 0.03, octave: 24, pattern: 'x.x.x.x.x.x.x.x.' },
    drums: { kick: 'x.........x.....', snare: '........x.......', hat: '................', gain: 0.3 },
  },
  {
    id: 'shanty', name: 'Sea Shanty Slam', colors: ['#4fc3c9', '#1d5f73'], bpm: 150, steps: 12, root: 62, scale: MINOR, chords: [i, VII, i, v],
    lead: { wave: 'square', gain: 0.03, cutoff: 2000, octave: 12, pattern: 'x.xx.xx.x.x.' },
    bass: { wave: 'triangle', gain: 0.14, pattern: 'x.....5.....' },
    pad: { wave: 'sawtooth', gain: 0.016, cutoff: 1500, pattern: 'x' },
    drums: { kick: 'x.....x.....', snare: '...x.....x..', hat: '..x..x..x..x', gain: 0.4 },
  },
  {
    id: 'boss', name: 'Boss Battle', colors: ['#e04848', '#4d0f0f'], bpm: 164, steps: 16, root: 57, scale: MINOR, chords: [i, VI, III, VII],
    lead: { wave: 'square', gain: 0.03, cutoff: 2600, octave: 12, pattern: 'x.x.x..xx.x.x-x.' },
    bass: { wave: 'sawtooth', gain: 0.06, cutoff: 800, pattern: 'xoxoxoxoxoxoxoxo' },
    pad: { wave: 'sawtooth', gain: 0.016, cutoff: 900, pattern: 'x' },
    drums: { kick: 'x.x...x.x.x...x.', snare: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx', gain: 0.45 },
  },
  // Never sold: the Early bird and Founder packs (src/shop/rewards.ts).
  {
    id: 'daybreak', name: 'Daybreak', colors: ['#ffb36b', '#c86a2a'], bpm: 112, steps: 16, root: 62, scale: MAJOR, chords: [I, IV, vi, V], echo: 0.3,
    lead: { wave: 'triangle', gain: 0.07, octave: 12, pattern: 'x.x-x...x.x.x-..' },
    bass: { wave: 'triangle', gain: 0.13, pattern: 'x...x.o.x...x.o.' },
    arp: { wave: 'sine', gain: 0.03, octave: 24, pattern: 'x.x.x.x.x.x.x.x.' },
    drums: { kick: 'x.......x.......', snare: '....x.......x...', hat: '..x...x...x...x.', gain: 0.35 },
  },
  {
    id: 'anthem', name: 'Founders’ Anthem', colors: ['#ffd84a', '#8a6a10'], bpm: 96, steps: 16, root: 60, scale: MAJOR, chords: [I, IV, V, I], echo: 0.36,
    lead: { wave: 'square', gain: 0.035, cutoff: 2200, octave: 12, pattern: 'x--.x.x.x---x-x.' },
    bass: { wave: 'sawtooth', gain: 0.07, cutoff: 700, pattern: 'x...x...x...x.x.' },
    pad: { wave: 'sawtooth', gain: 0.02, cutoff: 1300, pattern: 'x' },
    drums: { kick: 'x.......x.......', snare: '....x...x.x.x...', hat: 'x.x.x.x.x.x.x.x.', gain: 0.4 },
  },
];

export function musicTrack(id: string | null | undefined): Track {
  return TRACKS.find((t) => t.id === id) ?? TRACKS[1];
}

/** A tiny seeded random number generator, so a track's tune never changes. */
function rng(seed: string): () => number {
  let h = 2166136261;
  for (let k = 0; k < seed.length; k++) h = Math.imul(h ^ seed.charCodeAt(k), 16777619);
  return () => {
    h = (Math.imul(h, 1664525) + 1013904223) | 0;
    return (h >>> 0) / 4294967296;
  };
}

/**
 * The tune as MIDI notes, one entry per step of the loop: a note number where
 * the lead pattern has 'x', -1 for a held note, null for a rest. The second
 * half answers the first: it starts the same and ends differently.
 */
export function melody(t: Track): (number | null)[] {
  const rand = rng(t.id);
  const n = t.scale.length;
  const noteAt = (p: number) => t.root + t.lead.octave + 12 * Math.floor(p / n) + t.scale[((p % n) + n) % n];
  const phrase = () => {
    const out: (number | null)[] = [];
    let p = n; // start an octave up the scale
    t.chords.forEach((chord) => {
      for (let s = 0; s < t.steps; s++) {
        const c = t.lead.pattern[s % t.lead.pattern.length];
        if (c === '-') out.push(-1);
        else if (c !== 'x') out.push(null);
        else {
          const steps = [-2, -1, -1, 0, 1, 1, 2, 3, -3];
          p = Math.max(0, Math.min(2 * n, p + steps[Math.floor(rand() * steps.length)]));
          // On the bar's first note, land on a note of the chord.
          if (s === t.lead.pattern.indexOf('x')) {
            const inChord = (q: number) => chord.some((c2) => (((noteAt(q) - t.root - c2) % 12) + 12) % 12 === 0);
            for (const d of [0, 1, -1, 2, -2]) {
              if (p + d >= 0 && p + d <= 2 * n && inChord(p + d)) {
                p += d;
                break;
              }
            }
          }
          out.push(noteAt(p));
        }
      }
    });
    return out;
  };
  const a = phrase();
  const b = phrase();
  const half = Math.floor(a.length / 2);
  return [...a, ...a.slice(0, half), ...b.slice(half)];
}

const freq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** One playing track: its own volume (for fading) and its step scheduler. */
class Player {
  private gain: GainNode;
  private timer: ReturnType<typeof setInterval>;
  private next: number;
  private step = 0;
  private tune: (number | null)[];
  private noise: AudioBuffer;
  private stepDur: number;
  private echoNodes: AudioNode[] = [];
  private arpN = 0;

  constructor(
    private ctx: AudioContext,
    out: AudioNode,
    readonly track: Track,
  ) {
    this.tune = melody(track);
    this.stepDur = 60 / track.bpm / 4;
    this.gain = ctx.createGain();
    this.gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.gain.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 1.2);
    this.gain.connect(out);
    if (track.echo) {
      const delay = ctx.createDelay(1);
      delay.delayTime.value = track.echo;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.3;
      const wet = ctx.createGain();
      wet.gain.value = 0.35;
      this.gain.connect(delay);
      delay.connect(feedback).connect(delay);
      delay.connect(wet).connect(out);
      this.echoNodes = [delay, feedback, wet];
    }
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
    this.noise = b;
    this.next = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  /** Fade out and stop. */
  stop(fade = 0.8): void {
    clearInterval(this.timer);
    const now = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(Math.max(0.0001, this.gain.gain.value), now);
    this.gain.gain.exponentialRampToValueAtTime(0.0001, now + fade);
    setTimeout(() => {
      this.gain.disconnect();
      for (const n of this.echoNodes) n.disconnect();
    }, (fade + 2) * 1000);
  }

  /** Book the notes for the next tenth of a second. */
  private schedule(): void {
    const now = this.ctx.currentTime;
    // Fell behind (a background tab, a busy frame): skip ahead rather than play a pile of notes at once.
    if (this.next < now - 0.2) this.next = now + 0.05;
    while (this.next < now + 0.12) {
      this.playStep(this.step, this.next);
      this.next += this.stepDur;
      this.step = (this.step + 1) % (this.track.steps * this.track.chords.length * 2);
    }
  }

  private playStep(step: number, at: number): void {
    const t = this.track;
    const s = step % t.steps;
    const bar = Math.floor(step / t.steps) % t.chords.length;
    const chord = t.chords[bar];
    const time = at + (t.swing && s % 2 === 1 ? t.swing * this.stepDur : 0);
    const ch = (p: Pattern) => p[s % p.length];

    // Lead: a note lasts until the next note or rest.
    const note = this.tune[step];
    if (note !== null && note !== -1 && note !== undefined) {
      let len = 1;
      while (this.tune[(step + len) % this.tune.length] === -1) len++;
      this.tone(freq(note), time, len * this.stepDur * 0.95, t.lead);
    }
    // Bass.
    const b = ch(t.bass.pattern);
    if (b === 'x' || b === 'o' || b === '5') {
      const m = t.root - 24 + chord[0] + (b === 'o' ? 12 : b === '5' ? 7 : 0);
      this.tone(freq(m), time, this.stepDur * 1.8, t.bass);
    }
    // Pad: the chord for the whole bar.
    if (t.pad && s === 0) for (const c of chord) this.tone(freq(t.root - 12 + c), time, t.steps * this.stepDur, t.pad, 0.4);
    // Arpeggio.
    if (t.arp && ch(t.arp.pattern) === 'x') {
      const c = chord[this.arpN++ % chord.length];
      this.tone(freq(t.root + t.arp.octave + c), time, this.stepDur * 0.8, t.arp);
    }
    // Drums.
    const dg = t.drums.gain;
    if (ch(t.drums.kick) === 'x') this.kick(time, dg);
    if (ch(t.drums.snare) === 'x') this.hiss(time, 0.14, 1800, 'bandpass', 0.5 * dg);
    const h = ch(t.drums.hat);
    if (h === 'x' || h === 'o') this.hiss(time, h === 'o' ? 0.18 : 0.04, 7000, 'highpass', 0.18 * dg);
  }

  private tone(f: number, at: number, dur: number, v: Voice, attack = 0.01): void {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = v.wave;
    o.frequency.setValueAtTime(f, at);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(v.gain, at + Math.min(attack, dur / 2));
    g.gain.exponentialRampToValueAtTime(v.gain * 0.6, at + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    if (v.cutoff) {
      const filt = c.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = v.cutoff;
      o.connect(filt).connect(g);
    } else o.connect(g);
    g.connect(this.gain);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  private kick(at: number, gain: number): void {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, at);
    o.frequency.exponentialRampToValueAtTime(42, at + 0.12);
    const g = c.createGain();
    g.gain.setValueAtTime(0.5 * gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
    o.connect(g).connect(this.gain);
    o.start(at);
    o.stop(at + 0.3);
  }

  private hiss(at: number, dur: number, f: number, type: BiquadFilterType, gain: number): void {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const filt = c.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = f;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filt).connect(g).connect(this.gain);
    src.start(at, Math.random() * 0.3);
    src.stop(at + dur + 0.02);
  }
}

/** The track the game wants (menu theme, match music, or none). */
let wanted: string | null = null;
/** A track being tried in the shop, over the wanted one. */
let previewing: string | null = null;
let player: Player | null = null;

function update(): void {
  const id = musicOn() ? (previewing ?? wanted) : null;
  if (player?.track.id === id) return;
  player?.stop();
  player = null;
  const out = musicOut();
  if (id && out) player = new Player(out.ctx, out.out, musicTrack(id));
}

onAudioSettings(update);

/** Play this track (the same one carries on), or fade out with null. */
export function playMusic(id: string | null): void {
  wanted = id;
  update();
}

/** Try a track in the shop; null goes back to what was playing. */
export function previewMusic(id: string | null): void {
  previewing = id;
  update();
}

export function previewingMusic(): string | null {
  return previewing;
}

/** Start the music once the AudioContext exists (after the first tap or key press). */
export function refreshMusic(): void {
  update();
}
