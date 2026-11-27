import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// Chart features in the browser: split and positioned tooltips,
// crosshair category band, axis labels and API, shared selection, RTL.
// Page: examples/vite-spa/chart-features.html.

const PAGE = `${DEV_URL}chart-features.html`;
type Logged = Record<string, unknown>;

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${PAGE}${query}`);
  await page.waitForSelector('#page');
  // The overlay chunk mounts after hydration.
  await page.waitForSelector('.salmon-chart-overlay');
}

const events = (page: Page, kind?: string) => page.evaluate((k) => (window.__vizEvents ?? []).filter((e) => !k || e['kind'] === k), kind) as Promise<Logged[]>;
const plot = (page: Page, section: string) => page.locator(`#${section} .salmon-viz-plot`).first();

async function hover(page: Page, section: string, fx: number, fy = 0.5): Promise<void> {
  await plot(page, section).scrollIntoViewIfNeeded();
  const box = await plot(page, section).boundingBox();
  if (!box) throw new Error('no plot');
  await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
}

test.describe('Chart features', () => {
  test("tooltip.mode 'split' shows one tooltip per series at its own point", async ({ page }) => {
    const problems = collectProblems(page);
    await open(page);
    await hover(page, 'split', 0.5);
    const tips = page.locator('#split .salmon-viz-tooltip');
    await expect(tips).toHaveCount(2);
    await expect(tips.nth(0)).toContainText('North');
    await expect(tips.nth(1)).toContainText('South');
    // Each box sits above its own point: different vertical positions for different values.
    const [a, b] = [await tips.nth(0).boundingBox(), await tips.nth(1).boundingBox()];
    expect(a && b && Math.abs(a.y - b.y)).toBeGreaterThan(4);
    expect(problems).toEqual([]);
  });

  test('tooltip.position fixed { x, y } with offset, and pointer that follows the pointer', async ({ page }) => {
    await open(page);
    await hover(page, 'fixed', 0.8);
    const tip = page.locator('#fixed .salmon-viz-tooltip');
    await expect(tip).toBeVisible();
    const surface = await page.locator('#fixed .salmon-viz-surface').boundingBox();
    const box = await tip.boundingBox();
    if (!surface || !box) throw new Error('no boxes');
    // Drawing px to CSS px: the chart lays out at its measured width, so read the drawing width from the viewBox.
    const viewBox = (await page.locator('#fixed .salmon-chart-overlay').getAttribute('viewBox')) ?? '0 0 600 1';
    const k = surface.width / Number(viewBox.split(' ')[2]);
    // offset 0: the box bottom touches the anchor (60, 60) in drawing px, centered on x (clamped to the surface).
    expect(Math.abs(box.y + box.height - (surface.y + 60 * k))).toBeLessThan(2.5);
    const expectedLeft = surface.x + Math.max(0, Math.min(60 * k - box.width / 2, surface.width - box.width));
    expect(Math.abs(box.x - expectedLeft)).toBeLessThan(2.5);
    // A second hover elsewhere keeps the fixed position.
    await hover(page, 'fixed', 0.2);
    const again = await tip.boundingBox();
    expect(again && Math.abs(again.y - box.y)).toBeLessThan(1);
    // 'pointer': the box follows the pointer, offset 24 px above it.
    await hover(page, 'follow', 0.5, 0.7);
    const follow = page.locator('#follow .salmon-viz-tooltip');
    const low = await follow.boundingBox();
    await hover(page, 'follow', 0.5, 0.9);
    const lower = await follow.boundingBox();
    expect(low && lower && lower.y - low.y).toBeGreaterThan(10);
    const p = await plot(page, 'follow').boundingBox();
    if (!p || !lower) throw new Error('no plot');
    const pointerY = p.y + p.height * 0.9;
    expect(Math.abs(lower.y + lower.height - (pointerY - 24))).toBeLessThan(3);
  });

  test('crosshair category band, axis labels with formatLabel, api.showCrosshair / hideCrosshair', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page);
    await hover(page, 'cross', 0.42, 0.4);
    await expect(page.locator('#cross .salmon-chart-crosshair-band')).toHaveCount(1);
    const labels = page.locator('#cross .salmon-chart-crosshair-label');
    await expect(labels).toHaveCount(2);
    await expect(labels.filter({ hasText: /^Month Mar$/ })).toHaveCount(1);
    await expect(labels.filter({ hasText: / u$/ })).toHaveCount(1);
    // The band covers one category: about a sixth of the plot width.
    const band = await page.locator('#cross .salmon-chart-crosshair-band').boundingBox();
    const pb = await plot(page, 'cross').boundingBox();
    expect(band && pb && Math.abs(band.width - pb.width / 6)).toBeLessThan(3);
    // The API moves the crosshair to data values and hides it again.
    await page.mouse.move(0, 0);
    await expect(page.locator('#cross .salmon-viz-crosshair')).toHaveCount(0);
    await page.evaluate(() => window.__crossApi?.showCrosshair({ x: 'May', y: 10 }));
    await expect(labels.filter({ hasText: /^Month May$/ })).toHaveCount(1);
    await expect(labels.filter({ hasText: /^10 u$/ })).toHaveCount(1);
    await page.evaluate(() => window.__crossApi?.showCrosshair({ seriesId: 'North', index: 0 }));
    await expect(labels.filter({ hasText: /^Month Jan$/ })).toHaveCount(1);
    await page.evaluate(() => window.__crossApi?.hideCrosshair());
    await expect(page.locator('#cross .salmon-viz-crosshair')).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('a selection in one chart of a ChartSyncGroup selects the same index in the others', async ({ page }) => {
    await open(page);
    await plot(page, 'sel-a').scrollIntoViewIfNeeded();
    const box = await plot(page, 'sel-a').boundingBox();
    if (!box) throw new Error('no plot');
    // Click the third column (Mar).
    await page.mouse.click(box.x + box.width * (2.5 / 6), box.y + box.height * 0.95);
    await expect.poll(async () => (await events(page, 'select')).length).toBeGreaterThanOrEqual(2);
    const sel = await events(page, 'select');
    expect(sel).toContainEqual({ kind: 'select', chart: 'a', points: ['North:2'], reason: 'click', source: 'pointer' });
    expect(sel).toContainEqual({ kind: 'select', chart: 'b', points: ['South:2'], reason: 'sync', source: 'api' });
  });

  test('onPlotClick and onPlotPointerMove report data coordinates anywhere on the plot', async ({ page }) => {
    await open(page);
    await hover(page, 'plot-events', 3.5 / 6, 0.05);
    await expect.poll(async () => (await events(page, 'plot-move')).at(-1)).toEqual({ kind: 'plot-move', xValue: 'Apr' });
    await page.mouse.down();
    await page.mouse.up();
    const clicks = await events(page, 'plot-click');
    expect(clicks).toHaveLength(1);
    expect(clicks[0]?.['xValue']).toBe('Apr');
    // Near the top of a 0..25 axis.
    expect(Number(clicks[0]?.['yValue'])).toBeGreaterThan(20);
  });

  test('a touch long press shows the tooltip of the nearest point; moving the finger cancels it', async ({ page }) => {
    await open(page);
    await plot(page, 'plot-events').scrollIntoViewIfNeeded();
    const box = await plot(page, 'plot-events').boundingBox();
    if (!box) throw new Error('no plot');
    const touch = (type: string, fx: number) =>
      page.evaluate(([t, x, y]) => {
        const el = document.querySelector('#plot-events .salmon-viz-plot') as HTMLElement;
        el.dispatchEvent(new PointerEvent(t as string, { clientX: x as number, clientY: y as number, pointerType: 'touch', pointerId: 7, bubbles: true }));
      }, [type, box.x + box.width * fx, box.y + box.height * 0.6] as const);
    const tip = page.locator('#plot-events .salmon-viz-tooltip');
    await touch('pointerdown', 0.25);
    await touch('pointermove', 0.6);
    await page.waitForTimeout(700);
    await expect(tip).toHaveCount(0);
    await touch('pointerup', 0.6);
    await touch('pointerdown', 0.25);
    await page.waitForTimeout(700);
    await expect(tip).toContainText('Feb');
    // The plot keeps vertical page scrolling for touch (no gesture features on this chart).
    await expect(plot(page, 'plot-events')).toHaveCSS('touch-action', 'pan-y');
  });

  test('without height the chart is 300 px tall in an auto root and fills a root whose height or aspect-ratio CSS fixes; onResize reports it', async ({ page }) => {
    await open(page);
    const viewBox = async (id: string) => (await page.locator(`#${id} svg.salmon-chart-svg`).getAttribute('viewBox'))?.split(' ').map(Number) ?? [];
    const surface = async (id: string) => (await page.locator(`#${id} .salmon-viz-surface`).boundingBox())!;
    await expect.poll(async () => (await viewBox('size-auto'))[3]).toBe(300);
    expect(Math.round((await surface('size-auto')).height)).toBe(300);
    // 420 px root: the surface takes the root height and the drawing relays out to it.
    await expect.poll(async () => (await viewBox('size-css'))[3]).toBe(420);
    expect(Math.round((await surface('size-css')).height)).toBe(420);
    expect(await events(page, 'resize')).toContainEqual({ kind: 'resize', height: 420 });
    // aspect-ratio 3 / 1 on the root.
    const ratio = await surface('size-ratio');
    expect(Math.abs(ratio.height - ratio.width / 3)).toBeLessThanOrEqual(1);
    await expect.poll(async () => (await viewBox('size-ratio'))[3]).toBe(Math.round(ratio.width / 3));
    // A numeric height fixes the drawing even in a taller root.
    expect((await viewBox('size-fixed'))[3]).toBe(180);
    expect(Math.round((await surface('size-fixed')).height)).toBe(180);
  });

  test('in RTL the chart keeps the data axis direction, mirrors the drawn title and top legend, and the legend keyboard model', async ({ page }) => {
    const problems = collectProblems(page);
    // Title and top legend boxes relative to the drawing (the page imports `viz-rtl.css`).
    const drawn = (id: string) =>
      page.evaluate((id) => {
        const svg = document.querySelector(`#${id} svg.salmon-chart-svg`) as SVGSVGElement;
        const s = svg.getBoundingClientRect();
        const box = (el: Element | null) => {
          const r = (el as Element).getBoundingClientRect();
          return { left: Math.round(r.left - s.left), right: Math.round(r.right - s.left) };
        };
        return { width: Math.round(s.width), title: box(svg.querySelector('.salmon-viz-title')), legend: [...svg.querySelectorAll('.salmon-viz-legend-item text')].map(box) };
      }, id);
    await open(page);
    const ltr = await drawn('legend');
    await open(page, '?dir=rtl');
    const rtl = await drawn('legend');
    expect(ltr.title.left).toBe(8);
    expect(Math.abs(rtl.title.right - (rtl.width - 8))).toBeLessThanOrEqual(1);
    expect(ltr.legend.length).toBe(2);
    expect(ltr.legend[0]!.left).toBeLessThan(ltr.legend[1]!.left);
    expect(rtl.legend[0]!.left).toBeGreaterThan(rtl.legend[1]!.left);
    const ticks = page.locator('#split [data-axis="x"] text');
    const first = await ticks.first().boundingBox();
    const last = await ticks.last().boundingBox();
    await expect(ticks.first()).toHaveText('Jan');
    expect(first && last && first.x < last.x).toBe(true);
    // Legend toolbar: ArrowLeft moves to the next item in RTL.
    const buttons = page.locator('#legend .salmon-viz-legend-button');
    await buttons.first().focus();
    await page.keyboard.press('ArrowLeft');
    await expect(buttons.nth(1)).toBeFocused();
    expect(problems).toEqual([]);
  });
});
