// Base URL of the public site: `SITE_URL` at build time,
// default https://salmonui.dev, never with a trailing slash. Canonical and
// Open Graph URLs, the sitemap, robots.txt and JSON-LD all derive from it.

export const SITE_URL: string = (process.env.SITE_URL?.trim() || 'https://salmonui.dev').replace(/\/+$/, '');

/** Absolute canonical URL of a site path: no trailing slash except the root. */
export function absoluteUrl(path: string): string {
  const clean = path === '/' || path === '' ? '/' : `/${path.replace(/^\/+|\/+$/g, '')}`;
  return `${SITE_URL}${clean}`;
}
