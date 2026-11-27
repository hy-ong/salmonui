import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { buildSymbolPages, entryHref, entryListing, packageIndexHref, symbolSlugs, type ApiReference, type SymbolPage } from '../lib/api-reference';
import { isDocumentOnlyPath } from '../lib/document-only.mjs';

// API reference pages: the index lists every
// package entry point; every entry page is a compact index whose rows keep
// the `#<name>` anchor and link the symbol page, with one row per entry it
// re-exports from instead of that entry's names; symbol pages render the
// signature, kind badge, props and members and hydrate with zero console
// errors or warnings. Every entry page is loaded; symbol pages are sampled
// (the first and last page of every entry, plus the collision slugs), and
// `site:check` resolves every link to all of them in the export.

const reference = JSON.parse(readFileSync(new URL('../generated/api.json', import.meta.url), 'utf8')) as ApiReference;
const symbols = buildSymbolPages(reference);

const specifier = (pkg: string, subpath: string): string => (subpath === '.' ? pkg : `${pkg}/${subpath.replace(/^\.\//, '')}`);

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

test('symbol pages: one per home entry, slugs unique per export directory ignoring case', () => {
  const routes = [
    ...reference.packages.flatMap((pkg) => pkg.entries.map((entry) => entryHref(pkg, entry))),
    ...symbols.pages.map((page) => page.href),
  ];
  const lower = routes.map((route) => route.toLowerCase());
  expect(new Set(lower).size).toBe(routes.length);
  for (const pkg of reference.packages) {
    for (const entry of pkg.entries) {
      for (const symbol of entry.symbols) {
        const home = symbols.pageOf(pkg, entry, symbol.name);
        expect(home, `${pkg.slug}/${entry.slug} ${symbol.name}`).toBeDefined();
        expect(home!.symbol).toEqual(symbol);
        expect(home!.entry === entry || home!.alsoFrom.includes(entry)).toBe(true);
      }
    }
  }
  // Private `./internal/*` exports never get an entry.
  expect(reference.packages.flatMap((pkg) => pkg.entries).some((entry) => entry.subpath.includes('internal'))).toBe(false);
  // A package with one family documents it at its root; the engine re-exports its subpaths, which link back to it.
  expect(symbols.pageOf({ slug: 'data-grid' }, { slug: 'index' }, 'DataGrid')?.href).toBe('/docs/reference/data-grid/DataGrid');
  expect(symbols.pageOf({ slug: 'data-grid' }, { slug: 'engine-sort' }, 'SortCommand')?.href ?? '').toMatch(/^\/docs\/reference\/data-grid\/engine(-sort)?\/SortCommand$/);

  expect(symbolSlugs([{ name: 'Foo', kind: 'type' }, { name: 'foo', kind: 'function' }, { name: 'Bar', kind: 'type' }])).toEqual([
    'Foo-type',
    'foo-function',
    'Bar',
  ]);
  expect(symbolSlugs([{ name: 'Json', kind: 'type' }], ['json'])).toEqual(['Json-type']);
  expect(symbolSlugs([{ name: 'index', kind: 'const' }])).toEqual(['index-const']);
  expect(symbolSlugs([{ name: 'A', kind: 'const' }, { name: 'a', kind: 'const' }])).toEqual(['A-const', 'a-const-2']);
});

test('reference index links every entry point of every package', async ({ page }) => {
  const problems = collectProblems(page);
  await openHydrated(page, '/docs/reference');
  await expect(page.locator('h1')).toHaveText('API reference');
  for (const pkg of reference.packages) {
    await expect(page.locator(`section#${pkg.slug} h2`)).toHaveText(pkg.name);
    for (const entry of pkg.entries) {
      await expect(page.locator(`section#${pkg.slug} a[href="${entryHref(pkg, entry)}"]`)).toHaveText(specifier(pkg.name, entry.subpath));
    }
  }
  expect(problems).toEqual([]);
});

for (const pkg of reference.packages) {
  for (const entry of pkg.entries) {
    const path = entryHref(pkg, entry);
    test(`${path} lists every symbol with its page link and hydrates cleanly`, async ({ page }) => {
      const problems = collectProblems(page);
      await openHydrated(page, path);
      const name = specifier(pkg.name, entry.subpath);
      await expect(page.locator('h1')).toHaveText(name);
      await expect(page).toHaveTitle(`${name} API reference | Salmon UI`);
      const { own, reexports } = entryListing(pkg, entry, symbols);
      const rows = page.locator('.api-entry__list li');
      await expect(rows).toHaveCount(own.length);
      const found = await rows.evaluateAll((els) => els.map((el) => [el.id, el.querySelector('a')?.getAttribute('href') ?? ''] as const));
      const expected = own.map((symbol) => [symbol.name, symbols.pageOf(pkg, entry, symbol.name)!.href] as const);
      expect(found.toSorted()).toEqual(expected.toSorted());
      // Every other name is re-exported: one row per home entry, which lists it.
      expect(own.length + reexports.reduce((sum, group) => sum + group.symbols.length, 0)).toBe(entry.symbols.length);
      const homes = await page.locator('.api-entry__reexports li > a').evaluateAll((els) => els.map((el) => el.getAttribute('href')));
      expect(homes).toEqual(reexports.map((group) => entryHref(pkg, group.entry)));
      expect(problems).toEqual([]);
    });
  }
}

/** The first and last page of every home entry, plus the slugs that needed a suffix. */
function samplePages(): SymbolPage[] {
  const sample = new Set<SymbolPage>();
  for (const pkg of reference.packages) {
    for (const entry of pkg.entries) {
      const home = symbols.pages.filter((page) => page.entry === entry);
      if (home.length > 0) {
        sample.add(home[0]!);
        sample.add(home[home.length - 1]!);
      }
    }
  }
  for (const page of symbols.pages) if (page.slug !== page.symbol.name) sample.add(page);
  return [...sample];
}

for (const symbolPage of samplePages()) {
  const { pkg, entry, symbol, href } = symbolPage;
  test(`${href} renders the symbol and hydrates cleanly`, async ({ page }) => {
    const problems = collectProblems(page);
    await openHydrated(page, href);
    const name = specifier(pkg.name, entry.subpath);
    await expect(page.locator('h1 code')).toHaveText(symbol.name);
    await expect(page.locator('h1 .api-kind')).toHaveText(symbol.kind);
    await expect(page).toHaveTitle(new RegExp(`^${symbol.name} \\w+: ${name.replace(/[/.]/g, '\\$&')} API reference \\| Salmon UI$`));
    await expect(page.locator('.api-symbol__signature pre')).toBeAttached();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`${href}$`));
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs.locator('[aria-current="page"]')).toHaveText(symbol.name);
    await expect(crumbs.locator(`a[href="${entryHref(pkg, entry)}"]`)).toBeAttached();
    if (symbol.members?.length) await expect(page.locator('table.api-members').last().locator('tbody tr')).toHaveCount(symbol.members.length);
    expect(problems).toEqual([]);
  });
}

test('DataGrid is a component with its props, and DataGridProps marks inherited members', async ({ page }) => {
  const problems = collectProblems(page);
  await openHydrated(page, '/docs/reference/data-grid/DataGrid');
  await expect(page.locator('h1 .api-kind')).toHaveText('component');
  await expect(page.locator('.api-entry__import')).toHaveText("import { DataGrid } from '@salmonui/data-grid';");
  await expect(page.locator('.api-symbol__signature')).toContainText('function DataGrid<Row>(props: DataGridProps<Row>)');
  await expect(page.locator('.api-symbol__props a')).toHaveAttribute('href', '/docs/reference/data-grid/DataGridProps');
  const props = page.locator('table.api-members').first();
  await expect(props.locator('caption')).toContainText('DataGrid props');
  await expect(props.locator('tbody th code', { hasText: /^data$/ })).toHaveCount(1);

  await openHydrated(page, '/docs/reference/data-grid/DataGridProps');
  await expect(page.locator('h1 .api-kind')).toHaveText('interface');
  await expect(page.locator('.api-entry__import')).toHaveText("import type { DataGridProps } from '@salmonui/data-grid';");
  const members = symbols.pageOf({ slug: 'data-grid' }, { slug: 'index' }, 'DataGridProps')!.symbol.members!;
  const inherited = members.filter((member) => member.inherited).length;
  expect(inherited).toBeGreaterThan(0);
  const table = page.locator('table.api-members');
  await expect(table.locator('tbody tr')).toHaveCount(members.length);
  await expect(table.locator('tbody tr[data-inherited] .api-flag--inherited')).toHaveCount(inherited);
  expect(problems).toEqual([]);
});

test('old #<name> links land on the index row, which links the symbol page', async ({ page }) => {
  const problems = collectProblems(page);
  await openHydrated(page, '/docs/reference/data-grid/engine#createDataGridEngine');
  const row = page.locator('li#createDataGridEngine');
  await expect(row).toBeInViewport();
  const href = symbols.pageOf({ slug: 'data-grid' }, { slug: 'engine' }, 'createDataGridEngine')!.href;
  await expect(row.locator('a')).toHaveAttribute('href', href);
  await row.locator('a').click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(page.locator('h1 code')).toHaveText('createDataGridEngine');
  expect(problems).toEqual([]);
});

test('sidebar lists the API reference packages and /docs/api links to the reference', async ({ page }) => {
  const problems = collectProblems(page);
  await openHydrated(page, '/docs/data-grid/api');
  const sidebar = page.getByRole('navigation', { name: 'Documentation' });
  // A package without a root entry links to its section of the reference index.
  for (const pkg of reference.packages) {
    await expect(sidebar.getByRole('link', { name: pkg.name, exact: true })).toHaveAttribute('href', packageIndexHref(pkg));
  }
  await expect(page.locator('.doc__prose a[href="/docs/reference"]').first()).toBeVisible();
  await openHydrated(page, '/docs/reference/data');
  await expect(sidebar.locator('[aria-current="page"]')).toHaveAttribute('href', '/docs/reference/data');
  expect(problems).toEqual([]);
});

test('document-only reference pages are reached by full loads, with no payload requests', async ({ page }) => {
  // Pages below /docs/reference/<pkg>
  // ship without their RSC payload, so every link to them is a plain anchor
  // (a client navigation would request the missing payload).
  const problems = collectProblems(page);
  const payloads: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    const rsc = url.pathname.endsWith('.txt') || url.searchParams.has('_rsc') || request.headers()['rsc'] === '1';
    // The page a payload belongs to: `<page>.txt`, `<page>/__next.*.txt`, or `<page>?_rsc=`.
    const target = url.pathname.replace(/\/__next\.[^/]*\.txt$/, '').replace(/\.txt$/, '');
    if (rsc && isDocumentOnlyPath(target)) payloads.push(url.pathname);
  });
  const hydrated = () => page.waitForFunction(() => window.__hydrated === true);
  await openHydrated(page, '/docs/reference');
  await page.locator('a[href="/docs/reference/data-grid"]').first().click();
  await expect(page).toHaveURL(/\/docs\/reference\/data-grid$/);
  await hydrated();
  await page.locator('a[href="/docs/reference/data-grid/DataGrid"]').first().click();
  await expect(page.locator('h1 code')).toHaveText('DataGrid');
  await hydrated();
  await page.getByRole('navigation', { name: 'Breadcrumb' }).locator('a[href="/docs/reference/data-grid"]').click();
  await expect(page).toHaveURL(/\/docs\/reference\/data-grid$/);
  await hydrated();
  await page.waitForLoadState('networkidle');
  expect(payloads).toEqual([]);
  expect(problems).toEqual([]);
});
