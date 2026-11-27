import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// Menubar behavior: APG Menubar keyboard, pointer switching, the `value` triad
// with its cancellable before-event, hover intent, overflow scrolling, RTL and
// hydration. Page: examples/vite-spa/menubar.html.

const URL = `${DEV_URL}menubar.html`;
type Events = unknown[][];

const events = (page: Page) => page.evaluate(() => (window as unknown as { __events: Events }).__events);
const clearEvents = (page: Page) => page.evaluate(() => void ((window as unknown as { __events: Events }).__events.length = 0));
const focusedText = (page: Page) => page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
const focusedId = (page: Page) => page.evaluate(() => document.activeElement?.id ?? '');
const popup = (page: Page, trigger: string) => page.locator(`[role="menu"][aria-labelledby="${trigger}"]`);
const bar = (page: Page) => page.locator('#bar');

async function open(page: Page, query = ''): Promise<string[]> {
  const problems = collectProblems(page);
  await page.goto(`${URL}${query ? `?${query}` : ''}`);
  await expect(bar(page)).toBeVisible();
  return problems;
}

test.describe('Menubar structure', () => {
  test('role="menubar", horizontal, top-level menuitems with aria-haspopup / aria-expanded, one tab stop', async ({ page }) => {
    const problems = await open(page);
    await expect(bar(page)).toHaveAttribute('role', 'menubar');
    await expect(bar(page)).toHaveAttribute('aria-orientation', 'horizontal');
    await expect(bar(page)).toHaveAttribute('aria-label', 'Editor');
    const top = bar(page).locator(':scope > [role="menuitem"]');
    await expect(top).toHaveText(['File', '✎Edit', 'View', 'Locked', 'Disabled', 'Save', 'Help']);
    await expect(page.locator('#m-file')).toHaveAttribute('aria-haspopup', 'menu');
    await expect(page.locator('#m-file')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#m-edit em')).toHaveText('Edit');
    await expect(page.locator('#m-off')).toHaveAttribute('aria-disabled', 'true');
    await expect(bar(page).locator('[data-item-id="save"]')).not.toHaveAttribute('aria-haspopup');
    await expect(bar(page).locator('a[data-item-id="help"]')).toHaveAttribute('href', '#help');
    expect(await bar(page).locator(':scope > [tabindex="0"]').count()).toBe(1);
    await page.focus('#before');
    await page.keyboard.press('Tab');
    expect(await focusedId(page)).toBe('m-file');
    await page.keyboard.press('Tab');
    expect(await focusedId(page)).toBe('after');
    expect(problems).toEqual([]);
  });
});

test.describe('Menubar keyboard', () => {
  test('ArrowLeft / ArrowRight wrap and skip disabled items; Home / End; the tab stop follows focus', async ({ page }) => {
    await open(page);
    await page.focus('#m-file');
    const seq: string[] = [];
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press('ArrowRight');
      seq.push(await focusedText(page));
    }
    expect(seq).toEqual(['✎Edit', 'View', 'Locked', 'Save', 'Help', 'File', '✎Edit']);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    expect(await focusedText(page)).toBe('Help');
    await page.keyboard.press('Home');
    expect(await focusedText(page)).toBe('File');
    await page.keyboard.press('End');
    expect(await focusedText(page)).toBe('Help');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    expect(await focusedText(page)).toBe('Save');
  });

  test('ArrowDown, Enter and Space open on the first item, ArrowUp on the last; Escape closes and refocuses', async ({ page }) => {
    await open(page);
    await page.focus('#m-file');
    for (const key of ['ArrowDown', 'Enter', 'Space']) {
      await page.keyboard.press(key);
      await expect(popup(page, 'm-file')).toBeVisible();
      await expect(page.locator('#m-file')).toHaveAttribute('aria-expanded', 'true');
      expect(await focusedText(page)).toBe('New');
      await page.keyboard.press('Escape');
      await expect(popup(page, 'm-file')).toHaveCount(0);
      expect(await focusedId(page)).toBe('m-file');
    }
    await page.keyboard.press('ArrowUp');
    expect(await focusedText(page)).toBe('Quit');
    await page.keyboard.press('Escape');
    const values = (await events(page)).filter((e) => e[0] === 'value');
    expect(values.slice(0, 2)).toEqual([
      ['value', 'file', 'trigger', 'keyboard'],
      ['value', null, 'escape', 'keyboard'],
    ]);
  });

  test('with a menu open, ArrowRight / ArrowLeft move to the neighbouring menu and open it; a submenu item takes ArrowRight first', async ({ page }) => {
    await open(page);
    await page.focus('#m-file');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    await expect(popup(page, 'm-file')).toHaveCount(0);
    await expect(popup(page, 'm-edit')).toBeVisible();
    expect(await focusedText(page)).toBe('Undo');
    await page.keyboard.press('ArrowLeft');
    await expect(popup(page, 'm-file')).toBeVisible();
    expect(await focusedText(page)).toBe('New');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    expect(await focusedText(page)).toBe('Recent');
    await page.keyboard.press('ArrowRight');
    expect(await focusedText(page)).toBe('a.txt');
    await page.keyboard.press('ArrowLeft');
    expect(await focusedText(page)).toBe('Recent');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(popup(page, 'm-file')).toHaveCount(0);
    await expect(popup(page, 'm-edit')).toBeVisible();
    const navigations = (await events(page)).filter((e) => e[0] === 'value' && e[2] === 'navigate').map((e) => e[1]);
    expect(navigations).toEqual(['edit', 'file', 'edit']);
  });

  test('typeahead moves across top-level items; Enter on a command item acts', async ({ page }) => {
    await open(page);
    await page.focus('#m-file');
    await page.keyboard.press('v');
    expect(await focusedText(page)).toBe('View');
    await page.waitForTimeout(600);
    await page.keyboard.press('s');
    expect(await focusedText(page)).toBe('Save');
    await page.keyboard.press('Enter');
    expect(await events(page)).toContainEqual(['save', 'keyboard']);
    expect(await events(page)).toContainEqual(['bar-action', 'save', 'keyboard']);
  });

  test('RTL mirrors the arrows on the bar and in the open menus', async ({ page }) => {
    await open(page, 'dir=rtl');
    await page.focus('#m-file');
    await page.keyboard.press('ArrowLeft');
    expect(await focusedText(page)).toBe('✎Edit');
    await page.keyboard.press('ArrowRight');
    expect(await focusedText(page)).toBe('File');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowLeft');
    await expect(popup(page, 'm-edit')).toBeVisible();
    const b = (await page.locator('#m-edit').boundingBox())!;
    const m = (await popup(page, 'm-edit').boundingBox())!;
    expect(Math.abs(m.x + m.width - (b.x + b.width))).toBeLessThanOrEqual(1);
  });
});

test.describe('Menubar pointer, value and events', () => {
  test('click opens, hovering another top-level item while open switches, click on the open item closes', async ({ page }) => {
    await open(page);
    await page.locator('#m-file').click();
    await expect(popup(page, 'm-file')).toBeVisible();
    await page.locator('#m-view').hover();
    await expect(popup(page, 'm-view')).toBeVisible();
    await expect(popup(page, 'm-file')).toHaveCount(0);
    expect(await focusedId(page)).toBe('m-view');
    await page.locator('#m-view').click();
    await expect(popup(page, 'm-view')).toHaveCount(0);
    expect((await events(page)).filter((e) => e[0] === 'value')).toEqual([
      ['value', 'file', 'trigger', 'pointer'],
      ['value', 'view', 'navigate', 'pointer'],
      ['value', null, 'trigger', 'pointer'],
    ]);
  });

  test('submenuOpen="click": hovering another top-level item does not switch', async ({ page }) => {
    await open(page, 'submenuOpen=click');
    await page.locator('#m-file').click();
    await page.locator('#m-view').hover();
    await page.waitForTimeout(300);
    await expect(popup(page, 'm-file')).toBeVisible();
    await expect(popup(page, 'm-view')).toHaveCount(0);
  });

  test('hoverDelay: nested submenus open after the hover intent (default 200 ms, configurable)', async ({ page }) => {
    for (const [query, early, late] of [['', 80, 1000], ['hoverDelay=700', 400, 1500]] as const) {
      await open(page, query);
      await page.locator('#m-file').click();
      const r = (await page.locator('#recent').boundingBox())!;
      await page.mouse.move(r.x + 10, r.y + r.height / 2);
      await page.mouse.move(r.x + 14, r.y + r.height / 2);
      await page.waitForTimeout(early);
      await expect(popup(page, 'recent')).toHaveCount(0, { timeout: 0 });
      await expect(popup(page, 'recent')).toBeVisible({ timeout: late });
    }
  });

  test('onBeforeValueChange vetoes opening; actions close with reason "action" and refocus the top-level item', async ({ page }) => {
    await open(page);
    await page.locator('#m-locked').click();
    await expect(popup(page, 'm-locked')).toHaveCount(0);
    await expect(page.locator('#m-locked')).toHaveAttribute('aria-expanded', 'false');
    expect(await events(page)).toEqual([['vetoed', 'locked', null]]);
    await clearEvents(page);
    await page.focus('#m-file');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(popup(page, 'm-file')).toHaveCount(0);
    expect(await focusedId(page)).toBe('m-file');
    expect(await events(page)).toEqual([
      ['value', 'file', 'trigger', 'keyboard'],
      ['file-action', 'new'],
      ['bar-action', 'new', 'keyboard'],
      ['value', null, 'action', 'keyboard'],
    ]);
  });

  test('an outside press closes with reason "outside"', async ({ page }) => {
    await open(page);
    await page.locator('#m-edit').click();
    await page.mouse.click(600, 500);
    await expect(popup(page, 'm-edit')).toHaveCount(0);
    expect((await events(page)).at(-1)).toEqual(['value', null, 'outside', 'pointer']);
  });

  test('controlled value opens and closes the menu; user changes are proposals', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as unknown as { __bar: (v: string | null) => void }).__bar('two'));
    const two = page.locator('#bar-controlled [role="menuitem"]').nth(1);
    await expect(two).toHaveAttribute('aria-expanded', 'true');
    const id = await two.getAttribute('id');
    await expect(popup(page, id!)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(two).toHaveAttribute('aria-expanded', 'false');
    expect(await events(page)).toContainEqual(['bar-controlled', null, 'escape']);
    await page.evaluate(() => (window as unknown as { __bar: (v: string | null) => void }).__bar('one'));
    await expect(page.locator('#bar-controlled [role="menuitem"]').first()).toHaveAttribute('aria-expanded', 'true');
    await page.evaluate(() => (window as unknown as { __bar: (v: string | null) => void }).__bar(null));
    await expect(page.locator('#bar-controlled [role="menu"]')).toHaveCount(0);
  });
});

test.describe('Menubar overflow and SSR', () => {
  test("overflow: 'scroll' scrolls the bar, shows indicators on the overflowing side, and keyboard focus scrolls into view", async ({ page }) => {
    await open(page);
    const s = page.locator('#bar-scroll');
    await expect(s).toHaveAttribute('data-overflow', 'scroll');
    await expect(s).toHaveAttribute('data-scroll-end', '');
    await expect(s).not.toHaveAttribute('data-scroll-start');
    const forward = s.locator('.salmon-menubar-scroll[data-direction="forward"]');
    await expect(forward).toBeVisible();
    await expect(forward).toHaveAttribute('aria-hidden', 'true');
    await expect(forward).toHaveAttribute('title', 'Scroll forward');
    await forward.click();
    await expect(s).toHaveAttribute('data-scroll-start', '');
    expect(await s.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    await page.focus('#s-alpha');
    await page.keyboard.press('End');
    expect(await focusedId(page)).toBe('s-golf');
    const inView = await page.locator('#s-golf').evaluate((el) => {
      const r = el.getBoundingClientRect();
      const b = el.parentElement!.getBoundingClientRect();
      return r.left >= b.left - 1 && r.right <= b.right + 1;
    });
    expect(inView).toBe(true);
    await expect(s).not.toHaveAttribute('data-scroll-end');
    await page.keyboard.press('ArrowDown');
    await expect(popup(page, 's-golf')).toBeVisible();
  });

  test('server markup hydrates without warnings and gets its tab stop after hydration', async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto(`${URL}?mode=hydrate`);
    await page.waitForFunction(() => (window as unknown as { __hydrated?: boolean }).__hydrated === true);
    const html = await page.evaluate(() => (window as unknown as { __ssrHtml: string }).__ssrHtml);
    expect(html).toMatch(/role="menubar" aria-orientation="horizontal" class="salmon-menubar"/);
    expect(html).toMatch(/id="m-file" role="menuitem" tabindex="-1" aria-haspopup="menu" aria-expanded="false"/);
    expect(html).not.toContain('role="menu"');
    await expect(page.locator('#m-file')).toHaveAttribute('tabindex', '0');
    await page.locator('#m-file').click();
    await expect(popup(page, 'm-file')).toBeVisible();
    expect(problems).toEqual([]);
  });
});
