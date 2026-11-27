import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Gauge, GaugeAxis, GaugePointer } from '@salmonui/charts/gauge';
import { GeoMap, GeoMapLayer, type GeoFeatureCollection } from '@salmonui/charts/geo-map';
import { HeatMap } from '@salmonui/charts/heat-map';
import { FunnelChart, PieChart } from '@salmonui/charts/pie-chart';
import { RangeSelector } from '@salmonui/charts/range-selector';
import { SankeyChart } from '@salmonui/charts/sankey-chart';
import { Sparkline } from '@salmonui/charts/sparkline';
import { sparklineCanvas } from '@salmonui/charts/sparkline/canvas';
import { TreeMap } from '@salmonui/charts/tree-map';
import { dataColorsOf } from '../dist/internal/data-colors.js';

// Data Visualization cross-family behavior for every family except Chart:
// server markup.

const render = (el: Parameters<typeof renderToString>[0]): string => renderToString(el);

const REGIONS: GeoFeatureCollection = {
  type: 'FeatureCollection',
  features: ['West', 'East'].map((name, i) => ({ type: 'Feature', properties: { name }, geometry: { type: 'Polygon', coordinates: [[[i * 10, 50], [i * 10 + 10, 50], [i * 10 + 10, 40], [i * 10, 40], [i * 10, 50]]] } })),
};
const sales = [
  { region: 'North', sales: 42 },
  { region: 'South', sales: 28 },
];

describe('JSX children compile to the same model as the arrays', () => {
  it('Gauge: GaugeAxis and GaugePointer children render the markup of axes and pointers', () => {
    const axes = [{ min: 0, max: 200, ranges: [{ from: 0, to: 120, color: '#15803d', label: 'Normal' }] }, { min: 0, max: 10, radius: 0.6 }];
    const pointers = [{ value: 72, label: 'Speed' }, { value: 4, axis: 1, type: 'marker' as const, label: 'Gear', draggable: true }];
    const props = { title: 'Speed', width: 240, height: 240, legend: true };
    const arrays = render(createElement(Gauge, { ...props, axes, pointers }));
    const jsx = render(
      createElement(
        Gauge,
        props,
        createElement(GaugeAxis, axes[0]),
        createElement(GaugeAxis, axes[1]),
        // Arrays of children flatten (as for ChartSeries); text children are ignored.
        [createElement(GaugePointer, { key: 'a', ...pointers[0] }), createElement(GaugePointer, { key: 'b', ...pointers[1] })],
        'ignored',
      ),
    );
    assert.equal(jsx, arrays);
    assert.match(jsx, /role="meter"[^>]*aria-label="Speed"/);
    assert.match(jsx, /role="slider"[^>]*aria-label="Gear"/);
    // The `axes` / `pointers` props win over children.
    assert.equal(render(createElement(Gauge, { ...props, axes, pointers }, createElement(GaugePointer, { value: 1 }))), arrays);
  });

  it('GeoMap: GeoMapLayer children render the markup of layers, ids and order included', () => {
    const layers = [
      { id: 'base', shapes: REGIONS, color: '#1d4ed8' },
      { id: 'pins', kind: 'overlay' as const, markers: { data: [{ name: 'A', latitude: 45, longitude: 5 }], labelField: 'name' } },
    ];
    const props = { title: 'Regions', width: 400, height: 300 };
    const arrays = render(createElement(GeoMap, { ...props, layers }));
    const jsx = render(createElement(GeoMap, props, createElement(GeoMapLayer, layers[0]), createElement(GeoMapLayer, layers[1])));
    assert.equal(jsx, arrays);
    assert.match(jsx, /salmon-geo-map-shape/);
    assert.match(jsx, /salmon-geo-map-marker/);
  });
});

describe('no transition state in server markup', () => {
  it('no family renders data-animate on the server (set after hydration only)', () => {
    const html = [
      render(createElement(PieChart, { data: sales, valueField: 'sales', labelField: 'region', height: 200 })),
      render(createElement(FunnelChart, { data: sales, valueField: 'sales', labelField: 'region', height: 200 })),
      render(createElement(HeatMap, { data: [[1, 2], [3, 4]], height: 200 })),
      render(createElement(TreeMap, { data: sales, weightField: 'sales', leaves: { labelField: 'region' }, height: 200 })),
      render(createElement(SankeyChart, { nodes: [{ id: 'a' }, { id: 'b' }], links: [{ source: 'a', target: 'b', value: 1 }], height: 200 })),
      render(createElement(GeoMap, { layers: [{ shapes: REGIONS }] })),
      render(createElement(RangeSelector, { data: [{ x: 0, y: 1 }, { x: 1, y: 2 }], xField: 'x', yField: 'y' })),
      render(createElement(Sparkline, { data: [1, 3, 2] })),
    ];
    for (const h of html) assert.doesNotMatch(h, /data-animate/);
    // The marks group the transition keys on is in the server markup, so hydration matches.
    assert.match(html[7]!, /<g class="salmon-sparkline-marks">/);
  });
});

describe('CSS-driven size', () => {
  it('frame families: without height the surface fills the root (block-size 100%); a number fixes it', () => {
    const free = render(createElement(HeatMap, { data: [[1, 2]] }));
    assert.match(free, /class="salmon-viz-surface" style="block-size:100%"/);
    const fixed = render(createElement(HeatMap, { data: [[1, 2]], width: 320, height: 180 }));
    assert.match(fixed, /class="salmon-viz-surface" style="inline-size:320px;max-inline-size:100%;block-size:180px"/);
    // RangeSelector: no inline height without the prop (CSS: 80 px, or the root height).
    assert.doesNotMatch(render(createElement(RangeSelector, { data: [{ x: 0, y: 1 }, { x: 1, y: 2 }], xField: 'x', yField: 'y' })), /salmon-range-selector-surface" style="height/);
    assert.match(render(createElement(RangeSelector, { data: [{ x: 0, y: 1 }, { x: 1, y: 2 }], xField: 'x', yField: 'y', height: 120 })), /salmon-range-selector-surface" style="height:120px"/);
  });
});

describe('Sparkline renderer', () => {
  it('canvas: an empty canvas in the server markup instead of the marks; labels and bands stay SVG; svg by default', () => {
    const data = [3, 1, 4, 1, 5];
    const svg = render(createElement(Sparkline, { data, labels: 'all' }));
    assert.match(svg, /salmon-sparkline-line/);
    assert.doesNotMatch(svg, /<canvas/);
    const canvas = render(createElement(Sparkline, { data, labels: 'all', bands: [{ from: 2, to: 3 }], renderer: 'canvas', canvasRenderer: sparklineCanvas }));
    assert.match(canvas, /<foreignObject width="100" height="24"><canvas aria-hidden="true" style="display:block;width:100%;height:100%"><\/canvas><\/foreignObject>/);
    assert.doesNotMatch(canvas, /salmon-sparkline-line/);
    assert.match(canvas, /salmon-sparkline-label/);
    assert.match(canvas, /salmon-sparkline-band/);
    // Without the renderer the marks stay SVG; `auto` switches at 20,000 points.
    assert.match(render(createElement(Sparkline, { data, renderer: 'canvas' })), /salmon-sparkline-line/);
    assert.match(render(createElement(Sparkline, { data, renderer: 'auto', canvasRenderer: sparklineCanvas })), /salmon-sparkline-line/);
    const big = Array.from({ length: 20000 }, (_, i) => Math.sin(i / 50));
    assert.match(render(createElement(Sparkline, { data: big, renderer: 'auto', canvasRenderer: sparklineCanvas })), /<canvas/);
  });

  it('the canvas renderer draws paths, bars and markers through the 2D context', () => {
    const calls: string[] = [];
    const ctx = new Proxy({}, { get: (_t, key) => (typeof key === 'string' && !['fillStyle', 'strokeStyle', 'globalAlpha', 'lineWidth', 'lineJoin', 'lineCap'].includes(key) ? (...args: unknown[]) => calls.push(`${key}(${args.filter((a) => typeof a === 'number').join(',')})`) : undefined), set: () => true });
    const canvas = { width: 0, height: 0, getContext: () => ctx, parentNode: null, ownerDocument: { body: null } } as unknown as HTMLCanvasElement;
    (globalThis as { Path2D?: unknown }).Path2D ??= class {};
    sparklineCanvas(canvas, [createElement('rect', { x: 1, y: 2, width: 3, height: 4, style: { fill: '#123456' } }), createElement('circle', { cx: 5, cy: 6, r: 2, style: { fill: '#123456' } }), createElement('path', { d: 'M0,0L1,1', className: 'salmon-sparkline-line', style: { stroke: '#123456' } })], 100, 24);
    assert.deepEqual([canvas.width, canvas.height], [100, 24]);
    assert.ok(calls.includes('fillRect(1,2,3,4)'));
    assert.ok(calls.some((c) => c.startsWith('arc(5,6,2')));
    assert.ok(calls.includes('stroke()'));
  });
});

describe('data colors', () => {
  it('collects literal colors (attributes and inline styles) but not var(--salmon-*) roles', () => {
    const el = (attrs: Record<string, string | null>, style: Record<string, string> = {}) => ({ getAttribute: (n: string) => attrs[n] ?? null, style });
    const root = { querySelectorAll: () => [el({ fill: '#ABCDEF' }), el({ stroke: 'var(--salmon-chart-1)' }, { fill: 'rgb(1, 2, 3)' }), el({}, { backgroundColor: 'var(--salmon-surface-base)' })] } as unknown as Element;
    assert.deepEqual(dataColorsOf(root), ['#abcdef', '#010203']);
  });

});
