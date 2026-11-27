// Shared Data Visualization behavior across every family: SVG output, the
// accessible pattern of each family, plain array data with nested field paths and
// the empty state, all on the server render.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Barcode, QRCode } from '../dist/barcode.js';
import { Chart } from '../dist/chart.js';
import { BulletChart } from '../dist/chart-bullet.js';
import { GeoMap } from '../dist/geo-map.js';
import { Gauge } from '../dist/gauge.js';
import { HeatMap } from '../dist/heat-map.js';
import { FunnelChart, PieChart } from '../dist/pie-chart.js';
import { RangeSelector } from '../dist/range-selector.js';
import { SankeyChart } from '../dist/sankey-chart.js';
import { Sparkline } from '../dist/sparkline.js';
import { StockChart } from '../dist/stock-chart.js';
import { TreeMap } from '../dist/tree-map.js';

/** Rows with the value both flat (`n`) and nested (`v.n`), so a family renders the same markup from either path. */
const rows = (values: readonly number[], extra: (i: number) => Record<string, unknown>) => values.map((n, i) => ({ n, v: { n }, ...extra(i) }));
const months = rows([3, 5, 4], (i) => ({ m: ['Jan', 'Feb', 'Mar'][i] }));
const days = rows([1, 2, 3], (i) => ({ d: `2024-01-0${i + 1}` }));
const square = (name: string, x: number) => ({ type: 'Feature' as const, properties: { name }, geometry: { type: 'Polygon' as const, coordinates: [[[x, 0], [x + 10, 0], [x + 10, 10], [x, 10], [x, 0]]] } });
const shapes = { type: 'FeatureCollection' as const, features: [square('A', 0), square('B', 10)] };
const regions = rows([1, 2], (i) => ({ name: ['A', 'B'][i] }));

/** Each data-bound family rendered from a value field (`n` or `v.n`). */
const dataBound: Record<string, (f: string) => ReactElement> = {
  Chart: (f) => h(Chart, { title: 'T', data: months, series: [{ xField: 'm', yField: f, name: 'S' }] }),
  BulletChart: (f) => h(BulletChart, { title: 'T', data: months, valueField: f, targetField: 'n', categoryField: 'm' }),
  PieChart: (f) => h(PieChart, { title: 'T', data: months, valueField: f, labelField: 'm' }),
  FunnelChart: (f) => h(FunnelChart, { title: 'T', data: months, valueField: f, labelField: 'm' }),
  StockChart: (f) => h(StockChart, { title: 'T', data: days, xField: 'd', closeField: f, toolbar: false, name: 'S' }),
  RangeSelector: (f) => h(RangeSelector, { data: days, xField: 'd', yField: f, 'aria-label': 'R' }),
  Sparkline: (f) => h(Sparkline, { data: months, yField: f }),
  HeatMap: (f) => h(HeatMap, { title: 'T', data: months.map((m) => ({ ...m, y: 'r' })), xField: 'm', yField: 'y', valueField: f }),
  TreeMap: (f) => h(TreeMap, { title: 'T', data: months.map((m) => ({ ...m, g: 'G' })), weightField: f, levels: [{ groupBy: 'g' }], leaves: { labelField: 'm' } }),
  GeoMap: (f) => h(GeoMap, { title: 'T', layers: [{ shapes, data: regions, shapeKey: 'name', dataKey: 'name', colorScale: { kind: 'opacity', field: f, color: '#336699' } }] }),
};
const others: Record<string, ReactElement> = {
  Gauge: h(Gauge, { title: 'T', pointers: [{ value: 3 }] }),
  SankeyChart: h(SankeyChart, { title: 'T', nodes: [{ id: 'a' }, { id: 'b' }], links: [{ source: 'a', target: 'b', value: 1 }] }),
  Barcode: h(Barcode, { value: '12345', type: 'code128' }),
  QRCode: h(QRCode, { value: 'hello' }),
};
const html = (el: ReactElement) => renderToString(el);
const all: [string, string][] = [...Object.entries(dataBound).map(([k, f]) => [k, html(f('v.n'))] as [string, string]), ...Object.entries(others).map(([k, el]) => [k, html(el)] as [string, string])];
const out = Object.fromEntries(all);
const FIGURE = ['Chart', 'BulletChart', 'PieChart', 'FunnelChart', 'StockChart', 'SankeyChart', 'HeatMap', 'GeoMap', 'Gauge', 'TreeMap'];
const IMAGE = ['Sparkline', 'Barcode', 'QRCode'];

describe('SVG rendering for every family', () => {
  for (const [name, markup] of all) {
    it(`${name} renders SVG on the server`, () => {
      assert.match(markup, /<svg[\s>]/);
      if (IMAGE.includes(name)) assert.match(markup, /<svg[^>]*role="img"[^>]*aria-label="[^"]+"/, 'image pattern: the SVG is the labelled image');
      else assert.match(markup, /<svg[^>]*aria-hidden="true"/, 'figure pattern: the drawing is hidden, the accessible parts carry the content');
    });
  }
});

describe('the accessible pattern of every family', () => {
  for (const name of FIGURE) {
    it(`${name}: a figure labelled by the title and described by the automatic summary, with an accessible equivalent`, () => {
      const m = out[name] as string;
      const figure = /<figure[^>]*aria-labelledby="([^"]+)"[^>]*aria-describedby="([^"]+)"/.exec(m);
      assert.ok(figure, 'figure with aria-labelledby and aria-describedby');
      assert.match(m, new RegExp(`id="${figure[1]}"[^>]*>T<`), 'labelled by the title');
      assert.match(m, new RegExp(`<p id="${figure[2]}" class="salmon-visually-hidden">[^<]+</p>`), 'described by the summary');
      if (name === 'TreeMap') assert.match(m, /<ul[\s\S]*<li/, 'TreeMap: the hierarchy as a nested list');
      else if (name === 'Gauge') assert.match(m, /role="meter"[^>]*aria-valuenow="3"/, 'Gauge: a meter per pointer');
      else assert.match(m, /<table/, 'the accessible data table');
    });
  }
  it('the table can be shown (showDataTable) or turned off (accessibleTable: false)', () => {
    assert.doesNotMatch(html(h(Chart, { data: months, accessibleTable: false, series: [{ xField: 'm', yField: 'n' }] })), /<table/);
    assert.doesNotMatch(html(h(PieChart, { data: months, valueField: 'n', labelField: 'm', accessibleTable: false })), /<table/);
    assert.match(html(h(HeatMap, { data: months.map((m) => ({ ...m, y: 'r' })), xField: 'm', yField: 'y', valueField: 'n', showDataTable: true })), /<table(?![^>]*salmon-visually-hidden)/);
  });
  it('Sparkline, Barcode and QRCode are images named by an automatic summary or the encoded value', () => {
    assert.match(out['Sparkline'] as string, /role="img"[^>]*aria-label="Sparkline, 3 points, minimum 3, maximum 5, first 3, last 4/);
    assert.match(out['Barcode'] as string, /role="img"[^>]*aria-label="12345"/);
    assert.match(out['QRCode'] as string, /role="img"[^>]*aria-label="hello"/);
  });
  it('RangeSelector is a multi-thumb slider with formatted values', () => {
    assert.equal((out['RangeSelector'] as string).match(/role="slider"/g)?.length, 3);
    assert.match(out['RangeSelector'] as string, /aria-valuetext="[^"]*2024[^"]*"/);
  });
});

describe('plain array data and nested field paths on every data-bound family', () => {
  for (const [name, render] of Object.entries(dataBound)) {
    it(`${name}: 'v.n' renders exactly as the flat field`, () => {
      // Field names reach default series names only (a table header), so compare with the path renamed.
      assert.equal(html(render('v.n')).replaceAll('v.n', 'n'), html(render('n')));
      assert.notEqual(html(render('v.missing')).replaceAll('v.missing', 'n'), html(render('n')), 'the field reaches the output');
    });
  }
  it('per-series data overrides the chart data', () => {
    const own = html(h(Chart, { data: [], series: [{ data: months, xField: 'm', yField: 'v.n', name: 'S' }] }));
    assert.match(own, /data-series="S"/);
    assert.match(own, /<td>5(\.00)?<\/td>/);
  });
});

describe('empty state', () => {
  it('Chart, StockChart and PieChart show the localized no-data text or renderEmpty', () => {
    assert.match(html(h(Chart, { data: [], series: [{ xField: 'm', yField: 'n' }], text: { noData: 'Nichts' } })), />Nichts</);
    assert.match(html(h(Chart, { data: [], series: [{ xField: 'm', yField: 'n' }], renderEmpty: () => h('b', null, 'Soon') })), /<b>Soon<\/b>/);
    assert.match(html(h(StockChart, { data: [], xField: 'd', closeField: 'n', toolbar: false, renderEmpty: () => h('b', null, 'Soon') })), /<b>Soon<\/b>/);
    const pie = html(h(PieChart, { data: [], valueField: 'n', labelField: 'm', renderEmpty: () => h('b', null, 'Soon') }));
    assert.match(pie, /<b>Soon<\/b>/);
  });
});
