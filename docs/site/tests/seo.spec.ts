import { expect, test, type Page } from '@playwright/test';
import { loadDemos, loadDocs, sitePaths } from '../lib/catalog.mjs';

// SEO: per page type a unique title and description, an
// absolute canonical URL on SITE_URL in the no-trailing-slash form, Open
// Graph and Twitter card tags, JSON-LD that parses with the expected
// @types, exactly one h1 and `lang`; the sitemap, robots.txt, the Open
// Graph image and the noindex 404 page. Runs in every SITE_MODE.

const paths = sitePaths(new URL('..', import.meta.url).pathname.replace(/\/$/, ''));
const docs = loadDocs(paths.content);
const demos = loadDemos(paths.demos).filter((demo) => demo.category === 'data-grid');
// Computed like lib/site-url.ts, without importing it: the override test
// below imports it fresh with another SITE_URL.
const SITE_URL = (process.env.SITE_URL?.trim() || 'https://salmonui.dev').replace(/\/+$/, '');
const canonical = (path: string) => `${SITE_URL}${path === '/' ? '/' : path}`;
// Next.js prints the root's canonical and og:url as the bare origin
// (`https://salmonui.dev`), which is the same URL as `https://salmonui.dev/`;
// every other page must match the canonical form exactly.
const sameUrl = (actual: string | null) => (actual === null ? null : new URL(actual).href);

type PageCase = { name: string; path: string; ogType: 'website' | 'article'; jsonLd: string[] };

const doc = docs[0]!;
const demo = demos[0]!;
const cases: PageCase[] = [
  { name: 'landing', path: '/', ogType: 'website', jsonLd: ['WebSite', 'SoftwareSourceCode'] },
  { name: 'docs home', path: '/docs', ogType: 'article', jsonLd: ['WebSite'] },
  { name: 'data grid docs index', path: '/docs/data-grid', ogType: 'article', jsonLd: ['WebSite'] },
  { name: 'docs page', path: `/docs/data-grid/${doc.slug}`, ogType: 'article', jsonLd: ['WebSite', 'TechArticle', 'BreadcrumbList'] },
  { name: 'reference index', path: '/docs/reference', ogType: 'article', jsonLd: ['WebSite', 'TechArticle', 'BreadcrumbList'] },
  { name: 'reference entry', path: '/docs/reference/data-grid', ogType: 'article', jsonLd: ['WebSite', 'TechArticle', 'BreadcrumbList'] },
  { name: 'reference symbol', path: '/docs/reference/data-grid/DataGrid', ogType: 'article', jsonLd: ['WebSite', 'TechArticle', 'BreadcrumbList'] },
  { name: 'demos index', path: '/demos', ogType: 'article', jsonLd: ['WebSite'] },
  { name: 'Data Grid demos', path: '/demos/data-grid', ogType: 'article', jsonLd: ['WebSite', 'BreadcrumbList'] },
  { name: 'demo page', path: `/demos/data-grid/${demo.id}`, ogType: 'article', jsonLd: ['WebSite', 'BreadcrumbList'] },
];

const meta = (page: Page, attr: 'name' | 'property', key: string) => page.locator(`head meta[${attr}="${key}"]`).first().getAttribute('content');

async function jsonLdBlocks(page: Page): Promise<Record<string, unknown>[]> {
  const texts = await page.locator('script[type="application/ld+json"]').allTextContents();
  return texts.map((text) => JSON.parse(text) as Record<string, unknown>);
}

test('every page type has a unique title and description, canonical, social tags, JSON-LD and one h1', async ({ page }) => {
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  for (const item of cases) {
    const response = await page.goto(item.path);
    expect(response?.status(), `${item.name} status`).toBe(200);
    await expect(page.locator('html'), item.name).toHaveAttribute('lang', 'en');
    await expect(page.locator('h1'), `${item.name}: exactly one h1`).toHaveCount(1);

    const title = await page.title();
    const description = await meta(page, 'name', 'description');
    expect(title, `${item.name} title`).toMatch(item.name === 'landing' ? /^Salmon UI: .+/ : /.+ \| Salmon UI$/);
    expect(description, `${item.name} description`).toBeTruthy();
    expect(titles.has(title), `${item.name}: title "${title}" is unique`).toBe(false);
    expect(descriptions.has(description!), `${item.name}: description is unique`).toBe(false);
    titles.add(title);
    descriptions.add(description!);

    const links = page.locator('head link[rel="canonical"]');
    await expect(links, `${item.name}: one canonical`).toHaveCount(1);
    const href = await links.getAttribute('href');
    expect(sameUrl(href), `${item.name} canonical`).toBe(canonical(item.path));
    if (item.path !== '/') expect(href, `${item.name} canonical form`).toBe(canonical(item.path));

    expect(await meta(page, 'property', 'og:title')).toBe(title);
    expect(await meta(page, 'property', 'og:description')).toBe(description);
    expect(sameUrl(await meta(page, 'property', 'og:url'))).toBe(canonical(item.path));
    expect(await meta(page, 'property', 'og:type')).toBe(item.ogType);
    expect(await meta(page, 'property', 'og:site_name')).toBe('Salmon UI');
    expect(await meta(page, 'property', 'og:image')).toBe(`${SITE_URL}/og.png`);
    expect(await meta(page, 'property', 'og:image:alt')).toBe('Salmon UI: one React library, from a button to a million-row grid');
    expect(await meta(page, 'name', 'twitter:card')).toBe('summary_large_image');
    expect(await meta(page, 'name', 'twitter:title')).toBe(title);
    expect(await meta(page, 'name', 'twitter:description')).toBe(description);
    expect(await meta(page, 'name', 'twitter:image')).toBe(`${SITE_URL}/og.png`);
    if (process.env.SITE_INDEXABLE?.trim() !== '0') await expect(page.locator('head meta[name="robots"]'), item.name).toHaveCount(0);

    const blocks = await jsonLdBlocks(page);
    for (const block of blocks) expect(block['@context'], `${item.name} JSON-LD @context`).toBe('https://schema.org');
    expect(blocks.map((block) => block['@type']).sort(), `${item.name} JSON-LD types`).toEqual([...item.jsonLd].sort());
  }
});

test('docs page JSON-LD matches the page: headline, canonical url, dateModified and breadcrumbs', async ({ page }) => {
  await page.goto(`/docs/data-grid/${doc.slug}`);
  const blocks = await jsonLdBlocks(page);
  const article = blocks.find((block) => block['@type'] === 'TechArticle')!;
  expect(article.headline).toBe(doc.title);
  expect(article.description).toBe(doc.description);
  expect(article.url).toBe(canonical(`/docs/data-grid/${doc.slug}`));
  expect(Number.isNaN(Date.parse(String(article.dateModified)))).toBe(false);

  const crumbs = blocks.find((block) => block['@type'] === 'BreadcrumbList')!.itemListElement as { position: number; name: string; item: string }[];
  const visible = await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('listitem').allTextContents();
  expect(crumbs.map((crumb) => crumb.name)).toEqual(visible);
  expect(crumbs.map((crumb) => crumb.position)).toEqual(visible.map((_, index) => index + 1));
  expect(crumbs.at(-1)!.item).toBe(canonical(`/docs/data-grid/${doc.slug}`));

  // dateModified is the sitemap lastmod of the same page.
  const sitemap = await (await page.request.get('/sitemap.xml')).text();
  const entry = new RegExp(`<loc>${canonical(`/docs/data-grid/${doc.slug}`).replace(/[.?]/g, '\\$&')}</loc>\\s*<lastmod>([^<]+)</lastmod>`).exec(sitemap);
  expect(entry?.[1]).toBe(article.dateModified);
});

test('the site-wide WebSite block carries the docs SearchAction', async ({ page }) => {
  await page.goto('/');
  const website = (await jsonLdBlocks(page)).find((block) => block['@type'] === 'WebSite')!;
  expect(website.url).toBe(`${SITE_URL}/`);
  const action = website.potentialAction as { '@type': string; target: { urlTemplate: string }; 'query-input': string };
  expect(action['@type']).toBe('SearchAction');
  expect(action.target.urlTemplate).toBe(`${SITE_URL}/docs?q={search_term_string}`);
  expect(action['query-input']).toBe('required name=search_term_string');
});

test('the 404 page is noindex with links to the docs', async ({ page }) => {
  const response = await page.goto('/no-such-page-for-seo');
  expect(response?.status()).toBe(404);
  await expect(page.locator('head meta[name="robots"][content="noindex"]').first()).toBeAttached();
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveText('Page not found');
  await expect(page.locator('main').getByRole('link', { name: 'Browse the documentation' })).toHaveAttribute('href', '/docs');
});

test('sitemap lists every indexable route in canonical form with a lastmod', async ({ request }) => {
  const response = await request.get('/sitemap.xml');
  expect(response.status()).toBe(200);
  const xml = await response.text();
  const urls = [...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)].map((match) => ({ loc: match[1]!, lastmod: match[2]! }));
  const locs = urls.map((url) => url.loc);
  expect(new Set(locs).size).toBe(locs.length);
  for (const { loc, lastmod } of urls) {
    expect(loc.startsWith(`${SITE_URL}/`), loc).toBe(true);
    if (loc !== `${SITE_URL}/`) expect(loc.endsWith('/'), `${loc}: no trailing slash`).toBe(false);
    expect(Number.isNaN(Date.parse(lastmod)), `${loc} lastmod`).toBe(false);
  }
  const expected = [
    '/',
    '/docs',
    '/docs/data-grid',
    '/docs/reference',
    '/demos',
    '/demos/data-grid',
    ...docs.map((d) => `/docs/data-grid/${d.slug}`),
    ...demos.map((d) => `/demos/data-grid/${d.id}`),
  ].map(canonical);
  for (const url of expected) expect(locs, url).toContain(url);
  expect(locs.some((loc) => /404|not-found/.test(loc))).toBe(false);
  // Reference entries and symbol pages (generated/api.json) are listed under their package.
  for (const loc of locs.filter((l) => l.startsWith(`${SITE_URL}/docs/reference/`))) {
    expect(loc).toMatch(/\/docs\/reference\/[a-z-]+(?:\/[A-Za-z0-9_-]+){0,2}$/);
    expect(loc).not.toMatch(/\/index$/);
  }
});

test('robots.txt allows crawling and points to the sitemap', async ({ request }) => {
  const response = await request.get('/robots.txt');
  expect(response.status()).toBe(200);
  const text = await response.text();
  if (process.env.SITE_INDEXABLE?.trim() === '0') {
    expect(text).toMatch(/Disallow: \/\s*$/m);
  } else {
    expect(text).toMatch(/^User-Agent: \*$/m);
    expect(text).toMatch(/^Allow: \/$/m);
    expect(text).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
  }
});

test('the default Open Graph image is a 1200 x 630 PNG', async ({ request }) => {
  const response = await request.get('/og.png');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('image/png');
  const body = await response.body();
  expect(body.subarray(1, 4).toString('latin1')).toBe('PNG');
  expect(body.readUInt32BE(16)).toBe(1200);
  expect(body.readUInt32BE(20)).toBe(630);
});

test('SITE_URL and SITE_INDEXABLE overrides change canonicals, social URLs, JSON-LD and robots', async () => {
  // The SEO modules read the flags at import time; this spec never imports
  // them statically, so this is their first (and only) load in the worker.
  const saved = { url: process.env.SITE_URL, indexable: process.env.SITE_INDEXABLE };
  process.env.SITE_URL = 'https://preview.example.com/';
  process.env.SITE_INDEXABLE = '0';
  try {
    const { pageMetadata } = await import('../lib/seo');
    const { techArticleJsonLd, websiteJsonLd } = await import('../lib/structured-data');
    const { default: robots } = await import('../app/robots');
    const metadata = pageMetadata({ title: 'Sorting', description: 'd', path: '/docs/data-grid/sorting/', kind: 'docs' });
    expect(metadata.alternates?.canonical).toBe('https://preview.example.com/docs/data-grid/sorting');
    expect(metadata.openGraph?.url).toBe('https://preview.example.com/docs/data-grid/sorting');
    expect(JSON.stringify(metadata.openGraph?.images)).toContain('https://preview.example.com/og.png');
    expect(metadata.robots).toEqual({ index: false });
    expect(pageMetadata({ title: 't', description: 'd', path: '/', kind: 'landing' }).alternates?.canonical).toBe('https://preview.example.com/');
    expect(techArticleJsonLd({ headline: 'h', description: 'd', path: '/docs/x', dateModified: '2026-01-01' }).url).toBe(
      'https://preview.example.com/docs/x',
    );
    expect(JSON.stringify(websiteJsonLd())).toContain('https://preview.example.com/docs?q={search_term_string}');
    expect(robots()).toEqual({ rules: { userAgent: '*', disallow: '/' } });
  } finally {
    if (saved.url === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = saved.url;
    if (saved.indexable === undefined) delete process.env.SITE_INDEXABLE;
    else process.env.SITE_INDEXABLE = saved.indexable;
  }
});

test('the export serves the public/_headers security and cache headers', async ({ page }) => {
  test.skip(process.env.SITE_MODE !== 'export', 'public/_headers is applied by the static server (site:serve) only');
  const scripts: string[] = [];
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.startsWith('/_next/static/')) scripts.push(response.headers()['cache-control'] ?? '');
  });
  const response = await page.goto('/docs');
  const headers = response!.headers();
  expect(headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  // localhost is not a pages.dev host, so the preview noindex rule does not apply.
  expect(headers['x-robots-tag']).toBeUndefined();
  await page.waitForLoadState('networkidle');
  expect(scripts.length).toBeGreaterThan(0);
  for (const value of scripts) expect(value).toBe('public, max-age=31536000, immutable');
});
