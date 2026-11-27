import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, installDevtools, openGrid } from './helpers.ts';

// Column fit mode (`resizeMode`).
// Fixture: examples/vite-spa/src/main.tsx `?resizeMode=auto|normal`; with
// `cols=4` the leaves are id (90px, pinned start) and s0..s3 (160px each),
// 730px in all, narrower than the 1280px viewport.

const IDS = ['id', 's0', 's1', 's2', 's3'];

const widths = (page: Page) =>
  page.evaluate(
    (ids) => ids.map((id) => Math.round(document.querySelector<HTMLElement>(`.salmon-data-grid-header-cell[data-column-id="${id}"]`)!.getBoundingClientRect().width)),
    IDS,
  );
const viewport = (page: Page) =>
  page.evaluate(() => {
    const vp = document.querySelector<HTMLElement>('.salmon-data-grid-viewport')!;
    return { client: vp.clientWidth, scroll: vp.scrollWidth };
  });
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/** Drags the resize handle of `id` by `dx`; returns the React commits seen between the first and last move. */
async function dragHandle(page: Page, id: string, dx: number): Promise<number> {
  const handle = page.locator(`.salmon-data-grid-header-cell[data-column-id="${id}"] .salmon-data-grid-resize-handle`);
  const box = (await handle.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 4, y);
  const before = await page.evaluate(() => window.__commits.length);
  for (let i = 2; i <= 8; i++) await page.mouse.move(x + (dx * i) / 8, y);
  const during = (await page.evaluate(() => window.__commits.length)) - before;
  await page.mouse.up();
  return during;
}

test.describe('resizeMode', () => {
  test("'auto' stretches narrow columns to the viewport and re-fits the others on a pointer resize, DOM only", async ({ page }) => {
    const problems = collectProblems(page);
    await installDevtools(page);
    await openGrid(page, `${DEV_URL}?rows=200&cols=4&resizeMode=auto`);
    const vp = await viewport(page);
    const start = await widths(page);
    expect(sum(start)).toBe(vp.client);
    expect(vp.scroll).toBe(vp.client); // no horizontal scroll
    // Proportional: the 160px columns get the same share, larger than the 90px id column's.
    expect(Math.max(...start.slice(1)) - Math.min(...start.slice(1))).toBeLessThanOrEqual(1);
    expect(start[1]! / start[0]!).toBeCloseTo(160 / 90, 1);

    const commits = await dragHandle(page, 's1', -100);
    expect(commits).toBe(0); // drag frames never touch React state
    const after = await widths(page);
    expect(after[2]).toBe(start[2]! - 100);
    expect(sum(after)).toBe(vp.client);
    for (const i of [0, 1, 3, 4]) expect(after[i]!).toBeGreaterThan(start[i]!);
    const events = await page.evaluate(() => (window as unknown as { __chromeEvents: { type: string; field: string; width: number; previousWidth: number }[] }).__chromeEvents);
    expect(events.at(-1)).toEqual({ type: 'resizeEnd', field: 's1', width: start[2]! - 100, previousWidth: start[2] });

    // The committed widths stay after a re-render (no jump on release).
    await page.evaluate(() => (window as unknown as { __setExtra: (p: object) => void }).__setExtra({ striped: false }));
    await page.waitForTimeout(50);
    expect(await widths(page)).toEqual(after);

    // Wider than the viewport: the columns are kept and the grid scrolls.
    await dragHandle(page, 's2', 900);
    const wide = await widths(page);
    expect(sum(wide)).toBeGreaterThan(vp.client);
    expect((await viewport(page)).scroll).toBeGreaterThan(vp.client);
    expect(problems).toEqual([]);
  });

  test("'normal' keeps the other widths and leaves the empty space", async ({ page }) => {
    const problems = collectProblems(page);
    await installDevtools(page);
    await openGrid(page, `${DEV_URL}?rows=200&cols=4&resizeMode=normal`);
    const start = await widths(page);
    expect(start).toEqual([90, 160, 160, 160, 160]);
    const commits = await dragHandle(page, 's1', -60);
    expect(commits).toBe(0);
    expect(await widths(page)).toEqual([90, 160, 100, 160, 160]);
    expect(problems).toEqual([]);
  });

  test("switching to 'auto' at runtime refits; back to 'normal' restores the resolved widths", async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=200&cols=4&resizeMode=normal`);
    const vp = await viewport(page);
    const setMode = (mode: string) => page.evaluate((m) => (window as unknown as { __setExtra: (p: object) => void }).__setExtra({ resizeMode: m }), mode);
    await setMode('auto');
    await expect.poll(async () => sum(await widths(page))).toBe(vp.client);
    await setMode('normal');
    await expect.poll(() => widths(page)).toEqual([90, 160, 160, 160, 160]);
  });

  test("'auto' refits when the grid width changes", async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=200&cols=4&resizeMode=auto`);
    await page.setViewportSize({ width: 1000, height: 800 });
    await expect.poll(async () => sum(await widths(page)) - (await viewport(page)).client).toBe(0);
    expect((await viewport(page)).client).toBeLessThan(1000);
  });
});
