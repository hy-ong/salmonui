import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { expectClean } from './axe.ts';
import { collectProblems, DEV_URL } from './helpers.ts';

// Data Visualization in the browser: hydration, tooltip, crosshair, plot keyboard and live
// region, legend toolbar, selection, zoom, sync groups, canvas renderer,
// export, sizing, RangeSelector, PeriodSelector, StockChart and axe.
// Page: examples/vite-spa/data-visualization.html.

const PAGE = `${DEV_URL}data-visualization.html`;
type Logged = Record<string, unknown>;

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${PAGE}${query}`);
  await page.waitForSelector('#page');
}

const events = (page: Page, kind?: string) => page.evaluate((k) => (window.__vizEvents ?? []).filter((e) => !k || e['kind'] === k), kind) as Promise<Logged[]>;
const plot = (page: Page, section: string) => page.locator(`#${section} .salmon-viz-plot`).first();

/** Moves the pointer to a fraction of the plot box. */
async function hover(page: Page, section: string, fx: number, fy = 0.5): Promise<void> {
  await plot(page, section).scrollIntoViewIfNeeded();
  const box = await plot(page, section).boundingBox();
  if (!box) throw new Error('no plot');
  await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
}

test.describe('Live data and container pointer events', () => {
  test('StockChart follows a reactive data array and its ref streams appendPoints', async ({ page }) => {
    await open(page, '?live');
    const tip = page.locator('#stock-live [role="tooltip"]');
    const lastBar = async (close: string) => {
      await page.mouse.move(0, 0);
      await hover(page, 'stock-live', 0.995);
      await expect(tip).toContainText(close);
    };
    await lastBar('105');
    await page.locator('#stock-live-set').click();
    await lastBar('150');
    await page.evaluate(() => window.__stockApi?.appendPoints('price', [{ d: '2024-01-07', o: 174, h: 177, l: 173, c: 175, v: 1000 }]));
    await lastBar('175');
  });

  const FULL = ['click', 'dblclick', 'contextmenu', 'move', 'down', 'up', 'leave'];
  const CLICKS = ['click', 'dblclick', 'contextmenu', 'move'];
  for (const [family, target, root, expected] of [
    ['chart', '#probe-chart .salmon-viz-plot', 'salmon-chart', FULL],
    ['stock', '#probe-stock .salmon-viz-plot', 'salmon-stock-chart', FULL],
    ['gauge', '#probe-gauge svg', 'salmon-gauge', FULL],
    ['tree', '#probe-tree .salmon-viz-plot', 'salmon-tree-map', CLICKS],
    ['geo', '#probe-geo .salmon-viz-plot', 'probe-wrap', CLICKS],
    ['spark', '#probe-spark svg', 'probe-wrap', CLICKS],
  ] as const) {
    test(`${family} container pointer events reach ${root}`, async ({ page }) => {
      await open(page, '?pointer');
      const el = page.locator(target).first();
      await el.scrollIntoViewIfNeeded();
      const box = await el.boundingBox();
      if (!box) throw new Error('no target');
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.move(x + 1, y + 1);
      await page.mouse.dblclick(x, y);
      await page.mouse.click(x, y, { button: 'right' });
      await page.keyboard.press('Escape');
      await page.mouse.move(0, 0);
      await expect.poll(async () => {
        const seen = (await events(page, 'dom')).filter((e) => e['family'] === family);
        for (const e of seen) expect(String(e['root']).split(' ')).toContain(root);
        return [...new Set(seen.map((e) => e['type'] as string))].sort();
      }).toEqual([...expected].sort());
    });
  }
});

test.describe('Chart', () => {
  test('server markup hydrates with zero warnings; the measured width relayouts once', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, '?hydrate');
    await expect(page.locator('#basic svg.salmon-chart-svg')).toBeVisible();
    // 720 px section, measured: the drawing width follows the container.
    await expect.poll(async () => page.locator('#basic svg.salmon-chart-svg').getAttribute('viewBox')).toBe('0 0 720 300');
    expect((await events(page, 'resize')).at(-1)).toEqual({ kind: 'resize', width: 720 });
    await page.setViewportSize({ width: 500, height: 800 });
    await expect.poll(async () => (await page.locator('#basic svg.salmon-chart-svg').getAttribute('viewBox'))?.split(' ')[2]).not.toBe('720');
    expect(problems).toEqual([]);
  });

  test('hovering shows the nearest point in a tooltip; crosshair follows the pointer', async ({ page }) => {
    await open(page);
    await hover(page, 'basic', 0.5, 0.5);
    const tip = page.locator('#basic [role="tooltip"]');
    await expect(tip).toBeVisible();
    await expect(tip).toContainText(/Mar|Apr/);
    await expect(page.locator('#basic .salmon-viz-crosshair')).toHaveCount(1);
    await page.mouse.move(0, 0);
    await expect(tip).toHaveCount(0);
  });

  test('api.showTooltip / hideTooltip open and close the tooltip for a point', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__chartApi?.showTooltip({ seriesId: 'South', index: 2 }));
    await expect(page.locator('#basic [role="tooltip"]')).toContainText('South');
    await expect(page.locator('#basic [role="tooltip"]')).toContainText('11');
    await page.evaluate(() => window.__chartApi?.hideTooltip());
    await expect(page.locator('#basic [role="tooltip"]')).toHaveCount(0);
  });

  test('api.appendPoints streams points into a series and keeps the maxPoints window', async ({ page }) => {
    await open(page);
    const tip = page.locator('#basic [role="tooltip"]');
    await page.evaluate(() => window.__chartApi?.appendPoints('South', [{ month: 'Jul', south: 30 }, { month: 'Aug', south: 31 }], { maxPoints: 7 }));
    // 6 + 2 points, windowed to the last 7: Feb .. Aug.
    await page.evaluate(() => window.__chartApi?.showTooltip({ seriesId: 'South', index: 6 }));
    await expect(tip).toContainText('31');
    await page.evaluate(() => window.__chartApi?.showTooltip({ seriesId: 'South', index: 0 }));
    await expect(tip).toContainText('6');
    await page.evaluate(() => {
      window.__chartApi?.hideTooltip();
      window.__chartApi?.showTooltip({ seriesId: 'South', index: 7 });
    });
    await expect(tip).toHaveCount(0);
  });

  test('shared tooltip renders custom content with every series at the snapped x', async ({ page }) => {
    await open(page);
    await hover(page, 'shared', 0.02, 0.9);
    await expect(page.locator('#shared .custom-tip')).toHaveText('Jan: 12 / 8');
    await expect(page.locator('#shared .salmon-chart-hover-mark')).toHaveCount(2);
  });

  test('the plot is one tab stop; arrows, Home / End and PageDown move a virtual focus announced politely; Escape clears it', async ({ page }) => {
    await open(page);
    await plot(page, 'basic').focus();
    const live = page.locator('#basic [aria-live="polite"]').first();
    await page.keyboard.press('ArrowRight');
    await expect(live).toHaveText('North, Jan: 12. 1 of 6.');
    await page.keyboard.press('ArrowRight');
    await expect(live).toHaveText('North, Feb: 15. 2 of 6.');
    await page.keyboard.press('End');
    await expect(live).toHaveText('North, Jun: 25. 6 of 6.');
    await page.keyboard.press('PageDown');
    await expect(live).toHaveText('South, Jun: 10. 6 of 6.');
    await expect(page.locator('#basic [role="tooltip"]')).toContainText('South');
    await page.keyboard.press('Home');
    await expect(live).toHaveText('South, Jan: 8. 1 of 6.');
    await page.keyboard.press('Escape');
    await expect(live).toHaveText('');
  });

  test('clicking a point selects it and reports the click; Enter selects the focused point', async ({ page }) => {
    await open(page);
    await hover(page, 'basic', 1 / 12, 0.4);
    await page.mouse.down();
    await page.mouse.up();
    expect(await events(page, 'click')).toEqual([{ kind: 'click', series: 'North', index: 0 }]);
    expect((await events(page, 'select')).at(-1)).toEqual({ kind: 'select', points: ['North:0'], source: 'pointer' });
    await expect(page.locator('#basic path[data-selected]')).toHaveCount(1);
    await page.mouse.move(0, 0);
    await plot(page, 'basic').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    expect((await events(page, 'select')).at(-1)).toEqual({ kind: 'select', points: ['North:1'], source: 'keyboard' });
  });

  test('the legend is a toolbar of toggle buttons with roving focus; toggling proposes hiddenSeries', async ({ page }) => {
    await open(page);
    const toolbar = page.locator('#basic [role="toolbar"]');
    const north = toolbar.getByRole('button', { name: 'North' });
    const south = toolbar.getByRole('button', { name: 'South' });
    await expect(north).toHaveAttribute('aria-pressed', 'true');
    await north.focus();
    await page.keyboard.press('ArrowRight');
    await expect(south).toBeFocused();
    await page.keyboard.press('Enter');
    expect((await events(page, 'hidden')).at(-1)).toEqual({ kind: 'hidden', ids: ['South'], source: 'keyboard' });
    await expect(south).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#basic [data-series="South"]')).toHaveCount(0);
    await south.click();
    await expect(page.locator('#basic [data-series="South"]')).toHaveCount(1);
  });

  test('wheel zoom, rubber-band selection and keyboard reset commit through onZoomRangeChange', async ({ page }) => {
    await open(page);
    await hover(page, 'zoom', 0.5);
    await page.mouse.wheel(0, -100);
    await expect(page.locator('#zoom-state')).not.toHaveText('none');
    expect((await events(page, 'zoom')).at(-1)).toMatchObject({ reason: 'wheel', source: 'pointer' });
    await plot(page, 'zoom').focus();
    await page.keyboard.press('0');
    await expect(page.locator('#zoom-state')).toHaveText('none');
    expect((await events(page, 'zoom')).at(-1)).toMatchObject({ reason: 'reset', source: 'keyboard' });
    await plot(page, 'zoom').scrollIntoViewIfNeeded();
    const box = await plot(page, 'zoom').boundingBox();
    if (!box) throw new Error('no plot');
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2, { steps: 4 });
    await expect(page.locator('#zoom .salmon-chart-selection')).toHaveCount(1);
    await page.mouse.up();
    const sel = (await events(page, 'zoom')).at(-1) as { reason: string; x: [number, number] };
    expect(sel.reason).toBe('selection');
    expect(sel.x[0]).toBeGreaterThan(40);
    expect(sel.x[1]).toBeLessThan(110);
    await plot(page, 'zoom').focus();
    await page.keyboard.press('+');
    expect((await events(page, 'zoom')).at(-1)).toMatchObject({ reason: 'keyboard' });
  });

  test('Shift + drag pans a zoomed chart; the frame stays in the store until release', async ({ page }) => {
    await open(page);
    await hover(page, 'zoom', 0.5);
    await page.mouse.wheel(0, -100);
    const before = (await events(page, 'zoom')).at(-1) as { x: [number, number] };
    const box = await plot(page, 'zoom').boundingBox();
    if (!box) throw new Error('no plot');
    await page.keyboard.down('Shift');
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2, { steps: 5 });
    expect((await events(page, 'zoom')).length).toBe(1);
    await page.mouse.up();
    await page.keyboard.up('Shift');
    const after = (await events(page, 'zoom')).at(-1) as { reason: string; x: [number, number] };
    expect(after.reason).toBe('pan');
    expect(after.x[0]).toBeGreaterThan(before.x[0]);
  });

  test('charts in a ChartSyncGroup share the hovered x', async ({ page }) => {
    await open(page);
    await hover(page, 'sync-a', 0.5);
    await expect(page.locator('#sync-a [role="tooltip"]')).toBeVisible();
    await expect(page.locator('#sync-b .salmon-chart-hover-mark')).toHaveCount(1);
  });

  test('the canvas renderer draws the marks after hydration; axes stay SVG', async ({ page }) => {
    await open(page);
    const canvas = page.locator('#canvas canvas');
    await expect(canvas).toHaveCount(1);
    await expect
      .poll(() =>
        canvas.evaluate((el: HTMLCanvasElement) => {
          const ctx = el.getContext('2d');
          if (!ctx) return 0;
          const d = ctx.getImageData(0, 0, el.width, el.height).data;
          let n = 0;
          for (let i = 3; i < d.length; i += 4) if ((d[i] as number) > 0) n++;
          return n;
        }),
      )
      .toBeGreaterThan(200);
    await expect(page.locator('#canvas [data-axis="x"]')).toHaveCount(1);
  });

  test('toBlob (PNG, SVG), toDataURL and toSVGString', async ({ page }) => {
    await open(page);
    const out = await page.evaluate(async () => {
      const api = window.__chartApi;
      if (!api) return null;
      const png = await api.toBlob('png');
      const svg = await api.toBlob('svg');
      const url = await api.toDataURL('jpeg');
      const svgText = await svg.text();
      return { png: png.type, pngSize: png.size, svg: svg.type, inlined: !svgText.includes('var(--salmon'), url: url.slice(0, 15), string: api.toSVGString().startsWith('<svg xmlns') };
    });
    expect(out).toMatchObject({ png: 'image/png', svg: 'image/svg+xml;charset=utf-8', inlined: true, url: 'data:image/jpeg', string: true });
    expect(out?.pngSize).toBeGreaterThan(1000);
  });

  test('bullet items are reachable by keyboard and announce value, target and band', async ({ page }) => {
    await open(page);
    // One tab stop for the plot; the legend is a static list, not a tab stop.
    await expect(page.locator('#bullet [tabindex="0"]')).toHaveCount(1);
    await expect(page.locator('#bullet .salmon-chart-bullet-legend li')).toHaveText(['v', 'Target', 'Band 1', 'Band 2', 'Band 3']);
    await plot(page, 'bullet').focus();
    await page.keyboard.press('ArrowRight');
    const live = page.locator('#bullet [aria-live="polite"]').first();
    await expect(live).toHaveText('v, Revenue: 270, Target 250, Band 3. 1 of 2.');
    await expect(page.locator('#bullet [role="tooltip"]')).toBeVisible();
    // A horizontal bullet chart stacks its items along y: Down moves to the next item.
    await page.keyboard.press('ArrowDown');
    await expect(live).toHaveText('v, Profit: 22, Target 25, Band 1. 2 of 2.');
    // onItemClick: a pointer click on the feature bar reports the item.
    const bar = await page.locator('#bullet .salmon-chart-series-group path.salmon-viz-mark[data-index="1"]').first().boundingBox();
    expect(bar).not.toBeNull();
    await page.mouse.click(bar!.x + bar!.width / 2, bar!.y + bar!.height / 2);
    expect(await events(page, 'bullet-click')).toEqual([{ kind: 'bullet-click', index: 1 }]);
  });

  test('axe: charts, range selector and stock chart in light, dark and RTL', async ({ page }) => {
    for (const q of ['', '?scheme=dark', '?dir=rtl']) {
      await open(page, q);
      await expect(page.locator('#stock .salmon-chart-svg')).toBeVisible();
      await expectClean(page, `data-visualization${q}`);
    }
  });
});

test.describe('RangeSelector and StockChart', () => {
  test('thumbs follow the APG multi-thumb slider keyboard model commits per step', async ({ page }) => {
    await open(page);
    const start = page.getByRole('slider', { name: 'Start' }).first();
    await start.focus();
    await page.keyboard.press('PageUp');
    expect((await events(page, 'range-commit')).at(-1)).toMatchObject({ reason: 'keyboard', source: 'keyboard' });
    await page.keyboard.press('Home');
    await expect(page.locator('#range-state')).toHaveText(/^2024-01-01\.\./);
    const end = page.getByRole('slider', { name: 'End' }).first();
    await end.focus();
    await page.keyboard.press('End');
    await expect(page.locator('#range-state')).toHaveText(/\.\.2024-12-31$/);
    await expect(start).toHaveAttribute('aria-valuetext', 'Jan 1, 2024');
  });

  test('dragging the band reports frames, commits on release and drives the linked chart', async ({ page }) => {
    await open(page);
    const band = page.getByRole('slider', { name: 'Selected range' }).first();
    await band.scrollIntoViewIfNeeded();
    const box = await band.boundingBox();
    if (!box) throw new Error('no band');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 6 });
    const during = await events(page, 'range-commit');
    expect(during).toEqual([]);
    expect((await events(page, 'range-change')).length).toBeGreaterThan(0);
    await page.mouse.up();
    const commit = (await events(page, 'range-commit')).at(-1) as { reason: string; value: [string, string] };
    expect(commit.reason).toBe('band');
    expect(commit.value[0] > '2024-03-01').toBe(true);
    // The linked chart's x axis follows.
    await expect(page.locator('#range .salmon-chart [data-axis="x"] text').first()).not.toHaveText(/Mar/);
  });

  test('period radios select a range ending at the data end', async ({ page }) => {
    await open(page);
    await page.locator('#range').getByRole('radio', { name: '1M' }).click();
    await expect(page.locator('#range-state')).toHaveText('2024-11-30..2024-12-31');
    expect((await events(page, 'range-commit')).at(-1)).toMatchObject({ reason: 'period' });
    const alone = page.locator('#periods').getByRole('radio', { name: '3M' });
    await alone.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#periods').getByRole('radio', { name: '1M' })).toHaveAttribute('aria-checked', 'true');
  });

  test('form: the range selector submits start and end and restores the default on reset', async ({ page }) => {
    await open(page);
    const values = await page.evaluate(() => new FormData(document.getElementById('range-form') as HTMLFormElement).getAll('window'));
    expect(values).toEqual(['2024-03-01T00:00:00.000Z', '2024-06-01T00:00:00.000Z']);
  });

  test('the series type menu switches candles to a line; periods drive the stock range', async ({ page }) => {
    await open(page);
    const stock = page.locator('#stock');
    await stock.getByRole('button', { name: 'Series type' }).click();
    await page.getByRole('menuitem', { name: 'line' }).click();
    expect((await events(page, 'series-type')).at(-1)).toEqual({ kind: 'series-type', type: 'line' });
    await expect(stock.locator('[data-series="price"]')).toHaveAttribute('data-type', 'line');
    await stock.getByRole('radio', { name: '3M' }).click();
    expect((await events(page, 'stock-range')).at(-1)).toEqual({ kind: 'stock-range', reason: 'period' });
  });
});

test.describe('StockChart period triad and forwarded Chart props', () => {
  const radio = (page: Page, id: string, name: string) => page.locator(`#${id}`).getByRole('radio', { name, exact: true });
  const xLabels = (page: Page, id: string) => page.locator(`#${id} [data-axis="x"] text`).allTextContents();

  test('defaultPeriod selects and holds a period; a user pick reports the period and the range', async ({ page }) => {
    await open(page, '?stock-props');
    await expect(radio(page, 'stock-default', '3M')).toHaveAttribute('aria-checked', 'true');
    expect((await xLabels(page, 'stock-default')).join(' ')).not.toMatch(/Jan|Mar/);
    await radio(page, 'stock-default', '1M').click();
    await expect(radio(page, 'stock-default', '1M')).toHaveAttribute('aria-checked', 'true');
    expect((await events(page, 'stock-period')).at(-1)).toEqual({ kind: 'stock-period', id: '1m', reason: 'period' });
    expect((await events(page, 'stock-period-range')).at(-1)).toEqual({ kind: 'stock-period-range', reason: 'period', range: ['2024-11-30', '2024-12-31'] });
    // Leaving the period reports it: a reset is the full range, which is the All period.
    await page.evaluate(() => (window.__vizApis?.['StockDefault'] as { resetZoom(): void }).resetZoom());
    await expect(radio(page, 'stock-default', 'All')).toHaveAttribute('aria-checked', 'true');
    expect((await events(page, 'stock-period')).at(-1)).toEqual({ kind: 'stock-period', id: 'all', reason: 'reset' });
    expect((await events(page, 'stock-period-range')).at(-1)).toMatchObject({ reason: 'reset' });
  });

  test('a controlled period moves the chart when accepted and stays when vetoed', async ({ page }) => {
    await open(page, '?stock-props');
    const before = await xLabels(page, 'stock-controlled');
    await radio(page, 'stock-controlled', '1M').click();
    await expect(page.locator('#stock-controlled-state')).toHaveText('1m');
    await expect(radio(page, 'stock-controlled', '1M')).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => xLabels(page, 'stock-controlled')).not.toEqual(before);
    const held = await xLabels(page, 'stock-veto');
    await radio(page, 'stock-veto', '1M').click();
    expect((await events(page, 'stock-veto')).at(-1)).toEqual({ kind: 'stock-veto', id: '1m' });
    await expect(radio(page, 'stock-veto', '3M')).toHaveAttribute('aria-checked', 'true');
    expect(await xLabels(page, 'stock-veto')).toEqual(held);
  });

  test('crosshair, trackball tooltip, selection, legend and annotations reach the stock chart', async ({ page }) => {
    await open(page, '?stock-props');
    await expect(page.locator('#stock-note')).toHaveText('Note');
    await hover(page, 'stock-tools', 0.6);
    await expect(page.locator('#stock-tools .salmon-viz-crosshair')).toBeVisible();
    // Trackball: the shared tooltip lists the price and the indicator at the same x.
    const tip = page.locator('#stock-tools [role="tooltip"]');
    await expect(tip).toContainText('Price');
    await expect(tip).toContainText('SMA 14');
    await plot(page, 'stock-tools').click({ position: { x: 40, y: 40 } });
    await expect.poll(async () => ((await events(page, 'stock-selected')).at(-1)?.['points'] as unknown[] | undefined)?.length).toBe(1);
    const legend = page.locator('#stock-tools').getByRole('button', { name: /SMA 14/ });
    await legend.click();
    await expect(legend).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#stock-tools [data-series="indicator-sma"]')).toHaveCount(0);
  });

  test('rows and axes place an indicator in its own pane', async ({ page }) => {
    await open(page, '?stock-props');
    const box = async (s: string) => (await page.locator(`#stock-panes ${s}`).first().boundingBox())!;
    const price = await box('[data-series="price"]');
    const rsi = await box('[data-series="indicator-rsi"]');
    expect(rsi.y).toBeGreaterThanOrEqual(price.y + price.height - 1);
  });

  test('isTransposed draws the time axis vertically', async ({ page }) => {
    await open(page, '?stock-props');
    const axis = (await page.locator('#stock-transposed [data-axis="x"]').first().boundingBox())!;
    expect(axis.height).toBeGreaterThan(axis.width);
    const bar = (await page.locator('#stock-transposed [data-series="price"] path').first().boundingBox())!;
    expect(bar.width).toBeGreaterThan(bar.height);
  });
});

test.describe('StockChart export menu', () => {
  test('the export menu lists PDF and XLSX with exportWriters and downloads a vector PDF and a workbook', async ({ page }) => {
    await open(page);
    const stock = page.locator('#stock');
    await stock.getByRole('button', { name: 'Export' }).click();
    await expect(page.getByRole('menuitem')).toHaveText(['PNG', 'SVG', 'CSV', 'XLSX', 'PDF', 'PRINT']);
    const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'PDF' }).click()]);
    expect(pdf.suggestedFilename()).toBe('chart.pdf');
    const pdfText = readFileSync((await pdf.path()) as string).toString('latin1');
    expect(pdfText.startsWith('%PDF-')).toBe(true);
    expect(pdfText).not.toContain('/Image');
    await stock.getByRole('button', { name: 'Export' }).click();
    const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'XLSX' }).click()]);
    expect(xlsx.suggestedFilename()).toBe('chart.xlsx');
    expect(readFileSync((await xlsx.path()) as string).subarray(0, 2).toString('latin1')).toBe('PK');
  });
});

test.describe('Chart interactions (lazy zoom, pan and selection chunk)', () => {
  const ready = (page: Page, section: string) => expect(page.locator(`#${section} .salmon-viz-plot[data-interactive]`)).toHaveCount(1);
  const box = async (page: Page, section: string) => {
    await plot(page, section).scrollIntoViewIfNeeded();
    const b = await plot(page, section).boundingBox();
    if (!b) throw new Error('no plot');
    return b;
  };

  test('the zoom toolbar is a Navigation Toolbar with a zoom / pan tool group and zoom in, out and reset buttons', async ({ page }) => {
    await open(page);
    await ready(page, 'toolbar');
    const bar = page.locator('#toolbar .salmon-chart-zoom-toolbar');
    await expect(bar).toHaveAttribute('role', 'toolbar');
    await expect(bar).toHaveAccessibleName('Zoom');
    await expect(bar.getByRole('button', { name: 'Reset zoom' })).toBeDisabled();
    // Glyphs are 14 px SVG mask icons in currentColor, never font characters.
    const glyphs = await bar.locator('button').evaluateAll((list) => list.map((b) => ({ text: b.textContent, mask: getComputedStyle(b, '::before').maskImage, width: getComputedStyle(b, '::before').width })));
    expect(glyphs).toHaveLength(5);
    for (const g of glyphs) expect(g).toMatchObject({ text: '', mask: expect.stringContaining('data:image/svg+xml'), width: '14px' });
    await bar.getByRole('button', { name: 'Zoom in' }).click();
    expect((await events(page, 'toolbar-zoom')).at(-1)).toMatchObject({ reason: 'toolbar' });
    await bar.getByRole('button', { name: 'Zoom out' }).click();
    expect((await events(page, 'toolbar-zoom')).length).toBe(2);
    await bar.getByRole('radio', { name: 'Pan' }).click();
    await expect(bar.getByRole('radio', { name: 'Pan' })).toHaveAttribute('aria-checked', 'true');
  });

  test('deferred pan moves only the drawn series and commits one range on release', async ({ page }) => {
    await open(page);
    await ready(page, 'toolbar');
    const bar = page.locator('#toolbar .salmon-chart-zoom-toolbar');
    await bar.getByRole('button', { name: 'Zoom in' }).click();
    await bar.getByRole('radio', { name: 'Pan' }).click();
    const count = (await events(page, 'toolbar-zoom')).length;
    const before = (await events(page, 'toolbar-zoom')).at(-1) as { x: [number, number] };
    const b = await box(page, 'toolbar');
    await page.mouse.move(b.x + b.width * 0.6, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.3, b.y + b.height / 2, { steps: 5 });
    await expect(page.locator('#toolbar .salmon-chart-series-group').first()).toHaveAttribute('transform', /translate\(-/);
    expect((await events(page, 'toolbar-zoom')).length).toBe(count);
    await page.mouse.up();
    await expect(page.locator('#toolbar .salmon-chart-series-group[transform]')).toHaveCount(0);
    const after = (await events(page, 'toolbar-zoom')).at(-1) as { reason: string; x: [number, number] };
    expect(after.reason).toBe('pan');
    expect(after.x[0]).toBeGreaterThan(before.x[0]);
  });

  test('a two-finger pinch zooms through a store frame and commits on release; onVisibleRangeChange reports committed ranges', async ({ page }) => {
    await open(page);
    await ready(page, 'zoom');
    const b = await box(page, 'zoom');
    await page.evaluate(
      ({ x, y, w }) => {
        const el = document.querySelector('#zoom .salmon-viz-plot') as HTMLElement;
        const fire = (type: string, id: number, cx: number) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: cx, clientY: y, button: 0, bubbles: true, isPrimary: id === 1 }));
        fire('pointerdown', 1, x + w * 0.45);
        fire('pointerdown', 2, x + w * 0.55);
        for (let k = 1; k <= 5; k++) {
          fire('pointermove', 1, x + w * (0.45 - k * 0.04));
          fire('pointermove', 2, x + w * (0.55 + k * 0.04));
        }
        fire('pointerup', 1, x + w * 0.25);
        fire('pointerup', 2, x + w * 0.75);
      },
      { x: b.x, y: b.y + b.height / 2, w: b.width },
    );
    const z = (await events(page, 'zoom')).at(-1) as { reason: string; source: string; x: [number, number] };
    expect(z).toMatchObject({ reason: 'pinch', source: 'touch' });
    expect(z.x[1] - z.x[0]).toBeLessThan(120);
    await expect.poll(async () => (await events(page, 'visible')).at(-1)).toMatchObject({ axis: 'x' });
  });

  test('range selection along x selects the enclosed points and reports the x range', async ({ page }) => {
    await open(page);
    await ready(page, 'range-select');
    const b = await box(page, 'range-select');
    await page.mouse.move(b.x + b.width * 0.1, b.y + 4);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.5, b.y + 10, { steps: 4 });
    await expect(page.locator('#range-select .salmon-chart-selection')).toHaveCount(1);
    await page.mouse.up();
    const r = (await events(page, 'range-select')).at(-1) as { reason: string; points: number; x: [number, number] };
    expect(r.reason).toBe('range');
    expect(r.points).toBeGreaterThan(10);
    expect(r.x[0]).toBeGreaterThanOrEqual(2);
    expect(r.x[1]).toBeLessThanOrEqual(22);
    expect((await events(page, 'select')).at(-1)).toMatchObject({ reason: 'range' });
    await expect(page.locator('#range-select path[data-selected]')).toHaveCount(r.points);
  });

  test('a lasso selects the points inside the drawn polygon', async ({ page }) => {
    await open(page);
    await ready(page, 'lasso');
    const b = await box(page, 'lasso');
    const at = (fx: number, fy: number) => page.mouse.move(b.x + b.width * fx, b.y + b.height * fy, { steps: 3 });
    await at(0.02, 0.02);
    await page.mouse.down();
    await at(0.5, 0.02);
    await at(0.5, 0.98);
    await at(0.02, 0.98);
    await expect(page.locator('#lasso path.salmon-chart-selection')).toHaveCount(1);
    await page.mouse.up();
    const r = (await events(page, 'range-select')).at(-1) as { reason: string; points: number };
    expect(r.reason).toBe('lasso');
    expect(r.points).toBeGreaterThan(10);
    expect(r.points).toBeLessThan(30);
  });

  test('cluster selection selects every series at the clicked index; cluster highlight fades the other points', async ({ page }) => {
    await open(page);
    await hover(page, 'cluster', 0.5 / 40, 0.95);
    await expect.poll(async () => page.locator('#cluster path[data-faded]').count()).toBeGreaterThan(70);
    await page.mouse.down();
    await page.mouse.up();
    expect((await events(page, 'select')).at(-1)).toEqual({ kind: 'select', mode: 'cluster', points: ['A:0', 'B:0'], reason: 'click' });
  });

  test('dragging an editable point proposes the clamped value on release; arrows step the focused point; point highlight', async ({ page }) => {
    await open(page);
    await ready(page, 'edit');
    const b = await box(page, 'edit');
    const mark = page.locator('#edit [data-series="North"] path.salmon-chart-marker').nth(2);
    const mb = await mark.boundingBox();
    if (!mb) throw new Error('no marker');
    await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2);
    await expect.poll(async () => page.locator('#edit path[data-faded]').count()).toBeGreaterThan(0);
    await page.mouse.down();
    await page.mouse.move(mb.x + mb.width / 2, b.y - 200, { steps: 5 });
    await expect(page.locator('#edit .salmon-chart-drag-preview')).toHaveCount(1);
    expect(await events(page, 'point-change')).toEqual([]);
    await page.mouse.up();
    expect((await events(page, 'point-change')).at(-1)).toEqual({ kind: 'point-change', index: 2, value: 40, source: 'pointer', reason: 'drag' });
    await expect(page.locator('#edit .salmon-chart-drag-preview')).toHaveCount(0);
    await page.mouse.move(0, 0);
    await plot(page, 'edit').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowUp');
    expect((await events(page, 'point-change')).at(-1)).toEqual({ kind: 'point-change', index: 0, value: 13, source: 'keyboard', reason: 'keyboard' });
  });

  test('double-clicking a point reports it; axis label and label-group clicks report the value and the group', async ({ page }) => {
    await open(page);
    const b = await box(page, 'axis-events');
    await page.mouse.dblclick(b.x + b.width / 12, b.y + b.height * 0.9);
    expect((await events(page, 'dblclick')).at(-1)).toEqual({ kind: 'dblclick', series: 'North', index: 0 });
    await page.locator('#axis-events [data-axis="x"] text[data-tick="1"]').click();
    expect((await events(page, 'axis-label')).at(-1)).toEqual({ kind: 'axis-label', axis: 'x', value: 'Feb', index: 1 });
    await page.locator('#axis-events [data-axis="x"] [data-group="0-1"] text').click();
    expect((await events(page, 'axis-group')).at(-1)).toEqual({ kind: 'axis-group', axis: 'x', label: 'Q2' });
  });
});

test.describe('Chart animation', () => {
  test('the entrance and update transitions start after hydration, never in the server markup, and stop under reduced motion', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, '?hydrate');
    const fig = page.locator('#basic figure.salmon-chart');
    await expect(fig).toHaveAttribute('data-animate', /^(update)?$/);
    const server = await page.evaluate(async () => (await (await fetch(location.href)).text()).includes('data-animate'));
    expect(server).toBe(false);
    const running = () => page.evaluate(() => document.querySelector('#basic .salmon-chart-series-group')?.getAnimations().length ?? 0);
    expect(await running()).toBeGreaterThan(0);
    await expect(fig).toHaveAttribute('data-animate', 'update');
    const transition = await page.evaluate(() => getComputedStyle(document.querySelector('#basic .salmon-viz-mark') as Element).transitionProperty);
    expect(transition).toBe('d');
    expect(problems).toEqual([]);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    expect(await running()).toBe(0);
  });
});

test.describe('StockChart toolbar', () => {
  test('customRange renders a DateRangePicker in a Navigation Toolbar after hydration; typing a range proposes it', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, '?hydrate');
    const section = page.locator('#stock-custom');
    const bar = section.locator('.salmon-stock-chart-toolbar');
    await expect(bar).toHaveAttribute('role', 'toolbar');
    const field = bar.locator('.salmon-stock-chart-range');
    await expect(field).toBeVisible();
    const segs = field.locator('[role="spinbutton"]');
    await expect(segs).toHaveText(['01', '01', '2024', '12', '31', '2024']);
    await segs.nth(0).click();
    await page.keyboard.type('03');
    await page.keyboard.type('01');
    await page.keyboard.type('2024');
    await expect.poll(async () => (await events(page, 'stock-custom')).at(-1)).toEqual({ kind: 'stock-custom', reason: 'customRange', range: ['2024-03-01', '2024-12-31'] });
    await expect(page.locator('#stock .salmon-stock-chart-toolbar')).toHaveAttribute('role', 'toolbar');
    expect(problems).toEqual([]);
  });
});

test.describe('Chart polar and radar', () => {
  test('polar and radar charts with the opt-in polar feature hydrate, show the series and answer hover with a tooltip', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, '?hydrate');
    const polar = page.locator('#polar figure').nth(0);
    const radar = page.locator('#polar figure').nth(1);
    await expect(polar.locator('[data-series="Gusts"] path')).toHaveCount(8);
    await expect(radar.locator('[data-series="A"] path')).toHaveCount(2);
    await expect(polar.locator('[data-axis="polar"] text', { hasText: 'NE' })).toHaveCount(1);
    await polar.scrollIntoViewIfNeeded();
    await expect(polar).toHaveAttribute('data-animate', 'update');
    await page.screenshot({ path: test.info().outputPath('polar.png'), clip: (await page.locator('#polar').boundingBox()) ?? undefined });
    const mark = polar.locator('[data-series="Mean"] path.salmon-chart-marker').nth(2);
    const b = await mark.boundingBox();
    if (!b) throw new Error('no marker');
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await expect(polar.locator('[role="tooltip"]')).toContainText('Mean');
    expect(problems).toEqual([]);
  });
});

test.describe('Shared export and print across families', () => {
  const FAMILIES = ['Chart', 'BulletChart', 'PieChart', 'FunnelChart', 'Gauge', 'HeatMap', 'TreeMap', 'SankeyChart', 'GeoMap', 'Barcode', 'QRCode'];
  const PRINTABLE = FAMILIES.filter((f) => f !== 'Barcode' && f !== 'QRCode');
  type Api = { toBlob(f?: string): Promise<Blob>; toDataURL(f?: string): Promise<string>; toSVGString(): string | Promise<string>; export(o?: object): Promise<void>; print?(): Promise<void> };

  async function ready(page: Page): Promise<void> {
    await page.addInitScript(() => {
      const w = window as unknown as { __clicks: string[] };
      w.__clicks = [];
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
        if (this.download) w.__clicks.push(this.download);
        return click.call(this);
      };
    });
    await open(page);
    await page.evaluate(() => {
      const w = window as unknown as { __vizApis: Record<string, unknown>; __chartApi: unknown };
      w.__vizApis['Chart'] = w.__chartApi;
    });
  }

  test('every family exports PNG, JPEG and SVG blobs, data URLs and standalone SVG markup', async ({ page }) => {
    await ready(page);
    const results = await page.evaluate(async (names) => {
      const apis = (window as unknown as { __vizApis: Record<string, Api> }).__vizApis;
      const out: Record<string, unknown> = {};
      for (const n of names) {
        const api = apis[n] as Api;
        const png = await api.toBlob('png');
        const jpeg = await api.toBlob('jpeg');
        const svg = await api.toBlob('svg');
        const url = await api.toDataURL('png');
        const markup = await api.toSVGString();
        out[n] = { png: png.type, pngBytes: png.size > 100, jpeg: jpeg.type, svg: svg.type.split(';')[0], url: url.slice(0, 22), markup: markup.startsWith('<svg') && markup.includes('xmlns="http://www.w3.org/2000/svg"') };
      }
      return out;
    }, FAMILIES);
    for (const n of FAMILIES) expect(results[n], n).toEqual({ png: 'image/png', pngBytes: true, jpeg: 'image/jpeg', svg: 'image/svg+xml', url: 'data:image/png;base64,', markup: true });
  });

  test('toSVGString is a string on every family', async ({ page }) => {
    await ready(page);
    const results = await page.evaluate((names) => {
      const apis = (window as unknown as { __vizApis: Record<string, Api> }).__vizApis;
      return names.map((n) => {
        const markup = (apis[n] as Api).toSVGString();
        return [n, typeof markup === 'string' && markup.startsWith('<svg') && markup.includes('xmlns="http://www.w3.org/2000/svg"')];
      });
    }, FAMILIES);
    for (const [n, ok] of results) expect(ok, String(n)).toBe(true);
  });

  test('exportVisualizations stacks several families into one image, SVG or PDF', async ({ page }) => {
    await ready(page);
    const r = await page.evaluate(async () => {
      type Combine = (items: unknown[], options: object) => Promise<Blob>;
      const w = window as unknown as { __vizApis: Record<string, { element: Element | null }>; __exportVisualizations: Combine; __vizWriters: object };
      const items = ['Chart', 'PieChart', 'Gauge'].map((n) => w.__vizApis[n]);
      const sizes = items.map((a) => {
        const svg = a?.element?.querySelector('.salmon-viz-surface svg') as SVGSVGElement;
        return [svg.viewBox.baseVal.width, svg.viewBox.baseVal.height];
      });
      const svg = await (await w.__exportVisualizations(items, { format: 'svg', direction: 'horizontal', gap: 10, download: false })).text();
      const png = await w.__exportVisualizations(items, { format: 'png', download: false, scale: 1 });
      const bitmap = await createImageBitmap(png);
      const pdf = await w.__exportVisualizations(items, { format: 'pdf', writers: w.__vizWriters, download: false });
      const head = new TextDecoder('latin1').decode(new Uint8Array(await pdf.arrayBuffer()).slice(0, 5));
      return { sizes, nested: (svg.match(/<svg/g) ?? []).length, width: Number(/^<svg[^>]*\swidth="([\d.]+)"/.exec(svg)?.[1]), inlined: !svg.includes('var(--salmon'), png: png.type, ratio: bitmap.height / bitmap.width, pdf: pdf.type, head };
    });
    const [a, b, c] = r.sizes as [number, number][];
    expect(r.nested).toBeGreaterThanOrEqual(4);
    // Horizontal: the widths plus two gaps; vertical (the PNG): taller than any single drawing's aspect.
    expect(r.width).toBeCloseTo(a![0] + b![0] + c![0] + 20, 0);
    expect(r.inlined).toBe(true);
    expect(r.png).toBe('image/png');
    expect(r.ratio).toBeGreaterThan((a![1] + b![1] + c![1]) / Math.max(a![0], b![0], c![0]) - 0.05);
    expect(r.pdf).toBe('application/pdf');
    expect(r.head).toBe('%PDF-');
  });

  test('api.export downloads the file and its promise settles after the download started', async ({ page }) => {
    await ready(page);
    for (const [k, n] of FAMILIES.entries()) {
      // Chromium blocks a page's automatic downloads after the first few: a fresh page every four.
      if (k && k % 4 === 0) {
        await open(page);
        await page.evaluate(() => {
          const w = window as unknown as { __vizApis: Record<string, unknown>; __chartApi: unknown };
          w.__vizApis['Chart'] = w.__chartApi;
        });
      }
      const [download, order] = await Promise.all([
        page.waitForEvent('download', { timeout: 5000 }),
        page.evaluate(async (name) => {
          const w = window as unknown as { __vizApis: Record<string, Api>; __clicks: string[] };
          await w.__vizApis[name]?.export({ format: 'svg', fileName: `${name}.svg` });
          return w.__clicks.at(-1);
        }, n),
      ]);
      expect(download.suggestedFilename()).toBe(`${n}.svg`);
      expect(order, `${n}: the download click happened before the promise settled`).toBe(`${n}.svg`);
    }
  });

  test('api.print prints the vector drawing from a print frame and settles', async ({ page }) => {
    await ready(page);
    const printed = await page.evaluate(async (names) => {
      const w = window as unknown as { __vizApis: Record<string, Api> };
      const out: Record<string, boolean> = {};
      // The print document is written into a frame: record what is written.
      const writes: string[] = [];
      const append = Node.prototype.appendChild;
      Node.prototype.appendChild = function <T extends Node>(this: Node, node: T): T {
        const added = append.call(this, node) as T;
        const doc = node instanceof HTMLIFrameElement ? node.contentDocument : null;
        if (doc) {
          const write = doc.write.bind(doc);
          doc.write = (...text: string[]) => {
            writes.push(text.join(''));
            write(...text);
          };
        }
        return added;
      };
      for (const n of names) {
        writes.length = 0;
        const t0 = performance.now();
        await w.__vizApis[n]?.print?.();
        out[n] = writes.some((x) => /<svg[^>]*xmlns="http:\/\/www.w3.org\/2000\/svg"[\s\S]*<(path|rect)/.test(x)) && performance.now() - t0 < 3000;
      }
      Node.prototype.appendChild = append;
      return out;
    }, PRINTABLE);
    expect(printed).toEqual(Object.fromEntries(PRINTABLE.map((n) => [n, true])));
    await expect(page.locator('iframe')).toHaveCount(0);
  });
});

test.describe('ARIA snapshots of every family', () => {
  test.use({ locale: 'en-US', timezoneId: 'UTC' });
  // The accessibility tree a screen reader receives per family, pinned as YAML under
  // `data-visualization.spec.ts-snapshots/`; update with `--update-snapshots` and review the diff like code.
  const FIGURES = ['Bullet', 'Pie', 'Funnel', 'Gauge', 'Heat', 'Tree', 'Flow', 'Map'];
  test('figures, plots, legends, tables and image families', async ({ page }) => {
    await open(page);
    await expect(page.locator('#basic figure')).toMatchAriaSnapshot({ name: 'chart.aria.yml' });
    for (const name of FIGURES) {
      const figure = page.locator('#families figure').filter({ has: page.locator('figcaption', { hasText: new RegExp(`^${name}$`) }) });
      await expect(figure).toMatchAriaSnapshot({ name: `${name.toLowerCase()}.aria.yml` });
    }
    await expect(page.locator('#families [role="img"]').first()).toMatchAriaSnapshot({ name: 'barcode.aria.yml' });
    await expect(page.locator('#range form')).toMatchAriaSnapshot({ name: 'range-selector.aria.yml' });
  });
});

test.describe('BulletChart animation', () => {
  test('the feature bars play the chart entrance after hydration (animated)', async ({ page }) => {
    await open(page, '?hydrate');
    const fig = page.locator('#bullet figure.salmon-bullet-chart');
    await expect(fig).toHaveAttribute('data-animate', /^(update)?$/);
    expect(await page.evaluate(() => document.querySelector('#bullet .salmon-chart-series-group')?.getAnimations().length ?? 0)).toBeGreaterThan(0);
  });
});
