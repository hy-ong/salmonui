import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// Tabs behavior: selection
// and its events, APG keyboard table (orientation, RTL, activation), close,
// scroll and menu overflow, reorder, panel mounting, hydration and the
// selection budget. Page: examples/vite-spa/tabs.html.

const URL = `${DEV_URL}tabs.html`;
type Events = unknown[][];

const events = (page: Page) => page.evaluate(() => (window as unknown as { __events: Events }).__events);
const clearEvents = (page: Page) => page.evaluate(() => void ((window as unknown as { __events: Events }).__events.length = 0));
const mounts = (page: Page) => page.evaluate(() => (window as unknown as { __mounts: Record<string, number> }).__mounts);
const focusedValue = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset['value'] ?? '');
const tab = (page: Page, root: string, value: string) => page.locator(`#${root} [role="tab"][data-value="${value}"]`);
const selectedValue = (page: Page, root: string) => page.locator(`#${root} [role="tab"][aria-selected="true"]`).getAttribute('data-value');
const visiblePanel = (page: Page, root: string) => page.locator(`#${root} > [role="tabpanel"]:not([hidden])`);

async function open(page: Page, query = ''): Promise<string[]> {
  const problems = collectProblems(page);
  await page.goto(`${URL}${query ? `?${query}` : ''}`);
  await expect(page.locator('#basic [role="tablist"]')).toBeVisible();
  return problems;
}

test.describe('selection', () => {
  test('a click selects the tab and shows its panel; onValueChange reports value, previousValue and source', async ({ page }) => {
    const problems = await open(page);
    await expect(visiblePanel(page, 'basic')).toHaveText('Panel general');
    await tab(page, 'basic', 'billing').click();
    await expect(tab(page, 'basic', 'billing')).toHaveAttribute('aria-selected', 'true');
    await expect(tab(page, 'basic', 'general')).toHaveAttribute('aria-selected', 'false');
    await expect(visiblePanel(page, 'basic')).toHaveText('Panel billing');
    expect(await events(page)).toEqual([
      ['before', 'billing', 'general', 'pointer'],
      ['change', 'billing', 'general', 'pointer'],
    ]);
    expect(problems).toEqual([]);
  });

  test('onBeforeValueChange preventDefault() keeps the current tab', async ({ page }) => {
    await open(page);
    await tab(page, 'basic', 'locked').click();
    expect(await selectedValue(page, 'basic')).toBe('general');
    await expect(visiblePanel(page, 'basic')).toHaveText('Panel general');
    expect(await events(page)).toEqual([['before', 'locked', 'general', 'pointer']]);
  });

  test('a disabled tab is not selectable; a hidden tab is not shown', async ({ page }) => {
    await open(page);
    await expect(tab(page, 'basic', 'off')).toHaveAttribute('aria-disabled', 'true');
    await tab(page, 'basic', 'off').click({ force: true });
    expect(await selectedValue(page, 'basic')).toBe('general');
    await expect(tab(page, 'basic', 'secret')).toBeHidden();
    expect(await events(page)).toEqual([]);
  });

  test('controlled value: the parent owns the selection', async ({ page }) => {
    await open(page);
    await tab(page, 'menu', 't1').click();
    expect(await selectedValue(page, 'menu')).toBe('t1');
    await page.evaluate(() => (window as unknown as { __setValue: (v: string) => void }).__setValue('t0'));
    await expect(tab(page, 'menu', 't0')).toHaveAttribute('aria-selected', 'true');
    expect(await events(page)).toEqual([['menu-change', 't1', 'pointer']]);
  });

  test('without value or defaultValue the first enabled tab is selected after mount', async ({ page }) => {
    await open(page);
    await expect(tab(page, 'implicit', 'first')).toHaveAttribute('aria-selected', 'true');
    await expect(visiblePanel(page, 'implicit')).toHaveText('First panel');
  });

  test('switching from uncontrolled to controlled logs a development warning', async ({ page }) => {
    const problems = await open(page, 'warnings');
    await page.click('#make-controlled');
    await expect.poll(() => problems.join('\n')).toContain('Tabs value');
  });
});

test.describe('keyboard', () => {
  test('automatic activation: arrows move focus and select, wrapping, skipping disabled and hidden; Home / End', async ({ page }) => {
    await open(page);
    await page.focus('#before');
    await page.keyboard.press('Tab');
    expect(await focusedValue(page)).toBe('general');
    await page.keyboard.press('ArrowRight');
    expect(await focusedValue(page)).toBe('billing');
    expect(await selectedValue(page, 'basic')).toBe('billing');
    await page.keyboard.press('ArrowRight');
    expect(await focusedValue(page)).toBe('locked');
    // The before-event vetoed the selection; focus still moved.
    expect(await selectedValue(page, 'basic')).toBe('billing');
    await page.keyboard.press('End');
    expect(await focusedValue(page)).toBe('notifications');
    await page.keyboard.press('ArrowRight');
    expect(await focusedValue(page)).toBe('general');
    await page.keyboard.press('ArrowLeft');
    expect(await focusedValue(page)).toBe('notifications');
    await page.keyboard.press('Home');
    expect(await focusedValue(page)).toBe('general');
    const changes = (await events(page)).filter((e) => e[0] === 'change');
    expect(changes.every((e) => e[3] === 'keyboard')).toBe(true);
    // One tab stop: Tab leaves the list for the panel.
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('role'))).toBe('tabpanel');
  });

  test('manual activation: arrows only move focus; Enter and Space select', async ({ page }) => {
    await open(page, 'activation=manual');
    await tab(page, 'basic', 'general').focus();
    await page.keyboard.press('ArrowRight');
    expect(await focusedValue(page)).toBe('billing');
    expect(await selectedValue(page, 'basic')).toBe('general');
    await page.keyboard.press('Enter');
    expect(await selectedValue(page, 'basic')).toBe('billing');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    expect(await focusedValue(page)).toBe('notifications');
    await page.keyboard.press('Space');
    expect(await selectedValue(page, 'basic')).toBe('notifications');
    expect((await events(page)).filter((e) => e[0] === 'change')).toEqual([
      ['change', 'billing', 'general', 'keyboard'],
      ['change', 'notifications', 'billing', 'keyboard'],
    ]);
  });

  test('RTL mirrors ArrowLeft / ArrowRight', async ({ page }) => {
    await open(page, 'dir=rtl');
    await tab(page, 'basic', 'general').focus();
    await page.keyboard.press('ArrowLeft');
    expect(await focusedValue(page)).toBe('billing');
    await page.keyboard.press('ArrowRight');
    expect(await focusedValue(page)).toBe('general');
    const boxes = await Promise.all(['general', 'billing'].map((v) => tab(page, 'basic', v).boundingBox()));
    expect(boxes[1]!.x).toBeLessThan(boxes[0]!.x);
  });

  test('vertical placement uses ArrowUp / ArrowDown; ArrowRight does nothing', async ({ page }) => {
    await open(page, 'placement=start');
    await expect(page.locator('#basic [role="tablist"]')).toHaveAttribute('aria-orientation', 'vertical');
    await tab(page, 'basic', 'general').focus();
    await page.keyboard.press('ArrowRight');
    expect(await focusedValue(page)).toBe('general');
    await page.keyboard.press('ArrowDown');
    expect(await focusedValue(page)).toBe('billing');
    await page.keyboard.press('ArrowUp');
    expect(await focusedValue(page)).toBe('general');
    const list = await page.locator('#basic .salmon-tab-list').boundingBox();
    const panel = await visiblePanel(page, 'basic').boundingBox();
    expect(list!.x + list!.width).toBeLessThanOrEqual(panel!.x + 1);
  });

  for (const placement of ['top', 'bottom', 'end'] as const) {
    test(`placement="${placement}" arranges the list and panel`, async ({ page }) => {
      await open(page, `placement=${placement}`);
      const list = (await page.locator('#basic .salmon-tab-list').boundingBox())!;
      const panel = (await visiblePanel(page, 'basic').boundingBox())!;
      if (placement === 'top') expect(list.y + list.height).toBeLessThanOrEqual(panel.y + 1);
      if (placement === 'bottom') expect(panel.y + panel.height).toBeLessThanOrEqual(list.y + 1);
      if (placement === 'end') expect(panel.x + panel.width).toBeLessThanOrEqual(list.x + 1);
    });
  }

  test('a disabled Tabs skips every tab', async ({ page }) => {
    await open(page);
    await tab(page, 'disabled', 'q').click({ force: true });
    expect(await selectedValue(page, 'disabled')).toBe('p');
    await expect(page.locator('#disabled')).toHaveAttribute('data-disabled', '');
  });
});

test.describe('close', () => {
  test('the close button calls onClose; the selected neighbour takes over when the selected tab goes', async ({ page }) => {
    await open(page);
    await tab(page, 'closable', 'two').locator('.salmon-tab-close').click();
    await expect(tab(page, 'closable', 'two')).toHaveCount(0);
    expect(await selectedValue(page, 'closable')).toBe('three');
    expect(await events(page)).toEqual([
      ['close', 'two', 'pointer'],
      ['closable-change', 'three', 'api'],
    ]);
  });

  test('Delete on the focused closable tab calls onClose and moves focus to the next tab', async ({ page }) => {
    await open(page);
    await tab(page, 'closable', 'four').focus();
    await page.keyboard.press('Delete');
    await expect(tab(page, 'closable', 'four')).toHaveCount(0);
    expect(await focusedValue(page)).toBe('three');
    expect(await selectedValue(page, 'closable')).toBe('two');
    expect(await events(page)).toEqual([['close', 'four', 'keyboard']]);
    await expect(tab(page, 'closable', 'one')).toHaveAttribute('aria-keyshortcuts', 'Delete');
  });
});

test.describe('scroll overflow', () => {
  test('scroll buttons appear while the strip overflows and scroll by scrollStep', async ({ page }) => {
    await open(page);
    const wrap = page.locator('#scroll .salmon-tab-list');
    const strip = page.locator('#scroll [role="tablist"]');
    const back = wrap.locator('.salmon-tab-scroll[data-direction="backward"]');
    const forward = wrap.locator('.salmon-tab-scroll[data-direction="forward"]');
    await expect(back).toBeHidden();
    await expect(forward).toBeVisible();
    await forward.click();
    await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBe(50);
    await expect(back).toBeVisible();
    await back.click();
    await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBe(0);
    await expect(back).toBeHidden();
    // The scroll buttons never take focus.
    expect(await page.evaluate(() => document.activeElement?.classList.contains('salmon-tab-scroll'))).toBe(false);
  });

  test('keyboard focus scrolls the focused tab into view; End reaches the last tab', async ({ page }) => {
    await open(page);
    await tab(page, 'scroll', 't0').focus();
    await page.keyboard.press('End');
    await expect(tab(page, 'scroll', 't11')).toBeInViewport();
    const strip = await page.locator('#scroll [role="tablist"]').boundingBox();
    const last = await tab(page, 'scroll', 't11').boundingBox();
    expect(last!.x + last!.width).toBeLessThanOrEqual(strip!.x + strip!.width + 1);
  });

  test('vertical scroll strips scroll along the block axis', async ({ page }) => {
    await open(page);
    const strip = page.locator('#vscroll [role="tablist"]');
    await page.locator('#vscroll .salmon-tab-scroll[data-direction="forward"]').click();
    await expect.poll(() => strip.evaluate((el) => el.scrollTop)).toBe(50);
  });

  test('RTL scroll buttons scroll toward the inline end', async ({ page }) => {
    await open(page, 'dir=rtl');
    const strip = page.locator('#scroll [role="tablist"]');
    await page.locator('#scroll .salmon-tab-scroll[data-direction="forward"]').click();
    await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBe(-50);
  });
});

test.describe('menu overflow', () => {
  test('tabs that do not fit move into the More tabs menu; choosing one selects it and keeps it visible', async ({ page }) => {
    const problems = await open(page);
    const more = page.locator('#menu .salmon-tab-more');
    await expect(more).toBeVisible();
    await expect(tab(page, 'menu', 't11')).toBeHidden();
    await expect(tab(page, 'menu', 't0')).toBeVisible();
    await more.click();
    const menu = page.getByRole('menu', { name: 'More tabs' });
    await expect(menu).toBeVisible();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    await expect(menu.getByRole('menuitem', { name: 'Tab number 9' })).toHaveAttribute('aria-disabled', 'true');
    await menu.getByRole('menuitem', { name: 'Tab number 11' }).click();
    await expect(menu).toHaveCount(0);
    expect(await selectedValue(page, 'menu')).toBe('t11');
    // The selected tab is pinned in the visible strip.
    await expect(tab(page, 'menu', 't11')).toBeVisible();
    await expect.poll(() => focusedValue(page)).toBe('t11');
    const strip = (await page.locator('#menu .salmon-tab-list').boundingBox())!;
    const box = (await tab(page, 'menu', 't11').boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(strip.x + strip.width + 1);
    expect(await events(page)).toEqual([['menu-change', 't11', 'pointer']]);
    expect(problems).toEqual([]);
  });

  test('keyboard: ArrowDown opens the menu on the first item; Escape closes it and refocuses the button', async ({ page }) => {
    await open(page);
    const more = page.locator('#menu .salmon-tab-more');
    // The button stays hidden (not focusable) until the strip has measured its overflow.
    await expect(more).toBeVisible();
    await more.focus();
    await page.keyboard.press('ArrowDown');
    const menu = page.getByRole('menu', { name: 'More tabs' });
    await expect(menu).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('role'))).toBe('menuitem');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.classList.contains('salmon-tab-more'))).toBe(true);
  });

  test('arrow keys in the strip skip the overflowed tabs', async ({ page }) => {
    await open(page);
    // Wait until the strip has measured its overflow and hidden the tabs that do not fit.
    await expect(page.locator('#menu .salmon-tab-more')).toBeVisible();
    await expect(tab(page, 'menu', 't11')).toBeHidden();
    await tab(page, 'menu', 't0').focus();
    await page.keyboard.press('ArrowLeft');
    const v = await focusedValue(page);
    await expect(tab(page, 'menu', v)).toBeVisible();
    expect(v).not.toBe('t11');
  });

  test('a wider container shows every tab and hides the menu button', async ({ page }) => {
    await open(page);
    await page.locator('#menu').evaluate((el) => void ((el.parentElement as HTMLElement).style.width = '2000px'));
    await expect(page.locator('#menu .salmon-tab-more')).toBeHidden();
    await expect(tab(page, 'menu', 't11')).toBeVisible();
  });
});

test.describe('reorder', () => {
  test('Alt+ArrowRight moves the focused tab; onBeforeReorder can cancel', async ({ page }) => {
    await open(page);
    await tab(page, 'reorder', 'red').focus();
    await page.keyboard.press('Alt+ArrowRight');
    await expect(page.locator('#reorder [role="tab"]')).toHaveText(['green', 'red', 'blue', 'pinned']);
    await expect.poll(() => focusedValue(page)).toBe('red');
    await tab(page, 'reorder', 'pinned').focus();
    await page.keyboard.press('Alt+ArrowLeft');
    await expect(page.locator('#reorder [role="tab"]')).toHaveText(['green', 'red', 'blue', 'pinned']);
    await expect.poll(() => events(page)).toEqual([
      ['before-reorder', 'red', 0, 1, 'keyboard'],
      ['reorder', 'red', 0, 1, 'keyboard'],
      ['before-reorder', 'pinned', 3, 2, 'keyboard'],
    ]);
  });

  test('focus moved right after an Alt+Arrow move is not pulled back to the moved tab', async ({ page }) => {
    await open(page);
    // Load the reorder chunk first so the next move runs as soon as its import resolves.
    await tab(page, 'reorder', 'red').focus();
    await page.keyboard.press('Alt+ArrowRight');
    await expect(page.locator('#reorder [role="tab"]')).toHaveText(['green', 'red', 'blue', 'pinned']);
    // Press Alt+ArrowRight on red, then move focus to pinned before the move lands.
    const focused = await page.evaluate(async () => {
      const q = (v: string) => document.querySelector<HTMLElement>(`#reorder [role="tab"][data-value="${v}"]`)!;
      q('red').focus();
      q('red').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true, cancelable: true }));
      q('pinned').focus();
      for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r));
      return (document.activeElement as HTMLElement | null)?.dataset['value'] ?? '';
    });
    await expect(page.locator('#reorder [role="tab"]')).toHaveText(['green', 'blue', 'red', 'pinned']);
    expect(focused).toBe('pinned');
  });

  test('pointer drag moves a tab with a transform preview and no selection change', async ({ page }) => {
    await open(page);
    const red = (await tab(page, 'reorder', 'red').boundingBox())!;
    const blue = (await tab(page, 'reorder', 'blue').boundingBox())!;
    await page.mouse.move(red.x + red.width / 2, red.y + red.height / 2);
    await page.mouse.down();
    await page.mouse.move(red.x + red.width / 2 + 10, red.y + red.height / 2, { steps: 2 });
    await page.mouse.move(blue.x + blue.width / 2 + 4, red.y + red.height / 2, { steps: 5 });
    await expect(tab(page, 'reorder', 'red')).toHaveAttribute('data-dragging', '');
    expect(await tab(page, 'reorder', 'red').evaluate((el) => el.style.transform)).toMatch(/^translateX\(/);
    await page.mouse.up();
    await expect(page.locator('#reorder [role="tab"]')).toHaveText(['green', 'blue', 'red', 'pinned']);
    expect(await tab(page, 'reorder', 'red').evaluate((el) => el.style.transform)).toBe('');
    expect((await events(page)).filter((e) => e[0] === 'reorder')).toEqual([['reorder', 'red', 0, 2, 'pointer']]);
  });

  test('the drag chunk loads lazily and a plain click still selects', async ({ page }) => {
    const chunks: string[] = [];
    page.on('request', (r) => {
      if (/reorder/.test(r.url())) chunks.push(r.url());
    });
    await open(page);
    expect(chunks).toEqual([]);
    await tab(page, 'reorder', 'green').click();
    await expect(tab(page, 'reorder', 'green')).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => chunks.length).toBeGreaterThan(0);
  });
});

test.describe('panel mounting', () => {
  test('lazy mounts on first selection and keeps; active unmounts; eager mounts every panel', async ({ page }) => {
    await open(page, 'mode=plain');
    expect(await mounts(page)).toMatchObject({ 'lazy-a': 1, 'active-a': 1, 'eager-a': 1, 'eager-b': 1 });
    expect((await mounts(page))['lazy-b']).toBeUndefined();
    for (const m of ['lazy', 'active']) await tab(page, `mount-${m}`, 'b').click();
    for (const m of ['lazy', 'active']) await tab(page, `mount-${m}`, 'a').click();
    const after = await mounts(page);
    expect(after['lazy-a']).toBe(1);
    expect(after['lazy-b']).toBe(1);
    expect(after['active-a']).toBe(2);
    await expect(page.locator('#mount-lazy [data-content="lazy-b"]')).toHaveCount(1);
    await expect(page.locator('#mount-active [data-content="active-b"]')).toHaveCount(0);
  });
});

test.describe('SSR and hydration', () => {
  test('server markup hydrates without warnings; the server rendered the selected panel only', async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto(`${URL}?mode=hydrate`);
    await page.waitForFunction(() => (window as unknown as { __hydrated?: boolean }).__hydrated === true);
    const html = await page.evaluate(() => (window as unknown as { __ssrHtml: string }).__ssrHtml);
    expect(html).toMatch(/data-content="basic-general"/);
    expect(html).not.toMatch(/data-content="basic-billing"/);
    expect(html).toContain('data-content="eager-b"');
    await tab(page, 'basic', 'billing').click();
    await expect(visiblePanel(page, 'basic')).toHaveText('Panel billing');
    await expect(page.locator('#menu .salmon-tab-more')).toBeVisible();
    expect(problems).toEqual([]);
  });
});

test.describe('performance (tabs selection change)', () => {
  test('a selection change commits within 16 ms (to painted on the next frame)', { tag: '@perf' }, async ({ page }) => {
    await open(page, 'mode=plain');
    await tab(page, 'basic', 'billing').click();
    const samples: number[] = [];
    for (const v of ['general', 'notifications', 'billing', 'general', 'notifications', 'billing']) {
      samples.push(
        await page.evaluate(
          (value) =>
            new Promise<number>((resolve) => {
              const el = document.querySelector<HTMLElement>(`#basic [role="tab"][data-value="${value}"]`)!;
              const start = performance.now();
              el.click();
              // Work until the committed DOM shows the new selection (the frame itself then paints it).
              setTimeout(() => resolve(el.getAttribute('aria-selected') === 'true' ? performance.now() - start : Infinity), 0);
            }),
          v,
        ),
      );
    }
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)] as number;
    // Infinity: the selection never committed (a functional failure, not a timing miss).
    expect(median).not.toBe(Infinity);
    expectBudget(median, 16, 'Tabs selection change to committed median');
  });
});

test.describe('tab metrics (visual consistency)', () => {
  test('close and more buttons are square with a 16px mask glyph, not a font character', async ({ page }) => {
    await open(page);
    const glyph = (el: Element) => {
      const r = el.getBoundingClientRect();
      const g = getComputedStyle(el, '::before');
      return { square: r.width === r.height, w: g.width, h: g.height, content: g.content, mask: g.maskImage.startsWith('url(') };
    };
    const want = { square: true, w: '16px', h: '16px', content: '""', mask: true };
    expect(await tab(page, 'closable', 'two').locator('.salmon-tab-close').evaluate(glyph)).toEqual(want);
    expect(await page.locator('#menu .salmon-tab-more').evaluate(glyph)).toEqual(want);
  });
});
