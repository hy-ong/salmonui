import { expect, test } from '@playwright/test';
import { VENDOR_PATTERN } from '../../../tooling/checks/planning-tokens.mjs';
import { loadAllDocs, loadDocs, sitePaths } from '../lib/catalog.mjs';

// AI-readable docs: /llms.txt structure, the
// Markdown version of a docs page (content and Content-Type), the alternate
// link and "View as Markdown" link on the HTML page, /llms-full.txt holding
// every docs title of every category, and the raw api.json. Runs in every SITE_MODE.

const paths = sitePaths(new URL('..', import.meta.url).pathname.replace(/\/$/, ''));
const docs = loadDocs(paths.content);
const allDocs = loadAllDocs(paths.content);
// Computed like lib/site-url.ts (see seo.spec.ts).
const SITE_URL = (process.env.SITE_URL?.trim() || 'https://salmonui.dev').replace(/\/+$/, '');
const sitePath = (url: string) => url.slice(SITE_URL.length) || '/';
const linksOf = (markdown: string) => [...markdown.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]!);
/** Markdown prose without fenced code. */
const prose = (markdown: string) => markdown.replace(/^(`{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, '');

const doc = docs.find((candidate) => candidate.demos.length > 0) ?? docs[0]!;
const docPath = `/docs/data-grid/${doc.slug}`;

test('llms.txt follows the llms.txt convention and links every docs page', async ({ request }) => {
  const response = await request.get('/llms.txt');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toMatch(/^text\/plain(; ?charset=utf-8)?/i);
  const text = await response.text();
  expect(text).toMatch(/^# Salmon UI\n\n> \S/);
  const headings = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  expect(headings[0]).toBe('Docs');
  for (const heading of ['Demos', 'API reference']) expect(headings).toContain(heading);
  expect(text).not.toMatch(new RegExp(VENDOR_PATTERN.source, 'i'));
  for (const category of new Set(docs.map((d) => d.category))) expect(headings).toContain(`Data Grid: ${category}`);
  const links = linksOf(text);
  for (const link of links) expect(link.startsWith(`${SITE_URL}/`), link).toBe(true);
  for (const page of docs) expect(links).toContain(`${SITE_URL}/docs/data-grid/${page.slug}.md`);
  expect(links).toContain(`${SITE_URL}/llms-full.txt`);
  expect(links).toContain(`${SITE_URL}/docs/reference/api.json`);
  // Every Markdown link of llms.txt resolves on this server.
  for (const link of links.filter((l) => l.endsWith('.md'))) {
    expect((await request.get(sitePath(link))).status(), link).toBe(200);
  }
});

test('a docs page has a clean Markdown version at its URL plus .md', async ({ request }) => {
  const response = await request.get(`${docPath}.md`);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('text/markdown; charset=utf-8');
  const markdown = await response.text();
  expect(markdown.startsWith(`# ${doc.title}\n\n> `)).toBe(true);
  expect(markdown).toContain(`Canonical: ${SITE_URL}${docPath}`);
  expect(markdown).not.toMatch(/^---\n/);
  expect(prose(markdown)).not.toContain('<!--');
  expect(markdown).toMatch(new RegExp(`^Live demo: ${SITE_URL.replace(/[.]/g, '\\.')}/demos/\\S+$`, 'm'));
  expect(markdown).toMatch(/^`{3,}tsx$/m);
  for (const link of linksOf(prose(markdown))) expect(link, link).toMatch(/^(https?:|mailto:)/);
  // The HTML page is still HTML.
  expect((await request.get(docPath)).headers()['content-type']).toMatch(/^text\/html/);
});

test('docs pages announce their Markdown version', async ({ page, request }) => {
  for (const path of [docPath, '/docs', '/docs/data-grid', '/docs/reference', '/docs/reference/data-grid/DataGrid']) {
    await page.goto(path);
    await expect(page.locator('link[rel="alternate"][type="text/markdown"]')).toHaveAttribute('href', `${SITE_URL}${path}.md`);
    const view = page.getByRole('link', { name: 'View as Markdown' });
    await expect(view).toHaveAttribute('href', `${path}.md`);
  }
  const entry = await request.get('/docs/reference.md');
  expect(entry.status()).toBe(200);
  const entryLink = linksOf(await entry.text()).find((link) => /\/docs\/reference\/[^/]+\/[^/]+\.md$/.test(link));
  expect(entryLink).toBeDefined();
  const entryMarkdown = await request.get(sitePath(entryLink!));
  expect(entryMarkdown.status()).toBe(200);
  expect(await entryMarkdown.text()).toMatch(/^```ts$/m);

  // The aggregate entry links the entries it re-exports instead of repeating them.
  const aggregate = await request.get('/docs/reference/data.md');
  expect(aggregate.status()).toBe(200);
  const aggregateText = await aggregate.text();
  expect(aggregateText).toMatch(/^## Re-exported entry points$/m);
  expect(aggregateText).toContain(`](${SITE_URL}/docs/reference/data/json.md): `);
  expect(aggregateText).toContain('`JsonDataSource`');
  expect(aggregateText).not.toMatch(/^### JsonDataSource$/m);

  // A symbol page's Markdown: the one symbol, its import line and a link back to the entry.
  const symbol = await request.get('/docs/reference/data-grid/DataGrid.md');
  expect(symbol.status()).toBe(200);
  const symbolText = await symbol.text();
  expect(symbolText).toMatch(/^# DataGrid \(@salmonui\/data-grid\)$/m);
  expect(symbolText).toContain(`Canonical: ${SITE_URL}/docs/reference/data-grid/DataGrid\n`);
  expect(symbolText).toContain("import { DataGrid } from '@salmonui/data-grid';");
  expect(symbolText).toContain(`${SITE_URL}/docs/reference/data-grid/DataGridProps`);
});

test('llms-full.txt holds every docs page of every category', async ({ request }) => {
  const response = await request.get('/llms-full.txt');
  expect(response.status()).toBe(200);
  const text = await response.text();
  expect(new Set(allDocs.map((page) => page.section)).size).toBeGreaterThan(1);
  for (const page of allDocs) {
    expect(text, `${page.section}/${page.slug}`).toContain(`# ${page.title}\n`);
    expect(text).toContain(`Canonical: ${SITE_URL}/docs/${page.section}/${page.slug}\n`);
  }
  expect(text).not.toMatch(new RegExp(VENDOR_PATTERN.source, 'i'));
});

test('the raw API reference is served at /docs/reference/api.json', async ({ request }) => {
  const response = await request.get('/docs/reference/api.json');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toMatch(/^application\/json/);
  const reference = (await response.json()) as { version: number; packages: unknown[] };
  expect(reference.version).toBe(1);
  expect(reference.packages.length).toBeGreaterThan(0);
});
