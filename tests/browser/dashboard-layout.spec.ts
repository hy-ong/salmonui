import { expect, test, type Page } from '@playwright/test';
import { expectClean } from './axe.ts';
import { collectProblems, DEV_URL } from './helpers.ts';

// DashboardLayout in the browser. Page: examples/vite-spa/dashboard-layout.html.
// #main has 6 columns of 150 px with a 10 px gap (160 px pitch) and 60 px
// rows (70 px pitch); its panels start as sales (0,0 2x2, maxW 4),
// traffic (2,0 2x2), pinned (4,0 2x1, static) and notes (0,2 2x1).

const PAGE = `${DEV_URL}dashboard-layout.html`;

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${PAGE}${query}`);
  await page.waitForSelector('#page');
}

const panel = (page: Page, board: string, id: string) => page.locator(`#${board} .salmon-dashboard-panel[data-id="${id}"]`);
/** Committed cell of a panel: [x, y, w, h], 0-based. */
const cell = (page: Page, board: string, id: string) =>
  panel(page, board, id).evaluate((el) => ['x', 'y', 'w', 'h'].map((k, i) => Number((el as HTMLElement).style.getPropertyValue(`--salmon-dashboard-${k}`)) - (i < 2 ? 1 : 0)));
const box = async (page: Page, board: string, id: string) => {
  const grid = (await page.locator(`#${board} .salmon-dashboard-grid`).boundingBox())!;
  const b = (await panel(page, board, id).boundingBox())!;
  return { x: Math.round(b.x - grid.x), y: Math.round(b.y - grid.y), w: Math.round(b.width), h: Math.round(b.height), right: Math.round(grid.x + grid.width - (b.x + b.width)) };
};
const commits = (page: Page) => page.evaluate(() => (window.__dash ?? []).map((l) => Object.fromEntries(l.map((i) => [i.id, [i.x, i.y, i.w, i.h]]))));
const renders = (page: Page) => page.evaluate(() => window.__dashRenders ?? 0);
const live = (page: Page, board = 'main') => page.locator(`#${board} [role="status"]`);

async function press(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.move(x, y);
  await page.mouse.down();
}

test.describe('DashboardLayout', () => {
  test('the server-rendered grid matches the hydrated one, without hydration warnings', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, '?hydrate');
    expect(await box(page, 'main', 'sales')).toMatchObject({ x: 0, y: 0, w: 310, h: 130 });
    expect(await box(page, 'main', 'traffic')).toMatchObject({ x: 320, y: 0, w: 310, h: 130 });
    expect(await box(page, 'main', 'pinned')).toMatchObject({ x: 640, y: 0, w: 310, h: 60 });
    expect(await box(page, 'main', 'notes')).toMatchObject({ x: 0, y: 140, w: 310, h: 60 });
    await expect(panel(page, 'main', 'sales')).toHaveAccessibleName('Sales');
    await expect(panel(page, 'main', 'notes')).toHaveAccessibleName('Notes');
    await expect(page.locator('#main')).toHaveClass('salmon-dashboard board');
    expect(await page.locator('#main .salmon-dashboard-grid').evaluate((el) => getComputedStyle(el).backgroundImage)).toContain('linear-gradient');
    expect(problems).toEqual([]);
  });

  test('a pointer drag moves panels with transforms only, without React renders, and commits once on drop', async ({ page }) => {
    await open(page);
    const s = (await panel(page, 'main', 'sales').boundingBox())!;
    const before = await renders(page);
    await press(page, s.x + 60, s.y + 15);
    await page.mouse.move(s.x + 200, s.y + 15, { steps: 6 });
    await page.mouse.move(s.x + 380, s.y + 15, { steps: 6 });
    expect(await renders(page)).toBe(before);
    await expect(page.locator('#main')).toHaveAttribute('data-active', '');
    await expect(panel(page, 'main', 'sales')).toHaveAttribute('data-dragging', '');
    expect(await panel(page, 'main', 'sales').evaluate((el) => (el as HTMLElement).style.transform)).toBe('translate(320px, 0px)');
    // Traffic is pushed below, notes float into the space sales leaves; both by transform only.
    await expect.poll(() => panel(page, 'main', 'traffic').evaluate((el) => (el as HTMLElement).style.transform)).toBe('translate(0px, 140px)');
    expect(await panel(page, 'main', 'notes').evaluate((el) => (el as HTMLElement).style.transform)).toBe('translate(0px, -140px)');
    expect(await cell(page, 'main', 'traffic')).toEqual([2, 0, 2, 2]);
    await expect(page.locator('#main .salmon-dashboard-placeholder')).toBeVisible();
    expect(await commits(page)).toEqual([]);
    await page.mouse.up();
    expect(await commits(page)).toEqual([{ sales: [2, 0, 2, 2], traffic: [2, 2, 2, 2], pinned: [4, 0, 2, 1], notes: [0, 0, 2, 1] }]);
    await expect(page.locator('#main')).not.toHaveAttribute('data-active', '');
    expect(await box(page, 'main', 'sales')).toMatchObject({ x: 320, y: 0 });
    expect(await box(page, 'main', 'traffic')).toMatchObject({ x: 320, y: 140 });
    expect(await panel(page, 'main', 'traffic').evaluate((el) => (el as HTMLElement).style.transform)).toBe('');
    // The committed value restores the same arrangement (it is the serialized form).
    expect(await cell(page, 'main', 'notes')).toEqual([0, 0, 2, 1]);
  });

  test('static panels stay; Escape cancels a drag; interactive content does not start one', async ({ page }) => {
    await open(page);
    const p = (await panel(page, 'main', 'pinned').boundingBox())!;
    await press(page, p.x + 60, p.y + 15);
    await page.mouse.move(p.x - 200, p.y + 100, { steps: 5 });
    await page.mouse.up();
    const t = (await page.getByRole('button', { name: 'Refresh' }).boundingBox())!;
    await press(page, t.x + 5, t.y + 5);
    await page.mouse.move(t.x - 300, t.y + 5, { steps: 5 });
    await page.mouse.up();
    const s = (await panel(page, 'main', 'sales').boundingBox())!;
    await press(page, s.x + 60, s.y + 15);
    await page.mouse.move(s.x + 380, s.y + 15, { steps: 5 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect(await commits(page)).toEqual([]);
    expect(await box(page, 'main', 'sales')).toMatchObject({ x: 0, y: 0 });
    expect(await panel(page, 'main', 'traffic').evaluate((el) => (el as HTMLElement).style.transform)).toBe('');
    await expect(panel(page, 'main', 'pinned')).toHaveAttribute('data-static', '');
    await expect(panel(page, 'main', 'pinned').locator('.salmon-dashboard-resize')).toHaveCount(0);
  });

  test('resize handles size the panel without renders, clamp to maxW and commit once', async ({ page }) => {
    await open(page);
    const handle = panel(page, 'main', 'sales').locator('.salmon-dashboard-resize[data-edge="bottom-end"]');
    const h = (await handle.boundingBox())!;
    const before = await renders(page);
    await press(page, h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.move(h.x + h.width / 2 + 600, h.y + h.height / 2 + 70, { steps: 8 });
    expect(await renders(page)).toBe(before);
    // maxW 4: 4 x 160 - 10 px.
    expect(await box(page, 'main', 'sales')).toMatchObject({ w: 630, h: 200 });
    await page.mouse.up();
    expect(await commits(page)).toEqual([{ sales: [0, 0, 4, 3], traffic: [2, 3, 2, 2], pinned: [4, 0, 2, 1], notes: [0, 3, 2, 1] }]);
    expect(await box(page, 'main', 'sales')).toMatchObject({ w: 630, h: 200 });
    // The start edge grows the panel toward the inline start.
    const start = panel(page, 'main', 'traffic').locator('.salmon-dashboard-resize[data-edge="start"]');
    const b = (await start.boundingBox())!;
    await press(page, b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.move(b.x - 160, b.y + b.height / 2, { steps: 5 });
    await page.mouse.up();
    expect((await commits(page))[1]?.['traffic']).toEqual([1, 3, 3, 2]);
  });

  test('keyboard pick up, move, resize, drop and cancel, each step announced', async ({ page }) => {
    await open(page);
    const sales = panel(page, 'main', 'sales');
    await expect(sales).toHaveAttribute('aria-roledescription', 'panel');
    await expect(sales).toHaveAccessibleDescription(/Press Enter or Space to pick up the panel/);
    await sales.focus();
    await page.keyboard.press('Enter');
    await expect(sales).toHaveAttribute('data-grabbed', '');
    await expect(live(page)).toContainText('Sales picked up at row 1, column 1.');
    await page.keyboard.press('ArrowRight');
    await expect(live(page)).toHaveText('Sales moved to row 1, column 2.');
    expect((await cell(page, 'main', 'sales'))[0]).toBe(1);
    await page.keyboard.press('Escape');
    await expect(live(page)).toHaveText('Sales returned to row 1, column 1.');
    expect(await cell(page, 'main', 'sales')).toEqual([0, 0, 2, 2]);
    await expect(sales).not.toHaveAttribute('data-grabbed', '');
    expect(await commits(page)).toEqual([]);
    await page.keyboard.press(' ');
    await page.keyboard.press('ArrowDown');
    // Compaction would undo a one-row step, so the panel passes notes.
    await expect(live(page)).toHaveText('Sales moved to row 2, column 1.');
    await page.keyboard.press('Shift+ArrowRight');
    await expect(live(page)).toHaveText('Sales resized to 3 by 2.');
    await page.keyboard.press('Enter');
    await expect(live(page)).toHaveText(/Sales dropped at row \d, column 1\./);
    const committed = await commits(page);
    expect(committed).toHaveLength(1);
    expect(committed[0]?.['sales']?.slice(2)).toEqual([3, 2]);
    await expect(sales).toBeFocused();
    // Static panels are not in the tab order.
    await expect(panel(page, 'main', 'pinned')).not.toHaveAttribute('tabindex', '0');
  });

  test('RTL places column 1 at the inline start and mirrors pointer and arrow keys', async ({ page }) => {
    await open(page, '?dir=rtl');
    expect(await box(page, 'main', 'sales')).toMatchObject({ right: 0, y: 0 });
    expect(await box(page, 'main', 'traffic')).toMatchObject({ right: 320 });
    const sales = panel(page, 'main', 'sales');
    await sales.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowLeft');
    await expect(live(page)).toHaveText('Sales moved to row 1, column 2.');
    await page.keyboard.press('Escape');
    const s = (await sales.boundingBox())!;
    await press(page, s.x + s.width - 60, s.y + 15);
    await page.mouse.move(s.x - 320 + s.width - 60, s.y + 15, { steps: 8 });
    await page.mouse.up();
    expect((await commits(page))[0]?.['sales']).toEqual([2, 0, 2, 2]);
    expect(await box(page, 'main', 'sales')).toMatchObject({ right: 320 });
  });

  test('below stackBelow the panels stack in layout order (container query); dragHandle limits dragging', async ({ page }) => {
    await open(page);
    // 4 columns over 700 px with an 8 px gap; cellAspectRatio 2 makes rows half a column high.
    const two = await box(page, 'stack', 'two');
    const first = await box(page, 'stack', 'one');
    expect(two).toMatchObject({ x: 0, y: 0, w: 346 });
    expect(first).toMatchObject({ x: 354, y: 0, w: 346 });
    expect(Math.abs(first.h - 84.5)).toBeLessThanOrEqual(1);
    expect(Math.abs(two.h - (84.5 * 2 + 8))).toBeLessThanOrEqual(1);
    // Dragging the body does nothing; the header (dragHandle) moves the panel.
    const one = (await panel(page, 'stack', 'one').boundingBox())!;
    await press(page, one.x + 40, one.y + one.height - 10);
    await page.mouse.move(one.x - 300, one.y + one.height - 10, { steps: 5 });
    await page.mouse.up();
    expect(await cell(page, 'stack', 'one')).toEqual([2, 0, 2, 1]);
    await page.locator('#stack-wrap').evaluate((el) => ((el as HTMLElement).style.inlineSize = '500px'));
    await expect.poll(async () => (await box(page, 'stack', 'two')).w).toBe(500);
    expect(await box(page, 'stack', 'one')).toMatchObject({ x: 0, w: 500 });
    expect((await box(page, 'stack', 'one')).y).toBeGreaterThan((await box(page, 'stack', 'two')).y);
    // Grid lines belong to the column grid: a stacked layout draws none.
    const lines = await page.locator('#stack').evaluate((el) => {
      el.setAttribute('data-grid-lines', '');
      const image = getComputedStyle(el.querySelector('.salmon-dashboard-grid')!).backgroundImage;
      el.removeAttribute('data-grid-lines');
      return image;
    });
    expect(lines).toBe('none');
    // Stacked panels are not dragged.
    const header = (await panel(page, 'stack', 'one').locator('.salmon-dashboard-panel-header').boundingBox())!;
    await press(page, header.x + 20, header.y + 5);
    await page.mouse.move(header.x + 20, header.y - 200, { steps: 5 });
    await page.mouse.up();
    expect(await cell(page, 'stack', 'one')).toEqual([2, 0, 2, 1]);
    await page.locator('#stack-wrap').evaluate((el) => ((el as HTMLElement).style.inlineSize = '700px'));
    await expect.poll(async () => (await box(page, 'stack', 'one')).x).toBe(354);
    const h = (await panel(page, 'stack', 'one').locator('.salmon-dashboard-panel-header').boundingBox())!;
    await press(page, h.x + 20, h.y + 5);
    await page.mouse.move(h.x + 20 - 354, h.y + 5, { steps: 6 });
    await page.mouse.up();
    expect((await cell(page, 'stack', 'one')).slice(0, 2)).toEqual([0, 0]);
  });

  test('axe clean in light, dark and RTL, also with a picked-up panel', async ({ page }) => {
    for (const query of ['', '?scheme=dark', '?dir=rtl']) {
      await open(page, query);
      await expectClean(page, `dashboard-layout ${query}`);
    }
    await panel(page, 'main', 'traffic').focus();
    await page.keyboard.press('Enter');
    await expectClean(page, 'dashboard-layout grabbed');
  });
});
