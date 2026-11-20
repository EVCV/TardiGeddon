// The game's own music as a file, for the videos: the same synthesised tracks
// the game plays (src/audio/music.ts), rendered in a browser's offline audio
// context (faster than real time, no sound card needed) and saved as a WAV.
// Ours, so no licence to worry about.
//
//   npx tsx scripts/videos/music.ts boss 300 store/videos/music/boss.wav   (track id, seconds, file)
//   npx tsx scripts/videos/music.ts list
//
// render.mjs calls this itself for --music game:<track>.

import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const RATE = 44100;

/** The music module, bundled for the page. */
async function bundle(): Promise<string> {
  const r = await build({
    stdin: {
      contents: `import { bookTrack, TRACKS } from './src/audio/music'; (window as any).__music = { bookTrack, tracks: TRACKS.map((t) => ({ id: t.id, name: t.name, bpm: t.bpm })) };`,
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true,
    format: 'iife',
    write: false,
    logLevel: 'silent',
  });
  return r.outputFiles[0].text;
}

/** A 16-bit stereo WAV from interleaved samples. */
function wav(samples: Int16Array): Buffer {
  const head = Buffer.alloc(44);
  const bytes = samples.length * 2;
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + bytes, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20); // PCM
  head.writeUInt16LE(2, 22); // stereo
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * 4, 28);
  head.writeUInt16LE(4, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(bytes, 40);
  return Buffer.concat([head, Buffer.from(samples.buffer, samples.byteOffset, bytes)]);
}

export async function renderMusic(track: string, seconds: number, file: string): Promise<void> {
  const code = await bundle();
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage();
    // A page of its own (an origin with storage: the mixer reads its settings there).
    await page.route('http://music.local/**', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }));
    await page.goto('http://music.local/');
    await page.addScriptTag({ content: code });
    const known = await page.evaluate(() => (window as any).__music.tracks.map((t: { id: string }) => t.id) as string[]);
    if (!known.includes(track)) throw new Error(`No track "${track}". Tracks: ${known.join(', ')}`);
    const frames = await page.evaluate(
      async ([id, secs, rate]) => {
        const ctx = new OfflineAudioContext(2, Math.ceil(secs * rate), rate);
        const out = ctx.createGain();
        out.gain.value = 0.8;
        out.connect(ctx.destination);
        (window as any).__music.bookTrack(ctx, out, id, secs);
        (window as any).__rendered = await ctx.startRendering();
        return (window as any).__rendered.length as number;
      },
      [track, seconds, RATE] as const,
    );
    // Fetched ten seconds at a time (one big answer would be too much for the page).
    const all = new Int16Array(frames * 2);
    const chunk = RATE * 10;
    for (let at = 0; at < frames; at += chunk) {
      const b64 = await page.evaluate(
        ([from, n]) => {
          const buf = (window as any).__rendered as AudioBuffer;
          const l = buf.getChannelData(0);
          const r = buf.getChannelData(1);
          const end = Math.min(buf.length, from + n);
          const out = new Int16Array((end - from) * 2);
          for (let i = from; i < end; i++) {
            out[(i - from) * 2] = Math.max(-1, Math.min(1, l[i])) * 32767;
            out[(i - from) * 2 + 1] = Math.max(-1, Math.min(1, r[i])) * 32767;
          }
          let s = '';
          const u8 = new Uint8Array(out.buffer);
          for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
          return btoa(s);
        },
        [at, chunk] as const,
      );
      const part = new Int16Array(Uint8Array.from(Buffer.from(b64, 'base64')).buffer);
      all.set(part, at * 2);
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, wav(all));
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  const [track, secs, file] = process.argv.slice(2);
  if (!track || track === 'list') {
    const code = await bundle();
    const ids = [...code.matchAll(/id: "([a-z]+)", name: "([^"]+)"/g)].map((m) => `${m[1]} (${m[2]})`);
    console.log(ids.join('\n') || 'Tracks are in src/audio/music.ts (TRACKS).');
    return;
  }
  const out = file ?? join(root, 'store/videos/music', `${track}.wav`);
  await renderMusic(track, Number(secs) || 300, out);
  console.log(`${out}: ${track}, ${Number(secs) || 300} s`);
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  void main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
