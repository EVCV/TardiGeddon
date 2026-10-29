// Which news posts go in which section, and in what order: shared by the
// game's News page (src/ui/news.ts) and the website's (site/src/pages/News.tsx).

import type { NewsPost } from './news';

/** new: release notes; coming: on its way; fixing: known problems (still open, then fixed). */
export type NewsSection = 'new' | 'coming' | 'fixing';

/** The posts in a section: release notes newest first, what's coming soonest first, problems still open before fixed ones. */
export function postsIn(section: NewsSection, posts: NewsPost[]): NewsPost[] {
  if (section === 'new') return posts.filter((p) => p.kind === 'update').sort((a, b) => b.date.localeCompare(a.date));
  if (section === 'coming') return posts.filter((p) => p.kind === 'coming').sort((a, b) => a.date.localeCompare(b.date));
  return posts.filter((p) => p.kind === 'issue').sort((a, b) => Number(!!a.fixed) - Number(!!b.fixed) || b.date.localeCompare(a.date));
}
