import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// Standalone Pager on
// examples/vite-spa/src/pager.tsx: pointer and keyboard paging, the
// cancellable events, the page-size clamp, an unknown total, renderPager,
// the container-query layout, RTL and hydration.

const nav = (page: Page, id: string) => page.locator(`#${id}`);
const current = (page: Page, id: string) => nav(page, id).locator('[aria-current="page"]');
const info = (page: Page, id: string) => nav(page, id).locator('.salmon-pager-info');
const events = (page: Page) => page.evaluate(() => (window as unknown as { __events: unknown[][] }).__events.splice(0));

async function open(page: Page, query = ''): Promise<string[]> {
  const problems = collectProblems(page);
  await page.goto(`${DEV_URL}pager.html${query ? `?${query}` : ''}`);
  await expect(nav(page, 'basic')).toBeVisible();
  return problems;
}

test.describe('Pager', () => {
  test('pointer: next, numeric, page-set and last buttons; uncontrolled page', async ({ page }) => {
    const problems = await open(page);
    const basic = nav(page, 'basic');
    await expect(current(page, 'basic')).toHaveText('1');
    await expect(info(page, 'basic')).toHaveText('1 of 84 pages (1,000 items)');
    await basic.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(current(page, 'basic')).toHaveText('2');
    await basic.getByRole('button', { name: 'Page 5', exact: true }).click();
    await expect(info(page, 'basic')).toHaveText('5 of 84 pages (1,000 items)');
    await basic.getByRole('button', { name: 'Next pages', exact: true }).click();
    await expect(current(page, 'basic')).toHaveText('9');
    await expect(basic.locator('[data-part="number"]')).toHaveText(['9', '10', '11', '12', '13', '14', '15', '16']);
    await basic.getByRole('button', { name: 'Last page', exact: true }).click();
    await expect(current(page, 'basic')).toHaveText('84');
    await expect(basic.getByRole('button', { name: 'Next page', exact: true })).toHaveAttribute('aria-disabled', 'true');
    await basic.getByRole('button', { name: 'Next page', exact: true }).click({ force: true }); // aria-disabled: Playwright treats it as disabled; the click must be inert
    await expect(current(page, 'basic')).toHaveText('84');
    await basic.getByRole('button', { name: 'First page', exact: true }).click();
    await expect(current(page, 'basic')).toHaveText('1');
    expect(await events(page)).toEqual([
      ['basic', 2, 'pointer'],
      ['basic', 5, 'pointer'],
      ['basic', 9, 'pointer'],
      ['basic', 84, 'pointer'],
      ['basic', 1, 'pointer'],
    ]);
    expect(problems).toEqual([]);
  });

  test('keyboard: keys page and focus follows the current page; Enter and Space activate', async ({ page }) => {
    await open(page);
    await nav(page, 'basic').getByRole('button', { name: 'Page 1', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(current(page, 'basic')).toHaveText('2');
    await expect(current(page, 'basic')).toBeFocused();
    await page.keyboard.press('PageDown');
    await expect(current(page, 'basic')).toHaveText('3');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('PageUp');
    await expect(current(page, 'basic')).toHaveText('1');
    await page.keyboard.press('End');
    await expect(current(page, 'basic')).toHaveText('84');
    await expect(current(page, 'basic')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(current(page, 'basic')).toHaveText('1');
    await page.keyboard.press('Control+Alt+PageDown');
    await expect(current(page, 'basic')).toHaveText('84');
    await page.keyboard.press('Control+Alt+PageUp');
    await expect(current(page, 'basic')).toHaveText('1');
    // Tab moves between the controls; Enter / Space press the focused button.
    await page.keyboard.press('Tab');
    await expect(nav(page, 'basic').getByRole('button', { name: 'Page 2', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(current(page, 'basic')).toHaveText('2');
    await nav(page, 'basic').getByRole('button', { name: 'Page 4', exact: true }).focus();
    await page.keyboard.press('Space');
    await expect(current(page, 'basic')).toHaveText('4');
    const log = await events(page);
    expect(log.slice(0, 7).every((e) => e[2] === 'keyboard')).toBe(true);
    expect(log.slice(-2)).toEqual([
      ['basic', 2, 'keyboard'],
      ['basic', 4, 'keyboard'],
    ]);
    // Keys on the page size select do not page: End stays with the select instead of paging to the
    // last page. What the select itself does with End is platform behavior: Chromium on Linux and
    // Windows picks the last option (20 per page, which re-pages from item 37 to page 2), Chromium on
    // macOS leaves a closed select unchanged (12 per page, page 4). The select's value is final when
    // the key press returns; either way the pager's own key map must not run.
    const select = nav(page, 'basic').locator('select');
    await select.focus();
    await page.keyboard.press('End');
    const size = await select.inputValue();
    expect(['12', '20']).toContain(size);
    await expect(current(page, 'basic')).toHaveText(size === '20' ? '2' : '4');
    expect((await events(page)).filter((e) => e[2] === 'keyboard')).toEqual([]);
  });

  test('right-to-left: ArrowLeft goes forward, ArrowRight back; built-in icons are mirrored', async ({ page }) => {
    await open(page, 'dir=rtl');
    await nav(page, 'basic').getByRole('button', { name: 'Page 1', exact: true }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(current(page, 'basic')).toHaveText('2');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');
    await expect(current(page, 'basic')).toHaveText('2');
    await page.keyboard.press('PageDown');
    await expect(current(page, 'basic')).toHaveText('3');
    // Mirrored through the --salmon-dir sign.
    const scale = await nav(page, 'basic').locator('[data-part="next"] .salmon-pager-icon').evaluate((el) => getComputedStyle(el, '::before').scale);
    expect(scale).toBe('-1 1');
    const first = await nav(page, 'basic').locator('[data-part="first"]').boundingBox();
    const last = await nav(page, 'basic').locator('[data-part="last"]').boundingBox();
    expect(first!.x).toBeGreaterThan(last!.x);
  });

  test('md control metrics: 32px buttons and page size select, 16px glyphs (Visual consistency)', async ({ page }) => {
    await open(page);
    const n = nav(page, 'basic');
    const next = await n.locator('[data-part="next"]').boundingBox();
    expect(next!.height).toBe(32);
    expect(next!.width).toBe(32);
    const number = await n.getByRole('button', { name: 'Page 1', exact: true }).boundingBox();
    expect(number!.height).toBe(32);
    expect(number!.width).toBeGreaterThanOrEqual(32);
    const glyph = await n.locator('[data-part="next"] .salmon-pager-icon').evaluate((el) => getComputedStyle(el, '::before').width);
    expect(glyph).toBe('16px');
    const select = page.locator('.salmon-pager-size-select').first();
    expect((await select.boundingBox())!.height).toBe(32);
  });

  test('native page size select: drawn chevron at the same inset as the text, mirrored in RTL (Visual consistency 6)', async ({ page }) => {
    for (const dir of ['ltr', 'rtl']) {
      await open(page, dir === 'rtl' ? 'dir=rtl' : '');
      const m = await page.locator('.salmon-pager-size-select').first().evaluate((select) => {
        const s = getComputedStyle(select);
        const box = select.getBoundingClientRect();
        const icon = select.nextElementSibling!;
        const glyph = icon.getBoundingClientRect();
        const rtl = s.direction === 'rtl';
        return {
          appearance: s.appearance,
          start: parseFloat(rtl ? s.paddingRight : s.paddingLeft),
          end: parseFloat(rtl ? s.paddingLeft : s.paddingRight),
          // Inset of the chevron box from the select's inline end.
          inset: Math.round(rtl ? glyph.left - box.left : box.right - glyph.right),
          inside: glyph.top >= box.top && glyph.bottom <= box.bottom,
          size: [glyph.width, glyph.height],
          hidden: icon.getAttribute('aria-hidden'),
          pointer: getComputedStyle(icon).pointerEvents,
        };
      });
      expect(m).toEqual({ appearance: 'none', start: 12, end: 32, inset: 12, inside: true, size: [16, 16], hidden: 'true', pointer: 'none' });
    }
  });

  test('controlled page: onBeforePageChange cancels; events are frozen; prop changes fire no events', async ({ page }) => {
    await open(page);
    const c = nav(page, 'controlled');
    await c.getByRole('button', { name: 'Page 4', exact: true }).click();
    await expect(current(page, 'controlled')).toHaveText('4');
    await c.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(current(page, 'controlled')).toHaveText('4');
    expect(await events(page)).toEqual([
      ['before', 4, 1, 'pointer', 'navigate', true],
      ['page', 4, 1, 'pointer', 'navigate', true],
      ['before', 5, 4, 'pointer', 'navigate', true],
    ]);
    await page.evaluate(() => (window as unknown as { __setPage(n: number): void }).__setPage(12));
    await expect(current(page, 'controlled')).toHaveText('12');
    await expect(info(page, 'controlled')).toHaveText('12 of 20 pages (200 items)');
    expect(await events(page)).toEqual([]);
  });

  test('page size: options, cancellable change clamp, All', async ({ page }) => {
    await open(page);
    const c = nav(page, 'controlled');
    const select = c.locator('select');
    await expect(select.locator('option')).toHaveText(['10', '20', '50', '100', 'All']);
    await c.getByRole('button', { name: 'Page 3', exact: true }).click();
    await events(page);
    await select.selectOption('20');
    await expect(info(page, 'controlled')).toHaveText('2 of 10 pages (200 items)');
    await expect(current(page, 'controlled')).toHaveText('2');
    expect(await events(page)).toEqual([
      ['beforeSize', 20, 10, 2],
      ['size', 20, 10, 2, 3, 'pointer', true],
      ['page', 2, 3, 'pointer', 'pageSize', true],
    ]);
    await select.selectOption('100');
    await expect(select).toHaveValue('20');
    await expect(info(page, 'controlled')).toHaveText('2 of 10 pages (200 items)');
    expect(await events(page)).toEqual([['beforeSize', 100, 20, 1]]);
    await select.selectOption('all');
    await expect(info(page, 'controlled')).toHaveText('1 of 1 pages (200 items)');
    await expect(select).toHaveValue('all');
    await expect(c.getByRole('button', { name: 'Last page', exact: true })).toHaveAttribute('aria-disabled', 'true');
    // Uncontrolled page size: the default 12, `true` options.
    const basic = nav(page, 'basic').locator('select');
    await expect(basic).toHaveValue('12');
    await expect(basic.locator('option')).toHaveText(['All', '5', '10', '12', '20']);
    await nav(page, 'basic').getByRole('button', { name: 'Page 8', exact: true }).click();
    await basic.selectOption('5');
    await expect(info(page, 'basic')).toHaveText('17 of 200 pages (1,000 items)');
  });

  test('unknown total: Next until hasNextPage is false, no last button, "Page n" info', async ({ page }) => {
    await open(page);
    const u = nav(page, 'unknown');
    await expect(u.locator('[data-part="last"]')).toHaveCount(0);
    for (let i = 0; i < 4; i++) await u.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(current(page, 'unknown')).toHaveText('5');
    await expect(info(page, 'unknown')).toHaveText('Page 5');
    await expect(u.getByRole('button', { name: 'Next page', exact: true })).toHaveAttribute('aria-disabled', 'true');
    await expect(u.locator('[data-part="number"]')).toHaveText(['1', '2', '3', '4', '5']);
  });

  test('renderPager: a custom pager inside the landmark drives goToPage with source api', async ({ page }) => {
    await open(page);
    const t = nav(page, 'template');
    await expect(t).toHaveAttribute('aria-label', 'Template pages');
    await expect(page.locator('#more')).toHaveText('Load page 2 of 3');
    await page.locator('#more').click();
    await page.locator('#more').click();
    await expect(page.locator('#more')).toBeDisabled();
    await expect(t).toHaveAttribute('data-page', '3');
    expect(await events(page)).toEqual([
      ['template', 2, 'api'],
      ['template', 3, 'api'],
    ]);
  });

  test('narrow container: only the current number, no page sets or item count', async ({ page }) => {
    await open(page);
    const n = nav(page, 'narrow');
    await expect(n.locator('[data-part="number"]:visible')).toHaveText(['10']);
    await expect(n.locator('[data-part$="-set"]:visible')).toHaveCount(0);
    await expect(n.locator('.salmon-pager-items')).toBeHidden();
    await expect(n.locator('.salmon-pager-pages')).toHaveText('10 of 42 pages');
    await expect(n.getByRole('button', { name: 'Next page', exact: true })).toBeVisible();
    await expect(nav(page, 'basic').locator('[data-part="number"]:visible')).toHaveCount(8);
    await expect(nav(page, 'basic').locator('.salmon-pager-items')).toBeVisible();
    const box = await n.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(360);
  });

  test('switching page from uncontrolled to controlled logs a development warning', async ({ page }) => {
    const warnings: string[] = [];
    page.on('console', (msg) => void (msg.type() === 'warning' && warnings.push(msg.text())));
    await open(page);
    await page.locator('#make-controlled').click();
    await expect(current(page, 'switch')).toHaveText('2');
    await expect.poll(() => warnings.join('\n')).toContain('changing Pager page from uncontrolled to controlled');
  });

  test('hydration: the server markup hydrates with zero warnings and stays interactive', async ({ page }) => {
    const problems = await open(page, 'mode=hydrate');
    await page.waitForFunction(() => (window as unknown as { __hydrated?: boolean }).__hydrated === true);
    await nav(page, 'basic').getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(current(page, 'basic')).toHaveText('2');
    await nav(page, 'controlled').locator('select').selectOption('50');
    await expect(info(page, 'controlled')).toHaveText('1 of 4 pages (200 items)');
    expect(problems).toEqual([]);
  });
});
