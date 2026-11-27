import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, openGrid, PROD_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// Query UI (`sorting`, `filtering`, `search`, `paging` props): header sorting (click,
// Ctrl/Cmd+click, Shift+click), filter row (Enter, input trigger, operators),
// filter menu (menu, excel, checklist), the pager (pointer, keyboard, page
// sizes), toolbar search, the before / after events and onError,
// axe-core on the new states, and the interaction budgets
// for sort click, filter menu open, and page change.

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');
const SMALL = `${DEV_URL}?rows=2000&cols=10`;

type QueryEvent = { type: string; [k: string]: unknown };
const events = (page: Page) => page.evaluate(() => (window as unknown as { __queryEvents: QueryEvent[] }).__queryEvents);
const clearEvents = (page: Page) => page.evaluate(() => void ((window as unknown as { __queryEvents: QueryEvent[] }).__queryEvents.length = 0));
const header = (page: Page, id: string) => page.locator(`.salmon-data-grid-header-cell[data-column-id="${id}"]`);
const viewValues = (page: Page, field: string) => page.evaluate((f) => (window.__gridApi.getViewRows() as Record<string, unknown>[]).map((r) => r[f]), field);
const firstRowId = (page: Page) => page.locator('.salmon-data-grid-rows [role="row"]').first().getAttribute('data-row-id');

async function axeViolations(page: Page): Promise<unknown[]> {
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    const axeApi = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<any> } }).axe;
    const result = await axeApi.run({ include: [['.salmon-data-grid'], ['[data-salmon-popover]']] }, { resultTypes: ['violations'], rules: { region: { enabled: false } } });
    return result.violations.map((v: any) => ({ id: v.id, nodes: v.nodes.slice(0, 3).map((n: any) => n.target.join(' ')) }));
  });
}

test.describe('sorting UI', () => {
  test('click cycles asc/desc/none, Ctrl+click adds, Shift+click removes, onBeforeSortChange can cancel', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&qsort=multi&qevents`);
    const s1 = header(page, 's1');
    await s1.click();
    await expect(s1).toHaveAttribute('aria-sort', 'ascending');
    const asc = await viewValues(page, 's1');
    expect([...asc].sort()).toEqual(asc);
    await s1.click();
    await expect(s1).toHaveAttribute('aria-sort', 'descending');
    await header(page, 'n4').click({ modifiers: ['ControlOrMeta'] });
    await expect(header(page, 'n4')).toHaveAttribute('aria-sort', 'ascending');
    await expect(s1.locator('.salmon-data-grid-sort-indicator__order')).toHaveText('1');
    await expect(header(page, 'n4').locator('.salmon-data-grid-sort-indicator__order')).toHaveText('2');
    await s1.click({ modifiers: ['Shift'] });
    await expect(s1).toHaveAttribute('aria-sort', 'none');
    await expect(header(page, 'n4').locator('.salmon-data-grid-sort-indicator__order')).toHaveCount(0);
    const log = await events(page);
    expect(log).toContainEqual(expect.objectContaining({ type: 'beforeSortChange', field: 's1', source: 'pointer', sortBy: [{ field: 's1', direction: 'asc' }], previousSortBy: [] }));
    expect(log).toContainEqual(expect.objectContaining({ type: 'beforeSortChange', field: 's1', sortBy: [{ field: 's1', direction: 'desc' }] }));
    expect(log).toContainEqual(expect.objectContaining({ type: 'sortChange', field: 's1', sortBy: [{ field: 's1', direction: 'asc' }], previousSortBy: [] }));
    expect(log).toContainEqual(expect.objectContaining({ type: 'sortChange', field: 's1', sortBy: [{ field: 'n4', direction: 'asc' }] }));
    // preventDefault() in onBeforeSortChange keeps the current sort.
    await page.evaluate(() => ((window as unknown as { __cancelNext: boolean }).__cancelNext = true));
    await header(page, 's2').click();
    await expect(header(page, 's2')).toHaveAttribute('aria-sort', 'none');
    // n4 is ascending: the second click from here (the third overall) removes its sort (default order ['asc', 'desc', null]).
    await header(page, 'n4').click();
    await expect(header(page, 'n4')).toHaveAttribute('aria-sort', 'descending');
    await header(page, 'n4').click();
    await expect(header(page, 'n4')).toHaveAttribute('aria-sort', 'none');
    expect(problems).toEqual([]);
  });

  test('sorting.multiple false: Ctrl+click replaces the sort', async ({ page }) => {
    await openGrid(page, `${SMALL}&qsort`);
    await header(page, 's1').click();
    await header(page, 'n4').click({ modifiers: ['ControlOrMeta'] });
    await expect(header(page, 's1')).toHaveAttribute('aria-sort', 'none');
    await expect(header(page, 'n4')).toHaveAttribute('aria-sort', 'ascending');
  });
});

test.describe('filter row', () => {
  test('Enter trigger, operator prefixes, wildcards, Escape clears; events', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&qfilter=row&qevents`);
    const input = page.getByRole('textbox', { name: 'Filter Text 1' });
    await input.fill('word-1');
    expect(await firstRowId(page)).toBe('r0');
    await input.press('Enter');
    await expect.poll(async () => (await viewValues(page, 's1')).every((v) => String(v).toLowerCase().includes('word-1'))).toBe(true);
    const n4 = page.getByRole('textbox', { name: 'Filter Number 4' });
    await n4.fill('>=90000');
    await n4.press('Enter');
    await expect.poll(async () => (await viewValues(page, 'n4')).every((v) => Number(v) >= 90000)).toBe(true);
    expect((await viewValues(page, 'n4')).length).toBeGreaterThan(0);
    await n4.fill('abc');
    await n4.press('Enter');
    await expect(n4).toHaveAttribute('aria-invalid', 'true');
    await n4.press('Escape');
    await expect(n4).toHaveValue('');
    await expect.poll(async () => (await viewValues(page, 'n4')).some((v) => Number(v) < 90000)).toBe(true);
    // Wildcard: `word-1*` is `like` (starts with word-1).
    await input.fill('word-1*');
    await input.press('Enter');
    await expect.poll(async () => (await viewValues(page, 's1')).every((v) => String(v).startsWith('word-1'))).toBe(true);
    // A filter applied elsewhere is written into the row.
    await page.evaluate(() => window.__gridApi.filterColumn('s2', 'startswith', 'word-2'));
    await expect(page.getByRole('textbox', { name: 'Filter Text 2' })).toHaveValue('word-2');
    // Enter on the written-back text keeps that condition (startsWith has no prefix).
    await page.getByRole('textbox', { name: 'Filter Text 2' }).press('Enter');
    const s2Filters = () => page.evaluate(() => (window.__gridApi.engine.getSnapshot().query.filters as unknown as { columnId: string; operator: string; value: unknown }[]).filter((f) => f.columnId === 's2'));
    expect(await s2Filters()).toEqual([expect.objectContaining({ operator: 'startsWith', value: 'word-2' })]);
    // A prefixed operator is written back with its prefix and survives Enter.
    await page.evaluate(() => window.__gridApi.filterColumn('n4', 'greaterThanOrEqual', 50));
    await expect(n4).toHaveValue('>=50');
    await n4.press('Enter');
    const n4Filters = () => page.evaluate(() => (window.__gridApi.engine.getSnapshot().query.filters as unknown as { columnId: string; operator: string; value: unknown }[]).filter((f) => f.columnId === 'n4'));
    expect(await n4Filters()).toEqual([expect.objectContaining({ operator: 'greaterThanOrEqual', value: 50 })]);
    // between is written back as a range and re-applies as one.
    await page.evaluate(() => window.__gridApi.filterColumn('n4', 'between', [100, 500]));
    await expect(n4).toHaveValue('100..500');
    await n4.fill('100..600');
    await n4.press('Enter');
    await expect.poll(n4Filters).toEqual([expect.objectContaining({ operator: 'between', value: [100, 600] })]);
    await page.evaluate(() => window.__gridApi.clearFiltering());
    await expect(input).toHaveValue('');
    const log = await events(page);
    expect(log).toContainEqual(expect.objectContaining({ type: 'beforeFilterChange', field: 's1', source: 'keyboard', previousFilters: [] }));
    expect(log).toContainEqual(expect.objectContaining({ type: 'filterChange', field: 's1', filters: [expect.objectContaining({ field: 's1', operator: 'contains', value: 'word-1' })] }));
    // Escape on n4 removes its condition; s1's stays.
    expect(log).toContainEqual(expect.objectContaining({ type: 'beforeFilterChange', field: 'n4', filters: [expect.objectContaining({ field: 's1' })] }));
    expect(problems).toEqual([]);
  });

  test('input trigger with the operator selector', async ({ page }) => {
    await openGrid(page, `${SMALL}&qfilter=row&qfilterOp&qimmediate=0`);
    const op = page.getByRole('combobox', { name: 'Text 1 filter operator' });
    await op.selectOption('startsWith');
    await page.getByRole('textbox', { name: 'Filter Text 1' }).pressSequentially('word-2');
    await expect.poll(async () => (await viewValues(page, 's1')).every((v) => String(v).startsWith('word-2'))).toBe(true);
    await op.selectOption('endsWith');
    await expect.poll(async () => (await viewValues(page, 's1')).every((v) => String(v).endsWith('word-2'))).toBe(true);
  });

  test('operator selector: a between filter set elsewhere is a text range, no number input warning', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&qfilter=row&qfilterOp`);
    const n4 = page.getByRole('textbox', { name: 'Filter Number 4' });
    await page.evaluate(() => window.__gridApi.filterColumn('n4', 'between', [100, 500]));
    await expect(n4).toHaveValue('100..500');
    await expect(n4).toHaveAttribute('type', 'text');
    await expect(page.getByRole('combobox', { name: 'Number 4 filter operator' })).toHaveValue('between');
    await n4.press('Enter');
    const filters = await page.evaluate(() => window.__gridApi.engine.getSnapshot().query.filters);
    expect(filters).toEqual([expect.objectContaining({ columnId: 'n4', operator: 'between', value: [100, 500] })]);
    expect(problems).toEqual([]);
  });
});

test.describe('filter menu', () => {
  test('menu: operator + typed value; Alt+ArrowDown opens, Escape restores focus', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&qfilter=menu`);
    await header(page, 'n4').locator('.salmon-data-grid-filter-button').click();
    const dialog = page.getByRole('dialog', { name: 'Filter Number 4' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('combobox', { name: 'Operator' }).selectOption('between');
    await dialog.getByRole('spinbutton', { name: 'From' }).fill('10000');
    await dialog.getByRole('spinbutton', { name: 'To' }).fill('20000');
    await dialog.getByRole('button', { name: 'OK' }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(async () => (await viewValues(page, 'n4')).every((v) => Number(v) >= 10000 && Number(v) <= 20000)).toBe(true);
    await expect(header(page, 'n4')).toHaveAttribute('data-filtered', '');
    // Keyboard.
    await header(page, 's1').focus();
    await page.keyboard.press('Alt+ArrowDown');
    await expect(page.getByRole('dialog', { name: 'Filter Text 1' })).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(header(page, 's1')).toBeFocused();
    expect(problems).toEqual([]);
  });

  test('excel: checklist and custom filter with OR', async ({ page }) => {
    await openGrid(page, `${SMALL}&qfilter=excel`);
    await header(page, 'b9').locator('.salmon-data-grid-filter-button').click();
    const dialog = page.getByRole('dialog', { name: 'Filter Flag 9' });
    await dialog.locator('.salmon-data-grid-facet-list__option', { has: page.locator('.salmon-data-grid-facet-list__label', { hasText: /^false$/ }) }).click();
    await dialog.getByRole('button', { name: 'OK' }).click();
    await expect.poll(async () => (await viewValues(page, 'b9')).every((v) => v === true)).toBe(true);
    // Custom filter: n4 < 1000 OR n4 > 99000.
    await header(page, 'n4').locator('.salmon-data-grid-filter-button').click();
    const custom = page.getByRole('dialog', { name: 'Filter Number 4' });
    await custom.locator('summary').click();
    await custom.getByRole('combobox', { name: 'Operator', exact: true }).selectOption('lessThan');
    await custom.getByRole('spinbutton', { name: 'Value', exact: true }).fill('1000');
    await custom.getByRole('radio', { name: 'Or' }).check();
    await custom.getByRole('combobox', { name: 'Operator 2' }).selectOption('greaterThan');
    await custom.getByRole('spinbutton', { name: 'Value 2' }).fill('99000');
    await custom.getByRole('button', { name: 'OK' }).click();
    await expect.poll(async () => (await viewValues(page, 'n4')).every((v) => Number(v) < 1000 || Number(v) > 99000)).toBe(true);
    expect((await viewValues(page, 'b9')).every((v) => v === true)).toBe(true);
  });

  test('checklist: search narrows the checklist; OK filters by the visible checked values', async ({ page }) => {
    await openGrid(page, `${SMALL}&qfilter=checklist`);
    await header(page, 's0').locator('.salmon-data-grid-filter-button').click();
    const dialog = page.getByRole('dialog', { name: 'Filter Text 0' });
    await dialog.getByRole('searchbox', { name: 'Search values' }).fill('word-1a');
    await dialog.getByRole('button', { name: 'OK' }).click();
    await expect.poll(async () => (await viewValues(page, 's0')).every((v) => String(v).includes('word-1a'))).toBe(true);
  });
});

test.describe('pager', () => {
  test('pointer, keyboard, page sizes, events, onError, axe', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&qpage=50&qsizes&qevents`);
    const pager = page.getByRole('navigation', { name: 'Pagination' });
    await expect(pager).toBeVisible();
    await expect(pager.locator('.salmon-data-grid-pager__info')).toHaveText('1 of 40 pages (2,000 items)');
    await pager.getByRole('button', { name: 'Page 2', exact: true }).click();
    await expect.poll(() => firstRowId(page)).toBe('r50');
    await expect(pager.getByRole('button', { name: 'Page 2', exact: true })).toHaveAttribute('aria-current', 'page');
    await pager.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect.poll(() => firstRowId(page)).toBe('r100');
    // Keyboard: ArrowRight / ArrowLeft / End / Home; focus follows the current page button.
    await pager.getByRole('button', { name: 'Page 3', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(pager.getByRole('button', { name: 'Page 4', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(pager.getByRole('button', { name: 'Page 2', exact: true })).toBeFocused();
    await page.keyboard.press('End');
    await expect.poll(() => firstRowId(page)).toBe('r1950');
    await expect(pager.getByRole('button', { name: 'Page 40', exact: true })).toBeFocused();
    await expect(pager.getByRole('button', { name: 'Next pages' })).toHaveCount(0);
    await expect(pager.getByRole('button', { name: 'Previous pages' })).toBeVisible();
    await page.keyboard.press('Home');
    await expect.poll(() => firstRowId(page)).toBe('r0');
    // Page size dropdown keeps the first row visible.
    await pager.getByRole('button', { name: 'Page 3', exact: true }).click();
    await pager.getByRole('combobox').selectOption('100');
    await expect(pager.locator('.salmon-data-grid-pager__info')).toHaveText('2 of 20 pages (2,000 items)');
    await pager.getByRole('combobox').selectOption('All');
    await expect(pager.locator('.salmon-data-grid-pager__info')).toHaveText('1 of 1 pages (2,000 items)');
    await pager.getByRole('combobox').selectOption('50');
    // Live region announces the page.
    await pager.getByRole('button', { name: 'Page 5', exact: true }).click();
    await expect(page.locator('.salmon-data-grid-live[role="status"]')).toHaveText(/^Page 5 of 40 ?$/);
    const log = await events(page);
    expect(log).toContainEqual(expect.objectContaining({ type: 'beforePageChange', page: 2, previousPage: 1, pageSize: 50, previousPageSize: 50, source: 'pointer' }));
    expect(log).toContainEqual(expect.objectContaining({ type: 'pageChange', page: 2, previousPage: 1 }));
    expect(log).toContainEqual(expect.objectContaining({ type: 'pageChange', pageSize: 100, previousPageSize: 50 }));
    // Cancel, then a rejected goToPage raises onError.
    await clearEvents(page);
    await page.evaluate(() => ((window as unknown as { __cancelNext: boolean }).__cancelNext = true));
    await pager.getByRole('button', { name: 'Page 6', exact: true }).click();
    await expect(pager.getByRole('button', { name: 'Page 5', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.evaluate(() => window.__gridApi.goToPage(999));
    expect(await events(page)).toContainEqual(expect.objectContaining({ type: 'error', action: 'page' }));
    expect(await axeViolations(page)).toEqual([]);
    expect(problems).toEqual([]);
  });
});

test.describe('search', () => {
  test('toolbar search box: typing searches, Escape clears, api.search writes back', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&qsearch=&qevents`);
    const region = page.getByRole('search', { name: 'Search grid' });
    const box = region.getByRole('searchbox', { name: 'Search' });
    await box.fill('word-3');
    await expect.poll(async () => (await page.evaluate(() => window.__gridApi.getViewRows().length))).toBeLessThan(2000);
    expect(await events(page)).toContainEqual(expect.objectContaining({ type: 'beforeSearchChange', text: 'word-3', previousText: '' }));
    await box.press('Escape');
    await expect.poll(async () => page.evaluate(() => window.__gridApi.getViewRows().length)).toBe(2000);
    await page.evaluate(() => window.__gridApi.search('word-4'));
    await expect(box).toHaveValue('word-4');
    expect(problems).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Timing budgets (production build, 100k x 100)
// ---------------------------------------------------------------------------

/** Clicks `selector` at the start of a frame; ms until the frame that shows the result has rendered. */
async function framedClick(page: Page, selector: string, done: string): Promise<number> {
  return page.evaluate(
    ([sel, until]) =>
      new Promise<number>((resolve, reject) => {
        requestAnimationFrame(() => {
          const el = document.querySelector<HTMLElement>(sel);
          if (!el) return reject(new Error(`no ${sel}`));
          const t0 = performance.now();
          el.click();
          // React flushes the store update in a microtask; poll with tasks (not frames) so the
          // number is the work until the frame renders, without waiting for the next vsync.
          const check = () => {
            if (document.querySelector(until)) {
              // Force style and layout of the committed DOM, then measure after the paint task.
              void document.body.offsetHeight;
              const ch = new MessageChannel();
              ch.port1.onmessage = () => resolve(performance.now() - t0);
              ch.port2.postMessage(0);
            } else setTimeout(check, 0);
          };
          queueMicrotask(check);
        });
      }),
    [selector, done] as const,
  );
}

const p95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1] as number;

test.describe('query UI timing (production build)', { tag: '@perf' }, () => {
  test('header sort click to painted <= 150 ms (single-column sort, 100k rows)', async ({ page }) => {
    await openGrid(page, `${PROD_URL}?qsort`);
    const samples: number[] = [];
    for (let i = 0; i < 6; i++) {
      const id = ['s1', 'n4', 'd7'][i % 3] as string;
      // Clear first so every sample is a cold sort of a different column order.
      await page.evaluate(() => window.__gridApi.clearSorting());
      samples.push(await framedClick(page, `.salmon-data-grid-header-cell[data-column-id="${id}"]`, `.salmon-data-grid-header-cell[data-column-id="${id}"][aria-sort="ascending"]`));
    }
    console.log(`[perf] sort click p95 ${p95(samples).toFixed(1)} ms (${samples.map((s) => s.toFixed(1)).join(', ')})`);
    expectBudget(p95(samples), 150, 'sort click p95');
  });

  test('filter menu open (excel, 256 distinct values) <= 50 ms to painted', async ({ page }) => {
    await openGrid(page, `${PROD_URL}?qfilter=excel`);
    const samples: number[] = [];
    for (let i = 0; i < 6; i++) {
      const id = ['s1', 's2', 'n4'][i % 3] as string;
      samples.push(await framedClick(page, `.salmon-data-grid-header-cell[data-column-id="${id}"] .salmon-data-grid-filter-button`, '[data-salmon-popover][data-placed] .salmon-data-grid-facet-list'));
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-salmon-popover]')).toHaveCount(0);
    }
    console.log(`[perf] filter menu open p95 ${p95(samples).toFixed(1)} ms (${samples.map((s) => s.toFixed(1)).join(', ')})`);
    expectBudget(p95(samples), 50, 'filter menu open p95');
  });

  test('page change (client paging, page size 50) <= 16 ms to painted', async ({ page }) => {
    await openGrid(page, `${PROD_URL}?qpage=50`);
    const samples: number[] = [];
    for (let i = 0; i < 12; i++) {
      const target = 2 + (i % 2);
      samples.push(await framedClick(page, `.salmon-data-grid-pager [aria-label="Page ${target}"]`, `.salmon-data-grid-pager [aria-label="Page ${target}"][aria-current="page"]`));
    }
    console.log(`[perf] page change p95 ${p95(samples).toFixed(1)} ms (${samples.map((s) => s.toFixed(1)).join(', ')})`);
    expectBudget(p95(samples), 16, 'page change p95');
  });
});
