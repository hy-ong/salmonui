import { expect, test, type Page } from '@playwright/test';
import { expectClean } from './axe.ts';
import { collectProblems, DEV_URL } from './helpers.ts';

// Badge and Message in the browser:
// dismiss by pointer and keyboard, live regions, overlay placement and
// its RTL mirror, hydration and axe. Page: examples/vite-spa/badge-message.html.

const PAGE = `${DEV_URL}badge-message.html`;

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${PAGE}${query}`);
  await page.waitForSelector('#page');
}

const events = (page: Page) => page.evaluate(() => window.__messageEvents ?? []);

test.describe('Message', () => {
  test('the close button dismisses by pointer and by Enter / Space, named by localeText.dismiss', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page);
    const message = page.locator('#dismissible');
    const close = message.getByRole('button', { name: 'Dismiss' });
    await expect(close).toHaveCount(1);
    await close.click();
    await expect(message).toBeHidden();
    expect(await events(page)).toEqual([{ kind: 'dismiss', type: 'click' }]);
    await page.locator('#restore').click();
    await expect(message).toBeVisible();
    await close.focus();
    await page.keyboard.press('Enter');
    await expect(message).toBeHidden();
    await page.locator('#restore').click();
    await close.focus();
    await page.keyboard.press('Space');
    await expect(message).toBeHidden();
    expect(await events(page)).toHaveLength(3);
    expect(problems).toEqual([]);
  });

  test('a live message inserts into a region present before it; static messages have no live role', async ({ page }) => {
    await open(page);
    const region = page.locator('.salmon-message-live[role="status"]');
    await expect(region).toHaveCount(1);
    await expect(region).toHaveAttribute('aria-live', 'polite');
    await expect(region).toBeEmpty();
    const handle = await region.elementHandle();
    await page.locator('#show-live').click();
    await expect(page.locator('#live')).toBeVisible();
    // The same region element (not a new one) now holds the message.
    expect(await handle!.evaluate((el) => el.contains(document.getElementById('live')))).toBe(true);
    await expect(page.getByRole('alert')).toHaveText('Connection lost.');
    await expect(page.locator('[data-matrix] ').first()).not.toHaveAttribute('role', /.+/);
    expect(await page.locator('#messages .salmon-message:not(.salmon-message-live .salmon-message)[role]').count()).toBe(0);
  });

  test('under dir="rtl" the icon sits at the inline start (right) and the close button at the end (left)', async ({ page }) => {
    for (const rtl of [false, true]) {
      await open(page, rtl ? '?dir=rtl' : '');
      const message = await page.locator('#dismissible').boundingBox();
      const icon = await page.locator('#dismissible .salmon-message-icon').boundingBox();
      const close = await page.locator('#dismissible .salmon-message-dismiss').boundingBox();
      const iconNearRight = message!.x + message!.width - (icon!.x + icon!.width) < icon!.x - message!.x;
      const closeNearRight = message!.x + message!.width - (close!.x + close!.width) < close!.x - message!.x;
      expect(iconNearRight).toBe(rtl);
      expect(closeNearRight).toBe(!rtl);
    }
  });
});

test.describe('Badge', () => {
  test('overlay badges sit on the logical corner of the host and mirror under dir="rtl"', async ({ page }) => {
    for (const rtl of [false, true]) {
      await open(page, rtl ? '?dir=rtl' : '');
      for (const placement of ['topEnd', 'topStart', 'bottomEnd', 'bottomStart']) {
        const hostEl = page.locator(`[data-placement-host="${placement}"]`);
        const hostBox = await hostEl.boundingBox();
        const badgeBox = await hostEl.locator('.salmon-badge').boundingBox();
        const cx = badgeBox!.x + badgeBox!.width / 2;
        const cy = badgeBox!.y + badgeBox!.height / 2;
        const end = placement.endsWith('End');
        const right = end !== rtl;
        expect(Math.abs(cx - (right ? hostBox!.x + hostBox!.width : hostBox!.x)), `${placement} ${rtl ? 'rtl' : 'ltr'} x`).toBeLessThan(1.5);
        expect(Math.abs(cy - (placement.startsWith('top') ? hostBox!.y : hostBox!.y + hostBox!.height)), `${placement} y`).toBeLessThan(1.5);
      }
    }
  });

  test('the count caps at max, the label replaces it for assistive technology, invisible hides it without moving the host', async ({ page }) => {
    await open(page);
    const inbox = page.locator('#inbox');
    await expect(inbox.locator('.salmon-badge')).toHaveText('99+');
    await expect(inbox.locator('.salmon-badge')).toHaveAttribute('aria-hidden', 'true');
    await expect(inbox.locator('.salmon-visually-hidden')).toHaveText('120 unread messages');
    const before = await inbox.getByRole('button').boundingBox();
    await page.locator('#toggle-invisible').click();
    await expect(inbox.locator('.salmon-badge')).toBeHidden();
    await expect(inbox.locator('.salmon-visually-hidden')).toHaveCount(0);
    expect(await inbox.getByRole('button').boundingBox()).toEqual(before);
  });

  test('a dot on a circular host is pulled inward; a link badge is a focusable link', async ({ page }) => {
    await open(page);
    const avatar = page.locator('#avatar');
    const dot = await avatar.locator('.salmon-badge').boundingBox();
    expect(dot!.width).toBe(10);
    await expect(avatar.locator('.salmon-visually-hidden')).toHaveText('Online');
    const hostBox = await avatar.boundingBox();
    // overlap="circular": the corner moves 14% inward, onto the circle.
    expect(dot!.x + dot!.width / 2).toBeLessThan(hostBox!.x + hostBox!.width - 4);
    const link = page.getByRole('link', { name: 'Docs' });
    await expect(link).toHaveClass('salmon-badge');
    await link.focus();
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => location.hash)).toBe('#inline');
  });
});

test.describe('Badge and Message accessibility and SSR', () => {
  test('status dot: a 6px dot in the tone color sits before the text at the inline start, mirrored under dir="rtl", and is not announced', async ({ page }) => {
    for (const dir of ['ltr', 'rtl']) {
      await open(page, dir === 'rtl' ? '?dir=rtl' : '');
      const info = await page.locator('[data-status="success"]').evaluate((el) => {
        const dot = getComputedStyle(el, '::before');
        const box = el.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(el);
        const text = range.getClientRects()[0]!;
        return { w: dot.width, h: dot.height, bg: dot.backgroundColor, color: getComputedStyle(el).color, parent: getComputedStyle(el.parentElement!).color, before: text.left - box.left, after: box.right - text.right };
      });
      expect(info.w).toBe('6px');
      expect(info.h).toBe('6px');
      expect(info.bg).not.toBe('rgba(0, 0, 0, 0)');
      // Plain inherited text color: the tone is carried by the dot only.
      expect(info.color).toBe(info.parent);
      // The dot plus its gap (12px) precede the text on the inline-start side.
      expect(dir === 'ltr' ? info.before : info.after).toBeGreaterThanOrEqual(11);
      expect(dir === 'ltr' ? info.after : info.before).toBeLessThan(1);
    }
    const snapshot = await page.locator('#status').ariaSnapshot();
    expect(snapshot).toContain('success');
    expect(snapshot).not.toMatch(/img|graphics/);
  });

  test('server markup hydrates with zero warnings and the dismiss island works', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, '?hydrate');
    await page.locator('#dismissible').getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.locator('#dismissible')).toBeHidden();
    expect(problems).toEqual([]);
  });

  test('axe is clean in light, dark and RTL', async ({ page }) => {
    for (const query of ['', '?scheme=dark', '?dir=rtl']) {
      await open(page, query);
      await expectClean(page, `badge-message ${query || 'light'}`);
    }
  });
});
