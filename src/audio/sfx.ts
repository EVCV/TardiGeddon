// Tiny synthesised sound effects (WebAudio) until real audio assets exist.
// They play through the mixer's effects bus (mixer.ts: on/off and volume).

import { sfxOut } from './mixer';

/**
 * Sound packs (shop items, kind 'sound'): the same effects, voiced
 * differently. Only the player who picked a pack hears it.
 */
export interface SoundPack {
  id: string;
  /** Shop art colours. */
  colors: [string, string];
  /** Multiplies every tone's pitch. */
  pitch: number;
  /** Every tone uses this waveform instead of its own. */
  wave?: OscillatorType;
  /** Multiplies the noise filter's cut-off (lower is duller, boomier). */
  noiseFreq: number;
  /** Multiplies how long the noises last. */
  noiseLen: number;
  /** Multiplies loudness. */
  gain: number;
}

export const SOUND_PACKS: SoundPack[] = [
  { id: 'classic', colors: ['#7fd3f7', '#2a7fb8'], pitch: 1, noiseFreq: 1, noiseLen: 1, gain: 1 },
  { id: 'retro', colors: ['#5ce08a', '#1f6e3d'], pitch: 1, wave: 'square', noiseFreq: 0.5, noiseLen: 0.8, gain: 0.9 },
  { id: 'squelch', colors: ['#c9e05c', '#6a7d1c'], pitch: 0.62, wave: 'triangle', noiseFreq: 0.45, noiseLen: 1.15, gain: 1.1 },
  { id: 'cartoon', colors: ['#ffb3d9', '#c2417f'], pitch: 1.55, wave: 'sine', noiseFreq: 1.3, noiseLen: 0.75, gain: 1 },
  { id: 'boom', colors: ['#ff9a4d', '#9e3d0b'], pitch: 0.8, noiseFreq: 0.4, noiseLen: 1.6, gain: 1.35 },
  { id: 'robot', colors: ['#b8c4d6', '#4a5670'], pitch: 1.2, wave: 'sawtooth', noiseFreq: 0.7, noiseLen: 0.9, gain: 0.85 },
];

export function soundPack(id: string | undefined): SoundPack {
  return SOUND_PACKS.find((p) => p.id === id) ?? SOUND_PACKS[0];
}

let pack = SOUND_PACKS[0];
let chosen = SOUND_PACKS[0];
let demoTimer: ReturnType<typeof setTimeout> | undefined;

/** The sound pack to play effects with. */
export function useSoundPack(id: string): void {
  chosen = pack = soundPack(id);
}

/** A few effects in a row, for trying a sound pack in the shop (only heard in the menu). */
export function demoSoundPack(id: string): void {
  clearTimeout(demoTimer);
  pack = soundPack(id);
  sfx.jump();
  setTimeout(sfx.fire, 250);
  setTimeout(() => sfx.explosion(40), 650);
  setTimeout(sfx.squeak, 1500);
  setTimeout(sfx.collect, 1800);
  demoTimer = setTimeout(() => (pack = chosen), 2400);
}

function noiseBuffer(c: AudioContext, seconds: number): AudioBuffer {
  const b = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function noise(seconds: number, freq: number, gain: number): void {
  const o = sfxOut();
  if (!o) return;
  const ctx = o.ctx;
  seconds *= pack.noiseLen;
  freq = Math.min(18000, freq * pack.noiseFreq);
  gain *= pack.gain;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, seconds);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = freq;
  const g = ctx.createGain();
  const now = ctx.currentTime;
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + seconds);
  src.connect(filter).connect(g).connect(o.out);
  src.start();
}

function tone(from: number, to: number, seconds: number, gain: number, type: OscillatorType = 'square'): void {
  const out = sfxOut();
  if (!out) return;
  const ctx = out.ctx;
  from *= pack.pitch;
  to *= pack.pitch;
  // Square and saw waves sound much louder than sine and triangle at the same gain.
  const loud = (t: OscillatorType) => (t === 'square' || t === 'sawtooth' ? 1 : 1.6);
  if (pack.wave) gain *= loud(pack.wave) / loud(type);
  gain *= pack.gain;
  const o = ctx.createOscillator();
  o.type = pack.wave ?? type;
  const g = ctx.createGain();
  const now = ctx.currentTime;
  o.frequency.setValueAtTime(from, now);
  o.frequency.exponentialRampToValueAtTime(to, now + seconds);
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + seconds);
  o.connect(g).connect(out.out);
  o.start();
  o.stop(now + seconds);
}

export const sfx = {
  explosion: (r: number) => noise(0.4 + r / 80, 600 + r * 10, 0.5),
  fire: () => noise(0.15, 2500, 0.15),
  shot: () => noise(0.12, 4000, 0.3),
  jump: () => tone(300, 700, 0.12, 0.06),
  splash: () => noise(0.5, 1200, 0.25),
  bounce: () => tone(500, 300, 0.05, 0.05, 'triangle'),
  teleport: () => tone(400, 1600, 0.3, 0.06, 'sine'),
  turn: () => tone(660, 880, 0.15, 0.05, 'triangle'),
  tick: () => tone(1200, 1100, 0.04, 0.04, 'square'),
  rope: () => tone(900, 1500, 0.08, 0.05, 'sawtooth'),
  chute: () => noise(0.3, 900, 0.12),
  punch: () => {
    noise(0.15, 1500, 0.35);
    tone(220, 90, 0.15, 0.08);
  },
  build: () => tone(180, 140, 0.12, 0.1, 'square'),
  collect: () => {
    tone(660, 990, 0.1, 0.06, 'triangle');
    setTimeout(() => tone(990, 1320, 0.12, 0.06, 'triangle'), 90);
  },
  suddenDeath: () => tone(300, 80, 1.2, 0.12, 'sawtooth'),
  // Tardi voices (placeholder squeaks until real voice packs exist).
  squeak: () => tone(900 + Math.random() * 300, 1500 + Math.random() * 300, 0.09, 0.05, 'sine'),
  oof: () => {
    tone(420, 170, 0.22, 0.09, 'triangle');
    noise(0.08, 700, 0.12);
  },
  gargle: () => {
    // A splash, then bubbles of rising pitch.
    noise(0.35, 900, 0.2);
    for (let i = 0; i < 7; i++) {
      const f = 250 + Math.random() * 450;
      setTimeout(() => tone(f, f * 1.6, 0.06, 0.07, 'sine'), 120 + i * 85);
    }
  },
  pop: () => {
    noise(0.1, 3500, 0.4);
    tone(700, 1800, 0.07, 0.07, 'sine');
  },
  whoa: () => {
    tone(420, 820, 0.18, 0.06, 'triangle');
    setTimeout(() => tone(820, 380, 0.3, 0.06, 'triangle'), 170);
  },
  fanfare: () => {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, f, i === 3 ? 0.5 : 0.14, 0.07, 'triangle'), i * 140));
  },
  wahwah: () => {
    [392, 370, 349, 294].forEach((f, i) => setTimeout(() => tone(f, f * 0.96, i === 3 ? 0.7 : 0.3, 0.06, 'sawtooth'), 900 + i * 320));
  },
};
