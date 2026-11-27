import { gzipSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { planningTokenHits } from '../../../tooling/checks/planning-tokens.mjs';
import { prepareRecords, searchIndex, SEARCH_MANIFEST_URL, SEARCH_TEXT_LIMIT, searchShardUrl, SHARD_ID, type PreparedRecord, type SearchManifest, type SearchRecord, type SearchShard } from '../lib/search';

// Search: the build-time manifest and shards and their
// budgets, the Cmd/Ctrl-K dialog (lazy manifest fetch, shards on the first
// query, combobox/listbox keyboard navigation, focus restore) and the `?q=`
// prefill, with zero console errors.

const MANIFEST_BUDGET = 40 * 1024;

const SHARD_BUDGET = 60 * 1024;

/** Paths of the search files a page requested. */
function trackSearchRequests(page: Page): { manifest: string[]; shards: string[] } {
  const seen = { manifest: [] as string[], shards: [] as string[] };
  page.on('request', (req) => {
    const { pathname } = new URL(req.url());
    if (pathname === SEARCH_MANIFEST_URL) seen.manifest.push(pathname);
    else if (pathname.startsWith('/search/')) seen.shards.push(pathname);
  });
  return seen;
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

async function openHydrated(page: Page, path: string): Promise<void> {
  const response = await page.goto(path);
  expect(response?.status(), `${path} status`).toBe(200);
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  await page.waitForLoadState('networkidle');
}

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Search the docs' });
const input = (page: Page) => dialog(page).getByRole('combobox', { name: 'Search the docs' });
const options = (page: Page) => dialog(page).getByRole('listbox', { name: 'Search results' }).getByRole('option');

/** Types a query and returns the first option, once results are in. */
async function search(page: Page, query: string) {
  await input(page).fill(query);
  await expect(options(page).first()).toBeVisible();
  return options(page).first();
}

test('the manifest and every shard follow the schema and stay within their gzip budgets', async ({ request }) => {
  const fetchFile = async (path: string) => {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()['content-type'], path).toContain('application/json');
    const body = await response.body();
    return { body, gzip: gzipSync(body, { level: 9 }).length };
  };

  const manifestFile = await fetchFile(SEARCH_MANIFEST_URL);
  console.log(`search manifest: ${manifestFile.body.length} bytes, ${manifestFile.gzip} bytes gzip (budget ${MANIFEST_BUDGET})`);
  expect(manifestFile.gzip).toBeLessThanOrEqual(MANIFEST_BUDGET);
  const manifest = JSON.parse(manifestFile.body.toString('utf8')) as SearchManifest;
  expect(manifest.version).toBe(2);
  expect(manifest.shards.length).toBeGreaterThan(1);

  const records: SearchRecord[] = [...manifest.records];
  let total = manifestFile.gzip;
  for (const info of manifest.shards) {
    expect(info.id).toMatch(SHARD_ID);
    const file = await fetchFile(searchShardUrl(info.id));
    expect(file.gzip, `${info.id}: ${file.gzip} bytes gzip`).toBeLessThanOrEqual(SHARD_BUDGET);
    total += file.gzip;
    const shard = JSON.parse(file.body.toString('utf8')) as SearchShard;
    expect(shard.version).toBe(2);
    expect(shard.id).toBe(info.id);
    expect(shard.records).toHaveLength(info.records);
    records.push(...shard.records);
  }
  console.log(`search: ${manifest.shards.length} shards, ${records.length} records, ${total} bytes gzip in total`);
  expect(new Set(manifest.shards.map((info) => info.id)).size).toBe(manifest.shards.length);

  const kinds = new Set(records.map((record) => record.kind));
  expect([...kinds].sort()).toEqual(['demo', 'section', 'symbol']);
  const keys = new Set<string>();
  for (const record of records) {
    expect(record.title, JSON.stringify(record)).not.toBe('');
    expect(record.text.length, record.title).toBeLessThanOrEqual(SEARCH_TEXT_LIMIT);
    expect(record.url, record.title).toMatch(/^\/(docs|demos)(\/|#|$)/);
    keys.add(`${record.kind}\n${record.url}\n${record.title}\n${record.section ?? ''}`);
  }
  // Every record is in exactly one file.
  expect(keys.size).toBe(records.length);

  // The manifest: page records and the top symbols (React components), no sections or rows.
  expect(manifest.records.some((record) => record.kind === 'section' && record.url === '/docs/data-grid/columns')).toBe(true);
  expect(manifest.records.some((record) => record.kind === 'symbol' && record.url === '/docs/reference/data-grid/DataGrid')).toBe(true);
  expect(manifest.records.every((record) => (record.kind === 'section' && !record.url.includes('#')) || record.kind === 'symbol')).toBe(true);

  // Doc sections link to heading anchors; no record names another vendor.
  expect(records.some((record) => record.kind === 'section' && record.url === '/docs/data-grid/columns#defining-columns')).toBe(true);
  // No record carries planning text (tracking IDs, work packages, vendor names, design-doc paths).
  expect(records.filter((record) => planningTokenHits(JSON.stringify(record)).length > 0).map((record) => record.url)).toEqual([]);
  expect(records.some((record) => record.kind === 'symbol' && record.url === '/docs/reference/data-grid/engine/createDataGridEngine')).toBe(true);
  expect(records.some((record) => record.kind === 'demo' && record.url.startsWith('/demos/data-grid/'))).toBe(true);
});

test('Cmd/Ctrl-K opens the dialog, fetches the manifest lazily, the shards on the first query, and finds a doc section', async ({ page }) => {
  const problems = collectProblems(page);
  const requests = trackSearchRequests(page);
  await openHydrated(page, '/docs');
  expect(requests.manifest, 'no manifest fetch on page load').toEqual([]);
  expect(requests.shards, 'no shard fetch on page load').toEqual([]);
  await expect(dialog(page)).toBeHidden();

  await page.keyboard.press('ControlOrMeta+k');
  await expect(dialog(page)).toBeVisible();
  await expect(input(page)).toBeFocused();
  await expect.poll(() => requests.manifest.length).toBe(1);
  // Opening alone loads only the manifest.
  await page.waitForLoadState('networkidle');
  expect(requests.shards, 'no shard fetch before a query').toEqual([]);

  const first = await search(page, 'defining columns');
  await expect(first).toContainText('Defining columns');
  // The first query fetched every shard once, in parallel.
  const manifest = (await (await page.request.get(SEARCH_MANIFEST_URL)).json()) as SearchManifest;
  await expect.poll(() => requests.shards.length).toBe(manifest.shards.length);
  expect(new Set(requests.shards).size).toBe(manifest.shards.length);
  await expect(dialog(page).getByRole('status')).not.toContainText('searching');
  await expect(first).toHaveAttribute('aria-selected', 'true');
  await expect(input(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(input(page)).toHaveAttribute('aria-activedescendant', (await first.getAttribute('id'))!);

  // Arrows move the active option and wrap.
  const count = await options(page).count();
  await input(page).press('ArrowDown');
  await expect(options(page).nth(count > 1 ? 1 : 0)).toHaveAttribute('aria-selected', 'true');
  await input(page).press('ArrowUp');
  await expect(first).toHaveAttribute('aria-selected', 'true');
  await input(page).press('ArrowUp');
  await expect(options(page).last()).toHaveAttribute('aria-selected', 'true');
  await input(page).press('ArrowDown');

  await input(page).press('Enter');
  await expect(page).toHaveURL(/\/docs\/data-grid\/columns#defining-columns$/);
  await expect(dialog(page)).toBeHidden();
  await expect(page.getByRole('heading', { level: 2, name: 'Defining columns' })).toBeVisible();

  // The manifest and shards stay in memory across client navigation.
  await page.keyboard.press('ControlOrMeta+k');
  await expect(dialog(page)).toBeVisible();
  await search(page, 'sorting');
  expect(requests.manifest).toHaveLength(1);
  expect(requests.shards).toHaveLength(manifest.shards.length);
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  expect(problems).toEqual([]);
});

test('finds API symbols', async ({ page }) => {
  const problems = collectProblems(page);
  await openHydrated(page, '/docs');
  await page.getByRole('button', { name: /^Search/ }).click();
  await expect(dialog(page)).toBeVisible();

  const symbol = await search(page, 'createDataGridEngine');
  await expect(symbol.locator('.site-search__title')).toHaveText('createDataGridEngine');
  await expect(symbol).toHaveAttribute('data-kind', 'symbol');
  await expect(symbol).toContainText('@salmonui/data-grid/engine');

  // A docs page result navigates to its page.
  await (await search(page, 'Paging')).click();
  await expect(page).toHaveURL(/\/docs\/data-grid\/paging$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Paging' })).toBeVisible();

  // A symbol page is document-only:
  // search opens it with a full load, so no RSC payload is requested.
  await page.getByRole('button', { name: /^Search/ }).click();
  await (await search(page, 'createDataGridEngine')).click();
  await expect(page).toHaveURL(/\/docs\/reference\/data-grid\/engine\/createDataGridEngine$/);
  await expect(page.locator('h1 code')).toHaveText('createDataGridEngine');
  await page.waitForFunction(() => window.__hydrated === true);

  await page.getByRole('button', { name: /^Search/ }).click();
  await input(page).fill('zzzz-no-such-thing');
  await expect(dialog(page).getByRole('status')).toHaveText(/No results/);
  await expect(options(page)).toHaveCount(0);
  await expect(input(page)).toHaveAttribute('aria-expanded', 'false');
  expect(problems).toEqual([]);
});

test('ranks across categories and shards exactly as one index would, demos included', async ({ page }) => {
  const problems = collectProblems(page);
  // The reference ranking: every file, prepared in manifest order, matched at once.
  const manifest = (await (await page.request.get(SEARCH_MANIFEST_URL)).json()) as SearchManifest;
  const prepared: PreparedRecord[] = prepareRecords(manifest.records, 0);
  const sourceOf = new Map<SearchRecord, string>(manifest.records.map((record) => [record, 'manifest']));
  for (const [position, info] of manifest.shards.entries()) {
    const shard = (await (await page.request.get(searchShardUrl(info.id))).json()) as SearchShard;
    prepared.push(...prepareRecords(shard.records, position + 1));
    for (const record of shard.records) sourceOf.set(record, info.id);
  }
  const demo = prepared.find((entry) => entry.record.kind === 'demo')!.record;

  await openHydrated(page, '/docs');
  await page.getByRole('button', { name: /^Search/ }).click();
  await expect(dialog(page)).toBeVisible();
  const titles = () => options(page).locator('.site-search__title').allTextContents();
  const kinds = () => options(page).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-kind')));

  for (const query of ['keyboard', 'tabs', 'calendar', demo.title]) {
    const expected = searchIndex(prepared, query);
    await input(page).fill(query);
    await expect(dialog(page).getByRole('status')).toHaveText(/^\d+ results?$/);
    expect(await titles(), query).toEqual(expected.map((record) => record.title));
    expect(await kinds(), query).toEqual(expected.map((record) => record.kind));
    if (query === 'keyboard') {
      // A common word draws results from several files.
      expect(new Set(expected.map((record) => sourceOf.get(record))).size, query).toBeGreaterThan(2);
    }
  }
  // The demo's own title finds it.
  expect(await kinds()).toContain('demo');
  expect(problems).toEqual([]);
});

test('Escape closes the dialog and restores focus to the search button', async ({ page }) => {
  const problems = collectProblems(page);
  await openHydrated(page, '/docs');
  const button = page.getByRole('button', { name: /^Search/ });
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(dialog(page)).toBeVisible();
  await expect(input(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await expect(button).toBeFocused();
  expect(problems).toEqual([]);
});

test('/docs?q= opens the dialog prefilled (the SearchAction target)', async ({ page }) => {
  const problems = collectProblems(page);
  await openHydrated(page, '/docs?q=sort');
  await expect(dialog(page)).toBeVisible();
  await expect(input(page)).toHaveValue('sort');
  await expect(options(page).first()).toBeVisible();
  await expect(options(page).first().locator('.site-search__title')).toHaveText(/^Sort/);
  expect(await options(page).count()).toBeLessThanOrEqual(20);
  expect(problems).toEqual([]);
});
