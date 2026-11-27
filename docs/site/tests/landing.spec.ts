import { readFileSync } from 'node:fs';
import { VENDOR_PATTERN } from '../../../tooling/checks/planning-tokens.mjs';
import { expect, test, type Page } from '@playwright/test';
import { loadSectionDocs, sitePaths } from '../lib/catalog.mjs';
import { LANDING_ENVIRONMENT, LANDING_METRICS } from '../lib/landing-metrics';
const repoLinks = (process.env.SITE_REPO_URL ?? 'https://github.com/hy-ong/salmonui').trim() !== '';

// Landing page: the hero grid
// hydrates over its seeded rows, the 1,000,000-row swap paints its first frame
// within the mount budget, nothing shifts, every link resolves,
// and the page never names another vendor. It is the landing page of the whole
// library: every component family has a card, in the docs sidebar's order.

const paths = sitePaths(new URL('..', import.meta.url).pathname.replace(/\/$/, ''));
/** Every docs section from the catalog: the Data Grid, then each `content/<section>/`. */
const categories = ['data-grid', ...loadSectionDocs(paths.content).filter((s) => s.docs.length > 0).map((s) => s.section)];
/** Families: Grids holds the Data Grid and the Pivot Table, the rest are one section each; by title. */
const familyOf = (section: string) => (section === 'data-grid' || section === 'pivot-table' ? 'grids' : section);
const families = [...new Set(categories.map(familyOf))].sort((a, b) => a.localeCompare(b));

/** Mount budget: client mount to first painted viewport, `million` local data. */
const MILLION_MOUNT_BUDGET_MS = 500;

declare global {
  interface Window {
    __layoutShift?: { value: number; sources: string[] };
  }
}

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

/** Sums layout-shift entries without recent input (the CLS rule) from the first paint on. */
async function observeLayoutShift(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__layoutShift = { value: 0, sources: [] };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: { node?: Node | null }[] })[]) {
        if (entry.hadRecentInput) continue;
        window.__layoutShift!.value += entry.value;
        for (const source of entry.sources ?? []) {
          const node = source.node;
          window.__layoutShift!.sources.push(node instanceof Element ? `${node.tagName.toLowerCase()}.${node.className}` : String(node?.nodeName));
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}

async function openLanding(page: Page): Promise<void> {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  await page.waitForLoadState('networkidle');
}

const hero = (page: Page) => page.locator('.lp-hero-grid');
const heroGrid = (page: Page) => hero(page).getByRole('grid', { name: 'Live demo: sales orders' });

test('hero grid server-renders, hydrates over 10,000 seeded rows and sorts', async ({ page }) => {
  const problems = collectProblems(page);
  // Server markup already holds the grid and its first rows.
  const html = await (await page.request.get('/')).text();
  expect(html).toContain('aria-label="Live demo: sales orders"');
  expect(html).toContain('SO-100000');

  await openLanding(page);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(heroGrid(page)).toHaveAttribute('aria-rowcount', /^\d+$/);
  await expect(hero(page).locator('[data-hero-rows]')).toHaveAttribute('data-hero-rows', '10000');
  await expect(heroGrid(page).locator('.salmon-data-grid-rows [data-row-id]').first()).toBeVisible();

  // Interactive after hydration: a header click sorts.
  await heroGrid(page).getByRole('columnheader', { name: /^Total/ }).click();
  await expect(heroGrid(page).getByRole('columnheader', { name: /^Total/ })).toHaveAttribute('aria-sort', 'ascending');
  expect(problems).toEqual([]);
});

test('Load 1,000,000 rows paints its first frame within the mount budget without layout shift', async ({ page }) => {
  test.setTimeout(180_000);
  const problems = collectProblems(page);
  await observeLayoutShift(page);
  await openLanding(page);
  const frame = hero(page).locator('.lp-hero-grid__frame');
  const before = await frame.boundingBox();

  await hero(page).getByRole('button', { name: 'Load 1,000,000 rows' }).click();
  const timing = hero(page).locator('[data-first-frame-ms]');
  await expect(timing).toBeVisible({ timeout: 60_000 });
  const frameMs = Number(await timing.getAttribute('data-first-frame-ms'));
  console.log(`[perf] landing hero 1,000,000-row swap: first frame ${frameMs} ms (budget ${MILLION_MOUNT_BUDGET_MS} ms)`);
  expect(frameMs).toBeGreaterThan(0);
  expect(frameMs).toBeLessThan(MILLION_MOUNT_BUDGET_MS);

  await expect(hero(page).locator('[data-hero-rows]')).toHaveAttribute('data-hero-rows', '1000000');
  // Header rows (column headers and the filter row) plus 1,000,000 data rows.
  const rowCount = Number(await heroGrid(page).getAttribute('aria-rowcount'));
  expect(rowCount).toBeGreaterThan(1_000_000);
  expect(rowCount).toBeLessThanOrEqual(1_000_003);
  await expect(hero(page).getByRole('button', { name: '1,000,000 rows loaded' })).toBeDisabled();
  expect(await frame.boundingBox()).toEqual(before);

  const shift = await page.evaluate(() => window.__layoutShift!);
  expect(shift.value, `layout shift sources: ${shift.sources.join(', ')}`).toBeLessThanOrEqual(0.01);
  expect(problems).toEqual([]);
});

test('the hero grid reserves its height before hydration', async ({ page, browser, baseURL }) => {
  // Without JavaScript the frame already has its final block size.
  const noScript = await browser.newContext({ baseURL: baseURL!, javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });
  const staticPage = await noScript.newPage();
  await staticPage.goto('/');
  const reserved = await staticPage.locator('.lp-hero-grid__frame').boundingBox();
  await noScript.close();

  await observeLayoutShift(page);
  await openLanding(page);
  const hydrated = await page.locator('.lp-hero-grid__frame').boundingBox();
  expect(reserved?.height).toBeGreaterThan(300);
  expect(hydrated?.height).toBe(reserved?.height);
  expect(hydrated?.y).toBe(reserved?.y);
  const shift = await page.evaluate(() => window.__layoutShift!);
  expect(shift.value, `layout shift sources: ${shift.sources.join(', ')}`).toBeLessThanOrEqual(0.01);
});

test('every landing page link resolves', async ({ page }) => {
  const problems = collectProblems(page);
  await openLanding(page);
  const hrefs = await page.locator('a[href]').evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
  const internal = [...new Set(hrefs.filter((href) => href.startsWith('/')))];
  expect(internal).toEqual(
    expect.arrayContaining([
      '/docs',
      '/demos',
      '/docs/data-grid/performance',
      '/docs/reference',
      ...categories.flatMap((category) => [`/docs/${category}`, `/demos/${category}`]),
    ]),
  );
  for (const href of internal) {
    const response = await page.request.get(href);
    expect(response.status(), href).toBe(200);
  }
  // The repository link points at the public repository unless SITE_REPO_URL is empty.
  await expect(page.getByRole('link', { name: 'Repository' })).toHaveCount(repoLinks ? 2 : 0);
  expect(problems).toEqual([]);
});

test('features, performance numbers, install and footer', async ({ page }) => {
  const problems = collectProblems(page);
  await openLanding(page);
  // The hero leads to the whole library, not to one component.
  const actions = page.locator('.lp-hero__actions');
  await expect(actions.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/docs');
  await expect(actions.getByRole('link', { name: 'Browse demos' })).toHaveAttribute('href', '/demos');
  await expect(page.locator('.lp-hero__showcase')).toContainText('Data Grid showcase');

  // One card per family, by title, each with the docs and demos of its sections.
  const cards = page.locator('.lp-components > li');
  expect(await cards.evaluateAll((items) => items.map((item) => item.getAttribute('data-family')))).toEqual(families);
  for (const category of categories) {
    const card = page.locator(`.lp-components > li[data-family="${familyOf(category)}"]`);
    await expect(card.locator('.lp-feature__line')).not.toBeEmpty();
    const single = familyOf(category) === category;
    const title = category === 'data-grid' ? 'Data Grid' : 'Pivot Table';
    await expect(card.getByRole('link', { name: single ? 'Docs' : `${title} docs`, exact: true })).toHaveAttribute('href', `/docs/${category}`);
    await expect(card.getByRole('link', { name: single ? 'Demos' : `${title} demos`, exact: true })).toHaveAttribute('href', `/demos/${category}`);
  }
  await expect(page.locator('.lp-hero__pitch')).toContainText(/\d+ components for React 19/);
  await expect(page.locator('.lp-properties li').first()).toBeVisible();

  // Every listed metric is shown with its unit, from the baseline.
  const baseline = JSON.parse(readFileSync(new URL('../../../tooling/bench/baseline.json', import.meta.url), 'utf8')) as {
    environments: Record<string, { platform: string; machine?: string; metrics: Record<string, number> }>;
  };
  const environment = baseline.environments[LANDING_ENVIRONMENT];
  for (const metric of LANDING_METRICS) {
    const card = page.locator(`.lp-metric[data-metric="${metric.key}"]`);
    await expect(card).toHaveCount(1);
    await expect(card.locator('.lp-metric__unit')).toHaveText('ms');
    expect(environment?.metrics[metric.key]).toEqual(expect.any(Number));
  }
  await expect(page.locator('.lp-perf__source')).toContainText(environment?.machine ?? environment?.platform ?? '');

  // The landing page never names another vendor: not in its HTML, title, metadata or JSON-LD.
  await expect(page.locator('.lp-migrate')).toHaveCount(0);
  expect(await page.content()).not.toMatch(new RegExp(VENDOR_PATTERN.source, 'i'));
  expect(await (await page.request.get('/')).text()).not.toMatch(new RegExp(VENDOR_PATTERN.source, 'i'));

  // 0.2.0 is on npm (`prerelease` is false): no pre-release note.
  await expect(page.locator('.lp-install').getByRole('note')).toHaveCount(0);
  await expect(page.locator('.lp-install pre').first()).toContainText('npm install @salmonui/buttons');
  // The quick start shows the per-family import pattern with a non-grid component.
  const quickStart = page.locator('.lp-install pre').nth(1);
  await expect(quickStart).toContainText("from '@salmonui/buttons/button'");
  await expect(quickStart).toContainText("'@salmonui/buttons/button/styles.css'");
  await expect(quickStart).toContainText("'@salmonui/core/styles.css'");
  const footer = page.getByRole('navigation', { name: 'Footer' });
  await expect(footer.getByRole('link')).toHaveText(
    repoLinks
      ? ['Docs', 'Reference', 'Demos', 'llms.txt', 'Repository']
      : ['Docs', 'Reference', 'Demos', 'llms.txt'],
  );
  await expect(page.locator('.lp-footer')).toContainText('MIT License');
  expect(problems).toEqual([]);
});

test('the hero grid does not import the demo registry', () => {
  for (const file of ['../components/HeroGrid.tsx', '../lib/hero-data.ts', '../lib/hero-million.ts', '../lib/fixtures.ts']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    expect(source, file).not.toMatch(/from ['"][^'"]*demos\//);
  }
});
