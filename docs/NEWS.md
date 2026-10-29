# News

What players see under **📰 News**: what changed in each update (release
notes), what's coming, and known problems being fixed. The same posts show
in three places:

| Where | What |
|---|---|
| The game: **📰 News** in the lobby (a tile in the bottom menu on phones) | Each player's own language. A red dot shows until they've seen the newest post |
| tardigeddon.com/news | English, like the rest of the website. Linked in the site's menu |
| tardigeddon.com/news.xml | An RSS feed (English), for Discord bots and feed readers |

| Part | File |
|---|---|
| The posts | `src/news/news.ts` |
| Which section each post goes in, and the order | `src/news/sections.ts` |
| The game: built-in posts, fetching the website's newest, the dot | `src/news/feed.ts` |
| The game's News page | `src/ui/news.ts` |
| The website's page | `site/src/pages/News.tsx` |
| `/news.json` and `/news.xml` | written by `site/prerender.mjs` when the website builds |
| Tests | `tests/news.test.ts`, `e2e/news.spec.ts` |

## How new posts reach players

The website build writes every post to `/news.json`. The game ships with
the posts as they were when it was built, then fetches `/news.json` when the
menu opens and shows that list instead. So a new post goes out with the next
website deploy (merging to `main`), in the browser **and in the phone apps**,
with no app update. Offline, the game shows the posts it was built with.

## Posting

Add the post **at the top** of `NEWS` in `src/news/news.ts` (the top one is
"the newest": it decides when the red dot shows), then merge.

```ts
{
  id: '2026-11-05-fix-sound',  // unique, never changed: lowercase, digits and dashes
  date: '2026-11-05',          // released or posted; for "coming", when it's expected
  kind: 'issue',               // 'update' (release notes), 'coming', or 'issue' (a known problem)
  // fixed: '2026-11-09',      // an issue: add the day it was fixed (it then shows ✅ Fixed)
  text: {
    en: { title: 'Sound cuts out on some Android tablets', body: ['We know, and a fix is on its way.'] },
    es: { … }, 'pt-BR': { … }, de: { … }, fr: { … }, ja: { … },
  },
},
```

- **Every post in all six languages.** `tests/news.test.ts` fails until each
  language has the post, with the same number of lines and bullet points
  as the English. Ask Claude to translate: give it the English.
- **Plain text only.** A line starting `- ` is a bullet point; anything
  else is a paragraph. No HTML or Markdown: it would show as typed.
- **Known problem fixed?** Add `fixed: 'YYYY-MM-DD'` to its post. It stays
  in "Being fixed", marked ✅ Fixed, below the problems still open. Mention
  the fix in the next update's release notes too.
- **Something "coming" has arrived?** Delete its post (or change it to an
  `update`, with the release date), so "Coming soon" stays true.
- **Use the game's own names** for things (weapons, modes, packs), as the
  translations in `src/i18n/locales/` have them.
- **Never promise dates you aren't sure of.** "Coming soon" is read as a
  promise.

Don't post about prices, refunds or anything legal here: those belong in
the Terms and the legal pages.
