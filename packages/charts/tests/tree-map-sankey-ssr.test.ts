import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { SankeyChart } from '@salmonui/charts/sankey-chart';
import { TreeMap } from '@salmonui/charts/tree-map';

// Server rendering of TreeMap and SankeyChart. Interaction: tests/browser/tree-map.spec.ts and
// tests/browser/sankey-chart.spec.ts.

const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;
const flat = [
  { g: 'A', n: 'a1', w: 6, kind: 'x', score: 1 },
  { g: 'A', n: 'a2', w: 6, kind: 'y', score: 5 },
  { g: 'B', n: 'b1', w: 4, kind: 'x', score: 3 },
  { g: 'B', n: 'b2', w: 3, kind: 'y', score: 9 },
  { g: 'C', n: 'c1', w: 1, kind: 'x', score: 2 },
];
const tree = (props: Partial<Parameters<typeof TreeMap>[0]> = {}) => renderToString(h(TreeMap, { data: flat, weightField: 'w', levels: [{ groupBy: 'g' }], leaves: { labelField: 'n' }, width: 400, height: 300, ...props }));
const rect = (html: string, path: string) => {
  const m = new RegExp(`data-path="${path}"><rect class="salmon-viz-mark" x="([\\d.]+)" y="([\\d.]+)" width="([\\d.]+)" height="([\\d.]+)"[^>]*style="([^"]+)"`).exec(html);
  return m ? { x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]), style: m[5] as string } : null;
};

describe('TreeMap server render', () => {
  it('groups flat data by levels with headers, weights and a nested list', () => {
    const html = tree({ title: 'Budget' });
    assert.equal(count(html, /class="salmon-tree-map-group"/g), 3);
    assert.equal(count(html, /class="salmon-tree-map-leaf"/g), 5);
    assert.match(html, /<text class="salmon-tree-map-header"[^>]*>A<\/text>/);
    assert.match(html, /Tree map, 3 items, total 20\. A: 12; B: 7; C: 1\./);
    assert.match(html, /<div class="salmon-visually-hidden" aria-label="Budget" role="region"><ul><li>A: 12<ul><li>a1: 6<\/li>/);
    assert.match(html, /aria-roledescription="tree map"/);
    const a = rect(html, 'A');
    const c = rect(html, 'C');
    assert.ok(a && c && a.w * a.h > c.w * c.h * 8, 'area follows weight');
  });
  it('reads hierarchical data through childrenField', () => {
    const html = renderToString(h(TreeMap, { data: [{ name: 'root', kids: [{ name: 'x', size: 2 }, { name: 'y', size: 3 }] }], childrenField: 'kids', weightField: 'size', leaves: { labelField: 'name' }, width: 300, height: 200 }));
    assert.match(html, /data-path="root\/y"/);
  });
  it('tiles squarified, slice and dice, and in four directions', () => {
    const slice = tree({ layout: 'sliceHorizontal', levels: [{ groupBy: 'g', gap: 0, header: false }], leaves: { labelField: 'n', gap: 0 } });
    const a = rect(slice, 'A');
    const b = rect(slice, 'B');
    assert.ok(a && b && a.h === b.h && b.x > a.x, 'side by side');
    const end = tree({ layout: 'sliceHorizontal', direction: 'topEnd', levels: [{ groupBy: 'g', gap: 0, header: false }], leaves: { labelField: 'n', gap: 0 } });
    assert.ok((rect(end, 'B')?.x ?? 0) < (rect(end, 'A')?.x ?? 0), 'mirrored along x');
    const bottom = tree({ layout: 'sliceVertical', direction: 'bottomStart', levels: [{ groupBy: 'g', gap: 0, header: false }], leaves: { labelField: 'n', gap: 0 } });
    assert.ok((rect(bottom, 'A')?.y ?? 0) > (rect(bottom, 'B')?.y ?? 0), 'first group at the bottom');
  });
  it('places leaf labels, handles overflow and renders HTML content', () => {
    assert.match(tree({ leaves: { labelField: 'n', labelPosition: 'center', showValue: true } }), /text-anchor="middle" dominant-baseline="central"><tspan[^>]*>a1 6<\/tspan>/);
    const hidden = tree({ width: 120, height: 90, leaves: { labelField: 'n', labelOverflow: 'hide' }, levels: [{ groupBy: 'g' }] });
    assert.ok(count(hidden, /class="salmon-tree-map-label"/g) < 5);
    assert.match(tree({ leaves: { labelField: 'n', render: (item) => h('b', null, item.label) } }), /<div class="salmon-tree-map-content"[^>]*><b>a1<\/b><\/div>/);
    assert.match(tree({ levels: [{ groupBy: 'g', header: { format: (item) => `${item.label} (${item.value})`, align: 'end' } }] }), /text-anchor="end">A \(12\)<\/text>/);
  });
  it('colors by group palette, field, range, value and opacity scales and getItemStyle', () => {
    assert.match(rect(tree({ palette: ['#111111', '#222222'] }), 'B')?.style ?? '', /fill:#222222/);
    assert.match(rect(tree({ colorScale: { kind: 'value', field: 'kind', stops: [{ value: 'y', color: '#00ff00' }] } }), 'A\\/a2')?.style ?? '', /fill:#00ff00/);
    assert.match(rect(tree({ colorScale: { kind: 'range', field: 'score', stops: [{ value: 0, color: '#000001' }, { value: 4, color: '#000004' }] } }), 'B\\/b2')?.style ?? '', /fill:#000004/);
    assert.match(rect(tree({ colorScale: { kind: 'opacity', field: 'score', stops: [{ value: 1, color: '#123456' }, { value: 9, color: '#123456' }] } }), 'A\\/a1')?.style ?? '', /fill:#123456;fill-opacity:0.3/);
    assert.match(rect(tree({ getItemStyle: (it) => (it.label === 'c1' ? { color: '#ababab' } : undefined) }), 'C\\/c1')?.style ?? '', /fill:#ababab/);
  });
  it('drills to a path with breadcrumbs and parent bands', () => {
    const html = tree({ defaultPath: ['B'], breadcrumbs: true, showParentLevels: true, rootLabel: 'Everything' });
    assert.match(html, /<nav class="salmon-tree-map-breadcrumbs" aria-label="Tree map path"[^>]*><ol><li><button type="button">Everything<\/button><\/li><li><span aria-current="location">B<\/span><\/li><\/ol><\/nav>/);
    assert.equal(count(html, /class="salmon-tree-map-leaf"/g), 2);
    assert.match(html, /<g class="salmon-tree-map-parent">/);
    assert.match(html, /Tree map of B, 2 items, total 7/);
  });
  it('marks selected items and renders the legend', () => {
    const html = tree({ selection: true, defaultSelectedItems: [['A', 'a2']], legend: { mode: 'interactive' } });
    assert.match(html, /data-selected="" data-path="A\/a2"/);
    assert.match(html, /role="toolbar" aria-label="Legend"/);
    assert.equal(count(html, /class="salmon-viz-legend-button"/g), 3);
  });
});

const nodes = [{ id: 'coal', label: 'Coal' }, { id: 'gas', label: 'Gas', color: '#00aa00' }, { id: 'power', label: 'Power' }, { id: 'homes', label: 'Homes' }];
const links = [
  { source: 'coal', target: 'power', value: 5 },
  { source: 'gas', target: 'power', value: 3 },
  { source: 'power', target: 'homes', value: 8 },
];
const sankey = (props: Partial<Parameters<typeof SankeyChart>[0]> = {}) => renderToString(h(SankeyChart, { nodes, links, width: 500, height: 300, ...props }));

describe('SankeyChart server render', () => {
  it('renders nodes, link bands, labels, summary and a source / target / value table', () => {
    const html = sankey({ title: 'Energy' });
    assert.equal(count(html, /class="salmon-viz-mark salmon-sankey-chart-node"/g), 4);
    assert.equal(count(html, /class="salmon-viz-mark salmon-sankey-chart-link" d="M[^"]+C/g), 3);
    assert.match(html, /Sankey chart, 4 nodes, 3 flows, 3 columns\./);
    assert.match(html, /<th scope="row">Power<\/th><td>Homes<\/td><td>8<\/td>/);
    assert.equal(count(html, /class="salmon-sankey-chart-label"/g), 4);
    assert.doesNotMatch(sankey({ labels: false }), /salmon-sankey-chart-label/);
    assert.match(sankey({ labels: { position: 'inside' } }), /text-anchor="middle" dominant-baseline="central" class="salmon-sankey-chart-label"/);
  });
  it('lays out vertically, with node width, padding and offset', () => {
    const v = sankey({ orientation: 'vertical', nodeWidth: 20 });
    assert.match(v, /data-orientation="vertical"/);
    const node = /data-id="homes"/.test(v) ? /<rect class="salmon-viz-mark salmon-sankey-chart-node" x="[\d.]+" y="([\d.]+)" width="[\d.]+" height="([\d.]+)"[^>]*data-id="homes"/.exec(v) : null;
    assert.equal(node?.[2], '20', 'node thickness along y');
    const shifted = sankey({ nodes: nodes.map((n) => (n.id === 'homes' ? { ...n, offset: -10 } : n)) });
    const y = (html: string) => Number(/<rect class="salmon-viz-mark salmon-sankey-chart-node" x="[\d.]+" y="(-?[\d.]+)"[^>]*data-id="homes"/.exec(html)?.[1]);
    assert.equal(y(sankey()) - y(shifted), 10);
  });
  it('colors nodes and links by source, target or gradient', () => {
    assert.match(sankey(), /style="fill:#00aa00" data-id="gas"/);
    assert.match(sankey(), /style="stroke:#00aa00;stroke-width:[\d.]+" data-source="gas"/);
    assert.match(sankey({ linkColor: 'target' }), /style="stroke:var\(--salmon-chart-3\);stroke-width:[\d.]+" data-source="gas"/);
    const g = sankey({ linkColor: 'gradient' });
    assert.equal(count(g, /<linearGradient /g), 3);
    assert.match(g, /stroke:url\(#[^)]+-g0\)/);
    const styled = sankey({ getNodeStyle: (n) => (n.id === 'coal' ? { color: '#333333' } : undefined), getLinkStyle: (l) => (l.value === 8 ? { color: '#444444', opacity: 0.9 } : undefined), formatLabel: (n) => `${n.label} ${n.value}` });
    assert.match(styled, /fill:#333333/);
    assert.match(styled, /stroke:#444444;stroke-width:[\d.]+;stroke-opacity:0.9/);
    assert.match(styled, />Power 8<\/text>/);
  });
  it('adjusts curvature and renders the node legend', () => {
    const straight = sankey({ curvature: 0 });
    assert.match(straight, /d="M([\d.]+),([\d.]+)C\1,\2 /);
    const legend = sankey({ legend: true });
    assert.match(legend, /role="toolbar"/);
    assert.equal(count(legend, /class="salmon-viz-legend-button"/g), 4);
  });
});
