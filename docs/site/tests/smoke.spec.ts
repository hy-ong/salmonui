import { expect, test, type Page } from '@playwright/test';
import { loadDemos, loadDocs, loadSectionDocs, sitePaths } from '../lib/catalog.mjs';

// SSR and hydration: zero hydration warnings and zero
// console errors for every demo page. The page list comes from the catalog,
// so a new demo or docs page is covered without editing this file.

const paths = sitePaths(new URL('..', import.meta.url).pathname.replace(/\/$/, ''));
const allDemos = loadDemos(paths.demos);
const demos = allDemos.filter((demo) => demo.category === 'data-grid');
const docs = loadDocs(paths.content);
// Non-grid component categories: `content/<section>/*.md`, demos with `category: <section>`.
const sections = loadSectionDocs(paths.content).filter((s) => s.docs.length > 0);
const sectionDemos = allDemos.filter((demo) => demo.category !== 'data-grid');

/** Console errors and warnings, uncaught page errors, and failed same-origin requests. */
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
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  // Let deferred effects, data loads and late recoverable errors surface.
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(250);
}

test('the catalog lists demos and docs pages', () => {
  expect(demos.length).toBeGreaterThan(0);
  expect(docs.length).toBeGreaterThan(0);
});

for (const demo of demos) {
  test(`demo ${demo.id} server-renders and hydrates cleanly`, async ({ page, request }) => {
    const html = await (await request.get(`/demos/data-grid/${demo.id}`)).text();
    // Tree demos render `role="treegrid"`.
    expect(html, 'server markup contains the grid').toMatch(/role="(tree)?grid"/);

    const problems = collectProblems(page);
    await openHydrated(page, `/demos/data-grid/${demo.id}`);
    expect(problems).toEqual([]);
    const grids = page.locator('[role="grid"], [role="treegrid"]');
    expect(await grids.count()).toBeGreaterThan(0);
    await expect(grids.first().locator('[role="row"]').first()).toBeVisible();
    expect(problems).toEqual([]);
  });
}

for (const doc of docs) {
  test(`docs page ${doc.slug} hydrates cleanly with its demos`, async ({ page }) => {
    const problems = collectProblems(page);
    await openHydrated(page, `/docs/data-grid/${doc.slug}`);
    await expect(page.locator('h1')).toHaveText(doc.title);
    for (const id of doc.demos) await expect(page.locator(`[data-demo-id="${id}"] :is([role="grid"], [role="treegrid"])`).first()).toBeVisible();
    expect(problems).toEqual([]);
  });
}

for (const demo of sectionDemos) {
  test(`demo ${demo.category}/${demo.id} server-renders and hydrates cleanly`, async ({ page }) => {
    const problems = collectProblems(page);
    await openHydrated(page, `/demos/${demo.category}/${demo.id}`);
    await expect(page.locator(`[data-demo-id="${demo.id}"] .demo__stage`)).not.toBeEmpty();
    expect(problems).toEqual([]);
  });
}

for (const { section, docs: pages } of sections) {
  test(`docs section ${section}: index and every page hydrate cleanly with their demos`, async ({ page }) => {
    const problems = collectProblems(page);
    await openHydrated(page, `/docs/${section}`);
    for (const doc of pages) await expect(page.locator(`.home-cards a[href="/docs/${section}/${doc.slug}"]`)).toBeVisible();
    await openHydrated(page, `/demos/${section}`);
    for (const doc of pages) {
      await openHydrated(page, `/docs/${section}/${doc.slug}`);
      await expect(page.locator('h1')).toHaveText(doc.title);
      for (const id of doc.demos) await expect(page.locator(`[data-demo-id="${id}"] .demo__stage`)).not.toBeEmpty();
    }
    expect(problems).toEqual([]);
  });
}

// Data sources start after mount, never during render: each data-source demo loads its rows once hydrated, with no
// hydration mismatch and no state-update warning from the demo's callbacks.
for (const id of ['controlled-data', 'offline-data', 'remote-json', 'odata-bridge', 'remote-editing', 'live-data', 'lazy-grouping']) {
  test(`demo ${id} loads its data source after hydration`, async ({ page }) => {
    const problems = collectProblems(page);
    await openHydrated(page, `/demos/data-grid/${id}`);
    await expect(page.locator('[role="grid"] .salmon-data-grid-rows [data-row-id]').first()).toBeVisible();
    await expect(page.locator('[role="grid"]').first()).not.toHaveAttribute('aria-busy', 'true');
    expect(problems).toEqual([]);
  });
}

test('docs home, Data Grid docs index, demos index, and landing pages hydrate cleanly', async ({ page }) => {
  const problems = collectProblems(page);
  await openHydrated(page, '/docs');
  // The docs home lists the components, Data Grid first.
  await expect(page.locator('main .home-cards a', { hasText: /^Data Grid$/ })).toHaveAttribute('href', '/docs/data-grid');
  await openHydrated(page, '/docs/data-grid');
  await expect(page.locator('h1')).toHaveText('Salmon UI Data Grid documentation');
  await expect(page.locator(`.home-cards a[href="/docs/data-grid/${docs[0]!.slug}"]`)).toBeVisible();
  await openHydrated(page, '/demos');
  await expect(page.locator('main .home-cards a', { hasText: /^All Data Grid demos$/ })).toHaveAttribute('href', '/demos/data-grid');
  await openHydrated(page, '/demos/data-grid');
  await expect(page.locator(`a[href="/demos/data-grid/${demos[0]!.id}"]`)).toBeVisible();
  await openHydrated(page, '/docs/reference');
  await openHydrated(page, '/');
  await expect(page.locator('h1')).toHaveCount(1);
  // No coverage page is served.
  expect((await page.request.get('/coverage')).status()).toBe(404);
  expect(problems).toEqual([]);
});
