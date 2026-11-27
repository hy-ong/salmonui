import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';

// Accessibility demo: axe-core reports zero
// violations, one labelled grid tree with the ARIA attributes, the keyboard
// map with a single tab stop, live-region announcements, focus restored
// after virtualization and menus, and forced colors with reduced motion.
// The full suites are tests/browser/a11y.spec.ts and keyboard.spec.ts.

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

async function open(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto('/demos/data-grid/accessibility');
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  await page.waitForLoadState('networkidle');
  return problems;
}

/** axe-core over the grid, its live region and open overlays; `color-contrast` stays "needs review" (sticky backgrounds). */
async function expectAxeClean(page: Page, state: string): Promise<void> {
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ path: AXE });
  const result = await page.evaluate(async () => {
    const axeApi = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<any> } }).axe;
    const include = ['.salmon-data-grid', '.salmon-data-grid-live', '[data-salmon-popover]'].filter((s) => document.querySelector(s)).map((s) => [s]);
    const r = await axeApi.run({ include }, { resultTypes: ['violations', 'incomplete'], rules: { region: { enabled: false } } });
    return {
      violations: r.violations.map((v: any) => `${v.id}: ${v.nodes.slice(0, 2).map((n: any) => n.target.join(' ')).join(', ')}`),
      incomplete: r.incomplete.map((v: any) => v.id as string),
    };
  });
  expect(result.violations, state).toEqual([]);
  expect(result.incomplete.filter((id: string) => id !== 'color-contrast'), state).toEqual([]);
}

const grid = (page: Page) => page.getByRole('grid', { name: 'Customer orders' });
const cell = (page: Page, rowId: string, columnId: string) => page.locator(`.salmon-data-grid [data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="${columnId}"]`);
const header = (page: Page, columnId: string) => page.locator(`.salmon-data-grid .salmon-data-grid-header-cell[data-column-id="${columnId}"]`);

test('one labelled grid tree with roles and ARIA attributes; axe-core is clean', async ({ page }) => {
  const problems = await open(page);
  await expect(page.locator('[role="grid"]')).toHaveCount(1);
  await expect(grid(page)).toHaveAttribute('aria-describedby', 'a11y-demo-help');
  await expect(grid(page)).toHaveAttribute('aria-rowcount', '2001');
  await expect(grid(page)).toHaveAttribute('aria-colcount', '7');
  // Header and body row groups live inside the one grid (no aria-owns stitching).
  expect(await grid(page).locator('[role="rowgroup"]').count()).toBeGreaterThanOrEqual(2);
  await expect(page.locator('[aria-owns]')).toHaveCount(0);
  await expect(grid(page).locator('[role="columnheader"]').first()).toBeVisible();
  await expect(cell(page, 'ORD-10000', 'customer')).toHaveAttribute('role', 'gridcell');
  await expect(page.locator('.salmon-data-grid [data-row-id="ORD-10000"]')).toHaveAttribute('aria-rowindex', '2');
  await expectAxeClean(page, 'default');

  await header(page, 'customer').click();
  await expect(header(page, 'customer')).toHaveAttribute('aria-sort', 'ascending');
  const firstRow = page.locator('.salmon-data-grid .salmon-data-grid-rows [data-row-id]').first();
  // A click selects the row and moves the logical focus there.
  await firstRow.locator('.salmon-data-grid-cell[data-column-id="country"]').click();
  await expect(firstRow).toHaveAttribute('aria-selected', 'true');
  await expectAxeClean(page, 'sorted and selected');
  expect(problems).toEqual([]);
});

test('keyboard map with a single tab stop', async ({ page }) => {
  const problems = await open(page);
  await page.getByRole('button', { name: 'Open the Customer column menu' }).focus();
  await page.keyboard.press('Tab');
  // The first Tab lands on the first body cell (the roving tab stop).
  await expect(page.locator('.salmon-data-grid [data-row-id="ORD-10000"] .salmon-data-grid-cell').first()).toBeFocused();
  await expect(grid(page).locator('[tabindex="0"]')).toHaveCount(1);
  await page.keyboard.press('ArrowRight');
  await expect(cell(page, 'ORD-10000', 'id')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(cell(page, 'ORD-10001', 'id')).toBeFocused();
  await page.keyboard.press('End');
  await expect(cell(page, 'ORD-10001', 'shipped')).toBeFocused();
  await page.keyboard.press('Control+End');
  await expect(cell(page, 'ORD-11999', 'shipped')).toBeFocused();
  await page.keyboard.press('Control+Home');
  await expect(page.locator('.salmon-data-grid [data-row-id="ORD-10000"] .salmon-data-grid-cell').first()).toBeFocused();
  await expect(grid(page).locator('[tabindex="0"]')).toHaveCount(1);
  // Tab leaves the grid: it is one tab stop.
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.closest('[role="grid"]') === null)).toBe(true);
  expect(problems).toEqual([]);
});

test('live region announces sort and selection', async ({ page }) => {
  const problems = await open(page);
  const live = page.locator('.salmon-data-grid-live[aria-live="polite"]');
  await expect(live).toHaveAttribute('aria-live', 'polite');
  await cell(page, 'ORD-10000', 'customer').click();
  await page.keyboard.press('ArrowUp');
  await expect(header(page, 'customer')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(live).toHaveText(/Sorted by Customer ascending/i);
  const log = page.getByRole('log', { name: 'Screen reader announcements' });
  await expect(log).toContainText(/Sorted by Customer ascending/i);
  // Space selects the focused row; the selection is announced.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await expect(live).toHaveText(/selected/i);
  await expect(log).toContainText(/selected/i);
  expect(problems).toEqual([]);
});

test('focus survives virtualization and returns from the column menu', async ({ page }) => {
  const problems = await open(page);
  await cell(page, 'ORD-10002', 'customer').click();
  await expect(cell(page, 'ORD-10002', 'customer')).toBeFocused();
  // Scroll the focused row out of the rendered window: the root keeps the tab stop.
  await page.locator('.salmon-data-grid-viewport').evaluate((el) => {
    el.scrollTop = 36 * 1200;
  });
  await expect(page.locator('.salmon-data-grid [data-row-id="ORD-10002"]')).toHaveCount(0);
  await expect(grid(page)).toHaveAttribute('tabindex', '0');
  await page.keyboard.press('ArrowDown');
  await expect(cell(page, 'ORD-10003', 'customer')).toBeFocused();

  // api.focusCell scrolls a far row into view and focuses it.
  await page.getByRole('button', { name: 'Focus order ORD-11500' }).click();
  await expect(cell(page, 'ORD-11500', 'customer')).toBeFocused();

  // Menus restore focus to their invoker.
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(header(page, 'customer')).toBeFocused();
  await page.keyboard.press('Shift+Alt+ArrowDown');
  await expect(page.getByRole('menu')).toBeVisible();
  await expectAxeClean(page, 'column menu open');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(header(page, 'customer')).toBeFocused();
  expect(problems).toEqual([]);
});

test('forced colors and reduced motion', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  const problems = await open(page);
  await cell(page, 'ORD-10000', 'country').click();
  // Keyboard focus (focus-visible) on the next row; Space selects it.
  await page.keyboard.press('ArrowDown');
  await expect(cell(page, 'ORD-10001', 'country')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('.salmon-data-grid [data-row-id="ORD-10001"]')).toHaveAttribute('aria-selected', 'true');
  // The pointer stays on the row: a hovered selected striped row keeps Highlight.
  await cell(page, 'ORD-10001', 'country').hover();
  const styles = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.cssText = 'background: Highlight';
    document.body.appendChild(probe);
    const highlight = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const row = getComputedStyle(document.querySelector('.salmon-data-grid [data-row-id="ORD-10001"]')!);
    const focused = getComputedStyle(document.activeElement!);
    const moving = [...document.querySelectorAll('.salmon-data-grid *')].filter((el) => {
      const s = getComputedStyle(el);
      return parseFloat(s.transitionDuration) > 0 || parseFloat(s.animationDuration) > 0;
    }).length;
    return { highlight, row: row.backgroundColor, outline: focused.outlineStyle, moving };
  });
  expect(styles.row).toBe(styles.highlight);
  expect(styles.outline).not.toBe('none');
  expect(styles.moving).toBe(0);
  await expectAxeClean(page, 'forced colors');
  expect(problems).toEqual([]);
});

test('prefers-contrast: more raises text and borders on the demo', async ({ page }) => {
  await page.emulateMedia({ contrast: 'no-preference' });
  const problems = await open(page);
  const read = () =>
    page.evaluate(() => {
      const s = getComputedStyle(document.querySelector('.salmon-data-grid')!);
      const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
      const rgb = (color: string): number[] => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
      };
      const lum = (c: number[]) => {
        const [r, g, b] = c.map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4)) as [number, number, number];
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const ratio = (a: string, b: string) => {
        const [x, y] = [lum(rgb(a)), lum(rgb(b))];
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      };
      const v = (n: string) => s.getPropertyValue(n).trim();
      return {
        ring: v('--salmon-state-focus-ring-width'),
        secondary: ratio(v('--salmon-text-secondary'), v('--salmon-surface-base')),
        secondaryOnHeader: ratio(v('--salmon-text-secondary'), v('--salmon-surface-header')),
        border: ratio(v('--salmon-border-default'), v('--salmon-surface-base')),
        strong: ratio(v('--salmon-border-strong'), v('--salmon-surface-base')),
      };
    });
  const standard = await read();
  expect(standard.ring).toBe('2px');
  await page.emulateMedia({ contrast: 'more' });
  const more = await read();
  expect(more.ring).toBe('3px');
  expect(more.secondary).toBeGreaterThan(standard.secondary);
  expect(more.secondary).toBeGreaterThanOrEqual(7);
  expect(more.secondaryOnHeader).toBeGreaterThanOrEqual(7);
  expect(more.border).toBeGreaterThanOrEqual(4.5);
  expect(more.strong).toBeGreaterThanOrEqual(7);
  await expectAxeClean(page, 'prefers-contrast: more');
  expect(problems).toEqual([]);
});
