import { expect, test, type Page } from '@playwright/test';
import { VENDOR_PATTERN } from '../../../tooling/checks/planning-tokens.mjs';
import { checkCatalog, loadDemos, loadDocs, sitePaths, type DocPage } from '../lib/catalog.mjs';

// Site chrome: top bar and
// sidebar navigation, table of contents anchors, previous/next links in
// catalog order, breadcrumbs, demo page tabs, the demo browser, reserved
// slugs and the persisted color scheme with
// zero hydration warnings.

const paths = sitePaths(new URL('..', import.meta.url).pathname.replace(/\/$/, ''));
// Catalog order as the sidebar shows it: groups by first appearance, a
// group's lead page (titled like the group) first.
const isLead = (doc: DocPage) => doc.title.toLowerCase() === doc.category.toLowerCase();
const docs = ((all: DocPage[]) => {
  const categories = [...new Set(all.map((doc) => doc.category))];
  return categories.flatMap((category) => {
    const group = all.filter((doc) => doc.category === category);
    return [...group.filter(isLead), ...group.filter((doc) => !isLead(doc))];
  });
})(loadDocs(paths.content));
const demos = loadDemos(paths.demos).filter((demo) => demo.category === 'data-grid');
const STORAGE_KEY = 'salmonui-site-scheme';

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
  await page.waitForLoadState('networkidle');
}

const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Documentation' });
const topnav = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const scheme = (page: Page) => page.getByRole('combobox', { name: 'Color scheme' });
const themeScope = (page: Page) => page.locator('.site').first();

/** A docs page with at least one h2 and one h3 in its markdown body. */
const tocDoc = docs.find((doc) => /^## /m.test(doc.body) && /^### /m.test(doc.body)) ?? docs.find((doc) => /^## /m.test(doc.body));

test('sidebar lists every docs page in catalog order and marks the current page', async ({ page }) => {
  const problems = collectProblems(page);
  const doc = docs[1]!;
  await openHydrated(page, `/docs/data-grid/${doc.slug}`);
  // Grids > Data Grid: its overview, then every page in catalog order.
  const links = sidebar(page).locator('details[data-component="/docs/data-grid"] a');
  const hrefs = await links.evaluateAll((els) => els.map((el) => el.getAttribute('href')));
  expect(hrefs).toEqual(['/docs/data-grid', ...docs.map((d) => `/docs/data-grid/${d.slug}`)]);
  expect(hrefs.filter((href) => /migrating/i.test(href ?? '') || new RegExp(VENDOR_PATTERN.source, 'i').test(href ?? ''))).toEqual([]);
  await expect(sidebar(page).locator('[aria-current="page"]')).toHaveCount(1);
  await expect(sidebar(page).locator('[aria-current="page"]')).toHaveAttribute('href', `/docs/data-grid/${doc.slug}`);
  await expect(topnav(page).getByRole('link', { name: 'Docs' })).toHaveAttribute('data-active', '');
  await expect(topnav(page).getByRole('link', { name: 'Demos' })).not.toHaveAttribute('data-active', '');
  await expect(page.locator('[data-search-slot]')).toHaveCount(1);

  // Client navigation moves the current-page marker.
  const target = docs[2]!;
  await sidebar(page).getByRole('link', { name: target.title, exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/docs/data-grid/${target.slug}$`));
  await expect(page.locator('h1')).toHaveText(target.title);
  await expect(sidebar(page).locator('[aria-current="page"]')).toHaveAttribute('href', `/docs/data-grid/${target.slug}`);

  await topnav(page).getByRole('link', { name: 'Demos' }).click();
  await expect(page).toHaveURL(/\/demos$/);
  await expect(topnav(page).getByRole('link', { name: 'Demos' })).toHaveAttribute('aria-current', 'page');
  expect(problems).toEqual([]);
});

test('breadcrumbs lead back to the docs home and the Data Grid index', async ({ page }) => {
  // A page under a group heading (its group has no lead page).
  const doc = docs.find((d) => !docs.some((o) => o.category === d.category && isLead(o)))!;
  await openHydrated(page, `/docs/data-grid/${doc.slug}`);
  const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(crumbs.getByRole('listitem')).toHaveText(['Docs', 'Grids', 'Data Grid', doc.category, doc.title]);
  await expect(crumbs.getByRole('link', { name: 'Docs', exact: true })).toHaveAttribute('href', '/docs');
  await expect(crumbs.getByRole('link', { name: 'Grids', exact: true })).toHaveAttribute('href', '/docs#family-grids');
  await expect(crumbs.getByRole('link', { name: 'Data Grid', exact: true })).toHaveAttribute('href', '/docs/data-grid');
  // The group crumb is plain text, like its sidebar heading.
  await expect(crumbs.getByRole('link', { name: doc.category, exact: true })).toHaveCount(0);
});

test('table of contents links resolve to h2/h3 headings with stable ids', async ({ page }) => {
  test.skip(!tocDoc, 'no docs page has headings');
  const problems = collectProblems(page);
  await openHydrated(page, `/docs/data-grid/${tocDoc!.slug}`);
  const toc = page.getByRole('navigation', { name: 'On this page' });
  const entries = await toc.getByRole('link').evaluateAll((els) => els.map((el) => ({ href: el.getAttribute('href') ?? '', text: el.textContent ?? '' })));
  expect(entries.length).toBeGreaterThan(0);
  const ids = entries.map((entry) => entry.href.slice(1));
  expect(new Set(ids).size, 'ids are unique').toBe(ids.length);
  for (const { href, text } of entries) {
    expect(href).toMatch(/^#[a-z0-9-]+$/);
    const heading = page.locator(`[id="${href.slice(1)}"]`);
    await expect(heading).toHaveCount(1);
    expect(await heading.evaluate((el) => el.tagName)).toMatch(/^H[23]$/);
    await expect(heading).toHaveText(text);
    // Each heading carries its own anchor link.
    await expect(heading.locator(`a[href="${href}"]`)).toHaveCount(1);
  }
  const last = entries[entries.length - 1]!;
  await toc.getByRole('link', { name: last.text, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${last.href}$`));
  await expect(page.locator(`[id="${last.href.slice(1)}"]`)).toBeInViewport();
  expect(problems).toEqual([]);
});

test('previous and next links follow catalog order', async ({ page }) => {
  const pager = (p: Page) => p.getByRole('navigation', { name: 'Previous and next pages' });
  // The Data Grid's first page follows its overview (the Data Grid index).
  await openHydrated(page, `/docs/data-grid/${docs[0]!.slug}`);
  await expect(pager(page).locator('a[rel="prev"]')).toHaveAttribute('href', '/docs/data-grid');
  await expect(pager(page).locator('a[rel="next"]')).toHaveAttribute('href', `/docs/data-grid/${docs[1]!.slug}`);

  const middle = Math.floor(docs.length / 2);
  await openHydrated(page, `/docs/data-grid/${docs[middle]!.slug}`);
  await expect(pager(page).locator('a[rel="prev"]')).toHaveAttribute('href', `/docs/data-grid/${docs[middle - 1]!.slug}`);
  await expect(pager(page).locator('a[rel="next"]')).toHaveAttribute('href', `/docs/data-grid/${docs[middle + 1]!.slug}`);
  await pager(page).locator('a[rel="next"]').click();
  await expect(page.locator('h1')).toHaveText(docs[middle + 1]!.title);

  await openHydrated(page, `/docs/data-grid/${docs[docs.length - 1]!.slug}`);
  await expect(pager(page).locator('a[rel="next"]')).toHaveCount(0);
});

test('reserved slugs are catalog errors', () => {
  const fake = (slug: string): DocPage => ({ ...docs[0]!, slug, demos: [] });
  const errors = checkCatalog([...docs, fake('reference')], demos).errors;
  expect(errors.filter((e) => e.includes('reserved'))).toHaveLength(1);
});

test('demo page tabs keep the preview mounted', async ({ page, request }) => {
  const demo = demos.find((d) => d.id === 'sorting') ?? demos[0]!;
  const html = await (await request.get(`/demos/data-grid/${demo.id}`)).text();
  expect(html, 'source is in the server markup').toContain('<span class="sh__token--keyword">export</span> <span class="sh__token--keyword">default</span>');

  const problems = collectProblems(page);
  await openHydrated(page, `/demos/data-grid/${demo.id}`);
  const tab = (name: string) => page.getByRole('tab', { name });
  const preview = page.getByRole('tabpanel', { name: 'Preview' });
  await expect(tab('Preview')).toHaveAttribute('aria-selected', 'true');
  await expect(preview.locator('[role="grid"]').first()).toBeVisible();
  const grid = page.locator('[role="grid"]').first();

  await tab('Source').click();
  await expect(page.getByRole('tabpanel', { name: 'Source' })).toContainText('export default');
  await expect(grid).toBeHidden();
  await expect(grid).toBeAttached();

  // Arrow keys move between tabs.
  await page.keyboard.press('ArrowRight');
  await expect(tab('Notes')).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: 'Notes' })).not.toBeEmpty();

  await tab('Preview').click();
  await expect(grid).toBeVisible();
  expect(problems).toEqual([]);
});

/** A docs page with a ts/tsx fence in its markdown body. */
const tsFenceDoc = docs.find((doc) => /^```tsx?\s*$/m.test(doc.body));

test('code fences and demo sources are highlighted on the server', async ({ page, request }) => {
  expect(tsFenceDoc, 'a docs page has a ts/tsx fence').toBeDefined();
  const docHtml = await (await request.get(`/docs/data-grid/${tsFenceDoc!.slug}`)).text();
  const fence = /<pre class="code-block code-block--highlighted"><code class="language-tsx?">([\s\S]*?)<\/code><\/pre>/.exec(docHtml);
  expect(fence, 'the fence renders as a highlighted code block').not.toBeNull();
  expect(fence![1]).toMatch(/<span class="sh__line"><span class="sh__token--[a-z]+">/);
  expect(fence![1]).toMatch(/<span class="sh__token--(keyword|entity)">/);
  expect(fence![1], 'token colors come from code.css, not inline styles').not.toContain('style=');

  const demo = demos.find((d) => d.id === 'sorting') ?? demos[0]!;
  const demoHtml = await (await request.get(`/demos/data-grid/${demo.id}`)).text();
  expect(demoHtml).toMatch(/<pre class="code-block code-block--highlighted"><code class="language-tsx"><span class="sh__line">/);

  // Token colors resolve from the site code variables in both schemes.
  await openHydrated(page, `/demos/data-grid/${demo.id}`);
  await page.getByRole('tab', { name: 'Source' }).click();
  const source = page.getByRole('tabpanel', { name: 'Source' });
  const keyword = source.locator('.sh__token--keyword').first();
  const identifier = source.locator('.sh__token--identifier').first();
  const color = (locator: typeof keyword) => locator.evaluate((element) => getComputedStyle(element).color);
  for (const value of ['light', 'dark'] as const) {
    await scheme(page).selectOption(value);
    await expect(themeScope(page)).toHaveAttribute('data-salmon-color-scheme', value);
    expect(await color(keyword), `${value}: keyword differs from identifier`).not.toBe(await color(identifier));
  }
  const darkKeyword = await color(keyword);
  await scheme(page).selectOption('light');
  await expect(themeScope(page)).toHaveAttribute('data-salmon-color-scheme', 'light');
  expect(await color(keyword), 'keyword color follows the scheme').not.toBe(darkKeyword);
});

test('the Data Grid demos are linked from the docs home, the Data Grid docs, the landing page and /demos', async ({ page }) => {
  const problems = collectProblems(page);
  await openHydrated(page, '/docs');
  const card = page.locator('main .home-cards li[data-family="grids"]');
  await expect(card.getByRole('link', { name: 'Data Grid', exact: true })).toHaveAttribute('href', '/docs/data-grid');
  await expect(card.getByRole('link', { name: 'Data Grid demos', exact: true })).toHaveAttribute('href', '/demos/data-grid');
  await openHydrated(page, '/docs/data-grid');
  await expect(page.locator('main').getByRole('link', { name: 'Browse all Data Grid demos' })).toHaveAttribute('href', '/demos/data-grid');
  await openHydrated(page, '/');
  const components = page.locator('section[aria-labelledby="lp-components"] li[data-family="grids"]');
  await expect(components.getByRole('link', { name: 'Data Grid docs', exact: true })).toHaveAttribute('href', '/docs/data-grid');
  await expect(components.getByRole('link', { name: 'Data Grid demos', exact: true })).toHaveAttribute('href', '/demos/data-grid');
  await openHydrated(page, '/demos');
  await expect(page.getByRole('heading', { level: 2, name: 'Data Grid', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'All Data Grid demos' }).click();
  await expect(page).toHaveURL(/\/demos\/data-grid$/);
  await expect(page.locator('h1')).toHaveText('Data Grid demos');
  expect(problems).toEqual([]);
});

test('the demo browser groups demos and filters by title', async ({ page }) => {
  await openHydrated(page, '/demos/data-grid');
  const cards = page.locator('.demo-browser a[href^="/demos/data-grid/"]');
  await expect(cards).toHaveCount(demos.length);
  const target = demos[demos.length - 1]!;
  await page.getByRole('searchbox', { name: 'Filter demos by title' }).fill(target.title);
  await expect(cards.filter({ hasText: target.title }).first()).toBeVisible();
  expect(await cards.count()).toBeLessThan(demos.length);
});

test('the color scheme persists across reloads without hydration warnings', async ({ page, request }) => {
  const problems = collectProblems(page);
  const path = `/docs/data-grid/${docs[0]!.slug}`;
  await openHydrated(page, path);
  await expect(scheme(page)).toHaveValue('auto');
  await expect(themeScope(page)).not.toHaveAttribute('data-salmon-color-scheme', /.+/);

  await scheme(page).selectOption('dark');
  await expect(themeScope(page)).toHaveAttribute('data-salmon-color-scheme', 'dark');
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe('dark');

  // Reload: server markup stays `auto`, the stored choice applies after hydration.
  const html = await (await request.get(path)).text();
  const scopeTag = /<div[^>]*class="[^"]*\bsite\b[^"]*"[^>]*>/.exec(html)?.[0];
  expect(scopeTag, 'server markup has the theme scope').toBeDefined();
  expect(scopeTag).not.toContain('data-salmon-color-scheme');
  await openHydrated(page, path);
  await expect(scheme(page)).toHaveValue('dark');
  await expect(themeScope(page)).toHaveAttribute('data-salmon-color-scheme', 'dark');

  // It also carries over to other pages, including demo pages.
  await openHydrated(page, `/demos/data-grid/${demos[0]!.id}`);
  await expect(themeScope(page)).toHaveAttribute('data-salmon-color-scheme', 'dark');

  await scheme(page).selectOption('auto');
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
  await expect(themeScope(page)).not.toHaveAttribute('data-salmon-color-scheme', /.+/);
  expect(problems).toEqual([]);
});

test('blocked storage falls back to auto', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('blocked');
      },
    });
  });
  const problems = collectProblems(page);
  await openHydrated(page, '/docs');
  await expect(scheme(page)).toHaveValue('auto');
  await scheme(page).selectOption('light');
  await expect(themeScope(page)).toHaveAttribute('data-salmon-color-scheme', 'light');
  expect(problems).toEqual([]);
});
