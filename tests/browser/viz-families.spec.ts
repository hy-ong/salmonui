import { expect, test, type Page } from '@playwright/test';
import { expectClean } from './axe.ts';
import { DEV_URL } from './helpers.ts';

// Data Visualization behaviour (pie, sparkline, heat map, treemap and Sankey)
// on examples/vite-spa/viz-families.html:
// pointer hover and tooltips, click actions, legend toggles, the
// one-tab-stop keyboard models with live announcements, drill-down, and
// axe-core in LTR and RTL.

const open = async (page: Page, query: string) => {
  await page.goto(`${DEV_URL}viz-families.html?${query}`);
  await page.waitForFunction(() => window.__mountMs !== undefined);
};
const events = (page: Page) => page.evaluate(() => window.__vizFamilyEvents);
const live = (page: Page, root: string) => page.locator(`${root} [aria-live="polite"]`).first();

/** A client point inside the fill of an SVG mark (searched on a grid over its box). */
async function inside(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const p = await page.evaluate((sel) => {
    const el = document.querySelector(sel) as SVGGeometryElement | null;
    if (!el) return null;
    const svg = el.ownerSVGElement as SVGSVGElement;
    const box = el.getBBox();
    const ctm = el.getScreenCTM() as DOMMatrix;
    const pt = svg.createSVGPoint();
    for (let fy = 0.5, k = 0; k < 9; k++, fy = k % 2 ? 0.5 - k * 0.05 : 0.5 + k * 0.05)
      for (let fx = 0.5, j = 0; j < 9; j++, fx = j % 2 ? 0.5 - j * 0.05 : 0.5 + j * 0.05) {
        pt.x = box.x + box.width * fx;
        pt.y = box.y + box.height * fy;
        if (el.isPointInFill(pt)) {
          const s = pt.matrixTransform(ctm);
          return { x: s.x, y: s.y };
        }
      }
    return null;
  }, selector);
  if (!p) throw new Error(`no point inside ${selector}`);
  return p;
}

test.describe('PieChart and FunnelChart', () => {
  test('keyboard: one tab stop, arrows announce label, value and percent, Enter selects', async ({ page }) => {
    await open(page, 'case=pie');
    const plot = page.locator('#pie .salmon-viz-plot');
    await plot.focus();
    await page.keyboard.press('ArrowRight');
    await expect(live(page, '#pie')).toHaveText('North: 42, 42%');
    await expect(page.locator('#pie [role="tooltip"]')).toContainText('North');
    await expect(page.locator('#pie .salmon-pie-chart-center')).toHaveText('North 42');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('selected')).toHaveText('0:0');
    await page.keyboard.press('End');
    await expect(live(page, '#pie')).toHaveText('West: 12, 12%');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('selected')).toHaveText('0:0,0:3');
    await page.keyboard.press('Home');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('selected')).toHaveText('0:3');
    await page.keyboard.press('Escape');
    await expect(page.locator('#pie [role="tooltip"]')).toHaveCount(0);
    const sel = (await events(page)).filter((e) => e.type === 'selected');
    expect(sel.at(-1)).toMatchObject({ source: 'keyboard', reason: 'keyboard' });
    expect(await page.locator('#pie path[data-selected]').count()).toBe(1);
  });

  test('pointer: hover shows the tooltip and highlights, click selects and explodes', async ({ page }) => {
    await open(page, 'case=pie');
    const p = await inside(page, '#pie path[data-index="1"]');
    await page.mouse.move(p.x, p.y);
    await expect(page.locator('#pie [role="tooltip"]')).toContainText('South');
    await expect(page.locator('#pie .salmon-pie-chart-center')).toHaveText('South 28');
    expect(await page.locator('#pie path[data-dimmed]').count()).toBe(3);
    await page.mouse.click(p.x, p.y);
    await expect(page.getByTestId('selected')).toHaveText('0:1');
    expect((await events(page)).find((e) => e.type === 'click')).toMatchObject({ value: 'South', source: 'pointer' });
    await page.mouse.move(5, 5);
    await expect(page.locator('#pie [role="tooltip"]')).toHaveCount(0);
    await expect(page.locator('#pie .salmon-pie-chart-center')).toHaveText('Total 100');
    // Explosion toggles on click.
    const q = await inside(page, '#explode path[data-index="2"]');
    await page.mouse.click(q.x, q.y);
    await expect(page.locator('#explode path[data-index="2"]')).toHaveAttribute('transform', /translate\(/);
    expect((await events(page)).find((e) => e.type === 'exploded')).toMatchObject({ value: [2], source: 'pointer' });
  });

  test('legend toolbar toggles points through hiddenPoints', async ({ page }) => {
    await open(page, 'case=pie');
    const legend = page.locator('#pie [role="toolbar"]');
    const south = legend.getByRole('button', { name: 'South' });
    await expect(south).toHaveAttribute('aria-pressed', 'true');
    await south.click();
    await expect(south).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#pie path.salmon-accumulation-point')).toHaveCount(3);
    expect((await events(page)).find((e) => e.type === 'hidden')).toMatchObject({ value: [1], reason: 'legend' });
    // APG toolbar: one tab stop, arrows move.
    await legend.getByRole('button', { name: 'North' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(south).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(south).toHaveAttribute('aria-pressed', 'true');
  });

  test('funnel segments select by click and keyboard', async ({ page }) => {
    await open(page, 'case=funnel');
    const p = await inside(page, '#funnel path[data-index="1"]');
    await page.mouse.click(p.x, p.y);
    expect((await events(page)).at(-1)).toMatchObject({ type: 'selected', value: [{ series: 0, index: 1 }] });
    await page.locator('#funnel .salmon-viz-plot').focus();
    await page.keyboard.press('ArrowDown');
    await expect(live(page, '#funnel')).toHaveText('Visits: 1,000, 49.5%');
  });

  test('trapezoidal funnel: bars by value, connectors in the gaps, same selection and keyboard', async ({ page }) => {
    await open(page, 'case=funnel&variant=trapezoidal');
    const bars = page.locator('#funnel path.salmon-accumulation-point');
    await expect(bars).toHaveCount(4);
    await expect(page.locator('#funnel path.salmon-funnel-chart-connector')).toHaveCount(3);
    const boxes = await bars.evaluateAll((els) => els.map((el) => (el as SVGGraphicsElement).getBBox()).map((b) => ({ w: b.width, h: b.height })));
    for (const b of boxes) expect(Math.abs(b.h - (boxes[0]?.h ?? 0))).toBeLessThan(0.05);
    for (let k = 1; k < boxes.length; k++) expect(boxes[k]!.w).toBeLessThan(boxes[k - 1]!.w);
    // Connectors are decoration: a click on a bar selects it.
    const p = await inside(page, '#funnel path[data-index="1"]');
    await page.mouse.click(p.x, p.y);
    expect((await events(page)).at(-1)).toMatchObject({ type: 'selected', value: [{ series: 0, index: 1 }] });
    await page.locator('#funnel .salmon-viz-plot').focus();
    await page.keyboard.press('ArrowDown');
    await expect(live(page, '#funnel')).toHaveText('Visits: 1,000, 49.5%');
    await expectClean(page, 'trapezoidal funnel');
  });

  test('axe-core clean, LTR and RTL', async ({ page }) => {
    await open(page, 'case=pie');
    await expectClean(page, 'pie');
    await open(page, 'case=pie&rtl');
    await expectClean(page, 'pie rtl');
    await open(page, 'case=funnel&shape=pyramid');
    await expectClean(page, 'pyramid');
  });
});

test.describe('Sparkline', () => {
  test('no tooltip or listener at rest; hover and keyboard show the tooltip and track line', async ({ page }) => {
    await open(page, 'case=sparkline');
    const line = page.locator('#spark-line');
    await expect(line).toHaveAttribute('role', 'img');
    await expect(line).toHaveAttribute('aria-label', /^Sparkline, 24 points, minimum \d+, maximum \d+/);
    await expect(page.locator('.salmon-sparkline-tooltip')).toHaveCount(0);
    await expect(page.locator('#spark-area')).not.toHaveAttribute('tabindex', /./);
    const box = (await line.boundingBox())!;
    await page.mouse.move(box.x + 3, box.y + box.height / 2);
    await page.mouse.move(box.x + 5, box.y + box.height / 2);
    await expect(page.locator('.salmon-sparkline-tooltip')).toBeVisible();
    await expect(page.locator('#spark-line .salmon-sparkline-track')).toHaveCount(1);
    const first = await page.locator('.salmon-sparkline-tooltip').innerText();
    await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2);
    await expect(page.locator('.salmon-sparkline-tooltip')).not.toHaveText(first);
    await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2);
    expect((await events(page)).at(-1)).toMatchObject({ type: 'point', value: 23, source: 'pointer' });
    await page.mouse.move(0, 0);
    await expect(page.locator('.salmon-sparkline-tooltip')).toHaveCount(0);
    await page.getByTestId('after').focus();
    await line.focus();
    await expect(page.locator('.salmon-sparkline-tooltip')).toBeVisible();
    await page.keyboard.press('Home');
    await page.keyboard.press('Enter');
    expect((await events(page)).at(-1)).toMatchObject({ type: 'point', value: 0, source: 'keyboard' });
    await page.keyboard.press('Escape');
    await expect(page.locator('.salmon-sparkline-tooltip')).toHaveCount(0);
  });

  test('axe-core clean', async ({ page }) => {
    await open(page, 'case=sparkline');
    await expectClean(page, 'sparkline');
  });
});

test.describe('HeatMap', () => {
  test('keyboard moves by cell, row and edge, announces, and Enter selects', async ({ page }) => {
    await open(page, 'case=heat');
    await page.locator('#heat .salmon-viz-plot').focus();
    await page.keyboard.press('ArrowRight');
    await expect(live(page, '#heat')).toHaveText(/^00, Mon: \d+$/);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await expect(live(page, '#heat')).toHaveText(/^04, Tue: \d+$/);
    await page.keyboard.press('End');
    await expect(live(page, '#heat')).toHaveText(/^04, Sun: /);
    await page.keyboard.press('PageDown');
    await expect(live(page, '#heat')).toHaveText(/^20, Sun: /);
    await page.keyboard.press('Home');
    await page.keyboard.press('Enter');
    expect((await events(page)).filter((e) => e.type === 'selected').at(-1)).toMatchObject({ value: [{ x: 0, y: 5 }], source: 'keyboard' });
    await expect(page.locator('#heat .salmon-heat-map-selected')).toHaveCount(1);
    await expect(page.locator('#heat [role="tooltip"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#heat [role="tooltip"]')).toHaveCount(0);
  });

  test('hover tooltip, click, multiple selection and step legend toggles', async ({ page }) => {
    await open(page, 'case=heat');
    const cell = page.locator('#heat rect.salmon-heat-map-cell').nth(8);
    const b = (await cell.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await expect(page.locator('#heat [role="tooltip"]')).toContainText('04 · Tue');
    await expect(page.locator('#heat .salmon-heat-map-hover')).toHaveCount(1);
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    const c2 = (await page.locator('#heat rect.salmon-heat-map-cell').nth(0).boundingBox())!;
    await page.mouse.click(c2.x + 4, c2.y + 4);
    expect((await events(page)).filter((e) => e.type === 'selected').at(-1)?.value).toEqual([
      { x: 1, y: 1 },
      { x: 0, y: 0 },
    ]);
    expect((await events(page)).find((e) => e.type === 'click')).toMatchObject({ value: '1,1' });
    await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
    expect((await events(page)).find((e) => e.type === 'dblclick')).toMatchObject({ value: '1,1' });
    const high = page.locator('#heat [role="toolbar"]').getByRole('button', { name: 'High' });
    await high.click();
    await expect(high).toHaveAttribute('aria-pressed', 'false');
    expect(await page.locator('#heat rect[data-hidden]').count()).toBeGreaterThan(0);
    expect((await events(page)).find((e) => e.type === 'hidden')).toMatchObject({ value: [2], reason: 'legend' });
  });

  test('axe-core clean, LTR and RTL', async ({ page }) => {
    await open(page, 'case=heat');
    await expectClean(page, 'heat map');
    await open(page, 'case=heat&rtl');
    await expectClean(page, 'heat map rtl');
  });
});

test.describe('TreeMap', () => {
  test('click drills into a group, breadcrumbs drill out, selection in the drilled view', async ({ page }) => {
    await open(page, 'case=tree');
    const p = await inside(page, '#tree [data-path="Sales/Americas"] rect');
    await page.mouse.click(p.x, p.y);
    await expect(page.getByTestId('path')).toHaveText('Sales');
    expect((await events(page)).at(-1)).toMatchObject({ type: 'path', value: ['Sales'], reason: 'drill', source: 'pointer' });
    const crumbs = page.getByRole('navigation', { name: 'Tree map path' });
    await expect(crumbs.locator('[aria-current="location"]')).toHaveText('Sales');
    await expect(page.locator('#tree .salmon-tree-map-leaf')).toHaveCount(2);
    const q = await inside(page, '#tree [data-path="Sales/EMEA"] rect');
    await page.mouse.click(q.x, q.y);
    expect((await events(page)).at(-1)).toMatchObject({ type: 'selected', value: [['Sales', 'EMEA']] });
    await crumbs.getByRole('button', { name: 'All' }).click();
    await expect(page.getByTestId('path')).toHaveText('');
    expect((await events(page)).at(-1)).toMatchObject({ type: 'path', value: [], reason: 'breadcrumb' });
  });

  test('APG tree keys: arrows across siblings, Enter drills in, Backspace drills out; hover tooltip', async ({ page }) => {
    await open(page, 'case=tree');
    await page.locator('#tree .salmon-viz-plot').focus();
    await page.keyboard.press('ArrowRight');
    await expect(live(page, '#tree')).toHaveText('Engineering: 90, 3 items');
    await page.keyboard.press('ArrowRight');
    await expect(live(page, '#tree')).toHaveText('Sales: 60, 2 items');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('path')).toHaveText('Sales');
    expect((await events(page)).at(-1)).toMatchObject({ type: 'path', source: 'keyboard' });
    await page.keyboard.press('ArrowRight');
    await expect(live(page, '#tree')).toHaveText(/^(Americas|EMEA): \d+$/);
    await page.keyboard.press('Backspace');
    await expect(page.getByTestId('path')).toHaveText('');
    const p = await inside(page, '#tree [data-path="Support/Tier 1"] rect');
    await page.mouse.move(p.x, p.y);
    await expect(page.locator('#tree [role="tooltip"]')).toContainText('Support / Tier 1');
    await expect(page.locator('#tree .salmon-tree-map-hover')).toHaveCount(1);
  });

  test('axe-core clean', async ({ page }) => {
    await open(page, 'case=tree');
    await expectClean(page, 'tree map');
  });
});

test.describe('SankeyChart', () => {
  test('keyboard: nodes by column, Enter into links, Escape back; live region', async ({ page }) => {
    await open(page, 'case=sankey');
    await page.locator('#sankey .salmon-viz-plot').focus();
    await page.keyboard.press('ArrowDown');
    await expect(live(page, '#sankey')).toHaveText('Coal: 30, 0 incoming, 1 outgoing');
    await page.keyboard.press('ArrowDown');
    await expect(live(page, '#sankey')).toHaveText('Gas: 25, 0 incoming, 1 outgoing');
    await page.keyboard.press('ArrowRight');
    await expect(live(page, '#sankey')).toHaveText('Grid: 70, 3 incoming, 2 outgoing');
    await page.keyboard.press('Enter');
    await expect(live(page, '#sankey')).toHaveText(/^Grid to (Homes|Industry): \d+$/);
    expect((await events(page)).at(-1)).toMatchObject({ type: 'node', value: 'grid', source: 'keyboard' });
    await page.keyboard.press('ArrowDown');
    await expect(live(page, '#sankey')).toHaveText(/ to /);
    await page.keyboard.press('Escape');
    await expect(live(page, '#sankey')).toHaveText('Grid: 70, 3 incoming, 2 outgoing');
  });

  test('hover highlights adjacent flows and shows node and link tooltips; clicks report', async ({ page }) => {
    await open(page, 'case=sankey');
    const coal = await inside(page, '#sankey rect[data-id="coal"]');
    await page.mouse.move(coal.x, coal.y);
    await expect(page.locator('#sankey [role="tooltip"]')).toContainText('Coal');
    await expect(page.locator('#sankey rect[data-id="homes"]')).toHaveAttribute('data-dimmed', '');
    await expect(page.locator('#sankey rect[data-id="grid"]')).not.toHaveAttribute('data-dimmed', /.*/);
    await page.mouse.click(coal.x, coal.y);
    expect((await events(page)).at(-1)).toMatchObject({ type: 'node', value: 'coal', source: 'pointer' });
    const link = page.locator('#sankey path[data-source="grid"][data-target="homes"]');
    const pt = await page.evaluate(() => {
      const el = document.querySelector('#sankey path[data-source="grid"][data-target="homes"]') as SVGPathElement;
      const mid = el.getPointAtLength(el.getTotalLength() / 2);
      const s = new DOMPoint(mid.x, mid.y).matrixTransform(el.getScreenCTM() as DOMMatrix);
      return { x: s.x, y: s.y };
    });
    await expect(link).toHaveCount(1);
    await page.mouse.move(pt.x, pt.y);
    await expect(page.locator('#sankey [role="tooltip"]')).toContainText('Grid → Homes');
    await page.mouse.click(pt.x, pt.y);
    expect((await events(page)).at(-1)).toMatchObject({ type: 'link', value: 'grid>homes' });
    // Legend hover highlights a node's flows.
    await page.mouse.move(0, 0);
    await page.locator('#sankey [role="toolbar"]').getByRole('button', { name: 'Solar' }).hover();
    await expect(page.locator('#sankey rect[data-id="coal"]')).toHaveAttribute('data-dimmed', '');
  });

  test('instance exports the SVG and onResize reports the measured size', async ({ page }) => {
    await open(page, 'case=sankey&responsive');
    await expect.poll(async () => (await events(page)).find((e) => e.type === 'resize')?.value).toMatchObject({ height: 340 });
    const width = ((await events(page)).find((e) => e.type === 'resize')?.value as { width: number }).width;
    expect(width).toBeGreaterThan(600);
    const svg = await page.evaluate(() => window.__vizApi!.toSVGString());
    expect(svg).toMatch(/^<svg[^>]*xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    expect(svg).toContain('salmon-sankey-chart-link');
    // toSVGString is synchronous and keeps theme colors as variables; the SVG file has them resolved.
    expect(await page.evaluate(() => typeof (window.__vizApi!.toSVGString() as unknown))).toBe('string');
    const file = await page.evaluate(async () => (await window.__vizApi!.toBlob('svg')).text());
    expect(file).toContain('salmon-sankey-chart-link');
    expect(file).not.toContain('var(--salmon-');
    const url = await page.evaluate(() => window.__vizApi!.toDataURL('png'));
    expect(url).toMatch(/^data:image\/png;base64,/);
    await page.evaluate(() => window.__vizApi!.focus());
    await expect(page.locator('#sankey .salmon-viz-plot')).toBeFocused();
  });

  test('axe-core clean', async ({ page }) => {
    await open(page, 'case=sankey');
    await expectClean(page, 'sankey');
  });
});
