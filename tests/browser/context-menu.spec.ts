import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// ContextMenu behavior: opening inputs, point placement with collision handling and
// RTL, per-target items, cancellable events, submenus, long menus and focus
// return. Page: examples/vite-spa/menubar.html.

const URL = `${DEV_URL}menubar.html`;
type Events = unknown[][];

const events = (page: Page) => page.evaluate(() => (window as unknown as { __events: Events }).__events);
const clearEvents = (page: Page) => page.evaluate(() => void ((window as unknown as { __events: Events }).__events.length = 0));
const focusedText = (page: Page) => page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
const focusedId = (page: Page) => page.evaluate(() => document.activeElement?.id ?? '');
const menu = (page: Page) => page.locator('[role="menu"][aria-label="Canvas actions"]');
const box = async (page: Page, selector: string) => (await page.locator(selector).boundingBox())!;

async function open(page: Page, query = ''): Promise<string[]> {
  const problems = collectProblems(page);
  await page.goto(`${URL}${query ? `?${query}` : ''}`);
  await expect(page.locator('#canvas')).toBeVisible();
  return problems;
}

/** Right-click at an offset inside an element; returns the viewport point. */
async function rightClick(page: Page, selector: string, dx = 40, dy = 30): Promise<{ x: number; y: number }> {
  const b = await box(page, selector);
  const x = Math.round(b.x + dx);
  const y = Math.round(b.y + dy);
  await page.mouse.click(x, y, { button: 'right' });
  return { x, y };
}

test.describe('ContextMenu opening', () => {
  test('right-click on the wrapped target opens role="menu" at the pointer with the Menu entries; Escape restores focus', async ({ page }) => {
    const problems = await open(page);
    await page.focus('#canvas');
    const at = await rightClick(page, '#canvas', 200, 100);
    const m = menu(page);
    await expect(m).toBeVisible();
    await expect(m).toHaveAttribute('data-placed', '');
    const b = (await m.boundingBox())!;
    expect(Math.abs(b.x - at.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(b.y - at.y)).toBeLessThanOrEqual(1);
    await expect(m.locator('[role="menuitem"]')).toHaveText(['Cut', '©Copy Ctrl+C', 'Paste', 'Docs', 'Arrange']);
    await expect(m.locator('.custom-label')).toHaveText('Copy');
    await expect(m.locator('[data-item-id="disabled"]')).toHaveAttribute('aria-disabled', 'true');
    await expect(m.locator('a[role="menuitem"][data-item-id="docs"]')).toHaveAttribute('href', '#docs');
    await expect(m.locator('[role="separator"]')).toHaveCount(1);
    await expect(m.locator('#arrange')).toHaveAttribute('aria-haspopup', 'menu');
    expect(await focusedText(page)).toBe('Cut');
    await expect(page.locator('#canvas')).toHaveAttribute('data-open', '');
    await page.keyboard.press('Escape');
    await expect(m).toHaveCount(0);
    expect(await focusedId(page)).toBe('canvas');
    expect(await events(page)).toEqual([
      ['beforeOpen', 'canvas', 'pointer', true, true],
      ['open', true, 'trigger', 'pointer'],
      ['beforeClose', 'escape', 'keyboard'],
      ['open', false, 'escape', 'keyboard'],
    ]);
    expect(problems).toEqual([]);
  });

  test('Shift+F10 and the ContextMenu key open the menu from the focused element; focus returns to it', async ({ page }) => {
    await open(page);
    await page.focus('#shape-a');
    await page.keyboard.press('Shift+F10');
    await expect(menu(page)).toBeVisible();
    expect(await focusedText(page)).toBe('Delete circle');
    const b = (await menu(page).boundingBox())!;
    const t = await box(page, '#shape-a');
    expect(Math.abs(b.x - t.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(b.y - (t.y + t.height))).toBeLessThanOrEqual(1);
    await page.keyboard.press('Escape');
    expect(await focusedId(page)).toBe('shape-a');
    await page.keyboard.press('ContextMenu');
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press('Escape');
    expect(await focusedId(page)).toBe('shape-a');
    const sources = (await events(page)).filter((e) => e[0] === 'beforeOpen').map((e) => e[2]);
    expect(sources).toEqual(['keyboard', 'keyboard']);
  });

  test('touch long-press of 500 ms opens at the press point; movement beyond 8 px or an early release cancels', async ({ page }) => {
    await open(page);
    const b = await box(page, '#canvas');
    const x = b.x + 250;
    const y = b.y + 80;
    const touch = (type: string, cx: number, cy: number) =>
      page.locator('#canvas').evaluate(
        (el, a) => {
          el.dispatchEvent(new PointerEvent(a.type, { bubbles: true, pointerType: 'touch', isPrimary: true, clientX: a.cx, clientY: a.cy, pointerId: 7 }));
        },
        { type, cx, cy },
      );
    await touch('pointerdown', x, y);
    await page.waitForTimeout(300);
    await expect(menu(page)).toHaveCount(0);
    await touch('pointermove', x + 12, y);
    await page.waitForTimeout(400);
    await expect(menu(page)).toHaveCount(0, { timeout: 0 });
    await touch('pointerdown', x, y);
    await touch('pointerup', x, y);
    await page.waitForTimeout(600);
    await expect(menu(page)).toHaveCount(0, { timeout: 0 });
    await touch('pointerdown', x, y);
    await touch('pointermove', x + 5, y + 5);
    await expect(menu(page)).toBeVisible({ timeout: 2000 });
    const m = (await menu(page).boundingBox())!;
    expect(Math.abs(m.x - x)).toBeLessThanOrEqual(1);
    expect((await events(page)).find((e) => e[0] === 'open')).toEqual(['open', true, 'trigger', 'touch']);
    // The browser's own long-press contextmenu right after is swallowed (no second open, no native menu).
    const prevented = await page.locator('#canvas').evaluate((el) => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
      el.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(prevented).toBe(true);
    expect(Math.abs((await menu(page).boundingBox())!.x - x)).toBeLessThanOrEqual(1);
  });

  test('targetRef attaches to an element the component does not wrap', async ({ page }) => {
    await open(page);
    await rightClick(page, '#external');
    const m = page.locator('[role="menu"][aria-label="Context menu"]');
    await expect(m).toBeVisible();
    await expect(m.locator('[role="menuitem"]')).toHaveText(['External one', 'External two']);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(m).toHaveCount(0);
    expect(await events(page)).toContainEqual(['external', 'ext-2']);
  });
});

test.describe('ContextMenu events', () => {
  test('onBeforeOpen sees the event target: items change per target, preventDefault keeps the browser menu', async ({ page }) => {
    await open(page);
    await rightClick(page, '#shape-a', 10, 5);
    await expect(menu(page).locator('[role="menuitem"]').first()).toHaveText('Delete circle');
    await page.keyboard.press('Escape');
    await rightClick(page, '#shape-b', 10, 5);
    await expect(menu(page).locator('[role="menuitem"]').first()).toHaveText('Delete square');
    await page.keyboard.press('Escape');
    const nativeKept = await page.locator('#native').evaluate((el) => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 });
      el.dispatchEvent(event);
      return !event.defaultPrevented;
    });
    expect(nativeKept).toBe(true);
    await expect(menu(page)).toHaveCount(0);
    const targets = (await events(page)).filter((e) => e[0] === 'beforeOpen').map((e) => e[1]);
    expect(targets).toEqual(['shape-a', 'shape-b', 'native']);
  });

  test('choosing an item: onAction, then onBeforeClose and onOpenChange with reason "action"; onBeforeClose can veto', async ({ page }) => {
    await open(page);
    await rightClick(page, '#canvas', 200, 100);
    await clearEvents(page);
    await menu(page).locator('[data-item-id="cut"]').click();
    await expect(menu(page)).toHaveCount(0);
    expect(await events(page)).toEqual([
      ['action', 'cut', 'pointer'],
      ['beforeClose', 'action', 'pointer'],
      ['open', false, 'action', 'pointer'],
    ]);
    await open(page, 'vetoClose');
    await rightClick(page, '#canvas', 200, 100);
    await page.keyboard.press('Enter');
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu(page)).toHaveCount(0);
  });

  test('an outside press closes with reason "outside"; right-clicking elsewhere on the target reopens there', async ({ page }) => {
    await open(page);
    await rightClick(page, '#canvas', 200, 100);
    const next = await rightClick(page, '#canvas', 20, 120);
    await expect(menu(page)).toBeVisible();
    const b = (await menu(page).boundingBox())!;
    expect(Math.abs(b.x - next.x)).toBeLessThanOrEqual(1);
    await page.mouse.click(5, 5);
    await expect(menu(page)).toHaveCount(0);
    const closes = (await events(page)).filter((e) => e[0] === 'open' && e[1] === false).map((e) => e[2]);
    expect(closes).toEqual(['outside', 'outside']);
  });

  test('right-click inside the open menu does not show the browser menu', async ({ page }) => {
    await open(page);
    await rightClick(page, '#canvas', 200, 100);
    const prevented = await menu(page).locator('[data-item-id="cut"]').evaluate((el) => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      el.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(prevented).toBe(true);
  });
});

test.describe('ContextMenu placement and API', () => {
  test('controlled open with anchorPoint opens at the point; without one at the target corner', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as unknown as { __ctx: (o: boolean, x?: number, y?: number) => void }).__ctx(true, 300, 200));
    const m = page.locator('[role="menu"][aria-label="Context menu"]');
    await expect(m).toHaveAttribute('data-placed', '');
    let b = (await m.boundingBox())!;
    expect([Math.round(b.x), Math.round(b.y)]).toEqual([300, 200]);
    expect(await focusedText(page)).toBe('Controlled one');
    await page.evaluate(() => (window as unknown as { __ctx: (o: boolean) => void }).__ctx(false));
    await expect(m).toHaveCount(0);
    await page.evaluate(() => (window as unknown as { __ctx: (o: boolean) => void }).__ctx(true));
    await expect(m).toHaveAttribute('data-placed', '');
    b = (await m.boundingBox())!;
    const t = await box(page, '#controlled-target');
    expect(Math.abs(b.x - t.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(b.y - (t.y + t.height))).toBeLessThanOrEqual(1);
    await page.keyboard.press('Escape');
    expect(await events(page)).toContainEqual(['controlled', false, 'escape']);
  });

  test('near the viewport edges the menu flips above the point and shifts inside', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await open(page);
    await page.evaluate(() => (window as unknown as { __ctx: (o: boolean, x?: number, y?: number) => void }).__ctx(true, 790, 590));
    const m = page.locator('[role="menu"][aria-label="Context menu"]');
    await expect(m).toHaveAttribute('data-placed', '');
    const b = (await m.boundingBox())!;
    expect(b.y + b.height).toBeLessThanOrEqual(591);
    expect(b.x + b.width).toBeLessThanOrEqual(800 - 7);
    await expect(m).toHaveAttribute('data-placement', /^top/);
  });

  test('RTL: the menu opens toward the inline start of the point and submenus open to the left', async ({ page }) => {
    await open(page, 'dir=rtl');
    const at = await rightClick(page, '#canvas', 300, 60);
    const m = menu(page);
    await expect(m).toHaveAttribute('data-placed', '');
    await expect(m).toHaveAttribute('dir', 'rtl');
    const b = (await m.boundingBox())!;
    expect(Math.abs(b.x + b.width - at.x)).toBeLessThanOrEqual(1);
    await m.locator('#arrange').focus();
    await page.keyboard.press('ArrowLeft');
    const sub = page.locator('[role="menu"][aria-labelledby="arrange"]');
    await expect(sub).toHaveAttribute('data-placed', '');
    const s = (await sub.boundingBox())!;
    const item = (await m.locator('#arrange').boundingBox())!;
    expect(s.x + s.width).toBeLessThanOrEqual(item.x + 1);
    expect(s.x).toBeLessThan(b.x);
    expect(await focusedText(page)).toBe('Bring to front');
  });
});

test.describe('ContextMenu submenus and long menus', () => {
  const hoverArrange = async (page: Page) => {
    await rightClick(page, '#canvas', 200, 20);
    const a = await menu(page).locator('#arrange').boundingBox();
    await page.mouse.move(a!.x + 10, a!.y + a!.height / 2);
    await page.mouse.move(a!.x + 14, a!.y + a!.height / 2);
  };
  const sub = (page: Page) => page.locator('[role="menu"][aria-labelledby="arrange"]');

  test('hover opens a submenu after the default 200 ms hover intent', async ({ page }) => {
    await open(page);
    await hoverArrange(page);
    await page.waitForTimeout(80);
    await expect(sub(page)).toHaveCount(0, { timeout: 0 });
    await expect(sub(page)).toBeVisible({ timeout: 1000 });
  });

  test('hoverDelay changes the hover intent', async ({ page }) => {
    await open(page, 'hoverDelay=700');
    await hoverArrange(page);
    await page.waitForTimeout(400);
    await expect(sub(page)).toHaveCount(0, { timeout: 0 });
    await expect(sub(page)).toBeVisible({ timeout: 1500 });
  });

  test('submenuOpen="click": hover never opens the submenu, a click does', async ({ page }) => {
    await open(page, 'submenuOpen=click');
    await hoverArrange(page);
    await page.waitForTimeout(500);
    await expect(sub(page)).toHaveCount(0, { timeout: 0 });
    await page.mouse.down();
    await page.mouse.up();
    await expect(sub(page)).toBeVisible();
  });

  test('a long menu caps its block size to the viewport and scrolls; End reaches the last item', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await open(page);
    await page.locator('#long').scrollIntoViewIfNeeded();
    await rightClick(page, '#long', 20, 10);
    const m = page.locator('[role="menu"][aria-label="Context menu"]');
    await expect(m).toHaveAttribute('data-placed', '');
    const metrics = await m.evaluate((el) => ({ client: el.clientHeight, scroll: el.scrollHeight, top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom }));
    expect(metrics.scroll).toBeGreaterThan(metrics.client);
    expect(metrics.top).toBeGreaterThanOrEqual(0);
    expect(metrics.bottom).toBeLessThanOrEqual(600);
    await page.keyboard.press('End');
    expect(await focusedText(page)).toBe('Line 199');
    const visible = await page.evaluate(() => {
      const el = document.activeElement!.getBoundingClientRect();
      const list = document.activeElement!.closest('[role="menu"]')!.getBoundingClientRect();
      return el.top >= list.top - 1 && el.bottom <= list.bottom + 1;
    });
    expect(visible).toBe(true);
  });
});

test.describe('ContextMenu SSR', () => {
  test('server markup hydrates without warnings; the menu opens after hydration', async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto(`${URL}?mode=hydrate`);
    await page.waitForFunction(() => (window as unknown as { __hydrated?: boolean }).__hydrated === true);
    const html = await page.evaluate(() => (window as unknown as { __ssrHtml: string }).__ssrHtml);
    expect(html).toContain('class="salmon-context-menu demo-canvas"');
    expect(html).not.toContain('role="menu"');
    await rightClick(page, '#canvas', 200, 100);
    await expect(menu(page)).toBeVisible();
    expect(problems).toEqual([]);
  });
});
