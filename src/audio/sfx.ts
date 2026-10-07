// Tiny synthesised sound effects (WebAudio) until real audio assets exist.

let ctx: AudioContext | null = null;
let muted = false;

export function unlockAudio(): void {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

export function setMuted(m: boolean): void {
  muted = m;
}

function noiseBuffer(c: AudioContext, seconds: number): AudioBuffer {
  const b = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function noise(seconds: number, freq: number, gain: number): void {
  if (!ctx || muted) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, seconds);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = freq;
  const g = ctx.createGain();
  const now = ctx.currentTime;
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + seconds);
  src.connect(filter).connect(g).connect(ctx.destination);
  src.start();
}

function tone(from: number, to: number, seconds: number, gain: number, type: OscillatorType = 'square'): void {
  if (!ctx || muted) return;
  const o = ctx.createOscillator();
  o.type = type;
  const g = ctx.createGain();
  const now = ctx.currentTime;
  o.frequency.setValueAtTime(from, now);
  o.frequency.exponentialRampToValueAtTime(to, now + seconds);
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + seconds);
  o.connect(g).connect(ctx.destination);
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
