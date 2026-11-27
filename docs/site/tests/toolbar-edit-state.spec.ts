import { expect, test, type Page } from '@playwright/test';

// Toolbar demo with "Edit items": the edit items follow the edit
// state. Editing demo in batch mode: the toolbar Save asks first
// (`confirmSave`), Cancel asks before it discards (`confirmDiscard`).

async function open(page: Page, path: string): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto(path);
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  return problems;
}

const toolbarButton = (page: Page, name: string) => page.getByRole('toolbar').getByRole('button', { name, exact: true });

test('toolbar demo: edit items follow the selection and the open edit', async ({ page }) => {
  const problems = await open(page, '/demos/data-grid/toolbar');
  await page.getByLabel('Edit items (follow the edit state)').check();
  await expect(toolbarButton(page, 'Add')).not.toHaveAttribute('aria-disabled', 'true');
  for (const name of ['Edit', 'Delete', 'Save', 'Cancel']) await expect(toolbarButton(page, name)).toHaveAttribute('aria-disabled', 'true');
  await page.locator('.salmon-data-grid-rows [data-row-id]:not([data-row-id^="__g"]) .salmon-data-grid-cell[data-column-id="customer"]').first().click();
  await expect(toolbarButton(page, 'Edit')).not.toHaveAttribute('aria-disabled', 'true');
  await toolbarButton(page, 'Edit').click();
  await expect(page.locator('.salmon-data-grid-editor').first()).toBeVisible();
  for (const name of ['Add', 'Edit', 'Delete']) await expect(toolbarButton(page, name)).toHaveAttribute('aria-disabled', 'true');
  for (const name of ['Save', 'Cancel']) await expect(toolbarButton(page, name)).not.toHaveAttribute('aria-disabled', 'true');
  await toolbarButton(page, 'Cancel').click();
  await expect(page.locator('.salmon-data-grid-editor')).toHaveCount(0);
  await expect(toolbarButton(page, 'Save')).toHaveAttribute('aria-disabled', 'true');
  expect(problems).toEqual([]);
});

test('editing demo, batch mode: Save asks first (confirmSave), Cancel asks to discard', async ({ page }) => {
  const problems = await open(page, '/demos/data-grid/editing');
  await page.locator('.demo-toolbar').getByRole('combobox', { name: 'mode', exact: true }).click();
  await page.getByRole('option', { name: 'batch', exact: true }).click();
  const dirty = page.locator('.salmon-data-grid-cell[data-dirty]');
  const target = page.locator('.salmon-data-grid [data-row-id="ORD-10001"] .salmon-data-grid-cell[data-column-id="note"]');
  await target.dblclick();
  await target.locator('input').fill('Batch note');
  await target.locator('input').press('Tab');
  // Tab committed the cell and opened the next one; Escape closes that one (the batch keeps the change).
  await page.keyboard.press('Escape');
  await expect(page.locator('.salmon-data-grid-editor')).toHaveCount(0);
  await expect(dirty.first()).toBeVisible();
  const confirm = page.locator('dialog.salmon-data-grid-confirm');
  await toolbarButton(page, 'Save').click();
  await expect(confirm).toHaveAttribute('data-kind', 'save');
  await confirm.locator('[data-confirm="cancel"]').click();
  await expect(dirty.first()).toBeVisible();
  await toolbarButton(page, 'Cancel').click();
  await expect(confirm).toHaveAttribute('data-kind', 'discard');
  await confirm.locator('[data-confirm="ok"]').click();
  await expect(dirty).toHaveCount(0);
  expect(problems).toEqual([]);
});
