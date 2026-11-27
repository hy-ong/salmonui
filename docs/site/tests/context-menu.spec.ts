import { expect, test, type Page } from '@playwright/test';

// Context menu demo: custom items with an icon and a nested submenu.
// Submenus open on hover after a short hover-intent delay, close when the
// pointer rests on a sibling, survive a diagonal path into the submenu, and
// keep the keyboard behavior (ArrowRight opens, ArrowLeft closes).

async function open(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto('/demos/data-grid/context-menu');
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  return problems;
}

const cell = (page: Page, rowId: string, columnId: string) => page.locator(`[role="grid"] [data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="${columnId}"]`);
const menu = (page: Page) => page.getByRole('menu', { name: 'Context menu' });
const submenu = (page: Page) => page.getByRole('menu', { name: 'More' });
const log = (page: Page) => page.getByRole('log', { name: 'Event log' });
const centerOf = async (page: Page, selector: string) => {
  const box = (await page.locator(selector).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

test('context-menu: custom item icon; hover opens the submenu after a delay, a sibling closes it, a click runs a child', async ({ page }) => {
  const problems = await open(page);
  await cell(page, 'ORD-10002', 'customer').click({ button: 'right' });
  await expect(menu(page)).toBeVisible();
  // `icon` renders in the item's icon slot.
  await expect(menu(page).locator('[data-item-id="flag"] .salmon-data-grid-menu__icon')).toHaveText('⚑');
  const more = menu(page).locator('[data-item-id="more"]');
  await expect(more).toHaveAttribute('aria-haspopup', 'menu');
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  // Hover intent: not open right away, open after the delay.
  const at = await centerOf(page, '[data-salmon-popover] [data-item-id="more"]');
  await page.mouse.move(at.x, at.y);
  await page.waitForTimeout(60);
  await expect(submenu(page)).toHaveCount(0);
  await expect(submenu(page)).toBeVisible();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  // Resting on a sibling closes it after the delay.
  const flag = await centerOf(page, '[data-salmon-popover] [data-item-id="flag"]');
  await page.mouse.move(flag.x, flag.y);
  await expect(submenu(page)).toHaveCount(0);
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  // Diagonal path: open again, then cross a sibling on the way into the submenu.
  await page.mouse.move(at.x, at.y);
  await expect(submenu(page)).toBeVisible();
  const child = await centerOf(page, '[data-salmon-popover] [data-item-id="logTarget"]');
  await page.mouse.move(flag.x, flag.y, { steps: 2 });
  await page.mouse.move(child.x, child.y, { steps: 4 });
  await page.waitForTimeout(400);
  await expect(submenu(page)).toBeVisible();
  await page.mouse.click(child.x, child.y);
  await expect(menu(page)).toHaveCount(0);
  await expect(log(page).locator('li', { hasText: 'click (pointer): logTarget on cell ORD-10002 / customer' }).first()).toBeVisible();
  expect(problems).toEqual([]);
});

test('context-menu: the keyboard opens and closes the submenu and runs a child item', async ({ page }) => {
  const problems = await open(page);
  await cell(page, 'ORD-10002', 'customer').click({ button: 'right' });
  await expect(menu(page)).toBeVisible();
  const active = () => page.evaluate(() => document.activeElement?.closest<HTMLElement>('[data-item-id]')?.dataset['itemId'] ?? null);
  for (let i = 0; i < 12 && (await active()) !== 'more'; i++) await page.keyboard.press('ArrowDown');
  expect(await active()).toBe('more');
  await page.keyboard.press('ArrowRight');
  await expect(submenu(page)).toBeVisible();
  expect(await active()).toBe('logTarget');
  await page.keyboard.press('ArrowLeft');
  await expect(submenu(page)).toHaveCount(0);
  expect(await active()).toBe('more');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  expect(await active()).toBe('logRows');
  await page.keyboard.press('Enter');
  await expect(menu(page)).toHaveCount(0);
  await expect(log(page).locator('li', { hasText: 'click (keyboard): logRows on cell ORD-10002 / customer' }).first()).toBeVisible();
  expect(problems).toEqual([]);
});
