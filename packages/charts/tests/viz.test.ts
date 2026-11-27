import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  arcAt,
  arcPath,
  areaPath,
  bandScale,
  binPoints,
  aggregateOhlc,
  categoricalPalette,
  colorScale,
  dataColorContrastOk,
  midHue,
  PALETTE_LIGHTNESS,
  paletteHues,
  createPointIndex,
  cvdDistance,
  decimateLine,
  describeChart,
  divergingColor,
  layoutFrame,
  linePath,
  linearScale,
  logScale,
  logTicks,
  lttb,
  minMaxDecimate,
  MIN_CVD_DISTANCE,
  nearestSorted,
  niceDomain,
  niceTicks,
  paletteColor,
  planHorizontalLabels,
  pointInPolygon,
  rectAt,
  resolveDomain,
  resolveLabelOverlaps,
  seriesStats,
  splitPanes,
  stack,
  symbolPath,
  tableModel,
  textWidth,
  timeScale,
  timeTicks,
  truncateText,
  visibleRange,
  wrapText,
} from '../dist/viz/index.js';
import { layoutFrame as frameOf, layoutTitles, LEGEND_PAGER_WIDTH } from '../dist/viz/index.js';
import { contrastRatio, gamutMap, parseHex, type Rgb } from '../../core/dist/internal/theme/color.js';
import { resolveTheme } from '../../core/dist/internal/theme/derive.js';
import { assertBudget } from '../../../tooling/bench/budget.mjs';

describe('viz:ticks', () => {
  it('produces 1-2-5 nice ticks without float noise', () => {
    assert.deepEqual(niceTicks(0, 1, 5), [0, 0.2, 0.4, 0.6, 0.8, 1]);
    assert.deepEqual(niceTicks(0.1, 0.7, 6), [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]);
    assert.deepEqual(niceDomain(3, 97), [0, 100]);
    assert.deepEqual(niceDomain(-0.37, 0.81, 5), [-0.4, 1]);
  });
  it('resolves domains with includeZero, padding and explicit bounds', () => {
    assert.deepEqual(resolveDomain([20, 80]), [0, 80]);
    assert.deepEqual(resolveDomain([20, 80], { includeZero: false }), [20, 80]);
    assert.deepEqual(resolveDomain([20, 80], { includeZero: false, padding: 'none' }), [20, 80]);
    assert.deepEqual(resolveDomain([20, 80], { min: 10, max: 90 }), [10, 90]);
    assert.deepEqual(resolveDomain([3, 4000], { kind: 'log' }), [1, 10000]);
  });
  it('log ticks are powers of the base', () => {
    assert.deepEqual(logTicks(1, 10000), [1, 10, 100, 1000, 10000]);
    assert.deepEqual(logTicks(1, 100), [1, 2, 5, 10, 20, 50, 100]);
  });
});

describe('viz:timeTicks', () => {
  it('ticks on month boundaries over a year', () => {
    const t = timeTicks(Date.UTC(2024, 0, 1), Date.UTC(2024, 11, 31));
    assert.equal(t.interval.unit, 'month');
    assert.deepEqual(
      t.values.map((v) => new Date(v).toISOString().slice(0, 10)),
      ['2024-01-01', '2024-03-01', '2024-05-01', '2024-07-01', '2024-09-01', '2024-11-01'],
    );
  });
  it('keeps local midnight across a DST change in the given time zone', () => {
    const t = timeTicks(Date.UTC(2024, 2, 8), Date.UTC(2024, 2, 13), { timeZone: 'America/New_York' });
    const iso = t.values.map((v) => new Date(v).toISOString());
    assert.ok(iso.includes('2024-03-10T05:00:00.000Z'));
    assert.ok(iso.includes('2024-03-11T04:00:00.000Z'));
  });
  it('time scale exposes the chosen interval', () => {
    const s = timeScale({ domain: [Date.UTC(2024, 0, 1), Date.UTC(2024, 0, 2)], range: [0, 600] });
    const ticks = s.ticks(6);
    assert.equal(s.interval?.unit, 'hour');
    assert.equal(ticks[0], Date.UTC(2024, 0, 1));
  });
});

describe('viz:scale', () => {
  it('linear maps, inverts and reverses', () => {
    const s = linearScale({ domain: [0, 100], range: [0, 200] });
    assert.equal(s.map(50), 100);
    assert.equal(s.invert(150), 75);
    const r = linearScale({ domain: [0, 100], range: [0, 200], reversed: true });
    assert.equal(r.map(0), 200);
  });
  it('log maps decades evenly', () => {
    const s = logScale({ domain: [1, 1000], range: [0, 300] });
    assert.ok(Math.abs(s.map(10) - 100) < 1e-9);
    assert.ok(Math.abs(s.invert(200) - 100) < 1e-9);
  });
  it('band scale centers categories and inverts to the nearest index', () => {
    const s = bandScale({ domain: ['a', 'b', 'c', 'd'], range: [0, 400], paddingInner: 0.2 });
    assert.ok(s.bandwidth > 0 && s.bandwidth < 100);
    assert.equal(s.invert(s.map(2)), 2);
    assert.ok(s.map(0) < s.map(1));
    const on = bandScale({ domain: ['a', 'b', 'c'], range: [0, 200], placement: 'on' });
    assert.equal(on.map(0), 0);
    assert.equal(on.map(2), 200);
  });
});

describe('viz:text', () => {
  it('estimates widths deterministically and truncates with an ellipsis', () => {
    assert.equal(textWidth('Hello'), textWidth('Hello'));
    assert.ok(textWidth('WWW') > textWidth('iii'));
    assert.ok(textWidth('中文') > textWidth('ab'));
    const t = truncateText('A very long category label', 60);
    assert.ok(t.endsWith('…'));
    assert.ok(textWidth(t) <= 60);
    assert.deepEqual(wrapText('North America', 60), ['North', 'America']);
  });
});

describe('viz:geometry', () => {
  it('rounds coordinates to 0.01 px and breaks lines at gaps', () => {
    assert.equal(linePath([0, 1.234567, 2], [0, 1, Number.NaN]), 'M0,0L1.23,1');
    assert.equal(linePath([0, 10, 20, 30], [0, 5, Number.NaN, 5]), 'M0,0L10,5M30,5');
  });
  it('builds every curve type', () => {
    for (const curve of ['linear', 'natural', 'monotone', 'cardinal', 'clamped', 'step'] as const) {
      const d = linePath([0, 10, 20, 30], [5, 0, 8, 2], { curve });
      assert.match(d, /^M0,5/, curve);
    }
    assert.equal(linePath([0, 10], [0, 5], { curve: 'step' }), 'M0,0L10,0L10,5');
    assert.equal(linePath([0, 10], [0, 5], { curve: 'step', stepPosition: 'end' }), 'M0,0L0,5L10,5');
  });
  it('closes areas against a constant or per-point base', () => {
    assert.equal(areaPath([0, 10], [5, 0], 20), 'M0,5L10,0L10,20L0,20Z');
    assert.equal(areaPath([0, 10], [5, 0], [8, 9]), 'M0,5L10,0L10,9L0,8Z');
  });
  it('draws arcs and symbols', () => {
    assert.match(arcPath(50, 50, 0, 40, 0, Math.PI / 2), /^M50,10A40,40 0 0 1 90,50L50,50Z$/);
    assert.match(arcPath(50, 50, 20, 40, 0, Math.PI * 2), /Z.*Z$/);
    assert.ok(symbolPath('circle', 5, 5, 10).startsWith('M0,5'));
    assert.equal(symbolPath('none', 0, 0, 10), '');
  });
});

describe('viz:stack', () => {
  it('stacks positive and negative values separately and computes percent stacks', () => {
    const r = stack(
      [
        { id: 'a', values: [1, -2, 3], mode: 'normal' },
        { id: 'b', values: [2, -1, Number.NaN], mode: 'normal' },
      ],
      3,
    );
    assert.deepEqual([...(r.series.get('b')?.y0 ?? [])].slice(0, 2), [1, -2]);
    assert.deepEqual([...(r.series.get('b')?.y1 ?? [])].slice(0, 2), [3, -3]);
    assert.ok(Number.isNaN(r.series.get('b')?.y1[2] as number));
    const p = stack(
      [
        { id: 'a', values: [1, 3], mode: 'percent' },
        { id: 'b', values: [3, 1], mode: 'percent' },
      ],
      2,
    );
    assert.deepEqual([...(p.series.get('b')?.y1 ?? [])], [100, 100]);
    assert.deepEqual([...(p.series.get('a')?.y1 ?? [])], [25, 75]);
  });
});

describe('viz:decimate', () => {
  const n = 1_000_000;
  const xs = Float64Array.from({ length: n }, (_, i) => i);
  const ys = Float64Array.from({ length: n }, (_, i) => Math.sin(i / 997) * 100 + (i % 13));
  it('min/max keeps at most four points per pixel column, including the extremes', () => {
    const width = 800;
    const idx = minMaxDecimate(xs, ys, (x) => (x / n) * width);
    assert.ok(idx.length <= width * 4 + 4, `${idx.length}`);
    let maxI = 0;
    for (let i = 0; i < n; i++) if ((ys[i] as number) > (ys[maxI] as number)) maxI = i;
    assert.ok(idx.includes(maxI));
    for (let i = 1; i < idx.length; i++) assert.ok((idx[i] as number) > (idx[i - 1] as number));
  });
  it('decimates 1,000,000 points within the 50 ms budget @perf', () => {
    const t0 = performance.now();
    decimateLine(xs, ys, (x) => (x / n) * 1000, 1000, 'auto');
    assertBudget(performance.now() - t0, 50 * 3, 'decimate 1,000,000 points', { strict: true });
  });
  it('LTTB keeps the threshold and the end points', () => {
    const idx = lttb(xs, ys, 500);
    assert.equal(idx.length, 500);
    assert.equal(idx[0], 0);
    assert.equal(idx[499], n - 1);
  });
  it('skips small series, bins scatter points and aggregates OHLC', () => {
    assert.equal(decimateLine([0, 1, 2], [0, 1, 2], (x) => x, 100), null);
    assert.equal(binPoints([0, 0.2, 5], [0, 0.3, 5], 1).length, 2);
    const o = aggregateOhlc([0, 1, 2, 3], [1, 2, 3, 4], [5, 6, 7, 8], [0, 1, 2, 3], [2, 3, 4, 5], (x) => x, 2);
    assert.deepEqual([...o.open], [1, 3]);
    assert.deepEqual([...o.high], [6, 8]);
    assert.deepEqual([...o.low], [0, 2]);
    assert.deepEqual([...o.close], [3, 5]);
    assert.deepEqual(visibleRange([0, 1, 2, 3, 4, 5], 2, 3), [1, 4]);
  });
});

describe('viz:hitTest', () => {
  it('finds nearest sorted x, grid neighbors, polygons, arcs and rects', () => {
    assert.equal(nearestSorted([0, 10, 20], 14), 1);
    assert.equal(nearestSorted([0, 10, 20], 16), 2);
    const idx = createPointIndex([0, 50, 100], [0, 50, 100], 24);
    assert.equal(idx.nearest(48, 53, 10), 1);
    assert.equal(idx.nearest(75, 75, 5), -1);
    assert.deepEqual(idx.inRect(40, 40, 120, 120), [1, 2]);
    assert.equal(pointInPolygon(5, 5, [0, 0, 10, 0, 10, 10, 0, 10]), true);
    assert.equal(pointInPolygon(15, 5, [0, 0, 10, 0, 10, 10, 0, 10]), false);
    assert.equal(arcAt([{ cx: 0, cy: 0, inner: 0, outer: 10, start: 0, end: Math.PI / 2 }], 5, -1), 0);
    assert.equal(arcAt([{ cx: 0, cy: 0, inner: 0, outer: 10, start: 0, end: Math.PI / 2 }], -5, -1), -1);
    assert.equal(rectAt([{ x: 0, y: 0, width: 10, height: -10 }], 5, -5), 0);
  });
});

describe('viz:labels and layout', () => {
  it('hides, rotates or staggers overlapping axis labels', () => {
    const labels = Array.from({ length: 20 }, (_, i) => `Category ${i}`);
    const positions = labels.map((_, i) => i * 20);
    const hide = planHorizontalLabels(labels, positions, 'hide');
    assert.ok(hide.hidden.some(Boolean));
    assert.equal(hide.hidden[0], false);
    const rot = planHorizontalLabels(labels, positions, 'rotate45');
    assert.equal(rot.angle, -45);
    assert.ok(rot.thickness > 14);
    const st = planHorizontalLabels(labels, positions, 'stagger');
    assert.deepEqual(st.rows.slice(0, 3), [0, 1, 0]);
    const fit = planHorizontalLabels(['a', 'b'], [0, 100], 'auto');
    assert.deepEqual(fit.hidden, [false, false]);
  });
  it('hides or shifts colliding data labels', () => {
    const boxes = [
      { x: 10, y: 10, width: 20, height: 10 },
      { x: 12, y: 11, width: 20, height: 10 },
    ];
    assert.deepEqual(resolveLabelOverlaps(boxes.map((b) => ({ ...b })), 'hide'), [true, false]);
    assert.deepEqual(resolveLabelOverlaps(boxes.map((b) => ({ ...b })), 'shiftY'), [true, true]);
  });
  it('lays out title, legend, axes and plot deterministically', () => {
    const spec = {
      width: 600,
      height: 300,
      title: 'Revenue',
      legend: { position: 'bottom' as const, items: [{ label: 'North' }, { label: 'South' }] },
      axes: [
        { id: 'x', side: 'bottom' as const, labelThickness: 15 },
        { id: 'y', side: 'left' as const, labelThickness: 30 },
      ],
    };
    const a = layoutFrame(spec);
    const b = layoutFrame(spec);
    assert.deepEqual(JSON.stringify(a.legend), JSON.stringify(b.legend));
    assert.ok(a.title && a.title.text === 'Revenue');
    // The Gauge's title block (no frame) sits where the frame draws it.
    const both = layoutFrame({ ...spec, subtitle: 'By region' });
    const head = layoutTitles(600, 'Revenue', 'By region');
    assert.deepEqual([head.title, head.subtitle], [both.title, both.subtitle]);
    assert.equal(head.top, both.plot.y);
    assert.deepEqual(layoutTitles(600), { title: undefined, subtitle: undefined, top: 8 });
    assert.ok(a.legend && a.legend.y > a.plot.y + a.plot.height);
    const y = a.axes.get('y');
    assert.ok(y && y.line === a.plot.x);
    assert.ok(a.plot.width < 600 && a.plot.height < 300);
    const panes = splitPanes({ x: 0, y: 0, width: 100, height: 212 }, [2, 1], [1], 12);
    assert.equal(panes[0]?.[0]?.height, 133.33333333333334);
    assert.equal(panes[1]?.[0]?.y, 145.33333333333334);
  });
});

describe('viz:color', () => {
  it('keeps every palette lightness at 3:1 against the plot surface for any hue', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const spec = PALETTE_LIGHTNESS[scheme];
      const tokens = resolveTheme()[scheme];
      for (const surfaceToken of ['--salmon-surface-base', '--salmon-surface-raised'] as const) {
        const surface = parseHex(tokens[surfaceToken]);
        assert.ok(surface);
        for (let h = 0; h < 360; h += 1) {
          for (const l of [spec.odd, spec.even]) assert.ok(contrastRatio(gamutMap({ l, c: spec.chroma, h }), surface) >= 3, `${scheme} ${surfaceToken} h=${h} l=${l}`);
        }
      }
    }
  });
  it('keeps adjacent slots apart under simulated color vision deficiencies', () => {
    const seedSets = [
      resolveTheme().colors,
      { primary: '#7c3aed', success: '#059669', warning: '#f59e0b', danger: '#e11d48', info: '#0284c7' },
      { primary: '#e8590c', success: '#2f9e44', warning: '#fab005', danger: '#c92a2a', info: '#1971c2' },
      { primary: '#0ea5e9', success: '#22c55e', warning: '#eab308', danger: '#ef4444', info: '#8b5cf6' },
    ];
    for (const seeds of seedSets) {
      for (const dark of [false, true]) {
        const p = categoricalPalette(seeds, dark);
        assert.equal(p.length, 10);
        for (let i = 1; i < p.length; i++) assert.ok(cvdDistance(parseHex(p[i]) as Rgb, parseHex(p[i - 1]) as Rgb) >= MIN_CVD_DISTANCE, `${seeds.primary} ${dark} slot ${i + 1}`);
      }
    }
  });
  it('places midpoint hues between their neighbors (color-mix in oklch, shorter arc)', () => {
    assert.equal(midHue(350, 10), 0);
    assert.equal(midHue(10, 90), 50);
    assert.equal(paletteHues(resolveTheme().colors).length, 10);
  });
  it('ships the static default palette and the derived formula in viz.css', () => {
    const css = readFileSync(new URL('../styles/viz.css', import.meta.url), 'utf8');
    const colors = resolveTheme().colors;
    const light = categoricalPalette(colors, false);
    const dark = categoricalPalette(colors, true);
    for (let i = 0; i < 10; i++) assert.ok(css.includes(`--salmon-chart-${i + 1}: light-dark(${light[i]}, ${dark[i]});`), `slot ${i + 1}`);
    assert.ok(css.includes('--salmon-chart-1: light-dark(oklch(from var(--salmon-color-primary) 0.47 0.15 h)'));
    for (let i = 1; i <= 9; i++) assert.ok(css.includes(`--salmon-chart-sequential-${i}:`));
    for (let i = 1; i <= 11; i++) assert.ok(css.includes(`--salmon-chart-diverging-${i}:`));
  });
  it('references palette roles as CSS variables and checks data colors', () => {
    assert.equal(paletteColor(0), 'var(--salmon-chart-1)');
    assert.equal(paletteColor(10), 'var(--salmon-chart-1)');
    assert.equal(divergingColor(0), 'var(--salmon-chart-diverging-6)');
    assert.equal(dataColorContrastOk('#ffff00', '#ffffff'), false);
    assert.equal(dataColorContrastOk('#1d4ed8', '#ffffff'), true);
    assert.equal(colorScale([{ value: 0, color: '#000000' }, { value: 10, color: '#ffffff' }], 5), '#808080');
  });
});

describe('viz:summary', () => {
  it('describes series and caps the table', () => {
    const stats = seriesStats([3, 5, Number.NaN, 9]);
    assert.equal(stats.count, 3);
    assert.equal(stats.max, 9);
    const text = describeChart({ kind: 'Line chart', series: [{ name: 'Sales', stats }], x: { label: 'x', from: 'Jan', to: 'Dec' } });
    assert.equal(text, 'Line chart, 1 series, x from Jan to Dec. Sales: 3 points, minimum 3, maximum 9, trending up.');
    const t = tableModel('Sales', ['x', 'y'], 1000, (r, c) => String(r * 10 + c), 10);
    assert.equal(t.rows.length, 10);
    assert.equal(t.omitted, 990);
  });
});

describe('viz:layout paged legend rows', () => {
  it('a paged row legend leaves room for its pager inside the frame', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ label: `City number ${i}` }));
    const f = frameOf({ width: 360, height: 300, legend: { position: 'bottom', overflow: 'page', items } });
    const l = f.legend!;
    assert.ok(l.pages > 1);
    // The pager is drawn after the legend box: both fit the drawing.
    assert.ok(l.x + l.width + 4 + LEGEND_PAGER_WIDTH - 4 <= 360, `${l.x + l.width} + pager fits 360`);
  });
});
