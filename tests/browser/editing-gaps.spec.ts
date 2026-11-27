import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, openGrid } from './helpers.ts';

// Editing details: double click opt-out,
// toolbar Edit / Delete / Cancel, the dialog render props and dialogProps,
// the datetime editor, editorProps on the built-in editors, Shift+Tab and
// batch Tab, tabToNextRow in row mode, the command Delete button, and redo.
// Runs against examples/vite-spa (`?edit=...` switches, `window.__setExtra`).

const SMALL = `${DEV_URL}?rows=200&cols=10`;

const cell = (page: Page, rowId: string, columnId: string) => page.locator(`.salmon-data-grid [data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="${columnId}"]`);
const row = (page: Page, rowId: string) => page.locator(`.salmon-data-grid-rows [data-row-id="${rowId}"]`).first();
const editor = (page: Page) => page.locator('.salmon-data-grid .salmon-data-grid-editor');
const value = (page: Page, rowId: string, field: string) => page.evaluate(([r, f]) => (window.__gridApi.getRowInfo(r)?.row as Record<string, unknown> | undefined)?.[f], [rowId, field] as const);
const setExtra = (page: Page, patch: Record<string, unknown>) =>
  page.evaluate((p) => (window as unknown as { __setExtra(patch: unknown): void }).__setExtra(p), patch);

/** The app's React module (same Vite dev URL, so the same instance the grid renders with). */
async function exposeReact(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const url = performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .find((n) => /\/\.vite\/deps\/react\.js(\?|$)/.test(n));
    if (!url) throw new Error('react dev module not found');
    const mod = (await import(/* @vite-ignore */ url)) as { default?: unknown };
    (window as unknown as { __React: unknown }).__React = mod.default ?? mod;
  });
}

test.describe('double click', () => {
  test('a double click starts an edit by default; editOnDoubleClick: false stops it, F2 still edits', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&edit=row`);
    await cell(page, 'r1', 's1').dblclick();
    await expect(cell(page, 'r1', 's1').locator('input')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(editor(page)).toHaveCount(0);

    await setExtra(page, { editing: { mode: 'row', editOnDoubleClick: false } });
    await cell(page, 'r2', 's1').dblclick();
    await page.waitForTimeout(100);
    await expect(editor(page)).toHaveCount(0);
    await expect(row(page, 'r2')).not.toHaveAttribute('data-editing', '');
    // The keyboard path is unaffected.
    await page.keyboard.press('F2');
    await expect(cell(page, 'r2', 's1').locator('input')).toBeFocused();
    expect(problems).toEqual([]);
  });
});

test.describe('toolbar items', () => {
  test('toolbar Edit edits the focused row, Cancel discards it, Delete removes the focused row', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&edit=row&chrome`);
    const toolbar = page.locator('.salmon-data-grid-toolbar');
    const before = await value(page, 'r2', 's1');
    await cell(page, 'r2', 's1').click();
    await toolbar.locator('[data-toolbar-item="edit"]').click();
    await expect(row(page, 'r2')).toHaveAttribute('data-editing', '');
    await cell(page, 'r2', 's1').locator('input').fill('toolbar draft');
    await toolbar.locator('[data-toolbar-item="cancel"]').click();
    await expect(editor(page)).toHaveCount(0);
    expect(await value(page, 'r2', 's1')).toBe(before);

    await cell(page, 'r3', 's1').click();
    await toolbar.locator('[data-toolbar-item="delete"]').click();
    await expect(page.locator('.salmon-data-grid-rows [data-row-id="r3"]')).toHaveCount(0);
    expect(await page.evaluate(() => window.__gridApi.getRowInfo('r3'))).toBeUndefined();
    expect(problems).toEqual([]);
  });

  test('batch mode: toolbar Delete marks the row and toolbar Cancel discards the batch after the prompt', async ({ page }) => {
    await openGrid(page, `${SMALL}&edit=batch&chrome`);
    const toolbar = page.locator('.salmon-data-grid-toolbar');
    await cell(page, 'r4', 's1').click();
    await toolbar.locator('[data-toolbar-item="delete"]').click();
    await expect(row(page, 'r4')).toHaveAttribute('data-deleted', '');
    await toolbar.locator('[data-toolbar-item="cancel"]').click();
    const confirm = page.locator('dialog.salmon-data-grid-confirm');
    await expect(confirm).toBeVisible();
    await confirm.locator('[data-confirm="ok"]').click();
    await expect(row(page, 'r4')).not.toHaveAttribute('data-deleted', '');
    expect(await page.evaluate(() => window.__gridApi.hasUnsavedChanges())).toBe(false);
  });
});

test.describe('dialog mode', () => {
  test('dialogProps: title, className, style, showCloseButton', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&edit=dialog&ecommands`);
    const dialog = page.locator('dialog.salmon-data-grid-edit-dialog');
    // Default: localized title and a close button that cancels.
    await cell(page, 'r1', 'commands').locator('[data-command="edit"]').click();
    await expect(dialog).toBeVisible();
    const close = dialog.locator('.salmon-data-grid-edit-dialog__close');
    await expect(close).toHaveCount(1);
    await dialog.getByLabel('Text 1', { exact: true }).fill('closed');
    await close.click();
    await expect(dialog).toHaveCount(0);
    expect(await value(page, 'r1', 's1')).not.toBe('closed');

    await setExtra(page, { editing: { mode: 'dialog', dialogProps: { title: 'Order form', showCloseButton: false, className: 'my-edit-dialog', style: { height: '420px' } } } });
    await cell(page, 'r1', 'commands').locator('[data-command="edit"]').click();
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveClass(/\bmy-edit-dialog\b/);
    await expect(dialog).toHaveClass(/\bsalmon-data-grid-edit-dialog\b/);
    await expect(dialog.locator('.salmon-data-grid-edit-dialog__title')).toHaveText('Order form');
    await expect(page.getByRole('dialog', { name: 'Order form' })).toHaveCount(1);
    await expect(dialog.locator('.salmon-data-grid-edit-dialog__close')).toHaveCount(0);
    expect(await dialog.evaluate((el) => [el.style.height, Math.round(el.getBoundingClientRect().height)])).toEqual(['420px', 420]);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('renderDialog, renderDialogHeader and renderDialogFooter replace the form parts and drive save / cancel', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&edit=dialog&ecommands`);
    await exposeReact(page);
    await page.evaluate(() => {
      const React = (window as unknown as { __React: { createElement: (...a: unknown[]) => unknown } }).__React;
      const h = React.createElement;
      type Ctx = { rowId: string; isNew: boolean; fields: { field: string; label: string; editor: unknown; setValue(v: unknown): void }[]; save(): void; cancel(): void };
      (window as unknown as { __setExtra(p: unknown): void }).__setExtra({
        editing: {
          mode: 'dialog',
          dialogProps: { title: 'Custom form' },
          renderDialogHeader: (ctx: Ctx) => h('h2', { className: 'custom-header' }, `Editing ${ctx.rowId}${ctx.isNew ? ' (new)' : ''}`),
          renderDialog: (ctx: Ctx) =>
            h(
              'div',
              { className: 'custom-body' },
              h('p', { className: 'custom-fields' }, ctx.fields.map((f) => f.field).join(',')),
              ...ctx.fields.filter((f) => f.field === 's1' || f.field === 's2').map((f) => f.editor),
              h('button', { type: 'button', className: 'custom-fill', onClick: () => ctx.fields.find((f) => f.field === 's2')?.setValue('set by ctx') }, 'Fill'),
            ),
          renderDialogFooter: (ctx: Ctx) =>
            h(
              'div',
              { className: 'custom-footer' },
              h('button', { type: 'button', className: 'custom-save', onClick: ctx.save }, 'Apply'),
              h('button', { type: 'button', className: 'custom-cancel', onClick: ctx.cancel }, 'Dismiss'),
            ),
        },
      });
    });
    const dialog = page.locator('dialog.salmon-data-grid-edit-dialog');
    await cell(page, 'r1', 'commands').locator('[data-command="edit"]').click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.custom-header')).toHaveText('Editing r1');
    // A custom header has no built-in title element: the title becomes the accessible name.
    await expect(dialog.locator('.salmon-data-grid-edit-dialog__title')).toHaveCount(0);
    await expect(dialog).toHaveAttribute('aria-label', 'Custom form');
    await expect(dialog.locator('.custom-fields')).toContainText('s1,s2');
    // Only the fields the body renders are present; the built-in footer is replaced.
    await expect(dialog.locator('.salmon-data-grid-editor')).toHaveCount(2);
    await expect(dialog.locator('.salmon-data-grid-dialog__actions')).toHaveCount(0);
    await dialog.getByLabel('Text 1', { exact: true }).fill('');
    await dialog.locator('.custom-save').click();
    // Validation still runs through ctx.save.
    await expect(dialog.getByLabel('Text 1', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await dialog.getByLabel('Text 1', { exact: true }).fill('custom body');
    await dialog.locator('.custom-fill').click();
    await dialog.locator('.custom-save').click();
    await expect(dialog).toHaveCount(0);
    expect(await value(page, 'r1', 's1')).toBe('custom body');
    expect(await value(page, 'r1', 's2')).toBe('set by ctx');

    await cell(page, 'r2', 'commands').locator('[data-command="edit"]').click();
    await expect(dialog.locator('.custom-header')).toHaveText('Editing r2');
    await dialog.getByLabel('Text 1', { exact: true }).fill('dismissed');
    await dialog.locator('.custom-cancel').click();
    await expect(dialog).toHaveCount(0);
    expect(await value(page, 'r2', 's1')).not.toBe('dismissed');
    expect(problems).toEqual([]);
  });
});

test.describe('built-in editors', () => {
  /** id, a datetime column, and columns carrying editorProps. */
  async function editorColumns(page: Page): Promise<void> {
    await setExtra(page, {
      timeZone: 'UTC',
      columns: [
        { field: 'id', header: 'ID', primaryKey: true, width: 90 },
        { field: 'd7', header: 'When', type: 'datetime', width: 220 },
        { field: 's1', header: 'Choice', editor: 'select', width: 160, editorProps: { options: ['alpha', { value: 'b', label: 'Beta' }, 'gamma'], placeholder: '(none)', className: 'my-select' } },
        { field: 'n4', header: 'Amount', type: 'number', editor: 'text', width: 140, editorProps: { className: 'my-number', maxLength: 6, style: { color: 'rgb(255, 0, 0)' } } },
        { field: 's2', header: 'Notes', width: 200, editorProps: { multiline: true, className: 'my-notes', maxLength: 40, spellCheck: false } },
        { field: 'd8', header: 'Due', type: 'date', width: 180, editorProps: { min: '2025-03-10', max: '2025-03-20', className: 'my-date', placeholder: 'due date' } },
      ],
    });
    await expect(page.locator('.salmon-data-grid-header-cell[data-column-id="d7"]')).toContainText('When');
  }

  test('editorProps min / max / step on the number editor and minLength / maxLength on the text editor', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&edit=row`);
    await setExtra(page, {
      columns: [
        { field: 'id', header: 'ID', primaryKey: true, width: 90 },
        { field: 'n4', header: 'Qty', type: 'number', width: 140, editorProps: { min: 0, max: 10, step: 2.5 } },
        { field: 's1', header: 'Code', width: 160, editorProps: { minLength: 2, maxLength: 5 } },
      ],
    });
    await expect(page.locator('.salmon-data-grid-header-cell[data-column-id="n4"]')).toContainText('Qty');
    await page.evaluate(() => window.__gridApi.updateCell('r1', 'n4', 4));
    await cell(page, 'r1', 'n4').dblclick();
    const qty = cell(page, 'r1', 'n4').locator('input');
    await expect(qty).toBeFocused();
    await expect(qty).toHaveAttribute('aria-valuemin', '0');
    await expect(qty).toHaveAttribute('aria-valuemax', '10');
    // ArrowUp / ArrowDown step by `step` and stop at the range.
    await qty.press('ArrowUp');
    await expect(qty).toHaveValue('6.5');
    await qty.press('ArrowUp');
    await qty.press('ArrowUp');
    await expect(qty).toHaveValue('10');
    await qty.press('ArrowDown');
    await expect(qty).toHaveValue('7.5');
    // A typed value outside the range is clamped when the edit is saved.
    await qty.fill('-3');
    const code = cell(page, 'r1', 's1').locator('input');
    await expect(code).toHaveAttribute('minlength', '2');
    await expect(code).toHaveAttribute('maxlength', '5');
    await qty.press('Enter');
    await expect(row(page, 'r1')).not.toHaveAttribute('data-editing', '');
    expect(await page.evaluate(() => (window.__gridApi.getRowInfo('r1')?.row as { n4: number }).n4)).toBe(0);
    // Blur clamps too.
    await cell(page, 'r1', 'n4').dblclick();
    await expect(qty).toBeFocused();
    await qty.fill('42');
    await code.focus();
    await expect(qty).toHaveValue('10');
    await code.press('Enter');
    expect(await page.evaluate(() => (window.__gridApi.getRowInfo('r1')?.row as { n4: number }).n4)).toBe(10);
    expect(problems).toEqual([]);
  });

  test('datetime editor: the date picker text input shows and writes the date and time', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&edit=row`);
    await editorColumns(page);
    const original = (await page.evaluate(() => (window.__gridApi.getRowInfo('r1')?.row as { d7: Date }).d7.toISOString())) as string;
    await cell(page, 'r1', 'd7').dblclick();
    const input = cell(page, 'r1', 'd7').locator('input');
    await expect(input).toBeFocused();
    await expect(cell(page, 'r1', 'd7').locator('.salmon-data-grid-editor')).toHaveAttribute('data-editor', 'datetime');
    // a text input in the locale's numeric order (en-US) with a calendar button.
    await expect(input).toHaveAttribute('type', 'text');
    await expect(input).toHaveAttribute('placeholder', 'mm/dd/yyyy hh:mm');
    await expect(cell(page, 'r1', 'd7').locator('button.salmon-data-grid-date__button')).toHaveAttribute('aria-haspopup', 'dialog');
    // UTC grid: the UTC fields of the value, date and time.
    const [y, mo, d, hm] = [original.slice(0, 4), original.slice(5, 7), original.slice(8, 10), original.slice(11, 16)];
    await expect(input).toHaveValue(`${mo}/${d}/${y} ${hm}`);
    await input.fill('03/04/2025 05:06');
    await page.keyboard.press('Enter');
    await expect(editor(page)).toHaveCount(0);
    expect(await page.evaluate(() => {
      const v = (window.__gridApi.getRowInfo('r1')?.row as { d7: unknown }).d7;
      return v instanceof Date ? v.toISOString() : String(v);
    })).toBe('2025-03-04T05:06:00.000Z');
    expect(problems).toEqual([]);
  });

  test('editorProps reach the built-in editors: select options and placeholder, multiline, date min / max in the picker, className, style, maxLength', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&edit=row`);
    await editorColumns(page);
    await page.evaluate(() => window.__gridApi.updateCell('r1', 'd8', new Date(Date.UTC(2025, 2, 15))));
    await cell(page, 'r1', 's1').dblclick();
    await expect(row(page, 'r1')).toHaveAttribute('data-editing', '');
    // select: placeholder first, then the options (primitive and { value, label }).
    const select = cell(page, 'r1', 's1').locator('select');
    await expect(select).toHaveClass(/\bmy-select\b/);
    expect(await select.locator('option').allTextContents()).toEqual(['(none)', 'alpha', 'Beta', 'gamma']);
    // text editor on a number column: className, style, maxLength.
    const amount = cell(page, 'r1', 'n4').locator('input');
    await expect(amount).toHaveClass(/\bmy-number\b/);
    await expect(amount).toHaveAttribute('maxlength', '6');
    expect(await amount.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(255, 0, 0)');
    // multiline: a textarea with the native attributes.
    const notes = cell(page, 'r1', 's2').locator('textarea');
    await expect(notes).toHaveCount(1);
    await expect(notes).toHaveClass(/\bmy-notes\b/);
    await expect(notes).toHaveAttribute('maxlength', '40');
    await expect(notes).toHaveAttribute('spellcheck', 'false');
    // date: className and placeholder on the text input; min / max disable the picker days outside the range.
    const due = cell(page, 'r1', 'd8').locator('input');
    await expect(due).toHaveClass(/\bmy-date\b/);
    await expect(due).toHaveAttribute('placeholder', 'due date');
    await expect(due).toHaveValue('03/15/2025');
    await due.focus();
    await due.press('Alt+ArrowDown');
    const picker = page.locator('.salmon-data-grid-date-picker__grid');
    await expect(picker).toBeVisible();
    const focusDay = Number(await picker.locator('td[tabindex="0"]').getAttribute('data-day'));
    const day = (offset: number) => picker.locator(`td[data-day="${focusDay + offset}"]`);
    await expect(day(0)).toHaveAttribute('aria-selected', 'true');
    await expect(day(-5)).not.toHaveAttribute('aria-disabled', 'true'); // Mar 10 = min
    await expect(day(-6)).toHaveAttribute('aria-disabled', 'true'); // Mar 9
    await expect(day(5)).not.toHaveAttribute('aria-disabled', 'true'); // Mar 20 = max
    await expect(day(6)).toHaveAttribute('aria-disabled', 'true'); // Mar 21
    // A disabled day is not chosen; an enabled one is.
    await day(6).dispatchEvent('click'); // Playwright refuses to click aria-disabled cells
    await expect(picker).toBeVisible();
    await expect(due).toHaveValue('03/15/2025');
    await day(2).click();
    await expect(picker).toHaveCount(0);
    await expect(due).toHaveValue('03/17/2025');
    // Picking an option writes its value; the placeholder clears it.
    await select.selectOption({ label: 'Beta' });
    await notes.fill('line one\nline two');
    await notes.press('Control+Enter');
    await expect(editor(page)).toHaveCount(0);
    expect(await value(page, 'r1', 's1')).toBe('b');
    expect(await value(page, 'r1', 's2')).toBe('line one\nline two');
    expect(await page.evaluate(() => (window.__gridApi.getRowInfo('r1')?.row as { d8: Date }).d8.toISOString())).toBe('2025-03-17T00:00:00.000Z');
    await cell(page, 'r1', 's1').dblclick();
    await cell(page, 'r1', 's1').locator('select').selectOption({ label: '(none)' });
    await cell(page, 'r1', 's1').locator('select').press('Enter');
    await expect(editor(page)).toHaveCount(0);
    expect(await value(page, 'r1', 's1') ?? null).toBeNull();
    expect(problems).toEqual([]);
  });
});

/** Tabs through the editors of the edited row up to `columnId` (b9 is the last editable cell). */
async function tabTo(page: Page, rowId: string, columnId: string): Promise<void> {
  for (let i = 0; i < 12; i++) {
    if (await cell(page, rowId, columnId).locator('input').evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(cell(page, rowId, columnId).locator('input')).toBeFocused();
}

test.describe('keyboard', () => {
  test('Shift+Tab moves to the previous editable cell in row and batch mode', async ({ page }) => {
    await openGrid(page, `${SMALL}&edit=row`);
    await cell(page, 'r1', 's3').dblclick();
    await expect(cell(page, 'r1', 's3').locator('input')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(cell(page, 'r1', 's2').locator('input')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(cell(page, 'r1', 's1').locator('input')).toBeFocused();
    await expect(row(page, 'r1')).toHaveAttribute('data-editing', '');

    await openGrid(page, `${SMALL}&edit=batch`);
    await cell(page, 'r1', 's2').dblclick();
    await page.keyboard.press('Shift+Tab');
    await expect(cell(page, 'r1', 's1').locator('input')).toBeFocused();
    await expect(editor(page)).toHaveCount(1);
  });

  test('batch Tab saves the cell into the batch before it moves', async ({ page }) => {
    await openGrid(page, `${SMALL}&edit=batch`);
    await cell(page, 'r1', 's1').dblclick();
    await cell(page, 'r1', 's1').locator('input').fill('tabbed');
    await page.keyboard.press('Tab');
    await expect(cell(page, 'r1', 's2').locator('input')).toBeFocused();
    // The left cell has no editor, shows the pending value and is marked dirty; nothing is written yet.
    await expect(cell(page, 'r1', 's1').locator('.salmon-data-grid-editor')).toHaveCount(0);
    await expect(cell(page, 'r1', 's1')).toHaveAttribute('data-dirty', '');
    await expect(cell(page, 'r1', 's1')).toContainText('tabbed');
    expect(await page.evaluate(() => window.__gridApi.getPendingChanges().changedRecords.map((r: Record<string, unknown>) => [r['id'], r['s1']]))).toEqual([['r1', 'tabbed']]);
    expect(await value(page, 'r1', 's1')).not.toBe('tabbed');
  });

  test('row mode tabToNextRow: Tab from the last cell saves the row and edits the next; false stops at the last cell', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&edit=row`);
    await setExtra(page, { editing: { mode: 'row', tabToNextRow: true } });
    await cell(page, 'r1', 's1').dblclick();
    await cell(page, 'r1', 's1').locator('input').fill('first row');
    await tabTo(page, 'r1', 'b9');
    await page.keyboard.press('Tab');
    await expect(cell(page, 'r2', 's0').locator('input')).toBeFocused();
    await expect(row(page, 'r2')).toHaveAttribute('data-editing', '');
    await expect(row(page, 'r1')).not.toHaveAttribute('data-editing', '');
    expect(await value(page, 'r1', 's1')).toBe('first row');
    await page.keyboard.press('Escape');
    await expect(editor(page)).toHaveCount(0);

    // Row mode default (false): Tab from the last cell saves the row and stays on it.
    await setExtra(page, { editing: { mode: 'row', tabToNextRow: false } });
    await cell(page, 'r3', 's1').dblclick();
    await cell(page, 'r3', 's1').locator('input').fill('stops');
    await tabTo(page, 'r3', 'b9');
    await page.keyboard.press('Tab');
    await expect(editor(page)).toHaveCount(0);
    expect(await value(page, 'r3', 's1')).toBe('stops');
    await expect(row(page, 'r4')).not.toHaveAttribute('data-editing', '');
    await expect(cell(page, 'r3', 'b9')).toBeFocused();
    expect(problems).toEqual([]);
  });

  test('batch tabToNextRow: false closes the last cell instead of moving to the next row', async ({ page }) => {
    await openGrid(page, `${SMALL}&edit=batch`);
    await setExtra(page, { editing: { mode: 'batch', tabToNextRow: false } });
    await cell(page, 'r1', 'b9').dblclick();
    await expect(cell(page, 'r1', 'b9').locator('input')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(cell(page, 'r2', 's0').locator('.salmon-data-grid-editor')).toHaveCount(0);
    await expect(editor(page)).toHaveCount(0);
    await expect(cell(page, 'r1', 'b9')).toBeFocused();
  });

  test('redo: Ctrl+Y and api.redo() re-apply an undone batch edit', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&edit=batch&eundo`);
    await cell(page, 'r1', 's1').dblclick();
    await cell(page, 'r1', 's1').locator('input').fill('redo me');
    // Enter keeps the cell in the batch and edits the cell below; Escape closes that untouched editor.
    await page.keyboard.press('Enter');
    await expect(cell(page, 'r2', 's1').locator('input')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(editor(page)).toHaveCount(0);
    await expect(cell(page, 'r1', 's1')).toContainText('redo me');
    await expect(cell(page, 'r2', 's1')).toBeFocused();
    // Undo removes the pending edit; Ctrl+Y re-applies it.
    await page.keyboard.press('Control+z');
    await expect(cell(page, 'r1', 's1')).not.toHaveAttribute('data-dirty', '');
    await expect(cell(page, 'r1', 's1')).not.toContainText('redo me');
    await page.keyboard.press('Control+y');
    await expect(cell(page, 'r1', 's1')).toHaveAttribute('data-dirty', '');
    await expect(cell(page, 'r1', 's1')).toContainText('redo me');
    // The API pair does the same.
    await page.evaluate(() => window.__gridApi.undo());
    await expect(cell(page, 'r1', 's1')).not.toHaveAttribute('data-dirty', '');
    await page.evaluate(() => window.__gridApi.redo());
    await expect(cell(page, 'r1', 's1')).toHaveAttribute('data-dirty', '');
    expect(await page.evaluate(() => window.__gridApi.getPendingChanges().changedRecords.map((r: Record<string, unknown>) => r['s1']))).toEqual(['redo me']);
    expect(problems).toEqual([]);
  });
});

test.describe('command Delete', () => {
  test('the Delete command button removes the row in row mode and marks it in batch mode', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&edit=row&ecommands`);
    await cell(page, 'r5', 'commands').locator('[data-command="delete"]').click();
    await expect(page.locator('.salmon-data-grid-rows [data-row-id="r5"]')).toHaveCount(0);
    expect(await page.evaluate(() => window.__gridApi.getRowInfo('r5'))).toBeUndefined();
    expect(await page.evaluate(() => (window as unknown as { __editEvents: { type: string }[] }).__editEvents.map((e) => e.type))).toContain('delete');

    await openGrid(page, `${SMALL}&edit=batch&ecommands`);
    await cell(page, 'r6', 'commands').locator('[data-command="delete"]').click();
    await expect(row(page, 'r6')).toHaveAttribute('data-deleted', '');
    expect(await page.evaluate(() => window.__gridApi.getPendingChanges().deletedRecords.map((r: Record<string, unknown>) => r['id']))).toEqual(['r6']);
    expect(await page.evaluate(() => window.__gridApi.save().status)).toBe('applied');
    await expect(page.locator('.salmon-data-grid-rows [data-row-id="r6"]')).toHaveCount(0);
    expect(problems).toEqual([]);
  });
});
