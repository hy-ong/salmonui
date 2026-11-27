import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectClean } from './axe.ts';
import { collectProblems, DEV_URL, openGrid } from './helpers.ts';

// the accessibility tree a screen reader receives, pinned
// as Playwright ARIA snapshots (`toMatchAriaSnapshot`, YAML files under
// `aria-snapshots.spec.ts-snapshots/`) for every state the Automated Test
// Plan lists. The fixtures are deterministic (seeded `createFixture`, small
// row counts so the whole view renders, fixed locale and time zone), so a
// snapshot diff is a real change to roles, names or states. Update them with
// `npx playwright test aria-snapshots.spec --update-snapshots` and review
// the YAML diff like code. States not yet scanned by axe elsewhere (data
// error, filtered, pinned rows, adaptive cards in horizontal mode, regions
// with grouping) also run axe here.

test.use({ locale: 'en-US', timezoneId: 'UTC' });

const SMALL = `${DEV_URL}?rows=8&cols=5`;
const grid = (page: Page): Locator => page.locator('.salmon-data-grid').first();
const cell = (page: Page, rowId: string, columnId: string) => page.locator(`.salmon-data-grid [data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="${columnId}"]`);
/** Waits for the debounced live region to settle on `text`. */
const liveSays = (page: Page, text: string | RegExp) => expect(page.locator('.salmon-data-grid-live[role="status"]').first()).toHaveText(text, { timeout: 3000 });

test.describe('ARIA tree snapshots', () => {
  test('plain grid, focused cell, header', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, SMALL);
    await expect(grid(page)).toMatchAriaSnapshot({ name: 'plain.aria.yml' });
    // A header is named by its label only: the resize handle keeps its own label and is not repeated
    // in the header name a screen reader speaks on every column move.
    const header = page.locator('.salmon-data-grid-header-cell[data-column-id="s1"]');
    await expect(header).toHaveAccessibleName('Text 1');
    await expect(header.getByRole('button', { name: 'Resize Text 1' })).toHaveCount(1);
    await expect(page.getByRole('columnheader', { name: /Resize/ })).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('sorted', async ({ page }) => {
    await openGrid(page, `${SMALL}&sort`);
    await page.locator('.salmon-data-grid-header-cell[data-column-id="s1"]').click();
    await expect(page.locator('.salmon-data-grid-header-cell[data-column-id="s1"]')).toHaveAttribute('aria-sort', 'ascending');
    await liveSays(page, 'Sorted by Text 1 ascending');
    await expect(grid(page)).toMatchAriaSnapshot({ name: 'sorted.aria.yml' });
  });

  test('filtered (axe)', async ({ page }) => {
    await openGrid(page, `${SMALL}&filter`);
    await page.evaluate(() => window.__gridApi.filterColumn('n4', 'greaterThanOrEqual', 50000));
    await liveSays(page, /^1 filter active, \d+ of 8 rows shown$/);
    await expect(grid(page)).toMatchAriaSnapshot({ name: 'filtered.aria.yml' });
    await expectClean(page, 'filtered');
  });

  test('grouped: expanded and collapsed captions', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=12&cols=5&sort&group=s0`);
    await expect(grid(page)).toMatchAriaSnapshot({ name: 'grouped-expanded.aria.yml' });
    await page.locator('.salmon-data-grid-rows .salmon-data-grid-group-caption').first().locator('.salmon-data-grid-group-toggle').click();
    await expect(page.locator('.salmon-data-grid-rows .salmon-data-grid-group-caption__cell').first()).toHaveAttribute('aria-expanded', 'false');
    await expect(grid(page)).toMatchAriaSnapshot({ name: 'grouped-collapsed.aria.yml' });
  });

  test('detail row open', async ({ page }) => {
    await openGrid(page, `${DEV_URL}detail-gaps.html?mode=detail&rows=4`);
    await page.evaluate(() => window.__gridApi.expandDetail('c1'));
    await expect(page.locator('#customers [data-row-id="c1"]')).toHaveAttribute('data-expanded', 'true');
    await expect(page.locator('#customers')).toMatchAriaSnapshot({ name: 'detail-open.aria.yml' });
  });

  test('child grid open', async ({ page }) => {
    await openGrid(page, `${DEV_URL}detail-gaps.html?mode=child&rows=3`);
    await page.evaluate(() => window.__gridApi.expandDetail('c1'));
    await expect(page.locator('[id="customers/c1"]')).toHaveAttribute('role', 'grid');
    await expect(page.locator('#customers')).toMatchAriaSnapshot({ name: 'child-grid-open.aria.yml' });
  });

  test('editing: open editor, validation error, row-level errors', async ({ page }) => {
    await openGrid(page, `${SMALL}&edit=row&erowrule`);
    await cell(page, 'r2', 's1').dblclick();
    const input = cell(page, 'r2', 's1').locator('input');
    await expect(input).toBeFocused();
    await expect(page.locator('.salmon-data-grid-row[data-row-id="r2"]')).toMatchAriaSnapshot({ name: 'editing-open.aria.yml' });
    await input.fill('');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('.salmon-data-grid-row[data-row-id="r2"]')).toMatchAriaSnapshot({ name: 'editing-invalid.aria.yml' });
    await input.fill('ROW');
    await page.keyboard.press('Enter');
    const errors = page.locator('.salmon-data-grid-row-errors[role="alert"]');
    await expect(errors).toContainText('Text 1 cannot be ROW');
    await expect(errors).toMatchAriaSnapshot({ name: 'editing-row-errors.aria.yml' });
  });

  test('selection: checkbox column with some rows selected', async ({ page }) => {
    await openGrid(page, `${SMALL}&sel=checkbox`);
    await page.evaluate(() => window.__gridApi.selectRows(['r1', 'r3']));
    await liveSays(page, '2 rows selected');
    await expect(grid(page)).toMatchAriaSnapshot({ name: 'selection-checkbox.aria.yml' });
  });

  test('pinned and sticky rows (axe)', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=12&cols=5&pinRows=r9&frozenRows=1&frozenBottom=1`);
    await expect(page.locator('.salmon-data-grid [data-row-id="r9"]').first()).toBeVisible();
    await expect(grid(page)).toMatchAriaSnapshot({ name: 'pinned-rows.aria.yml' });
    await expectClean(page, 'pinned and sticky rows');
  });

  test('adaptive vertical cards and horizontal adaptive (axe)', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=3&cols=5&adaptive=vertical`);
    await expect(page.locator('.salmon-data-grid[data-adaptive]')).toHaveCount(1);
    await expect(grid(page)).toMatchAriaSnapshot({ name: 'adaptive-cards.aria.yml' });
    await openGrid(page, `${DEV_URL}?rows=6&cols=5&adaptive=horizontal&qpage=3&chrome`);
    await expect(page.locator('.salmon-data-grid[data-adaptive]')).toHaveCount(1);
    await expectClean(page, 'adaptive horizontal with pager and toolbar', ['label-content-name-mismatch']);
  });

  test('regions: toolbar, group panel, pager (axe)', async ({ page }) => {
    // Wide enough for every toolbar item at the md control metrics, so none overflows into More.
    await page.setViewportSize({ width: 1440, height: 800 });
    await openGrid(page, `${DEV_URL}?rows=30&cols=5&chrome&qpage=10&sort&group=s0`);
    await expect(page.locator('.salmon-data-grid-toolbar')).toMatchAriaSnapshot({ name: 'region-toolbar.aria.yml' });
    await expect(page.locator('.salmon-data-grid-group-panel')).toMatchAriaSnapshot({ name: 'region-group-panel.aria.yml' });
    await expect(page.locator('.salmon-data-grid-pager')).toMatchAriaSnapshot({ name: 'region-pager.aria.yml' });
    // label-content-name-mismatch (needs review): the pager's symbol-only "Next pages" button.
    await expectClean(page, 'toolbar, group panel and pager', ['label-content-name-mismatch']);
  });

  test('loading and empty', async ({ page }) => {
    await openGrid(page, SMALL);
    await page.evaluate(() => window.__gridApi.setLoading(true));
    await liveSays(page, 'Loading');
    await expect(grid(page)).toHaveAttribute('aria-busy', 'true');
    await expect(grid(page)).toMatchAriaSnapshot({ name: 'loading.aria.yml' });
    await openGrid(page, `${DEV_URL}?rows=0&cols=5`);
    await expect(grid(page)).toMatchAriaSnapshot({ name: 'empty.aria.yml' });
  });

  test('data error: a failed block renders a retry row (axe)', async ({ page }) => {
    await page.goto(`${DEV_URL}infinite.html?fail&delay=20&total=1000`);
    await page.waitForFunction(() => window.__mountMs !== undefined && window.__gridApi);
    await page.waitForSelector('.salmon-data-grid-row[data-row-id="r0"]');
    await page.evaluate(() => {
      const api = window.__gridApi;
      api.scrollToRow(api.getRowInfo('r500') ? 'r500' : '__loading:500', { align: 'start' });
    });
    const row = page.locator('.salmon-data-grid-loading-row[data-status="error"]').first();
    await expect(row).toBeVisible({ timeout: 5000 });
    await expect(row).toContainText('Block failed to load');
    await expect(row).toMatchAriaSnapshot({ name: 'data-error-row.aria.yml' });
    await expectClean(page, 'data error retry row');
  });

  test('RTL', async ({ page }) => {
    await openGrid(page, `${SMALL}&dir=rtl`);
    await expect(page.locator('[dir="rtl"] .salmon-data-grid')).toHaveCount(1);
    await expect(grid(page)).toMatchAriaSnapshot({ name: 'rtl.aria.yml' });
  });

  test('tree mode: treegrid rows with level, position and expansion, mixed checkbox', async ({ page }) => {
    await page.goto(`${DEV_URL}tree.html?mode=nested`);
    await page.waitForFunction(() => document.querySelector('[data-salmon-pending]') === null && document.querySelector('[role="treegrid"]') !== null);
    await page.locator('[role="treegrid"] [data-row-id="p1b"] .salmon-data-grid-tree-checkbox').click();
    await page.evaluate(() => window.__gridApi?.collapseTreeRows(['p2']));
    await expect(grid(page)).toMatchAriaSnapshot({ name: 'tree.aria.yml' });
  });
});

// Pivot Table (examples/vite-spa/pivot.html, deterministic sales
// fixture): the compact table as a `treegrid` (row headers with `aria-level`
// and `aria-expanded` on the rows, drill toggles), the field list (field
// listbox with folder groups, axis listboxes) and the axis bar (one toolbar
// per axis).
test.describe('ARIA tree snapshots: Pivot Table', () => {
  const pivotPage = async (page: Page, query: string) => {
    await page.goto(`${DEV_URL}pivot.html?${query}`);
    await page.waitForFunction(() => (window as any).__pivot?.status === 'ready' && document.querySelector('.salmon-data-grid-rows [role="row"]') !== null && document.querySelector('[role="treegrid"]') !== null);
  };

  test('compact table with one member expanded', async ({ page }) => {
    const problems = collectProblems(page);
    await pivotPage(page, 'case=drill&rows=200');
    await page.getByRole('button', { name: 'Expand Asia' }).click();
    await expect(page.locator(`.salmon-pivot-table [data-row-id='r["Asia"]']`)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.salmon-pivot-table .salmon-data-grid')).toMatchAriaSnapshot({ name: 'pivot-compact.aria.yml' });
    expect(problems).toEqual([]);
  });

  test('field list and axis bar', async ({ page }) => {
    await pivotPage(page, 'case=all&rows=200');
    await expect(page.locator('section .salmon-pivot-table-field-list')).toMatchAriaSnapshot({ name: 'pivot-field-list.aria.yml' });
    await expect(page.locator('.salmon-pivot-table-axis-bar')).toMatchAriaSnapshot({ name: 'pivot-axis-bar.aria.yml' });
  });
});
