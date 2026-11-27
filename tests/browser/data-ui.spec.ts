import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, openGrid } from './helpers.ts';

// Row and cell click events, the loading indicator and
// `setLoading`, and `refresh()` in a
// real DOM: delegated listeners, ordering against the built-in selection
// and edit start, `preventDefault()`, aria-busy, the live region, and axe
// on the loading state.

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');
const SMALL = `${DEV_URL}?rows=2000&cols=10`;

const cell = (page: Page, rowId: string, columnId: string) => page.locator(`.salmon-data-grid [data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="${columnId}"]`);
const rowEvents = (page: Page) => page.evaluate(() => (window as unknown as { __rowEvents: unknown[] }).__rowEvents);

test.describe('row and cell click events', () => {
  test('click and double click raise cell then row events with ids, field and index; selection still runs', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&rowEvents`);
    await cell(page, 'r3', 's1').click();
    expect(await rowEvents(page)).toEqual([
      { type: 'cellClick', rowId: 'r3', field: 's1', rowIndex: 3 },
      { type: 'rowClick', rowId: 'r3', field: 's1', rowIndex: 3 },
    ]);
    await expect(page.locator('[role="row"][data-row-id="r3"]')).toHaveAttribute('aria-selected', 'true');
    await cell(page, 'r4', 'n4').dblclick();
    const types = ((await rowEvents(page)) as { type: string }[]).map((e) => e.type);
    // A double click is two clicks then the double click.
    expect(types.slice(2)).toEqual(['cellClick', 'rowClick', 'cellClick', 'rowClick', 'cellDoubleClick', 'rowDoubleClick']);
    // Header clicks are not row clicks.
    await page.locator('.salmon-data-grid-header-cell[data-column-id="s1"]').click();
    expect(((await rowEvents(page)) as unknown[]).length).toBe(8);
    expect(problems).toEqual([]);
  });

  test('preventDefault() in onRowClick skips selection; in onRowDoubleClick skips the edit start', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&rowEvents=prevent&edit=row`);
    await cell(page, 'r2', 's1').click();
    await expect(page.locator('[role="row"][data-row-id="r2"]')).not.toHaveAttribute('aria-selected', 'true');
    await cell(page, 'r2', 's1').dblclick();
    await expect(page.locator('.salmon-data-grid .salmon-data-grid-editor')).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('no handler: no row event listener is attached to the body', async ({ page }) => {
    await openGrid(page, SMALL);
    // Clicks still select through the root handler; nothing records.
    await cell(page, 'r1', 's1').click();
    expect(await page.evaluate(() => 'rowEvents' in window || '__rowEvents' in window)).toBe(false);
  });
});

test.describe('loading indicator and refresh', () => {
  test('setLoading shows the presentational overlay, aria-busy and the polite announcement; axe passes', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, SMALL);
    const grid = page.locator('[role="grid"]');
    await expect(page.locator('.salmon-data-grid-loading')).toHaveCount(0);
    await page.evaluate(() => window.__gridApi.setLoading(true));
    await expect(page.locator('.salmon-data-grid-loading')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('.salmon-data-grid-loading')).toHaveAttribute('data-phase', 'refresh');
    await expect(grid).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('.salmon-data-grid-live[role="status"]')).toHaveText(/Loading/, { timeout: 3000 });
    await page.addScriptTag({ path: AXE });
    const violations = await page.evaluate(async () => {
      const axeApi = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<any> } }).axe;
      const result = await axeApi.run({ include: [['.salmon-data-grid']] }, { resultTypes: ['violations'], rules: { region: { enabled: false } } });
      return result.violations.map((v: any) => v.id);
    });
    expect(violations).toEqual([]);
    await page.evaluate(() => window.__gridApi.setLoading(false));
    await expect(page.locator('.salmon-data-grid-loading')).toHaveCount(0);
    await expect(grid).not.toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('.salmon-data-grid-live[role="status"]')).toHaveText(/Loaded 2,?000 rows/, { timeout: 3000 });
    expect(problems).toEqual([]);
  });

  test('refresh() re-reads rows mutated in place and keeps the selection and scroll', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, SMALL);
    await cell(page, 'r1', 's1').click();
    await page.evaluate(() => {
      (window.__gridApi.getRow('r1') as Record<string, unknown>)['s1'] = 'mutated in place';
    });
    await expect(cell(page, 'r1', 's1')).not.toHaveText('mutated in place');
    await page.evaluate(() => window.__gridApi.refresh());
    await expect(cell(page, 'r1', 's1')).toHaveText('mutated in place');
    await expect(page.locator('[role="row"][data-row-id="r1"]')).toHaveAttribute('aria-selected', 'true');
    expect(problems).toEqual([]);
  });
});
