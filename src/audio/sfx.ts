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
};
