import { expect, test, type Page } from '@playwright/test';
import { loadDemos, loadDocs, sitePaths } from '../lib/catalog.mjs';

// Component category routes with the
// Editors section: /docs/editors, /docs/editors/<slug>,
// /demos/editors and /demos/editors/<id> server-render and hydrate with
// zero console errors; the sidebar shows the current section's pages.

const paths = sitePaths(new URL('..', import.meta.url).pathname.replace(/\/$/, ''));
const docs = loadDocs(`${paths.content}/editors`, 'editors');
const demos = loadDemos(paths.demos).filter((d) => d.category === 'editors');

function collectProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') problems.push(`console.${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.hostname === 'localhost' && response.status() >= 400) problems.push(`HTTP ${response.status()}: ${url.pathname}`);
  });
  return problems;
}

async function openHydrated(page: Page, path: string): Promise<void> {
  const response = await page.goto(path);
  expect(response?.status(), `${path} status`).toBe(200);
  await page.waitForFunction(() => window.__hydrated === true);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(250);
}

const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Documentation' });

test('the editors section has docs pages and demos', () => {
  expect(docs.length).toBeGreaterThan(0);
  expect(demos.length).toBeGreaterThan(0);
  // InlineEdit, MarkdownEditor, ImageEditor, the rich text family (RichTextEditor, BlockEditor, RichTextContent) and PdfViewer.
  expect(demos.map((d) => d.id).sort()).toEqual([
    'block-editor',
    'block-editor-api',
    'block-editor-collab',
    'image-editor',
    'image-editor-controlled',
    'inline-edit',
    'inline-edit-api',
    'inline-edit-options',
    'inline-edit-rich-text',
    'markdown-editor',
    'markdown-editor-commands',
    'markdown-editor-form',
    'pdf-viewer',
    'pdf-viewer-api',
    'pdf-viewer-password',
    'rich-text-content',
    'rich-text-editor',
    'rich-text-editor-api',
    'rich-text-editor-inline',
    'rich-text-editor-insert',
    'rich-text-extensions',
    'rich-text-paste',
  ]);
});

for (const demo of demos) {
  test(`editors demo ${demo.id} server-renders and hydrates cleanly`, async ({ page, request }) => {
    const html = await (await request.get(`/demos/editors/${demo.id}`)).text();
    expect(html).toMatch(/salmon-inline-edit|salmon-markdown-editor|salmon-image-editor|salmon-rich-text|salmon-block-editor|salmon-pdf-viewer/);
    const problems = collectProblems(page);
    await openHydrated(page, `/demos/editors/${demo.id}`);
    await expect(page.locator('h1')).toHaveText(demo.title);
    expect(problems).toEqual([]);
  });
}

for (const doc of docs) {
  test(`editors docs page ${doc.slug} hydrates cleanly with its demos`, async ({ page }) => {
    const problems = collectProblems(page);
    await openHydrated(page, `/docs/editors/${doc.slug}`);
    await expect(page.locator('h1')).toHaveText(doc.title);
    for (const id of doc.demos) await expect(page.locator(`[data-demo-id="${id}"]`)).toBeVisible();
    // The sidebar marks this page as current.
    await expect(sidebar(page).locator('[aria-current="page"]')).toHaveAttribute('href', `/docs/editors/${doc.slug}`);
    expect(problems).toEqual([]);
  });
}

test('docs home, demos home and the editors indexes list the section', async ({ page }) => {
  const problems = collectProblems(page);
  await openHydrated(page, '/docs');
  await expect(page.locator('main .home-cards a', { hasText: /^Editors$/ })).toHaveAttribute('href', '/docs/editors');
  await openHydrated(page, '/docs/editors');
  await expect(page.locator('h1')).toHaveText('Salmon UI Editors documentation');
  for (const doc of docs) await expect(page.locator(`main a[href="/docs/editors/${doc.slug}"]`)).toBeVisible();
  await openHydrated(page, '/demos');
  await expect(page.locator('main .home-cards a', { hasText: /^All Editors demos$/ })).toHaveAttribute('href', '/demos/editors');
  await openHydrated(page, '/demos/editors');
  for (const demo of demos) await expect(page.locator(`a[href="/demos/editors/${demo.id}"]`).first()).toBeVisible();
  expect(problems).toEqual([]);
});

test('a editors docs page has a Markdown version', async ({ request }) => {
  const doc = docs[0]!;
  const response = await request.get(`/docs/editors/${doc.slug}.md`);
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain(doc.title);
});
