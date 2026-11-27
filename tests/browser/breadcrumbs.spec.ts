import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// Breadcrumbs behavior:
// links and keyboard, the lazy ellipsis MenuButton, expand, the measured
// overflow, scroll / wrap / none, onItemClick cancellation, router links via
// `render`, RTL separators and hydration. Page: examples/vite-spa/breadcrumbs.html.

const URL = `${DEV_URL}breadcrumbs.html`;
type Events = unknown[][];

const events = (page: Page) => page.evaluate(() => (window as unknown as { __events: Events }).__events);
const clearEvents = (page: Page) => page.evaluate(() => void ((window as unknown as { __events: Events }).__events.length = 0));
const item = (page: Page, trail: string, index: number) => page.locator(`#${trail} li[data-index="${index}"]`);
const ellipsis = (page: Page, trail: string) => page.locator(`#${trail} .salmon-breadcrumbs-ellipsis`);
const menu = (page: Page) => page.locator('.salmon-menu[role="menu"]');
const hiddenIndexes = (page: Page, trail: string) =>
  page.locator(`#${trail} li[data-index]`).evaluateAll((lis) => lis.filter((li) => (li as HTMLElement).hidden).map((li) => Number((li as HTMLElement).dataset['index'])));
const focused = (page: Page) => page.evaluate(() => document.activeElement?.textContent ?? '');

async function open(page: Page, query = ''): Promise<string[]> {
  const problems = collectProblems(page);
  await page.goto(`${URL}${query}`);
  await expect(page.locator('#basic')).toBeVisible();
  return problems;
}

test.describe('links, current item and keyboard', () => {
  test('Tab moves through the links; the current item is text and not a tab stop', async ({ page }) => {
    const problems = await open(page);
    await page.locator('#basic').evaluate((el) => (el.previousElementSibling as HTMLElement).setAttribute('tabindex', '-1'));
    await page.locator('h1').focus();
    await page.keyboard.press('Tab');
    expect(await focused(page)).toBe('Home');
    await page.keyboard.press('Tab');
    expect(await focused(page)).toBe('Docs');
    await page.keyboard.press('Tab');
    // The current item "Tabs" is skipped: focus moves on to the next trail.
    expect(await focused(page)).toBe('Home');
    await expect(page.locator('#basic [aria-current="page"]')).toHaveText('Tabs');
    await page.locator('#basic a', { hasText: 'Docs' }).click();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#docs');
    expect(await events(page)).toEqual([['basic', 1, '#docs', 'pointer', false]]);
    expect(problems).toEqual([]);
  });

  test('Enter on a link fires onItemClick with source "keyboard" and navigates', async ({ page }) => {
    await open(page);
    await page.locator('#basic a', { hasText: 'Home' }).focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#home');
    expect(await events(page)).toEqual([['basic', 0, '#home', 'keyboard', false]]);
  });

  test('onItemClick preventDefault() cancels the navigation', async ({ page }) => {
    await open(page);
    await item(page, 'cancel', 0).locator('a').click();
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => location.hash)).toBe('');
    expect(await events(page)).toEqual([['cancel', 0, '#c-0', 'pointer', false]]);
  });

  test('currentNavigable makes the current item a link; disabled items do not navigate', async ({ page }) => {
    await open(page);
    const current = page.locator('#navigable [aria-current="page"]');
    await expect(current).toHaveAttribute('href', '#v-2');
    await current.click();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#v-2');
    await expect(item(page, 'item-disabled', 1).locator('[aria-disabled="true"]')).not.toHaveAttribute('href');
    await expect(page.locator('#disabled a')).toHaveCount(0);
    await expect(ellipsis(page, 'disabled')).toBeDisabled();
  });
});

test.describe('ellipsis menu', () => {
  test('maxItems collapses the middle; the ellipsis MenuButton lists the hidden items as links', async ({ page }) => {
    const problems = await open(page);
    expect(await hiddenIndexes(page, 'max')).toEqual([1, 2, 3, 4]);
    await expect(item(page, 'max', 0)).toBeVisible();
    await expect(item(page, 'max', 5)).toBeVisible();
    await expect(menu(page)).toHaveCount(0);
    await ellipsis(page, 'max').click();
    await expect(menu(page)).toBeVisible();
    const links = menu(page).locator('a[role="menuitem"]');
    await expect(links).toHaveText(['Products', 'Electronics', 'Computers', 'Laptops']);
    await expect(links.nth(1)).toHaveAttribute('href', '#x-2');
    await expect(links.first()).toBeFocused();
    await expect(ellipsis(page, 'max')).toHaveAttribute('aria-expanded', 'true');
    await links.nth(1).click();
    await expect(menu(page)).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#x-2');
    expect(await events(page)).toEqual([['max', 2, '#x-2', 'pointer', true]]);
    expect(problems).toEqual([]);
  });

  test('keyboard: Enter opens on the first hidden item, Escape returns focus to the ellipsis', async ({ page }) => {
    await open(page);
    await ellipsis(page, 'max').focus();
    await page.keyboard.press('Enter');
    await expect(menu(page)).toBeVisible();
    expect(await focused(page)).toBe('Products');
    await page.keyboard.press('ArrowDown');
    expect(await focused(page)).toBe('Electronics');
    await page.keyboard.press('Escape');
    await expect(menu(page)).toHaveCount(0);
    await expect(ellipsis(page, 'max')).toBeFocused();
    // Once loaded the ellipsis is the MenuButton: ArrowDown reopens it.
    await page.keyboard.press('ArrowDown');
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#x-1');
  });

  test('the Menu family chunk is not loaded before the ellipsis is used', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (r) => requested.push(r.url()));
    await open(page);
    await page.waitForTimeout(100);
    expect(requested.some((u) => /ellipsis-menu/.test(u))).toBe(false);
    await ellipsis(page, 'max').hover();
    await expect.poll(() => requested.some((u) => /ellipsis-menu/.test(u))).toBe(true);
  });

  test('a prevented menu choice closes the menu without navigating', async ({ page }) => {
    await open(page);
    await ellipsis(page, 'cancel').click();
    await menu(page).locator('a[role="menuitem"]').first().click();
    await expect(menu(page)).toHaveCount(0);
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => location.hash)).toBe('');
    expect(await events(page)).toEqual([['cancel', 1, '#c-1', 'pointer', true]]);
    await expect(ellipsis(page, 'cancel')).toBeFocused();
  });
});

test.describe('render prop router links', () => {
  test('render replaces the link in the trail and in the ellipsis menu', async ({ page }) => {
    await open(page);
    const first = item(page, 'router', 0).locator('a');
    await expect(first).toHaveAttribute('data-router', '');
    await expect(first).toHaveClass('salmon-breadcrumbs-link');
    await first.click();
    expect(await events(page)).toEqual([
      ['router', 0, '/r/0', 'pointer', false],
      ['router', '#r-0'],
    ]);
    await clearEvents(page);
    await ellipsis(page, 'router').click();
    const entry = menu(page).locator('a[role="menuitem"]').first();
    await expect(entry).toHaveAttribute('data-router', '');
    await expect(entry).toHaveAttribute('href', '#r-1');
    await entry.click();
    expect(await events(page)).toEqual([
      ['router', 1, '/r/1', 'pointer', true],
      ['router', '#r-1'],
    ]);
  });
});

test.describe('expand', () => {
  test('the ellipsis reveals the hidden items inline and focuses the first one', async ({ page }) => {
    await open(page);
    expect(await hiddenIndexes(page, 'expand')).toEqual([1, 2, 3, 4]);
    await expect(ellipsis(page, 'expand')).not.toHaveAttribute('aria-haspopup');
    await ellipsis(page, 'expand').click();
    expect(await hiddenIndexes(page, 'expand')).toEqual([]);
    await expect(page.locator('#expand .salmon-breadcrumbs-more')).toBeHidden();
    await expect(item(page, 'expand', 1).locator('a')).toBeFocused();
  });
});

test.describe('measured overflow', () => {
  test('narrow widths hide items from the start; the first and the current item stay', async ({ page }) => {
    const problems = await open(page);
    await expect(page.locator('#measured .salmon-breadcrumbs-more')).toBeHidden();
    expect(await hiddenIndexes(page, 'measured')).toEqual([]);
    await page.evaluate(() => (window as unknown as { __setWidth: (n: number) => void }).__setWidth(300));
    await expect(page.locator('#measured .salmon-breadcrumbs-more')).toBeVisible();
    const hidden = await hiddenIndexes(page, 'measured');
    expect(hidden.length).toBeGreaterThan(0);
    expect(hidden[0]).toBe(1);
    expect(hidden).toEqual(Array.from({ length: hidden.length }, (_, i) => i + 1));
    expect(hidden).not.toContain(6);
    const list = page.locator('#measured .salmon-breadcrumbs-list');
    expect(await list.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await ellipsis(page, 'measured').click();
    await expect(menu(page).locator('a[role="menuitem"]')).toHaveCount(hidden.length);
    await page.keyboard.press('Escape');
    await page.evaluate(() => (window as unknown as { __setWidth: (n: number) => void }).__setWidth(900));
    await expect(page.locator('#measured .salmon-breadcrumbs-more')).toBeHidden();
    expect(await hiddenIndexes(page, 'measured')).toEqual([]);
    expect(problems).toEqual([]);
  });

  test('hydration: the server HTML renders every item, the measurer only toggles hidden afterwards', async ({ page }) => {
    const problems = collectProblems(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`${URL}?mode=hydrate`);
    await page.waitForFunction(() => (window as unknown as { __hydrated?: boolean }).__hydrated === true);
    const html = await page.evaluate(() => (window as unknown as { __ssrHtml: string }).__ssrHtml);
    expect(html).toContain('data-overflow-root=""');
    await page.evaluate(() => (window as unknown as { __setWidth: (n: number) => void }).__setWidth(300));
    await expect(page.locator('#measured .salmon-breadcrumbs-more')).toBeVisible();
    await ellipsis(page, 'max').click();
    await expect(menu(page)).toBeVisible();
    expect(problems).toEqual([]);
  });
});

test.describe('wrap, scroll and none', () => {
  const lineHeight = (page: Page, trail: string) => page.locator(`#${trail} .salmon-breadcrumbs-list`).evaluate((el) => el.getBoundingClientRect().height);

  test('wrap breaks onto several lines; none stays on one clipped line', async ({ page }) => {
    await open(page);
    const wrap = await lineHeight(page, 'wrap');
    const none = await lineHeight(page, 'none');
    expect(wrap).toBeGreaterThan(none * 1.5);
    const clip = await page.locator('#none .salmon-breadcrumbs-list').evaluate((el) => ({ overflow: getComputedStyle(el).overflowX, wider: el.scrollWidth > el.clientWidth }));
    expect(clip).toEqual({ overflow: 'hidden', wider: true });
    await expect(page.locator('#wrap .salmon-breadcrumbs-more, #none .salmon-breadcrumbs-more')).toHaveCount(0);
  });

  for (const dir of ['ltr', 'rtl']) {
    test(`scroll scrolls horizontally with the current item in view after mount (${dir})`, async ({ page }) => {
      await open(page, dir === 'rtl' ? '?dir=rtl' : '');
      const list = page.locator('#scroll .salmon-breadcrumbs-list');
      expect(await list.evaluate((el) => getComputedStyle(el).overflowX)).toBe('auto');
      expect(await list.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
      const inView = await list.evaluate((el) => {
        const a = el.getBoundingClientRect();
        const b = el.querySelector('[data-current]')!.getBoundingClientRect();
        return b.left >= a.left - 1 && b.right <= a.right + 1;
      });
      expect(inView).toBe(true);
    });
  }
});

test.describe('separators', () => {
  test('the default chevron is CSS and mirrors in RTL; a custom separator replaces it', async ({ page }) => {
    const chevron = (p: Page) => item(p, 'basic', 1).evaluate((el) => getComputedStyle(el, '::before').transform);
    await open(page);
    const ltr = await chevron(page);
    expect(await item(page, 'basic', 0).evaluate((el) => getComputedStyle(el, '::before').content)).toBe('none');
    await open(page, '?dir=rtl');
    const rtl = await chevron(page);
    expect(ltr).not.toBe('none');
    expect(rtl).not.toBe(ltr);
    // rotate(45deg) points to the inline end; rotate(-135deg) is its mirror.
    const a = (m: string) => m.match(/matrix\(([^)]+)\)/)![1]!.split(',').map(Number);
    expect(Math.sign(a(ltr)[0]!)).toBe(-Math.sign(a(rtl)[0]!));
    await expect(page.locator('#separator .salmon-breadcrumbs-separator').first()).toHaveText('/');
    expect(await item(page, 'separator', 1).evaluate((el) => getComputedStyle(el, '::before').content)).toBe('none');
    // The trail reads right to left.
    const xs = await page.locator('#basic li[data-index]').evaluateAll((lis) => lis.map((li) => li.getBoundingClientRect().left));
    expect(xs[0]!).toBeGreaterThan(xs[2]!);
  });
});
