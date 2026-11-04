// Weeks of social posts for Sociamonials (docs/social/SCHEDULE.md): draws a
// game-style picture card for each post in scripts/social/posts.ts and writes
// a bulk-import CSV in Sociamonials' format.
//
//   npx tsx scripts/social-posts.ts [batch] [--one-line] [--check]
//
//   batch       which posts (their `batch` number; 1 if not given)
//   --one-line  no line breaks inside posts (if an import ever trips on them)
//   --check     only check the posts (lengths, ids, pictures); draw nothing
//
// Writes:
//   site/public/social/posts/<id>.jpg   the cards, served at tardigeddon.com/social/posts/
//                                       (merge and deploy before importing the CSV:
//                                       Sociamonials fetches the pictures from there)
//   site/public/social/teaser.mp4       the vertical Shorts teaser, for the video posts
//   store/social/queue/batch-<n>.csv    the file to import (Bulk Upload)
//   store/social/queue/batch-<n>.html   a preview of every post, to read through first
//
// Needs Playwright's Chromium (PW_CHROMIUM_PATH=/opt/pw-browsers/chromium in sandboxes).

import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { WEAPONS } from '../src/sim/weapons';
import { HATS } from '../src/render/hats';
import { BLUE, GOLD, GREEN, RED, ground, media, page, root, shot, tardi } from './social-art';
import { POSTS, type Category, type Post } from './social/posts';

const SITE = 'https://tardigeddon.com';
const PLAY_LINE = '▶ Play free: tardigeddon.com/play';
const W = 1080;
const H = 1350;

const args = process.argv.slice(2);
const batch = Number(args.find((a) => /^\d+$/.test(a)) ?? 1);
const oneLine = args.includes('--one-line');
const checkOnly = args.includes('--check');

const cardDir = join(root, 'site', 'public', 'social', 'posts');
const queueDir = join(root, 'store', 'social', 'queue');

// ── Fill in and check the posts ──────────────────────────────────────────

/** Weapon posts take their name and card text from the game's own data. */
function complete(p: Post): Post {
  if (!('weapon' in p.art) || p.category !== 'Weapons') return p;
  const w = WEAPONS[p.art.weapon];
  if (!w) return p;
  return {
    ...p,
    title: p.title || w.name,
    text: p.text || (w.blurb ?? '').replace(/^Superweapon: (.)/, (_, c: string) => c.toUpperCase()),
    alt: p.alt || `The ${w.name}'s icon, ${w.icon}, next to a cartoon tardigrade.`,
  };
}

const HASHES = (p: Post) => ['TardiGeddon', ...(p.tags ?? [])].map((t) => `#${t}`).join(' ');

/** The post as it's published: its words, the play link, the hashtags. */
function fullMessage(p: Post): string {
  const parts = [p.message, ...(p.noPlayLink ? [] : [PLAY_LINE]), HASHES(p)];
  return parts.join(oneLine ? ' ' : '\n\n');
}

/** Length as X counts it: wide characters (emoji, Japanese) count twice, links 23. */
function xLength(s: string): number {
  let n = 0;
  for (const ch of s.replace(/\b[a-z0-9.-]+\.(com|org)(\/[\w/-]*)?/gi, 'x'.repeat(23))) n += (ch.codePointAt(0) ?? 0) >= 0x1100 ? 2 : 1;
  return n;
}

function check(posts: Post[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const p of POSTS) {
    if (ids.has(p.id)) problems.push(`${p.id}: the id is used twice`);
    ids.add(p.id);
  }
  for (const p of posts) {
    const where = `${p.id}:`;
    const art = p.art;
    if ('weapon' in art && (!WEAPONS[art.weapon] || WEAPONS[art.weapon].hidden)) problems.push(`${where} no weapon "${art.weapon}"`);
    if ('shot' in art && !existsSync(join(media, art.shot))) problems.push(`${where} no picture site/public/media/${art.shot}`);
    if ('tardis' in art) for (const t of art.tardis) if (!HATS.some((h) => h.id === t.hat)) problems.push(`${where} no hat "${t.hat}"`);
    if (!p.title || !p.text || !p.alt) problems.push(`${where} needs a title, text and alt`);
    if (/worms/i.test(`${p.message} ${p.title} ${p.text}`)) problems.push(`${where} never mention Worms (docs/social/README.md)`);
    const msg = fullMessage(p);
    if (xLength(msg) > 280) problems.push(`${where} too long for X (${xLength(msg)} of 280)`);
    if ([...msg].length > 300) problems.push(`${where} too long for Bluesky (${[...msg].length} of 300)`);
    if (p.title.length > 100) problems.push(`${where} the title is too long for a Pin (100)`);
    if (p.alt.length > 500) problems.push(`${where} alt text over 500 characters`);
    if (p.date && !/^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(p.date)) problems.push(`${where} date must be "YYYY-MM-DD HH:MM"`);
  }
  return problems;
}

// ── The cards ────────────────────────────────────────────────────────────

const CHIP: Record<Category, { label: string; color: string }> = {
  Weapons: { label: '⚔️ Weapon', color: '#e04848' },
  Tips: { label: '💡 Tip', color: '#3a7be0' },
  'Tardigrade facts': { label: '🔬 Tardigrade fact', color: '#3cb34a' },
  'Worlds and modes': { label: '🎮 In the game', color: '#9a5ae0' },
  Community: { label: '💬 Your turn', color: '#e06aa8' },
  Play: { label: '▶ Play free', color: '#e0a020' },
  Videos: { label: '🎬 Watch', color: '#e04848' },
};

const CARD_CSS = `
.chip { position:absolute; left:50%; top:52px; transform:translateX(-50%); color:#fff; font-size:40px; padding:10px 34px; border:5px solid #2b1b24; border-radius:999px; box-shadow:0 6px 0 #2b1b24; white-space:nowrap; text-transform:uppercase; letter-spacing:0.04em; }
.title { position:absolute; left:40px; right:40px; top:150px; height:170px; display:flex; align-items:center; justify-content:center; text-align:center; }
.text { position:absolute; left:60px; right:60px; top:960px; background:#fff8ec; border:6px solid #2b1b24; border-radius:28px; box-shadow:0 10px 0 #2b1b24; padding:26px 34px; font-size:42px; line-height:1.25; text-align:center; }
.tags { display:flex; gap:12px; justify-content:center; margin-top:14px; font-size:30px; }
.tags b { background:#2b1b24; color:#fff8ec; border-radius:999px; padding:4px 18px; }
.foot { position:absolute; left:50px; right:50px; bottom:42px; display:flex; align-items:center; justify-content:space-between; }
.foot .url { font-size:38px; color:#fff8ec; text-shadow:0 3px 0 #2b1b24; }
.bubble { position:absolute; left:110px; top:380px; width:860px; height:390px; background:#fff8ec; border:8px solid #2b1b24; border-radius:60px; box-shadow:0 12px 0 #2b1b24; display:flex; align-items:center; justify-content:center; font-size:150px; }
.icon { position:absolute; left:110px; top:390px; width:450px; height:450px; border-radius:50%; background:#fff8ec; border:10px solid #2b1b24; box-shadow:0 14px 0 #2b1b24; display:flex; align-items:center; justify-content:center; font-size:250px; }
`;

/** Pick the same "random" hat for a post every time. */
function hatFor(id: string): string {
  const pool = HATS.filter((h) => h.shapes.length && !['waterbear', 'earlybird', 'supporter', 'superfan', 'founder'].includes(h.id));
  let n = 0;
  for (const ch of id) n = (n * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return pool[n % pool.length].id;
}

const TEAM = [RED, BLUE, GREEN, GOLD];
const colourFor = (id: string) => TEAM[id.length % TEAM.length];

function art(p: Post): string {
  const a = p.art;
  if ('shot' in a) return shot(a.shot, 'left:70px;top:350px;width:940px;height:529px;transform:rotate(-1.5deg)');
  if ('weapon' in a) {
    return `<div class="icon">${WEAPONS[a.weapon].icon}</div>${tardi(colourFor(p.id), hatFor(p.id), 'width:560px;left:500px;top:470px;transform:scaleX(-1)')}`;
  }
  if ('stat' in a) {
    const size = a.stat.length <= 4 ? 260 : a.stat.length <= 7 ? 190 : 150;
    return `<div class="big center" style="position:absolute;left:40px;right:40px;top:350px;height:330px;font-size:${size}px;color:#fff8ec">${a.stat}</div>
      ${tardi(colourFor(p.id), hatFor(p.id), 'width:440px;left:320px;top:600px')}`;
  }
  if ('question' in a) {
    return `<div class="bubble">${a.question}</div>${tardi(colourFor(p.id), hatFor(p.id), 'width:400px;left:680px;top:640px;transform:scaleX(-1)')}`;
  }
  const n = a.tardis.length;
  const w = [0, 600, 440, 330, 250][n] ?? 220;
  return a.tardis
    .map((t, i) => tardi(t.color, t.hat, `width:${w}px;left:${(W * (i + 1)) / (n + 1) - w / 2}px;top:${640 - w * 0.375}px${i % 2 ? ';transform:scaleX(-1)' : ''}`, t.skin))
    .join('');
}

function tagsFor(p: Post): string {
  if (!('weapon' in p.art) || p.category !== 'Weapons') return '';
  const w = WEAPONS[p.art.weapon];
  const spec = w.projectile ?? (w.strike ? WEAPONS[w.strike.weapon].projectile : w.shower ? WEAPONS[w.shower.weapon].projectile : undefined);
  const tags = [w.super ? '⭐ Superweapon' : '', w.locked ? '🟢 Season weapon' : '', (spec?.windFactor ?? 0) > 0 ? '💨 Wind pushes it' : ''].filter(Boolean);
  return tags.length ? `<div class="tags">${tags.map((t) => `<b>${t}</b>`).join('')}</div>` : '';
}

function card(p: Post): string {
  const chip = CHIP[p.category];
  const titleSize = p.title.length <= 12 ? 120 : p.title.length <= 20 ? 96 : 76;
  return page(
    `<style>${CARD_CSS}</style>
    <div class="sky">
      ${ground(150, 26)}
      <div class="chip" style="background:${chip.color}">${chip.label}</div>
      <div class="title"><div class="big" style="font-size:${titleSize}px">${p.title}</div></div>
      ${art(p)}
      <div class="text">${p.text}${tagsFor(p)}</div>
      <div class="foot"><div class="logo" style="font-size:64px;-webkit-text-stroke:4px #2b1b24;text-shadow:0 5px 0 #2b1b24">Tardi<span>Geddon</span></div><div class="url">Play free · tardigeddon.com</div></div>
    </div>`,
    W,
    H,
  );
}

// ── The CSV (Sociamonials' bulk upload columns, in their order) ──────────

const COLUMNS = [
  'Message', 'Link', 'ImageURL', 'VideoURL', 'Month(1-12)', 'Day(1-31)', 'Year', 'Hour(1-24)', 'Minute(0-59)', 'PinTitle',
  'Category', 'Watermark', 'HashtagGroup', 'VideoThumbnailURL', 'CTAGroup', 'FirstComment', 'Story(YorN)', 'PinterestBoard',
  'AltText', 'PostPreset', 'TeamNote', 'YouTubeTitle', 'YouTubeVisibility', 'YouTubeNotifySubscribers(YorN)',
  'YouTubeMadeForKids(YorN)', 'YouTubeSyntheticMedia(YorN)', 'TikTokVisibility', 'TikTokAllowComments(YorN)',
  'TikTokAllowDuet(YorN)', 'TikTokAllowStitch(YorN)', 'TikTokAIContent(YorN)', 'TikTokYourBrand(YorN)',
  'TikTokBrandedContent(YorN)', 'TikTokCarouselTitle',
] as const;

/** The Pinterest board for each category (docs/social/SCHEDULE.md §2: make them, spelt exactly so, before importing). */
const BOARD: Record<Category, string> = {
  Weapons: 'TardiGeddon Weapons',
  Tips: 'Game Tips and Tricks',
  'Tardigrade facts': 'Tardigrade Facts',
  'Worlds and modes': 'Game Worlds and Maps',
  Community: '', // questions aren't pinned
  Play: 'Free Browser Games',
  Videos: 'Free Browser Games',
};

const imageUrl = (p: Post) => `${SITE}/social/posts/${p.id}.jpg`;

function row(p: Post): Record<(typeof COLUMNS)[number], string> {
  const r = Object.fromEntries(COLUMNS.map((c) => [c, ''])) as Record<(typeof COLUMNS)[number], string>;
  r.Message = fullMessage(p);
  if (p.video) r.VideoURL = p.video.url;
  else r.ImageURL = imageUrl(p);
  if (p.date) {
    const [d, t] = p.date.split(' ');
    const [y, m, day] = d.split('-').map(Number);
    const [h, min] = t.split(':').map(Number);
    Object.assign(r, { 'Month(1-12)': String(m), 'Day(1-31)': String(day), Year: String(y), 'Hour(1-24)': String(h), 'Minute(0-59)': String(min) });
  }
  r.PinTitle = p.title;
  r.PinterestBoard = BOARD[p.category];
  r.Category = p.category;
  r.AltText = p.alt;
  r.TeamNote = `${p.id} (scripts/social/posts.ts)`;
  if (p.video) {
    Object.assign(r, {
      YouTubeTitle: p.video.youtubeTitle,
      YouTubeVisibility: 'Public',
      'YouTubeNotifySubscribers(YorN)': 'Y',
      'YouTubeMadeForKids(YorN)': 'N', // docs/social/YOUTUBE.md: the audience is everyone
      'YouTubeSyntheticMedia(YorN)': 'N', // real game footage
    });
  }
  Object.assign(r, {
    TikTokVisibility: 'Public',
    'TikTokAllowComments(YorN)': 'Y',
    'TikTokAllowDuet(YorN)': p.video ? 'Y' : 'N',
    'TikTokAllowStitch(YorN)': p.video ? 'Y' : 'N',
    'TikTokAIContent(YorN)': 'N',
    'TikTokYourBrand(YorN)': 'Y', // promoting our own game
    'TikTokBrandedContent(YorN)': 'N',
    TikTokCarouselTitle: p.video ? '' : p.title,
  });
  return r;
}

const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const csv = (posts: Post[]) => [COLUMNS.join(','), ...posts.map((p) => COLUMNS.map((c) => cell(row(p)[c])).join(','))].join('\r\n') + '\r\n';

// ── The preview page ─────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
function preview(posts: Post[]): string {
  const items = posts
    .map(
      (p) => `<article><img src="../../../site/public/social/posts/${p.id}.jpg" alt="${esc(p.alt)}" loading="lazy">
      <div><p class="meta"><b>${p.category}</b> · ${p.date ? `📅 ${p.date} (UK)` : 'queue'}${p.video ? ` · 🎬 video: ${esc(p.video.url)}` : ''} · <code>${p.id}</code></p>
      <pre>${esc(fullMessage(p))}</pre></div></article>`,
    )
    .join('\n');
  return `<!doctype html><meta charset="utf-8"><title>Social posts: batch ${batch}</title>
<style>body{font:16px system-ui,sans-serif;margin:24px;background:#f6efe2;color:#2b1b24}article{display:flex;gap:20px;margin:0 0 20px;background:#fff;padding:14px;border-radius:12px}img{width:216px;height:270px;border-radius:8px}pre{white-space:pre-wrap;font:inherit}.meta{margin:0 0 6px;color:#666}</style>
<h1>Batch ${batch}: ${posts.length} posts</h1>
<p>Queue posts by category: ${Object.entries(count(posts)).map(([c, n]) => `${c} ${n}`).join(' · ')}</p>
${items}`;
}

function count(posts: Post[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const p of posts) if (!p.date) c[p.category] = (c[p.category] ?? 0) + 1;
  return c;
}

// ── Run ──────────────────────────────────────────────────────────────────

const posts = POSTS.filter((p) => p.batch === batch).map(complete);
if (!posts.length) {
  console.error(`No posts in batch ${batch}.`);
  process.exit(1);
}
const problems = check(posts);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`Batch ${batch}: ${posts.length} posts.`, count(posts));
if (checkOnly) process.exit(0);

mkdirSync(cardDir, { recursive: true });
mkdirSync(queueDir, { recursive: true });
if (posts.some((p) => p.video?.url.endsWith('/social/teaser.mp4'))) {
  copyFileSync(join(root, 'store', 'social', 'shorts', 'teaser.mp4'), join(root, 'site', 'public', 'social', 'teaser.mp4'));
}

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
const tab = await browser.newPage({ viewport: { width: W, height: H } });
for (const p of posts) {
  await tab.setContent(card(p), { waitUntil: 'load' });
  await tab.evaluate(() => document.fonts.ready);
  await tab.screenshot({ path: join(cardDir, `${p.id}.jpg`), type: 'jpeg', quality: 82 });
  console.log(`  ${p.id}.jpg`);
}
await browser.close();

writeFileSync(join(queueDir, `batch-${batch}.csv`), csv(posts));
writeFileSync(join(queueDir, `batch-${batch}.html`), preview(posts));
console.log(`Wrote store/social/queue/batch-${batch}.csv and batch-${batch}.html`);
