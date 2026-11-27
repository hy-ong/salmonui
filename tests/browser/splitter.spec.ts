import { expect, test, type Page } from '@playwright/test';
import { expectClean } from './axe.ts';
import { collectProblems, DEV_URL } from './helpers.ts';

// Splitter in the browser. Page: examples/vite-spa/splitter.html.

const PAGE = `${DEV_URL}splitter.html`;

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${PAGE}${query}`);
  await page.waitForSelector('#page');
}

const log = (page: Page, kind: string) => page.evaluate((k) => (window.__splitter ?? []).filter((e) => e['kind'] === k), kind);
const width = async (page: Page, sel: string) => Math.round((await page.locator(sel).boundingBox())!.width);
const sep = (page: Page, splitter: string, n = 0) => page.locator(`#${splitter} > .salmon-splitter-separator`).nth(n);

test.describe('Splitter', () => {
  test('the server-rendered layout matches the hydrated one; px and % sizes', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, '?hydrate');
    expect(await width(page, '#main > [data-pane=nav]')).toBe(200);
    // 25 % of the 900 px splitter (borders included in the splitter box).
    expect(Math.abs((await width(page, '#main > [data-pane=side]')) - 224)).toBeLessThanOrEqual(1);
    const nested = (await page.locator('#nested > [data-pane=top]').boundingBox())!;
    expect(Math.round(nested.height)).toBe(Math.round(0.4 * 238 - 0.4));
    await expect(page.locator('#main > [data-pane=nav]')).toHaveText('Navigation');
    expect(problems).toEqual([]);
  });

  test('a pointer drag resizes per frame without React renders and commits sizes once', async ({ page }) => {
    await open(page);
    const s = (await sep(page, 'main').boundingBox())!;
    const renders = await page.evaluate(() => window.__splitterRenders ?? 0);
    await page.mouse.move(s.x + s.width / 2, s.y + 50);
    await page.mouse.down();
    await page.mouse.move(s.x + 40, s.y + 50, { steps: 6 });
    await page.mouse.move(s.x + 80, s.y + 50, { steps: 6 });
    expect(await page.evaluate(() => window.__splitterRenders ?? 0)).toBe(renders);
    expect(await width(page, '#main > [data-pane=nav]')).toBe(280);
    await page.mouse.up();
    expect(await log(page, 'start')).toEqual([{ kind: 'start', ids: ['nav', 'content'] }]);
    expect((await log(page, 'resize')).length).toBeGreaterThan(0);
    expect(await log(page, 'sizes')).toEqual([{ kind: 'sizes', nav: 280 }]);
  });

  test('min and max sizes clamp the drag', async ({ page }) => {
    await open(page);
    const s = (await sep(page, 'main').boundingBox())!;
    await page.mouse.move(s.x, s.y + 50);
    await page.mouse.down();
    await page.mouse.move(s.x + 400, s.y + 50, { steps: 5 });
    await page.mouse.up();
    expect(await width(page, '#main > [data-pane=nav]')).toBe(400);
    const t = (await sep(page, 'main').boundingBox())!;
    await page.mouse.move(t.x, t.y + 50);
    await page.mouse.down();
    await page.mouse.move(t.x - 500, t.y + 50, { steps: 5 });
    await page.mouse.up();
    expect(await width(page, '#main > [data-pane=nav]')).toBe(120);
  });

  test('separator ARIA; arrows, Shift, Home / End resize; Enter toggles collapse', async ({ page }) => {
    await open(page);
    const s = sep(page, 'main');
    await expect(s).toHaveAttribute('role', 'separator');
    await expect(s).toHaveAttribute('aria-orientation', 'vertical');
    await expect(s).toHaveAttribute('aria-controls', (await page.locator('#main > [data-pane=nav]').getAttribute('id'))!);
    await expect(s).toHaveAccessibleName('Resize navigation');
    await expect(s).toHaveAttribute('aria-valuenow', String(Math.round((200 / 898) * 100)));
    await expect(s).toHaveAttribute('aria-valuemin', String(Math.round((120 / 898) * 100)));
    await s.focus();
    await page.keyboard.press('ArrowRight');
    expect(await width(page, '#main > [data-pane=nav]')).toBe(210);
    await page.keyboard.press('Shift+ArrowLeft');
    expect(await width(page, '#main > [data-pane=nav]')).toBe(160);
    await page.keyboard.press('End');
    expect(await width(page, '#main > [data-pane=nav]')).toBe(400);
    await page.keyboard.press('Home');
    expect(await width(page, '#main > [data-pane=nav]')).toBe(120);
    await page.keyboard.press('Enter');
    await expect(page.locator('#main > [data-pane=nav]')).toHaveAttribute('data-collapsed', '');
    expect(await width(page, '#main > [data-pane=nav]')).toBe(24);
    await page.keyboard.press('Enter');
    expect(await width(page, '#main > [data-pane=nav]')).toBe(120);
    expect(await log(page, 'collapse')).toEqual([
      { kind: 'collapse', pane: 'nav', collapsed: true },
      { kind: 'collapse', pane: 'nav', collapsed: false },
    ]);
  });

  test('onCollapsedChange can veto a collapse', async ({ page }) => {
    await open(page);
    await sep(page, 'vetoed').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#vetoed > [data-pane=left]')).not.toHaveAttribute('data-collapsed', '');
    expect(await log(page, 'veto')).toEqual([{ kind: 'veto', collapsed: true }]);
  });

  test('non-resizable panes and disabled splitters have inert separators; panes from an array', async ({ page }) => {
    await open(page);
    const second = sep(page, 'main', 1);
    await expect(second).not.toHaveAttribute('tabindex', '0');
    await expect(second).toHaveAttribute('aria-disabled', 'true');
    const disabled = sep(page, 'array');
    await expect(disabled).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#array > [data-pane=a]')).toHaveText('A');
    const before = await width(page, '#array > [data-pane=a]');
    const b = (await disabled.boundingBox())!;
    await page.mouse.move(b.x, b.y + 20);
    await page.mouse.down();
    await page.mouse.move(b.x + 100, b.y + 20, { steps: 4 });
    await page.mouse.up();
    expect(await width(page, '#array > [data-pane=a]')).toBe(before);
  });

  test('nested splitters resize independently (vertical keyboard)', async ({ page }) => {
    await open(page);
    const top = page.locator('#nested > [data-pane=top]');
    const h0 = Math.round((await top.boundingBox())!.height);
    await sep(page, 'nested').focus();
    await page.keyboard.press('ArrowDown');
    expect(Math.round((await top.boundingBox())!.height)).toBe(h0 + 10);
    expect(await width(page, '#main > [data-pane=nav]')).toBe(200);
  });

  test('RTL mirrors pointer and arrow keys; className and style', async ({ page }) => {
    await open(page, '?dir=rtl');
    await expect(page.locator('#main > [data-pane=nav]')).toHaveClass('salmon-splitter-pane nav-pane');
    expect(await page.locator('#main').evaluate((el) => (el as HTMLElement).style.height)).toBe('240px');
    const nav = (await page.locator('#main > [data-pane=nav]').boundingBox())!;
    const side = (await page.locator('#main > [data-pane=side]').boundingBox())!;
    expect(nav.x).toBeGreaterThan(side.x);
    await sep(page, 'main').focus();
    await page.keyboard.press('ArrowLeft');
    expect(await width(page, '#main > [data-pane=nav]')).toBe(210);
    const s = (await sep(page, 'main').boundingBox())!;
    await page.mouse.move(s.x, s.y + 50);
    await page.mouse.down();
    await page.mouse.move(s.x + 30, s.y + 50, { steps: 4 });
    await page.mouse.up();
    expect(await width(page, '#main > [data-pane=nav]')).toBe(180);
  });

  test('axe clean in light, dark and RTL', async ({ page }) => {
    for (const query of ['', '?scheme=dark', '?dir=rtl']) {
      await open(page, query);
      await expectClean(page, `splitter ${query}`);
    }
  });
});
