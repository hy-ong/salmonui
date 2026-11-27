// Data Visualization cross-family rows (tests/browser/viz-cross.spec.ts)
// for every family except Chart: one instance of each.
//
//   ?dir=rtl     renders everything inside dir="rtl"
//   ?size=css    frame families and RangeSelector without `height`: CSS sets
//                the root height (300 px) or `aspect-ratio`; `onResize` logs
//   ?static      `animated={false}` everywhere
//   ?lowcolor    a low-contrast data color (#f5f5f5) on every family
//
// window.__vizCrossEvents records the callbacks; window.__vizCrossWarnings the
// development warnings.
import { StrictMode, type CSSProperties, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@salmonui/core/styles.css';
import '@salmonui/buttons/button/styles.css';
import '@salmonui/charts/gauge/styles.css';
import '@salmonui/charts/geo-map/styles.css';
import '@salmonui/charts/heat-map/styles.css';
import '@salmonui/charts/pie-chart/styles.css';
import '@salmonui/charts/range-selector/styles.css';
import '@salmonui/charts/sankey-chart/styles.css';
import '@salmonui/charts/sparkline/styles.css';
import '@salmonui/charts/tree-map/styles.css';
import '@salmonui/charts/viz-animations.css';
import '@salmonui/charts/viz-rtl.css';
import './app.css';
import { Gauge, GaugeAxis, GaugePointer } from '@salmonui/charts/gauge';
import { GeoMap, GeoMapLayer } from '@salmonui/charts/geo-map';
import { HeatMap } from '@salmonui/charts/heat-map';
import { FunnelChart, PieChart } from '@salmonui/charts/pie-chart';
import { RangeSelector } from '@salmonui/charts/range-selector';
import { SankeyChart } from '@salmonui/charts/sankey-chart';
import { Sparkline } from '@salmonui/charts/sparkline';
import { sparklineCanvas } from '@salmonui/charts/sparkline/canvas';
import { TreeMap } from '@salmonui/charts/tree-map';
import { POPULATION, REGIONS } from './geo-fixture.ts';

declare global {
  interface Window {
    __mountMs?: number;
    __vizCrossEvents: { type: string; value: unknown }[];
    __vizCrossWarnings: string[];
  }
}
window.__vizCrossEvents = [];
window.__vizCrossWarnings = [];
const warn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  window.__vizCrossWarnings.push(args.map(String).join(' '));
  warn(...args);
};
const log = (type: string, value: unknown) => window.__vizCrossEvents.push({ type, value });

const params = new URLSearchParams(location.search);
const css = params.has('size');
const animated = !params.has('static');
const low = params.has('lowcolor') ? '#f5f5f5' : undefined;

const sales = [
  { region: 'North', sales: 42 },
  { region: 'South', sales: 28 },
  { region: 'East', sales: 18 },
  { region: 'West', sales: 12 },
];
const heat = [
  [1, 4, 7, 2],
  [5, 3, 9, 6],
  [8, 2, 4, 1],
];
const budget = [
  { dept: 'Engineering', team: 'Platform', cost: 40 },
  { dept: 'Engineering', team: 'Apps', cost: 30 },
  { dept: 'Sales', team: 'EMEA', cost: 25 },
  { dept: 'Support', team: 'Tier 1', cost: 12 },
];
const energy = {
  nodes: [{ id: 'coal', label: 'Coal' }, { id: 'solar', label: 'Solar' }, { id: 'grid', label: 'Grid' }, { id: 'homes', label: 'Homes' }],
  links: [
    { source: 'coal', target: 'grid', value: 30 },
    { source: 'solar', target: 'grid', value: 15 },
    { source: 'grid', target: 'homes', value: 45 },
  ],
};
const daily = Array.from({ length: 60 }, (_, i) => ({ d: Date.UTC(2026, 0, 1 + i), c: 50 + 20 * Math.sin(i / 6) }));
const spark = Array.from({ length: 24 }, (_, i) => Math.round(50 + 30 * Math.sin(i / 3)));

/** Frame families: a fixed height, or (`?size=css`) the root height or aspect ratio from CSS. */
const frame = (id: string, ratio = false): { height?: number; style?: CSSProperties; onResize: (size: unknown) => void } =>
  css ? { style: ratio ? { aspectRatio: '2 / 1' } : { height: 300 }, onResize: (size) => log(`resize:${id}`, size) } : { height: 260, onResize: (size) => log(`resize:${id}`, size) };

function Page(): ReactNode {
  return (
    <main data-salmon-a11y-root="" dir={params.get('dir') === 'rtl' ? 'rtl' : undefined} style={{ padding: 16, display: 'grid', gap: 16, maxWidth: 720 }}>
      <PieChart id="pie" title="Sales by region" data={sales} valueField="sales" labelField="region" palette={low ? [low, '#2563eb'] : undefined} animated={animated} {...frame('pie')} />
      <FunnelChart id="funnel" title="Conversion" data={sales} valueField="sales" labelField="region" animated={animated} {...frame('funnel', true)} />
      <HeatMap id="heat" title="Load" data={heat} animated={animated} colorScale={low ? { kind: 'gradient', stops: [{ value: 0, color: low }, { value: 9, color: '#1d4ed8' }] } : undefined} {...frame('heat')} />
      <TreeMap id="tree" title="Budget" data={budget} weightField="cost" levels={[{ groupBy: 'dept' }]} leaves={{ labelField: 'team' }} legend animated={animated} {...frame('tree')} />
      <SankeyChart id="sankey" title="Energy flow" nodes={energy.nodes} links={energy.links} legend animated={animated} {...frame('sankey')} />
      <GeoMap id="geo" title="Population" width={480} height={300} animated={animated} legend>
        <GeoMapLayer shapes={REGIONS} data={POPULATION} dataKey="region" color={low} colorScale={low ? undefined : { kind: 'range', field: 'population', stops: [{ from: 0, to: 20, color: '#3b82f6', label: 'Low' }, { from: 20, to: 100, color: '#1d4ed8', label: 'High' }] }} />
      </GeoMap>
      <div id="range-wrap">
        <RangeSelector data={daily} xField="d" yField="c" animated={animated} aria-label="Window" {...(css ? { style: { height: 120 }, onResize: (size: unknown) => log('resize:range', size) } : {})} />
      </div>
      <Gauge id="gauge" title="Speed" width={200} height={240} legend>
        <GaugeAxis min={0} max={100} ranges={[{ from: 0, to: 60, color: low ?? '#16a34a', label: 'Normal' }, { from: 60, to: 100, color: '#dc2626', label: 'High' }]} />
        <GaugePointer value={72} label="Speed" />
      </Gauge>
      <p>
        Sparkline <Sparkline id="spark" data={spark} color={low} animated={animated} />
        Canvas <Sparkline id="spark-canvas" data={spark} type="area" renderer="canvas" canvasRenderer={sparklineCanvas} animated={animated} />
      </p>
    </main>
  );
}

const t0 = performance.now();
createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
requestAnimationFrame(() => setTimeout(() => (window.__mountMs = performance.now() - t0), 0));
