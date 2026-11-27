import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// Toolbar and AppBar behavior:
// APG Toolbar keys, one tab stop, measured overflow menu with priorities,
// scroll and wrap modes, RTL, hydration. Page: examples/vite-spa/toolbar.html.

const URL = `${DEV_URL}toolbar.html`;
type Events = unknown[][];

const events = (page: Page) => page.evaluate(() => (window as unknown as { __events: Events }).__events);
const clearEvents = (page: Page) => page.evaluate(() => void ((window as unknown as { __events: Events }).__events.length = 0));
const focusedId = (page: Page) => page.evaluate(() => document.activeElement?.id ?? '');
const setWidth = (page: Page, px: number) => page.evaluate((w) => (window as unknown as { __setWidth: (n: number) => void }).__setWidth(w), px);
const hiddenIds = (page: Page, toolbar: string) =>
  page.evaluate((sel) => [...document.querySelectorAll<HTMLElement>(`${sel} .salmon-toolbar-item[hidden]`)].map((slot) => slot.querySelector<HTMLElement>('[id]')?.id ?? ''), toolbar);
const more = (page: Page, toolbar = '#main') => page.locator(`${toolbar} .salmon-toolbar-more`);

async function open(page: Page, query = ''): Promise<string[]> {
  const problems = collectProblems(page);
  await page.goto(`${URL}${query}`);
  await expect(page.locator('#main')).toBeVisible();
  return problems;
}

/** Waits for the lazily loaded measurer to settle the #main toolbar. */
async function settled(page: Page, toolbar = '#main'): Promise<void> {
  await expect(page.locator(`${toolbar} .salmon-toolbar-item[hidden]`).first()).toBeAttached();
}

test.describe('Toolbar keyboard', () => {
  test('one tab stop: Tab enters on the first control, arrows move, Tab leaves, Shift+Tab returns to the last focused', async ({ page }) => {
    const problems = await open(page, '?width=900');
    await settled(page);
    await page.focus('#before');
    await page.keyboard.press('Tab');
    expect(await focusedId(page)).toBe('bold');
    await page.keyboard.press('ArrowRight');
    expect(await focusedId(page)).toBe('italic');
    await page.keyboard.press('Tab');
    expect(await focusedId(page)).toBe('after');
    await page.keyboard.press('Shift+Tab');
    expect(await focusedId(page)).toBe('italic');
    await page.keyboard.press('Shift+Tab');
    expect(await focusedId(page)).toBe('before');
    expect(problems).toEqual([]);
  });

  test('ArrowLeft / ArrowRight wrap, Home / End jump, disabled buttons are skipped', async ({ page }) => {
    await open(page, '?width=900');
    await settled(page);
    await page.focus('#bold');
    await page.keyboard.press('ArrowLeft');
    // The last stop is the overflow button (Settings always lives in the menu).
    await expect(more(page)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    expect(await focusedId(page)).toBe('bold');
    await page.keyboard.press('End');
    await expect(more(page)).toBeFocused();
    await page.keyboard.press('Home');
    expect(await focusedId(page)).toBe('bold');
    await page.focus('#cut');
    await page.keyboard.press('ArrowRight');
    expect(await focusedId(page)).toBe('paste');
  });

  test('inside a text input the caret keys stay with the input; arrows leave at the caret ends', async ({ page }) => {
    await open(page, '?width=900');
    await settled(page);
    await page.focus('#italic');
    await page.keyboard.press('ArrowRight');
    expect(await focusedId(page)).toBe('find');
    await page.keyboard.press('End');
    expect(await focusedId(page)).toBe('find');
    expect(await page.locator('#find').evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(3);
    await page.keyboard.press('ArrowLeft');
    expect(await focusedId(page)).toBe('find');
    await page.keyboard.press('ArrowRight');
    expect(await focusedId(page)).toBe('find');
    await page.keyboard.press('ArrowRight');
    expect(await focusedId(page)).toBe('cut');
    await page.keyboard.press('ArrowLeft');
    expect(await focusedId(page)).toBe('find');
    await page.keyboard.press('Home');
    expect(await page.locator('#find').evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(0);
    await page.keyboard.press('ArrowLeft');
    expect(await focusedId(page)).toBe('italic');
  });

  test('RTL mirrors ArrowLeft / ArrowRight', async ({ page }) => {
    await open(page, '?dir=rtl&width=900');
    await settled(page);
    await page.focus('#bold');
    await page.keyboard.press('ArrowLeft');
    expect(await focusedId(page)).toBe('italic');
    await page.keyboard.press('ArrowRight');
    expect(await focusedId(page)).toBe('bold');
  });

  test('vertical orientation moves with ArrowUp / ArrowDown only and sets aria-orientation', async ({ page }) => {
    await open(page);
    await expect(page.locator('#vertical')).toHaveAttribute('aria-orientation', 'vertical');
    await page.focus('#v-a');
    await page.keyboard.press('ArrowRight');
    expect(await focusedId(page)).toBe('v-a');
    await page.keyboard.press('ArrowDown');
    expect(await focusedId(page)).toBe('v-b');
    await page.keyboard.press('ArrowUp');
    expect(await focusedId(page)).toBe('v-a');
    await page.keyboard.press('End');
    expect(await focusedId(page)).toBe('v-c');
  });

  test('onKeyDown runs first; preventDefault() skips the roving keys', async ({ page }) => {
    await open(page, '?width=900');
    await settled(page);
    await page.focus('#bold');
    await clearEvents(page);
    await page.evaluate(() => ((window as unknown as { __block: boolean }).__block = true));
    await page.keyboard.press('ArrowRight');
    expect(await focusedId(page)).toBe('bold');
    await page.evaluate(() => ((window as unknown as { __block: boolean }).__block = false));
    await page.keyboard.press('ArrowRight');
    expect(await focusedId(page)).toBe('italic');
    expect(await events(page)).toEqual([
      ['keydown', 'ArrowRight'],
      ['keydown', 'ArrowRight'],
    ]);
  });
});

test.describe('Toolbar overflow menu', () => {
  test('narrow: trailing items overflow into a menu; inputs never; always items only in the menu; entries click the hidden control', async ({ page }) => {
    const problems = await open(page, '?width=340');
    await settled(page);
    const hidden = await hiddenIds(page, '#main');
    expect(hidden).toContain('settings');
    expect(hidden).toContain('redo');
    expect(hidden).not.toContain('find');
    expect(hidden).not.toContain('bold');
    await expect(more(page)).toBeVisible();
    // Overflowed controls stay in the DOM (hidden) with their state.
    await expect(page.locator('#redo')).toBeAttached();
    await expect(page.locator('#redo')).toBeHidden();
    // The bar never overflows its box.
    const fits = await page.locator('#main .salmon-toolbar-content').evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    expect(fits).toBe(true);

    await more(page).click();
    const menu = page.locator('.salmon-toolbar-menu [role="menu"]');
    await expect(menu).toBeVisible();
    await expect(more(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(more(page)).toHaveAttribute('aria-controls', (await menu.getAttribute('id')) ?? '');
    const labels = await menu.locator('[role="menuitem"]').allTextContents();
    expect(labels.map((l) => l.trim())).toEqual(
      hidden.map((id) => ({ bold: 'Bold', italic: 'Italic', cut: 'Cut', copy: 'Copy', paste: 'Paste special', undo: 'Undo the last change', redo: 'Redo', settings: 'Settings' })[id] ?? id),
    );
    await clearEvents(page);
    await menu.getByRole('menuitem', { name: 'Redo' }).click();
    await expect(menu).toHaveCount(0);
    expect((await events(page)).filter((e) => e[0] === 'click')).toEqual([['click', 'redo']]);
    expect(problems).toEqual([]);
  });

  test('keyboard: Enter or ArrowDown opens on the first entry, Escape closes and refocuses the button, disabled entries are aria-disabled', async ({ page }) => {
    await open(page, '?width=300');
    await settled(page);
    await more(page).focus();
    await page.keyboard.press('Enter');
    const menu = page.locator('.salmon-toolbar-menu [role="menu"]');
    await expect(menu).toBeVisible();
    // Focus lands on the first enabled entry (disabled entries are skipped).
    const first = menu.locator('[role="menuitem"]:not([aria-disabled="true"])').first();
    await expect(first).toBeFocused();
    await expect(menu.getByRole('menuitem', { name: 'Copy' })).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(more(page)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu).toBeVisible();
    await clearEvents(page);
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect(menu).toHaveCount(0);
    expect((await events(page)).filter((e) => e[0] === 'click')).toEqual([['click', 'settings']]);
  });

  test('the menu stays in the viewport (collision-aware placement)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await open(page, '?width=330');
    await settled(page);
    await more(page).click();
    const box = await page.locator('.salmon-toolbar-menu').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(360);
  });

  test('icon-only items show their aria-label in the menu; ToolbarItem label and icon win', async ({ page }) => {
    await open(page, '?width=150');
    await settled(page);
    await more(page).click();
    const menu = page.locator('.salmon-toolbar-menu [role="menu"]');
    await expect(menu.getByRole('menuitem', { name: 'Paste special' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Paste special' }).locator('.salmon-menu-item-icon svg')).toHaveCount(1);
  });

  test('resizing re-measures; a resize that keeps the fit commits nothing; separators never trail', async ({ page }) => {
    await open(page, '?width=340');
    await settled(page);
    const narrow = await hiddenIds(page, '#main');
    await setWidth(page, 900);
    await expect.poll(() => hiddenIds(page, '#main')).toEqual(['settings']);
    const commits = () => page.evaluate(() => (window as unknown as { __commits: number }).__commits);
    const before = await commits();
    // Width changes outside React that keep the same fit: the shared ResizeObserver measures, React does not commit.
    for (const w of [890, 880, 895]) {
      await page.evaluate((px) => void (document.getElementById('main')!.style.width = `${px}px`), w);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    }
    expect(await commits()).toBe(before);
    await page.evaluate(() => void (document.getElementById('main')!.style.width = '340px'));
    await expect.poll(() => hiddenIds(page, '#main')).toEqual(narrow);
    expect(await commits()).toBeGreaterThan(before);
    // No visible separator at the end of the visible run.
    const trailing = await page.evaluate(() => {
      const visible = [...document.querySelectorAll<HTMLElement>('#main [data-overflow-item]')].filter((el) => !el.hidden);
      return visible[visible.length - 1]?.classList.contains('salmon-toolbar-separator') ?? false;
    });
    expect(trailing).toBe(false);
  });

  test('focus on an item that overflows moves to the overflow button', async ({ page }) => {
    await open(page, '?width=900');
    await settled(page);
    await page.focus('#redo');
    await setWidth(page, 300);
    await expect(page.locator('#redo')).toBeHidden();
    await expect(more(page)).toBeFocused();
  });

  test('overflowPriority: higher stays longer', async ({ page }) => {
    await open(page, '?width=900');
    for (const w of [380, 320, 260, 200, 150]) {
      await setWidth(page, w);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const hidden = await hiddenIds(page, '#priority');
      // Priority 0 items (Bravo, Delta, Echo) go before Alpha (1), Alpha before Charlie (5).
      if (hidden.includes('p-a')) expect(hidden).toEqual(expect.arrayContaining(['p-b', 'p-d', 'p-e']));
      if (hidden.includes('p-c')) expect(hidden).toContain('p-a');
    }
    expect(await hiddenIds(page, '#priority')).toContain('p-e');
  });
});

test.describe('Toolbar modes and states', () => {
  test('overflow="scroll": scroll buttons appear while the content scrolls and move it by scrollStep', async ({ page }) => {
    await open(page);
    const bar = page.locator('#scroll');
    await expect(bar).toHaveAttribute('data-scrollable', '');
    await expect(bar).toHaveAttribute('data-at-start', '');
    await expect(bar.locator('[data-scroll="back"]')).toBeHidden();
    await bar.locator('[data-scroll="forward"]').click();
    const content = bar.locator('.salmon-toolbar-content');
    await expect.poll(() => content.evaluate((el) => el.scrollLeft)).toBeGreaterThanOrEqual(79);
    await expect(bar).not.toHaveAttribute('data-at-start');
    await expect(bar.locator('[data-scroll="back"]')).toBeVisible();
    // Keyboard focus scrolls items into view natively.
    await page.focus('#s-0');
    await page.keyboard.press('End');
    expect(await focusedId(page)).toBe('s-11');
    await expect(bar).toHaveAttribute('data-at-end', '');
  });

  test('overflow="wrap" wraps items onto more rows; groups align start, center and end', async ({ page }) => {
    await open(page);
    const tops = await page.locator('#wrap button').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
    expect(Math.max(...tops)).toBeGreaterThan(Math.min(...tops));
    const bar = await page.locator('#aligned').boundingBox();
    const start = await page.locator('#a-start').boundingBox();
    const center = await page.locator('#a-center').boundingBox();
    const end = await page.locator('#a-menu').boundingBox();
    expect(start!.x - bar!.x).toBeLessThan(20);
    expect(Math.abs(center!.x + center!.width / 2 - (bar!.x + bar!.width / 2))).toBeLessThan(80);
    expect(bar!.x + bar!.width - (end!.x + end!.width)).toBeLessThan(20);
  });

  test('disabled: every control is disabled and the toolbar is aria-disabled; item disabled and title come from the child', async ({ page }) => {
    await open(page, '?width=900');
    await expect(page.locator('#disabled')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#d-a')).toBeDisabled();
    await expect(page.locator('#d-b')).toBeDisabled();
    await expect(page.locator('#copy')).toBeDisabled();
    await expect(page.locator('#undo')).toHaveAttribute('title', 'Undo the last change');
  });

  test('a menu button inside a toolbar keeps its own menu; clicks reach the child onClick', async ({ page }) => {
    await open(page, '?width=900');
    await clearEvents(page);
    await page.click('#italic');
    expect(await events(page)).toEqual([['click', 'italic']]);
    await page.focus('#a-start');
    await page.keyboard.press('End');
    expect(await focusedId(page)).toBe('a-menu');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[role="menu"][aria-labelledby="a-menu"]')).toBeVisible();
  });
});

test.describe('AppBar recipe', () => {
  test('sticky header, primary tone and bottom position from data attributes', async ({ page }) => {
    await open(page);
    const style = await page.locator('#app-bar').evaluate((el) => {
      const s = getComputedStyle(el);
      return { position: s.position, top: s.top, bg: s.backgroundColor, color: s.color };
    });
    expect(style.position).toBe('sticky');
    expect(style.top).toBe('0px');
    const primary = await page.locator('#app-bar').evaluate((el) => getComputedStyle(el).getPropertyValue('--salmon-color-primary').trim());
    expect(primary).not.toBe('');
    expect(style.bg).not.toBe('rgba(0, 0, 0, 0)');
    const bottom = await page.locator('#app-bar-bottom').evaluate((el) => {
      const s = getComputedStyle(el);
      return { top: s.borderTopWidth, bottom: s.borderBottomWidth };
    });
    expect(bottom).toEqual({ top: '1px', bottom: '0px' });
    await expect(page.getByRole('banner')).toHaveCount(1);
    await expect(page.getByRole('contentinfo')).toHaveCount(1);
    await expect(page.locator('#app-search')).toBeVisible();
  });
});

test.describe('Toolbar SSR and hydration', () => {
  test('server markup renders every item; hydration has no warnings; overflow applies after mount', async ({ page }) => {
    const problems = await open(page, '?mode=hydrate&width=340');
    await page.waitForFunction(() => (window as unknown as { __hydrated?: boolean }).__hydrated === true);
    const html = await page.evaluate(() => (window as unknown as { __ssrHtml: string }).__ssrHtml);
    expect(html).not.toMatch(/class="salmon-toolbar-item"[^>]*hidden/);
    expect(html).toContain('id="settings"');
    await settled(page);
    expect(await hiddenIds(page, '#main')).toContain('settings');
    expect(problems).toEqual([]);
  });
});
