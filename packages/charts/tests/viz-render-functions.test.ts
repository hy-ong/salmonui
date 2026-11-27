// Render functions (`pointRender`, `textRender`, `cellRender`,
// `nodeRendering`, `cardRendered`, ...) are pure function props on every
// family. Each one is called during render, returns
// a style or content, and its result reaches the server markup; none is
// called for elements that are not drawn.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { Chart } from '../dist/chart.js';
import { buildModel, compileSpec } from '../dist/chart/model.js';
import { GeoMap } from '../dist/geo-map.js';
import { Gauge } from '../dist/gauge.js';
import { HeatMap } from '../dist/heat-map.js';
import { Kanban } from '../../kanban/dist/kanban.js';
import { PieChart } from '../dist/pie-chart.js';
import { SankeyChart } from '../dist/sankey-chart.js';
import { Sparkline } from '../dist/sparkline.js';
import { TreeMap } from '../dist/tree-map.js';
import type { ChartProps, ChartSeriesOptions } from '../dist/chart.js';

const months = ['Jan', 'Feb', 'Mar', 'Apr'].map((m, i) => ({ m, n: [3, 5, 4, 6][i] as number }));
const MARK = '#123456';
const counter = () => {
  const seen: number[] = [];
  return { seen, hit: (i: number) => seen.push(i) };
};

describe('pure render functions', () => {
  it('Chart: series.getPointStyle colors points and hides them (one call per point), axis.formatLabel, tooltip and legend renderers', () => {
    const c = counter();
    const series: ChartSeriesOptions[] = [{ type: 'column', xField: 'm', yField: 'n', name: 'S', getPointStyle: (p) => (c.hit(p.index), p.index === 1 ? { color: MARK } : p.index === 2 ? { hidden: true } : undefined) }];
    const props: ChartProps = { data: months, series, xAxis: { formatLabel: (v) => `<${String(v)}>` } };
    const m = buildModel(props, compileSpec(props, series, new Set()), { width: 600, height: 300, zoom: {} });
    assert.deepEqual(c.seen, [0, 1, 2, 3], 'one call per point per layout');
    const bars = m.series[0]?.marks.filter((x) => x.index !== undefined) ?? [];
    assert.deepEqual(bars.map((b) => b.index), [0, 1, 3], 'the hidden point is not drawn');
    assert.equal(bars.find((b) => b.index === 1)?.fill, MARK);
    assert.deepEqual(m.axes.find((a) => a.id === 'x')?.ticks.map((t) => t.text[0]), ['<Jan>', '<Feb>', '<Mar>', '<Apr>']);
    // A line leaves a gap at the hidden point.
    const line = buildModel({ data: months }, compileSpec({ data: months }, [{ xField: 'm', yField: 'n', getPointStyle: (p) => (p.index === 2 ? { hidden: true } : undefined) }], new Set()), { width: 600, height: 300, zoom: {} });
    assert.equal((line.series[0]?.marks[0]?.d.match(/M/g) ?? []).length, 2);
    // Legend and label renderers reach the server markup.
    const out = renderToString(h(Chart, { data: months, legend: { renderItem: (it) => `[${it.label}]` }, series: [{ xField: 'm', yField: 'n', name: 'A', labels: { format: (p) => `v${p.y}` } }, { xField: 'm', yField: 'n', name: 'B' }] }));
    assert.match(out, /\[A\]/);
    assert.match(out, />v3</);
  });

  it('PieChart and Sparkline: getPointStyle', () => {
    const pie = renderToString(h(PieChart, { data: months, valueField: 'n', labelField: 'm', getPointStyle: (p: { index: number }) => (p.index === 0 ? { color: MARK } : undefined) }));
    assert.match(pie, new RegExp(MARK));
    const c = counter();
    const spark = renderToString(h(Sparkline, { data: months, yField: 'n', type: 'column', getPointStyle: (p: { index: number }) => (c.hit(p.index), p.index === 3 ? { color: MARK } : undefined) }));
    assert.match(spark, new RegExp(MARK));
    assert.ok(c.seen.length <= months.length);
  });

  it('HeatMap getCellStyle, TreeMap getItemStyle, SankeyChart getNodeStyle / getLinkStyle', () => {
    const heat = renderToString(h(HeatMap, { data: months.map((d) => ({ ...d, r: 'R' })), xField: 'm', yField: 'r', valueField: 'n', getCellStyle: (cell: { value: number }) => (cell.value === 5 ? { color: MARK } : undefined) }));
    assert.match(heat, new RegExp(MARK));
    const tree = renderToString(h(TreeMap, { data: months.map((d) => ({ ...d, g: 'G' })), weightField: 'n', levels: [{ groupBy: 'g' }], leaves: { labelField: 'm' }, getItemStyle: (item: { label?: string }) => (item.label === 'Feb' ? { color: MARK } : undefined) }));
    assert.match(tree, new RegExp(MARK));
    const flow = renderToString(h(SankeyChart, { nodes: [{ id: 'a' }, { id: 'b' }], links: [{ source: 'a', target: 'b', value: 2 }], getNodeStyle: (n: { id: string }) => (n.id === 'a' ? { color: MARK } : undefined), getLinkStyle: () => ({ color: '#654321' }) }));
    assert.match(flow, new RegExp(MARK));
    assert.match(flow, /#654321/);
  });

  it('GeoMap getShapeStyle, Gauge axis formatLabel, Kanban renderCard', () => {
    const square = (name: string, x: number) => ({ type: 'Feature' as const, properties: { name }, geometry: { type: 'Polygon' as const, coordinates: [[[x, 0], [x + 10, 0], [x + 10, 10], [x, 10], [x, 0]]] } });
    const geo = renderToString(h(GeoMap, { layers: [{ shapes: { type: 'FeatureCollection', features: [square('A', 0), square('B', 10)] }, getShapeStyle: (ctx: { name: string }) => (ctx.name === 'B' ? { fill: MARK } : undefined) }] }));
    assert.match(geo, new RegExp(MARK));
    const gauge = renderToString(h(Gauge, { axes: [{ min: 0, max: 100, formatLabel: (v: number) => `${v}%` }], pointers: [{ value: 40 }] }));
    assert.match(gauge, />100%</);
    const board = renderToString(h(Kanban, { data: [{ id: 1, s: 'todo', t: 'Write' }], getCardId: (c: unknown) => (c as { id: number }).id, columnField: 's', columns: [{ key: 'todo', header: 'To do' }], renderCard: (ctx: { card: unknown }) => h('b', { className: 'custom' }, (ctx.card as { t: string }).t.toUpperCase()) }));
    assert.match(board, /<b class="custom">WRITE<\/b>/);
  });
});
