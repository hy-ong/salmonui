import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { FunnelChart, PieChart } from '@salmonui/charts/pie-chart';

// Server rendering of PieChart and FunnelChart: final
// markup at the given size, the figure pattern, legend toolbar, labels and
// the accessible table. Interaction: tests/browser/pie-chart.spec.ts.

const data = [
  { region: 'North', sales: 40, tint: '#aa0000' },
  { region: 'South', sales: 30, tint: '#00aa00' },
  { region: 'East', sales: 20, tint: '#0000aa' },
  { region: 'West', sales: 10, tint: '#aaaa00' },
];
const base = { data, valueField: 'sales', labelField: 'region', width: 400, height: 300 } as const;
const render = (el: Parameters<typeof renderToString>[0]) => renderToString(el);
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;
const paths = (html: string) => [...html.matchAll(/<path class="salmon-viz-mark salmon-accumulation-point" d="([^"]+)"/g)].map((m) => m[1] as string);

describe('PieChart server render', () => {
  it('renders a labelled figure with one slice per point, a legend toolbar and a table', () => {
    const html = render(h(PieChart, { ...base, title: 'Sales by region' }));
    assert.match(html, /^<figure class="salmon-viz salmon-pie-chart" aria-labelledby="[^"]+-title" aria-describedby="[^"]+-summary">/);
    assert.equal(paths(html).length, 4);
    assert.match(html, /<p id="[^"]+-summary" class="salmon-visually-hidden">Pie chart, 4 slices\. North: 40, 40%; South: 30, 30%; East: 20, 20%; West: 10, 10%\.<\/p>/);
    assert.match(html, /<div class="salmon-viz-plot" style="inset:0" tabindex="0" role="group" aria-roledescription="pie chart" aria-label="Sales by region">/);
    assert.match(html, /role="toolbar" aria-label="Legend"/);
    assert.equal(count(html, /aria-pressed="true"/g), 4);
    assert.match(html, /<th scope="row">North<\/th><td>40<\/td><td>40%<\/td>/);
    assert.doesNotMatch(html, /role="tooltip"/, 'tooltips mount on the client only');
  });
  it('uses radius and center, and starts the first slice at 12 o’clock', () => {
    const html = render(h(PieChart, { ...base, legend: false, labels: false, radius: 100, center: { x: '50%', y: '50%' } }));
    // Plot is 8..392 x 8..292: center 200,150.
    assert.match(paths(html)[0]!, /^M200,50A100,100 0 0 1 /);
  });
  it('draws a doughnut with a center label', () => {
    const html = render(h(PieChart, { ...base, innerRadius: '50%', radius: 100, legend: false, labels: false, centerLabel: ({ total }) => `Total ${total}` }));
    assert.match(paths(html)[0]!, /L200,100A50,50 0 0 0 200,100|L[\d.]+,[\d.]+A50,50 0 0 0 200,100Z/);
    assert.match(html, /<div class="salmon-pie-chart-center" style="left:50%;top:50%" aria-hidden="true">Total 100<\/div>/);
    assert.match(html, /Doughnut chart, 4 slices/);
  });
  it('honours start and end angles and the pad angle', () => {
    const semi = paths(render(h(PieChart, { ...base, legend: false, labels: false, radius: 100, startAngle: -90, endAngle: 90 })));
    assert.match(semi[0]!, /^M100,150A/, 'starts at 9 o’clock');
    assert.match(semi[3]!, /A100,100 0 0 1 300,150L200,150Z$/, 'ends at 3 o’clock');
    const padded = paths(render(h(PieChart, { ...base, legend: false, labels: false, radius: 100, padAngle: 10 })));
    assert.notEqual(padded[0]!.split('A')[1]!.split(' ').pop(), padded[1]!.slice(1).split('A')[0], 'a gap between slices');
  });
  it('explodes points by index or all', () => {
    const html = render(h(PieChart, { ...base, legend: false, labels: false, explode: { offset: 12 }, defaultExplodedPoints: [0] }));
    assert.equal(count(html, /transform="translate\(/g), 1);
    assert.equal(count(render(h(PieChart, { ...base, legend: false, labels: false, explode: { all: true } })), /transform="translate\(/g), 4);
  });
  it('groups small slices into "Others"', () => {
    const html = render(h(PieChart, { ...base, legend: false, labels: false, groupSmall: { threshold: 25, label: 'Rest' } }));
    assert.equal(paths(html).length, 3);
    assert.match(html, /<th scope="row">Rest<\/th><td>30<\/td>/);
  });
  it('places inside and outside labels with connectors', () => {
    const outside = render(h(PieChart, { ...base, legend: false, labels: { position: 'outside', connector: 'curve' } }));
    assert.equal(count(outside, /class="salmon-accumulation-connector" d="M[\d.]+,[\d.]+Q/g), 4);
    const inside = render(h(PieChart, { ...base, legend: false, labels: { position: 'inside' } }));
    assert.equal(count(inside, /salmon-accumulation-label-inside/g), 4);
    assert.match(render(h(PieChart, { ...base, legend: false, formatLabel: (p) => `${p.label} ${Math.round(p.fraction * 100)}%` })), />North 40%<\/text>/);
  });
  it('treats empty points by drop, zero or average', () => {
    const holes = [{ v: 10 }, { v: null }, { v: 30 }];
    assert.equal(paths(render(h(PieChart, { data: holes, valueField: 'v', width: 300, height: 200, legend: false, labels: false }))).length, 2);
    assert.match(render(h(PieChart, { data: holes, valueField: 'v', width: 300, height: 200, legend: false, labels: false, emptyPoints: 'average' })), /<th scope="row">2<\/th><td>20<\/td>/);
    assert.match(render(h(PieChart, { data: [], width: 300, height: 200 })), /class="salmon-viz-empty"[^>]*>No data<\/text>/);
  });
  it('renders concentric rings for several series', () => {
    const html = render(h(PieChart, { width: 400, height: 300, legend: false, labels: false, radius: 120, innerRadius: 40, series: [{ data, valueField: 'sales', labelField: 'region', name: '2025' }, { data: data.map((d) => ({ ...d, sales: d.sales * 2 })), valueField: 'sales', labelField: 'region', name: '2026' }] }));
    assert.equal(count(html, /data-series="0"/g), 4);
    assert.equal(count(html, /data-series="1"/g), 4);
    assert.match(html, /<th scope="col">Series<\/th>/);
    assert.match(html, /<th scope="row">North<\/th><td>2026<\/td><td>80<\/td>/);
  });
  it('maps colors from a field, a palette and getPointStyle', () => {
    assert.match(render(h(PieChart, { ...base, colorField: 'tint' })), /style="fill:#aa0000"/);
    assert.match(render(h(PieChart, { ...base, palette: ['#123456'] })), /style="fill:#123456"/);
    assert.match(render(h(PieChart, { ...base, getPointStyle: (p) => (p.index === 3 ? { color: '#fedcba' } : undefined) })), /style="fill:#fedcba"/);
  });
  it('hides points from the hiddenPoints triad and shows them as unpressed legend buttons', () => {
    const html = render(h(PieChart, { ...base, hiddenPoints: [1] }));
    assert.equal(paths(html).length, 3);
    assert.equal(count(html, /aria-pressed="false"/g), 1);
  });
  it('renders the small pie without legend, labels or title ( equivalent)', () => {
    const html = render(h(PieChart, { data: [3, 1], size: 'small', width: 40, height: 40, title: 'x' }));
    assert.match(html, /data-size="small"/);
    assert.doesNotMatch(html, /role="toolbar"|salmon-accumulation-label|salmon-viz-title/);
  });
  it('overlays one system fill pattern per slot with `patterns`', () => {
    const html = render(h(PieChart, { ...base, patterns: true }));
    assert.equal(count(html, /<pattern id="[^"]+-pat\d"/g), 6);
    assert.equal(count(html, /class="salmon-accumulation-pattern" d="/g), 4);
    assert.match(html, /fill="url\(#[^)]+-pat3\)"/);
  });
  it('renders annotations as positioned overlays', () => {
    assert.match(render(h(PieChart, { ...base, annotations: [{ x: '50%', y: 30, content: 'Peak' }] })), /<div class="salmon-viz-annotation" style="left:50%;top:10%">Peak<\/div>/);
  });
});

describe('FunnelChart server render', () => {
  it('stacks funnel segments top down with inside labels', () => {
    const html = render(h(FunnelChart, { ...base, legend: false, neckWidth: '25%', neckHeight: 40, gap: 4 }));
    const segs = paths(html);
    assert.equal(segs.length, 4);
    assert.match(segs[0]!, /^M8,8L392,8L/);
    assert.match(html, /aria-roledescription="funnel chart"/);
    assert.ok(count(html, /salmon-accumulation-label-inside/g) >= 2);
  });
  it('draws the trapezoidal funnel variant with connectors, labels and table', () => {
    const std = render(h(FunnelChart, { ...base, legend: false }));
    assert.doesNotMatch(std, /salmon-funnel-chart-connector/, 'standard is the default');
    const html = render(h(FunnelChart, { ...base, legend: false, variant: 'trapezoidal', neckWidth: '25%' }));
    const segs = paths(html);
    assert.equal(segs.length, 4);
    for (const d of segs) assert.match(d, /^M[\d.]+,[\d.]+(L[\d.]+,[\d.]+){3}Z$/, 'four-corner bars');
    assert.match(segs[0]!, /^M8,8L392,8L/, 'the largest value spans the width');
    assert.equal(count(html, /class="salmon-funnel-chart-connector"/g), 3);
    assert.match(html, /Funnel chart, 4 segments/);
    assert.match(html, /<th scope="row">North<\/th><td>40<\/td><td>40%<\/td>/, 'accessible table unchanged');
    assert.equal(render(h(FunnelChart, { ...base, legend: false, variant: 'trapezoidal', neckWidth: '25%' })), html, 'deterministic markup');
  });
  it('draws a pyramid in linear and area mode with outside labels', () => {
    const lin = paths(render(h(FunnelChart, { ...base, shape: 'pyramid', legend: false, gap: 0 })));
    assert.match(lin[0]!, /^M200,8L200,8L/, 'apex on top');
    const area = render(h(FunnelChart, { ...base, shape: 'pyramid', mode: 'area', legend: false, gap: 0, labels: { position: 'outside' } }));
    assert.notEqual(paths(area)[0], lin[0]);
    assert.equal(count(area, /class="salmon-accumulation-connector"/g), 4);
    assert.match(area, /Pyramid chart, 4 segments/);
  });
});
