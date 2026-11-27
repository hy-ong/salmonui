import { expect, test, type Page } from '@playwright/test';
import type { DataGridApi } from '@salmonui/data-grid';
import { collectProblems, DEV_URL, installDevtools, PROD_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// Skeleton rows (`virtualization.skeletonRows`) on
// examples/vite-spa/infinite.html: a remote source
// over 1,000,000 rows that answers block reads after `?delay` ms.

async function open(page: Page, base: string, query: string): Promise<void> {
  await page.goto(`${base}infinite.html?${query}`);
  await page.waitForFunction(() => window.__mountMs !== undefined && window.__gridApi);
  await page.waitForSelector('.salmon-data-grid-row[data-row-id="r0"]');
}

const frames = (page: Page) => page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

/** Jumps to an unloaded row (its block is read after the viewport is still). */
async function jump(page: Page, index: number): Promise<void> {
  await page.evaluate((i) => (window.__gridApi as DataGridApi<unknown>).scrollToRow(`__loading:${i}`, { align: 'start' }), index);
  await frames(page);
}

const skeletons = (page: Page) => page.locator('.salmon-data-grid-rows .salmon-data-grid-skeleton-row');

test.describe('skeleton rows', () => {
  test('unloaded rows render shimmer skeleton rows until the block lands (default on)', async ({ page }) => {
    const problems = collectProblems(page);
    // No `skeleton` switch: skeleton rows are the default.
    // `hold`: the block read stays pending until the test releases it.
    await open(page, DEV_URL, 'hold&delay=20');
    await jump(page, 500_000);
    await expect(skeletons(page).first()).toBeVisible();
    const row = skeletons(page).first();
    await expect(row).toHaveAttribute('aria-busy', 'true');
    await expect(row).toHaveClass(/salmon-data-grid-loading-row/);
    // One bar per visible column (5), aria-hidden; the loading text stays for assistive technology.
    await expect(row.locator('.salmon-data-grid-skeleton-bar[aria-hidden="true"]')).toHaveCount(5);
    await expect(row.locator('.salmon-data-grid-visually-hidden')).toHaveText('Loading');
    const style = await row.locator('.salmon-data-grid-skeleton-bar').first().evaluate((bar) => {
      const after = getComputedStyle(bar, '::after');
      return { name: after.animationName, display: after.display, height: bar.getBoundingClientRect().height, width: bar.getBoundingClientRect().width };
    });
    expect(style).toMatchObject({ name: 'salmon-data-grid-shimmer', display: 'block' });
    expect(style.height).toBeGreaterThan(4);
    expect(style.width).toBeGreaterThan(20);
    // Every rendered row in the window is a skeleton row (no blank rows, no loading text).
    const rendered = await page.locator('.salmon-data-grid-rows > [role="row"]').count();
    expect(await skeletons(page).count()).toBe(rendered);
    // The block lands: data rows replace the skeleton rows.
    await expect.poll(() => page.evaluate(() => window.__reads.some((r) => r.start <= 500_002 && r.end > 500_002))).toBe(true);
    await page.evaluate(() => window.__releaseReads?.());
    await expect(page.locator('.salmon-data-grid-row[data-row-id="r500002"]')).toBeVisible();
    await expect(skeletons(page)).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('skeletonRows: false: loading rows show the loading text and no skeleton bars', async ({ page }) => {
    await open(page, DEV_URL, 'noskeleton&hold');
    await jump(page, 500_000);
    await expect(page.locator('.salmon-data-grid-loading-row').first()).toBeVisible();
    await expect(page.locator('.salmon-data-grid-loading-row').first()).toHaveText('Loading');
    await expect(page.locator('.salmon-data-grid-skeleton-bar')).toHaveCount(0);
  });

  test('prefers-reduced-motion and forced colors remove the shimmer', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, DEV_URL, 'hold');
    await jump(page, 500_000);
    const bar = skeletons(page).first().locator('.salmon-data-grid-skeleton-bar').first();
    await expect(bar).toBeVisible();
    expect(await bar.evaluate((el) => getComputedStyle(el, '::after').display)).toBe('none');
    await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'active' });
    expect(await bar.evaluate((el) => getComputedStyle(el, '::after').display)).toBe('none');
    await page.emulateMedia({ forcedColors: 'none' });
    expect(await bar.evaluate((el) => getComputedStyle(el, '::after').display)).toBe('block');
  });

  test('zero React commits for scrolls that keep the rendered range over skeleton rows', async ({ page }) => {
    await installDevtools(page);
    // 100,000 rows (no scroll compression); reads after the first never land, so the window stays on skeleton rows.
    await open(page, DEV_URL, 'hold&total=100000');
    await jump(page, 50_000);
    await expect(skeletons(page).first()).toBeVisible();
    await page.waitForTimeout(150);
    const start = await page.evaluate(() => window.__commits.length);
    const top = await page.evaluate(() => (document.querySelector('.salmon-data-grid-viewport') as HTMLElement).scrollTop);
    expect(top).toBe(36 * 50_000);
    // 1 px steps inside one row.
    for (let i = 1; i <= 15; i++) {
      await page.evaluate((t) => {
        (document.querySelector('.salmon-data-grid-viewport') as HTMLElement).scrollTop = t;
      }, top + i);
      await frames(page);
    }
    expect(await page.evaluate((s) => window.__commits.length - s, start)).toBe(0);
    await expect(skeletons(page).first()).toBeVisible();
  });

  test('scroll frames stay within budget with skeleton rows on screen (production build)', { tag: '@perf' }, async ({ page }) => {
    // Reads after the first stay pending: every frame scrolls over skeleton rows, entering and leaving rows each frame.
    await open(page, PROD_URL, 'hold');
    await jump(page, 500_000);
    const result = await page.evaluate(
      () =>
        new Promise<{ p95: number; frames: number; handlerP95: number; skeletonFrames: number }>((resolve) => {
          const vp = document.querySelector('.salmon-data-grid-viewport') as HTMLElement;
          const frames: number[] = [];
          const handler: number[] = [];
          let last = 0;
          let skeletonFrames = 0;
          const t0 = performance.now();
          const tick = (ts: number) => {
            if (last) frames.push(ts - last);
            last = ts;
            const a = performance.now();
            vp.scrollTop += 2000 / 60;
            vp.dispatchEvent(new Event('scroll'));
            handler.push(performance.now() - a);
            if (document.querySelector('.salmon-data-grid-skeleton-row')) skeletonFrames++;
            if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
            else {
              const pct = (xs: number[], p: number) => [...xs].sort((x, y) => x - y)[Math.min(xs.length - 1, Math.ceil((p / 100) * xs.length) - 1)] as number;
              resolve({ p95: pct(frames, 95), frames: frames.length, handlerP95: pct(handler, 95), skeletonFrames });
            }
          };
          requestAnimationFrame(tick);
        }),
    );
    console.log(`[perf] skeleton rows, 2000px/s over unloaded rows: frame p95 ${result.p95.toFixed(2)} ms, scroll handler p95 ${result.handlerP95.toFixed(3)} ms, ${result.skeletonFrames}/${result.frames} frames with skeleton rows`);
    expect(result.skeletonFrames).toBe(result.frames + 1);
    expectBudget(result.handlerP95, 1, 'skeleton rows 2000px/s scroll handler p95');
    expectBudget(result.p95, 17.5, 'skeleton rows 2000px/s frame p95');
  });
});
