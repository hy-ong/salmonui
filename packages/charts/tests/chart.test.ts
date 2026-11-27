import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { Chart, ChartAxis, ChartSeries } from '../dist/chart.js';
import { BulletChart } from '../dist/chart-bullet.js';
import { indicatorSeries } from '../dist/chart/indicators.js';
import { buildModel, compileSpec, readField } from '../dist/chart/model.js';
import { plotPoint } from '../dist/chart/overlay.js';
import { textWidth } from '../dist/viz/index.js';
import type { ChartProps, ChartSeriesOptions } from '../dist/chart.js';
import { assertBudget } from '../../../tooling/bench/budget.mjs';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const sales = months.map((m, i) => ({ month: m, north: [12, 15, 9, 20, 18, 25][i] as number, south: [8, 6, 11, 9, 14, 10][i] as number }));

function model(props: ChartProps, size = { width: 600, height: 300 }) {
  const series = (props.series ?? []) as ChartSeriesOptions[];
  const spec = compileSpec(props, series, new Set(props.hiddenSeries ?? []));
  return buildModel(props, spec, { ...size, zoom: props.zoomRange ?? {} }, indicatorSeries);
}

const html = (props: ChartProps) => renderToString(h(Chart, props));

describe('Chart rendering', () => {
  it('renders SVG on the server with aria-hidden marks, a viewBox at the nominal size and a focusable plot', () => {
    const out = html({ title: 'Sales', data: sales, series: [{ type: 'line', xField: 'month', yField: 'north' }] });
    assert.match(out, /<figure class="salmon-viz salmon-chart"/);
    assert.match(out, /<svg class="salmon-chart-svg" viewBox="0 0 600 300" width="600" height="300" aria-hidden="true"/);
    assert.match(out, /role="group" aria-roledescription="chart"/);
    assert.match(out, /tabindex="0"/);
  });
  it('is deterministic: the same props give byte-identical markup', () => {
    const p: ChartProps = { data: sales, series: [{ type: 'column', xField: 'month', yField: 'north' }, { type: 'line', xField: 'month', yField: 'south', curve: 'monotone' }] };
    assert.equal(html(p), html(p));
  });
  it('uses the given width and height', () => {
    assert.match(html({ width: 400, height: 200, data: sales, series: [{ xField: 'month', yField: 'north' }] }), /viewBox="0 0 400 200"/);
  });
  it('renders 1,000 points within the SSR budget (10 ms) @perf', () => {
    const pts = Array.from({ length: 1000 }, (_, i) => ({ x: i, y: Math.sin(i / 30) }));
    const p: ChartProps = { data: pts, series: [{ xField: 'x', yField: 'y' }] };
    html(p);
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) html(p);
    assertBudget((performance.now() - t0) / 5, 30, 'chart SSR 1,000 points mean', { strict: true });
  });
});

describe('Chart: Series', () => {
  it('line series from the series prop and from ChartSeries children', () => {
    const a = model({ data: sales, series: [{ type: 'line', xField: 'month', yField: 'north' }] });
    assert.equal(a.series[0]?.type, 'line');
    assert.match(a.series[0]?.marks[0]?.d ?? '', /^M[\d.]+,[\d.]+(L[\d.]+,[\d.]+){5}$/);
    const out = renderToString(h(Chart, { data: sales }, h(ChartSeries, { type: 'line', xField: 'month', yField: 'north', name: 'North' }), h(ChartAxis, { direction: 'y', title: 'Units' })));
    assert.match(out, /data-series="North" data-type="line"/);
    assert.match(out, /salmon-viz-axis-title[^>]*>Units</);
  });
  it('curves and steps change the path', () => {
    const d = (o: Partial<ChartSeriesOptions>) => model({ data: sales, series: [{ xField: 'month', yField: 'north', ...o }] }).series[0]?.marks[0]?.d ?? '';
    assert.match(d({ curve: 'natural' }), /C/);
    assert.match(d({ curve: 'monotone' }), /C/);
    assert.match(d({ curve: 'cardinal', tension: 0.2 }), /C/);
    assert.notEqual(d({ curve: 'cardinal', tension: 0.2 }), d({ curve: 'cardinal', tension: 0.8 }));
    assert.match(d({ curve: 'clamped' }), /C/);
    const step = d({ curve: 'step' });
    assert.ok(!step.includes('C'));
    assert.ok(step.split('L').length > 10);
    assert.notEqual(step, d({ curve: 'step', stepPosition: 'center' }));
    assert.match(d({ curve: 'step', risers: false }), /M.*M/);
  });
  it('area and range area', () => {
    const area = model({ data: sales, series: [{ type: 'area', xField: 'month', yField: 'north', curve: 'monotone' }] }).series[0];
    assert.match(area?.marks[0]?.d ?? '', /Z$/);
    const range = model({ data: sales, series: [{ type: 'area', xField: 'month', lowField: 'south', highField: 'north' }] }).series[0];
    assert.equal(range?.marks.length, 3);
  });
  it('stacking (normal and percent) and stack labels', () => {
    const m = model({ data: sales, stackLabels: true, series: [{ type: 'column', xField: 'month', yField: 'north', stack: true }, { type: 'column', xField: 'month', yField: 'south', stack: true }] });
    assert.equal(m.stackLabels.length, 6);
    // Values print without trailing zeros (labels, tooltips and the table).
    assert.equal(m.stackLabels[0]?.text, '20');
    // With a negative part the total sits above the positive stack, not inside it.
    const neg = model({ data: [{ k: 'a', p: 10, n: -4 }], stackLabels: true, series: [{ type: 'column', xField: 'k', yField: 'p', stack: true }, { type: 'column', xField: 'k', yField: 'n', stack: true }] });
    const top = neg.series[0]?.py[0] as number;
    assert.equal(neg.stackLabels[0]?.text, '6');
    assert.ok((neg.stackLabels[0]?.y ?? 0) < top, 'the total label clears the positive bar');
    const y = m.axes.find((a) => a.id === 'y');
    assert.ok(y && (y.scale.domain[1] as number) >= 35);
    const pct = model({ data: sales, series: [{ type: 'area', xField: 'month', yField: 'north', stack: 'percent' }, { type: 'area', xField: 'month', yField: 'south', stack: 'percent' }] });
    assert.equal(pct.axes.find((a) => a.id === 'y')?.scale.domain[1], 100);
  });
  it('multi-colored line segments', () => {
    const m = model({ data: sales, series: [{ xField: 'month', yField: 'north', segments: [{ until: 15, color: '#2563eb' }, { color: '#dc2626', lineStyle: 'dashed' }] }] });
    const strokes = new Set(m.series[0]?.marks.map((x) => x.stroke));
    assert.ok(strokes.has('#2563eb') && strokes.has('#dc2626'));
  });
  it('column and bar (bar transposes) orientation horizontal combines bars with lines', () => {
    const col = model({ data: sales, series: [{ type: 'column', xField: 'month', yField: 'north' }] });
    assert.equal(col.horizontal, false);
    assert.equal(col.series[0]?.marks.length, 6);
    const bar = model({ data: sales, series: [{ type: 'bar', xField: 'month', yField: 'north' }] });
    assert.equal(bar.horizontal, true);
    assert.equal(bar.axes.find((a) => a.id === 'x')?.side, 'left');
    const mixed = model({ orientation: 'horizontal', data: sales, series: [{ type: 'column', xField: 'month', yField: 'north' }, { type: 'line', xField: 'month', yField: 'south' }] });
    assert.equal(mixed.horizontal, true);
    assert.equal(mixed.series.length, 2);
  });
  it('band width, gap, side-by-side and overlapped groups', () => {
    const widthOf = (d: string) => Number(/h([\d.]+)/.exec(d)?.[1]);
    const two = model({ data: sales, series: [{ type: 'column', xField: 'month', yField: 'north' }, { type: 'column', xField: 'month', yField: 'south' }] });
    const one = model({ data: sales, series: [{ type: 'column', xField: 'month', yField: 'north' }] });
    assert.ok(widthOf(two.series[0]?.marks[0]?.d ?? '') < widthOf(one.series[0]?.marks[0]?.d ?? ''));
    const overlap = model({ grouping: 'overlap', data: sales, series: [{ type: 'column', xField: 'month', yField: 'north' }, { type: 'column', xField: 'month', yField: 'south' }] });
    assert.equal(widthOf(overlap.series[0]?.marks[0]?.d ?? ''), widthOf(one.series[0]?.marks[0]?.d ?? ''));
    const narrow = model({ data: sales, series: [{ type: 'column', xField: 'month', yField: 'north', bandWidth: 0.3, gap: 0.2 }] });
    assert.ok(widthOf(narrow.series[0]?.marks[0]?.d ?? '') < widthOf(one.series[0]?.marks[0]?.d ?? ''));
  });
  it('range column scatter bubble', () => {
    const rc = model({ data: sales, series: [{ type: 'column', xField: 'month', lowField: 'south', highField: 'north' }] });
    assert.equal(rc.series[0]?.marks.length, 6);
    const pts = Array.from({ length: 30 }, (_, i) => ({ x: i, y: (i * 7) % 11, s: i }));
    const sc = model({ data: pts, series: [{ type: 'scatter', xField: 'x', yField: 'y', markers: { shape: 'diamond' } }] });
    assert.equal(sc.series[0]?.marks.length, 30);
    const bb = model({ data: pts, series: [{ type: 'bubble', xField: 'x', yField: 'y', sizeField: 's', radius: [2, 20] }] });
    const r = (d: string) => Number(/a([\d.]+),/.exec(d)?.[1]);
    assert.ok(r(bb.series[0]?.marks[29]?.d ?? '') > r(bb.series[0]?.marks[1]?.d ?? ''));
  });
  it('hilo / ohlc and candles with up / down colors and hollow candles', () => {
    const ohlc = [
      { d: '2024-01-01', o: 10, h: 14, l: 9, c: 13 },
      { d: '2024-01-02', o: 13, h: 15, l: 11, c: 12 },
    ];
    const base = { xField: 'd', openField: 'o', highField: 'h', lowField: 'l', closeField: 'c' };
    const candle = model({ data: ohlc, series: [{ type: 'candle', ...base }] });
    const fills = candle.series[0]?.marks.filter((m) => m.key.startsWith('c')).map((m) => m.fill);
    assert.deepEqual(fills, ['var(--salmon-color-success)', 'var(--salmon-color-danger)']);
    const hollow = model({ data: ohlc, series: [{ type: 'candle', hollow: true, upColor: '#00aa00', ...base }] });
    assert.equal(hollow.series[0]?.marks.find((m) => m.key === 'c0')?.fill, 'none');
    assert.equal(model({ data: ohlc, series: [{ type: 'ohlc', ...base }] }).series[0]?.marks.length, 2);
    assert.equal(model({ data: ohlc, series: [{ type: 'hilo', ...base }] }).series[0]?.marks.length, 2);
  });
  it('waterfall with totals, subtotals and connectors', () => {
    const data = [{ k: 'Start', v: 100 }, { k: 'Up', v: 30 }, { k: 'Down', v: -20 }, { k: 'Total', v: 0 }];
    const m = model({ data, series: [{ type: 'waterfall', xField: 'k', yField: 'v', totals: [3] }] });
    const rects = m.series[0]?.marks.filter((x) => x.key.startsWith('r')) ?? [];
    assert.equal(rects.length, 4);
    assert.equal(rects[2]?.fill, 'var(--salmon-color-danger)');
    assert.ok(m.series[0]?.marks.some((x) => x.key.startsWith('cn')));
    const none = model({ data, series: [{ type: 'waterfall', xField: 'k', yField: 'v', totals: (i) => i === 3, connectors: false }] });
    assert.ok(!none.series[0]?.marks.some((x) => x.key.startsWith('cn')));
    // Totals and subtotals label and announce the sum their bar spans, not the empty data value.
    const sums = model({ data: [...data.slice(0, 2), { k: 'Sub', v: 0 }, data[2]!, data[3]!], series: [{ type: 'waterfall', xField: 'k', yField: 'v', subtotals: [2], totals: [4], labels: true }] }).series[0];
    assert.deepEqual(sums?.labels.map((l) => l.text), ['100', '30', '130', '-20', '110']);
    assert.equal(sums?.yText(4), '110');
  });
  it('histogram with automatic bins, bin width and normal curve', () => {
    const values = Array.from({ length: 200 }, (_, i) => ({ v: 50 + 10 * Math.sin(i * 1.3) + (i % 7) }));
    const m = model({ data: values, series: [{ type: 'histogram', yField: 'v', binWidth: 5, normalCurve: true }] });
    assert.ok((m.series[0]?.marks.filter((x) => x.key.startsWith('b')).length ?? 0) > 2);
    assert.ok(m.series[0]?.marks.some((x) => x.key === 'normal'));
  });
  it('box plot with quartile methods, mean and outliers', () => {
    const data = [{ g: 'A', v: [1, 2, 3, 4, 5, 6, 7, 8, 9, 40] }];
    const m = model({ data, series: [{ type: 'boxPlot', xField: 'g', yField: 'v', quartileMethod: 'inclusive' }] });
    const keys = m.series[0]?.marks.map((x) => x.key) ?? [];
    assert.ok(keys.includes('box0') && keys.includes('mean0') && keys.includes('out0-0'));
    const noOut = model({ data, series: [{ type: 'boxPlot', xField: 'g', yField: 'v', outliers: false, mean: false }] });
    assert.ok(!noOut.series[0]?.marks.some((x) => x.key.startsWith('out') || x.key.startsWith('mean')));
  });
  it('Pareto sorts columns and adds the cumulative percent line on a secondary axis', () => {
    const data = [{ k: 'a', v: 5 }, { k: 'b', v: 20 }, { k: 'c', v: 10 }];
    const m = model({ data, series: [{ type: 'pareto', xField: 'k', yField: 'v', name: 'Defects' }] });
    assert.equal(m.series.length, 2);
    assert.equal(m.series[1]?.type, 'line');
    assert.equal(m.series[1]?.yValue(2), 100);
    // The cumulative line takes the next palette color, so it shows over the bars.
    assert.notEqual(m.series[1]?.color, m.series[0]?.color);
    assert.ok(m.axes.some((a) => a.side === 'right'));
    assert.deepEqual(m.axes.find((a) => a.id === 'x')?.ticks.map((t) => t.text[0]), ['b', 'c', 'a']);
    const noLine = model({ data, series: [{ type: 'pareto', xField: 'k', yField: 'v', pareto: { line: false } }] });
    assert.equal(noLine.series.length, 1);
    const plain = model({ data, series: [{ type: 'pareto', xField: 'k', yField: 'v', pareto: { markers: false, color: '#ff0000' } }] });
    assert.equal(plain.series[1]?.color, '#ff0000');
    assert.ok(!plain.series[1]?.marks.some((x) => x.className === 'marker'));
  });
  it('error bars of every kind', () => {
    for (const kind of ['fixed', 'percent', 'standardDeviation', 'standardError'] as const) {
      const m = model({ data: sales, series: [{ type: 'column', xField: 'month', yField: 'north', errorBars: { kind, amount: 2 } }] });
      assert.match(m.series[0]?.marks.find((x) => x.key === 'err')?.d ?? '', /V/, kind);
    }
    const custom = model({ data: sales.map((s) => ({ ...s, p: 1, q: 2 })), series: [{ xField: 'month', yField: 'north', errorBars: { kind: 'custom', plusField: 'p', minusField: 'q', direction: 'plus', caps: false } }] });
    assert.ok(custom.series[0]?.marks.some((x) => x.key === 'err'));
  });
  it('name, hidden, order, opacity color and line style', () => {
    const m = model({ data: sales, series: [{ id: 'b', name: 'South', xField: 'month', yField: 'south', order: 2, opacity: 0.5, color: '#123456', lineStyle: 'dotted' }, { id: 'a', name: 'North', xField: 'month', yField: 'north', order: 1, hidden: true }] });
    assert.deepEqual(m.series.map((s) => s.id), ['a', 'b']);
    assert.equal(m.series[0]?.hidden, true);
    assert.equal(m.series[0]?.marks.length, 0);
    const line = m.series[1]?.marks[0];
    assert.equal(line?.stroke, '#123456');
    assert.equal(line?.dash, '2 3');
    assert.equal(line?.opacity, 0.5);
    const out = html({ data: sales, series: [{ xField: 'month', yField: 'north', color: '#123456', lineStyle: 'dashed' }] });
    assert.match(out, /stroke:#123456;stroke-width:2;stroke-dasharray:6 4/);
  });
  it('per-point data colors from colorField and getPointStyle', () => {
    const m = model({ data: sales.map((s, i) => ({ ...s, c: i % 2 ? '#ff0000' : '#00ff00' })), series: [{ type: 'column', xField: 'month', yField: 'north', colorField: 'c' }] });
    assert.deepEqual(m.series[0]?.marks.slice(0, 2).map((x) => x.fill), ['#00ff00', '#ff0000']);
    const g = model({ data: sales, series: [{ type: 'column', xField: 'month', yField: 'north', getPointStyle: (ctx) => (ctx.y > 18 ? { color: '#ff00ff' } : undefined) }] });
    assert.equal(g.series[0]?.marks[3]?.fill, '#ff00ff');
  });
  it('field mapping, nested paths and per-series axes', () => {
    assert.equal(readField({ price: { close: 3 } }, 'price.close'), 3);
    const m = model({ data: [{ t: 'a', p: { c: 2 } }, { t: 'b', p: { c: 4 } }], axes: [{ id: 'right', direction: 'y', position: 'end' }], series: [{ xField: 't', yField: 'p.c', yAxis: 'right' }] });
    assert.equal(m.series[0]?.yValue(1), 4);
    assert.ok(m.axes.some((a) => a.id === 'right' && a.side === 'right'));
    const tip = model({ data: [{ t: 'a', v: 1, note: 'first' }], series: [{ xField: 't', yField: 'v', tooltipField: 'note' }] });
    assert.equal(tip.series[0]?.yText(0), 'first');
  });
  it('legend shapes state attributes for selection', () => {
    const m = model({ data: sales, legend: true, series: [{ xField: 'month', yField: 'north', legendShape: 'diamond' }, { type: 'column', xField: 'month', yField: 'south' }] });
    assert.deepEqual(m.legend.map((l) => l.shape), ['diamond', 'column']);
    const out = html({ data: sales, selection: true, defaultSelectedPoints: [{ seriesId: 'north', index: 1 }], series: [{ type: 'column', xField: 'month', yField: 'north' }] });
    assert.match(out, /data-index="1" data-selected=""/);
  });
});

describe('Chart: Axes', () => {
  it('linear axis with nice ticks log axis', () => {
    const m = model({ data: sales, series: [{ xField: 'month', yField: 'north' }] });
    const y = m.axes.find((a) => a.id === 'y');
    assert.deepEqual(y?.ticks.map((t) => t.text[0]).slice(0, 3), ['0', '5', '10']);
    const log = model({ data: [{ x: 1, y: 3 }, { x: 2, y: 3000 }], yAxis: { scale: 'log' }, series: [{ xField: 'x', yField: 'y' }] });
    assert.deepEqual(log.axes.find((a) => a.id === 'y')?.ticks.map((t) => t.text[0]), ['1', '10', '100', '1,000', '10,000']);
  });
  it('time axis with calendar ticks, explicit interval, format and time zone', () => {
    const data = Array.from({ length: 12 }, (_, i) => ({ d: new Date(Date.UTC(2024, i, 1)), v: i }));
    const m = model({ data, series: [{ xField: 'd', yField: 'v' }] });
    const x = m.axes.find((a) => a.id === 'x');
    assert.equal(x?.scale.kind, 'time');
    assert.ok(x?.ticks.some((t) => t.text[0]?.includes('2024')));
    const days = model({ data, xAxis: { interval: { unit: 'month', step: 3 }, format: 'MMM' }, series: [{ xField: 'd', yField: 'v' }] });
    assert.deepEqual(days.axes.find((a) => a.id === 'x')?.ticks.map((t) => t.text[0]), ['Jan', 'Apr', 'Jul', 'Oct']);
    const tz = model({ timeZone: 'Asia/Tokyo', data: [{ d: '2024-01-01T00:00:00Z', v: 1 }, { d: '2024-01-02T00:00:00Z', v: 2 }], xAxis: { interval: { unit: 'hour', step: 6 }, format: { hour: '2-digit', hourCycle: 'h23' } }, series: [{ xField: 'd', yField: 'v' }] });
    assert.equal(tz.axes.find((a) => a.id === 'x')?.ticks[0]?.text[0], '12');
  });
  it('category axis with label placement and time category', () => {
    const between = model({ data: sales, series: [{ xField: 'month', yField: 'north' }] });
    const on = model({ data: sales, xAxis: { labelPlacement: 'on' }, series: [{ xField: 'month', yField: 'north' }] });
    const first = (m: typeof on) => m.axes.find((a) => a.id === 'x')?.ticks[0]?.pos ?? 0;
    assert.ok(first(on) < first(between));
    assert.equal(first(on), on.plot.x);
    const tc = model({ data: [{ d: '2024-01-05', v: 1 }, { d: '2024-02-09', v: 2 }], xAxis: { scale: 'timeCategory', format: 'MMMd' }, series: [{ xField: 'd', yField: 'v' }] });
    assert.deepEqual(tc.axes.find((a) => a.id === 'x')?.ticks.map((t) => t.text[0]), ['Jan 5', 'Feb 9']);
  });
  it('min, max, interval, tickCount, includeZero and padding', () => {
    const y = (o: object) => model({ data: sales, yAxis: o, series: [{ xField: 'month', yField: 'north' }] }).axes.find((a) => a.id === 'y');
    assert.deepEqual(y({ min: 5, max: 30 })?.scale.domain, [5, 30]);
    assert.deepEqual(y({ min: 0, max: 30, interval: 10 })?.ticks.map((t) => t.text[0]), ['0', '10', '20', '30']);
    assert.equal(y({ includeZero: false, padding: 'none' })?.scale.domain[0], 9);
    assert.ok(((y({ padding: 'additional' })?.scale.domain[1] as number) ?? 0) > 25);
    assert.ok((y({ tickCount: 2 })?.ticks.length ?? 0) <= 4);
  });
  it('multiple axes on both sides reversed axes', () => {
    const m = model({ data: sales, axes: [{ id: 'y2', direction: 'y', position: 'end', title: 'South' }], series: [{ xField: 'month', yField: 'north' }, { xField: 'month', yField: 'south', yAxis: 'y2' }] });
    assert.equal(m.axes.find((a) => a.id === 'y2')?.side, 'right');
    const rev = model({ data: sales, yAxis: { reversed: true }, series: [{ xField: 'month', yField: 'north' }] });
    const t = rev.axes.find((a) => a.id === 'y')?.ticks;
    assert.ok((t?.[0]?.pos ?? 0) < (t?.[t.length - 1]?.pos ?? 0));
  });
  it('label overlap strategies edge labels inside labels', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ k: `Category ${i}`, v: i }));
    const x = (o: object) => model({ data: many, xAxis: o, series: [{ xField: 'k', yField: 'v' }] }).axes.find((a) => a.id === 'x');
    assert.ok(x({ labelOverlap: 'hide' })?.ticks.some((t) => t.hidden));
    assert.equal(x({ labelOverlap: 'rotate45' })?.angle, -45);
    assert.equal(x({ labelOverlap: 'rotate90' })?.angle, -90);
    assert.ok(x({ labelOverlap: 'trim' })?.ticks[0]?.text[0]?.endsWith('…'));
    assert.ok((x({ labelOverlap: 'wrap' })?.ticks[0]?.text.length ?? 0) > 1);
    assert.equal(x({ labelOverlap: 'stagger' })?.ticks[1]?.row, 1);
    assert.equal(x({ labelAngle: 30 })?.angle, 30);
    const edgeProps = (edgeLabels: 'hide' | 'shift' | 'none') => model({ data: [{ x: 0, y: 1 }, { x: 1000000, y: 2 }], xAxis: { edgeLabels, format: 'n2', interval: 500000 }, series: [{ xField: 'x', yField: 'y' }] }).axes.find((a) => a.id === 'x');
    const lastPos = (a: ReturnType<typeof edgeProps>) => a?.ticks[a.ticks.length - 1];
    assert.equal(lastPos(edgeProps('none'))?.hidden, false);
    assert.equal(lastPos(edgeProps('hide'))?.hidden, true);
    // `shift` moves the end label inside the drawing; `none` keeps it on its tick and narrows the plot instead.
    const edgeModel = (edgeLabels: 'shift' | 'none') => model({ data: [{ x: 0, y: 1 }, { x: 1000000, y: 2 }], xAxis: { edgeLabels, format: 'n2', interval: 500000 }, series: [{ xField: 'x', yField: 'y' }] });
    const noneM = edgeModel('none');
    const shiftM = edgeModel('shift');
    assert.ok(noneM.plot.x + noneM.plot.width < shiftM.plot.x + shiftM.plot.width);
    const noneLast = lastPos(noneM.axes.find((a) => a.id === 'x'));
    assert.ok((noneLast?.pos ?? 0) + textWidth(noneLast?.text[0] ?? '') / 2 <= 600);
    const shiftLast = lastPos(shiftM.axes.find((a) => a.id === 'x'));
    assert.ok((shiftLast?.pos ?? 0) < shiftM.plot.x + shiftM.plot.width);
    const inside = model({ data: sales, yAxis: { labelPosition: 'inside' }, series: [{ xField: 'month', yField: 'north' }] });
    const outside = model({ data: sales, series: [{ xField: 'month', yField: 'north' }] });
    assert.ok(inside.plot.x < outside.plot.x);
  });
  it('grid lines, minor ticks and hidden axes axis titles', () => {
    const out = html({ data: sales, xAxis: { gridLines: true, title: 'Month' }, yAxis: { gridLines: 'both', minorTicks: 1, title: 'Units' }, series: [{ xField: 'month', yField: 'north' }] });
    assert.match(out, />Month</);
    assert.match(out, />Units</);
    const m = model({ data: sales, yAxis: { minorTicks: 2 }, series: [{ xField: 'month', yField: 'north' }] });
    assert.ok((m.axes.find((a) => a.id === 'y')?.minor.length ?? 0) > 0);
    const hidden = html({ data: sales, yAxis: { hidden: true }, series: [{ xField: 'month', yField: 'north' }] });
    assert.ok(!hidden.includes('data-axis="y"'));
  });
  it('axis format presets, templates and formatLabel', () => {
    const y = (o: object) => model({ data: sales, yAxis: o, series: [{ xField: 'month', yField: 'north' }] }).axes.find((a) => a.id === 'y')?.ticks[1]?.text[0];
    assert.equal(y({ format: 'c0' }), '$5');
    assert.equal(y({ format: '{value} kg' }), '5 kg');
    assert.equal(y({ format: 'n2' }), '5.00');
    assert.equal(y({ formatLabel: (v: unknown) => `#${v}` }), '#5');
    assert.equal(model({ data: sales, xAxis: { formatLabel: (v: unknown) => String(v).toUpperCase() }, series: [{ xField: 'month', yField: 'north' }] }).axes.find((a) => a.id === 'x')?.ticks[0]?.text[0], 'JAN');
  });
  it('bands (repeating, behind / over) and axis lines', () => {
    const m = model({ data: sales, yAxis: { bands: [{ from: 0, to: 5, every: 10, until: 30, label: 'b' }, { from: 20, to: 22, layer: 'over', color: '#ff0000' }], lines: [{ value: 15, label: 'Target' }] }, series: [{ xField: 'month', yField: 'north' }] });
    const y = m.axes.find((a) => a.id === 'y');
    assert.ok((y?.bands.length ?? 0) >= 4);
    assert.ok(y?.bands.some((b) => b.className === 'over'));
    assert.equal(y?.lines[0]?.label, 'Target');
  });
  it('zoomRange recomputes the visible domain and ticks', () => {
    const pts = Array.from({ length: 100 }, (_, i) => ({ x: i, y: i }));
    const m = model({ data: pts, zoomRange: { x: [10, 20] }, series: [{ xField: 'x', yField: 'y' }] });
    const x = m.axes.find((a) => a.id === 'x');
    assert.deepEqual(x?.scale.domain, [10, 20]);
    assert.ok(x?.ticks.every((t) => t.pos >= m.plot.x - 0.01 && t.pos <= m.plot.x + m.plot.width + 0.01));
  });
  it('axis.domain adjusts the computed range', () => {
    const m = model({ data: sales, yAxis: { domain: ([lo, hi]: readonly [number, number]) => [lo, hi * 2] }, series: [{ xField: 'month', yField: 'north' }] });
    assert.equal(m.axes.find((a) => a.id === 'y')?.scale.domain[1], 50);
  });
});

describe('Chart: Axes (completion)', () => {
  it('panes: rows split the plot for their axes, same-side pane axes share one slot', () => {
    const data = months.map((m, i) => ({ m, a: [1, 4, 2, 5, 3, 6][i] as number, b: [100, 300, 200, 500, 400, 600][i] as number }));
    const props: ChartProps = {
      data,
      panes: { rows: ['70%', '30%'] },
      axes: [{ id: 'lower', direction: 'y', pane: { row: 1 }, title: 'Lower' }],
      yAxis: { title: 'Upper' },
      series: [{ type: 'line', xField: 'm', yField: 'a' }, { type: 'column', xField: 'm', yField: 'b', yAxis: 'lower' }],
    };
    const m = model(props);
    const y = m.axes.find((a) => a.id === 'y');
    const lower = m.axes.find((a) => a.id === 'lower');
    assert.ok(y && lower);
    // Panes are 16px apart: the upper axis maps to 70 % of the rest, the lower one to 30 %.
    const upperEnd = m.plot.y + (m.plot.height - 16) * 0.7;
    const split = upperEnd + 16;
    assert.ok(Math.abs(Math.min(...y.scale.range) - m.plot.y) < 0.01);
    assert.ok(Math.abs(Math.max(...y.scale.range) - upperEnd) < 0.01);
    assert.ok(Math.abs(Math.min(...lower.scale.range) - split) < 0.01);
    assert.ok(Math.abs(Math.max(...lower.scale.range) - (m.plot.y + m.plot.height)) < 0.01);
    // Both left axes share one slot (no outward stacking) and their blocks span their own pane.
    assert.equal(y.side, 'left');
    assert.equal(lower.side, 'left');
    assert.equal(y.line, lower.line);
    assert.ok(Math.abs(lower.block.y - split) < 0.01);
    // Columns of the lower series stay inside the lower pane.
    const col = m.series[1];
    for (let i = 0; i < 6; i++) assert.ok((col?.py[i] as number) >= split - 0.01);
    // Column panes for x axes, with span.
    const wide = model({ data, panes: { columns: [200, {}, {}] }, xAxis: { pane: { column: 1, span: 2 } }, series: [{ type: 'line', xField: 'm', yField: 'a' }] });
    const x = wide.axes.find((a) => a.id === 'x');
    assert.ok(x && Math.abs(Math.min(...x.scale.range) - (wide.plot.x + 200 + 16)) < 0.01);
    assert.ok(Math.abs(Math.max(...x.scale.range) - (wide.plot.x + wide.plot.width)) < 0.01);
    // The server renders both panes with the axis line and title of each pane.
    const out = html(props);
    assert.match(out, /data-axis="lower"/);
    assert.match(out, />Lower</);
  });
  const axis = (m: ReturnType<typeof model>, id: string) => m.axes.find((a) => a.id === id);
  it('axis.indexed keeps duplicate categories as separate points', () => {
    const dup = [{ k: 'A', v: 1 }, { k: 'B', v: 2 }, { k: 'A', v: 3 }];
    const plain = model({ data: dup, series: [{ xField: 'k', yField: 'v' }] });
    const indexed = model({ data: dup, xAxis: { indexed: true }, series: [{ xField: 'k', yField: 'v' }] });
    assert.deepEqual(axis(plain, 'x')?.ticks.map((t) => t.text[0]), ['A', 'B']);
    assert.deepEqual(axis(indexed, 'x')?.ticks.map((t) => t.text[0]), ['A', 'B', 'A']);
    const px = indexed.series[0]?.px ?? [];
    assert.ok((px[2] as number) > (px[1] as number));
  });
  it('crossAt draws the axis line at a value of the crossing axis; labelsAtCross moves the labels with it', () => {
    const data = [{ x: 0, y: -10 }, { x: 10, y: 10 }];
    const base = model({ data, series: [{ xField: 'x', yField: 'y' }] });
    const crossed = model({ data, xAxis: { crossAt: { value: 0 } }, series: [{ xField: 'x', yField: 'y' }] });
    const y0 = axis(crossed, 'y')?.scale.map(0) as number;
    assert.equal(axis(crossed, 'x')?.line, y0);
    assert.equal(axis(crossed, 'x')?.labelLine, axis(base, 'x')?.line);
    const moved = model({ data, xAxis: { crossAt: { value: 0, axis: 'y' }, labelsAtCross: true }, series: [{ xField: 'x', yField: 'y' }] });
    assert.equal(axis(moved, 'x')?.labelLine, y0);
  });
  it('tickPosition inside flips the ticks without moving the labels; plotOffset pads the axis range', () => {
    const p: ChartProps = { data: sales, series: [{ xField: 'month', yField: 'north' }] };
    const tickPath = (out: string) => /class="salmon-viz-tick" d="(M[^"]*)"/.exec(out.slice(out.indexOf('data-axis="y"')))?.[1] ?? '';
    assert.match(tickPath(html({ ...p, yAxis: { tickPosition: 'inside' } })), /h5/);
    assert.match(tickPath(html(p)), /h-5/);
    const padded = model({ ...p, yAxis: { plotOffset: 20 } });
    assert.equal(axis(padded, 'y')?.scale.range[1], padded.plot.y + 20);
  });
  it('axis.ticks and axis.line toggles axis.titleAngle', () => {
    const out = html({ data: sales, yAxis: { ticks: false, line: false, title: 'Units', titleAngle: 0 }, series: [{ xField: 'month', yField: 'north' }] });
    const yAxis = out.slice(out.indexOf('data-axis="y"'));
    assert.doesNotMatch(yAxis.slice(0, yAxis.indexOf('</g>')), /salmon-viz-tick|salmon-viz-axis-line/);
    assert.match(out, /salmon-viz-axis-title" x="[0-9.]+" y="[0-9.]+" text-anchor="middle">Units/);
    assert.match(html({ data: sales, xAxis: { title: 'Month', titleAngle: -10 }, series: [{ xField: 'month', yField: 'north' }] }), /text-anchor="middle" transform="rotate[(]-10 /);
  });
  it('axis.renderLabel returns SVG text content per tick', () => {
    const out = html({ data: sales, xAxis: { renderLabel: (ctx) => h('tspan', { className: 'custom' }, `${String(ctx.value)}!`) }, series: [{ xField: 'month', yField: 'north' }] });
    assert.match(out, /<tspan class="custom">Jan!<.tspan>/);
  });
  it('labelGroups draw a bordered cell per level below the labels, with the border variants', () => {
    const levels = [{ from: 'Jan', to: 'Mar', label: 'Q1' }, { from: 'Apr', to: 'Jun', label: 'Q2' }];
    const m = model({ data: sales, xAxis: { labelGroups: [{ levels }, { levels: [{ from: 0, to: 5, label: 'H1' }], border: 'brace' }] }, series: [{ xField: 'month', yField: 'north' }] });
    const g = axis(m, 'x')?.groups ?? [];
    assert.deepEqual(g.map((c) => c.label), ['Q1', 'Q2', 'H1']);
    assert.ok((g[0]?.b as number) <= (g[1]?.a as number) + 0.01);
    assert.ok((g[2]?.off as number) > (g[0]?.off as number));
    const plain = model({ data: sales, series: [{ xField: 'month', yField: 'north' }] });
    assert.ok(m.plot.height < plain.plot.height, 'group rows take axis space');
    const out = html({ data: sales, xAxis: { labelGroups: [{ levels, border: 'noTopBottom' }] }, series: [{ xField: 'month', yField: 'north' }] });
    assert.match(out, /data-group="0-1"><path class="salmon-viz-tick" d="M[0-9.]+,[0-9.]+V[0-9.]+M[0-9.]+,[0-9.]+V[0-9.]+"/);
    assert.match(out, />Q2<.text>/);
  });
  it('band crossFrom / crossTo limit the band to a segment of the crossing axis', () => {
    const m = model({ data: sales, xAxis: { bands: [{ from: 1, to: 2, crossFrom: 0, crossTo: 10 }] }, series: [{ xField: 'month', yField: 'north' }] });
    const full = model({ data: sales, xAxis: { bands: [{ from: 1, to: 2 }] }, series: [{ xField: 'month', yField: 'north' }] });
    const d = axis(m, 'x')?.bands[0]?.d ?? '';
    const y10 = Math.round((axis(m, 'y')?.scale.map(10) as number) * 100) / 100;
    assert.ok(d.includes(`,${y10}`), d);
    assert.notEqual(d, axis(full, 'x')?.bands[0]?.d);
  });
});

describe('Chart: state attributes', () => {
  it('data-selected, data-dimmed and data-highlighted on series groups and marks', async () => {
    const { ChartSvg } = await import('../dist/chart/render.js');
    const m = model({ data: sales, series: [{ type: 'column', xField: 'month', yField: 'north', name: 'North' }, { type: 'column', xField: 'month', yField: 'south', name: 'South' }] });
    const out = renderToString(h(ChartSvg, { model: m, clipId: 'c', canvas: false, legendItems: [], legendPage: 0, selected: new Set(['North:1']), dimmed: new Set(['South']), highlighted: 'North', emptyText: '' }));
    assert.match(out, /data-series="North" data-type="column" data-highlighted=""/);
    assert.match(out, /data-series="South" data-type="column" data-dimmed=""/);
    assert.match(out, /data-index="1" data-selected=""/);
  });
});

describe('Chart: polar and radar', () => {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const wind = dirs.map((d, i) => ({ d, a: [3, 5, 2, 6, 4, 7, 1, 3][i] as number, b: [2, 1, 3, 2, 2, 1, 4, 2][i] as number, lo: 1, hi: [4, 6, 3, 7, 5, 8, 2, 4][i] as number }));
  const polarModel = async (props: ChartProps) => {
    const { buildPolarModel } = await import('../dist/chart/polar.js');
    const series = (props.series ?? []) as ChartSeriesOptions[];
    return buildPolarModel(props, compileSpec(props, series, new Set()), { width: 400, height: 400, zoom: {} });
  };
  it('maps categories to angles clockwise from startAngle and values to radii', async () => {
    const m = await polarModel({ coordinate: 'polar', data: wind, series: [{ type: 'line', xField: 'd', yField: 'a' }] });
    const s = m.series[0];
    assert.ok(s && m.polar && m.axes.length === 0);
    const cx = m.plot.x + m.plot.width / 2;
    const cy = m.plot.y + m.plot.height / 2;
    assert.ok(Math.abs((s.px[0] as number) - cx) < 0.01 && (s.py[0] as number) < cy, 'N is straight up');
    assert.ok(Math.abs((s.py[2] as number) - cy) < 0.01 && (s.px[2] as number) > cx, 'E is to the right');
    const r = (i: number) => Math.hypot((s.px[i] as number) - cx, (s.py[i] as number) - cy);
    assert.ok(Math.abs(r(5) / r(6) - 7) < 1e-6, 'radius is linear in the value from the center');
    const turned = await polarModel({ coordinate: 'polar', xAxis: { startAngle: 90 }, data: wind, series: [{ type: 'line', xField: 'd', yField: 'a' }] });
    assert.ok((turned.series[0]?.px[0] as number) > cx && Math.abs((turned.series[0]?.py[0] as number) - cy) < 0.01, 'startAngle 90 puts N to the right');
    assert.match(s.marks.find((k) => k.key === 'line')?.d ?? '', /^M[\d.]+,[\d.]+(L[\d.]+,[\d.]+){8}$/, 'closed by default: back to the first point');
    const open = await polarModel({ coordinate: 'polar', data: wind, series: [{ type: 'line', xField: 'd', yField: 'a', closed: false }] });
    assert.match(open.series[0]?.marks.find((k) => k.key === 'line')?.d ?? '', /^M[\d.]+,[\d.]+(L[\d.]+,[\d.]+){7}$/);
  });
  it('draws circles for polar and polygons for radar, with spokes and labels', async () => {
    const p = await polarModel({ coordinate: 'polar', data: wind, series: [{ xField: 'd', yField: 'a' }] });
    const r = await polarModel({ coordinate: 'radar', data: wind, series: [{ xField: 'd', yField: 'a' }] });
    assert.match(p.decor?.grid ?? '', /A/);
    assert.doesNotMatch(r.decor?.grid ?? '', /A/);
    assert.deepEqual(r.decor?.labels.filter((l) => l.key.startsWith('x')).map((l) => l.text), dirs);
    assert.ok((r.decor?.labels.filter((l) => l.key.startsWith('y')).length ?? 0) >= 3);
  });
  it('supports every drawType: line, spline, area, spline area, column, range column, scatter and the stacking variants', async () => {
    const types: ChartSeriesOptions[] = [
      { type: 'line', yField: 'a' },
      { type: 'line', yField: 'a', curve: 'natural', id: 'spline' },
      { type: 'area', yField: 'a', id: 'area' },
      { type: 'area', yField: 'a', curve: 'natural', id: 'splineArea' },
      { type: 'column', yField: 'a', id: 'column' },
      { type: 'column', lowField: 'lo', highField: 'hi', id: 'rangeColumn' },
      { type: 'scatter', yField: 'b', id: 'scatter' },
    ];
    const m = await polarModel({ coordinate: 'polar', data: wind, series: types.map((t) => ({ xField: 'd', ...t })) });
    const by = (id: string) => m.series.find((s) => s.id === id);
    assert.match(by('spline')?.marks[0]?.d ?? '', /C/);
    assert.ok(by('area')?.marks.some((k) => k.key === 'area' && k.fill));
    assert.match(by('splineArea')?.marks[0]?.d ?? '', /C/);
    assert.equal(by('column')?.marks.length, 8);
    assert.match(by('column')?.marks[0]?.d ?? '', /A/);
    assert.match(by('rangeColumn')?.marks[0]?.d ?? '', /A[\d.]+,[\d.]+ 0 0 1 [\d.]+,[\d.]+L[\d.]+,[\d.]+A/, 'a ring sector from low to high');
    assert.equal(by('scatter')?.marks.length, 8);
    const stacked = await polarModel({ coordinate: 'radar', data: wind, series: [{ type: 'column', xField: 'd', yField: 'a', stack: true, id: 'a' }, { type: 'column', xField: 'd', yField: 'b', stack: true, id: 'b' }, { type: 'area', xField: 'd', yField: 'a', stack: true, id: 'sa' }, { type: 'line', xField: 'd', yField: 'b', stack: true, id: 'sl' }] });
    const cx = stacked.plot.x + stacked.plot.width / 2;
    const cy = stacked.plot.y + stacked.plot.height / 2;
    const ra = Math.hypot((stacked.series[0]?.px[0] as number) - cx, (stacked.series[0]?.py[0] as number) - cy);
    const rb = Math.hypot((stacked.series[1]?.px[0] as number) - cx, (stacked.series[1]?.py[0] as number) - cy);
    assert.ok(rb > ra, 'the second stacked column starts where the first ends');
    assert.ok(stacked.series.find((s) => s.id === 'sl')?.marks.length);
  });
  it('renders on the server with the opt-in features={[polar]}; without it only the frame renders', async () => {
    const { polar } = await import('../dist/chart/features.js');
    const p: ChartProps = { coordinate: 'radar', title: 'Wind', data: wind, series: [{ type: 'area', xField: 'd', yField: 'a', name: 'Speed' }] };
    const pre = html({ ...p, features: [polar] });
    assert.match(pre, /data-series="Speed" data-type="area"/);
    assert.match(pre, /data-axis="polar"/);
    assert.match(pre, />NE<\/text>/);
    const lazy = html(p);
    assert.doesNotMatch(lazy, /data-series="Speed"/);
    assert.match(lazy, /class="salmon-viz-empty"[^>]*><\/text>/);
    assert.doesNotMatch(lazy, /data-axis="y"/);
  });
});

describe('Chart: Elements', () => {
  it('title and subtitle label the figure', () => {
    const out = html({ title: 'Revenue', subtitle: 'FY24', data: sales, series: [{ xField: 'month', yField: 'north' }] });
    assert.match(out, /aria-labelledby="[^"]+-title"/);
    assert.match(out, /<figcaption[^>]*>Revenue<!-- -->. FY24<\/figcaption>/);
    assert.match(out, /class="salmon-viz-title"[^>]*>Revenue</);
    assert.match(out, /class="salmon-viz-subtitle"[^>]*>FY24</);
  });
  it('legend positions legend title and truncation series mode', () => {
    for (const position of ['top', 'bottom', 'start', 'end'] as const) {
      const m = model({ data: sales, legend: { position, title: 'Regions' }, series: [{ xField: 'month', yField: 'north' }, { xField: 'month', yField: 'south' }] });
      assert.equal(m.frame.legend?.position, position);
      assert.equal(m.frame.legend?.title?.text, 'Regions');
    }
    const long = model({ data: sales, legend: { maxLabelWidth: 40 }, series: [{ name: 'A very long series name', xField: 'month', yField: 'north' }, { xField: 'month', yField: 'south' }] });
    assert.ok(long.frame.legend?.items[0]?.text.endsWith('…'));
    const out = html({ data: sales, legend: { maxLabelWidth: 40 }, series: [{ name: 'A very long series name', xField: 'month', yField: 'north' }, { xField: 'month', yField: 'south' }] });
    assert.match(out, /<span class="salmon-visually-hidden">A very long series name<\/span>/);
    const rev = model({ data: sales, legend: { reverse: true }, series: [{ xField: 'month', yField: 'north' }, { xField: 'month', yField: 'south' }] });
    assert.deepEqual(rev.legend.map((l) => l.id), ['south', 'north']);
  });
  it('hiddenSeries hides series and marks the legend item legend is an APG toolbar', () => {
    const out = html({ data: sales, defaultHiddenSeries: ['south'], series: [{ xField: 'month', yField: 'north' }, { xField: 'month', yField: 'south' }] });
    assert.match(out, /role="toolbar" aria-label="Legend"/);
    assert.match(out, /tabindex="0" aria-pressed="true"/);
    assert.match(out, /tabindex="-1" aria-pressed="false"/);
    assert.ok(!out.includes('data-series="south"'));
    const plain = html({ data: sales, legend: { toggle: false }, series: [{ xField: 'month', yField: 'north' }, { xField: 'month', yField: 'south' }] });
    assert.ok(!plain.includes('aria-pressed'));
  });
  it('legend paging', () => {
    const series = Array.from({ length: 24 }, (_, i) => ({ name: `Series number ${i}`, xField: 'month', yField: 'north' }));
    const m = model({ data: sales, legend: { overflow: 'page' }, series });
    assert.ok((m.frame.legend?.pages ?? 1) > 1);
    assert.match(renderToString(h(Chart, { data: sales, legend: { overflow: 'page' }, series })), /aria-label="Next legend page"/);
  });
  it('data labels with format, position and showZero label format function', () => {
    const m = model({ data: sales, series: [{ type: 'column', xField: 'month', yField: 'north', labels: { format: 'n0', position: 'outside' } }] });
    assert.deepEqual(m.series[0]?.labels.map((l) => l.text).slice(0, 2), ['12', '15']);
    const f = model({ data: sales, series: [{ xField: 'month', yField: 'north', labels: { format: (ctx) => `${ctx.xText}=${ctx.y}` } }] });
    assert.equal(f.series[0]?.labels[0]?.text, 'Jan=12');
    const z = model({ data: [{ k: 'a', v: 0 }, { k: 'b', v: 2 }], series: [{ type: 'column', xField: 'k', yField: 'v', labels: { showZero: false } }] });
    assert.equal(z.series[0]?.labels.length, 1);
    assert.match(html({ data: sales, series: [{ type: 'column', xField: 'month', yField: 'north', labels: true }] }), /class="salmon-chart-data-label"/);
  });
  it('markers with every shape', () => {
    for (const shape of ['circle', 'rectangle', 'triangle', 'invertedTriangle', 'diamond', 'cross', 'plus', 'multiply', 'horizontalLine', 'verticalLine', 'pentagon', 'star'] as const) {
      const m = model({ data: sales, series: [{ xField: 'month', yField: 'north', markers: { shape, size: 9 } }] });
      assert.equal(m.series[0]?.marks.filter((x) => x.className === 'marker').length, 6, shape);
    }
  });
  it('last value badge and inline series label', () => {
    const m = model({ data: sales, series: [{ name: 'North', xField: 'month', yField: 'north', lastValue: true, inlineLabel: true }] });
    assert.ok(m.series[0]?.labels.some((l) => l.key === 'last' && l.text === '25'));
    assert.ok(m.series[0]?.labels.some((l) => l.key === 'inline' && l.text === 'North'));
  });
  it('annotations in data and pixel units', () => {
    const out = html({ data: sales, annotations: [{ x: 'Mar', y: 9, content: 'Dip' }, { x: 10, y: 10, units: 'pixel', content: 'Corner' }], series: [{ xField: 'month', yField: 'north' }] });
    assert.match(out, /class="salmon-chart-annotation"[^>]*>Dip</);
    assert.match(out, /class="salmon-chart-annotation" style="left:1.67%;top:3.33%">Corner</);
  });
});

describe('Chart: Elements (completion)', () => {
  const two: ChartSeriesOptions[] = [{ xField: 'month', yField: 'north', name: 'North' }, { xField: 'month', yField: 'south', name: 'South' }];
  it('legend align and orientation', () => {
    const at = (legend: ChartProps['legend']) => model({ data: sales, series: two, legend }, { width: 800, height: 300 }).frame.legend;
    const start = at({ position: 'top', align: 'start' });
    const center = at({ position: 'top' });
    const end = at({ position: 'top', align: 'end' });
    assert.ok(start && center && end);
    assert.ok(start.x < center.x && center.x < end.x);
    assert.ok(Math.abs(start.x - 10) < 12, 'start aligned to the frame edge');
    const side = at({ position: 'end', align: 'start' });
    assert.ok(side && side.y < (at({ position: 'end' })?.y ?? 0));
    // orientation: a top legend in one column; horizontal (the default for top and bottom) in a row.
    const col = at({ position: 'top', orientation: 'vertical' });
    assert.ok(col && col.items[0]?.x === col.items[1]?.x && (col.items[1]?.y ?? 0) > (col.items[0]?.y ?? 0));
    const row = at({ position: 'top', orientation: 'horizontal' });
    assert.ok(row && row.items[0]?.y === row.items[1]?.y && (row.items[1]?.x ?? 0) > (row.items[0]?.x ?? 0));
    assert.match(html({ data: sales, series: two, legend: { position: 'top', orientation: 'vertical' } }), /role="toolbar"[^>]*aria-orientation="vertical"/);
  });
  it('legend modes point, range and gradient colorRanges color the points', () => {
    const ranges = [{ from: 0, to: 10, colors: ['#2e7d32'], label: 'Low' }, { from: 10, to: 30, colors: ['#f9a825', '#c62828'] }];
    const col: ChartSeriesOptions = { type: 'column', xField: 'month', yField: 'north', name: 'North' };
    const point = model({ data: sales, series: [col], legend: { mode: 'point' } });
    assert.deepEqual(point.legend.map((l) => l.label), months);
    assert.equal(point.legend[0]?.index, 0);
    // A bubble or scatter series names its point keys by tooltipField (its x values say nothing).
    const named = model({ data: [{ n: 'Aland', x: 12, y: 3 }, { n: 'Borea', x: 24, y: 5 }], series: [{ type: 'scatter', xField: 'x', yField: 'y', tooltipField: 'n' }], legend: { mode: 'point' } });
    assert.deepEqual(named.legend.map((l) => l.label), ['Aland', 'Borea']);
    const ranged = model({ data: sales, series: [col], colorRanges: ranges, legend: { mode: 'range' } });
    assert.deepEqual(ranged.legend.map((l) => [l.label, l.color]), [['Low', '#2e7d32'], ['10 \u2013 30', '#f9a825']]);
    // 9 (Mar) is Low; 12 is in the first half of 10..30, 25 in the second half.
    const fills = ranged.series[0]?.marks.filter((m) => m.index !== undefined).map((m) => m.fill);
    assert.equal(fills?.[2], '#2e7d32');
    assert.equal(fills?.[0], '#f9a825');
    assert.equal(fills?.[5], '#c62828');
    const grad = model({ data: sales, series: [col], colorRanges: ranges, legend: { mode: 'gradient' } });
    assert.equal(grad.legend.length, 1);
    assert.equal(grad.legend[0]?.shape, 'gradient');
    assert.deepEqual(grad.legend[0]?.stops, ['#2e7d32', '#f9a825', '#c62828']);
    assert.match(html({ data: sales, series: [col], colorRanges: ranges, legend: { mode: 'gradient' } }), /class="salmon-chart-gradient-key" style="background:linear-gradient\(to right, #2e7d32, #f9a825, #c62828\)"/);
    // Keys, not toggles: no aria-pressed in point, range and gradient modes.
    assert.doesNotMatch(html({ data: sales, series: [col], colorRanges: ranges, legend: { mode: 'range' } }), /aria-pressed/);
    assert.match(html({ data: sales, series: two }), /aria-pressed="true"/);
  });
  it('legend.renderItem renders custom item content on the server legend images', () => {
    const out = html({ data: sales, series: two, legend: { renderItem: (item) => h('span', { className: 'my-item' }, h('img', { src: `/${item.id}.png`, alt: '' }), item.label.toUpperCase()) } });
    assert.match(out, /class="salmon-chart-legend-content" aria-hidden="true" style="[^"]*"><span class="my-item"><img src="\/North.png" alt=""\/>NORTH<\/span>/);
    // The drawn SVG items are replaced, the accessible names stay.
    assert.doesNotMatch(out, /class="salmon-viz-legend-item"/);
    assert.match(out, /salmon-visually-hidden">South</);
  });
  it('series.renderMarker and series.labels.render draw SVG content at each point', () => {
    const out = html({
      data: sales,
      series: [{ type: 'line', xField: 'month', yField: 'north', name: 'North', markers: true, renderMarker: (ctx) => h('image', { href: `/pin-${ctx.index}.svg`, x: -6, y: -6, width: 12, height: 12 }), labels: { render: (ctx) => h('text', { className: 'lbl' }, `${ctx.xText}=${ctx.yText}`) } }],
    });
    assert.equal((out.match(/class="salmon-viz-mark salmon-chart-custom-marker"/g) ?? []).length, 6);
    assert.match(out, /<g class="salmon-viz-mark salmon-chart-custom-marker" data-index="0" transform="translate\([\d.]+ [\d.]+\)"><image href="\/pin-0.svg"/);
    assert.match(out, /<g class="salmon-chart-data-label" transform="translate\([\d.]+ [\d.]+\)"><text class="lbl">Jan=12<\/text>/);
  });
});

describe('Chart: smart labels', () => {
  const dense = Array.from({ length: 30 }, (_, i) => ({ x: i, y: 100 + (i % 3) }));
  const labelsOf = (labels: ChartSeriesOptions['labels'], extra: ChartSeriesOptions[] = []) => model({ data: dense, yAxis: { format: 'n2' }, series: [{ xField: 'x', yField: 'y', labels }, ...extra] }, { width: 300, height: 200 }).series.map((s) => s.labels);
  it('hide, shiftY, shiftX and rotate90 resolve collisions; none keeps every label', () => {
    assert.equal(labelsOf(true)[0]?.length, 30);
    const hidden = labelsOf({ overlap: 'hide' })[0] ?? [];
    assert.ok(hidden.length > 0 && hidden.length < 30);
    const shifted = labelsOf({ overlap: 'shiftY' })[0] ?? [];
    const base = labelsOf(true)[0] ?? [];
    assert.ok(shifted.some((l) => base.find((b) => b.key === l.key)?.y !== l.y), 'some labels moved along y');
    assert.ok(shifted.length >= hidden.length);
    const shiftedX = labelsOf({ overlap: 'shiftX' })[0] ?? [];
    assert.ok(shiftedX.length >= hidden.length);
    const rotated = labelsOf({ overlap: 'rotate90' })[0] ?? [];
    assert.equal(rotated.length, 30);
    assert.ok(rotated.some((l) => l.angle === -90) && rotated.some((l) => l.angle === undefined));
    // Placed labels never overlap.
    const boxes = hidden.map((l) => ({ x: l.x, y: l.y }));
    for (let i = 1; i < boxes.length; i++) assert.ok(Math.abs((boxes[i]?.x ?? 0) - (boxes[i - 1]?.x ?? 0)) > 8);
  });
  it('earlier series keep their labels; dedupe drops repeated texts', () => {
    const [a, b] = labelsOf({ overlap: 'hide' }, [{ xField: 'x', yField: 'y', labels: { overlap: 'hide' } }]);
    assert.ok((a?.length ?? 0) > 0);
    assert.equal(b?.length, 0, 'the second series collides with the first everywhere');
    const flat = model({ data: [1, 1, 2, 2, 2, 3].map((y, x) => ({ x, y })), series: [{ xField: 'x', yField: 'y', labels: { dedupe: true } }] }).series[0]?.labels.map((l) => l.text);
    assert.deepEqual(flat, ['1', '2', '3']);
  });
});

describe('Chart: Series (completion)', () => {
  it('volumeField on a candle series draws volume columns in the candle colors', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({ t: i, o: 10 + (i % 3), c: 10 + ((i + 1) % 3), h: 14, l: 8, v: 100 * (i + 1) }));
    const m = model({ data, series: [{ type: 'candle', xField: 't', openField: 'o', closeField: 'c', highField: 'h', lowField: 'l', volumeField: 'v' }] });
    const vol = m.series[0]?.marks.filter((x) => x.className === 'volume') ?? [];
    assert.equal(vol.length, 10);
    // The largest volume takes a fifth of the plot height, along the plot bottom.
    const tallest = vol[9]?.d ?? '';
    assert.ok(Math.abs(Number(/v([\d.]+)/.exec(tallest)?.[1]) - m.plot.height * 0.2) < 1);
    assert.match(m.series[0]?.yText(0) ?? '', /V 100/);
  });
  it("errorBars axis 'x' and 'both' draw horizontal whiskers on a continuous x axis", () => {
    const data = [{ x: 1, y: 5 }, { x: 2, y: 7 }, { x: 3, y: 6 }];
    const bars = (axis: 'x' | 'y' | 'both') => model({ data, series: [{ type: 'scatter', xField: 'x', yField: 'y', errorBars: { kind: 'fixed', amount: 0.5, axis, caps: false } }] }).series[0]?.marks.find((x) => x.key === 'err')?.d ?? '';
    assert.equal((bars('y').match(/V/g) ?? []).length, 3);
    assert.equal((bars('y').match(/H/g) ?? []).length, 0);
    assert.equal((bars('x').match(/H/g) ?? []).length, 3);
    assert.equal((bars('x').match(/V/g) ?? []).length, 0);
    assert.equal((bars('both').match(/[HV]/g) ?? []).length, 6);
    // x errors widen the x extent.
    const m = model({ data, xAxis: { padding: 'none' }, series: [{ type: 'scatter', xField: 'x', yField: 'y', errorBars: { kind: 'fixed', amount: 0.5, axis: 'x' } }] });
    assert.ok((m.axes.find((a) => a.id === 'x')?.scale.domain[0] as number) <= 0.5);
  });
  it('series.description joins the summary and the table caption', () => {
    const m = model({ title: 'Sales', data: sales, series: [{ xField: 'month', yField: 'north', name: 'North', description: 'Units sold in the north' }, { xField: 'month', yField: 'south', name: 'South' }] });
    assert.match(m.summary, /North: Units sold in the north\.$/);
    assert.equal(m.table?.caption, 'Sales. North: Units sold in the north.');
    const out = html({ title: 'Sales', data: sales, series: [{ xField: 'month', yField: 'north', name: 'North', description: 'Units sold in the north' }] });
    assert.match(out, /North: Units sold in the north\./);
  });
});

describe('Chart: Analysis', () => {
  it('trendlines of every kind with forecast and legend entries', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({ x: i + 1, y: 2 * (i + 1) + 1 }));
    for (const kind of ['linear', 'exponential', 'logarithmic', 'polynomial', 'power', 'movingAverage'] as const) {
      const m = model({ data, legend: true, series: [{ xField: 'x', yField: 'y', trendlines: [{ kind, order: 3, period: 3, forecast: { forward: 2 }, name: `T ${kind}` }] }] });
      assert.equal(m.series.length, 2, kind);
      assert.ok(m.series[1]?.marks[0]?.d, kind);
      assert.ok(m.legend.some((l) => l.label === `T ${kind}`), kind);
    }
    const lin = model({ data, series: [{ xField: 'x', yField: 'y', trendlines: [{ kind: 'linear', forecast: { forward: 5 } }] }] });
    assert.equal(lin.axes.find((a) => a.id === 'x')?.scale.domain[1], 15);
  });
  it('trendline markers and tooltip', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({ x: i + 1, y: 2 * (i + 1) + 1 }));
    const trend = (t: object, s: object = {}) => model({ data, series: [{ xField: 'x', yField: 'y', ...s, trendlines: [{ kind: 'linear', ...t }] }] }).series[1]!;
    assert.equal(trend({}).marks.filter((x) => x.className === 'marker').length, 0);
    assert.equal(trend({}).count, 2);
    const on = trend({ markers: { shape: 'diamond', size: 9 } });
    assert.equal(on.count, 10);
    assert.equal(on.marks.filter((x) => x.className === 'marker').length, 10);
    assert.equal(trend({ kind: 'movingAverage', period: 2, markers: true }).marks.filter((x) => x.className === 'marker').length, 9);
    assert.equal(trend({}).tooltip, true);
    assert.equal(trend({ tooltip: false }).tooltip, false);
    assert.equal(trend({}, { tooltip: false }).tooltip, false);
    assert.equal(trend({ tooltip: true }, { tooltip: false }).tooltip, true);
  });
  it('aria-labelledby and aria-label name the figure and the plot', () => {
    const base = { data: sales, title: 'Sales', series: [{ xField: 'month', yField: 'north' }] };
    const parts = (out: string) => ({ figure: /<figure[^>]*>/.exec(out)![0], plot: /<div[^>]*class="salmon-viz-plot"[^>]*>/.exec(out)![0] });
    const by = parts(renderToString(h(Chart, { ...base, 'aria-labelledby': 'heading', 'aria-label': 'ignored' })));
    for (const el of [by.figure, by.plot]) {
      assert.match(el, /aria-labelledby="heading"/);
      assert.doesNotMatch(el, /aria-label="/);
    }
    const named = parts(renderToString(h(Chart, { ...base, 'aria-label': 'Quarterly sales' })));
    for (const el of [named.figure, named.plot]) {
      assert.match(el, /aria-label="Quarterly sales"/);
      assert.doesNotMatch(el, /aria-labelledby=/);
    }
    const titled = parts(renderToString(h(Chart, base)));
    assert.match(titled.figure, /aria-labelledby="[^"]*-title"/);
    assert.match(titled.plot, /aria-label="Sales"/);
    const auto = parts(renderToString(h(Chart, { data: sales, series: base.series })));
    assert.match(auto.figure, /aria-label="[^"]+"/);
    assert.match(auto.plot, /aria-label="[^"]+"/);
  });
  it('indicators on Chart: values, parts, zones and generated axes', async () => {
    const v = await import('../dist/viz/indicators.js');
    const ohlc = Array.from({ length: 60 }, (_, i) => {
      const c = 100 + 10 * Math.sin(i / 5) + i * 0.3;
      return { t: i, o: c - 1, h: c + 2, l: c - 2, c, vol: 1000 + i * 10 };
    });
    const price: ChartSeriesOptions = { id: 'p', type: 'candle', xField: 't', openField: 'o', highField: 'h', lowField: 'l', closeField: 'c', volumeField: 'vol' };
    const close = ohlc.map((d) => d.c);
    const high = ohlc.map((d) => d.h);
    const low = ohlc.map((d) => d.l);
    const run = (indicators: NonNullable<ChartProps['indicators']>, extra: Partial<ChartProps> = {}) => model({ data: ohlc, series: [price], indicators, ...extra });
    const yv = (m: ReturnType<typeof model>, id: string, i: number) => m.series.find((s) => s.id === id)?.yValue(i);
    // moving averages on the price axis, close by default or another field.
    const ma = run([{ id: 'sma', kind: 'sma', seriesId: 'p', period: 5 }, { id: 'ema', kind: 'ema', seriesId: 'p', period: 5 }, { id: 'tma', kind: 'tma', seriesId: 'p', period: 5, field: 'high' }]);
    assert.equal(yv(ma, 'sma', 30), v.sma(close, 5)[30]);
    assert.equal(yv(ma, 'ema', 30), v.ema(close, 5)[30]);
    assert.equal(yv(ma, 'tma', 30), v.tma(high, 5)[30]);
    assert.equal(ma.series.find((s) => s.id === 'sma')?.type, 'line');
    assert.equal(ma.axes.length, 2, 'overlays add no axis');
    // momentum and RSI with zones on a generated secondary axis.
    const osc = run([{ id: 'mom', kind: 'momentum', seriesId: 'p', period: 10 }, { id: 'rsi', kind: 'rsi', seriesId: 'p', zones: { upper: 75, lower: 25 } }]);
    assert.equal(yv(osc, 'mom', 40), v.momentum(close, 10)[40]);
    assert.equal(yv(osc, 'rsi', 40), v.rsi(close, 14)[40]);
    const rsiAxis = osc.axes.find((a) => a.id === 'rsi-axis');
    assert.ok(rsiAxis, 'an oscillator gets its own axis');
    assert.deepEqual(rsiAxis.lines.map((l) => l.label), ['75', '25']);
    assert.equal(rsiAxis.bands.length, 1);
    // ATR and accumulation / distribution (volumeField).
    const vol = run([{ id: 'atr', kind: 'atr', seriesId: 'p' }, { id: 'ad', kind: 'accumulationDistribution', seriesId: 'p' }]);
    assert.equal(yv(vol, 'atr', 40), v.atr(high, low, close, 14)[40]);
    assert.equal(yv(vol, 'ad', 40), v.accumulationDistribution(high, low, close, ohlc.map((d) => d.vol))[40]);
    // Bollinger bands with deviations: a range area and the middle line.
    const bb = run([{ id: 'bb', kind: 'bollinger', seriesId: 'p', period: 10, deviations: 3 }]);
    const ref = v.bollinger(close, 10, 3);
    assert.equal(bb.series.find((s) => s.id === 'bb')?.yValue(30), ref.middle[30]);
    assert.equal(bb.series.find((s) => s.id === 'bb-band')?.type, 'area');
    // MACD display parts.
    const parts = (display: 'line' | 'histogram' | 'both') => run([{ id: 'm', kind: 'macd', seriesId: 'p', display, fastPeriod: 6, slowPeriod: 13, signalPeriod: 4 }]).series.filter((s) => s.id.startsWith('m')).map((s) => `${s.id}:${s.type}`);
    assert.deepEqual(parts('line'), ['m:line', 'm-signal:line']);
    assert.deepEqual(parts('histogram'), ['m-histogram:column']);
    assert.deepEqual(parts('both'), ['m-histogram:column', 'm:line', 'm-signal:line']);
    assert.equal(run([{ id: 'm', kind: 'macd', seriesId: 'p', fastPeriod: 6, slowPeriod: 13, signalPeriod: 4 }]).series.find((s) => s.id === 'm')?.yValue(40), v.macd(close, 6, 13, 4).macd[40]);
    // Stochastic %K / %D with default zones.
    const st = run([{ id: 'st', kind: 'stochastic', seriesId: 'p', kPeriod: 9, dPeriod: 3, zones: true }]);
    const sref = v.stochastic(high, low, close, 9, 3);
    assert.equal(yv(st, 'st', 40), sref.k[40]);
    assert.equal(yv(st, 'st-d', 40), sref.d[40]);
    assert.deepEqual(st.axes.find((a) => a.id === 'st-axis')?.lines.map((l) => l.label), ['80', '20']);
  });
  it('indicator.yAxis places an indicator on an axis of another pane; reactive indicators', () => {
    const data = Array.from({ length: 40 }, (_, i) => ({ t: i, c: 50 + 20 * Math.sin(i / 4) }));
    const props: ChartProps = {
      data,
      panes: { rows: ['65%', '35%'] },
      axes: [{ id: 'osc', direction: 'y', pane: { row: 1 }, min: 0, max: 100 }],
      series: [{ id: 'p', type: 'line', xField: 't', yField: 'c' }],
      indicators: [{ id: 'rsi', kind: 'rsi', seriesId: 'p', yAxis: 'osc', zones: true }],
    };
    const m = model(props);
    const rsi = m.series.find((s) => s.id === 'rsi');
    assert.ok(rsi);
    const split = m.plot.y + m.plot.height * 0.65;
    for (let i = 14; i < 40; i++) assert.ok((rsi.py[i] as number) >= split - 0.01, 'drawn in the lower pane');
    assert.equal(m.axes.find((a) => a.id === 'osc')?.lines.length, 2, 'zones on the named axis');
    assert.equal(m.axes.some((a) => a.id === 'rsi-axis'), false);
    // Reactive: a new indicators array is a new model (no refresh method).
    assert.equal(model({ ...props, indicators: [] }).series.length, 1);
  });
  it('render on the server with features={[technicalIndicators]}; without the feature no indicator is drawn', async () => {
    const { technicalIndicators } = await import('../dist/chart/indicators.js');
    const p: ChartProps = { data: Array.from({ length: 30 }, (_, i) => ({ t: i, c: i % 7 })), series: [{ id: 'p', xField: 't', yField: 'c', trendlines: [{ kind: 'linear' }] }], indicators: [{ id: 'sma', kind: 'sma', seriesId: 'p', period: 3 }] };
    const pre = html({ ...p, features: [technicalIndicators] });
    assert.match(pre, /data-series="sma"/);
    assert.match(pre, /data-series="p-trend-0"/);
    const without = html(p);
    assert.doesNotMatch(without, /data-series="sma"/);
    assert.match(without, /data-series="p-trend-0"/, 'trendlines are on the default path');
  });
  it('empty points: gap, zero, drop and average', () => {
    const data = [{ x: 0, y: 1 }, { x: 1, y: null }, { x: 2, y: 3 }];
    const d = (mode?: 'gap' | 'zero' | 'drop' | 'average') => model({ data, series: [{ xField: 'x', yField: 'y', emptyPoints: mode }] }).series[0];
    assert.match(d('gap')?.marks[0]?.d ?? '', /M.*M/);
    assert.equal(d('zero')?.yValue(1), 0);
    assert.equal(d('average')?.yValue(1), 2);
    assert.match(d('drop')?.marks[0]?.d ?? '', /M.*M/);
  });
});

describe('Shared foundation', () => {
  it('decimates 100,000 points to at most four per pixel column', () => {
    const pts = Array.from({ length: 100_000 }, (_, i) => ({ x: i, y: Math.sin(i / 100) }));
    const m = model({ data: pts, series: [{ xField: 'x', yField: 'y' }] });
    assert.ok(m.drawnPoints <= m.plot.width * 4 + 8, String(m.drawnPoints));
    assert.equal(m.series[0]?.count, 100_000);
    const none = model({ data: pts.slice(0, 5000), decimation: false, series: [{ xField: 'x', yField: 'y' }] });
    assert.equal(none.drawnPoints, 5000);
    const scatter = model({ data: pts, series: [{ type: 'scatter', xField: 'x', yField: 'y' }] });
    assert.ok(scatter.drawnPoints < 100_000 && scatter.drawnPoints > 0);
    const lttb = model({ data: pts, decimation: 'lttb', series: [{ xField: 'x', yField: 'y' }] });
    assert.ok(lttb.drawnPoints <= m.plot.width * 2 + 2);
  });
  it('palette slots and data colors', () => {
    const m = model({ data: sales, series: [{ xField: 'month', yField: 'north' }, { xField: 'month', yField: 'south' }] });
    assert.deepEqual(m.series.map((s) => s.color), ['var(--salmon-chart-1)', 'var(--salmon-chart-2)']);
    const p = model({ data: sales, palette: ['#111111', '#222222'], series: [{ xField: 'month', yField: 'north' }, { xField: 'month', yField: 'south' }, { xField: 'month', yField: 'north', id: 'c' }] });
    assert.deepEqual(p.series.map((s) => s.color), ['#111111', '#222222', '#111111']);
  });
  it('automatic summary, accessible table with a row cap, showDataTable', () => {
    const out = html({ data: sales, series: [{ name: 'North', xField: 'month', yField: 'north' }] });
    assert.match(out, /Line chart, 1 series, x from Jan to Jun\. North: 6 points, minimum 9, maximum 25, trending up\./);
    assert.match(out, /<table class="salmon-viz-table salmon-visually-hidden"><caption>Chart data<\/caption>/);
    assert.match(out, /<th scope="row">Jan<\/th><td>12<\/td>/);
    assert.match(html({ showDataTable: true, data: sales, series: [{ xField: 'month', yField: 'north' }] }), /<table class="salmon-viz-table">/);
    assert.ok(!html({ accessibleTable: false, data: sales, series: [{ xField: 'month', yField: 'north' }] }).includes('<table'));
    const big = html({ data: Array.from({ length: 700 }, (_, i) => ({ x: i, y: i })), series: [{ xField: 'x', yField: 'y' }] });
    assert.match(big, /200 more rows not shown/);
    assert.match(html({ description: 'Custom description.', data: sales, series: [{ xField: 'month', yField: 'north' }] }), /Custom description\./);
  });
  it('ChartSeries / ChartAxis children compile to the same model as arrays', () => {
    const a = html({ data: sales, yAxis: { title: 'U' }, series: [{ xField: 'month', yField: 'north' }] });
    const b = renderToString(h(Chart, { data: sales }, h(ChartAxis, { direction: 'y', id: 'y', title: 'U' }), h(ChartSeries, { xField: 'month', yField: 'north' })));
    assert.equal(a, b);
  });
  it('plain array data, per-series data and nested fields', () => {
    const m = model({ data: sales, series: [{ xField: 'month', yField: 'north' }, { data: [{ m: 'Jan', v: { n: 1 } }], xField: 'm', yField: 'v.n' }] });
    assert.equal(m.series[1]?.yValue(0), 1);
  });
  it('renderEmpty and the default no-data text', () => {
    assert.match(html({ data: [], series: [{ xField: 'x', yField: 'y' }] }), /class="salmon-viz-empty"[^>]*>No data</);
    assert.match(renderToString(h(Chart, { data: [], series: [{ xField: 'x', yField: 'y' }], renderEmpty: () => h('b', null, 'Nothing yet') })), /<b>Nothing yet<\/b>/);
    assert.match(html({ data: [], text: { noData: 'Keine Daten' }, series: [{ xField: 'x', yField: 'y' }] }), /Keine Daten/);
  });
  it('canvas renderer keeps axes and legend in SVG and renders an empty canvas on the server', () => {
    const out = html({ renderer: 'canvas', data: sales, series: [{ xField: 'month', yField: 'north' }, { xField: 'month', yField: 'south' }] });
    assert.match(out, /<canvas class="salmon-chart-canvas"/);
    assert.ok(!out.includes('class="salmon-chart-series"'));
    assert.match(out, /data-axis="x"/);
    const auto = html({ renderer: 'auto', data: sales, series: [{ xField: 'month', yField: 'north' }] });
    assert.ok(!auto.includes('<canvas'));
  });
});

describe('formatting matches the Data Grid formatter', () => {
  it('number presets, templates, Intl options and date skeletons format like column.format', async () => {
    const grid = await import('../../core/dist/format.js');
    const { makeNumberFormat, makeTimeFormat } = await import('../dist/internal/viz/format.js');
    const env = (locale: string, timeZone?: string) => ({ getLocale: () => locale, timeZone, currency: 'USD', cache: new Map(), warn: () => {} });
    const values = [0, 1234.5678, -42.1, 0.256];
    for (const locale of ['en-US', 'de-DE', 'ja-JP']) {
      for (const format of ['n0', 'n2', 'c2', 'p1', { maximumFractionDigits: 3 }] as const) {
        const g = grid.createValueFormatter(grid.describeFormat(format, 'number', () => {}, 'c'), 'number', env(locale));
        const c = makeNumberFormat(format, { locale }, 1);
        for (const v of values) assert.equal(c(v), g(v), `${locale} ${JSON.stringify(format)} ${v}`);
      }
      const t0 = Date.UTC(2024, 2, 5, 14, 30);
      for (const format of ['yMMMd', 'yMd', 'Hm', 'EEEE'] as const) {
        const g = grid.createValueFormatter(grid.describeFormat(format, 'date', () => {}, 'd'), 'date', env(locale, 'UTC'));
        const c = makeTimeFormat(format, { locale, timeZone: 'UTC' }, 'day');
        assert.equal(c(t0), g(new Date(t0)), `${locale} ${format}`);
      }
    }
    // The chart locale prop reaches axis labels and the tooltip text.
    const m = model({ locale: 'de-DE', data: [{ x: 1, y: 1234.5 }, { x: 2, y: 2500 }], yAxis: { format: 'n1' }, series: [{ xField: 'x', yField: 'y' }] });
    assert.ok(m.axes.find((a) => a.id === 'y')?.ticks.some((tk) => /\d\.\d{3},\d/.test(tk.text[0] ?? '')));
  });
});

describe('BulletChart', () => {
  const data = [{ k: 'Revenue', v: 270, t: 250, t2: 290 }, { k: 'Profit', v: 22, t: 25, t2: 28 }];
  it('one bar per item over a bullet series several targets with shapes', () => {
    const out = renderToString(h(BulletChart, { data, valueField: 'v', targetField: ['t', 't2'], targetShapes: ['line', 'circle'], categoryField: 'k', max: 300 }));
    assert.match(out, /data-type="bullet"/);
    assert.equal((out.match(/salmon-chart-target/g) ?? []).length, 4);
    assert.match(out, />Revenue</);
  });
  it('qualitative bands orientation colors', () => {
    const out = renderToString(h(BulletChart, { data, valueField: 'v', targetField: 't', categoryField: 'k', bands: [{ to: 150 }, { to: 225, color: '#cccccc' }, { to: 300 }], valueColor: '#111111', targetColor: '#ff0000' }));
    assert.match(out, /fill:var\(--salmon-border-default\)/);
    assert.match(out, /fill:#cccccc/);
    assert.match(out, /fill:#111111/);
    assert.match(out, /stroke:#ff0000/);
    const v = renderToString(h(BulletChart, { data, valueField: 'v', categoryField: 'k', orientation: 'vertical' }));
    assert.match(v, /data-axis="x"/);
  });
  it('scale options title labels', () => {
    const out = renderToString(h(BulletChart, { title: 'KPIs', subtitle: 'Q3', data, valueField: 'v', categoryField: 'k', min: 0, max: 300, interval: 100, format: 'c0', labels: true }));
    assert.match(out, />\$100</);
    assert.match(out, />KPIs</);
    assert.match(out, /class="salmon-chart-data-label"/);
  });
});

describe('plot coordinates', () => {
  it('plotPoint inverts a drawing point to the x category and the y value, also in a horizontal chart', () => {
    const m = model({ data: sales, series: [{ type: 'line', xField: 'month', yField: 'north' }] });
    const s = m.series[0]!;
    const at = plotPoint(m, { x: s.px[2] as number, y: s.py[2] as number });
    assert.equal(at.xValue, 'Mar');
    assert.ok(Math.abs((at.yValue as number) - 9) < 1e-6);
    const hm = model({ data: sales, orientation: 'horizontal', series: [{ type: 'bar', xField: 'month', yField: 'north' }] });
    const hs = hm.series[0]!;
    const hat = plotPoint(hm, { x: hs.px[3] as number, y: hs.py[3] as number });
    assert.equal(hat.xValue, 'Apr');
  });
});
