import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, installDevtools, openGrid, PROD_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// Editing UI: inline editors per `editor` type, row / batch / dialog /
// cell modes, the command column, keyboard (F2, Enter, Tab, Shift+Enter,
// Insert, Delete, Escape, Mod+Z), validation messages with aria-invalid /
// aria-describedby, edit marks, confirm prompts, the unsaved-changes guard,
// axe on the editing states, and the React edit budgets
// (editor open, commit, batch save render) on the production build.

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');
const SMALL = `${DEV_URL}?rows=2000&cols=10`;
const PROD_LARGE = `${PROD_URL}?rows=100000&cols=100`;

const cell = (page: Page, rowId: string, columnId: string) => page.locator(`.salmon-data-grid [data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="${columnId}"]`);
const editor = (page: Page) => page.locator('.salmon-data-grid .salmon-data-grid-editor');
const events = (page: Page) => page.evaluate(() => (window as unknown as { __editEvents: { type: string }[] }).__editEvents.map((e) => e.type));
const value = (page: Page, rowId: string, field: string) => page.evaluate(([r, f]) => (window.__gridApi.getRowInfo(r)?.row as Record<string, unknown> | undefined)?.[f], [rowId, field] as const);

async function axeViolations(page: Page): Promise<unknown[]> {
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    const axeApi = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<any> } }).axe;
    const result = await axeApi.run({ include: [['.salmon-data-grid'], ['dialog']] }, { resultTypes: ['violations'], rules: { region: { enabled: false } } });
    return result.violations.map((v: any) => ({ id: v.id, nodes: v.nodes.slice(0, 3).map((n: any) => n.target.join(' ')) }));
  });
}

test.describe('row mode', () => {
  test('F2 opens editors for the row, typing edits, Enter saves and returns focus', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&edit=row`);
    await cell(page, 'r1', 's1').click();
    await page.keyboard.press('F2');
    await expect(page.locator('[data-row-id="r1"]').first()).toHaveAttribute('data-editing', '');
    // Every editable cell of the row has an editor; the key column does not.
    await expect(cell(page, 'r1', 'id').locator('.salmon-data-grid-editor')).toHaveCount(0);
    await expect(cell(page, 'r1', 'n4').locator('input[inputmode="decimal"]')).toHaveCount(1);
    await expect(cell(page, 'r1', 'd7').locator('.salmon-data-grid-date input[type="text"]')).toHaveCount(1);
    await expect(cell(page, 'r1', 'b9').locator('input[type="checkbox"]')).toHaveCount(1);
    const input = cell(page, 'r1', 's1').locator('input');
    await expect(input).toBeFocused();
    await input.fill('edited text');
    await expect(cell(page, 'r1', 's1')).toHaveAttribute('data-dirty', '');
    await page.keyboard.press('Tab');
    await expect(cell(page, 'r1', 's2').locator('input')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(editor(page)).toHaveCount(0);
    expect(await value(page, 'r1', 's1')).toBe('edited text');
    // Focus returns to the cell whose editor had focus.
    await expect(cell(page, 'r1', 's2')).toBeFocused();
    expect(await events(page)).toEqual(['editStart', 'save']);
    expect(problems).toEqual([]);
  });

  test('required rule: aria-invalid, aria-describedby message, commit refused; Escape cancels', async ({ page }) => {
    await openGrid(page, `${SMALL}&edit=row`);
    await cell(page, 'r2', 's1').dblclick();
    const input = cell(page, 'r2', 's1').locator('input');
    await expect(input).toBeFocused();
    const before = await value(page, 'r2', 's1');
    await input.fill('');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    const describedBy = await input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveText('This field is required.');
    await page.keyboard.press('Enter');
    await expect(editor(page).first()).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(editor(page)).toHaveCount(0);
    expect(await value(page, 'r2', 's1')).toBe(before);
    await expect(cell(page, 'r2', 's1')).toBeFocused();
  });

  test('row-level errors (validateRow) block the save and are announced outside the dialog', async ({ page }) => {
    for (const mode of ['row', 'batch', 'cell'] as const) {
      const problems = collectProblems(page);
      await openGrid(page, `${SMALL}&edit=${mode}&erowrule`);
      await cell(page, 'r2', 's1').dblclick();
      const input = cell(page, 'r2', 's1').locator('input');
      await expect(input).toBeFocused();
      await input.fill('ROW');
      await page.keyboard.press('Enter');
      if (mode === 'batch') await page.evaluate(() => void window.__gridApi.save());
      const alert = page.locator('.salmon-data-grid-row-errors[role="alert"]');
      await expect(alert, mode).toHaveText('Row 3: Text 1 cannot be ROW for this row.');
      await expect(page.locator('.salmon-data-grid [data-row-id="r2"]').first(), mode).toHaveAttribute('data-invalid', '');
      expect(await value(page, 'r2', 's1'), mode).not.toBe('ROW');
      expect(await axeViolations(page), mode).toEqual([]);
      expect(problems, mode).toEqual([]);
    }
  });

  test('Insert adds a row at the top, Delete removes rows (confirmDelete prompt)', async ({ page }) => {
    await openGrid(page, `${SMALL}&edit=row&econfirm`);
    await cell(page, 'r0', 's1').click();
    await page.keyboard.press('Insert');
    const added = page.locator('.salmon-data-grid-added-rows [data-new]');
    await expect(added).toHaveCount(1);
    await expect(page.locator('.salmon-data-grid-added-rows .salmon-data-grid-editor input').first()).toBeFocused();
    // The primary key is editable on added rows only.
    await page.locator('.salmon-data-grid-added-rows [data-column-id="id"] input').fill('new-1');
    await page.locator('.salmon-data-grid-added-rows [data-column-id="s1"] input').fill('hello');
    await page.locator('.salmon-data-grid-added-rows [data-column-id="s1"] input').press('Enter');
    await expect(added).toHaveCount(0);
    expect(await value(page, 'new-1', 's1')).toBe('hello');
    await cell(page, 'r5', 's1').click();
    await page.keyboard.press('Delete');
    const confirm = page.locator('dialog.salmon-data-grid-confirm');
    await expect(confirm).toBeVisible();
    await expect(confirm.locator('[data-confirm="cancel"]')).toBeFocused();
    expect(await axeViolations(page)).toEqual([]);
    await confirm.locator('[data-confirm="ok"]').click();
    await expect(confirm).toHaveCount(0);
    expect(await page.evaluate(() => window.__gridApi.getRowInfo('r5'))).toBeUndefined();
  });
});

test.describe('batch mode', () => {
  test('cell editors, Enter moves down, Shift+Enter up, marks, save, undo', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&edit=batch&eundo`);
    await cell(page, 'r1', 's2').click();
    await page.keyboard.press('F2');
    await expect(cell(page, 'r1', 's2').locator('input')).toBeFocused();
    await page.keyboard.type('x');
    await page.keyboard.press('Enter');
    await expect(cell(page, 'r2', 's2').locator('input')).toBeFocused();
    await page.keyboard.press('Shift+Enter');
    await expect(cell(page, 'r1', 's2').locator('input')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(editor(page)).toHaveCount(0);
    await expect(cell(page, 'r1', 's2')).toHaveAttribute('data-dirty', '');
    await expect(page.locator('.salmon-data-grid-rows [data-row-id="r1"]')).toHaveAttribute('data-dirty', '');
    const typed = await page.evaluate(() => window.__gridApi.getPendingChanges().changedRecords.length);
    expect(typed).toBe(1);
    // Delete marks the row until save.
    await cell(page, 'r3', 's1').click();
    await page.keyboard.press('Delete');
    await expect(page.locator('.salmon-data-grid-rows [data-row-id="r3"]')).toHaveAttribute('data-deleted', '');
    // Undo the delete mark (Mod+Z).
    await page.keyboard.press('Control+z');
    await expect(page.locator('.salmon-data-grid-rows [data-row-id="r3"]')).not.toHaveAttribute('data-deleted', '');
    expect(await page.evaluate(() => window.__gridApi.save().status)).toBe('applied');
    await expect(cell(page, 'r1', 's2')).not.toHaveAttribute('data-dirty', '');
    expect(String(await value(page, 'r1', 's2'))).toMatch(/x$/);
    expect(problems).toEqual([]);
  });

  test('guardUnsaved: sorting with unsaved changes asks to discard', async ({ page }) => {
    await openGrid(page, `${SMALL}&edit=batch&qsort`);
    await page.evaluate(() => window.__gridApi.updateCell('r1', 's2', 'changed'));
    await page.locator('.salmon-data-grid-header-cell[data-column-id="s1"]').click();
    const confirm = page.locator('dialog.salmon-data-grid-confirm');
    await expect(confirm).toContainText('Unsaved changes will be lost');
    await confirm.locator('[data-confirm="cancel"]').click();
    await expect(page.locator('.salmon-data-grid-header-cell[data-column-id="s1"]')).not.toHaveAttribute('aria-sort', 'ascending');
    await page.locator('.salmon-data-grid-header-cell[data-column-id="s1"]').click();
    await confirm.locator('[data-confirm="ok"]').click();
    await expect(page.locator('.salmon-data-grid-header-cell[data-column-id="s1"]')).toHaveAttribute('aria-sort', 'ascending');
    expect(await page.evaluate(() => window.__gridApi.hasUnsavedChanges())).toBe(false);
  });

  test('double click on a cell scrolled out of view edits that cell, not its neighbor', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=200&cols=30&edit=batch`);
    // A rendered (overscan) cell entirely past the right edge of the viewport.
    const columnId = await page.evaluate(() => {
      const right = (document.querySelector('.salmon-data-grid-viewport') as HTMLElement).getBoundingClientRect().right;
      const cells = [...document.querySelectorAll<HTMLElement>('.salmon-data-grid-rows [data-row-id="r2"] .salmon-data-grid-cell')];
      return cells.find((c) => c.getBoundingClientRect().left > right + 20)?.dataset['columnId'] ?? null;
    });
    expect(columnId).not.toBeNull();
    // Playwright scrolls the cell into view, then presses twice right away: the
    // focusing first press must not scroll from a stale offset.
    await cell(page, 'r2', columnId as string).dblclick();
    await expect(cell(page, 'r2', columnId as string).locator('.salmon-data-grid-editor')).toHaveCount(1);
    await expect(editor(page)).toHaveCount(1);
    expect(problems).toEqual([]);
  });
});

test.describe('dialog mode and command column', () => {
  test('command Edit opens an accessible modal form; Save writes; Cancel restores focus', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&edit=dialog&ecommands`);
    await cell(page, 'r1', 'commands').locator('[data-command="edit"]').click();
    const dialog = page.locator('dialog.salmon-data-grid-edit-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-labelledby', /.+/);
    const first = dialog.locator('.salmon-data-grid-editor input').first();
    await expect(first).toBeFocused();
    await expect(dialog.getByLabel('Text 1', { exact: true })).toHaveCount(1);
    expect(await axeViolations(page)).toEqual([]);
    await dialog.getByLabel('Text 1', { exact: true }).fill('');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByLabel('Text 1', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await dialog.getByLabel('Text 1', { exact: true }).fill('from dialog');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toHaveCount(0);
    expect(await value(page, 'r1', 's1')).toBe('from dialog');
    // Escape closes without saving.
    await cell(page, 'r2', 'commands').locator('[data-command="edit"]').click();
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Text 1', { exact: true }).fill('discarded');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(await value(page, 'r2', 's1')).not.toBe('discarded');
    expect(problems).toEqual([]);
  });

  test('row-mode command column shows Save and Cancel while the row edits', async ({ page }) => {
    await openGrid(page, `${SMALL}&edit=row&ecommands`);
    const commands = cell(page, 'r4', 'commands');
    await commands.locator('[data-command="edit"]').click();
    await expect(commands.locator('[data-command="save"]')).toBeVisible();
    await expect(commands.locator('[data-command="edit"]')).toHaveCount(0);
    await cell(page, 'r4', 's1').locator('input').fill('cmd save');
    await commands.locator('[data-command="save"]').click();
    expect(await value(page, 'r4', 's1')).toBe('cmd save');
    await expect(commands.locator('[data-command="edit"]')).toBeVisible();
  });
});

test.describe('cell mode', () => {
  test('a cell commit writes at once; Tab moves to the next editable cell', async ({ page }) => {
    await openGrid(page, `${SMALL}&edit=cell`);
    await cell(page, 'r1', 's1').dblclick();
    await cell(page, 'r1', 's1').locator('input').fill('cell mode');
    await page.keyboard.press('Tab');
    await expect(cell(page, 'r1', 's2').locator('input')).toBeFocused();
    expect(await value(page, 'r1', 's1')).toBe('cell mode');
    await page.keyboard.press('Escape');
    await expect(editor(page)).toHaveCount(0);
  });
});

// React edit budgets: production build, 100k x 100 fixture.
test.describe('editing performance (production build)', () => {
  test('editor open, single-cell commit, and batch save render budgets', { tag: '@perf' }, async ({ page }) => {
    await openGrid(page, `${PROD_LARGE}&edit=batch`);
    await cell(page, 'r1', 's1').click();
    const measure = (run: string) =>
      page.evaluate(
        (code) =>
          new Promise<number>((resolve) => {
            requestAnimationFrame(() => {
              const t0 = performance.now();
              // eslint-disable-next-line no-new-func
              new Function(code)();
              const ch = new MessageChannel();
              ch.port1.onmessage = () => resolve(performance.now() - t0);
              ch.port2.postMessage(0);
            });
          }),
        run,
      );
    const open: number[] = [];
    const commit: number[] = [];
    for (let i = 0; i < 9; i++) {
      open.push(await measure(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true }))`));
      await expect(editor(page)).toHaveCount(1);
      commit.push(await measure(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`));
      await expect(editor(page)).toHaveCount(0);
    }
    // 1,000 dirty cells, then one save and its render.
    await page.evaluate(() => {
      for (let r = 0; r < 100; r++) for (let c = 1; c <= 10; c++) window.__gridApi.updateCell(`r${r}`, `s${c % 4 === 0 ? 1 : c % 4}`, `v${r}-${c}`);
    });
    const save = await measure(`window.__gridApi.save()`);
    const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] as number;
    const report = { editorOpen: median(open), editorClose: median(commit), batchSave: save };
    console.log(`edit gates (ms): ${JSON.stringify(report)}`);
    expectBudget(report.editorOpen, 16, 'edit gates editor open median');
    expectBudget(report.editorClose, 16, 'edit gates editor close median');
    expectBudget(report.batchSave, 100, 'edit gates batch save 1,000 dirty cells');
  });

  test('single-cell commit in cell mode re-renders one cell (dev commit records)', async ({ page }) => {
    await installDevtools(page);
    await openGrid(page, `${SMALL}&edit=cell`);
    await cell(page, 'r1', 's1').dblclick();
    await cell(page, 'r1', 's1').locator('input').fill('one cell');
    await page.evaluate(() => (window.__commits.length = 0));
    await page.keyboard.press('Enter');
    await expect(editor(page)).toHaveCount(0);
    const cells = await page.evaluate(() => [...new Set(window.__commits.flatMap((c) => c.cells))]);
    expect(cells).toContain('r1:s1');
    expect(cells.length).toBeLessThanOrEqual(3);
  });
});
