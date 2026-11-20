// "I'm building a game with AI": turns a real commit (or range) of this repo into
// a video of the change being made in a VS Code-like editor, with the Claude
// chat beside it, for the owner to narrate. docs/social/CODE_VIDEOS.md.
//
//   npm run videos:code -- --commit 3bb6ee2 [--prompt "what I asked"] [--bug "what was wrong"]
//   npm run videos:code -- --from A --to B --title "…"      (a range of commits)
//   options:
//     --prompt "…" | --prompt-file f.txt   what the owner asked Claude (else the commit subject, labelled as such)
//     --bug "…"                            the bug, for the title card and the Short's hook
//     --title "…"  --ep 3  --me "Richard"  the title card's title, episode number, the name on your chat messages
//     --test tests/x.test.ts[,…]           run `npm test -- <files>` now (on this checkout) and show it in the terminal
//     --test-output f.txt [--test-cmd "…"] or show output saved earlier (ANSI colours kept)
//     --only a,b  --skip a,b               files to show / not show (path substrings)
//     --speed 1                            typing and editing speed (2 = twice as fast)
//     --max-seconds 100  --short-seconds 45  how long each cut may be (long hunks are fast-forwarded)
//     --thumb "LINE ONE|LINE TWO"          the thumbnail's two lines
//     --voice narration.mp3                mux a recorded narration into the long video
//     --name n  --out store/videos/code  --no-short  --no-long
//     --plan                               only print what would be shown, and how long it takes
//     --preview                            play it in a visible browser in real time (nothing filmed)
//
// Out (in --out): <name>.mp4 (1920×1080), <name>-short.mp4 (1080×1920, zoomed in
// on the typing), <name>-thumb.jpg and <name>.txt (title, description, chapters
// and a narration script with timestamps).
//
// Everything shown is the commit's real diff, syntax-highlighted with Shiki
// (VS Code's Dark+ colours). Claude's edits are replayed at reading speed with a
// labelled "Claude" cursor; the status bar and end card say so. Filmed like
// render.mjs: Playwright on a virtual clock (site/capture/virtual-clock.js), CDP
// screenshots at 30 fps, ffmpeg (libx264). Set PW_CHROMIUM_PATH for a preinstalled Chromium.

import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHighlighter } from 'shiki';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../..');
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);
const WIN = process.platform === 'win32';
const FPS = 30;
const FRAME_MS = 1000 / FPS;
const SPEED = Number(opt('speed', '1')) || 1;
const OUT = resolve(ROOT, opt('out', 'store/videos/code'));
const TMP = process.env.CAPTURE_TMP ?? join(tmpdir(), 'tardigeddon-code-video');
const PREVIEW = flag('preview');
const CLOCK = readFileSync(join(ROOT, 'site/capture/virtual-clock.js'), 'utf8');
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

// ---------------------------------------------------------------- git

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
const gitOr = (fallback, ...a) => {
  try {
    return git(...a);
  } catch {
    return fallback;
  }
};

let FROM;
let TO;
if (opt('commit')) {
  TO = git('rev-parse', '--verify', `${opt('commit')}^{commit}`).trim();
  FROM = gitOr('', 'rev-parse', '--verify', '--quiet', `${TO}^`).trim() || EMPTY_TREE;
} else if (opt('from')) {
  FROM = git('rev-parse', '--verify', `${opt('from')}^{commit}`).trim();
  TO = git('rev-parse', '--verify', `${opt('to', 'HEAD')}^{commit}`).trim();
} else {
  console.error('Usage: npm run videos:code -- --commit <sha> [--prompt "…"] [--bug "…"]  (or --from A --to B). See the top of scripts/videos/code.mjs.');
  process.exit(1);
}

const commits = (opt('commit') ? git('log', '-1', '--format=%h%x1f%s%x1f%b%x1f%ad%x1e', '--date=short', TO) : git('log', '--reverse', '--format=%h%x1f%s%x1f%b%x1f%ad%x1e', '--date=short', `${FROM}..${TO}`))
  .split('\x1e')
  .map((s) => s.replace(/^\n/, ''))
  .filter((s) => s.trim())
  .map((s) => {
    const [hash, subject, body, date] = s.split('\x1f');
    return { hash, subject, body: body.replace(/^(Co-Authored-By|Claude-Session|Signed-off-by):.*$/gim, '').trim(), date };
  });
if (!commits.length) throw new Error('no commits in that range');
const SHORT_HASH = commits.length === 1 ? commits[0].hash : `${commits[0].hash}…${commits.at(-1).hash}`;
const SUBJECT = opt('title', commits.length === 1 ? commits[0].subject : `${commits.length} commits: ${commits.map((c) => c.subject).join('; ')}`);
const BODY = commits.map((c) => c.body).filter(Boolean).join('\n\n');
const DATE = fmtDate(commits.at(-1).date);
const NAME = opt('name', `code-${commits.at(-1).hash}`);
const BUG = opt('bug', '');
const PROMPT = opt('prompt-file') ? readFileSync(opt('prompt-file'), 'utf8').trim() : opt('prompt', '');
const ME = opt('me', 'Me');

function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`;
}

/** The commit's diff, file by file, as -U0 hunks (each one change: removed lines, then added lines). */
function parseDiff(text) {
  const files = [];
  let f = null;
  let h = null;
  for (let line of text.split('\n')) {
    line = line.replace(/\r$/, '');
    if (line.startsWith('diff --git ')) {
      const m = line.match(/^diff --git a\/(.*) b\/(.*)$/);
      f = { old: m?.[1] ?? null, path: m?.[2] ?? null, status: 'M', hunks: [], binary: false };
      files.push(f);
      h = null;
      continue;
    }
    if (!f) continue;
    const m = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/);
    if (m) {
      h = { a: +m[1], b: m[2] == null ? 1 : +m[2], c: +m[3], d: m[4] == null ? 1 : +m[4], ctx: m[5].trim(), nrem: 0, nadd: 0 };
      f.hunks.push(h);
      continue;
    }
    if (!h) {
      if (line === '--- /dev/null') f.old = null;
      else if (line.startsWith('--- a/')) f.old = line.slice(6);
      else if (line === '+++ /dev/null') f.path = null;
      else if (line.startsWith('+++ b/')) f.path = line.slice(6);
      else if (line.startsWith('new file')) f.status = 'A';
      else if (line.startsWith('deleted file')) f.status = 'D';
      else if (line.startsWith('rename from ')) (f.status = 'R'), (f.old = line.slice(12));
      else if (line.startsWith('rename to ')) f.path = line.slice(10);
      else if (line.startsWith('Binary files')) f.binary = true;
    } else if (line[0] === '-') h.nrem++;
    else if (line[0] === '+') h.nadd++;
  }
  for (const x of files) {
    if (x.status === 'A') x.old = null;
    if (x.status === 'D') (x.path = x.old), (x.gone = true);
    x.add = x.hunks.reduce((s, k) => s + k.nadd, 0);
    x.rem = x.hunks.reduce((s, k) => s + k.nrem, 0);
  }
  return files;
}

const IGNORE = [/package-lock\.json$/, /(^|\/)[^/]*\.lock$/, /^src\/i18n\/locales\//, /\.(png|jpe?g|webp|gif|ico|icns|mp3|ogg|wav|mp4|woff2?|ttf|otf|pdf|zip)$/i, /(^|\/)dist[^/]*\//, /\.min\.(js|css)$/, /\.pbxproj$/, /\.snap$/, /^store\//];
const only = opt('only', '').split(',').filter(Boolean);
const skip = opt('skip', '').split(',').filter(Boolean);
const allFiles = parseDiff(git('diff', '--no-color', '--no-ext-diff', '-U0', '-M', FROM, TO)).filter((f) => f.path);
const listed = allFiles.filter((f) => !IGNORE.some((r) => r.test(f.path)) && !skip.some((s) => f.path.includes(s)));
const showable = listed.filter((f) => !f.binary && !f.gone && f.hunks.length && (!only.length || only.some((s) => f.path.includes(s))));

// ---------------------------------------------------------------- highlighting

const LANGS = { ts: 'typescript', tsx: 'tsx', js: 'javascript', mjs: 'javascript', cjs: 'javascript', json: 'json', css: 'css', html: 'html', md: 'markdown', swift: 'swift', java: 'java', kt: 'kotlin', yml: 'yaml', yaml: 'yaml', sh: 'shellscript', sql: 'sql', toml: 'toml', xml: 'xml', py: 'python', gradle: 'groovy' };
const LANG_NAMES = { typescript: 'TypeScript', tsx: 'TypeScript JSX', javascript: 'JavaScript', json: 'JSON', css: 'CSS', html: 'HTML', markdown: 'Markdown', swift: 'Swift', java: 'Java', kotlin: 'Kotlin', yaml: 'YAML', shellscript: 'Shell', sql: 'SQL', toml: 'TOML', xml: 'XML', python: 'Python', groovy: 'Groovy', text: 'Plain Text' };
const langOf = (p) => LANGS[p.split('.').pop().toLowerCase()] ?? 'text';
const hl = await createHighlighter({ themes: ['dark-plus'], langs: [...new Set(showable.map((f) => langOf(f.path)).filter((l) => l !== 'text'))] });
const palette = [];
const palIdx = new Map();
const colour = (c) => {
  c = (c ?? '#D4D4D4').toUpperCase();
  if (!palIdx.has(c)) palIdx.set(c, palette.push(c) - 1);
  return palIdx.get(c);
};
/** A file's lines as [[text, colour index], …] tokens (tabs as two spaces). */
function tokenize(text, lang) {
  if (text == null) return [];
  const lines = text.replace(/\r/g, '').replace(/\t/g, '  ').split('\n');
  if (lines.at(-1) === '') lines.pop();
  let toks;
  try {
    toks = hl.codeToTokens(lines.join('\n'), { lang, theme: 'dark-plus' }).tokens;
  } catch {
    toks = lines.map((l) => [{ content: l, color: '#D4D4D4' }]);
  }
  return lines.map((_, i) => {
    const out = [];
    for (const t of toks[i] ?? []) {
      const c = colour(t.color);
      if (out.length && out.at(-1)[1] === c) out.at(-1)[0] += t.content;
      else out.push([t.content, c]);
    }
    return out;
  });
}
const textOf = (toks) => toks.map((t) => t[0]).join('');

for (const f of showable) {
  f.lang = langOf(f.path);
  f.before = f.old ? tokenize(gitOr('', 'show', `${FROM}:${f.old}`), f.lang) : [];
  f.after = tokenize(git('show', `${TO}:${f.path}`), f.lang);
  // Each hunk is one block: where it sits in the file (everything above already edited), what goes and what comes.
  f.blocks = f.hunks.map((h) => {
    const rem = h.b ? f.before.slice(h.a - 1, h.a - 1 + h.b).map((toks) => ({ toks, text: textOf(toks) })) : [];
    const add = h.d ? f.after.slice(h.c - 1, h.c - 1 + h.d).map((toks) => ({ toks, text: textOf(toks) })) : [];
    return { idx: h.d ? h.c - 1 : h.c, c: h.c, rem, add, ctx: h.ctx };
  });
  // Scenes: blocks close together, filmed in one go.
  f.scenes = [];
  for (const b of f.blocks) {
    const s = f.scenes.at(-1);
    const prev = s?.blocks.at(-1);
    const size = s ? s.blocks.reduce((n, x) => n + x.rem.length + x.add.length, 0) : 0;
    if (s && b.idx - (prev.idx + prev.add.length) <= 6 && size < 60) s.blocks.push(b);
    else f.scenes.push({ file: f, blocks: [b] });
  }
  for (const s of f.scenes) s.score = sceneScore(f.path, s);
  f.best = Math.max(0, ...f.scenes.map((s) => s.score));
}

function weight(p) {
  if (/^(tests|e2e)\//.test(p) || /\.(test|spec)\.[tj]sx?$/.test(p)) return 2.2;
  if (/^src\/news\//.test(p)) return 0.3;
  if (/^src\/i18n\//.test(p)) return 0.4;
  if (/^(src|server)\//.test(p)) return 3;
  if (/^scripts\//.test(p)) return 2;
  if (/\.css$/.test(p)) return 1.4;
  if (/\.md$/.test(p)) return 0.5;
  if (/\.(json|ya?ml|toml)$/.test(p)) return 0.6;
  return 1.2;
}
function sceneScore(p, s) {
  const lines = s.blocks.flatMap((b) => [...b.rem, ...b.add]).filter((l) => l.text.trim());
  const n = lines.length;
  if (!n) return 0;
  const both = s.blocks.some((b) => b.rem.length && b.add.length);
  const comments = lines.filter((l) => /^\s*(\/\/|\*|\/\*|#)/.test(l.text)).length / n;
  // A new file is typed in part and fast-forwarded, so its size costs little.
  if (s.file.status === 'A') return weight(p) * 1.6 * (1 - comments * 0.4) * Math.min(n, 14);
  return (weight(p) * (both ? 1.5 : 1) * (1 - comments * 0.4) * Math.min(n, 14)) / (1 + Math.max(0, n - 30) / 30);
}
const fileRank = (p) => (/^(tests|e2e)\//.test(p) || /\.(test|spec)\./.test(p) ? 3 : /\.md$/.test(p) ? 4 : /\.css$/.test(p) ? 2 : /^scripts\//.test(p) ? 1 : 0);

// ---------------------------------------------------------------- the test run

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ANSI = { 30: '#6e6e6e', 31: '#f14c4c', 32: '#23d18b', 33: '#e5e510', 34: '#3b8eea', 35: '#d670d6', 36: '#29b8db', 37: '#e5e5e5', 90: '#8a8a8a', 91: '#f14c4c', 92: '#23d18b', 93: '#f5f543', 94: '#3b8eea', 95: '#d670d6', 96: '#29b8db', 97: '#ffffff' };
function ansiHtml(line) {
  line = line.replace(/\x1b\[[0-9;?]*[A-Za-ln-z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
  let out = '';
  let fg = null;
  let bg = null;
  let bold = false;
  let dim = false;
  for (const part of line.split(/(\x1b\[[0-9;]*m)/)) {
    const m = part.match(/^\x1b\[([0-9;]*)m$/);
    if (m) {
      for (const c of (m[1] || '0').split(';').map(Number)) {
        if (c === 0) (fg = null), (bg = null), (bold = false), (dim = false);
        else if (c === 1) bold = true;
        else if (c === 2) dim = true;
        else if (c === 22) (bold = false), (dim = false);
        else if (c === 39) fg = null;
        else if (c === 49) bg = null;
        else if (ANSI[c]) fg = ANSI[c];
        else if ((c >= 40 && c <= 47) || (c >= 100 && c <= 107)) bg = ANSI[c - 10];
      }
      continue;
    }
    if (!part) continue;
    const st = [fg && `color:${fg}`, bold && 'font-weight:700', dim && 'opacity:.6', bg && `background:${bg};color:#111`].filter(Boolean).join(';');
    out += st ? `<span style="${st}">${esc(part)}</span>` : esc(part);
  }
  return out;
}
const plain = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');

function testRun() {
  if (opt('test-output')) return { cmd: opt('test-cmd', 'npm test'), text: readFileSync(opt('test-output'), 'utf8'), ok: null };
  if (!opt('test')) return null;
  const files = opt('test').split(',').filter(Boolean);
  const cmd = `npm test -- ${files.join(' ')}`;
  console.log(`running ${cmd} (on this checkout, not the commit)…`);
  const run = { cwd: ROOT, encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '1' }, shell: WIN, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 };
  try {
    const text = execFileSync('npm', ['test', '--', ...files], run);
    return { cmd, text, ok: true };
  } catch (e) {
    return { cmd, text: `${e.stdout ?? ''}${e.stderr ?? ''}`, ok: false };
  }
}
/** Test output without this computer's paths (they'd show the user name): the repo is "~/TardiGeddon". */
function scrub(text) {
  const homes = [ROOT, homedir()].flatMap((p) => [p, p.replace(/\\/g, '/'), p.replace(/\\/g, '\\\\')]);
  for (const p of homes.sort((a, b) => b.length - a.length)) text = text.split(p).join(p.startsWith(homedir()) && !p.startsWith(ROOT) ? '~' : '~/TardiGeddon');
  return text.replace(/[A-Z]:[\\/]Users[\\/][^\\/\s]+/gi, '~').replace(/\/(home|Users)\/[^/\s]+/g, '~');
}
const TEST = (() => {
  const r = testRun();
  return r && { ...r, text: scrub(r.text) };
})();
function testLines(n) {
  if (!TEST) return [];
  let lines = TEST.text.replace(/\r/g, '').split('\n');
  // Drop npm's "> tardigeddon@x test" banner and blank runs.
  lines = lines.filter((l) => !/^> /.test(plain(l)));
  const out = [];
  for (const l of lines) if (plain(l).trim() || (out.length && plain(out.at(-1)).trim())) out.push(l);
  while (out.length && !plain(out.at(-1)).trim()) out.pop();
  return out.slice(-n).map(ansiHtml);
}
const testSummary = () => {
  if (!TEST) return '';
  const m = plain(TEST.text).match(/Tests\s+(\d+) passed/);
  if (TEST.ok && m) return ` All ${m[1]} tests pass.`;
  if (TEST.ok === false) return ' The test run has failures: see the terminal.';
  return '';
};

// ---------------------------------------------------------------- the episode

const LAYOUTS = {
  long: { kind: 'long', w: 1280, h: 720, scale: 1.5, fontSize: 15, lineHeight: 22, termH: 210, cps: 34, runMax: 8, typedPerScene: 16, maxMs: Number(opt('max-seconds', '100')) * 1000, introD: 4200, outroD: 4000, termLines: 14, treeMax: 26, others: 6 },
  short: { kind: 'short', w: 540, h: 960, scale: 2, fontSize: 15, lineHeight: 22, termH: 230, cps: 32, runMax: 4, typedPerScene: 7, maxMs: Number(opt('short-seconds', '45')) * 1000, introD: 3000, outroD: 2800, termLines: 9, treeMax: 0, others: 0 },
};

function rngOf(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ms = (x) => Math.round(x / SPEED);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** Sentences of the commit body, for Claude's chat replies. */
function sentences(text, max) {
  const flat = text.replace(/\s*\n\s*/g, ' ').trim();
  // Split only where a stop is followed by a space (not at "cameraMotion.ts").
  const parts = flat.split(/(?<=[.!?])\s+/);
  let out = '';
  for (const s of parts) {
    if (out && (out + ' ' + s).length > max) break;
    out += (out ? ' ' : '') + s;
  }
  return (out || flat.slice(0, max)).trim();
}

function makeEpisode(L) {
  const rng = rngOf(0x7a2d1 + L.w);
  const typeTimes = (str) => {
    const out = [];
    let t = 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      const prev = str[i - 1];
      let d = (1000 / L.cps) * (0.55 + rng() * 0.9);
      if (ch === ' ') d *= 1.25;
      if (prev && ',;{}()'.includes(prev)) d += 25;
      if (rng() < 0.025) d += 160;
      t += d / SPEED;
      out.push(Math.round(t));
    }
    return out;
  };
  const typeOp = (row, n) => {
    const indent = n.text.match(/^ */)[0].length;
    const times = typeTimes(n.text.slice(indent)).map((t) => t + ms(90));
    return { type: 'type', row, toks: n.toks, indent, times, d: (times.at(-1) ?? ms(90)) + ms(150) };
  };
  const pasteOp = (row, lines) => {
    const every = Math.max(8, Math.min(45, 1600 / lines.length)) / SPEED;
    return { type: 'paste', row, lines: lines.map((l) => l.toks), every, label: `⏩ ${lines.length} more line${lines.length === 1 ? '' : 's'} (fast-forward)`, d: Math.round(every * lines.length + ms(300)) };
  };
  const editOp = (row, o, n, budget) => {
    const t = n.text;
    let p = 0;
    while (p < o.length && p < t.length && o[p] === t[p]) p++;
    let s = 0;
    while (s < o.length - p && s < t.length - p && o[o.length - 1 - s] === t[t.length - 1 - s]) s++;
    const mid = t.slice(p, t.length - s);
    const oldMid = o.length - p - s;
    const fast = budget.lines <= 0;
    budget.lines--;
    const times = fast ? [...mid].map(() => 0) : typeTimes(mid);
    const selD = oldMid && !fast ? ms(Math.min(420, 140 + oldMid * 10)) : 0;
    const holdD = oldMid && !fast ? ms(280) : 0;
    return { type: 'edit', row, p, s, toks: n.toks, times, selD, holdD, d: selD + holdD + (times.at(-1) ?? 0) + ms(fast ? 120 : 200) };
  };
  const similar = (a, b) => {
    if (!a.trim() || !b.trim()) return false;
    let p = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) p++;
    let s = 0;
    while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
    return p + s >= 6 && p + s >= 0.5 * Math.max(a.length, b.length);
  };
  const blockOps = (b, budget) => {
    const ops = [];
    // Pair removed lines with similar added ones (in order): those are edited in place.
    const pairs = new Map();
    const paired = new Set();
    let j = 0;
    for (let i = 0; i < b.rem.length; i++)
      for (let k = j; k < b.add.length && k < j + 4; k++)
        if (similar(b.rem[i].text, b.add[k].text)) {
          pairs.set(k, i);
          paired.add(i);
          j = k + 1;
          break;
        }
    const gone = b.rem.map((_, i) => i).filter((i) => !paired.has(i));
    if (gone.length) ops.push({ type: 'del', rows: gone.map((i) => b.idx + i), mark: ms(gone.length > 8 ? 380 : 560), d: ms(gone.length > 8 ? 650 : 860) });
    let pos = b.idx;
    for (let k = 0; k < b.add.length; ) {
      if (pairs.has(k)) {
        ops.push(editOp(pos++, b.rem[pairs.get(k)].text, b.add[k], budget));
        k++;
        continue;
      }
      let e = k;
      while (e < b.add.length && !pairs.has(e)) e++;
      const run = b.add.slice(k, e);
      const n = Math.min(run.length <= L.runMax + 2 ? run.length : L.runMax, Math.max(0, budget.lines));
      for (let q = 0; q < n; q++) ops.push(typeOp(pos++, run[q]));
      budget.lines -= n;
      if (n < run.length) {
        ops.push(pasteOp(pos, run.slice(n)));
        pos += run.length - n;
      }
      k = e;
    }
    return ops;
  };
  const sceneOps = (s) => {
    const budget = { lines: L.typedPerScene };
    const ops = [{ type: 'scroll', row: s.blocks[0].idx, at: L.kind === 'short' ? 0.25 : 0.3, d: ms(700) }, { type: 'wait', d: ms(250) }];
    for (const b of s.blocks) ops.push(...blockOps(b, budget), { type: 'wait', d: ms(240) });
    return ops;
  };
  const dur = (ops) => ops.reduce((n, o) => n + (o.d ?? 0), 0);
  const OPEN = ms(650) + 300;

  // Choose scenes: the most interesting first, while they fit the time.
  const fixed = timeline(L, [], null).total;
  let left = L.maxMs - fixed;
  const chosen = new Set();
  const files = new Set();
  const cands = showable.flatMap((f) => f.scenes).filter((s) => s.score > 0);
  const seen = new Map();
  // A file's later scenes count a little less, so one big file doesn't take the whole video.
  cands.sort((a, b) => b.score - a.score);
  for (const s of cands) {
    const k = seen.get(s.file) ?? 0;
    s.adj = s.score * 0.75 ** k;
    seen.set(s.file, k + 1);
  }
  cands.sort((a, b) => b.adj - a.adj);
  for (const s of cands) {
    const cost = dur(sceneOps(s)) + (files.has(s.file) ? 0 : OPEN);
    if (cost > left && chosen.size) continue;
    chosen.add(s);
    files.add(s.file);
    left -= cost;
  }
  const order = [...files].sort((a, b) => fileRank(a.path) - fileRank(b.path) || b.best - a.best);
  return timeline(L, order, { chosen, sceneOps, blockOps });
}

/** Lays the whole video out in time. `order`: the files to open; `plan` says which scenes are filmed. */
function timeline(L, order, plan) {
  const ops = [];
  const notes = [];
  let t = 0;
  const add = (op) => {
    op.t = Math.round(t);
    ops.push(op);
    t += op.d ?? 0;
    return op;
  };
  const note = (kind, text, say = '') => notes.push({ t, kind, text, say });
  const short = L.kind === 'short';

  const title = opt('title') ? SUBJECT : SUBJECT.length > 60 ? SUBJECT.split(';')[0] : SUBJECT;
  note('intro', `Title card: "${title}"${BUG ? ` — the bug: ${BUG}` : ''}`, BUG ? `This week's bug: ${BUG}` : `This week: ${SUBJECT.toLowerCase()}.`);
  add({
    type: 'card',
    d: L.introD,
    html:
      `<div class="kick">I'm building a game with AI${opt('ep') ? ` · Episode ${esc(opt('ep'))}` : ''}</div>` +
      `<div class="big">${esc(title)}</div>` +
      (BUG ? `<div class="bug"><b>The bug:</b> ${esc(BUG)}</div>` : '') +
      `<div class="meta">Real commit ${esc(SHORT_HASH)} · ${DATE} · TardiGeddon</div>`,
  });
  t += 200;
  const promptText = PROMPT || BUG || SUBJECT;
  const tag = PROMPT ? '' : BUG ? '(the bug report)' : '(the task, from the commit message)';
  note('prompt', `Your message to Claude: "${promptText}"`, PROMPT ? `I asked Claude: "${PROMPT}"` : `I gave Claude the problem.`);
  add({ type: 'user', name: ME, tag, text: promptText, d: clamp(1200 + promptText.length * 22, 1800, 5200) * (short ? 0.8 : 1) });
  add({ type: 'think', d: ms(900) });
  const reply = BODY ? sentences(BODY, short ? 150 : 360) : 'On it.';
  note('reply', `Claude's reply (from its commit message): "${reply}"`, `Claude worked out: ${reply}`);
  add({ type: 'reply', text: reply, d: clamp(reply.length * 9, 900, 4200) });
  t += 700;

  if (plan) {
    order.forEach((f, fi) => {
      const id = `f${fi}`;
      const fileIdx = order.indexOf(f);
      note('file', `Opens ${f.path}${f.status === 'A' ? ' (a new file)' : ''}: +${f.add} −${f.rem} in all`);
      add({ type: 'tool', id, text: `${f.status === 'A' ? 'Write' : 'Edit'} ${f.path}`, d: 0 });
      add({ type: 'open', file: fileIdx, d: ms(650) });
      const filmed = new Set(f.scenes.filter((s) => plan.chosen.has(s)));
      for (const s of f.scenes) {
        if (filmed.has(s)) {
          const nrem = s.blocks.reduce((n, b) => n + b.rem.length, 0);
          const nadd = s.blocks.reduce((n, b) => n + b.add.length, 0);
          const where = s.blocks[0].ctx ? `in \`${s.blocks[0].ctx.slice(0, 70)}\`` : `around line ${s.blocks[0].c}`;
          const what = nrem && nadd ? `replaces ${nrem} line${nrem === 1 ? '' : 's'} with ${nadd}` : nadd ? `adds ${nadd} line${nadd === 1 ? '' : 's'}` : `removes ${nrem} line${nrem === 1 ? '' : 's'}`;
          note('scene', `${f.path.split('/').pop()} ${where}: ${what}`);
          for (const op of plan.sceneOps(s)) add(op);
        } else for (const b of s.blocks) add({ type: 'quiet', row: b.idx, del: b.rem.length, lines: b.add.map((l) => l.toks), d: 0 });
      }
      add({ type: 'save', d: 0 });
      add({ type: 'tool', id, text: `${f.status === 'A' ? 'Write' : 'Edit'} ${f.path}`, add: f.add, rem: f.rem, done: true, d: ms(350) });
      t += 250;
    });
    // The other files changed, listed in the chat.
    const rest = listed.filter((f) => !order.includes(f));
    if (rest.length) note('others', `Also changed: ${rest.map((f) => f.path).join(', ')}`);
    rest.slice(0, L.others).forEach((f, i) => add({ type: 'tool', id: `o${i}`, text: `${f.gone ? 'Delete' : f.status === 'A' ? 'Write' : 'Edit'} ${f.path}`, add: f.add, rem: f.rem, done: true, d: ms(260) }));
    const hidden = allFiles.length - order.length - Math.min(rest.length, L.others);
    if (hidden > 0) add({ type: 'tool', id: 'more', text: `…and ${hidden} more file${hidden === 1 ? '' : 's'}`, done: true, d: ms(300) });
  }

  if (TEST) {
    const lines = testLines(L.termLines);
    note('test', `Terminal: ${TEST.cmd}`, `Then the tests.${testSummary()}`);
    add({ type: 'tool', id: 'test', text: `Bash ${TEST.cmd}`, d: 0 });
    const cmdEvery = 28 / SPEED;
    const runD = 700;
    const lineEvery = 90;
    add({ type: 'term', cmd: TEST.cmd, lines, cmdEvery, runD, lineEvery, d: Math.round(350 + TEST.cmd.length * cmdEvery + runD + lines.length * lineEvery + 2200) });
    add({ type: 'tool', id: 'test', text: `Bash ${TEST.cmd}`, done: true, d: 0 });
  }
  const closing = `Done: ${SUBJECT.replace(/\.$/, '')}.${testSummary()}`;
  add({ type: 'reply', text: closing, d: clamp(closing.length * 9, 800, 2200) });
  t += 1200;
  add({ type: 'done', d: 0 });
  note('outro', 'End card: Play free at tardigeddon.com/play', 'TardiGeddon is free to play at tardigeddon.com/play. See you next week.');
  add({
    type: 'card',
    d: L.outroD,
    html:
      `<div class="kick">Code written by Claude (AI) · directed by me</div>` +
      `<div class="big">TardiGeddon</div>` +
      `<div class="play">Play free: tardigeddon.com/play</div>` +
      `<div class="meta">Every edit in this video is from the real commit ${esc(SHORT_HASH)}</div>`,
  });
  for (const op of ops) if (op.type === 'wait') op.skip = true;
  return { ops: ops.filter((o) => !o.skip), notes, total: Math.round(t), order };
}

function treeOf(L, order) {
  if (!L.treeMax) return [];
  const paths = listed.map((f) => f.path).sort();
  const out = [];
  const open = [];
  for (const p of paths) {
    const parts = p.split('/');
    let k = 0;
    while (k < open.length && open[k] === parts[k]) k++;
    open.length = k;
    for (; k < parts.length - 1; k++) {
      out.push({ dir: true, name: parts[k], depth: k });
      open.push(parts[k]);
    }
    const f = listed.find((x) => x.path === p);
    out.push({ path: p, name: parts.at(-1), depth: parts.length - 1, status: f.gone ? 'D' : f.status });
  }
  // Too many to fit: keep the files on screen and their folders.
  if (out.length <= L.treeMax) return out;
  const keep = new Set(order.map((f) => f.path));
  return out.filter((n, i) => n.dir ? out.slice(i + 1).some((m) => m.path && keep.has(m.path) && m.path.split('/')[n.depth] === n.name) : keep.has(n.path)).slice(0, L.treeMax);
}

// ---------------------------------------------------------------- the page

const font = (pkg, file) => readFileSync(join(dirname(require.resolve(`${pkg}/package.json`)), 'files', file)).toString('base64');
const FONTS = [
  ['JetBrains Mono', '@fontsource/jetbrains-mono', 'jetbrains-mono-latin-400-normal.woff2', 400],
  ['JetBrains Mono', '@fontsource/jetbrains-mono', 'jetbrains-mono-latin-700-normal.woff2', 700],
  ['Nunito', '@fontsource/nunito', 'nunito-latin-400-normal.woff2', 400],
  ['Nunito', '@fontsource/nunito', 'nunito-latin-700-normal.woff2', 700],
  ['Nunito', '@fontsource/nunito', 'nunito-latin-800-normal.woff2', 800],
  ['Luckiest Guy', '@fontsource/luckiest-guy', 'luckiest-guy-latin-400-normal.woff2', 400],
]
  .map(([fam, pkg, file, w]) => `@font-face{font-family:'${fam}';font-weight:${w};font-style:normal;src:url(data:font/woff2;base64,${font(pkg, file)}) format('woff2');}`)
  .join('\n');

function thumbLines() {
  if (opt('thumb')) return opt('thumb').split('|');
  const [a, b] = SUBJECT.includes(':') ? SUBJECT.split(/:\s*/) : [SUBJECT.split(' ').slice(0, 2).join(' '), SUBJECT.split(' ').slice(2).join(' ')];
  return [a, (b ?? '').split(/[;,(]/)[0].split(' ').slice(0, 3).join(' ')].map((s) => s.toUpperCase());
}

function pageHtml(L, ep) {
  const data = {
    palette,
    layout: { fontSize: L.fontSize, lineHeight: L.lineHeight, termH: L.termH },
    langNames: LANG_NAMES,
    files: ep.order.map((f) => ({ path: f.path, lang: f.lang, before: f.before })),
    tree: treeOf(L, ep.order),
    ops: ep.ops,
    total: ep.total,
    autoplay: PREVIEW,
  };
  const json = JSON.stringify(data).replace(/</g, '\\u003c'); // (U+2028/9 are fine in scripts since ES2019)
  const [l1, l2] = thumbLines();
  return `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}\n${readFileSync(join(here, 'code/page.css'), 'utf8')}</style></head>
<body class="${L.kind}">
<div id="app">
  <div id="head"><div class="t">I'm building a game with AI</div><div class="s">Real commit ${esc(SHORT_HASH)} · Claude's edits, replayed at reading speed</div></div>
  <div id="title"><div class="menu"><span>File</span><span>Edit</span><span>Selection</span><span>View</span><span>Go</span><span>Run</span><span>Terminal</span><span>Help</span></div><div class="name" id="title-name">TardiGeddon</div></div>
  <div id="act"><i class="on"></i><i class="round"></i><i></i><i></i></div>
  <div id="side"><div class="hdr">EXPLORER</div><div class="root">▾ TARDIGEDDON</div><div id="tree"></div></div>
  <div id="main"><div id="tabs"></div><div id="crumbs"></div><div id="code"></div><div id="term"></div></div>
  <div id="chat"><div id="chat-head"><i class="dot"></i>CLAUDE CODE</div><div id="chat-log"></div><div id="chat-input">Ask Claude to change something…</div></div>
  <div id="status"><span>⎇ main</span><span class="rec">Replay of commit ${esc(SHORT_HASH)} · Claude's real edits, slowed down to watch</span><span class="sp"></span><span id="st-pos"></span><span id="st-lang"></span><span class="cl" id="st-claude"></span></div>
  <div id="foot">tardigeddon.com/play</div>
</div>
<div id="card"></div>
<div id="thumb"><div class="shade"></div><div class="lines"><div class="l1">${esc(l1 ?? '')}</div><div class="l2">${esc(l2 ?? '')}</div></div><div class="badge">Built with AI</div><div class="brand">TardiGeddon</div></div>
<script>window.__episode = ${json};</script>
<script>${readFileSync(join(here, 'code/page.js'), 'utf8')}</script>
</body></html>`;
}

// ---------------------------------------------------------------- filming

const mmss = (t) => `${Math.floor(t / 60000)}:${String(Math.floor((t / 1000) % 60)).padStart(2, '0')}`;

async function film(browser, L, ep, out) {
  mkdirSync(TMP, { recursive: true });
  const htmlPath = join(TMP, `${NAME}-${L.kind}.html`);
  writeFileSync(htmlPath, pageHtml(L, ep));
  const ctx = await browser.newContext({ viewport: { width: L.w, height: L.h }, deviceScaleFactor: L.scale });
  if (!PREVIEW) await ctx.addInitScript(CLOCK);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('  page error:', e.message));
  await page.goto(pathToFileURL(htmlPath).href);
  await page.waitForFunction(() => window.__player?.ready, null, { timeout: 30_000 });
  if (PREVIEW) {
    console.log(`  playing ${L.kind} (${mmss(ep.total)}) in the browser…`);
    await page.waitForTimeout(ep.total + 1500);
    await ctx.close();
    return;
  }
  await page.evaluate(() => window.__virt.freeze());
  // Keep the page drawn at L.scale in raw screenshots (see render.mjs screenSession).
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: L.w, height: L.h, deviceScaleFactor: L.scale, mobile: false });
  await page.evaluate(() => window.__player.start());
  const dir = join(TMP, `${NAME}-${L.kind}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const n = Math.ceil(ep.total / FRAME_MS) + 1;
  const thumbT = L.kind === 'long' ? thumbTime(ep) : -1;
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    await page.evaluate((ms) => window.__virt.step(ms), FRAME_MS);
    const T = (i + 1) * FRAME_MS;
    if (thumbT >= 0 && T >= thumbT && T - FRAME_MS < thumbT) {
      await page.evaluate(() => window.__player.thumb(true));
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const png = join(dir, 'thumb.png');
      writeFileSync(png, Buffer.from(data, 'base64'));
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-q:v', '2', join(OUT, `${NAME}-thumb.jpg`)]);
      await page.evaluate(() => window.__player.thumb(false));
    }
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 95 });
    writeFileSync(join(dir, `${String(i).padStart(6, '0')}.jpg`), Buffer.from(data, 'base64'));
    if (i % 300 === 0) console.log(`  ${L.kind}: frame ${i}/${n} (${Math.round((Date.now() - t0) / 1000)}s)`);
  }
  await ctx.close();
  const voice = L.kind === 'long' && opt('voice') ? ['-i', resolve(opt('voice')), '-af', 'apad', '-shortest', '-c:a', 'aac', '-b:a', '192k'] : ['-an'];
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(dir, '%06d.jpg'), ...voice, '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: 'inherit' });
  if (!flag('keep-frames')) rmSync(dir, { recursive: true, force: true });
  console.log(`  wrote ${out} (${mmss(ep.total)})`);
}

/** The thumbnail's moment: just after the last edit in the first ~60% of the video (fresh green lines on screen). */
function thumbTime(ep) {
  const edits = ep.ops.filter((o) => (o.type === 'type' || o.type === 'edit' || o.type === 'paste') && o.t + o.d < ep.total * 0.6);
  const last = edits.at(-1) ?? ep.ops.find((o) => o.type === 'type' || o.type === 'edit');
  return last ? last.t + last.d + 200 : ep.total / 2;
}

// ---------------------------------------------------------------- the text

function chapters(notes, total) {
  const marks = [{ t: 0, label: BUG ? 'The bug' : 'The task' }];
  for (const n of notes) {
    if (n.kind === 'file') marks.push({ t: n.t, label: n.text.replace(/^Opens /, '').replace(/:.*$/, '').replace(/ \(a new file\)/, '') });
    if (n.kind === 'test') marks.push({ t: n.t, label: 'Running the tests' });
  }
  // YouTube: at least 3 chapters, each at least 10 seconds.
  const out = [];
  for (const m of marks) {
    if (out.length && m.t - out.at(-1).t < 10_000) continue;
    out.push(m);
  }
  while (out.length > 1 && total - out.at(-1).t < 10_000) out.pop();
  return out.length >= 3 ? out : [];
}

function script(notes) {
  // The rest of the commit message (Claude's own explanation) goes with its reply, as points
  // to cover while the code is typed: matching paragraphs to files by guesswork would mislead.
  const paras = BODY.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean).slice(1);
  const lines = notes.map((n) => `[${mmss(n.t)}] ${n.text}${n.say ? `\n        Say: ${n.say}` : ''}`);
  if (paras.length) {
    const i = notes.findIndex((n) => n.kind === 'reply');
    lines.splice(i + 1, 0, '        More to cover while the code goes in (from the commit message):', ...paras.map((p) => `          - ${p}`));
  }
  return lines.join('\n');
}

function writeText(eps) {
  const long = eps.long;
  const shortTitle = SUBJECT.length > 70 ? SUBJECT.split(';')[0] : SUBJECT;
  const ch = long ? chapters(long.notes, long.total) : [];
  const lines = [
    'TITLE',
    `I'm building a game with AI: ${shortTitle}`.slice(0, 100),
    '',
    'DESCRIPTION',
    BUG ? `The bug: ${BUG}` : SUBJECT,
    '',
    `TardiGeddon is a turn-based artillery game about tardigrades, and I'm building it with Claude Code, an AI that writes the code while I direct it. Every edit in this video is from the real commit ${SHORT_HASH} (${DATE}); Claude's typing is replayed at reading speed so you can follow it. The narration is my own voice, cloned with AI.`,
    '',
    'Play free: https://tardigeddon.com/play',
    ...(ch.length ? ['', 'Chapters:', ...ch.map((c) => `${mmss(c.t)} ${c.label}`)] : []),
    '',
    '#gamedev #indiedev #buildinpublic #ai #claudecode #tardigeddon',
    '',
    'TAGS',
    'tardigeddon, game dev, indie game, building a game with AI, Claude Code, AI coding, devlog, tardigrade game, artillery game, bug fix',
    '',
    'AI DISCLOSURE',
    'The voice is an AI clone of mine: tick "altered or synthetic content" on YouTube and "AI-generated content" on TikTok/Facebook (docs/social/VIDEOS.md, "Rules for every video").',
  ];
  if (long) lines.push('', `NARRATION SCRIPT — ${NAME}.mp4 (${mmss(long.total)}). Times are where each part starts; say it in your own words.`, script(long.notes));
  if (eps.short) {
    lines.push('', `SHORT — ${NAME}-short.mp4 (${mmss(eps.short.total)})`, `Title: ${shortTitle} (built with AI) #shorts`, 'Narration:', script(eps.short.notes));
  }
  lines.push('', 'COMMIT MESSAGE', ...commits.map((c) => `${c.hash} ${c.subject}\n\n${c.body}`), '');
  writeFileSync(join(OUT, `${NAME}.txt`), lines.join('\n'));
}

// ---------------------------------------------------------------- run

if (!showable.length) {
  console.error('Nothing to show: every file in that change is skipped (lockfiles, translations, images…). Try --only.');
  process.exit(1);
}
const eps = {};
for (const kind of ['long', 'short']) {
  if (flag(`no-${kind}`)) continue;
  eps[kind] = makeEpisode(LAYOUTS[kind]);
}
for (const [kind, ep] of Object.entries(eps)) {
  console.log(`${kind}: ${mmss(ep.total)}, ${ep.order.length} file(s) shown of ${allFiles.length} changed`);
  for (const n of ep.notes) if (n.kind === 'file' || n.kind === 'scene') console.log(`  ${mmss(n.t)} ${n.kind === 'scene' ? '  ' : ''}${n.text}`);
}
if (flag('plan')) process.exit(0);
if (flag('text-only')) {
  // Rewrite only <name>.txt (same options give the same timings as the videos).
  mkdirSync(OUT, { recursive: true });
  writeText(eps);
  console.log(join(OUT, `${NAME}.txt`));
  process.exit(0);
}
if (flag('html')) {
  // Just the editor pages (open one in a browser to watch it, or to debug).
  mkdirSync(TMP, { recursive: true });
  for (const [kind, ep] of Object.entries(eps)) {
    const p = join(TMP, `${NAME}-${kind}-debug.html`);
    writeFileSync(p, pageHtml(LAYOUTS[kind], { ...ep, ops: ep.ops }));
    console.log(p);
  }
  process.exit(0);
}

mkdirSync(OUT, { recursive: true });
writeText(eps);
const browser = await chromium.launch({ headless: !PREVIEW, executablePath: process.env.PW_CHROMIUM_PATH || undefined });
try {
  for (const [kind, ep] of Object.entries(eps)) await film(browser, LAYOUTS[kind], ep, join(OUT, kind === 'long' ? `${NAME}.mp4` : `${NAME}-short.mp4`));
} finally {
  await browser.close();
}
if (!PREVIEW) console.log(`done: ${join(OUT, NAME)}.{mp4,txt}${eps.long ? ', -thumb.jpg' : ''}${eps.short ? ', -short.mp4' : ''}`);
