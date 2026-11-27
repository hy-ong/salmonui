import { expect, test, type Page } from '@playwright/test';

// Theming demos: the five color seeds drive the derived palette and keep the
// contrast guarantees in both schemes;
// row and header size are layout props instead of size modes; text
// wrap wraps headers and cells.

async function open(page: Page, path: string): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto(path);
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  await page.waitForLoadState('networkidle');
  return problems;
}

const scopeVar = (page: Page, name: string) =>
  page.locator('.salmon-theme-scope:not(.site)').evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name);

test('color seeds derive the palette and keep contrast in light and dark', async ({ page }) => {
  const problems = await open(page, '/demos/data-grid/theme-colors');
  const results = page.locator('.demo-contrast [data-result]');
  await expect(results).toHaveCount(7);
  await expect(page.locator('.demo-contrast [data-result="fail"]')).toHaveCount(0);

  await page.getByLabel('primary').fill('#0f766e');
  await page.keyboard.press('Enter');
  await page.getByLabel('danger').fill('#be123c');
  await page.keyboard.press('Enter');
  // The seed is kept exactly at its snapped step of the light scale.
  await expect.poll(() => scopeVar(page, '--salmon-color-primary')).toBe('#0f766e');
  const selected = await page.locator('.salmon-data-grid [data-row-id="ORD-10001"]').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(selected).not.toBe('rgba(0, 0, 0, 0)');
  await expect(results).toHaveCount(7);
  await expect(page.locator('.demo-contrast [data-result="fail"]')).toHaveCount(0);

  // A low-contrast seed still yields passing derived pairs: the system shifts steps, never the seed.
  await page.getByLabel('primary').fill('#fde047');
  await page.keyboard.press('Enter');
  await expect.poll(() => scopeVar(page, '--salmon-color-primary')).not.toBe('#0f766e');
  await expect(page.locator('.demo-contrast [data-result="fail"]')).toHaveCount(0);

  await page.locator('.demo-toolbar').getByRole('combobox', { name: 'Scheme' }).click();
  await page.getByRole('option', { name: 'dark', exact: true }).click();
  await expect(page.locator('.salmon-theme-scope:not(.site)')).toHaveAttribute('data-salmon-color-scheme', 'dark');
  await expect(page.locator('.demo-contrast [data-result="pass"]')).toHaveCount(7);
  // auto sets no attribute: the scheme follows prefers-color-scheme in CSS.
  await page.locator('.demo-toolbar').getByRole('combobox', { name: 'Scheme' }).click();
  await page.getByRole('option', { name: 'auto', exact: true }).click();
  await expect(page.locator('.salmon-theme-scope:not(.site)')).not.toHaveAttribute('data-salmon-color-scheme', /.+/);
  expect(problems).toEqual([]);
});

test('row size props replace size modes; text wrap wraps headers and cells', async ({ page }) => {
  const problems = await open(page, '/demos/data-grid/appearance');
  const firstRow = page.locator('.salmon-data-grid [data-row-id="ORD-10000"]');
  const headerRow = page.locator('.salmon-data-grid .salmon-data-grid-header-row').first();
  const height = (locator: typeof firstRow) => locator.evaluate((el) => Math.round(el.getBoundingClientRect().height));
  expect(await height(firstRow)).toBe(36);
  expect(await height(headerRow)).toBe(40);
  await page.getByRole('combobox', { name: 'Row size' }).click();
  await page.getByRole('option', { name: 'large', exact: true }).click();
  await expect.poll(() => height(firstRow)).toBe(48);
  await expect.poll(() => height(headerRow)).toBe(52);

  await page.getByRole('combobox', { name: 'Text wrap' }).click();
  await page.getByRole('option', { name: 'both', exact: true }).click();
  await expect(page.locator('.salmon-data-grid')).toHaveAttribute('data-text-wrap', 'both');
  // The long note wraps onto several lines and its measured row grows past the estimate.
  const noteRow = page.locator('.salmon-data-grid .salmon-data-grid-row').filter({ hasText: 'Leave the parcel' }).first();
  await expect.poll(() => height(noteRow)).toBeGreaterThan(48);
  const whiteSpace = await page.locator('.salmon-data-grid .salmon-data-grid-cell[data-column-id="note"]').first().evaluate((el) => getComputedStyle(el).whiteSpace);
  expect(whiteSpace).not.toBe('nowrap');
  expect(problems).toEqual([]);
});

test('site chrome styles leave Salmon components alone; wide docs tables scroll in place', async ({ page }) => {
  const problems = await open(page, '/demos/buttons/button-basics');
  // The site's `.site button` defaults must not beat the Button tone rules.
  const primary = page.locator('.salmon-button[data-variant="solid"][data-tone="primary"]').first();
  const neutral = page.locator('.salmon-button[data-variant="solid"][data-tone="neutral"]').first();
  const bg = (l: typeof primary) => l.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await bg(primary)).not.toBe(await bg(neutral));
  // Backtick spans in a demo description render as code.
  await expect(page.locator('.demo__description code', { hasText: 'render' })).toHaveCount(1);
  expect(problems).toEqual([]);

  await page.setViewportSize({ width: 390, height: 900 });
  await open(page, '/docs/buttons/menu-button');
  expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= innerWidth)).toBe(true);
});

/** WCAG contrast ratio of two computed `rgb()` colors. */
function contrastOf(a: string, b: string): number {
  const luminance = (rgb: string) => {
    const [r, g, bl] = (rgb.match(/[\d.]+/g) ?? []).slice(0, 3).map((v) => {
      const c = Number(v) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

test('density picks the default or compact metric set for controls and grid rows', async ({ page }) => {
  const problems = await open(page, '/demos/data-grid/theme-density');
  const metrics = (density: string) => page.locator(`[data-density="${density}"] [data-metrics]`).getAttribute('data-metrics');
  // Button md, text field, grid row, grid header.
  await expect.poll(() => metrics('default')).toBe('32,32,36,40');
  await expect.poll(() => metrics('compact')).toBe('28,28,32,36');
  const cellFont = (density: string) => page.locator(`[data-density="${density}"] .salmon-data-grid-cell`).first().evaluate((el) => getComputedStyle(el).fontSize);
  expect(await cellFont('default')).toBe('14px');
  expect(await cellFont('compact')).toBe('13px');
  expect(problems).toEqual([]);
});

test('surfaces paint the sidebar, the app bar and the grid header with readable derived colors', async ({ page }) => {
  const problems = await open(page, '/demos/data-grid/theme-surfaces');
  const colors = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, fg: getComputedStyle(el).color }));
  const sidebar = await colors('[data-salmon-surface="sidebar"]');
  expect(sidebar.bg).toBe('rgb(25, 34, 37)');
  expect((await colors('header[data-salmon-surface="app-bar"]')).bg).toBe('rgb(255, 255, 255)');
  const header = await colors('[data-salmon-surface="table-header"]');
  expect(header.bg).toBe('rgb(14, 77, 92)');
  // The derived foregrounds keep 7:1 on their surface, 4.5:1 on the selected item.
  expect(contrastOf(header.fg, header.bg)).toBeGreaterThanOrEqual(7);
  expect(contrastOf((await colors('.salmon-sidebar-menu-link:not([aria-current])')).fg, sidebar.bg)).toBeGreaterThanOrEqual(7);
  const current = await colors('.salmon-sidebar-menu-link[aria-current="page"]');
  expect(contrastOf(current.fg, current.bg)).toBeGreaterThanOrEqual(4.5);
  expect(problems).toEqual([]);
});
