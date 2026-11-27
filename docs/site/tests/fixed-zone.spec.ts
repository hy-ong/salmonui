import { expect, test, type Page } from '@playwright/test';

// The pinned-columns demo's fixed column (`pinned: 'center'`): Product
// scrolls with its slot, then stays after the start-pinned Order column; the
// demo buttons fix and unfix columns at runtime through `api.pinColumn`.

async function open(page: Page, path: string): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`console.${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto(path);
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(250);
  return problems;
}

const header = (page: Page, columnId: string) => page.locator(`.salmon-data-grid [role="columnheader"][data-column-id="${columnId}"]`);

test('pinned-columns demo: the fixed Product column scrolls with its slot, then stays after Order; Fix / Unfix buttons', async ({ page }) => {
  const problems = await open(page, '/demos/data-grid/pinned-columns');
  const vp = page.locator('.salmon-data-grid-viewport').first();
  const x = async (id: string) => (await header(page, id).boundingBox())!.x;
  const order = await header(page, 'id').boundingBox();
  // Slot after Order (110), Customer (150), Country (120) and City (130).
  expect((await x('product')) - order!.x).toBe(110 + 150 + 120 + 130);
  await expect(header(page, 'product').locator('xpath=ancestor::*[contains(@class,"salmon-data-grid-fixed")]')).toHaveCount(1);
  await vp.evaluate((el) => {
    el.scrollLeft = 1000;
  });
  await expect.poll(async () => (await x('product')) - order!.x).toBe(110);
  await page.getByRole('button', { name: 'Fix Note in place' }).click();
  await expect(header(page, 'note').locator('xpath=ancestor::*[contains(@class,"salmon-data-grid-fixed")]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Unfix Product' }).click();
  await expect(header(page, 'product').locator('xpath=ancestor::*[contains(@class,"salmon-data-grid-fixed")]')).toHaveCount(0);
  await expect(page.getByText('pin (api): product center → unpinned')).toHaveCount(1);
  expect(problems).toEqual([]);
});
