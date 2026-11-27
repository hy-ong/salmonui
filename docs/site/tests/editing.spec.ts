import { expect, test, type Page } from '@playwright/test';

// Editing demo: a lookup column edits its key with a select of the
// lookup rows, the custom `renderEditor` takes focus with the
// `inputProps`, and the toolbar Add item adds a row with the column defaults.

async function open(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto('/demos/data-grid/editing');
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  return problems;
}

const cell = (page: Page, rowId: string, columnId: string) => page.locator(`.salmon-data-grid [data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="${columnId}"]`);

test('lookup select editor and custom editor in row mode', async ({ page }) => {
  const problems = await open(page);
  await cell(page, 'ORD-10001', 'category').dblclick();
  const select = cell(page, 'ORD-10001', 'category').locator('select');
  await expect(select).toBeFocused();
  await expect(select.locator('option')).toHaveText(['Coffee beans', 'Loose tea', 'Brewing equipment']);
  await select.selectOption({ label: 'Loose tea' });
  const note = cell(page, 'ORD-10001', 'note').locator('input');
  await note.fill('Leave at door');
  await note.press('Enter');
  await expect(page.locator('.salmon-data-grid-editor')).toHaveCount(0);
  await expect(cell(page, 'ORD-10001', 'category')).toHaveText('Loose tea');
  await expect(cell(page, 'ORD-10001', 'note')).toHaveText('Leave at door');
  expect(problems).toEqual([]);
});

test('toolbar Add adds a row with default values; Escape removes it', async ({ page }) => {
  const problems = await open(page);
  await page.getByRole('toolbar').getByRole('button', { name: 'Add' }).click();
  const added = page.locator('.salmon-data-grid-added-rows [data-new]');
  await expect(added).toHaveCount(1);
  await expect(added.locator('[data-column-id="quantity"] input')).toHaveValue('1');
  await page.keyboard.press('Escape');
  await expect(added).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('dialog mode opens a native dialog sized by dialogProps', async ({ page }) => {
  const problems = await open(page);
  await page.locator('.demo-toolbar').getByRole('combobox', { name: 'mode', exact: true }).click();
  await page.getByRole('option', { name: 'dialog', exact: true }).click();
  await cell(page, 'ORD-10001', 'customer').dblclick();
  const dialog = page.locator('dialog[open]');
  await expect(dialog).toBeVisible();
  expect(Math.round((await dialog.boundingBox())?.width ?? 0)).toBe(520);
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  expect(problems).toEqual([]);
});
