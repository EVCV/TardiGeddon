// The legal pages: drafts in site/legal/*.md (see site/legal/README.md),
// rendered at /legal/<file name>. Loaded on demand, so they don't weigh
// down the home page.

export interface LegalPage {
  slug: string;
  /** Short name for the footer. */
  label: string;
}

/** Footer order. */
export const LEGAL_PAGES: LegalPage[] = [
  { slug: 'terms-of-service', label: 'Terms of Service' },
  { slug: 'privacy-policy', label: 'Privacy Policy' },
  { slug: 'cookie-policy', label: 'Cookies & Storage' },
  { slug: 'childrens-privacy', label: 'Children’s Privacy' },
  { slug: 'community-guidelines', label: 'Community Guidelines' },
  { slug: 'ai-policy', label: 'AI Policy' },
  { slug: 'accessibility-statement', label: 'Accessibility' },
  { slug: 'copyright-policy', label: 'Copyright' },
  { slug: 'third-party-licences', label: 'Third-Party Licences' },
  { slug: 'legal-notice', label: 'Legal Notice' },
];

const files = import.meta.glob<string>(['../legal/*.md', '!../legal/README.md'], { query: '?raw', import: 'default' });

export const hasLegal = (slug: string) => LEGAL_PAGES.some((p) => p.slug === slug) && `../legal/${slug}.md` in files;

/** The page's markdown, or null if there's no such page. */
export function loadLegal(slug: string): Promise<string> | null {
  return hasLegal(slug) ? files[`../legal/${slug}.md`]() : null;
}
