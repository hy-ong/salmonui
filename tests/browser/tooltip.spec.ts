import { expect, test, type Page } from '@playwright/test';
import { expectClean } from './axe.ts';
import { collectProblems, DEV_URL } from './helpers.ts';

// Tooltip in the browser. Page: examples/vite-spa/tooltip.html.

const PAGE = `${DEV_URL}tooltip.html`;

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${PAGE}${query}`);
  await page.waitForSelector('#page');
}

const log = (page: Page, id?: string) => page.evaluate((k) => (window.__tooltip ?? []).filter((e) => !k || e['id'] === k), id);
const box = (page: Page, sel: string) => page.locator(sel).evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);
const tip = (page: Page) => page.locator('[role=tooltip]');

test.describe('Tooltip', () => {
  test('hover opens role=tooltip, aria-describedby only while open, Escape closes', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page);
    const save = page.locator('#save');
    await expect(tip(page)).toHaveCount(0);
    await expect(save).toHaveAttribute('aria-describedby', 'save-hint');
    await save.hover();
    await expect(tip(page)).toHaveText('Save the order');
    const id = await tip(page).getAttribute('id');
    await expect(save).toHaveAttribute('aria-describedby', `save-hint ${id}`);
    await page.keyboard.press('Escape');
    await expect(tip(page)).toHaveCount(0);
    await expect(save).toHaveAttribute('aria-describedby', 'save-hint');
    expect(await log(page, 'save')).toEqual([
      { id: 'save', kind: 'change', open: true, reason: 'hover', source: 'pointer' },
      { id: 'save', kind: 'afterOpen' },
      { id: 'save', kind: 'change', open: false, reason: 'escape', source: 'keyboard' },
      { id: 'save', kind: 'afterClose' },
    ]);
    expect(problems).toEqual([]);
  });

  test('keyboard focus opens it, blur closes it; a pointer press closes it', async ({ page }) => {
    await open(page);
    await page.locator('#page').click({ position: { x: 2, y: 2 } });
    await page.keyboard.press('Tab');
    await expect(page.locator('#save')).toBeFocused();
    await expect(tip(page)).toHaveText('Save the order');
    await page.keyboard.press('Tab');
    // Blur closed the Save tooltip; focus on Delete opened its own (no delay for keyboard focus).
    await expect(tip(page)).toHaveText('Delete forever');
    await page.locator('#save').hover();
    await expect(tip(page).filter({ hasText: 'Save the order' })).toBeVisible();
    await page.mouse.down();
    await expect(tip(page).filter({ hasText: 'Save the order' })).toHaveCount(0);
    await page.mouse.up();
  });

  test('WCAG 1.4.13: the content stays open while hovered and closes after closeDelay on leave', async ({ page }) => {
    await open(page);
    await page.locator('#delete').hover();
    await expect(tip(page)).toHaveText('Delete forever');
    const t = await box(page, '[role=tooltip]');
    await page.mouse.move(t.left + t.width / 2, t.top + t.height / 2, { steps: 4 });
    await page.waitForTimeout(400);
    await expect(tip(page)).toBeVisible();
    await page.mouse.move(5, 5);
    await expect(tip(page)).toHaveCount(0);
  });

  test('delay and closeDelay; Tooltip.Provider skips the delay when moving between triggers', async ({ page }) => {
    await open(page);
    await page.locator('#delete').hover();
    await page.waitForTimeout(80);
    await expect(tip(page)).toHaveCount(0);
    await expect(tip(page)).toHaveText('Delete forever');
    await page.mouse.move(5, 5);
    await page.waitForTimeout(60);
    await expect(tip(page)).toHaveCount(1);
    await expect(tip(page)).toHaveCount(0);
    await page.locator('#bold').hover();
    await page.waitForTimeout(200);
    await expect(tip(page)).toHaveCount(0);
    await expect(tip(page)).toHaveText('Bold');
    await page.locator('#italic').hover();
    // Within the provider's skip window the next tooltip opens without the 400 ms delay.
    await expect(tip(page)).toHaveText('Italic', { timeout: 250 });
  });

  test('controlled open; the change callback proposes and the prop decides', async ({ page }) => {
    await open(page);
    await page.locator('#controlled-toggle').click();
    await expect(tip(page)).toHaveText('Controlled tip');
    await page.keyboard.press('Escape');
    await expect(tip(page)).toHaveCount(0);
    expect((await log(page, 'controlled')).map((e) => [e['open'], e['reason']])).toEqual([[false, 'escape']]);
  });

  test('twelve logical placements; start / end mirror in RTL', async ({ page }) => {
    const sides: Record<string, string> = { top: 'top', topStart: 'top', topEnd: 'top', bottom: 'bottom', bottomStart: 'bottom', bottomEnd: 'bottom', start: 'left', startTop: 'left', startBottom: 'left', end: 'right', endTop: 'right', endBottom: 'right' };
    for (const rtl of [false, true]) {
      await open(page, rtl ? '?dir=rtl' : '');
      for (const [p, side] of Object.entries(sides)) {
        await page.locator(`#place-${p}`).hover();
        const expected = rtl && side === 'left' ? 'right' : rtl && side === 'right' ? 'left' : side;
        await expect(tip(page)).toHaveAttribute('data-side', expected);
        const a = await box(page, `#place-${p}`);
        const b = await box(page, '[role=tooltip]');
        if (p.endsWith('Start') && (side === 'top' || side === 'bottom')) expect(Math.abs(Math.round(rtl ? a.right - b.right : b.left - a.left))).toBe(0);
        if (p === 'startTop' || p === 'endTop') expect(Math.abs(Math.round(b.top - a.top))).toBe(0);
        await page.mouse.move(1, 1);
        await expect(tip(page)).toHaveCount(0);
      }
    }
  });

  test('arrow, offsets, content style and contentProps', async ({ page }) => {
    await open(page);
    await page.locator('#save').hover();
    await expect(tip(page).locator('.salmon-tooltip-arrow')).toHaveCount(1);
    await expect(tip(page)).toHaveClass('salmon-tooltip mine');
    await expect(tip(page)).toHaveAttribute('data-test', 'save-tip');
    await expect(tip(page)).toHaveAttribute('title', 'extra');
    await page.mouse.move(1, 1);
    await page.locator('#offset').hover();
    await expect(tip(page).locator('.salmon-tooltip-arrow')).toHaveCount(0);
    const a = await box(page, '#offset');
    const b = await box(page, '[role=tooltip]');
    expect(Math.round(b.top - a.bottom)).toBe(4);
    expect(Math.round(b.left - a.left)).toBe(10);
    expect(Math.round(b.width)).toBe(120);
  });

  test('followCursor moves the tooltip with the pointer without re-rendering', async ({ page }) => {
    await open(page);
    const area = await box(page, '#follow');
    await page.mouse.move(area.left + 20, area.top + 20);
    await expect(tip(page)).toHaveText('Follows the pointer');
    const first = await box(page, '[role=tooltip]');
    await page.mouse.move(area.left + 120, area.top + 40, { steps: 5 });
    await page.waitForTimeout(50);
    const second = await box(page, '[role=tooltip]');
    expect(Math.round(second.left - first.left)).toBe(100);
    expect(Math.round(second.top - first.top)).toBe(20);
  });

  test('collisionBoundary keeps the tooltip inside a container; it is in the top layer', async ({ page }) => {
    await open(page);
    await page.locator('#bounded').hover();
    await expect(tip(page)).toHaveAttribute('data-side', 'left');
    const bounds = await box(page, '#boundary');
    const b = await box(page, '[role=tooltip]');
    expect(b.right).toBeLessThanOrEqual(bounds.right);
    expect(await tip(page).evaluate((el) => el.matches(':popover-open'))).toBe(true);
    expect(await tip(page).getAttribute('popover')).toMatch(/^(hint|manual)$/);
  });

  test('disabled never opens; touch does not open', async ({ browser }) => {
    const context = await browser.newContext({ hasTouch: true });
    const page = await context.newPage();
    await open(page);
    await page.locator('#disabled').hover();
    await page.waitForTimeout(100);
    await expect(tip(page)).toHaveCount(0);
    await page.locator('#save').tap();
    await page.waitForTimeout(100);
    await expect(tip(page)).toHaveCount(0);
    await context.close();
  });

  test('hydration: zero warnings; axe clean open in light, dark and RTL', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, '?hydrate');
    await page.locator('#save').hover();
    await expect(tip(page)).toBeVisible();
    expect(problems).toEqual([]);
    for (const query of ['', '?scheme=dark', '?dir=rtl']) {
      await open(page, query);
      await page.locator('#save').hover();
      await expect(tip(page)).toBeVisible();
      // Let the fade-in finish so axe measures the final colors.
      await page.waitForTimeout(250);
      await expectClean(page, `tooltip open ${query}`);
    }
  });
});
