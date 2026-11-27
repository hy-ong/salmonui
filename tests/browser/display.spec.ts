import { expect, test, type Page } from '@playwright/test';
import { expectClean } from './axe.ts';
import { collectProblems, DEV_URL } from './helpers.ts';

// Layout display components in the browser: image fallback, hydration, layout and
// axe. Page: examples/vite-spa/display.html. Markup rows: packages/layout/tests/display-ssr.test.ts.

const PAGE = `${DEV_URL}display.html`;

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${PAGE}${query}`);
  await page.waitForSelector('#page');
}

test.describe('Display components', () => {
  test('a loaded image covers the initials; a failed one is hidden so the initials show, also when it failed before hydration', async ({ page }) => {
    for (const query of ['', '?hydrate']) {
      const problems = collectProblems(page);
      await open(page, query);
      await expect(page.locator('#ok .salmon-avatar-image')).toBeVisible();
      await expect(page.locator('#broken .salmon-avatar-image')).toBeHidden();
      await expect(page.locator('#broken .salmon-avatar-fallback')).toHaveText('GH');
      await expect(page.locator('#broken')).toHaveAccessibleName('Grace Hopper');
      await expect(page.locator('#icon')).toHaveAccessibleName('Robot');
      expect(problems, query).toEqual([]);
    }
  });

  test('the group overlaps avatars and ends with a labelled +N avatar', async ({ page }) => {
    await open(page);
    const avatars = page.locator('#group > .salmon-avatar');
    await expect(avatars).toHaveCount(4);
    await expect(avatars.last()).toHaveAccessibleName('2 more');
    const a = await avatars.nth(0).boundingBox();
    const b = await avatars.nth(1).boundingBox();
    // Each avatar overlaps the one before it by an eighth of its size.
    expect(b!.x).toBeCloseTo(a!.x + a!.width * 0.875, 0);
    // The next avatar and its 2px ring never cover the initials before it. The overlap may reach into the
    // side bearing of the last letter (its advance box), not into its ink: measure the drawn glyphs.
    for (let i = 0; i < 3; i += 1) {
      const inkRight = await avatars.nth(i).locator('.salmon-avatar-fallback').evaluate((el) => {
        const style = getComputedStyle(el);
        const context = document.createElement('canvas').getContext('2d')!;
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        return el.getBoundingClientRect().left + context.measureText(el.textContent ?? '').actualBoundingBoxRight;
      });
      const next = await avatars.nth(i + 1).boundingBox();
      // Half a pixel for sub-pixel glyph outlines (Linux fonts put a T bar 0.08 px past the box of a circle).
      expect(inkRight, `avatar ${i}`).toBeLessThanOrEqual(next!.x - 2 + 0.5);
    }
  });

  test('a circular overlay Badge sits on the avatar edge at the top-end corner, mirrored in RTL', async ({ page }) => {
    for (const query of ['', '?dir=rtl']) {
      await open(page, query);
      const avatar = (await page.locator('#badged').boundingBox())!;
      const badge = page.locator('#avatar-badge > .salmon-badge');
      await expect(badge).toHaveText('3');
      const b = (await badge.boundingBox())!;
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      // The badge centre is on the circle near 45 degrees (about 14 % in from the box corner), not on the box corner.
      const ex = query ? avatar.x + avatar.width * 0.14 : avatar.x + avatar.width * 0.86;
      expect(Math.abs(cx - ex), query).toBeLessThan(avatar.width * 0.1);
      expect(Math.abs(cy - (avatar.y + avatar.height * 0.14)), query).toBeLessThan(avatar.height * 0.1);
      await expect(page.locator('#avatar-badge')).toContainText('3 unread messages');
    }
  });

  test('buttons inside display list items are reached with Tab in reading order', async ({ page }) => {
    await open(page);
    const list = page.locator('#actions-list');
    await expect(list).toHaveRole('list');
    await list.getByRole('button', { name: 'Accept Ada Lovelace' }).focus();
    for (const name of ['Decline Ada Lovelace', 'Accept Alan Turing', 'Decline Alan Turing']) {
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name })).toBeFocused();
    }
  });

  test('horizontal card, alternate and horizontal timelines lay out, mirrored in RTL', async ({ page }) => {
    for (const rtl of [false, true]) {
      await open(page, rtl ? '?dir=rtl' : '');
      const media = await page.locator('#card-horizontal .salmon-card-media').boundingBox();
      const body = await page.locator('#card-horizontal .salmon-card-body').boundingBox();
      expect(rtl ? media!.x > body!.x : media!.x < body!.x).toBe(true);
      const items = page.locator('#timeline > .salmon-timeline-item');
      const firstContent = await items.nth(0).locator('.salmon-timeline-content').boundingBox();
      const secondContent = await items.nth(1).locator('.salmon-timeline-content').boundingBox();
      const marker = await items.nth(0).locator('.salmon-timeline-marker').boundingBox();
      // alternate: item 1 content at the inline end of the line, item 2 at the inline start.
      const endSide = (box: { x: number }) => (rtl ? box.x < marker!.x : box.x > marker!.x);
      expect(endSide(firstContent!)).toBe(true);
      expect(endSide(secondContent!)).toBe(false);
      // Default align: the opposite column fits its widest text, never overlaps the markers, and the markers line up.
      const end = page.locator('#timeline-end > .salmon-timeline-item');
      const markers = await Promise.all([0, 1, 2].map((i) => end.nth(i).locator('.salmon-timeline-marker').boundingBox()));
      for (let i = 0; i < 3; i += 1) {
        const opposite = (await end.nth(i).locator('.salmon-timeline-opposite').boundingBox())!;
        const content = (await end.nth(i).locator('.salmon-timeline-content').boundingBox())!;
        const m = markers[i]!;
        expect(Math.round(m.x)).toBe(Math.round(markers[0]!.x));
        const [before, after] = rtl ? [content, opposite] : [opposite, content];
        expect(before.x + before.width).toBeLessThanOrEqual(m.x);
        expect(after.x).toBeGreaterThanOrEqual(m.x + m.width);
      }
      const h = page.locator('#timeline-h > .salmon-timeline-item');
      const one = await h.nth(0).boundingBox();
      const two = await h.nth(1).boundingBox();
      expect(Math.round(one!.y)).toBe(Math.round(two!.y));
      expect(rtl ? two!.x < one!.x : two!.x > one!.x).toBe(true);
    }
  });

  test('hydration has no warnings; axe clean in light, dark and RTL', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, '?hydrate');
    expect(problems).toEqual([]);
    for (const query of ['', '?scheme=dark', '?dir=rtl']) {
      await open(page, query);
      await expectClean(page, `display ${query}`);
    }
  });
});
