import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { HeatMap, HEAT_MAP_CANVAS_THRESHOLD } from '@salmonui/charts/heat-map';

// Server rendering of HeatMap: final markup at the
// given size, axes and label groups, color scales, legends, cell shapes,
// renderer switch and the accessible table. Interaction:
// tests/browser/heat-map.spec.ts.

const render = (props: Parameters<typeof HeatMap>[0]) => renderToString(h(HeatMap, { width: 400, height: 300, ...props }));
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;
const cells = (html: string) => [...html.matchAll(/<rect class="salmon-heat-map-cell"[^>]*style="fill:([^"]+)"/g)].map((m) => m[1]);
const table = [
  [1, 2, 3],
  [4, null, 6],
];

describe('HeatMap server render', () => {
  it('renders a table as a figure with one cell per value and a capped table', () => {
    const html = render({ data: table, title: 'Load', xAxis: { labels: ['Mon', 'Tue', 'Wed'] }, yAxis: { labels: ['AM', 'PM'] } });
    assert.match(html, /^<figure data-renderer="svg" class="salmon-viz salmon-heat-map" aria-labelledby=/);
    assert.equal(cells(html).length, 6);
    assert.match(html, /Heat map, 2 rows by 3 columns, values from 1 to 6\./);
    assert.match(html, /aria-roledescription="heat map"/);
    assert.match(html, /<th scope="row">PM<\/th><td>Tue<\/td><td>No value<\/td>/);
    const big = render({ data: Array.from({ length: 40 }, (_, y) => Array.from({ length: 40 }, (_, x) => x + y)), renderer: 'svg' });
    assert.match(big, /1100 more cells not shown/);
  });
  it('reads records with x, y and value fields and bubble sizes', () => {
    const recs = [
      { day: 'Mon', slot: 'AM', load: 3, n: 10 },
      { day: 'Tue', slot: 'AM', load: 5, n: 40 },
      { day: 'Mon', slot: 'PM', load: 1, n: 90 },
    ];
    const html = render({ data: recs, xField: 'day', yField: 'slot', valueField: 'load', sizeField: 'n', cells: { shape: 'bubble', bubble: 'sizeAndColor' } });
    const radii = [...html.matchAll(/<circle class="salmon-heat-map-cell"[^>]*r="([\d.]+)"/g)].map((m) => Number(m[1]));
    assert.equal(radii.length, 3);
    assert.ok(radii[2]! > radii[1]! && radii[1]! > radii[0]!, 'radius grows with size');
    assert.match(render({ data: recs, xField: 'day', yField: 'slot', valueField: 'load', cells: { shape: 'bubble', bubble: 'sector' } }), /<path class="salmon-heat-map-cell" d="M/);
  });
  it('orders numeric and time axes, filters min / max and formats keys', () => {
    const recs = [
      { x: 30, y: 'a', v: 1 },
      { x: 10, y: 'a', v: 2 },
      { x: 20, y: 'a', v: 3 },
      { x: 40, y: 'a', v: 4 },
    ];
    const html = render({ data: recs, xAxis: { scale: 'linear', max: 30, format: { style: 'percent' } }, locale: 'en-US' });
    assert.deepEqual([...html.matchAll(/<tspan[^>]*>([^<]+)<\/tspan>/g)].map((m) => m[1]), ['1,000%', '2,000%', '3,000%']);
    const t = render({ data: [{ x: Date.UTC(2026, 0, 2), y: 'a', v: 1 }, { x: Date.UTC(2026, 0, 1), y: 'a', v: 2 }], xAxis: { scale: 'time', format: { month: 'short', day: 'numeric' } }, locale: 'en-US' });
    assert.deepEqual([...t.matchAll(/<tspan[^>]*>([^<]+)<\/tspan>/g)].map((m) => m[1]), ['Jan 1', 'Jan 2']);
    const every = render({ data: [[1, 2, 3, 4]], xAxis: { interval: 2 } });
    assert.equal(count(every, /<tspan/g), 2);
  });
  it('rotates, positions and reverses axes', () => {
    const long = render({ data: [[1, 2, 3, 4, 5, 6, 7, 8]], xAxis: { labels: Array.from({ length: 8 }, (_, i) => `Category number ${i}`), labelOverlap: 'rotate45' } });
    assert.match(long, /transform="rotate\(-45 /);
    const top = render({ data: table, xAxis: { position: 'top', labels: ['a', 'b', 'c'] }, yAxis: { position: 'end', labels: ['r', 's'] } });
    assert.match(top, /<text x="[\d.]+" y="[\d.]+" text-anchor="start" dominant-baseline="central">r<\/text>/);
    const rev = cells(render({ data: [[1, 2]], xAxis: { reversed: true }, legend: false }));
    const fwd = cells(render({ data: [[1, 2]], legend: false }));
    assert.deepEqual(rev, fwd, 'same colors');
    const firstX = (html: string) => Number(/<rect class="salmon-heat-map-cell" x="([\d.]+)"/.exec(html)?.[1]);
    assert.ok(firstX(render({ data: [[1, 2]], xAxis: { reversed: true }, legend: false })) > firstX(render({ data: [[1, 2]], legend: false })));
  });
  it('plans the overlap of the interval labels only', () => {
    // 400 columns, a label every 50th: the eight drawn labels fit, so none of them is hidden.
    const wide = Array.from({ length: 2 }, () => Array.from({ length: 400 }, (_, x) => x));
    const xLabels = (html: string) => [.../<g class="salmon-heat-map-axis" data-axis="x">(.*?)<\/g>/.exec(html)![1]!.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((t) => t[1]);
    assert.deepEqual(xLabels(render({ data: wide, width: 720, xAxis: { interval: 50 }, legend: false })), ['1', '51', '101', '151', '201', '251', '301', '351']);
    // Interval labels that still collide hide among themselves.
    assert.ok(xLabels(render({ data: wide, width: 120, xAxis: { interval: 50 }, legend: false })).length < 8);
  });
  it('draws multi-level label groups', () => {
    const html = render({ data: [[1, 2, 3, 4]], xAxis: { labels: ['Q1', 'Q2', 'Q3', 'Q4'], labelGroups: [{ from: 0, to: 1, text: 'H1' }, { from: 2, to: 3, text: 'H2' }] } });
    assert.equal(count(html, /class="salmon-heat-map-label-group"/g), 2);
    assert.match(html, />H2<\/text>/);
  });
  it('colors by gradient stops, steps, per-row domain and the default sequential palette', () => {
    const grad = cells(render({ data: [[0, 5, 10]], colorScale: { stops: [{ value: 0, color: '#000000' }, { value: 10, color: '#ffffff' }] } }));
    assert.deepEqual(grad, ['#000000', '#808080', '#ffffff']);
    const steps = cells(render({ data: [[0, 5, 10]], colorScale: { kind: 'steps', stops: [{ value: 0, color: '#111111' }, { value: 5, color: '#555555' }] } }));
    assert.deepEqual(steps, ['#111111', '#555555', '#555555']);
    const rows = cells(render({ data: [[0, 10], [100, 200]], colorScale: { domain: 'row' } }));
    assert.deepEqual(rows, ['var(--salmon-chart-sequential-1)', 'var(--salmon-chart-sequential-9)', 'var(--salmon-chart-sequential-1)', 'var(--salmon-chart-sequential-9)']);
    const out = cells(render({ data: [[0, 50]], colorScale: { kind: 'steps', stops: [{ value: 0, color: '#111111' }, { value: 10, color: '#222222' }], outOfRange: '#999999' } }));
    assert.deepEqual(out, ['#111111', '#999999']);
  });
  it('shows cell labels with a format, formatCell and getCellStyle', () => {
    const html = render({ data: [[1.234, 2]], cells: { labels: true, format: { maximumFractionDigits: 1 } }, locale: 'en-US' });
    assert.match(html, /class="salmon-heat-map-label"[^>]*>1.2<\/text>/);
    const custom = render({ data: [[1, 2]], cells: { labels: true }, formatCell: (c) => `#${c.value}`, getCellStyle: (c) => (c.x === 1 ? { color: '#abcdef' } : undefined) });
    assert.match(custom, />#2<\/text>/);
    assert.match(custom, /fill:#abcdef/);
  });
  it('renders a gradient legend with edge labels and a toggling list legend for steps', () => {
    const grad = render({ data: [[0, 10]], legend: { position: 'bottom', labels: 'edge' } });
    assert.match(grad, /<g class="salmon-heat-map-legend" data-kind="gradient"><defs><linearGradient id="[^"]+-grad"/);
    assert.equal(count(grad, /<stop /g), 9);
    const list = render({ data: [[0, 10]], colorScale: { kind: 'steps', stops: [{ value: 0, color: '#111111', label: 'Low' }, { value: 5, color: '#555555', label: 'High' }] }, hiddenItems: [1] });
    assert.match(list, /role="toolbar" aria-label="Legend"/);
    assert.equal(count(list, /aria-pressed="false"/g), 1);
    assert.match(list, /data-hidden=""/, 'cells of a hidden step are drawn empty');
  });
  it('draws empty cells with the neutral empty color', () => {
    assert.match(render({ data: table }), /style="fill:var\(--salmon-surface-sunken\)" data-empty=""/);
  });
  it('switches to an empty sized canvas at the auto threshold and keeps SVG axes', () => {
    assert.equal(HEAT_MAP_CANVAS_THRESHOLD, 10000);
    const n = 100;
    const big = Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => x * y));
    const html = render({ data: big });
    assert.match(html, /data-renderer="canvas"/);
    assert.match(html, /<canvas class="salmon-viz-canvas salmon-heat-map-canvas" aria-hidden="true" style="left:[\d.]+%;top:[\d.]+%;width:[\d.]+%;height:[\d.]+%"><\/canvas>/);
    assert.equal(count(html, /salmon-heat-map-cell/g), 0);
    assert.match(render({ data: table, renderer: 'canvas' }), /data-renderer="canvas"/);
    assert.match(render({ data: big, renderer: 'svg' }), /data-renderer="svg"/);
  });
  it('server renders a 1,000 × 1,000 matrix with bounded markup', () => {
    const big = Array.from({ length: 1000 }, (_, y) => Array.from({ length: 1000 }, (_, x) => Math.sin(x / 40) * Math.cos(y / 40)));
    const t = performance.now();
    const html = render({ data: big, width: 800, height: 600 });
    console.log(`[perf] heat map renderToString 1000x1000: ${(performance.now() - t).toFixed(1)}ms`);
    assert.ok(html.length < 400_000, `${html.length} bytes`);
  });
  it('shows title and subtitle and marks selected cells', () => {
    const html = render({ data: table, title: 'Load', subtitle: 'per slot', selection: true, defaultSelectedCells: [{ x: 1, y: 0 }] });
    assert.match(html, /<text class="salmon-viz-title"[^>]*>Load<\/text><text class="salmon-viz-subtitle"[^>]*>per slot<\/text>/);
    assert.match(html, /<rect class="salmon-heat-map-selected"[^>]*data-x="1" data-y="0"/);
  });
});
