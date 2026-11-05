// Films a whole batch of videos from its saved replays, on any computer:
// the same matches, so the same videos. docs/social/VIDEOS.md §3.8.
//
//   npm run videos:batch -- 2026-11-05
//
// Reads store/video-batches/<batch>/batch.json and writes everything to
// store/videos/<batch>/: each video, its thumbnail and text, and the music as
// MP3s. Starts the game itself (building it first if needed). Run it again
// after an interruption: whatever is already made is skipped.

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const batch = process.argv[2];
if (!batch) {
  console.error('Which batch? e.g. npm run videos:batch -- 2026-11-05 (the folders in store/video-batches/)');
  process.exit(1);
}
const dir = join(root, 'store/video-batches', batch);
const recipe = JSON.parse(readFileSync(join(dir, 'batch.json'), 'utf8'));
const out = join(root, 'store/videos', batch);
mkdirSync(out, { recursive: true });
const win = process.platform === 'win32';
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit', shell: win });
const GAME = 'http://localhost:4173/';

const up = () => fetch(GAME).then((r) => r.ok, () => false);

// The game, built and served (unless it's already running).
let server = null;
if (!(await up())) {
  if (!existsSync(join(root, 'dist/index.html'))) {
    console.log('Building the game first (a minute or two)…');
    run('npm', ['run', 'build']);
  }
  server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { cwd: root, shell: win, stdio: 'ignore' });
  for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 1000));
  if (!(await up())) {
    console.error('The game did not start on port 4173. Is something else using that port?');
    process.exit(1);
  }
}

const t0 = Date.now();
try {
  for (const job of recipe.jobs) {
    const files = job.shorts ? Array.from({ length: job.shorts }, (_, i) => `${job.name}-${i + 1}.mp4`) : [`${job.name}.mp4`];
    const missing = files.filter((f) => !existsSync(join(out, f)));
    if (!missing.length) {
      console.log(`${job.name}: already made`);
      continue;
    }
    console.log(`\n${job.name}: filming ${missing.length} video${missing.length > 1 ? 's' : ''}…`);
    const args = [...job.args];
    const s = args.indexOf('--scout');
    if (s >= 0) args[s + 1] = join(dir, args[s + 1]);
    // Shorts: carry on from the first one not made yet.
    const from = job.shorts ? files.indexOf(missing[0]) + 1 : 0;
    run(process.execPath, [join(root, 'scripts/videos/render.mjs'), ...args, '--name', job.name, '--out', out, ...(from > 1 ? ['--from', String(from)] : [])]);
  }
  // The music on its own, 3 minutes of each track.
  mkdirSync(join(out, 'music'), { recursive: true });
  for (const track of recipe.music ?? []) {
    const mp3 = join(out, 'music', `${track}.mp3`);
    if (existsSync(mp3)) continue;
    const wav = join(tmpdir(), `tardigeddon-${track}.wav`);
    run('npx', ['tsx', join(root, 'scripts/videos/music.ts'), track, '180', wav]);
    run('ffmpeg', ['-loglevel', 'error', '-y', '-i', wav, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11,afade=t=out:st=176:d=4', '-c:a', 'libmp3lame', '-b:a', '192k', mp3]);
    rmSync(wav, { force: true });
  }
} finally {
  // Windows: the game runs under a shell, so stop the whole tree.
  if (server && win) spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  else server?.kill();
}
console.log(`\nDone in ${Math.round((Date.now() - t0) / 60_000)} min. Everything is in ${out}`);
