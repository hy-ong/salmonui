import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, trackModules, waitForModule } from './helpers.ts';

// SidebarLayout behavior:
// push track sizes, rail, side, open triad and cancellable events, outside
// press, focus return, collapseBelow switching and hydration.
// Page: examples/vite-spa/sidebar-layout.html.

const URL = `${DEV_URL}sidebar-layout.html`;
type Events = unknown[][];

const events = (page: Page) => page.evaluate(() => (window as unknown as { __events: Events }).__events);
/** Events of the other layouts (#push closes on any press outside it). */
const eventsOf = async (page: Page, ...names: string[]) => (await events(page)).filter((e) => names.includes(e[0] as string));
const clearEvents = (page: Page) => page.evaluate(() => void ((window as unknown as { __events: Events }).__events.length = 0));
const width = (page: Page, selector: string) => page.locator(selector).evaluate((el) => el.getBoundingClientRect().width);
const panel = (page: Page, layout: string) => page.locator(`#${layout} .salmon-sidebar-panel`);
const main = (page: Page, layout: string) => page.locator(`#${layout} .salmon-sidebar-main`);
const focusedId = (page: Page) => page.evaluate(() => document.activeElement?.id ?? '');

async function open(page: Page, query = ''): Promise<string[]> {
  const problems = collectProblems(page);
  trackModules(page);
  await page.goto(`${URL}${query}`);
  await expect(page.locator('#push')).toBeVisible();
  return problems;
}

/** Waits until the panel's inline-size transition settles. */
async function settled(page: Page, selector: string, expected: number): Promise<void> {
  await expect.poll(() => width(page, selector), { timeout: 3000 }).toBeCloseTo(expected, 0);
}

test.describe('push mode', () => {
  test('the panel takes `size` and the main content shrinks; closing collapses the track to 0', async ({ page }) => {
    const problems = await open(page);
    const total = await page.locator('#push').evaluate((el) => el.clientWidth);
    await settled(page, '#push .salmon-sidebar-panel', 200);
    expect(await width(page, '#push .salmon-sidebar-main')).toBeCloseTo(total - 200, 0);
    await page.click('#push-trigger');
    await expect(panel(page, 'push')).toHaveAttribute('data-state', 'closed');
    await settled(page, '#push .salmon-sidebar-panel', 0);
    expect(await width(page, '#push .salmon-sidebar-main')).toBeCloseTo(total, 0);
    await expect(panel(page, 'push')).toBeHidden();
    await expect(page.locator('#push-trigger')).toHaveAttribute('aria-expanded', 'false');
    await page.click('#push-trigger');
    await settled(page, '#push .salmon-sidebar-panel', 200);
    await expect(page.locator('#push-trigger')).toHaveAttribute('aria-expanded', 'true');
    expect(problems).toEqual([]);
  });

  test('the default size is 16rem', async ({ page }) => {
    await open(page);
    await settled(page, '#controlled .salmon-sidebar-panel', 256);
  });
});

test.describe('open triad and events', () => {
  test('onBeforeOpenChange runs before onOpenChange with reason and source; preventDefault cancels', async ({ page }) => {
    await open(page);
    await page.click('#push-trigger');
    await page.focus('#push-trigger');
    await page.keyboard.press('Enter');
    expect(await events(page)).toEqual([
      ['before', false, 'trigger', 'pointer'],
      ['open', false, 'trigger', 'pointer'],
      ['before', true, 'trigger', 'keyboard'],
      ['open', true, 'trigger', 'keyboard'],
    ]);
    await clearEvents(page);
    await page.evaluate(() => ((window as unknown as { __veto: boolean }).__veto = true));
    await page.click('#push-trigger');
    expect(await events(page)).toEqual([['before', false, 'trigger', 'pointer']]);
    await expect(panel(page, 'push')).toHaveAttribute('data-state', 'open');
  });

  test('controlled open: the trigger proposes, the prop decides', async ({ page }) => {
    await open(page);
    await page.click('#controlled-trigger');
    expect(await eventsOf(page, 'controlled')).toEqual([['controlled', false, 'trigger', 'pointer']]);
    await expect(panel(page, 'controlled')).toHaveAttribute('data-state', 'open');
    await page.evaluate(() => (window as unknown as { __setOpen: (open: boolean) => void }).__setOpen(false));
    await expect(panel(page, 'controlled')).toHaveAttribute('data-state', 'closed');
    await expect(page.locator('#controlled-trigger')).toHaveAttribute('aria-expanded', 'false');
  });

  test('switching from uncontrolled to controlled logs a development warning', async ({ page }) => {
    const problems = await open(page, '?warnings');
    await expect.poll(() => problems.join('\n')).toContain('SidebarLayout open from uncontrolled to controlled');
  });
});

test.describe('rail and side', () => {
  test('the collapse trigger shrinks the open panel to railSize and back', async ({ page }) => {
    await open(page);
    await settled(page, '#rail .salmon-sidebar-panel', 256);
    await page.click('#rail-trigger');
    await expect(panel(page, 'rail')).toHaveAttribute('data-collapsed', '');
    await settled(page, '#rail .salmon-sidebar-panel', 48);
    await expect(panel(page, 'rail')).toBeVisible();
    await expect(page.locator('#rail-trigger')).toHaveAttribute('aria-expanded', 'false');
    await page.click('#rail-trigger');
    await settled(page, '#rail .salmon-sidebar-panel', 256);
    expect(await eventsOf(page, 'collapsed')).toEqual([
      ['collapsed', true, 'pointer'],
      ['collapsed', false, 'pointer'],
    ]);
  });

  test("side='end' puts the panel at the inline end, mirrored under dir=rtl", async ({ page }) => {
    await open(page);
    const ltrPanel = await page.locator('#end .salmon-sidebar-panel').boundingBox();
    const ltrMain = await page.locator('#end .salmon-sidebar-main').boundingBox();
    expect(ltrPanel!.x).toBeGreaterThan(ltrMain!.x);
    const startPanel = await page.locator('#push .salmon-sidebar-panel').boundingBox();
    const startMain = await page.locator('#push .salmon-sidebar-main').boundingBox();
    expect(startPanel!.x).toBeLessThan(startMain!.x);
    await page.goto(`${URL}?dir=rtl`);
    const rtlPanel = await page.locator('#end .salmon-sidebar-panel').boundingBox();
    const rtlMain = await page.locator('#end .salmon-sidebar-main').boundingBox();
    expect(rtlPanel!.x).toBeLessThan(rtlMain!.x);
    const rtlStart = await page.locator('#push .salmon-sidebar-panel').boundingBox();
    const rtlStartMain = await page.locator('#push .salmon-sidebar-main').boundingBox();
    expect(rtlStart!.x).toBeGreaterThan(rtlStartMain!.x);
  });
});

test.describe('outside press and focus', () => {
  test('closeOnOutsidePress: a press outside the panel closes it; the trigger and the panel do not', async ({ page }) => {
    await open(page);
    // closeOnOutsidePress is handled by the adaptive chunk, loaded after mount (SidebarLayout.tsx useLazy).
    await waitForModule(page, /\/sidebar-layout\/adaptive\.js(\?|$)/);
    await page.click('#push-link-1');
    await expect(panel(page, 'push')).toHaveAttribute('data-state', 'open');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __events: Events }).__events.length)).toBe(0);
    await page.click('#push-outside');
    await expect(panel(page, 'push')).toHaveAttribute('data-state', 'closed');
    expect((await events(page)).at(-1)).toEqual(['open', false, 'outside', 'pointer']);
    // A layout without closeOnOutsidePress ignores outside presses.
    await page.click('#adaptive-outside');
    await expect(panel(page, 'rail')).toHaveAttribute('data-state', 'open');
  });

  test('focus inside a closing push panel moves to its trigger; a closed panel is out of the tab order', async ({ page }) => {
    await open(page);
    await page.focus('#controlled-link-1');
    await page.evaluate(() => (window as unknown as { __setOpen: (open: boolean) => void }).__setOpen(false));
    await expect(panel(page, 'controlled')).toHaveAttribute('data-state', 'closed');
    expect(await focusedId(page)).toBe('controlled-trigger');
    await expect(panel(page, 'controlled')).toHaveAttribute('inert', '');
    await page.keyboard.press('Shift+Tab');
    expect(await focusedId(page)).not.toBe('controlled-link-2');
  });

  test('the panel stays inside the layout box (bounded to its own element)', async ({ page }) => {
    await open(page);
    const layout = (await page.locator('#rail').boundingBox())!;
    const box = (await panel(page, 'rail').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(layout.x);
    expect(box.y).toBeGreaterThanOrEqual(layout.y);
    expect(box.y + box.height).toBeLessThanOrEqual(layout.y + layout.height + 0.5);
  });
});

test.describe('collapseBelow', () => {
  test('container width: wide renders push; narrow switches to the overlay presentation, closed, and back', async ({ page }) => {
    await open(page);
    await expect(panel(page, 'adaptive')).toHaveAttribute('data-presentation', 'push');
    await settled(page, '#adaptive .salmon-sidebar-panel', 256);
    await page.locator('#adaptive-host').evaluate((el) => ((el as HTMLElement).style.inlineSize = '500px'));
    await expect(panel(page, 'adaptive')).toHaveAttribute('data-presentation', 'overlay');
    await expect(panel(page, 'adaptive')).toHaveAttribute('data-state', 'closed');
    await expect(panel(page, 'adaptive')).toBeHidden();
    expect(await width(page, '#adaptive .salmon-sidebar-main')).toBeCloseTo(500 - 2, 0);
    await page.click('#adaptive-trigger');
    await expect(panel(page, 'adaptive')).toBeVisible();
    // Overlay: the main content keeps its full width under the panel.
    expect(await width(page, '#adaptive .salmon-sidebar-main')).toBeCloseTo(500 - 2, 0);
    await page.locator('#adaptive-host').evaluate((el) => ((el as HTMLElement).style.inlineSize = '900px'));
    await expect(panel(page, 'adaptive')).toHaveAttribute('data-presentation', 'push');
    await expect(panel(page, 'adaptive')).toHaveAttribute('data-state', 'open');
    expect(await eventsOf(page, 'adaptive')).toEqual([
      ['adaptive', false, 'breakpoint'],
      ['adaptive', true, 'trigger'],
    ]);
  });

  test('a narrow container at load starts in the overlay presentation, closed', async ({ page }) => {
    const problems = await open(page, '?w=400');
    await expect(panel(page, 'adaptive')).toHaveAttribute('data-presentation', 'overlay');
    await expect(panel(page, 'adaptive')).toHaveAttribute('data-state', 'closed');
    await expect(page.locator('#adaptive-trigger')).toHaveAttribute('aria-expanded', 'false');
    expect(problems).toEqual([]);
  });

  test('a media query string follows the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 900 });
    await open(page);
    await expect(panel(page, 'media')).toHaveAttribute('data-presentation', 'push');
    await page.setViewportSize({ width: 600, height: 900 });
    await expect(panel(page, 'media')).toHaveAttribute('data-presentation', 'overlay');
    await expect(panel(page, 'media')).toBeHidden();
  });
});

test.describe('SSR and hydration', () => {
  test('hydration reports nothing; before JavaScript the CSS already hides a narrow panel', async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto(`${URL}?mode=hydrate&w=400`);
    await page.waitForFunction(() => (window as unknown as { __hydrated?: boolean }).__hydrated === true);
    const html = await page.evaluate(() => (window as unknown as { __ssrHtml: string }).__ssrHtml);
    expect(html).toContain('@container salmon-sidebar-layout (width < 600px)');
    expect(html).not.toMatch(/id="adaptive"[^>]*data-presentation/);
    await expect(panel(page, 'adaptive')).toHaveAttribute('data-presentation', 'overlay');
    await expect(panel(page, 'adaptive')).toBeHidden();
    await expect(panel(page, 'push')).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('the server-only CSS rule alone hides the panel below the breakpoint', async ({ page }) => {
    await open(page);
    const html = await page.evaluate(() => {
      const host = document.createElement('div');
      host.style.inlineSize = '400px';
      host.innerHTML =
        '<div class="salmon-sidebar-layout" data-layout="x"><style>@container salmon-sidebar-layout (width < 600px){.salmon-sidebar-panel[data-layout="x"]:not([data-presentation]){position:absolute;inset-inline-start:0;inline-size:var(--salmon-sidebar-size);visibility:hidden}}</style><aside id="ssr-only" class="salmon-sidebar-panel" data-layout="x" data-state="open">x</aside><div class="salmon-sidebar-main">m</div></div>';
      document.body.append(host);
      return getComputedStyle(host.querySelector('#ssr-only')!).visibility;
    });
    expect(html).toBe('hidden');
  });
});

test.describe('overlay mode through the Layout Drawer', () => {
  const drawer = (page: Page) => page.locator('#overlay dialog.salmon-drawer');
  /** The overlay presentation is a lazy chunk (parts.tsx useLazy); until it mounts the panel shows without the modal Drawer. */
  const modal = (page: Page) => expect.poll(() => drawer(page).evaluate((el) => el.matches(':modal'))).toBe(true);

  test('the panel opens in a modal Drawer: top layer, backdrop, inert background, focus moves in', async ({ page }) => {
    const problems = await open(page);
    await page.click('#overlay-trigger');
    await expect(panel(page, 'overlay')).toBeVisible();
    await modal(page);
    await expect(drawer(page)).toHaveAccessibleName('Overlay panel');
    expect(await focusedId(page)).toBe('overlay-link-1');
    // Tab stays inside the modal drawer.
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('dialog.salmon-drawer') || document.activeElement === document.body)).toBe(true);
    }
    // The background is inert: a click on another layout's trigger does nothing. #controlled-trigger
    // stays clear of the drawer box; #push-trigger lies under the drawer once its open transition
    // finished (under the first link when #push closed on the outside press), so a click there
    // depended on the transition's progress.
    await clearEvents(page);
    await page.locator('#controlled-trigger').click({ force: true });
    expect(await eventsOf(page, 'controlled')).toEqual([]);
    expect(problems).toEqual([]);
  });

  test('Escape and a backdrop press close it; focus returns to the trigger', async ({ page }) => {
    await open(page);
    await page.click('#overlay-trigger');
    await expect(panel(page, 'overlay')).toBeVisible();
    await modal(page);
    await page.keyboard.press('Escape');
    await expect(panel(page, 'overlay')).toBeHidden();
    await expect(page.locator('#overlay-trigger')).toBeFocused();
    await expect(page.locator('#overlay-trigger')).toHaveAttribute('aria-expanded', 'false');
    await page.click('#overlay-trigger');
    await expect(panel(page, 'overlay')).toBeVisible();
    const box = (await drawer(page).boundingBox())!;
    const vw = page.viewportSize()!.width;
    await page.mouse.click(box.x + box.width > vw - 20 ? 10 : vw - 10, box.y + 20);
    await expect(panel(page, 'overlay')).toBeHidden();
    await expect(page.locator('#overlay-trigger')).toBeFocused();
  });
});
