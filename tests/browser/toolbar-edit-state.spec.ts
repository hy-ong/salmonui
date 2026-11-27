import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, installDevtools, openGrid } from './helpers.ts';

// Toolbar edit items follow the edit state, the reactive `DataGridToolbarItem.disabled`, and the
// batch confirm prompts: `confirmSave` before a toolbar Save, the
// batch-cancel discard prompt, and `confirmDiscard: false`.

const SMALL = `${DEV_URL}?rows=2000&cols=10`;
const IDS = ['add', 'edit', 'delete', 'save', 'cancel'] as const;

const cell = (page: Page, rowId: string, columnId: string) => page.locator(`.salmon-data-grid [data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="${columnId}"]`);
const item = (page: Page, id: string) => page.locator(`.salmon-data-grid-toolbar [data-toolbar-item="${id}"]`);
const confirm = (page: Page) => page.locator('dialog.salmon-data-grid-confirm');

/** The ids of the aria-disabled edit items. */
async function disabledItems(page: Page): Promise<string[]> {
  const out: string[] = [];
  for (const id of IDS) if ((await item(page, id).getAttribute('aria-disabled')) === 'true') out.push(id);
  return out;
}

test.describe('toolbar edit-state enablement', () => {
  test('row mode: Edit/Delete need a target row; an open edit disables Add/Edit/Delete and enables Update/Cancel', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&edit=row&etoolbar&sel=multiple`);
    await expect.poll(() => disabledItems(page)).toEqual(['edit', 'delete', 'save', 'cancel']);
    await cell(page, 'r1', 's1').click();
    await expect.poll(() => disabledItems(page)).toEqual(['save', 'cancel']);
    await page.keyboard.press('F2');
    await expect(page.locator('.salmon-data-grid .salmon-data-grid-editor').first()).toBeVisible();
    await expect.poll(() => disabledItems(page)).toEqual(['add', 'edit', 'delete']);
    // A disabled item does nothing: Add while the row edits adds no row.
    // (`force`: Playwright treats aria-disabled items as not clickable.)
    await item(page, 'add').click({ force: true });
    expect(await page.evaluate(() => window.__gridApi.getPendingChanges().addedRecords.length)).toBe(0);
    // Toolbar Cancel ends the edit; the items flip back.
    await item(page, 'cancel').click();
    await expect(page.locator('.salmon-data-grid .salmon-data-grid-editor')).toHaveCount(0);
    await expect.poll(() => disabledItems(page)).toEqual(['save', 'cancel']);
    // Toolbar Edit starts the edit again; toolbar Update saves it.
    await item(page, 'edit').click();
    await expect.poll(() => disabledItems(page)).toEqual(['add', 'edit', 'delete']);
    await item(page, 'save').click();
    await expect.poll(() => disabledItems(page)).toEqual(['save', 'cancel']);
    expect(problems).toEqual([]);
  });

  test('batch mode: Update/Cancel enable with pending changes; the change does not re-render body cells', async ({ page }) => {
    await installDevtools(page);
    await openGrid(page, `${SMALL}&edit=batch&etoolbar&enodiscard&sel=multiple`);
    await cell(page, 'r1', 's2').click();
    await expect.poll(() => disabledItems(page)).toEqual(['save', 'cancel']);
    await page.evaluate(() => (window.__commits.length = 0));
    await page.evaluate(() => window.__gridApi.updateCell('r1', 's2', 'changed'));
    await expect.poll(() => disabledItems(page)).toEqual([]);
    const cells = await page.evaluate(() => [...new Set(window.__commits.flatMap((c) => c.cells))]);
    expect(cells.length).toBeLessThanOrEqual(3);
    // confirmDiscard: false — toolbar Cancel discards at once, no prompt.
    await item(page, 'cancel').click();
    await expect(confirm(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.__gridApi.hasUnsavedChanges())).toBe(false);
    await expect.poll(() => disabledItems(page)).toEqual(['save', 'cancel']);
  });

  test('editing add / edit / delete false disable their toolbar items; the item does nothing', async ({ page }) => {
    await openGrid(page, `${SMALL}&edit=row&etoolbar&sel=multiple`);
    await cell(page, 'r1', 's1').click();
    await expect.poll(() => disabledItems(page)).toEqual(['save', 'cancel']);
    await page.evaluate(() => (window as unknown as { __setExtra(p: unknown): void }).__setExtra({ editing: { mode: 'row', add: false, edit: false, delete: false } }));
    await expect.poll(() => disabledItems(page)).toEqual(['add', 'edit', 'delete', 'save', 'cancel']);
    await item(page, 'delete').click({ force: true });
    await item(page, 'add').click({ force: true });
    await expect(confirm(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.__gridApi.getPendingChanges().addedRecords.length)).toBe(0);
    expect(await page.evaluate(() => window.__gridApi.getRowInfo('r1') !== undefined)).toBe(true);
    await page.evaluate(() => (window as unknown as { __setExtra(p: unknown): void }).__setExtra({ editing: { mode: 'row', add: true, edit: true, delete: false } }));
    await expect.poll(() => disabledItems(page)).toEqual(['delete', 'save', 'cancel']);
  });

  test('DataGridToolbarItem.disabled is reactive', async ({ page }) => {
    await openGrid(page, `${SMALL}&edit=row`);
    await page.evaluate(() => (window as unknown as { __setExtra(p: unknown): void }).__setExtra({ toolbar: ['add', { id: 'mine', label: 'Mine', disabled: true }] }));
    await expect(item(page, 'mine')).toHaveAttribute('aria-disabled', 'true');
    await page.evaluate(() => (window as unknown as { __setExtra(p: unknown): void }).__setExtra({ toolbar: ['add', { id: 'mine', label: 'Mine', disabled: false }] }));
    await expect(item(page, 'mine')).not.toHaveAttribute('aria-disabled', 'true');
    await page.evaluate(() => (window as unknown as { __setExtra(p: unknown): void }).__setExtra({ toolbar: [{ id: 'add', disabled: true }] }));
    await expect(item(page, 'add')).toHaveAttribute('aria-disabled', 'true');
  });
});

test.describe('batch confirm prompts', () => {
  test('confirmSave (default on): toolbar Update asks before saving the batch; Cancel keeps, OK saves', async ({ page }) => {
    await openGrid(page, `${SMALL}&edit=batch&etoolbar`);
    await page.evaluate(() => window.__gridApi.updateCell('r1', 's2', 'saved?'));
    await item(page, 'save').click();
    await expect(confirm(page)).toBeVisible();
    await expect(confirm(page)).toHaveAttribute('data-kind', 'save');
    await expect(confirm(page)).toContainText('Save all pending changes?');
    await expect(confirm(page).locator('[data-confirm="cancel"]')).toBeFocused();
    await confirm(page).locator('[data-confirm="cancel"]').click();
    await expect(confirm(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.__gridApi.hasUnsavedChanges())).toBe(true);
    await item(page, 'save').click();
    await confirm(page).locator('[data-confirm="ok"]').click();
    await expect(confirm(page)).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__gridApi.hasUnsavedChanges())).toBe(false);
    expect(await page.evaluate(() => (window.__gridApi.getRowInfo('r1')?.row as Record<string, unknown>)['s2'])).toBe('saved?');
  });

  test('batch cancel: toolbar Cancel asks to discard (default confirmDiscard); OK discards', async ({ page }) => {
    await openGrid(page, `${SMALL}&edit=batch&etoolbar`);
    await page.evaluate(() => window.__gridApi.updateCell('r1', 's2', 'drop me'));
    await item(page, 'cancel').click();
    await expect(confirm(page)).toHaveAttribute('data-kind', 'discard');
    await expect(confirm(page)).toContainText('Discard all unsaved changes?');
    await page.keyboard.press('Escape');
    await expect(confirm(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.__gridApi.hasUnsavedChanges())).toBe(true);
    await item(page, 'cancel').click();
    await confirm(page).locator('[data-confirm="ok"]').click();
    await expect.poll(() => page.evaluate(() => window.__gridApi.hasUnsavedChanges())).toBe(false);
    await expect(cell(page, 'r1', 's2')).not.toHaveAttribute('data-dirty', '');
  });
});
