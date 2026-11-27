import { expect, test, type Page } from '@playwright/test';
import { expectClean } from './axe.ts';
import { collectProblems, DEV_URL } from './helpers.ts';

// Spinner and Skeleton in the browser:
// inert children, the shared shimmer keyframes, RTL wave direction,
// reduced motion, hydration and axe. Page: examples/vite-spa/spinner-skeleton.html.

const PAGE = `${DEV_URL}spinner-skeleton.html`;

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${PAGE}${query}`);
  await page.waitForSelector('#page');
}

const animationOf = (page: Page, selector: string, pseudo: string | null = null) =>
  page.locator(selector).evaluate((el, p) => {
    const s = getComputedStyle(el, p);
    return { name: s.animationName, direction: s.animationDirection, display: s.display };
  }, pseudo);

test.describe('Spinner', () => {
  test('loading keeps the children size, hides them and makes them inert; toggling shows them', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page);
    const wrap = page.locator('#spin-wrap');
    await expect(wrap).toHaveAttribute('aria-busy', 'true');
    const form = await page.locator('#form').boundingBox();
    const box = await wrap.boundingBox();
    expect(Math.round(box!.height)).toBe(Math.round(form!.height));
    await expect(page.locator('#inner')).toBeHidden();
    expect(await page.locator('#name').evaluate((el) => el.closest('[inert]') !== null)).toBe(true);
    // Tab skips the inert content.
    await page.locator('#toggle').focus();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.id)).not.toBe('name');
    await expect(wrap.getByRole('status')).toHaveText('Saving form');
    // The children are hidden, so the covering spinner paints no veil box.
    expect(await wrap.locator('.salmon-spinner').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    await page.locator('#toggle').click();
    await expect(wrap).not.toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('#inner')).toBeVisible();
    await page.locator('#name').focus();
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('name');
    expect(problems).toEqual([]);
  });

  test('overlay covers the positioned parent', async ({ page }) => {
    await open(page);
    const card = await page.locator('#card').boundingBox();
    const overlay = await page.locator('#spin-overlay').boundingBox();
    expect(Math.abs(overlay!.width - (card!.width - 2))).toBeLessThan(1.5);
    expect(Math.abs(overlay!.height - (card!.height - 2))).toBeLessThan(1.5);
  });

  test('named spinner is a status, sizes are 16 / 24 / 32 / custom px, ring spins', async ({ page }) => {
    await open(page);
    await expect(page.locator('#spin-named')).toHaveRole('status');
    await expect(page.locator('#spin-sm')).toHaveAttribute('aria-hidden', 'true');
    for (const [id, px] of [['spin-sm', 16], ['spin-named', 24], ['spin-lg', 32], ['spin-custom', 40]] as const) {
      const b = await page.locator(`#${id}`).boundingBox();
      expect(Math.round(b!.width)).toBe(px);
    }
    expect((await animationOf(page, '#spin-named .salmon-spinner__ring')).name).toBe('salmon-spin');
  });

  test('reduced motion stops the ring', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    expect((await animationOf(page, '#spin-named .salmon-spinner__ring')).name).toBe('none');
  });
});

test.describe('Skeleton', () => {
  test('the wave reuses the Data Grid shimmer keyframes; pulse and none', async ({ page }) => {
    await open(page);
    expect(await animationOf(page, '#sk-text', '::after')).toMatchObject({ name: 'salmon-data-grid-shimmer', direction: 'normal' });
    expect((await animationOf(page, '#sk-lines .salmon-skeleton__line >> nth=0', '::after')).name).toBe('salmon-data-grid-shimmer');
    expect((await animationOf(page, '#sk-pulse')).name).toBe('salmon-pulse');
    expect((await animationOf(page, '#sk-static', '::after')).name).toBe('none');
  });

  test('shapes and sizes; the last of several lines is shorter', async ({ page }) => {
    await open(page);
    const lines = page.locator('#sk-lines .salmon-skeleton__line');
    await expect(lines).toHaveCount(3);
    const first = await lines.nth(0).boundingBox();
    const last = await lines.nth(2).boundingBox();
    expect(last!.width).toBeLessThan(first!.width * 0.7);
    const circle = await page.locator('#sk-circle').boundingBox();
    expect(Math.round(circle!.width)).toBe(Math.round(circle!.height));
    expect(await page.locator('#sk-circle').evaluate((el) => getComputedStyle(el).borderRadius)).toBe('50%');
    const rect = await page.locator('#sk-rect').boundingBox();
    expect([Math.round(rect!.width), Math.round(rect!.height)]).toEqual([160, 60]);
  });

  test('loading sizes the placeholder from inert, hidden children; loading={false} shows them', async ({ page }) => {
    await open(page);
    const sk = await page.locator('#sk-content').boundingBox();
    expect([Math.round(sk!.width), Math.round(sk!.height)]).toEqual([200, 48]);
    await expect(page.locator('#sk-inner')).toBeHidden();
    await expect(page.locator('#sk-content')).toHaveAttribute('aria-hidden', 'true');
    await page.locator('#toggle').click();
    await expect(page.locator('#sk-content')).toHaveCount(0);
    await expect(page.locator('#sk-inner')).toBeVisible();
  });

  test('in RTL the wave runs toward the inline end', async ({ page }) => {
    // The wave pseudo-element mirrors through the --salmon-dir sign.
    await open(page, '?dir=rtl');
    expect(await page.locator('#sk-text').evaluate((el) => getComputedStyle(el, '::after').scale)).toBe('-1 1');
    expect((await animationOf(page, '#sk-text', '::after')).direction).toBe('normal');
  });

  test('reduced motion stops the wave and the pulse', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    expect((await animationOf(page, '#sk-text', '::after')).display).toBe('none');
    expect((await animationOf(page, '#sk-pulse')).name).toBe('none');
  });
});

test('server-rendered markup hydrates without warnings', async ({ page }) => {
  const problems = collectProblems(page);
  await open(page, '?hydrate');
  await expect(page.locator('#spin-named')).toHaveRole('status');
  expect(problems).toEqual([]);
});

for (const query of ['', '?scheme=dark', '?dir=rtl']) {
  test(`axe clean${query ? ` (${query.slice(1)})` : ''}`, async ({ page }) => {
    await open(page, query);
    await expectClean(page, `spinner-skeleton${query}`);
  });
}
