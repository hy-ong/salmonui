import { expect, test, type Page } from '@playwright/test';
import { DEV_URL } from './helpers.ts';

// Data Visualization cross-family behavior for every family except Chart, on
// examples/vite-spa/viz-cross.html (the aggregate stylesheet, so the opt-in
// viz-animations.css and viz-rtl.css are loaded).

const open = async (page: Page, query = '') => {
  await page.goto(`${DEV_URL}viz-cross.html${query}`);
  await page.waitForFunction(() => window.__mountMs !== undefined);
};

const FRAMES = ['pie', 'funnel', 'heat', 'tree', 'sankey'] as const;
const ALL = [...FRAMES, 'geo', 'range', 'gauge', 'spark'] as const;
const LEGENDS = ['pie', 'funnel', 'tree', 'sankey', 'geo', 'gauge'] as const;

/** Geometry of one family in page px, relative to its drawing (`svg`). */
async function geometry(page: Page, id: string) {
  return page.evaluate((id) => {
    const root = (document.getElementById(id) ?? document.getElementById(`${id}-wrap`)?.firstElementChild) as Element;
    const svg = (root.tagName === 'svg' ? root : root.querySelector('svg')) as SVGSVGElement;
    const s = svg.getBoundingClientRect();
    const box = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left - s.left), right: Math.round(r.right - s.left), top: Math.round(r.top - s.top), bottom: Math.round(r.bottom - s.top) };
    };
    // Data labels, ticks and values: every drawn text except the titles and the legend.
    const texts = [...svg.querySelectorAll('text')].filter((t) => t.textContent && t.getBBox().width > 0 && !t.closest('.salmon-viz-legend-marks') && !t.matches('.salmon-viz-title, .salmon-viz-subtitle')).map(box);
    const legend = [...root.querySelectorAll('.salmon-viz-legend-item text')].map(box);
    const buttons = [...root.querySelectorAll('.salmon-viz-legend-button')].map(box);
    const mark = svg.querySelector('.salmon-viz-marks > *, .salmon-geo-map-shape, .salmon-range-selector-series path, .salmon-gauge-range, .salmon-sparkline-marks > *');
    return { width: Math.round(s.width), height: Math.round(s.height), title: box(root.querySelector('.salmon-viz-title')), texts, legend, buttons, mark: box(mark) };
  }, id);
}

test.describe('inherited dir="rtl"', () => {
  test('every family: data and its labels stay put, titles and top or bottom legends mirror', async ({ page }) => {
    await open(page);
    const ltr = Object.fromEntries(await Promise.all(ALL.map(async (id) => [id, await geometry(page, id)] as const)));
    await open(page, '?dir=rtl');
    const rtl = Object.fromEntries(await Promise.all(ALL.map(async (id) => [id, await geometry(page, id)] as const)));
    for (const id of ALL) {
      const g = rtl[id]!;
      // The data drawing does not mirror (no axis flips without `reversed`), and its labels keep their
      // anchors: an inherited direction would push start-anchored labels off the drawing.
      expect(g.mark, `${id}: data mark`).toEqual(ltr[id]!.mark);
      expect(g.texts, `${id}: data labels`).toEqual(ltr[id]!.texts);
    }
    for (const id of FRAMES) {
      // The drawn title starts at the inline-start padding: left in LTR, right in RTL.
      expect(ltr[id]!.title!.left).toBe(8);
      expect(Math.abs(rtl[id]!.title!.right - (rtl[id]!.width - 8))).toBeLessThanOrEqual(1);
    }
    for (const id of LEGENDS) {
      const a = ltr[id]!.legend;
      const b = rtl[id]!.legend;
      expect(a.length, `${id}: legend items`).toBeGreaterThan(1);
      // First item at the inline start: leftmost in LTR, rightmost in RTL; each label keeps its width.
      expect(a[0]!.left).toBeLessThan(a[a.length - 1]!.left);
      expect(b[0]!.left).toBeGreaterThan(b[b.length - 1]!.left);
      for (let i = 0; i < a.length; i++) expect(Math.abs(b[i]!.right - b[i]!.left - (a[i]!.right - a[i]!.left))).toBeLessThanOrEqual(1);
      // The toolbar buttons mirror with the drawn items, so each button still covers its item, also when the
      // rendered font is wider than the text estimate the items are laid out with.
      for (const [dir, g] of [['ltr', ltr[id]!], ['rtl', rtl[id]!]] as const) {
        for (let i = 0; i < g.legend.length; i++) {
          const btn = g.buttons[i]!;
          expect(btn.left <= g.legend[i]!.left + 1 && btn.right >= g.legend[i]!.right - 1, `${id} ${dir}: button ${i} over its item`).toBe(true);
        }
      }
    }
  });

  test('legend toolbar arrows follow the mirrored order', async ({ page }) => {
    await open(page, '?dir=rtl');
    const buttons = page.locator('#pie .salmon-viz-legend-button');
    await buttons.first().focus();
    await page.keyboard.press('ArrowLeft');
    await expect(buttons.nth(1)).toBeFocused();
    const [a, b] = [await buttons.nth(0).boundingBox(), await buttons.nth(1).boundingBox()];
    expect(b!.x).toBeLessThan(a!.x);
  });
});

test.describe('entrance and update transitions', () => {
  test('set after hydration, update after the entrance, CSS keyed on it, off with animated={false}', async ({ page }) => {
    await open(page);
    const attrs = () =>
      page.evaluate(() =>
        ['pie', 'funnel', 'heat', 'tree', 'sankey', 'geo', 'range-wrap', 'spark', 'spark-canvas'].map((id) => {
          const el = document.getElementById(id)!;
          const host = id === 'range-wrap' ? el.firstElementChild! : id.startsWith('spark') ? el.querySelector('.salmon-sparkline-marks')! : el;
          return host.getAttribute('data-animate');
        }),
      );
    const first = await attrs();
    expect(first.every((a) => a === '' || a === 'update')).toBe(true);
    const names = await page.evaluate(() =>
      ['#pie .salmon-viz-marks', '#funnel .salmon-viz-marks', '#heat .salmon-viz-marks', '#tree .salmon-viz-marks', '#sankey .salmon-viz-marks', '#geo .salmon-geo-map-layer', '#range-wrap .salmon-range-selector-series', '#spark .salmon-sparkline-marks'].map((s) => getComputedStyle(document.querySelector(s)!).animationName),
    );
    expect(names).toEqual(Array(8).fill('salmon-viz-enter'));
    await page.waitForTimeout(800);
    const later = await attrs();
    expect(later.slice(0, 5)).toEqual(['update', 'update', 'update', 'update', 'update']);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('#tree .salmon-tree-map-leaf > rect')!).transitionProperty)).toContain('width');
    await open(page, '?static');
    expect((await attrs()).every((a) => a === null)).toBe(true);
  });

  test('prefers-reduced-motion turns the CSS off', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    const names = await page.evaluate(() => ['#pie .salmon-viz-marks', '#heat .salmon-viz-marks', '#spark .salmon-sparkline-marks'].map((s) => getComputedStyle(document.querySelector(s)!).animationName));
    expect(names).toEqual(['none', 'none', 'none']);
  });
});

test.describe('CSS-driven size and onResize', () => {
  test('without height the root height or aspect-ratio from CSS sizes the drawing; onResize reports it', async ({ page }) => {
    await open(page, '?size=css');
    for (const id of ['pie', 'heat', 'tree', 'sankey']) {
      const g = await geometry(page, id);
      expect([g.width, g.height], id).toEqual([720, 300]);
      expect(await page.locator(`#${id} svg`).first().getAttribute('viewBox')).toBe('0 0 720 300');
    }
    // aspect-ratio: 2 / 1 on the root.
    expect(await page.locator('#funnel svg').first().getAttribute('viewBox')).toBe('0 0 720 360');
    expect(await page.locator('#range-wrap svg').first().getAttribute('viewBox')).toBe('0 0 720 120');
    const sizes = await page.evaluate(() => window.__vizCrossEvents.filter((e) => e.type.startsWith('resize:')).map((e) => `${e.type}=${(e.value as { width: number; height: number }).width}x${(e.value as { width: number; height: number }).height}`));
    expect(sizes).toEqual(expect.arrayContaining(['resize:pie=720x300', 'resize:funnel=720x360', 'resize:heat=720x300', 'resize:tree=720x300', 'resize:sankey=720x300', 'resize:range=720x120']));
    // A container change relays out once and reports the new size.
    await page.evaluate(() => ((document.querySelector('main') as HTMLElement).style.maxWidth = '520px'));
    await expect(page.locator('#heat svg').first()).toHaveAttribute('viewBox', '0 0 520 300');
    await expect(page.locator('#funnel svg').first()).toHaveAttribute('viewBox', '0 0 520 260');
    await expect.poll(() => page.evaluate(() => window.__vizCrossEvents.some((e) => e.type === 'resize:heat' && (e.value as { width: number }).width === 520))).toBe(true);
  });

  test('with a numeric height the drawing keeps it; fixed-drawing families scale through viewBox', async ({ page }) => {
    await open(page);
    expect(await page.locator('#heat svg').first().getAttribute('viewBox')).toBe('0 0 720 260');
    expect(await page.locator('#range-wrap svg').first().getAttribute('viewBox')).toBe('0 0 720 80');
    // Gauge, GeoMap and Sparkline: `width` / `height` are the drawing size, the CSS box scales it.
    await page.evaluate(() => {
      (document.getElementById('gauge')!.querySelector('.salmon-viz-surface') as HTMLElement).style.maxInlineSize = '100px';
      (document.getElementById('spark') as unknown as SVGSVGElement).style.width = '200px';
    });
    expect(await page.locator('#gauge svg').first().getAttribute('viewBox')).toBe('0 0 200 240');
    expect(Math.round((await page.locator('#gauge svg').first().boundingBox())!.width)).toBe(100);
    expect(Math.round((await page.locator('#spark').boundingBox())!.width)).toBe(200);
    // The 480 x 300 map drawing fills its 720 px wide surface.
    expect(await page.locator('#geo svg').first().getAttribute('viewBox')).toBe('0 0 480 300');
    expect((await page.locator('#geo svg').first().boundingBox())!.width).toBeCloseTo(720, 0);
  });
});

test.describe('Sparkline canvas renderer', () => {
  test('renderer="canvas" with canvasRenderer draws the marks on a canvas; SVG keeps the rest', async ({ page }) => {
    await open(page);
    const info = await page.evaluate(() => {
      const svg = document.getElementById('spark-canvas') as unknown as SVGSVGElement;
      const canvas = svg.querySelector('foreignObject > canvas') as HTMLCanvasElement;
      const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let painted = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) painted++;
      return { paths: svg.querySelectorAll('path').length, width: canvas.width, height: canvas.height, painted, role: svg.getAttribute('role'), label: svg.getAttribute('aria-label') };
    });
    expect(info.paths).toBe(0);
    expect([info.width, info.height]).toEqual([200, 48]);
    expect(info.painted).toBeGreaterThan(200);
    expect(info.role).toBe('img');
    expect(info.label).toContain('24 points');
  });
});

test.describe('development data-color contrast warning', () => {
  test('low-contrast data colors warn once per family in development; the default palette does not', async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => window.__vizCrossWarnings.filter((w) => w.includes('data color')))).toEqual([]);
    await open(page, '?lowcolor');
    const warnings = await page.evaluate(() => window.__vizCrossWarnings.filter((w) => w.includes('data color')));
    for (const family of ['salmon-pie-chart', 'salmon-heat-map', 'salmon-geo-map', 'salmon-gauge', 'salmon-sparkline']) {
      const mine = warnings.filter((w) => w.includes(`${family}: the data colors `));
      expect(mine, family).toHaveLength(1);
      // The heat map draws the low stop mixed with the high one; the others draw it as given.
      if (family !== 'salmon-heat-map') expect(mine[0]).toContain('#f5f5f5');
    }
  });
});
