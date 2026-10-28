// After the site is built: writes every page to its own HTML file with its
// own <head> (title, description, share tags, structured data), plus
// 404.html, sitemap.xml and robots.txt. Search engines and social apps read
// these without running any JavaScript; see docs/SEO.md.
//
// Cloudflare Pages serves /how-to-play from how-to-play.html, and 404.html
// for anything else (which also turns off its "every address is index.html"
// fallback, so each page must have a file here).

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist-site');
const ssrDir = join(root, 'dist-ssr');

// Just enough of a browser for the pages to render: nothing runs effects on
// the server, but a few things read the window as they start.
const mq = (query) => ({ matches: /reduce/.test(query), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
globalThis.window ??= globalThis;
Object.assign(globalThis, {
  matchMedia: mq,
  innerWidth: 1280,
  innerHeight: 800,
  addEventListener() {},
  removeEventListener() {},
});
globalThis.location ??= new URL('https://tardigeddon.com/');

const ssr = await import(pathToFileURL(join(ssrDir, 'entry-server.js')).href);
const { render, pageMeta, pageSchema, INDEXED_PATHS, LEGAL, NEWS, newsDay } = ssr;
const SITE = 'https://tardigeddon.com';

const template = readFileSync(join(out, 'index.html'), 'utf8');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const text = (html) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/** The questions and answers on a page of <details class="faq"> blocks. */
function faqOf(html) {
  const found = [];
  const re = /<details class="faq[^"]*"><summary>([\s\S]*?)<\/summary><div class="faq-answer">([\s\S]*?)<\/div><\/details>/g;
  for (let m; (m = re.exec(html)); ) found.push({ q: text(m[1]), a: text(m[2]) });
  return found;
}

function head(path, meta, schema) {
  const url = SITE + (path === '/' ? '/' : path);
  const lines = [
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}" />`,
    meta.noindex ? '<meta name="robots" content="noindex, follow" />' : '',
    path === '/404' ? '' : `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:title" content="${esc(meta.title)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(SITE + meta.image)}" />`,
    `<meta property="og:image:alt" content="${esc(meta.imageAlt)}" />`,
    `<meta name="twitter:title" content="${esc(meta.title)}" />`,
    `<meta name="twitter:description" content="${esc(meta.description)}" />`,
    `<meta name="twitter:image" content="${esc(SITE + meta.image)}" />`,
    `<link rel="alternate" type="application/rss+xml" title="TardiGeddon news" href="${SITE}/news.xml" />`,
    // Not run (it's data), so the Content-Security-Policy doesn't apply; "<" is
    // escaped so no text in it can close the tag.
    `<script type="application/ld+json" id="ld-json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>`,
  ];
  return lines.filter(Boolean).join('\n    ');
}

// The template's own per-page tags make way for each page's.
const base = template
  .replace(/\s*<title>[\s\S]*?<\/title>/, '')
  .replace(/\s*<meta name="(description|robots|twitter:title|twitter:description|twitter:image)"[^>]*>/g, '')
  .replace(/\s*<link rel="canonical"[^>]*>/, '')
  .replace(/\s*<meta property="og:(title|description|url|image|image:alt)"[^>]*>/g, '')
  .replace(/\s*<script type="application\/ld\+json"[\s\S]*?<\/script>/, '');
const VIEWPORT = /<meta name="viewport"[^>]*>/;
if (!base.includes('<div id="root"></div>') || !VIEWPORT.test(base)) throw new Error('prerender: dist-site/index.html has no viewport tag or empty #root');

function page(path, legalTitle) {
  const body = render(path);
  const meta = pageMeta(path, legalTitle);
  const schema = pageSchema(path, path === '/support' ? faqOf(body) : undefined);
  return base.replace(VIEWPORT, (tag) => `${tag}\n    ${head(path, meta, schema)}`).replace('<div id="root"></div>', `<div id="root">${body}</div>`);
}

function write(file, html) {
  mkdirSync(dirname(join(out, file)), { recursive: true });
  writeFileSync(join(out, file), html);
}

for (const path of INDEXED_PATHS) write(path === '/' ? 'index.html' : `${path.slice(1)}.html`, page(path));
for (const l of LEGAL) write(`${l.path.slice(1)}.html`, page(l.path, l.title));
write('404.html', page('/404'));

const today = new Date().toISOString().slice(0, 10);
write(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${INDEXED_PATHS.map((p) => `  <url><loc>${SITE}${p}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
  <url><loc>${SITE}/play/</loc><lastmod>${today}</lastmod></url>
</urlset>
`,
);
// The news (src/news/news.ts): every post in every language for the game and
// the apps, which fetch it so new posts show without an app update
// (src/news/feed.ts), and an RSS feed in English.
write('news.json', JSON.stringify({ v: 1, posts: NEWS }));
const KIND = { update: 'Update', coming: 'Coming soon', issue: 'Known problem' };
const rss = NEWS.map((p) => {
  const t = p.text.en;
  const label = p.kind === 'issue' && p.fixed ? 'Fixed' : KIND[p.kind];
  const body = [p.kind === 'coming' ? `Expected ${newsDay(p.date)}.` : '', ...t.body].filter(Boolean).join('\n');
  return `  <item>
    <title>${esc(`${label}: ${t.title}`)}</title>
    <link>${SITE}/news#${p.id}</link>
    <guid isPermaLink="false">${esc(p.id)}</guid>
    <pubDate>${new Date(`${p.date}T12:00:00Z`).toUTCString()}</pubDate>
    <description>${esc(body)}</description>
  </item>`;
});
write(
  'news.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>TardiGeddon news</title>
  <link>${SITE}/news</link>
  <description>Updates, what's coming and fixes for TardiGeddon.</description>
  <language>en-gb</language>
${rss.join('\n')}
</channel>
</rss>
`,
);
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);

rmSync(ssrDir, { recursive: true, force: true });
console.log(`prerender: ${INDEXED_PATHS.length} pages, ${LEGAL.length} legal pages, 404, sitemap.xml, robots.txt, news.json, news.xml`);
