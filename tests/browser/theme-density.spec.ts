import { expect, test, type Page } from '@playwright/test';
import { expectClean } from './axe.ts';
import { DEV_URL } from './helpers.ts';

// Theme density: component CSS reads the density
// control variables with the default metrics as fallbacks, so the same
// controls are 24 / 32 / 40px in a default scope and 20 / 28 / 36px in a
// `density: 'compact'` scope, with 12 / 10px md inline padding.

type Scope = 'default' | 'compact';

const HEIGHTS = { default: { sm: 24, md: 32, lg: 40 }, compact: { sm: 20, md: 28, lg: 36 } } as const;
const PADDING = { default: 12, compact: 10 } as const;

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${DEV_URL}theme-density.html${query}`);
  await page.waitForFunction(() => (window as unknown as { __density?: { ready: boolean } }).__density?.ready === true);
  await expect(page.locator('[data-density-scope] .salmon-pager-button').first()).toBeVisible();
  await expect(page.locator('[data-density-scope] .salmon-tree-view-item').first()).toBeVisible();
}

const heights = (page: Page, scope: Scope, selector: string): Promise<number[]> =>
  page.locator(`[data-density-scope="${scope}"] ${selector}`).evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));

const padStart = (page: Page, scope: Scope, selector: string): Promise<number> =>
  page.locator(`[data-density-scope="${scope}"] ${selector}`).first().evaluate((el) => parseFloat(getComputedStyle(el).paddingInlineStart));

async function expectMatrix(page: Page): Promise<void> {
  for (const scope of ['default', 'compact'] as const) {
    const { sm, md, lg } = HEIGHTS[scope];
    expect(await heights(page, scope, '[data-part="buttons"] .salmon-button'), `${scope} buttons`).toEqual([sm, md, lg]);
    expect(await heights(page, scope, '[data-part="text-fields"] .salmon-input-group'), `${scope} text fields`).toEqual([sm, md, lg]);
    expect(await heights(page, scope, '[data-part="selects"] .salmon-select-trigger'), `${scope} selects`).toEqual([sm, md, lg]);
    expect(await heights(page, scope, '.salmon-number-field .salmon-input-group'), `${scope} number field`).toEqual([md]);
    expect(await heights(page, scope, '.salmon-combobox-field'), `${scope} combobox`).toEqual([md]);
    expect(await heights(page, scope, '.salmon-picker__control'), `${scope} date and time pickers`).toEqual([md, md]);
    // Items at the md control height; tabs 4px taller.
    for (const selector of ['.salmon-menu-item', '.salmon-tree-view-item', '.salmon-pager-button', '.salmon-toolbar .salmon-button', '.salmon-sidebar-trigger']) {
      const values = await heights(page, scope, selector);
      expect(values.length, `${scope} ${selector}`).toBeGreaterThan(0);
      expect(new Set(values), `${scope} ${selector}`).toEqual(new Set([md]));
    }
    expect(new Set(await heights(page, scope, '.salmon-tab')), `${scope} tabs`).toEqual(new Set([md + 4]));
    expect(new Set(await heights(page, scope, '.salmon-tag')), `${scope} tags`).toEqual(new Set([md - 4]));
    // md inline padding: 12px at default, 10px at compact.
    expect(await padStart(page, scope, '[data-part="buttons"] .salmon-button:nth-child(2)'), `${scope} button padding`).toBe(PADDING[scope]);
    expect(await padStart(page, scope, '[data-part="text-fields"] .salmon-field:nth-child(2) .salmon-input-group'), `${scope} input padding`).toBe(PADDING[scope]);
    expect(await padStart(page, scope, '[data-part="selects"] .salmon-select:nth-child(2) .salmon-select-trigger'), `${scope} select padding`).toBe(PADDING[scope]);
  }
}

test.describe('Theme density', () => {
  test('default and compact scopes: 24 / 32 / 40 and 20 / 28 / 36px controls, md items and padding', async ({ page }) => {
    await open(page);
    await expectMatrix(page);
  });

  test('listbox options in an open Select follow the scope density', async ({ page }) => {
    await open(page);
    for (const scope of ['default', 'compact'] as const) {
      await page.locator(`[data-density-scope="${scope}"] [data-part="selects"] .salmon-select-trigger`).nth(1).click();
      const options = page.locator('.salmon-dropdown-option:visible');
      await expect(options.first()).toBeVisible();
      expect(new Set(await options.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))), `${scope} options`).toEqual(new Set([HEIGHTS[scope].md]));
      await page.keyboard.press('Escape');
      await expect(options).toHaveCount(0);
    }
  });

  test('right to left: the same heights', async ({ page }) => {
    await open(page, '?dir=rtl');
    await expect(page.locator('main')).toHaveAttribute('dir', 'rtl');
    await expectMatrix(page);
  });

  test('the compact page has no axe violations', async ({ page }) => {
    await open(page);
    // label-content-name-mismatch (needs review): the pager's "Next pages" ellipsis button, as in a11y.spec.ts.
    await expectClean(page, 'theme density', ['label-content-name-mismatch']);
  });
});
