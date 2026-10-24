// Pictures for TardiGeddon's social accounts (docs/social/): YouTube banner,
// avatar, watermark and thumbnails; Discord server icon, banners and emoji;
// Bluesky and Reddit banners.
// Same art as the website's share pictures (site/capture/share-images.ts):
// the mascot, the logo lettering and real screenshots from site/public/media.
//
//   npx tsx scripts/social-images.ts [file ...]   (e.g. bluesky-banner.png; all if none given)
//
// Writes store/social/, including a 25-second vertical teaser for YouTube
// Shorts made from the website's clips (needs ffmpeg on the PATH). Needs Playwright's Chromium
// (PW_CHROMIUM_PATH=/opt/pw-browsers/chromium in sandboxes).

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { mascotSvg } from '../src/ui/mascot';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const media = join(root, 'site', 'public', 'media');
const out = join(root, 'store', 'social');
const font = (file: string) => readFileSync(join(root, 'node_modules', '@fontsource', file)).toString('base64');
const pic = (file: string) => `data:image/webp;base64,${readFileSync(join(media, file)).toString('base64')}`;

const RED = 0xe04848;
const BLUE = 0x3a7be0;
const GREEN = 0x3cb34a;
const GOLD = 0xe0a020;

const CSS = `
@font-face { font-family: 'Luckiest Guy'; src: url(data:font/woff2;base64,${font('luckiest-guy/files/luckiest-guy-latin-400-normal.woff2')}) format('woff2'); }
@font-face { font-family: 'Nunito'; font-weight: 800; src: url(data:font/woff2;base64,${font('nunito/files/nunito-latin-800-normal.woff2')}) format('woff2'); }
* { box-sizing: border-box; }
html, body { margin: 0; }
body { font-family: 'Nunito', sans-serif; font-weight: 800; color: #2b1b24; }
.sky { position: absolute; inset: 0; overflow: hidden; background: linear-gradient(#7fd3f7, #d9f3ff 75%); }
.ground { position: absolute; left: 0; right: 0; bottom: 0; background: #9c6438; box-shadow: 0 -4px 0 #2b1b24; }
.logo { font-family: 'Luckiest Guy', sans-serif; color: #e04848; -webkit-text-stroke: 5px #2b1b24; paint-order: stroke fill; text-shadow: 0 8px 0 #2b1b24; line-height: 1; letter-spacing: 0.01em; white-space: nowrap; }
.logo span { color: #ffd84a; }
.big { font-family: 'Luckiest Guy', sans-serif; color: #ffd84a; -webkit-text-stroke: 5px #2b1b24; paint-order: stroke fill; text-shadow: 0 8px 0 #2b1b24; line-height: 1.02; }
.badges { display: flex; gap: 14px; }
.badges b { background: #fff8ec; border: 4px solid #2b1b24; border-radius: 999px; padding: 4px 20px; }
.badges b::before { content: '✓ '; color: #3cb34a; }
.shot { position: absolute; border: 8px solid #2b1b24; border-radius: 26px; box-shadow: 0 14px 0 #2b1b24; overflow: hidden; background: #2b1b24; }
.shot img { display: block; width: 100%; height: 100%; object-fit: cover; }
.mascot { position: absolute; }
.mascot svg { display: block; width: 100%; height: auto; }
.center { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
`;

const page = (body: string, w: number, h: number) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body style="width:${w}px;height:${h}px;position:relative">${body}</body></html>`;
const shot = (file: string, style: string) => `<div class="shot" style="${style}"><img src="${pic(file)}"></div>`;
const tardi = (color: number, hat: string, style: string, skin = 'classic') => `<div class="mascot" style="${style}">${mascotSvg(color, hat, skin)}</div>`;
const ground = (h: number, grass: number) => `<div class="ground" style="height:${h}px;border-top:${grass}px solid #5aa83a"></div>`;

/** Square picture of the mascot on the sky, for avatars and icons (safe inside a circle crop). */
const avatar = (size: number) =>
  page(
    `<div class="sky" style="background:radial-gradient(circle at 50% 40%, #d9f3ff, #7fd3f7 70%)">
      ${ground(size * 0.24, size * 0.035)}
      ${tardi(RED, 'beanie', `width:${size * 0.64}px;left:${size * 0.17}px;top:${size * 0.29}px`)}
    </div>`,
    size,
    size,
  );

/** Discord emoji: one tardi, transparent, filling the square. */
const emoji = (color: number, hat: string) =>
  page(`<div class="center" style="width:128px;height:128px">${tardi(color, hat, 'position:static;width:124px;margin-top:14px')}</div>`, 128, 128);

/** YouTube Shorts teaser: each website clip (1280×720) plays in a window at y 640–1248 of this frame. */
const SHORT = [
  { clip: 'clip-rope.mp4', caption: 'Swing in on a<br><span>Silk Rope</span>' },
  { clip: 'clip-tun.mp4', caption: 'Drop a<br><span>Concrete Tun</span>' },
  { clip: 'clip-victory.mp4', caption: 'Last tardi<br><span>standing wins</span>' },
];
const shortFrame = (caption: string) =>
  page(
    `<div class="sky" style="height:640px">
      ${tardi(RED, 'beanie', 'width:300px;left:390px;top:90px')}
      <div class="center" style="position:absolute;left:0;right:0;top:420px"><div class="logo" style="font-size:120px">Tardi<span>Geddon</span></div></div>
      <div style="position:absolute;left:0;right:0;bottom:0;height:8px;background:#2b1b24"></div>
    </div>
    <div class="sky" style="top:1248px;background:linear-gradient(#d9f3ff, #7fd3f7)">
      <div style="height:8px;background:#2b1b24"></div>
      <div class="big center" style="font-size:104px;margin-top:70px;color:#fff8ec">${caption.replace('<span>', '<span style="color:#ffd84a">')}</div>
      <div class="center" style="font-size:44px;margin-top:40px">Free in your browser · tardigeddon.com</div>
    </div>`,
    1080,
    1920,
  );

const IMAGES: { file: string; html: string; w: number; h: number; transparent?: boolean }[] = [
  // YouTube channel banner. Desktop shows only the middle 2560×423 strip; every
  // device shows the 1546×423 "safe area" in the very middle (x 507–2053, y 508–931).
  {
    file: 'youtube-banner.png',
    w: 2560,
    h: 1440,
    html: page(
      `<div class="sky">
        ${ground(250, 34)}
        ${shot('shot-crater.webp', 'left:40px;top:540px;width:520px;height:292px;transform:rotate(-4deg)')}
        ${shot('shot-realm-sky.webp', 'left:2000px;top:540px;width:520px;height:292px;transform:rotate(4deg)')}
        ${tardi(BLUE, 'tophat', 'width:230px;left:560px;top:640px')}
        ${tardi(GREEN, 'crown', 'width:230px;left:1770px;top:640px;transform:scaleX(-1)')}
        <div class="center" style="position:absolute;left:507px;top:508px;width:1546px;height:423px">
          <div class="logo" style="font-size:150px">Tardi<span>Geddon</span></div>
          <div style="font-size:48px;margin-top:22px">Tiny. Indestructible. Armed.</div>
          <div class="badges" style="font-size:34px;margin-top:22px"><b>Free</b><b>Browser &amp; phone</b><b>Online with friends</b></div>
        </div>
        <div style="position:absolute;left:0;right:0;bottom:70px;text-align:center;font-family:'Luckiest Guy';font-size:96px;color:#fff8ec;-webkit-text-stroke:4px #2b1b24;paint-order:stroke fill">Play free at tardigeddon.com</div>
      </div>`,
      2560,
      1440,
    ),
  },
  { file: 'youtube-avatar.png', w: 800, h: 800, html: avatar(800) },
  // Video watermark (Customisation → Branding): shown small in the corner of every video.
  {
    file: 'youtube-watermark.png',
    w: 150,
    h: 150,
    transparent: true,
    html: page(`<div class="center" style="width:150px;height:150px">${tardi(RED, 'beanie', 'position:static;width:144px;margin-top:20px')}</div>`, 150, 150),
  },
  // Thumbnails (1280×720): the trailer, and a template for gameplay videos.
  {
    file: 'youtube-thumb-trailer.png',
    w: 1280,
    h: 720,
    html: page(
      `<div class="sky">
        ${shot('shot-crater.webp', 'left:560px;top:120px;width:760px;height:428px;transform:rotate(4deg)')}
        ${ground(90, 18)}
        ${tardi(RED, 'beanie', 'width:250px;left:40px;top:450px')}
        <div style="position:absolute;left:44px;top:34px;width:640px">
          <div class="big" style="font-size:118px">Tardigrades</div>
          <div class="big" style="font-size:118px;color:#e04848">with bazookas</div>
        </div>
        <div class="badges" style="position:absolute;left:330px;top:530px;font-size:34px"><b>Free</b><b>No download</b></div>
      </div>`,
      1280,
      720,
    ),
  },
  {
    file: 'youtube-thumb-template.png',
    w: 1280,
    h: 720,
    html: page(
      `<div class="sky">
        ${shot('shot-realm-sky.webp', 'left:-20px;top:-20px;width:1320px;height:760px;border:0;border-radius:0;box-shadow:none')}
        <div style="position:absolute;inset:0;background:linear-gradient(90deg, rgba(43,27,36,0.55), rgba(43,27,36,0) 60%)"></div>
        ${tardi(GOLD, 'crown', 'width:340px;left:900px;top:330px;transform:scaleX(-1)')}
        <div style="position:absolute;left:50px;top:60px;width:820px">
          <div class="big" style="font-size:130px">Your title</div>
          <div class="big" style="font-size:130px;color:#fff8ec">goes here</div>
        </div>
        <div class="logo" style="position:absolute;left:50px;bottom:40px;font-size:64px;-webkit-text-stroke:4px #2b1b24;text-shadow:0 6px 0 #2b1b24">Tardi<span>Geddon</span></div>
      </div>`,
      1280,
      720,
    ),
  },
  // Discord server icon (shown round; at least 512×512).
  { file: 'discord-server-icon.png', w: 512, h: 512, html: avatar(512) },
  // Discord server banner (16:9, at least 960×540; needs Boost level 2).
  {
    file: 'discord-server-banner.png',
    w: 960,
    h: 540,
    html: page(
      `<div class="sky">
        ${shot('shot-crater.webp', 'left:520px;top:200px;width:520px;height:292px;transform:rotate(4deg)')}
        ${ground(70, 14)}
        ${tardi(RED, 'beanie', 'width:220px;left:150px;top:40px')}
        <div style="position:absolute;left:40px;top:220px;width:520px">
          <div class="logo" style="font-size:84px">Tardi<span>Geddon</span></div>
          <div style="font-size:30px;margin-top:14px">Official community</div>
        </div>
      </div>`,
      960,
      540,
    ),
  },
  // Discord invite background (16:9, 1920×1080; needs Boost level 1). The invite card covers the middle.
  {
    file: 'discord-invite-splash.png',
    w: 1920,
    h: 1080,
    html: page(
      `<div class="sky">
        ${ground(170, 30)}
        ${tardi(RED, 'beanie', 'width:330px;left:120px;top:670px')}
        ${tardi(BLUE, 'tophat', 'width:300px;left:1480px;top:693px;transform:scaleX(-1)')}
        ${tardi(GREEN, 'party', 'width:240px;left:1200px;top:737px')}
        ${tardi(GOLD, 'crown', 'width:240px;left:480px;top:737px;transform:scaleX(-1)')}
        <div class="center" style="position:absolute;left:0;right:0;top:60px">
          <div class="logo" style="font-size:150px">Tardi<span>Geddon</span></div>
        </div>
      </div>`,
      1920,
      1080,
    ),
  },
  // Discord profile banner for the developer account (680×240; Nitro only).
  {
    file: 'discord-profile-banner.png',
    w: 680,
    h: 240,
    html: page(
      `<div class="sky">
        ${ground(40, 10)}
        ${tardi(BLUE, 'hardhat', 'width:150px;left:480px;top:93px;transform:scaleX(-1)')}
        <div style="position:absolute;left:30px;top:70px">
          <div class="logo" style="font-size:58px;-webkit-text-stroke:4px #2b1b24;text-shadow:0 5px 0 #2b1b24">Tardi<span>Geddon</span></div>
          <div style="font-size:20px;margin-top:10px">Dev team · tardigeddon.com</div>
        </div>
      </div>`,
      680,
      240,
    ),
  },
  // Bluesky profile banner (3:1). The round avatar covers the bottom-left
  // corner on every screen, so that corner is only sky and ground.
  {
    file: 'bluesky-banner.png',
    w: 3000,
    h: 1000,
    html: page(
      `<div class="sky">
        ${ground(170, 30)}
        ${shot('shot-crater.webp', 'left:2130px;top:150px;width:760px;height:428px;transform:rotate(4deg)')}
        ${tardi(GREEN, 'crown', 'width:270px;left:2420px;top:630px;transform:scaleX(-1)')}
        ${tardi(BLUE, 'tophat', 'width:250px;left:1760px;top:645px')}
        <div class="center" style="position:absolute;left:600px;top:130px;width:1500px;height:560px">
          <div class="logo" style="font-size:190px;-webkit-text-stroke:7px #2b1b24;text-shadow:0 10px 0 #2b1b24">Tardi<span>Geddon</span></div>
          <div style="font-size:60px;margin-top:30px">Tiny. Indestructible. Armed.</div>
          <div class="badges" style="font-size:42px;margin-top:30px"><b>Free</b><b>No download</b><b>Online with friends</b></div>
        </div>
      </div>`,
      3000,
      1000,
    ),
  },
  // Reddit banner for r/TardiGeddon (1920×384). The phone app
  // crops the sides, so the logo stays in the middle 1000px.
  {
    file: 'reddit-banner.png',
    w: 1920,
    h: 384,
    html: page(
      `<div class="sky">
        ${ground(70, 16)}
        ${shot('shot-crater.webp', 'left:60px;top:60px;width:340px;height:191px;transform:rotate(-4deg)')}
        ${shot('shot-realm-sky.webp', 'left:1520px;top:60px;width:340px;height:191px;transform:rotate(4deg)')}
        ${tardi(BLUE, 'tophat', 'width:130px;left:420px;top:217px')}
        ${tardi(GREEN, 'crown', 'width:140px;left:1370px;top:212px;transform:scaleX(-1)')}
        <div class="center" style="position:absolute;left:460px;top:40px;width:1000px;height:250px">
          <div class="logo" style="font-size:112px;-webkit-text-stroke:5px #2b1b24;text-shadow:0 7px 0 #2b1b24">Tardi<span>Geddon</span></div>
          <div style="font-size:34px;margin-top:16px">Tiny. Indestructible. Armed.</div>
        </div>
      </div>`,
      1920,
      384,
    ),
  },
  // Reddit profile banner: the profile shows only about 3.2:1, so it gets its
  // own picture. The avatar sits over the bottom-left corner.
  {
    file: 'reddit-profile-banner.png',
    w: 1600,
    h: 500,
    html: page(
      `<div class="sky">
        ${ground(80, 18)}
        ${shot('shot-crater.webp', 'left:1170px;top:70px;width:370px;height:208px;transform:rotate(4deg)')}
        ${tardi(GREEN, 'crown', 'width:150px;left:1300px;top:313px;transform:scaleX(-1)')}
        ${tardi(BLUE, 'tophat', 'width:140px;left:990px;top:322px')}
        <div class="center" style="position:absolute;left:230px;top:60px;width:900px;height:280px">
          <div class="logo" style="font-size:118px;-webkit-text-stroke:5px #2b1b24;text-shadow:0 7px 0 #2b1b24">Tardi<span>Geddon</span></div>
          <div style="font-size:38px;margin-top:18px">Tiny. Indestructible. Armed.</div>
        </div>
      </div>`,
      1600,
      500,
    ),
  },
  { file: 'reddit-icon.png', w: 256, h: 256, html: avatar(256) },
  // Discord custom emoji (128×128, transparent).
  { file: 'emoji/tardi.png', w: 128, h: 128, transparent: true, html: emoji(RED, 'beanie') },
  { file: 'emoji/tardi_blue.png', w: 128, h: 128, transparent: true, html: emoji(BLUE, 'beanie') },
  { file: 'emoji/tardi_green.png', w: 128, h: 128, transparent: true, html: emoji(GREEN, 'beanie') },
  { file: 'emoji/tardi_gold.png', w: 128, h: 128, transparent: true, html: emoji(GOLD, 'beanie') },
  { file: 'emoji/tardi_king.png', w: 128, h: 128, transparent: true, html: emoji(GOLD, 'crown') },
  { file: 'emoji/tardi_party.png', w: 128, h: 128, transparent: true, html: emoji(RED, 'party') },
  { file: 'emoji/tardi_wizard.png', w: 128, h: 128, transparent: true, html: emoji(BLUE, 'wizard') },
  { file: 'emoji/tardi_pirate.png', w: 128, h: 128, transparent: true, html: emoji(RED, 'pirate') },
  { file: 'emoji/tardi_dev.png', w: 128, h: 128, transparent: true, html: emoji(BLUE, 'hardhat') },
  { file: 'emoji/tardi_ninja.png', w: 128, h: 128, transparent: true, html: emoji(GREEN, 'ninja') },
  ...SHORT.map((sh, i) => ({ file: `shorts/frame-${i}.png`, w: 1080, h: 1920, transparent: true, html: shortFrame(sh.caption) })),
];

mkdirSync(join(out, 'emoji'), { recursive: true });
mkdirSync(join(out, 'shorts'), { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
const only = process.argv.slice(2);
for (const img of IMAGES.filter((i) => !only.length || only.includes(i.file))) {
  const p = await browser.newPage({ viewport: { width: img.w, height: img.h } });
  await p.setContent(img.html);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: join(out, img.file), type: 'png', omitBackground: img.transparent });
  await p.close();
  console.log('wrote', img.file);
}
await browser.close();

// The Shorts teaser: each clip inside its frame, one after another, with a silent sound track.
if (only.length) process.exit(0);
const parts = SHORT.map((_, i) => `[${2 * i + 1}:v]scale=1080:608[c${i}];[${2 * i}:v][c${i}]overlay=0:640:shortest=1,fps=30,format=yuv420p[v${i}]`);
const concat = `${SHORT.map((_, i) => `[v${i}]`).join('')}concat=n=${SHORT.length}:v=1:a=0[v]`;
try {
  execFileSync('ffmpeg', [
    '-v', 'error', '-y',
    ...SHORT.flatMap((sh, i) => ['-loop', '1', '-framerate', '30', '-i', join(out, `shorts/frame-${i}.png`), '-i', join(media, sh.clip)]),
    '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
    '-filter_complex', `${parts.join(';')};${concat}`,
    '-map', '[v]', '-map', `${2 * SHORT.length}:a`, '-shortest',
    '-c:v', 'libx264', '-crf', '20', '-preset', 'slow', '-c:a', 'aac', '-movflags', '+faststart',
    join(out, 'shorts/teaser.mp4'),
  ]);
  console.log('wrote shorts/teaser.mp4');
} catch (e) {
  console.warn('skipped shorts/teaser.mp4 (needs ffmpeg):', (e as Error).message);
}
