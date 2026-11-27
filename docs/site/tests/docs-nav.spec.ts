import { expect, test, type Page } from '@playwright/test';
import { loadSectionDocs, sitePaths } from '../lib/catalog.mjs';
const repoLinks = (process.env.SITE_REPO_URL ?? 'https://github.com/hy-ong/salmonui').trim() !== '';

// Docs sidebar and breadcrumbs:
// families in title order (Grids holds the Data Grid and the Pivot Table),
// then components, then pages; only the current family and component are
// open (server-rendered, so no hydration warning and it works without
// JavaScript), and the breadcrumb trail of a docs page equals the sidebar
// ancestry of its `aria-current` link.

const paths = sitePaths(new URL('..', import.meta.url).pathname.replace(/\/$/, ''));
const sections = ['data-grid', ...loadSectionDocs(paths.content).filter((s) => s.docs.length > 0).map((s) => s.section)];
const familyOf = (section: string) => (section === 'data-grid' || section === 'pivot-table' ? 'grids' : section);
const families = [...new Set(sections.map(familyOf))].sort((a, b) => a.localeCompare(b));

const PAGES = [
  { family: 'grids', component: '/docs/data-grid', path: '/docs/data-grid/column-chooser', crumbs: ['Docs', 'Grids', 'Data Grid', 'Columns', 'Column chooser'] },
  { family: 'grids', component: '/docs/data-grid', path: '/docs/data-grid/columns', crumbs: ['Docs', 'Grids', 'Data Grid', 'Columns'] },
  { family: 'buttons', component: null, path: '/docs/buttons/button', crumbs: ['Docs', 'Buttons', 'Button'] },
  { family: 'buttons', component: null, path: '/docs/buttons/split-button', crumbs: ['Docs', 'Buttons', 'Split Button'] },
  { family: 'grids', component: '/docs/pivot-table', path: '/docs/pivot-table/field-list', crumbs: ['Docs', 'Grids', 'Pivot Table', 'Fields and filters', 'Field list'] },
  {
    family: 'data-visualization',
    component: '/docs/data-visualization/chart',
    path: '/docs/data-visualization/chart-axes',
    crumbs: ['Docs', 'Data Visualization', 'Chart', 'Chart axes'],
  },
] as const;

function collectProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') problems.push(`console.${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}

async function openHydrated(page: Page, path: string): Promise<void> {
  const response = await page.goto(path);
  expect(response?.status(), `${path} status`).toBe(200);
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
}

const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Documentation' });

/**
 * Labels and hrefs from the family summary down to the current link,
 * folded like the breadcrumbs: an "Overview" link stands for its component,
 * and a label equal to the next one is dropped.
 */
async function sidebarAncestry(page: Page): Promise<{ title: string; href: string | null }[]> {
  const chain = await sidebar(page)
    .locator('a[aria-current="page"]')
    .evaluate((link) => {
      const nodes: { title: string; href: string | null }[] = [];
      for (let li = link.closest('li'); li; li = li.parentElement?.closest('li') ?? null) {
        const own = li.querySelector(':scope > a, :scope > .docs-nav__group');
        const summary = li.querySelector(':scope > details > summary');
        if (own) nodes.unshift({ title: own.textContent ?? '', href: own.getAttribute('href') });
        else if (summary) nodes.unshift({ title: summary.textContent ?? '', href: null });
      }
      return nodes;
    });
  if (chain[chain.length - 1]?.title === 'Overview') chain.pop();
  return chain.filter((node, i) => chain[i + 1]?.title.toLowerCase() !== node.title.toLowerCase());
}

const openFamilies = (page: Page) =>
  sidebar(page)
    .locator('details[data-family]')
    .evaluateAll((els) => els.filter((el) => (el as HTMLDetailsElement).open).map((el) => el.getAttribute('data-family')));
const openComponents = (page: Page) =>
  sidebar(page)
    .locator('details[data-component]')
    .evaluateAll((els) => els.filter((el) => (el as HTMLDetailsElement).open).map((el) => el.getAttribute('data-component')));

test('families are the first level in title order and only the current family and component are open', async ({ page }) => {
  const problems = collectProblems(page);
  for (const { family, component, path } of PAGES) {
    await openHydrated(page, path);
    const top = sidebar(page).locator('.docs-nav__categories > li > details');
    expect(await top.evaluateAll((els) => els.map((el) => el.getAttribute('data-family')))).toEqual(families);
    expect(await openFamilies(page), path).toEqual([family]);
    expect(await openComponents(page), path).toEqual(component ? [component] : []);
    await expect(sidebar(page).locator('[aria-current="page"]')).toHaveCount(1);
    await expect(sidebar(page).locator('[aria-current="page"]')).toHaveAttribute('href', path);
  }
  // Grids holds the Data Grid and the Pivot Table; the Data Grid is not a first-level entry.
  const grids = sidebar(page).locator('details[data-family="grids"] > ul > li > details > summary');
  expect(await grids.allTextContents()).toEqual(['Data Grid', 'Pivot Table']);
  // A family's components are in title order.
  const buttons = await sidebar(page).locator('details[data-family="buttons"] > ul > li > a').allTextContents();
  expect(buttons).toEqual([...buttons].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
  // The docs home opens nothing.
  await openHydrated(page, '/docs');
  await expect(sidebar(page).locator('details[open]')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('breadcrumbs equal the sidebar ancestry of the current page', async ({ page }) => {
  for (const { path, crumbs: expected } of PAGES) {
    await openHydrated(page, path);
    const ancestry = await sidebarAncestry(page);
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    const items = await crumbs.getByRole('listitem').evaluateAll((els) =>
      els.map((el) => ({ title: el.textContent ?? '', href: el.querySelector('a')?.getAttribute('href') ?? null })),
    );
    expect(items.map((item) => item.title), path).toEqual(['Docs', ...ancestry.map((node) => node.title)]);
    expect(items.map((item) => item.title), path).toEqual([...expected]);
    // A linked sidebar page is a crumb linking the same page; a heading is plain text in both.
    ancestry.slice(0, -1).forEach((node, index) => {
      if (node.href) expect(items[index + 1]!.href, `${path} crumb ${node.title}`).toBe(node.href);
      if (!node.href && index > 1) expect(items[index + 1]!.href, `${path} crumb ${node.title}`).toBe(null);
    });
    // Family and component crumbs link; every linked crumb resolves.
    expect(items[1]!.href, `${path} family crumb`).not.toBe(null);
    for (const { href } of items) {
      if (!href) continue;
      const [pathname, hash] = href.split('#');
      expect((await page.request.get(pathname!)).status(), href).toBe(200);
      if (hash) {
        await openHydrated(page, pathname!);
        await expect(page.locator(`[id="${hash}"]`), href).toHaveCount(1);
        await openHydrated(page, path);
      }
    }
  }
});

test('at 390px the sidebar folds behind a closed toggle and its disclosures work by keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const problems = collectProblems(page);
  await openHydrated(page, '/docs/buttons/button');
  // Content starts on the first screen.
  await expect(page.locator('main h1, article h1').first()).toBeInViewport();
  const box = await page.locator('main h1, article h1').first().boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  await expect(sidebar(page).locator('.docs-nav__categories')).toBeHidden();
  // Open the sidebar by keyboard, then a family.
  await sidebar(page).locator('#docs-nav-toggle').focus();
  await page.keyboard.press('Space');
  await expect(sidebar(page).locator('.docs-nav__categories')).toBeVisible();
  const inputs = sidebar(page).locator('details[data-family="inputs"]');
  await expect(inputs).not.toHaveAttribute('open', '');
  await inputs.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(inputs).toHaveAttribute('open', '');
  await expect(inputs.getByRole('link').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(problems).toEqual([]);
});

test('the sidebar is server-rendered: families and components open and toggle without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/docs/pivot-table/field-list');
  expect(await openFamilies(page)).toEqual(['grids']);
  expect(await openComponents(page)).toEqual(['/docs/pivot-table']);
  await expect(sidebar(page).locator('a[aria-current="page"]')).toHaveAttribute('href', '/docs/pivot-table/field-list');
  await sidebar(page).locator('details[data-family="buttons"] summary').click();
  await expect(sidebar(page).locator('details[data-family="buttons"]')).toHaveAttribute('open', '');
  await context.close();
});

test('the top bar has no migration entry', async ({ page }) => {
  await openHydrated(page, '/docs/buttons/button');
  const main = page.getByRole('navigation', { name: 'Main' });
  await expect(main.getByRole('link')).toHaveText(repoLinks ? ['Docs', 'Reference', 'Demos', 'Repository'] : ['Docs', 'Reference', 'Demos']);
  await openHydrated(page, '/docs');
  await expect(page.locator('#migrating')).toHaveCount(0);
  // The docs home groups the components by the same families.
  expect(await page.locator('main .home-cards li[data-family]').evaluateAll((els) => els.map((el) => el.getAttribute('data-family')))).toEqual(families);
});
