import { expect, test, type Page } from '@playwright/test';
import { loadDemos, loadDocs, sitePaths } from '../lib/catalog.mjs';

// Component category routes with the
// Data Visualization section: /docs/data-visualization, /docs/data-visualization/<slug>,
// /demos/data-visualization and /demos/data-visualization/<id> server-render and hydrate with
// zero console errors; the sidebar shows the current section's pages.

const paths = sitePaths(new URL('..', import.meta.url).pathname.replace(/\/$/, ''));
const docs = loadDocs(`${paths.content}/data-visualization`, 'data-visualization');
const demos = loadDemos(paths.demos).filter((d) => d.category === 'data-visualization');

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

test('the data-visualization section has docs pages and demos', () => {
  expect(docs.length).toBeGreaterThan(0);
  expect(demos.length).toBeGreaterThan(0);
  // Gauge, Barcode, QRCode and GeoMap demos (other visualization families add more).
  expect(demos.length).toBeGreaterThanOrEqual(6);
});

for (const demo of demos) {
  test(`data-visualization demo ${demo.id} server-renders and hydrates cleanly`, async ({ page, request }) => {
    const html = await (await request.get(`/demos/data-visualization/${demo.id}`)).text();
    // Charts and maps render `.salmon-viz-*`; the Kanban board `.salmon-kanban-*`; Sparkline its own
    // `.salmon-sparkline` (no shared viz parts).
    expect(html).toMatch(demo.id.startsWith('kanban-') ? /salmon-kanban/ : demo.id.startsWith('sparkline-') ? /salmon-sparkline/ : /salmon-viz/);
    const problems = collectProblems(page);
    await openHydrated(page, `/demos/data-visualization/${demo.id}`);
    await expect(page.locator('h1')).toHaveText(demo.title);
    expect(problems).toEqual([]);
  });
}

for (const doc of docs) {
  test(`data-visualization docs page ${doc.slug} hydrates cleanly with its demos`, async ({ page }) => {
    const problems = collectProblems(page);
    await openHydrated(page, `/docs/data-visualization/${doc.slug}`);
    await expect(page.locator('h1')).toHaveText(doc.title);
    for (const id of doc.demos) await expect(page.locator(`[data-demo-id="${id}"]`)).toBeVisible();
    // The sidebar marks this page as current.
    await expect(sidebar(page).locator('[aria-current="page"]')).toHaveAttribute('href', `/docs/data-visualization/${doc.slug}`);
    expect(problems).toEqual([]);
  });
}

test('docs home, demos home and the data-visualization indexes list the section', async ({ page }) => {
  const problems = collectProblems(page);
  await openHydrated(page, '/docs');
  await expect(page.locator('main .home-cards a', { hasText: /^Data Visualization$/ })).toHaveAttribute('href', '/docs/data-visualization');
  await openHydrated(page, '/docs/data-visualization');
  await expect(page.locator('h1')).toHaveText('Salmon UI Data Visualization documentation');
  for (const doc of docs) await expect(page.locator(`main a[href="/docs/data-visualization/${doc.slug}"]`)).toBeVisible();
  await openHydrated(page, '/demos');
  await expect(page.locator('main .home-cards a', { hasText: /^All Data Visualization demos$/ })).toHaveAttribute('href', '/demos/data-visualization');
  await openHydrated(page, '/demos/data-visualization');
  for (const demo of demos) await expect(page.locator(`a[href="/demos/data-visualization/${demo.id}"]`).first()).toBeVisible();
  expect(problems).toEqual([]);
});

test('a data-visualization docs page has a Markdown version', async ({ request }) => {
  const doc = docs[0]!;
  const response = await request.get(`/docs/data-visualization/${doc.slug}.md`);
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain(doc.title);
});
