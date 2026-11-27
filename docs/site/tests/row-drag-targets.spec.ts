import { expect, test, type Locator, type Page } from '@playwright/test';

// Drop targets and persisted order: a drop onto a custom element hands the
// rows to `onRowDrop`; a reorder writes new `orderField` values
// through dataSource.write.

async function open(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto('/demos/data-grid/row-drag-targets');
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  return problems;
}

const grid = (page: Page, name: string) => page.getByRole('grid', { name });
const handle = (page: Page, gridName: string, rowId: string) => grid(page, gridName).locator(`[data-row-id="${rowId}"] .salmon-data-grid-row-drag-handle`);

/** Pointer drag in small steps (the controller samples one move per frame). */
async function drag(page: Page, from: Locator, to: { x: number; y: number }): Promise<void> {
  const box = await from.boundingBox();
  if (!box) throw new Error('drag source not visible');
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(start.x + ((to.x - start.x) * i) / 12, start.y + ((to.y - start.y) * i) / 12);
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
}

test('dropping on a custom element hands the rows to onRowDrop', async ({ page }) => {
  const problems = await open(page);
  const zone = await page.locator('#row-drag-archive').boundingBox();
  if (!zone) throw new Error('drop zone not visible');
  await drag(page, handle(page, 'Inbox', 'M-2'), { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 });
  await expect(page.getByRole('log')).toContainText('archived M-2 (dropped on #row-drag-archive)');
  await expect(grid(page, 'Inbox').locator('[data-row-id="M-2"]')).toHaveCount(0);
  await expect(page.locator('#row-drag-archive')).toContainText('M-2');
  expect(problems).toEqual([]);
});

test('a reorder writes new rank values through dataSource.write', async ({ page }) => {
  const problems = await open(page);
  const target = await grid(page, 'Ranked tasks').locator('[data-row-id="T-1"]').boundingBox();
  if (!target) throw new Error('target row not visible');
  // Drag T-4 above T-1.
  await drag(page, handle(page, 'Ranked tasks', 'T-4'), { x: target.x + 120, y: target.y + 4 });
  await expect(page.getByRole('log')).toContainText('write: moved T-4; changed T-4.rank=');
  const rank = Number(/T-4\.rank=(-?[\d.]+)/.exec((await page.getByRole('log').textContent()) ?? '')?.[1]);
  expect(rank).toBeLessThan(10);
  // Sorted by rank, T-4 is now first.
  await expect(grid(page, 'Ranked tasks').locator('[data-row-id]').first()).toHaveAttribute('data-row-id', 'T-4');
  await expect(grid(page, 'Ranked tasks').locator('[data-row-id="T-4"] [data-column-id="rank"]')).toHaveText(String(rank));
  expect(problems).toEqual([]);
});
