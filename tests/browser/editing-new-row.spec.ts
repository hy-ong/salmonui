import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, openGrid, SSR_URL } from './helpers.ts';

// `editing.showNewRow`: the always-visible add row in row mode. Editors in every editable cell at rest,
// Enter saves and a fresh blank row continues the entry, Escape clears it,
// it is disabled while another row edits, it renders at rest on the server
// and hydrates without warnings.

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');
const URL_TOP = `${DEV_URL}?rows=2000&cols=10&edit=row&enewrow`;

const newRow = (page: Page) => page.locator('.salmon-data-grid [data-new-row]');
const newCell = (page: Page, columnId: string) => newRow(page).locator(`.salmon-data-grid-cell[data-column-id="${columnId}"]`);
const cell = (page: Page, rowId: string, columnId: string) => page.locator(`.salmon-data-grid .salmon-data-grid-rows [data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="${columnId}"]`);
const events = (page: Page) => page.evaluate(() => (window as unknown as { __editEvents: { type: string }[] }).__editEvents.map((e) => e.type));
const value = (page: Page, rowId: string, field: string) => page.evaluate(([r, f]) => (window.__gridApi.getRowInfo(r)?.row as Record<string, unknown> | undefined)?.[f], [rowId, field] as const);

async function axeViolations(page: Page): Promise<unknown[]> {
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    const axeApi = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<any> } }).axe;
    const result = await axeApi.run({ include: [['.salmon-data-grid']] }, { resultTypes: ['violations'], rules: { region: { enabled: false } } });
    return result.violations.map((v: any) => ({ id: v.id, nodes: v.nodes.slice(0, 3).map((n: any) => n.target.join(' ')) }));
  });
}

test.describe('always-visible add row', () => {
  test('editors at rest; typing and Enter saves; a fresh blank row continues the entry', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, URL_TOP);
    await expect(newRow(page)).toHaveCount(1);
    await expect(newRow(page)).toHaveAttribute('aria-label', 'Add new row');
    await expect(page.locator('.salmon-data-grid-added-rows--top [data-new-row]')).toHaveCount(1);
    // The key is editable on the add row; every data column has an editor.
    await expect(newCell(page, 'id').locator('input')).toHaveCount(1);
    await expect(newCell(page, 'n4').locator('input[inputmode="decimal"]')).toHaveCount(1);
    await expect(newCell(page, 'b9').locator('input[type="checkbox"]')).toHaveCount(1);
    const firstId = await newRow(page).getAttribute('data-row-id');
    await newCell(page, 'id').locator('input').click();
    await page.keyboard.type('n1');
    await page.keyboard.press('Tab');
    await expect(newCell(page, 's0').locator('input')).toBeFocused();
    await page.keyboard.type('first');
    await page.keyboard.press('Tab');
    await expect(newCell(page, 's1').locator('input')).toBeFocused();
    await page.keyboard.type('added text');
    await page.keyboard.press('Enter');
    await expect.poll(() => value(page, 'n1', 's1')).toBe('added text');
    expect(await value(page, 'n1', 's0')).toBe('first');
    // A fresh, empty add row with focus in its first editor.
    await expect(newRow(page)).not.toHaveAttribute('data-row-id', firstId ?? '');
    await expect(newCell(page, 'id').locator('input')).toBeFocused();
    await expect(newCell(page, 's1').locator('input')).toHaveValue('');
    expect(await events(page)).toContain('save');
    expect(await axeViolations(page)).toEqual([]);
    expect(problems).toEqual([]);
  });

  test('validation keeps the row; Escape clears it and returns focus to the grid', async ({ page }) => {
    await openGrid(page, URL_TOP);
    await newCell(page, 'id').locator('input').click();
    await page.keyboard.type('n2');
    await page.keyboard.press('Enter');
    // s1 is required.
    await expect(newCell(page, 's1').locator('input')).toHaveAttribute('aria-invalid', 'true');
    expect(await value(page, 'n2', 'id')).toBeUndefined();
    await page.keyboard.press('Escape');
    await expect(newCell(page, 'id').locator('input')).toHaveValue('');
    await expect(newCell(page, 's1').locator('input')).not.toHaveAttribute('aria-invalid', 'true');
    // Focus is back on the grid (its tab stop), outside the add row.
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.closest('[role="grid"]') !== null && document.activeElement?.closest('[data-new-row]') === null))
      .toBe(true);
    expect(await page.evaluate(() => window.__gridApi.hasUnsavedChanges())).toBe(false);
  });

  test('disabled while another row edits; enabled again after it', async ({ page }) => {
    await openGrid(page, URL_TOP);
    await cell(page, 'r1', 's1').click();
    await page.keyboard.press('F2');
    await expect(newRow(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(newCell(page, 's1').locator('input')).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(newRow(page)).not.toHaveAttribute('aria-disabled', 'true');
    await expect(newCell(page, 's1').locator('input')).toBeEnabled();
    // Tab out of the untouched add row moves on natively and leaves no editor active.
    await newCell(page, 'b9').locator('input').focus();
    await page.keyboard.press('Tab');
    await expect.poll(() => page.evaluate(() => window.__gridApi.getEditSnapshot()?.activeRowId ?? null)).toBe(null);
  });

  test('newRowPosition bottom and Insert focus the add row', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=2000&cols=10&edit=row&enewrow=bottom`);
    await expect(page.locator('.salmon-data-grid-added-rows--bottom [data-new-row]')).toHaveCount(1);
    await expect(newRow(page)).toBeInViewport();
    await cell(page, 'r0', 's1').click();
    await page.keyboard.press('Insert');
    await expect(newCell(page, 'id').locator('input')).toBeFocused();
    // Insert edits the add row; it never opens a second added row.
    await expect(page.locator('.salmon-data-grid-added-row')).toHaveCount(1);
  });
});

test.describe('always-visible add row: SSR and hydration', () => {
  test('the server renders the at-rest add row; hydration keeps it without warnings; editors follow', async ({ page }) => {
    const problems = collectProblems(page);
    const html = await (await page.request.get(`${SSR_URL}?newrow`)).text();
    expect(html).toMatch(/data-row-id="__new:blank-1"[^>]*data-new-row=""/);
    expect(html).not.toContain('salmon-data-grid-editor');
    await page.goto(`${SSR_URL}?newrow`);
    await page.waitForFunction(() => window.__hydrated === true);
    await expect(page.locator('[data-new-row]')).toHaveCount(1);
    await expect(page.locator('[data-new-row] .salmon-data-grid-editor').first()).toBeVisible();
    await page.waitForTimeout(100);
    // The SSR dev server runs without HMR: its client's websocket errors are not hydration problems.
    expect(problems.filter((p) => !/WebSocket|\[vite\]/.test(p))).toEqual([]);
  });
});
