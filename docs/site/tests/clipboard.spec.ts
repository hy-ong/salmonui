import { expect, test, type Page } from '@playwright/test';

// Copy and paste demo: range copy as TSV, with headers,
// paste into batch drafts skipping read-only cells, raw
// copy through clipboardFormatter, lookup display text,
// onBeforeCopy / onBeforePaste changing and cancelling the text.

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

async function open(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto('/demos/data-grid/clipboard');
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  return problems;
}

const grid = (page: Page) => page.locator('.salmon-data-grid');
const cell = (page: Page, rowId: string, columnId: string) => grid(page).locator(`[data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="${columnId}"]`);
const lastCopy = (page: Page) => page.getByLabel('Last copy');

async function selectRange(page: Page): Promise<void> {
  await cell(page, 'ORD-10000', 'customer').click();
  await cell(page, 'ORD-10002', 'amount').click({ modifiers: ['Shift'] });
}

test('Ctrl/⌘+C copies the range as TSV: formatted, raw and lookup display text', async ({ page }) => {
  const problems = await open(page);
  await selectRange(page);
  await page.keyboard.press('Control+c');
  await expect(page.getByRole('log')).toContainText('copy: 18 cells from the range');
  const text = await lastCopy(page).inputValue();
  const lines = text.trimEnd().split('\n');
  expect(lines).toHaveLength(3);
  for (const line of lines) {
    const fields = line.split('\t');
    expect(fields).toHaveLength(6);
    expect(['Coffee beans', 'Loose tea', 'Brewing equipment']).toContain(fields[1]); //
    expect(fields[4]).toMatch(/^\$\d+\.\d{2}$/); // formatted
    expect(fields[5]).toMatch(/^\d+\.\d{2}$/); // clipboardFormatter: raw
  }
  // The system clipboard received the same text.
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
  expect(problems).toEqual([]);
});

test('copy({ copyFormatted: false }) copies raw values; clipboardFormatter and lookup display text still apply', async ({ page }) => {
  const problems = await open(page);
  await selectRange(page);
  await page.getByRole('button', { name: 'copy({ copyFormatted: false })' }).click();
  await expect(page.getByRole('log')).toContainText('copy({ copyFormatted: false }): applied');
  const lines = (await lastCopy(page).inputValue()).trimEnd().split('\n');
  expect(lines).toHaveLength(3);
  for (const line of lines) {
    const fields = line.split('\t');
    expect(['Coffee beans', 'Loose tea', 'Brewing equipment']).toContain(fields[1]); //
    expect(fields[4]).toMatch(/^\d+(\.\d+)?$/); // raw number, no currency format
    expect(fields[5]).toMatch(/^\d+\.\d{2}$/); // clipboardFormatter wins
  }
  expect(problems).toEqual([]);
});

test('Ctrl+Shift+H copies with headers; the context menu Copy item writes the clipboard', async ({ page }) => {
  const problems = await open(page);
  await selectRange(page);
  await page.keyboard.press('Control+Shift+H');
  await expect(page.getByRole('log')).toContainText('copy with headers: 18 cells');
  expect((await lastCopy(page).inputValue()).split('\n')[0]).toBe('Customer\tCategory\tCountry (read-only)\tQty\tPrice\tAmount (raw copy)');

  const withoutHeaders = (await lastCopy(page).inputValue()).split('\n').slice(1).join('\n');
  // The context menu item copies the same range (without headers) to the system clipboard.
  await page.evaluate(() => navigator.clipboard.writeText(''));
  await cell(page, 'ORD-10001', 'customer').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Copy' }).click();
  // With `editing` on, lookup columns still copy their display text.
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(withoutHeaders);
  expect(problems).toEqual([]);
});

test('paste fills batch drafts from the focused cell and skips read-only cells', async ({ page }) => {
  const problems = await open(page);
  const country = await cell(page, 'ORD-10005', 'country').innerText();
  await cell(page, 'ORD-10005', 'customer').click();
  await page.getByRole('button', { name: 'Paste the text below' }).click();
  await expect(page.getByRole('log')).toContainText('paste: applied');
  await expect(cell(page, 'ORD-10005', 'customer')).toHaveText('Pasted one');
  await expect(cell(page, 'ORD-10005', 'category')).toHaveText('Loose tea');
  await expect(cell(page, 'ORD-10005', 'country')).toHaveText(country);
  await expect(cell(page, 'ORD-10005', 'quantity')).toHaveText('5');
  await expect(cell(page, 'ORD-10006', 'customer')).toHaveText('Pasted two');
  await expect(cell(page, 'ORD-10006', 'quantity')).toHaveText('6');
  await expect(cell(page, 'ORD-10005', 'customer')).toHaveAttribute('data-dirty', /.*/);

  // Ctrl+V (⌘+V on macOS) reads the system clipboard.
  await page.evaluate(() => navigator.clipboard.writeText('From the keyboard'));
  await cell(page, 'ORD-10008', 'customer').click();
  // Ctrl+V moves focus to the grid's paste textarea and the browser pastes there. A macOS host does
  // not paste on Ctrl+V (the device is a Windows user agent), so the paste event is dispatched there.
  await page.keyboard.down('Control');
  await page.keyboard.down('v');
  await page.evaluate(() => {
    const el = document.activeElement;
    if (!el?.classList.contains('salmon-data-grid-clipboard-input')) return;
    const data = new DataTransfer();
    data.setData('text/plain', 'From the keyboard');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await page.keyboard.up('v');
  await page.keyboard.up('Control');
  await expect(cell(page, 'ORD-10008', 'customer')).toHaveText('From the keyboard');
  expect(problems).toEqual([]);
});

test('onBeforeCopy replaces the text; onBeforePaste cancels the paste', async ({ page }) => {
  const problems = await open(page);
  await page.getByLabel('Copy with semicolons').check();
  await selectRange(page);
  await page.getByRole('toolbar', { name: 'Data Grid toolbar' }).getByRole('button', { name: 'Copy' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/^[^\t]+;[^\t]+;/);
  expect(await lastCopy(page).inputValue()).not.toContain('\t');

  await page.getByLabel('Cancel pastes').check();
  const before = await cell(page, 'ORD-10005', 'customer').innerText();
  await cell(page, 'ORD-10005', 'customer').click();
  await page.getByRole('button', { name: 'Paste the text below' }).click();
  await expect(page.getByRole('log')).toContainText('paste: rejected (cancelled)');
  await expect(cell(page, 'ORD-10005', 'customer')).toHaveText(before);
  expect(problems).toEqual([]);
});
