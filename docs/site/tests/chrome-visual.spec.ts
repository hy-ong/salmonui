import { expect, test } from '@playwright/test';

// Site chrome visual consistency: the
// top bar controls share the md control metrics, the native select keeps
// symmetric insets around its text and chevron, and the site's element
// defaults never restyle a Salmon component in a demo.

test('top bar controls use the md control metrics', async ({ page }) => {
  await page.goto('/docs');
  const select = page.locator('.site-scheme select');
  const search = page.locator('.site-search__button');
  const metrics = (sel: string) =>
    page.locator(sel).first().evaluate((el) => {
      const cs = getComputedStyle(el);
      return { h: el.getBoundingClientRect().height, start: cs.paddingInlineStart, radius: cs.borderTopLeftRadius, appearance: cs.appearance };
    });
  const s = await metrics('.site-scheme select');
  expect(s).toEqual({ h: 32, start: '12px', radius: '6px', appearance: 'none' });
  // The chevron is drawn 12px from the inline end: the same inset as the text start.
  expect(await select.evaluate((el) => getComputedStyle(el).backgroundPosition)).toContain('calc(100% - 12px)');
  expect((await metrics('.site-search__button')).h).toBe(32);
  await expect(search).toBeVisible();
});

test('site element defaults do not override Salmon buttons', async ({ page }) => {
  await page.goto('/demos/buttons/button-basics');
  const primary = page.locator('.salmon-button[data-tone="primary"][data-variant="solid"]').first();
  const neutral = page.locator('.salmon-button[data-tone="neutral"][data-variant="solid"]').first();
  const bg = (loc: typeof primary) => loc.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await bg(primary)).not.toBe(await bg(neutral));
});
