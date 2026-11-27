import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// Carousel (page:
// examples/vite-spa/src/carousel.tsx). ARIA and axe checks are in
// carousel-a11y.spec.ts.

interface Log {
  changes: { index: number; previousIndex: number; source: string }[];
  before: { index: number; source: string }[];
  playing: { playing: boolean; source: string }[];
}

const url = (query = ''): string => `${DEV_URL}carousel.html${query ? `?${query}` : ''}`;
const root = (page: Page) => page.locator('.salmon-carousel');
const track = (page: Page) => page.locator('.salmon-carousel-track');
const slide = (page: Page, i: number) => page.locator('.salmon-carousel-slide').nth(i);
const log = (page: Page): Promise<Log> => page.evaluate(() => (window as unknown as { __carousel: Log }).__carousel);

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(url(query));
  await expect(root(page)).toHaveAttribute('data-ready', '');
}

/** Index of the slide whose center is at the track's center (what the user sees). */
const shown = (page: Page): Promise<number> =>
  track(page).evaluate((t) => {
    const r = t.getBoundingClientRect();
    const c = r.left + r.width / 2;
    return [...t.children].findIndex((s) => {
      const b = s.getBoundingClientRect();
      return b.left <= c && b.right >= c && getComputedStyle(s).visibility !== 'hidden';
    });
  });

/**
 * Moves the mouse over `target` (the track by default) without `hover()`: its scroll-into-view
 * step ends a smooth slide scroll in flight (Chromium fires `scrollend` there), and the
 * carousel then rightly follows the slide the track stopped at.
 */
async function mouseOver(page: Page, target = track(page)): Promise<void> {
  const box = await target.boundingBox();
  await page.mouse.move((box?.x ?? 0) + (box?.width ?? 0) / 2, (box?.y ?? 0) + (box?.height ?? 0) / 2);
}

const active = (page: Page) => page.locator('.salmon-carousel-slide[data-active]');

/**
 * Waits until the track stopped scrolling and the carousel's settle check (`scrollend` + 50 ms,
 * Carousel.tsx) has run: a press before that lets the pending check of the previous scroll see
 * the old snapped slide.
 */
const settled = (page: Page) =>
  expect
    .poll(() =>
      page.evaluate(() => {
        const w = window as unknown as { __lastScroll: number; __lastScrollEnd: number };
        return w.__lastScrollEnd >= w.__lastScroll && performance.now() - Math.max(w.__lastScroll, w.__lastScrollEnd) > 150;
      }),
    )
    .toBe(true);

async function expectAt(page: Page, i: number): Promise<void> {
  await expect(active(page)).toHaveAttribute('data-index', String(i));
  await expect.poll(() => shown(page)).toBe(i);
  await settled(page);
}

test.describe('Carousel', () => {
  // Track scrolling for `settled` (element scroll events reach a capturing document listener).
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __lastScroll: number; __lastScrollEnd: number };
      w.__lastScroll = 0;
      w.__lastScrollEnd = 0;
      document.addEventListener('scroll', () => (w.__lastScroll = performance.now()), { capture: true, passive: true });
      document.addEventListener('scrollend', () => (w.__lastScrollEnd = performance.now()), { capture: true });
    });
  });

  test('renders every slide in a scroll-snap track; next/previous scroll it', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page);
    await expect(page.locator('.salmon-carousel-slide')).toHaveCount(5);
    expect(await track(page).evaluate((t) => getComputedStyle(t).scrollSnapType)).toBe('x mandatory');
    await expectAt(page, 0);
    await page.locator('.salmon-carousel-next').click();
    await expectAt(page, 1);
    await expect(page.locator('.salmon-carousel-indicator').nth(1)).toHaveAttribute('aria-current', 'true');
    await page.locator('.salmon-carousel-previous').click();
    await expectAt(page, 0);
    await page.locator('.salmon-carousel-indicator').nth(3).click();
    await expectAt(page, 3);
    const l = await log(page);
    expect(l.changes).toEqual([
      { index: 1, previousIndex: 0, source: 'pointer' },
      { index: 0, previousIndex: 1, source: 'pointer' },
      { index: 3, previousIndex: 0, source: 'pointer' },
    ]);
    expect(l.before.map((b) => b.index)).toEqual([1, 0, 3]);
    expect(problems).toEqual([]);
  });

  test('a native scroll (swipe, wheel) updates index after the scroll settles', async ({ page }) => {
    await open(page);
    await track(page).evaluate((t) => t.scrollBy({ left: t.clientWidth, behavior: 'instant' }));
    await expect(active(page)).toHaveAttribute('data-index', '1');
    await track(page).hover();
    await page.mouse.wheel(600, 0);
    await expect(active(page)).toHaveAttribute('data-index', '2');
    const changes = (await log(page)).changes;
    expect(changes.map((c) => c.source)).toEqual(['scroll', 'scroll']);
    expect(changes.map((c) => c.index)).toEqual([1, 2]);
  });

  test('onBeforeIndexChange preventDefault keeps the slide, also for a scroll that snapped elsewhere', async ({ page }) => {
    await open(page, 'veto');
    await page.locator('.salmon-carousel-indicator').nth(2).click();
    await expectAt(page, 0);
    await page.locator('.salmon-carousel-next').click();
    await expectAt(page, 1);
    await page.locator('.salmon-carousel-next').click();
    await expectAt(page, 1);
    // Let the smooth scroll to slide 2 finish, then scroll on to slide 3 natively.
    await page.waitForTimeout(600);
    await track(page).evaluate((t) => t.scrollBy({ left: t.clientWidth, behavior: 'instant' }));
    await expect.poll(async () => (await log(page)).before.length).toBe(4);
    // The vetoed scroll returns to the committed slide.
    await expectAt(page, 1);
    const l = await log(page);
    expect(l.changes.map((c) => c.index)).toEqual([1]);
    expect(l.before).toEqual([
      { index: 2, source: 'pointer' },
      { index: 1, source: 'pointer' },
      { index: 2, source: 'pointer' },
      { index: 2, source: 'scroll' },
    ]);
  });

  test('controlled index: a proposal the parent ignores scrolls back; __setIndex moves it', async ({ page }) => {
    await open(page, 'controlled&frozen');
    await page.locator('.salmon-carousel-next').click();
    await expectAt(page, 0);
    expect((await log(page)).changes).toEqual([{ index: 1, previousIndex: 0, source: 'pointer' }]);
    await track(page).evaluate((t) => t.scrollBy({ left: t.clientWidth, behavior: 'instant' }));
    await expect.poll(async () => (await log(page)).changes.length).toBe(2);
    expect((await log(page)).changes[1]).toEqual({ index: 1, previousIndex: 0, source: 'scroll' });
    await expectAt(page, 0);
    await page.evaluate(() => (window as unknown as { __setIndex(i: number): void }).__setIndex(3));
    await expectAt(page, 3);
  });

  test('keyboard: arrows, Home and End on the focused carousel; mirrored in RTL', async ({ page }) => {
    await open(page);
    await track(page).focus();
    await page.keyboard.press('ArrowRight');
    await expectAt(page, 1);
    await page.keyboard.press('End');
    await expectAt(page, 4);
    await page.keyboard.press('Home');
    await expectAt(page, 0);
    await page.keyboard.press('ArrowLeft');
    await expectAt(page, 4);
    expect((await log(page)).changes.every((c) => c.source === 'keyboard')).toBe(true);

    await open(page, 'dir=rtl');
    await track(page).focus();
    await page.keyboard.press('ArrowLeft');
    await expectAt(page, 1);
    // The next button sits at inline-end (the left edge) and the second slide is left of the first.
    const [next, tr] = await Promise.all([page.locator('.salmon-carousel-next').boundingBox(), track(page).boundingBox()]);
    expect(next!.x).toBeLessThan(tr!.x + tr!.width / 2);
    await page.keyboard.press('ArrowRight');
    await expectAt(page, 0);
    const [a, b] = await Promise.all([slide(page, 0).boundingBox(), slide(page, 1).boundingBox()]);
    expect(b!.x).toBeLessThan(a!.x);
  });

  test('server render places defaultIndex by CSS and hydrates with zero warnings', async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto(url('hydrate&index=2'));
    await page.waitForFunction(() => (window as unknown as { __hydrated?: boolean }).__hydrated === true);
    const html = await page.evaluate(() => (window as unknown as { __ssrHtml: string }).__ssrHtml);
    expect(html).toContain('--salmon-carousel-index:2');
    expect(html).not.toContain('data-ready');
    await expect(root(page)).toHaveAttribute('data-ready', '');
    await expectAt(page, 2);
    await page.locator('.salmon-carousel-next').click();
    await expectAt(page, 3);
    expect(problems).toEqual([]);
  });

  test('the CSS offset shows the selected slide before mount, in LTR and RTL', async ({ page }) => {
    for (const dir of ['ltr', 'rtl']) {
      await page.goto(url(`index=3&dir=${dir}`));
      // Strip the mount marker: the server markup's offset alone must put slide 4 in view.
      await expect(root(page)).toHaveAttribute('data-ready', '');
      await track(page).evaluate((t) => {
        t.scrollTo({ left: 0, behavior: 'instant' });
        t.parentElement!.parentElement!.removeAttribute('data-ready');
      });
      expect(await shown(page)).toBe(3);
    }
  });

  test('loop jumps back without clones; loop={false} disables the edge buttons', async ({ page }) => {
    await open(page, 'index=4');
    await expectAt(page, 4);
    await page.locator('.salmon-carousel-next').click();
    await expectAt(page, 0);
    await page.locator('.salmon-carousel-previous').click();
    await expectAt(page, 4);
    await expect(page.locator('.salmon-carousel-slide')).toHaveCount(5);

    await open(page, 'loop=0');
    await expect(page.locator('.salmon-carousel-previous')).toBeDisabled();
    await page.locator('.salmon-carousel-indicator').nth(4).click();
    await expectAt(page, 4);
    await expect(page.locator('.salmon-carousel-next')).toBeDisabled();
    await track(page).focus();
    await page.keyboard.press('ArrowRight');
    await expectAt(page, 4);
  });

  test('auto-play advances, pauses on hover and on focus within, and the button stops it', async ({ page }) => {
    await page.mouse.move(0, 0);
    await open(page, 'autoPlay=300');
    await expect(active(page)).toHaveAttribute('data-index', '1', { timeout: 2000 });
    expect((await log(page)).changes[0]).toEqual({ index: 1, previousIndex: 0, source: 'autoPlay' });
    await expect(track(page)).toHaveAttribute('aria-live', 'off');
    // Hover pauses.
    await mouseOver(page);
    const atHover = Number(await active(page).getAttribute('data-index'));
    await page.waitForTimeout(900);
    await expect(active(page)).toHaveAttribute('data-index', String(atHover));
    await page.mouse.move(0, 0);
    await expect(active(page)).not.toHaveAttribute('data-index', String(atHover), { timeout: 2000 });
    // Keyboard focus within pauses; the play/pause button is the first tab stop inside the carousel.
    await page.locator('#before').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('.salmon-carousel-play')).toBeFocused();
    const atFocus = Number(await active(page).getAttribute('data-index'));
    await page.waitForTimeout(900);
    await expect(active(page)).toHaveAttribute('data-index', String(atFocus));
    await page.keyboard.press('Enter');
    await expect(page.locator('.salmon-carousel-play')).toHaveAttribute('aria-label', 'Start automatic slide show');
    await expect(track(page)).toHaveAttribute('aria-live', 'polite');
    expect((await log(page)).playing).toEqual([{ playing: false, source: 'keyboard' }]);
    await page.locator('#after').focus();
    const stopped = Number(await active(page).getAttribute('data-index'));
    await page.waitForTimeout(900);
    await expect(active(page)).toHaveAttribute('data-index', String(stopped));
  });

  test('the hover pause survives a slide change made under the mouse', async ({ page }) => {
    await page.mouse.move(0, 0);
    await open(page, 'autoPlay=300');
    await mouseOver(page, page.locator('.salmon-carousel-next'));
    await page.mouse.down();
    await page.mouse.up();
    await expect.poll(async () => (await log(page)).changes.at(-1)?.source).toBe('pointer');
    const at = Number(await active(page).getAttribute('data-index'));
    // Still under the mouse: no automatic move after the manual one.
    await page.waitForTimeout(900);
    await expect(active(page)).toHaveAttribute('data-index', String(at));
    expect((await log(page)).changes.at(-1)?.source).toBe('pointer');
  });

  test('pauseOnHover: false keeps rotating under the mouse', async ({ page }) => {
    await open(page, 'autoPlay=250&hoverPause=0');
    await mouseOver(page);
    await expect(page.locator('.salmon-carousel:hover')).toHaveCount(1);
    // Count the automatic moves made under the mouse: polling the active slide can miss a
    // slide that is active for only one 250 ms interval.
    const from = (await log(page)).changes.length;
    await expect
      .poll(async () => (await log(page)).changes.slice(from).filter((c) => c.source === 'autoPlay').length, { timeout: 3000 })
      .toBeGreaterThanOrEqual(2);
    await expect(page.locator('.salmon-carousel:hover')).toHaveCount(1);
  });

  test('prefers-reduced-motion: auto-play waits for play; moves are instant', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, 'autoPlay=200');
    await expect(page.locator('.salmon-carousel-play')).toHaveAttribute('aria-label', 'Start automatic slide show');
    expect((await log(page)).playing).toEqual([{ playing: false, source: 'reducedMotion' }]);
    await page.waitForTimeout(600);
    await expect(active(page)).toHaveAttribute('data-index', '0');
    await page.locator('.salmon-carousel-next').click();
    // Instant: in place on the next frame.
    await page.evaluate(() => new Promise(requestAnimationFrame));
    expect(await shown(page)).toBe(1);
    await page.locator('.salmon-carousel-play').click();
    await expect(active(page)).toHaveAttribute('data-index', '2', { timeout: 2000 });
  });

  test("effect 'fade' stacks the slides in one cell; inactive slides are hidden and inert", async ({ page }) => {
    await open(page, 'effect=fade');
    const boxes = await Promise.all([slide(page, 0).boundingBox(), slide(page, 1).boundingBox()]);
    expect(boxes[0]).toEqual(boxes[1]);
    await page.locator('.salmon-carousel-next').click();
    await expect(active(page)).toHaveAttribute('data-index', '1');
    await expect(slide(page, 1)).toHaveCSS('opacity', '1');
    await expect(slide(page, 0)).toHaveCSS('opacity', '0');
    await expect(slide(page, 0)).toHaveAttribute('inert', '');
    await expect(slide(page, 0).getByRole('link')).toBeHidden();
    await page.locator('.salmon-carousel-indicator').nth(1).focus();
    await page.keyboard.press('ArrowRight');
    await expect(active(page)).toHaveAttribute('data-index', '2');
  });

  test('peek shows the neighbours at the edges', async ({ page }) => {
    await open(page, 'peek&index=1');
    await expectAt(page, 1);
    const [t, prev, cur, next] = await Promise.all([track(page).boundingBox(), slide(page, 0).boundingBox(), slide(page, 1).boundingBox(), slide(page, 2).boundingBox()]);
    expect(cur!.width).toBeLessThan(t!.width * 0.9);
    expect(prev!.x + prev!.width).toBeGreaterThan(t!.x + 1);
    expect(next!.x).toBeLessThan(t!.x + t!.width - 1);
  });

  test("controls 'hover' reveal on hover and focus; 'hidden' renders none", async ({ page }) => {
    await page.mouse.move(0, 0);
    await open(page, 'controls=hover');
    const next = page.locator('.salmon-carousel-next');
    await expect(next).toHaveCSS('opacity', '0');
    await track(page).hover();
    await expect(next).toHaveCSS('opacity', '1');
    await page.mouse.move(0, 0);
    await expect(next).toHaveCSS('opacity', '0');
    await track(page).focus();
    await expect(next).toHaveCSS('opacity', '1');
    await open(page, 'controls=hidden');
    await expect(page.locator('.salmon-carousel-next, .salmon-carousel-previous')).toHaveCount(0);
  });

  test('indicator types: dynamic, fraction, progress', async ({ page }) => {
    await open(page, 'indicators=dynamic&n=8');
    await expect(page.locator('.salmon-carousel-indicator:visible')).toHaveCount(3);
    await page.locator('.salmon-carousel-indicator').nth(2).click();
    await expect(page.locator('.salmon-carousel-indicator:visible')).toHaveCount(5);
    await open(page, 'indicators=fraction');
    await expect(page.locator('.salmon-carousel-indicators')).toHaveText('1 / 5');
    await page.locator('.salmon-carousel-next').click();
    await expect(page.locator('.salmon-carousel-indicators')).toHaveText('2 / 5');
    await open(page, 'indicators=progress');
    const width = () => page.locator('.salmon-carousel-progress').evaluate((el) => el.getBoundingClientRect().width / el.parentElement!.getBoundingClientRect().width);
    await expect.poll(width).toBeCloseTo(0.2, 1);
    await page.locator('.salmon-carousel-next').click();
    await expect.poll(width).toBeCloseTo(0.4, 1);
  });

  test('CarouselApi: next, previous, goTo, play, pause', async ({ page }) => {
    await open(page, 'autoPlay=100000');
    const call = (m: string, ...args: number[]) => page.evaluate(([m, args]) => (window as any).__api[m as string](...(args as number[])), [m, args] as const);
    await call('next');
    await expectAt(page, 1);
    await call('goTo', 3);
    await expectAt(page, 3);
    await call('previous');
    await expectAt(page, 2);
    expect(await page.evaluate(() => (window as any).__api.index)).toBe(2);
    await call('pause');
    await expect(page.locator('.salmon-carousel-play')).toHaveAttribute('aria-label', 'Start automatic slide show');
    expect(await page.evaluate(() => (window as any).__api.playing)).toBe(false);
    await call('play');
    await expect(page.locator('.salmon-carousel-play')).toHaveAttribute('aria-label', 'Stop automatic slide show');
    expect(await page.evaluate(() => (window as any).__api.element.className)).toContain('salmon-carousel');
    const l = await log(page);
    expect(l.changes.map((c) => c.source)).toEqual(['api', 'api', 'api']);
    expect(l.playing).toEqual([
      { playing: false, source: 'api' },
      { playing: true, source: 'api' },
    ]);
  });

  test('a slide change runs no JavaScript per animation frame (performance budget)', { tag: '@perf' }, async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const w = window as unknown as { __raf: number };
      w.__raf = 0;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => {
        w.__raf++;
        return raf(cb);
      };
    });
    await page.locator('.salmon-carousel-next').click();
    await expectAt(page, 1);
    await page.locator('.salmon-carousel-indicator').nth(4).click();
    await expectAt(page, 4);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as unknown as { __raf: number }).__raf)).toBe(0);
  });
});
