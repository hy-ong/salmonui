import { expect, test, type Page } from '@playwright/test';

// Adaptive demo: on a phone-sized screen the 380 px frame renders
// vertical cards from the server (`defaultActive`); the toolbar Edit item on
// a selected card opens the dialog edit form as a full-screen sheet with a
// labelled close, and a touch swipe scrolls the cards
// natively.

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

async function open(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto('/demos/data-grid/adaptive');
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  return problems;
}

test('toolbar Edit on a selected card opens a full-screen edit sheet; Save updates the card', async ({ page }) => {
  const problems = await open(page);
  const grid = page.locator('.salmon-data-grid');
  await expect(grid).toHaveAttribute('data-row-layout', 'vertical');
  const card = page.locator('.salmon-data-grid-card').nth(1);
  const rowId = (await card.getAttribute('data-row-id')) as string;
  const customer = card.locator('.salmon-data-grid-cell[data-column-id="customer"]');
  await customer.tap();
  await expect(card).toHaveAttribute('aria-selected', 'true');
  // Edit sits in the toolbar, or in its overflow menu (a bottom sheet) when the frame is narrow.
  const toolbar = page.locator('.salmon-data-grid-toolbar');
  const edit = toolbar.getByRole('button', { name: 'Edit', exact: true });
  if (await edit.isVisible()) await edit.tap();
  else {
    await toolbar.locator('.salmon-data-grid-toolbar__more').tap();
    await page.locator('[data-salmon-popover][data-sheet="menu"]').getByRole('menuitem', { name: 'Edit', exact: true }).tap();
  }
  const sheet = page.locator('dialog.salmon-data-grid-edit-dialog');
  await expect(sheet).toHaveAttribute('data-sheet', 'dialog');
  expect(await sheet.boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 });
  await expect(sheet.getByRole('button', { name: 'Close' })).toBeVisible();
  await sheet.getByLabel('Customer', { exact: true }).fill('Sheet Customer');
  await sheet.getByRole('button', { name: 'Save' }).tap();
  await expect(sheet).toHaveCount(0);
  await expect(page.locator(`.salmon-data-grid-card[data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="customer"]`)).toHaveText('Sheet Customer');
  await expect(page.getByRole('log', { name: 'Event log' })).toContainText('save applied');
  expect(problems).toEqual([]);
});

test('a touch swipe scrolls the cards and selects nothing', async ({ page }) => {
  const problems = await open(page);
  const viewport = page.locator('.salmon-data-grid-viewport');
  await viewport.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const box = await viewport.boundingBox();
  if (!box) throw new Error('no viewport');
  // Raw touch points (touchStart, moves, touchEnd) drive the native scroll: the synthetic scroll gesture
  // (`Input.synthesizeScrollGesture`) does not scroll anything in headless Chromium on Linux.
  const x = box.x + box.width / 2;
  const y = Math.min(box.y + box.height, 844) - 40;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 16; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - i * 20 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(200);
  await expect(page.locator('.salmon-data-grid-card[aria-selected="true"]')).toHaveCount(0);
  expect(problems).toEqual([]);
});
