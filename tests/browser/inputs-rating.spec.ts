import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// Rating in the browser.
// Page: examples/vite-spa/inputs.html?only=rating (examples/vite-spa/src/inputs-rating.tsx).

async function open(page: Page, query = '?only=rating'): Promise<void> {
  await page.goto(`${DEV_URL}inputs.html${query}`);
  await page.waitForFunction(() => window.__inputsReady === true);
  await page.waitForSelector('#page');
}
const events = (page: Page, kind?: string) => page.evaluate((k) => (window.__inputs ?? []).filter((e) => !k || e['kind'] === k), kind) as Promise<Record<string, unknown>[]>;
const formData = (page: Page, id: string) => page.evaluate((k) => window.__inputForms?.[k] ?? null, id);
const fill = (page: Page, selector: string) => page.locator(selector).evaluate((el) => getComputedStyle(el).getPropertyValue('--salmon-rating-fill').trim());

test.describe('Rating', () => {
  test('clicking a star selects it; hover reports the step and previews in CSS', async ({ page }) => {
    await open(page, '?only=rating');
    const group = page.getByRole('radiogroup', { name: 'Service' });
    await group.getByRole('radio', { name: '4 of 5 stars' }).hover();
    expect((await events(page, 'hover')).at(-1)).toEqual({ kind: 'hover', value: 4 });
    const items = group.locator('.salmon-rating-item');
    expect(await fill(page, '#rating fieldset:first-of-type .salmon-rating-item:nth-child(4)')).toBe('100%');
    expect(await fill(page, '#rating fieldset:first-of-type .salmon-rating-item:nth-child(5)')).toBe('0%');
    await expect(items.nth(3)).toHaveAttribute('data-fill', 'empty');
    await group.getByRole('radio', { name: '4 of 5 stars' }).click();
    expect((await events(page, 'rating')).at(-1)).toEqual({ kind: 'rating', value: 4, source: 'pointer', reason: 'select' });
    await expect(items.nth(3)).toHaveAttribute('data-fill', 'full');
    await expect(group.locator('.salmon-rating-value')).toHaveText('4');
    await page.mouse.move(0, 0);
    expect((await events(page, 'hover')).at(-1)).toEqual({ kind: 'hover', value: null });
  });

  test('half precision selects halves; min raises lower picks', async ({ page }) => {
    await open(page, '?only=rating');
    const group = page.getByRole('radiogroup', { name: 'Half' });
    await group.getByRole('radio', { name: '3.5 of 5 stars' }).click();
    await expect(group.getByRole('radio', { name: '3.5 of 5 stars' })).toBeChecked();
    await expect(group.locator('.salmon-rating-item').nth(3)).toHaveAttribute('data-fill', 'half');
    await expect(group.locator('.salmon-rating-value')).toHaveText('3.5 / 5');
    await group.getByRole('radio', { name: '0.5 of 5 stars' }).click();
    await expect(group.getByRole('radio', { name: '1 of 5 stars' })).toBeChecked();
  });

  test('arrow keys change the value; in RTL the items mirror and ArrowLeft increases', async ({ page }) => {
    await open(page, '?only=rating');
    const group = page.getByRole('radiogroup', { name: 'Service' });
    await group.getByRole('radio', { name: '2 of 5 stars' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(group.getByRole('radio', { name: '3 of 5 stars' })).toBeChecked();
    expect((await events(page, 'rating')).at(-1)).toEqual({ kind: 'rating', value: 3, source: 'keyboard', reason: 'select' });
    await open(page, '?only=rating&dir=rtl');
    const rtl = page.getByRole('radiogroup', { name: 'Service' });
    const one = (await rtl.getByRole('radio', { name: '1 of 5 stars' }).boundingBox())!;
    const two = (await rtl.getByRole('radio', { name: '2 of 5 stars' }).boundingBox())!;
    expect(one.x).toBeGreaterThan(two.x);
    await rtl.getByRole('radio', { name: '2 of 5 stars' }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(rtl.getByRole('radio', { name: '3 of 5 stars' })).toBeChecked();
    // The half fill is clipped from the inline start (the right in RTL).
    const half = page.getByRole('radiogroup', { name: 'Half' }).locator('.salmon-rating-item').nth(2);
    const full = (await half.locator('.salmon-rating-full').boundingBox())!;
    const item = (await half.boundingBox())!;
    expect(Math.round(full.x + full.width)).toBe(Math.round(item.x + item.width));
  });

  test('the clear button resets to min; the tooltip shows the hovered step', async ({ page }) => {
    await open(page, '?only=rating');
    const group = page.getByRole('radiogroup', { name: 'Service' });
    await group.getByRole('radio', { name: '3 of 5 stars' }).hover();
    await expect(group.locator('.salmon-rating-tooltip').nth(2)).toBeVisible();
    await expect(group.locator('.salmon-rating-tooltip').nth(2)).toHaveText('3');
    await expect(group.locator('.salmon-rating-tooltip').nth(3)).toBeHidden();
    // Icon-only sm metrics: a square 24px button with a 16px glyph, not
    // stretched across the column fieldset, with the system focus ring.
    const clear = group.getByRole('button', { name: 'Clear rating' });
    const rect = await clear.boundingBox();
    expect([rect!.width, rect!.height]).toEqual([24, 24]);
    expect(await clear.locator('svg').evaluate((el) => el.getBoundingClientRect().width)).toBe(16);
    // With an inline value label the clear button sits on the star row,
    // vertically centered on it, not on a line of its own below.
    const stars = (await group.locator('.salmon-rating-items').boundingBox())!;
    expect(rect!.x).toBeGreaterThan(stars.x + stars.width);
    expect(Math.abs(rect!.y + rect!.height / 2 - (stars.y + stars.height / 2))).toBeLessThanOrEqual(1);
    await group.getByRole('radio', { checked: true }).focus();
    await page.keyboard.press('Tab');
    await expect(clear).toBeFocused();
    expect(await clear.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
    await group.getByRole('button', { name: 'Clear rating' }).click();
    expect((await events(page, 'rating')).at(-1)).toEqual({ kind: 'rating', value: 0, source: 'pointer', reason: 'clear' });
    await expect(group.getByRole('radio', { checked: true })).toHaveCount(0);
    await expect(group.getByRole('button', { name: 'Clear rating' })).toHaveCount(0);
    await expect(group.getByRole('radio', { name: '1 of 5 stars' })).toBeFocused();
  });

  test('display images, single highlight, custom icons; read-only ignores input', async ({ page }) => {
    await open(page, '?only=rating');
    await expect(page.getByRole('img', { name: '3.7 of 5 stars' })).toBeVisible();
    await expect(page.getByRole('img', { name: '2.5 of 5 stars' })).toBeVisible();
    const exact = page.getByRole('img', { name: '3.7 of 5 stars' }).locator('.salmon-rating-item').nth(3);
    const clip = (await exact.locator('.salmon-rating-full').boundingBox())!;
    const box = (await exact.boundingBox())!;
    expect(clip.width / box.width).toBeCloseTo(0.7, 1);
    const single = page.getByRole('radiogroup', { name: 'Single' }).locator('.salmon-rating-item');
    await expect(single.nth(1)).toHaveAttribute('data-fill', 'empty');
    await expect(single.nth(2)).toHaveAttribute('data-fill', 'full');
    await expect(page.getByRole('radiogroup', { name: 'Custom' }).locator('.salmon-rating-full').first()).toHaveText('♥');
    await expect(page.getByRole('radiogroup', { name: 'Items' }).locator('.salmon-rating-custom').first()).toHaveText('1f');
    const ro = page.getByRole('radiogroup', { name: 'Read only' });
    await expect(ro).toHaveAttribute('aria-readonly', 'true');
    await ro.getByRole('radio', { name: '1 of 5 stars' }).click();
    await expect(ro.getByRole('radio', { name: '4 of 5 stars' })).toBeChecked();
    await ro.getByRole('radio', { name: '4 of 5 stars' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(ro.getByRole('radio', { name: '4 of 5 stars' })).toBeChecked();
    await expect(page.getByRole('radiogroup', { name: 'Disabled' }).getByRole('radio').first()).toBeDisabled();
  });

  test('the radios submit with the form; reset restores defaultValue', async ({ page }) => {
    await open(page, '?only=rating');
    await page.getByRole('radiogroup', { name: 'Service' }).getByRole('radio', { name: '5 of 5 stars' }).click();
    await page.locator('#rat-submit').click();
    expect(await formData(page, 'rat-form')).toEqual([
      ['stars', '5'],
      ['half', '2.5'],
    ]);
    await page.locator('#rat-reset').click();
    await expect(page.getByRole('radiogroup', { name: 'Service' }).getByRole('radio', { name: '2 of 5 stars' })).toBeChecked();
    expect((await events(page, 'rating')).at(-1)).toMatchObject({ value: 2, reason: 'reset' });
  });
});

test('server markup hydrates with zero warnings and stays interactive', async ({ page }) => {
  const problems = collectProblems(page);
  await open(page, '?hydrate&only=rating');
  const group = page.getByRole('radiogroup', { name: 'Service' });
  await group.getByRole('radio', { name: '5 of 5 stars' }).click();
  await expect(group.getByRole('radio', { name: '5 of 5 stars' })).toBeChecked();
  expect(problems).toEqual([]);
});
