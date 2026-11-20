// The Launch Giveaway's three vertical videos (batch 3 in scripts/social/posts.ts):
// the kick-off, the Champion's Arena and Fanfare spotlight, and the closing week.
// 1080×1920, 20 to 30 seconds, captions burned in, made only from the game's own
// footage (site/public/media/clip-*.mp4) and the prize pictures, with a silent
// sound track (the game's music is made live in the browser, so it can't be
// copied in simply; platforms' own licensed sounds can be added when posting).
//
// Called by scripts/social-posts.ts when it draws a batch; each video is written
// to site/public/social/<post id>.mp4 (served at tardigeddon.com/social/). Needs
// ffmpeg on the PATH and Playwright's Chromium, like the Shorts teaser in
// scripts/social-images.ts, whose layout this follows: a clip plays in a window
// at y 640 to 1248, with the logo above it and a caption below.
//
// Rules for the words (docs/social/README.md and the Official Rules): plain
// dates, no hurry or countdown words, never "share or tag to enter", free to
// enter, ages 13+, rules at the link.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser } from 'playwright';
import { BLUE, GOLD, GREEN, LOOK_CSS, RED, ground, lookPanel, media, page, publicPic, root, tardi } from '../social-art';

const W = 1080;
const H = 1920;
const outDir = join(root, 'site', 'public', 'social');

interface Scene {
  /** Seconds on screen. */
  dur: number;
  /** The full 1080×1920 frame (a clip plays over its middle window). */
  html: string;
  /** Game footage to play in the window, starting `ss` seconds in. */
  clip?: { file: string; ss?: number };
}

const CSS = `${LOOK_CSS}
.vlogo { position:absolute; left:0; right:0; display:flex; justify-content:center; }
.panel { position:absolute; left:70px; right:70px; background:#fff8ec; border:7px solid #2b1b24; border-radius:36px; box-shadow:0 12px 0 #2b1b24; padding:30px 36px; text-align:center; }
.cap { position:absolute; left:30px; right:30px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; }
.cap .big { font-size:100px; }
.cap .big span { color:#fff8ec; }
.clipcap .big { color:#fff8ec; }
.clipcap .big span { color:#ffd84a; }
.sub { font-size:46px; line-height:1.2; margin-top:26px; }
.url { position:absolute; left:0; right:0; text-align:center; font-family:'Luckiest Guy', sans-serif; font-size:60px; color:#fff8ec; -webkit-text-stroke:4px #2b1b24; paint-order:stroke fill; text-shadow:0 5px 0 #2b1b24; }
`;
const frame = (body: string) => page(`<style>${CSS}</style>${body}`, W, H);
const logo = (top: number, size: number) => `<div class="vlogo" style="top:${top}px"><div class="logo" style="font-size:${size}px">Tardi<span>Geddon</span></div></div>`;

/** Game footage in the middle, the logo and a crowned tardi above, a caption below (the teaser's layout). */
function clipScene(caption: string, sub: string, clip: Scene['clip'], dur: number): Scene {
  return {
    dur,
    clip,
    html: frame(`
      <div class="sky" style="height:640px">
        ${tardi(GOLD, 'champion', 'width:300px;left:390px;top:80px')}
        <div class="vlogo" style="top:420px"><div class="logo" style="font-size:120px">Tardi<span>Geddon</span></div></div>
      </div>
      <div style="position:absolute;left:0;right:0;top:640px;height:608px;background:#2b1b24"></div>
      <div class="sky" style="top:1248px;background:linear-gradient(#d9f3ff, #7fd3f7)">
        <div style="height:8px;background:#2b1b24"></div>
        <div class="cap clipcap" style="top:60px;bottom:0"><div class="big">${caption}</div><div class="sub">${sub}</div></div>
      </div>`),
  };
}

/** A title card: the headline over a line of words, with tardis on the grass and the link. */
function titleScene(headline: string, sub: string, tardis: [number, string][], dur: number): Scene {
  const w = 330;
  return {
    dur,
    html: frame(`
      <div class="sky">
        ${ground(330, 30)}
        ${logo(110, 100)}
        <div class="cap" style="top:300px;height:520px"><div class="big" style="font-size:150px">${headline}</div></div>
        <div class="panel" style="top:860px"><div style="font-size:58px;line-height:1.2">${sub}</div></div>
        ${tardis.map(([c, h], i) => tardi(c, h, `width:${w}px;left:${(W * (i + 1)) / (tardis.length + 1) - w / 2}px;top:1350px${i % 2 ? ';transform:scaleX(-1)' : ''}`)).join('')}
        <div class="url" style="bottom:110px">tardigeddon.com/giveaway</div>
      </div>`),
  };
}

/** A look (or a prize picture) in the middle, a headline above and a line of words below. */
function showScene(headline: string, middle: string, sub: string, dur: number): Scene {
  return {
    dur,
    html: frame(`
      <div class="sky">
        ${ground(200, 30)}
        ${logo(90, 80)}
        <div class="cap" style="top:210px;height:240px"><div class="big" style="font-size:112px">${headline}</div></div>
        ${middle}
        ${sub ? `<div class="panel" style="top:1420px"><div style="font-size:50px;line-height:1.2">${sub}</div></div>` : ''}
        <div class="url" style="bottom:50px;font-size:54px">tardigeddon.com/giveaway</div>
      </div>`),
  };
}

const prizePicture = (file: string) => `<div class="shot" style="left:110px;top:520px;width:860px;height:860px;transform:rotate(-1deg)"><img src="${publicPic(`/media/giveaway/${file}`)}"></div>`;
const lookBox = (ref: string, color: number) => `<div style="position:absolute;left:90px;right:90px;top:480px;height:880px;display:flex;justify-content:center;align-items:center">${lookPanel(ref, color, 'flex:none;width:900px')}</div>`;

/** Three numbered steps. */
function stepsScene(dur: number): Scene {
  const steps = ['Go to the entry page', 'Fill in the form', 'Confirm with the email we send'];
  return showScene(
    'How to enter',
    `<div style="position:absolute;left:70px;right:70px;top:480px;display:flex;flex-direction:column;gap:34px">${steps
      .map(
        (s, i) => `<div style="display:flex;align-items:center;gap:30px;background:#fff8ec;border:7px solid #2b1b24;border-radius:36px;box-shadow:0 12px 0 #2b1b24;padding:30px 36px">
          <div class="big center" style="flex:none;width:130px;height:130px;border-radius:50%;background:#e04848;border:7px solid #2b1b24;font-size:84px;color:#fff8ec;-webkit-text-stroke:0;text-shadow:none">${i + 1}</div>
          <div style="font-size:56px;line-height:1.15;text-align:left">${s}</div></div>`,
      )
      .join('')}</div>`,
    'Then add bonus entries if you like.',
    dur,
  );
}

/** The closing card of every video. */
function endScene(dur: number): Scene {
  const w = 300;
  const row: [number, string][] = [[GOLD, 'champion'], [BLUE, 'launchwinner'], [GREEN, 'crown']];
  return {
    dur,
    html: frame(`
      <div class="sky">
        ${ground(330, 30)}
        ${logo(110, 100)}
        <div class="cap" style="top:290px;height:300px"><div class="big" style="font-size:170px">Enter <span>free</span></div></div>
        <div class="panel" style="top:640px"><div class="big" style="font-size:62px;color:#e04848">tardigeddon.com/giveaway</div><div style="font-size:52px;line-height:1.25;margin-top:18px">Ages 13+<br>Rules at the link</div></div>
        ${row.map(([c, h], i) => tardi(c, h, `width:${w}px;left:${(W * (i + 1)) / 4 - w / 2}px;top:1380px${i % 2 ? ';transform:scaleX(-1)' : ''}`)).join('')}
      </div>`),
  };
}

const GOLD_BLUE: [number, string][] = [[GOLD, 'champion'], [BLUE, 'launchwinner'], [RED, 'crown']];

/** The videos, by post id. */
const VIDEOS: Record<string, Scene[]> = {
  'giveaway-kickoff': [
    titleScene('The Launch<br>Giveaway', 'Open now. Free to enter.', GOLD_BLUE, 3.5),
    clipScene('26 prizes,<br><span>all cosmetic looks</span>', 'They never help you win', { file: 'clip-rope.mp4' }, 4.3),
    showScene('1 grand prize', prizePicture('prize-grand.jpg'), '', 3),
    showScene('5 second prizes', prizePicture('prize-second.jpg'), '', 3),
    showScene('20 third prizes', prizePicture('prize-third.jpg'), '', 3),
    clipScene('Free to enter<br><span>Ages 13+</span>', 'Worldwide where allowed', { file: 'clip-victory.mp4', ss: 0 }, 6),
    endScene(3.5),
  ],
  'giveaway-champion-arena': [
    showScene('Champion’s Arena', lookBox('arena:champion', GOLD), 'A sunset arena with bunting and fireworks', 4),
    showScene('Champion’s Fanfare', lookBox('music:champion', GOLD), 'A brassy march to play it to', 4),
    clipScene('The Champion set<br><span>Grand and Second</span>', 'Free to enter · Ages 13+', { file: 'clip-victory.mp4' }, 7.3),
    clipScene('Second prize also<br><span>gets every bundle</span>', 'Cosmetic looks only', { file: 'clip-tun.mp4', ss: 0 }, 5),
    endScene(3.5),
  ],
  'giveaway-closing-week': [
    titleScene('Entries close<br>31 January', 'At 23:59 UK time.<br>Free to enter.', GOLD_BLUE, 3.5),
    clipScene('26 prizes,<br><span>all cosmetic looks</span>', 'Looks only, never power', { file: 'clip-tun.mp4', ss: 0 }, 6),
    stepsScene(4.5),
    clipScene('Free to enter<br><span>Ages 13+</span>', 'Rules at the link', { file: 'clip-rope.mp4' }, 4.3),
    endScene(3.5),
  ],
};

/** Draw each listed video's frames, then join them with ffmpeg into site/public/social/<id>.mp4. */
export async function buildGiveawayVideos(browser: Browser, ids: string[]): Promise<void> {
  if (!ids.length) return;
  mkdirSync(outDir, { recursive: true });
  const tmp = mkdtempSync(join(tmpdir(), 'tardi-giveaway-'));
  try {
    const tab = await browser.newPage({ viewport: { width: W, height: H } });
    for (const id of ids) {
      const scenes = VIDEOS[id];
      if (!scenes) throw new Error(`${id}: no video recipe in scripts/social/giveaway-videos.ts`);
      // One short file per scene (each ends at its own length), then the scenes joined and a silent sound track added.
      const list: string[] = [];
      for (const [i, sc] of scenes.entries()) {
        await tab.setContent(sc.html, { waitUntil: 'load' });
        await tab.evaluate(() => document.fonts.ready);
        const png = join(tmp, `${id}-${i}.png`);
        const seg = join(tmp, `${id}-${i}.mp4`);
        await tab.screenshot({ path: png, type: 'png' });
        const encode = ['-c:v', 'libx264', '-crf', '23', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-r', '30', '-t', String(sc.dur), seg];
        const args = sc.clip
          ? [
              '-loop', '1', '-framerate', '30', '-i', png,
              '-ss', String(sc.clip.ss ?? 0), '-i', join(media, sc.clip.file),
              '-filter_complex', '[1:v]scale=1080:608,setsar=1[c];[0:v][c]overlay=0:640:shortest=1,setsar=1[v]',
              '-map', '[v]',
            ]
          : ['-loop', '1', '-framerate', '30', '-i', png, '-vf', 'setsar=1'];
        execFileSync('ffmpeg', ['-v', 'error', '-y', ...args, ...encode], { stdio: 'inherit' });
        list.push(`file '${seg.replace(/\\/g, '/')}'`);
      }
      const listFile = join(tmp, `${id}.txt`);
      writeFileSync(listFile, list.join('\n'));
      const total = scenes.reduce((s, sc) => s + sc.dur, 0);
      execFileSync(
        'ffmpeg',
        [
          '-v', 'error', '-y',
          '-f', 'concat', '-safe', '0', '-i', listFile,
          '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
          '-map', '0:v', '-map', '1:a', '-t', String(total),
          '-c:v', 'copy', '-c:a', 'aac', '-movflags', '+faststart',
          join(outDir, `${id}.mp4`),
        ],
        { stdio: 'inherit' },
      );
      console.log(`  ${id}.mp4 (${scenes.reduce((s, sc) => s + sc.dur, 0).toFixed(1)} s)`);
    }
    await tab.close();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
