import { expect, test, type Page } from '@playwright/test';
import { expectClean } from './axe.ts';
import { collectProblems, DEV_URL } from './helpers.ts';

// Popover in the browser: open triad, focus in and back, dismissal
// (Escape, outside press, focus leaving), nested layers, placement with RTL,
// cross-axis offset, collision boundary, arrow, hydration and axe.
// Page: examples/vite-spa/popover.html.

const PAGE = `${DEV_URL}popover.html`;

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${PAGE}${query}`);
  await page.waitForSelector('#page');
}

const log = (page: Page, id?: string) => page.evaluate((k) => (window.__popover ?? []).filter((e) => !k || e.id === k), id);
const activeId = (page: Page) => page.evaluate(() => document.activeElement?.id ?? null);
const box = (page: Page, sel: string) => page.locator(sel).evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);

test.describe('Popover', () => {
  test('the trigger opens an interactive dialog; focus moves in and returns on Escape', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page);
    const trigger = page.locator('#basic-trigger');
    await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('[data-test=basic-content]')).toHaveCount(0);
    await trigger.click();
    const content = page.locator('[data-test=basic-content]');
    await expect(content).toBeVisible();
    await expect(content).toHaveAttribute('role', 'dialog');
    await expect(content).not.toHaveAttribute('aria-modal');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(await trigger.getAttribute('aria-controls')).toBe(await content.getAttribute('id'));
    await expect(content).toHaveAccessibleName('Filters');
    await expect(content).toHaveAccessibleDescription('Narrow the order list.');
    expect(await activeId(page)).toBe('basic-input');
    await page.keyboard.type('Ada');
    await page.keyboard.press('Escape');
    await expect(content).toHaveCount(0);
    expect(await activeId(page)).toBe('basic-trigger');
    expect(await log(page, 'basic')).toEqual([
      { id: 'basic', open: true, reason: 'trigger', source: 'pointer' },
      { id: 'basic', open: false, reason: 'escape', source: 'keyboard' },
    ]);
    expect(problems).toEqual([]);
  });

  test('Popover.Close closes it (sticky until closed); keyboard toggle on the trigger', async ({ page }) => {
    await open(page);
    await page.locator('#basic-trigger').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-test=basic-content]')).toBeVisible();
    // Pointer moves elsewhere do not close it (sticky); only the close button, Escape or an outside press do.
    await page.mouse.move(5, 5);
    await expect(page.locator('[data-test=basic-content]')).toBeVisible();
    await page.locator('#basic-close').click();
    await expect(page.locator('[data-test=basic-content]')).toHaveCount(0);
    expect(await activeId(page)).toBe('basic-trigger');
    expect((await log(page, 'basic')).map((e) => [e.open, e.reason, e.source])).toEqual([
      [true, 'trigger', 'keyboard'],
      [false, 'close', 'pointer'],
    ]);
  });

  test('outside press and focus leaving close it; a press on the trigger toggles once', async ({ page }) => {
    await open(page);
    await page.locator('#basic-trigger').click();
    await page.locator('#outside').click();
    await expect(page.locator('[data-test=basic-content]')).toHaveCount(0);
    await page.locator('#basic-trigger').click();
    await expect(page.locator('[data-test=basic-content]')).toBeVisible();
    await page.locator('#basic-trigger').click();
    await expect(page.locator('[data-test=basic-content]')).toHaveCount(0);
    await page.locator('#basic-trigger').click();
    // Shift+Tab from the first control leaves the portaled content for the page.
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('[data-test=basic-content]')).toHaveCount(0);
    expect((await log(page, 'basic')).map((e) => e.reason)).toEqual(['trigger', 'outside', 'trigger', 'trigger', 'trigger', 'focus-outside']);
  });

  test('controlled open: onOpenChange proposes, the prop decides; defaultOpen opens after hydration', async ({ page }) => {
    await open(page, '?hydrate');
    const problems = collectProblems(page);
    await expect(page.locator('[data-test=initial-content]')).toBeVisible();
    await expect(page.locator('[data-test=initial-content]')).toHaveClass(/salmon-popover custom-content/);
    expect(await page.locator('[data-test=initial-content]').evaluate((el) => (el as HTMLElement).style.minWidth)).toBe('200px');
    // defaultOpen is the initial state: no change callback.
    expect(await log(page, 'initial')).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-test=initial-content]')).toHaveCount(0);
    await page.locator('#external-toggle').click();
    await expect(page.locator('[data-test=controlled-content]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-test=controlled-content]')).toHaveCount(0);
    expect((await log(page, 'controlled')).map((e) => [e.open, e.reason])).toEqual([[false, 'escape']]);
    expect(problems).toEqual([]);
  });

  test('nested popovers: Escape closes the innermost layer only; a press inside the inner one keeps the outer open', async ({ page }) => {
    await open(page);
    await page.locator('#outer-trigger').click();
    await page.locator('#inner-trigger').click();
    await expect(page.locator('[data-test=inner-content]')).toBeVisible();
    await page.locator('#inner-button').click();
    await expect(page.locator('[data-test=outer-content]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-test=inner-content]')).toHaveCount(0);
    await expect(page.locator('[data-test=outer-content]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-test=outer-content]')).toHaveCount(0);
  });

  test('placement is logical: bottom by default, end mirrors in RTL; the arrow points at the trigger', async ({ page }) => {
    await open(page);
    await page.locator('#basic-trigger').click();
    const t = await box(page, '#basic-trigger');
    const c = await box(page, '[data-test=basic-content]');
    expect(c.top).toBeGreaterThanOrEqual(t.bottom);
    await expect(page.locator('[data-test=basic-content]')).toHaveAttribute('data-side', 'bottom');
    const arrow = await box(page, '[data-test=basic-content] .salmon-popover-arrow');
    expect(Math.abs(arrow.left + arrow.width / 2 - (t.left + t.width / 2))).toBeLessThanOrEqual(2);
    await open(page, '?dir=rtl&placement=end');
    await page.locator('#basic-trigger').click();
    const rt = await box(page, '#basic-trigger');
    const rc = await box(page, '[data-test=basic-content]');
    expect(rc.right).toBeLessThanOrEqual(rt.left);
    await expect(page.locator('[data-test=basic-content]')).toHaveAttribute('data-side', 'left');
  });

  test('a box that fits on neither inline side moves to a block side instead of covering its trigger', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    for (const dir of ['ltr', 'rtl']) {
      await open(page, `?dir=${dir}&placement=end`);
      await page.locator('#basic-trigger').click();
      const content = page.locator('[data-test=basic-content]');
      await expect(content).toHaveAttribute('data-side', 'bottom');
      const t = await box(page, '#basic-trigger');
      const c = await box(page, '[data-test=basic-content]');
      // Wider than the room at either inline end of the trigger, so no inline side fits.
      expect(c.width).toBeGreaterThan(Math.max(t.left, 320 - t.right) - 10);
      expect(c.top).toBeGreaterThanOrEqual(t.bottom);
      expect(c.left).toBeGreaterThanOrEqual(8);
      expect(c.right).toBeLessThanOrEqual(312);
    }
  });

  test('anchor, offsets and initial focus on the content; collision boundary keeps the box inside a container', async ({ page }) => {
    await open(page);
    await page.locator('#anchored-trigger').click();
    const field = await box(page, '#anchor-field');
    const content = await box(page, '[data-test=anchored-content]');
    expect(Math.round(content.top - field.bottom)).toBe(4);
    expect(Math.round(content.left - field.left)).toBe(10);
    expect(await activeId(page)).toBe(await page.locator('[data-test=anchored-content]').getAttribute('id'));
    await page.keyboard.press('Escape');
    await page.locator('#bounded-trigger').click();
    const bounds = await box(page, '#boundary');
    const bounded = await box(page, '[data-test=bounded-content]');
    // `end` has no room inside the 300 px box, so it flips to start and stays inside it.
    expect(bounded.right).toBeLessThanOrEqual(bounds.right);
    await expect(page.locator('[data-test=bounded-content]')).toHaveAttribute('data-side', 'left');
  });

  // axe reports aria-controls on an aria-haspopup trigger as needs-review (as for the Menu family);
  // the first test asserts that aria-controls names the open content's id.
  const reviewed = ['aria-valid-attr-value'];
  test('axe: closed and open, light, dark and RTL', async ({ page }) => {
    for (const query of ['', '?scheme=dark', '?dir=rtl']) {
      await open(page, query);
      await expectClean(page, `popover closed ${query}`, reviewed);
      await page.locator('#basic-trigger').click();
      await expectClean(page, `popover open ${query}`, reviewed);
    }
  });
});
