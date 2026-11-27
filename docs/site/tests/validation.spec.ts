import { expect, test, type Page } from '@playwright/test';

// Validation rules demo: built-in rules, async custom validator,
// per-rule and localized messages, inline messages,
// row rule and validateBatch.

async function open(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto('/demos/data-grid/validation');
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  return problems;
}

const grid = (page: Page) => page.locator('.salmon-data-grid');
const cell = (page: Page, rowId: string, columnId: string) => grid(page).locator(`[data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="${columnId}"]`);
const editor = (page: Page, rowId: string, columnId: string) => cell(page, rowId, columnId).locator('input');

/** Double click opens the editor of that cell, even when the focusing first press scrolls it into view. */
async function startEdit(page: Page, rowId: string, columnId: string): Promise<void> {
  await cell(page, rowId, columnId).dblclick();
}

/** Types into the row editor of `columnId` and returns its accessible description. */
async function typeInto(page: Page, rowId: string, columnId: string, value: string): Promise<string> {
  const input = editor(page, rowId, columnId);
  await input.fill(value);
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  const id = (await input.getAttribute('aria-describedby')) ?? '';
  return (await page.locator(`[id="${id.split(' ')[0]}"]`).textContent()) ?? '';
}

test('built-in rules show localized and per-rule messages inline and block the save', async ({ page }) => {
  const problems = await open(page);
  await startEdit(page, 'S-01', 'name');
  expect(await typeInto(page, 'S-01', 'name', '')).toContain('Required.');
  expect(await typeInto(page, 'S-01', 'name', 'Ko')).toContain('At least 3 characters.');
  expect(await typeInto(page, 'S-01', 'name', 'A name that is far too long')).toContain('Keep the name under 20 characters.');
  expect(await typeInto(page, 'S-01', 'email', 'not-an-email')).toContain('valid email');
  expect(await typeInto(page, 'S-01', 'website', 'kopi')).toContain('valid URL');
  expect(await typeInto(page, 'S-01', 'phone', 'call me')).toContain('phone');
  expect(await typeInto(page, 'S-01', 'card', '1234')).toContain('credit card');
  expect(await typeInto(page, 'S-01', 'code', 'kop101')).toContain('ABC-123');
  expect(await typeInto(page, 'S-01', 'zip', '12a')).toMatch(/digits|Exactly/);
  expect(await typeInto(page, 'S-01', 'since', '01/04/2019')).toContain('ISO');
  expect(await typeInto(page, 'S-01', 'rating', '9')).toContain('between 1 and 5');
  expect(await typeInto(page, 'S-01', 'minOrder', '0')).toContain('greater than or equal to 1');
  // Enter refuses to save while invalid; the editor stays open.
  await editor(page, 'S-01', 'minOrder').press('Enter');
  await expect(grid(page).locator('.salmon-data-grid-editor').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(cell(page, 'S-01', 'name')).toHaveText('Kopi Roasters');
  expect(problems).toEqual([]);
});

test('async custom validator and row rule', async ({ page }) => {
  const problems = await open(page);
  await startEdit(page, 'S-02', 'voucher');
  // The async validator runs when the row saves; the save waits for it and refuses.
  await editor(page, 'S-02', 'voucher').fill('welcome');
  await editor(page, 'S-02', 'voucher').press('Enter');
  await expect(editor(page, 'S-02', 'voucher')).toHaveAttribute('aria-invalid', 'true');
  await expect(grid(page).getByText('Voucher WELCOME was already redeemed.').first()).toBeAttached();
  await editor(page, 'S-02', 'voucher').fill('FRESH');
  // Row rule: a five-star supplier above 50.
  await editor(page, 'S-02', 'minOrder').fill('80');
  await editor(page, 'S-02', 'minOrder').press('Enter');
  // The row editor stays open and the row-level message is announced beside the grid.
  await expect(grid(page).locator('.salmon-data-grid-editor').first()).toBeVisible();
  await expect(page.locator('.salmon-data-grid-row-errors[role="alert"]')).toHaveText('Row 2: Five-star suppliers take orders of 50 or less.');
  await editor(page, 'S-02', 'minOrder').fill('40');
  await editor(page, 'S-02', 'minOrder').press('Enter');
  await expect(grid(page).locator('.salmon-data-grid-editor')).toHaveCount(0);
  await expect(cell(page, 'S-02', 'voucher')).toHaveText('FRESH');
  expect(problems).toEqual([]);
});

test('batch mode: an invalid cell keeps its editor; validateBatch and save refuse a row rule', async ({ page }) => {
  const problems = await open(page);
  await page.locator('.demo-toolbar').getByRole('combobox', { name: 'mode', exact: true }).click();
  await page.getByRole('option', { name: 'batch', exact: true }).click();
  await startEdit(page, 'S-03', 'rating');
  await editor(page, 'S-03', 'rating').fill('7');
  await page.keyboard.press('Tab');
  // An invalid cell does not commit: its editor stays.
  await expect(editor(page, 'S-03', 'rating')).toHaveAttribute('aria-invalid', 'true');
  await page.keyboard.press('Escape');
  await expect(cell(page, 'S-03', 'rating')).toHaveText('3');
  // Valid cells, invalid row: the row rule runs on validateBatch() and save().
  await startEdit(page, 'S-02', 'minOrder');
  await editor(page, 'S-02', 'minOrder').fill('80');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Escape');
  await expect(cell(page, 'S-02', 'minOrder')).toHaveAttribute('data-dirty', /.*/);
  await page.getByRole('button', { name: 'validateBatch()' }).click();
  await expect(page.getByRole('log')).toContainText('validateBatch: invalid');
  await page.getByRole('button', { name: 'save()', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('save: rejected');
  await expect(page.locator('.salmon-data-grid-row-errors[role="alert"]')).toHaveText('Row 2: Five-star suppliers take orders of 50 or less.');
  expect(problems).toEqual([]);
});
