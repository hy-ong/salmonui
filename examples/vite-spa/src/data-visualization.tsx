// Data Visualization browser page (tests/browser/data-visualization.spec.ts):
// Chart interaction, legend, keyboard, zoom, sync groups, canvas, export,
// RangeSelector, PeriodSelector and StockChart.
//
//   ?scheme=light|dark   theme color scheme (default light)
//   ?dir=rtl             renders everything inside dir="rtl"
//   ?hydrate             renders the page to a string first and hydrates it
//
// window.__vizEvents records every callback as a plain object;
// window.__chartApi / __canvasApi expose the instance APIs.
import { StrictMode, useState, type ReactNode, type SyntheticEvent } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/core/styles.css';
import '@salmonui/buttons/menu/styles.css';
import '@salmonui/calendars/date-range-picker/styles.css';
import '@salmonui/charts/barcode/styles.css';
import '@salmonui/charts/chart/styles.css';
import '@salmonui/charts/gauge/styles.css';
import '@salmonui/charts/geo-map/styles.css';
import '@salmonui/charts/heat-map/styles.css';
import '@salmonui/charts/pie-chart/styles.css';
import '@salmonui/charts/range-selector/styles.css';
import '@salmonui/charts/sankey-chart/styles.css';
import '@salmonui/charts/sparkline/styles.css';
import '@salmonui/charts/stock-chart/styles.css';
import '@salmonui/charts/tree-map/styles.css';
import '@salmonui/charts/viz-animations.css';
import '@salmonui/charts/viz-rtl.css';
import '@salmonui/navigation/toolbar/styles.css';
import './app.css';
import { Chart, ChartSyncGroup, type ChartApi, type ChartExportWriters, type ChartZoomRange } from '@salmonui/charts/chart';
import { BulletChart } from '@salmonui/charts/chart/bullet';
import { polar } from '@salmonui/charts/chart/features';
import { exportVisualizations } from '@salmonui/charts/chart/export';
import { PeriodSelector, RangeSelector, type RangeValue } from '@salmonui/charts/range-selector';
import { StockChart } from '@salmonui/charts/stock-chart';
import { PieChart, FunnelChart } from '@salmonui/charts/pie-chart';
import { Gauge } from '@salmonui/charts/gauge';
import { Sparkline } from '@salmonui/charts/sparkline';
import { HeatMap } from '@salmonui/charts/heat-map';
import { TreeMap } from '@salmonui/charts/tree-map';
import { SankeyChart } from '@salmonui/charts/sankey-chart';
import { GeoMap } from '@salmonui/charts/geo-map';
import { Barcode, QRCode } from '@salmonui/charts/barcode';
import { ThemeProvider } from '@salmonui/core/theme';

declare global {
  interface Window {
    __vizEvents?: Record<string, unknown>[];
    __chartApi?: ChartApi | null;
    __canvasApi?: ChartApi | null;
    __stockApi?: ChartApi | null;
    __vizApis?: Record<string, unknown>;
    __exportVisualizations?: typeof exportVisualizations;
    __vizWriters?: ChartExportWriters;
  }
}

const params = new URLSearchParams(location.search);
const scheme = params.get('scheme') === 'dark' ? 'dark' : 'light';
const dir = params.get('dir') === 'rtl' ? 'rtl' : 'ltr';
window.__vizEvents = [];
window.__vizApis = {};
// The combined export and the writer loaders for the export tests.
window.__exportVisualizations = exportVisualizations;
window.__vizWriters = { pdf: () => import('@salmonui/export/graphics'), xlsx: () => import('@salmonui/export/xlsx') };
// Collects every family's instance for the shared export and print tests.
const keep = (name: string) => (api: unknown) => {
  if (window.__vizApis) window.__vizApis[name] = api;
};
const square = (name: string, x: number) => ({ type: 'Feature' as const, properties: { name }, geometry: { type: 'Polygon' as const, coordinates: [[[x, 0], [x + 10, 0], [x + 10, 10], [x, 10], [x, 0]]] } });
const log = (entry: Record<string, unknown>) => window.__vizEvents?.push(entry);

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const sales = months.map((month, i) => ({ month, north: [12, 15, 9, 20, 18, 25][i], south: [8, 6, 11, 9, 14, 10][i] }));
const line = Array.from({ length: 200 }, (_, i) => ({ x: i, y: Math.round(50 + 30 * Math.sin(i / 15)) }));
const wind = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].map((d, i) => ({ d, a: [3, 5, 2, 6, 4, 7, 1, 3][i], b: [2, 1, 3, 2, 2, 1, 4, 2][i] }));
const DAY = 86_400_000;
const T0 = Date.UTC(2024, 0, 1);
const daily = Array.from({ length: 366 }, (_, i) => {
  const c = Math.round((100 + 10 * Math.sin(i / 9) + i * 0.05) * 100) / 100;
  return { d: new Date(T0 + i * DAY).toISOString().slice(0, 10), o: c - 1, h: c + 2, l: c - 2, c, v: 1000 + i };
});
const periods = [
  { id: '1m', unit: 'month' as const, count: 1, label: '1M' },
  { id: '3m', unit: 'month' as const, count: 3, label: '3M' },
  { id: 'all', unit: 'all' as const, label: 'All' },
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} style={{ marginBlock: 24, maxInlineSize: 720 }}>
      <h2 style={{ fontSize: 16 }}>{title}</h2>
      {children}
    </section>
  );
}

function ZoomDemo() {
  const [zoom, setZoom] = useState<ChartZoomRange>({});
  return (
    <>
      <Chart
        title="Zoomable"
        data={line}
        series={[{ xField: 'x', yField: 'y', name: 'Signal' }]}
        zoom
        zoomRange={zoom}
        onVisibleRangeChange={(change) => log({ kind: 'visible', axis: change.axisId, range: change.range.map(Math.round) })}
        onZoomRangeChange={(range, event) => {
          log({ kind: 'zoom', reason: event.reason, source: event.source, x: range.x ? [Math.round(range.x[0]), Math.round(range.x[1])] : null });
          setZoom(range);
        }}
      />
      <output id="zoom-state">{zoom.x ? `${Math.round(zoom.x[0])}-${Math.round(zoom.x[1])}` : 'none'}</output>
    </>
  );
}

function EditDemo() {
  const [rows, setRows] = useState(sales);
  return (
    <Chart
      title="Editable"
      data={rows}
      tooltip
      highlight="point"
      series={[{ type: 'line', xField: 'month', yField: 'north', name: 'North', markers: true, editable: { min: 0, max: 40, step: 1 } }]}
      onPointChange={(change, e) => {
        log({ kind: 'point-change', index: change.index, value: Math.round(change.value), source: e.source, reason: e.reason });
        setRows((r) => r.map((d, i) => (i === change.index ? { ...d, north: Math.round(change.value) } : d)));
      }}
    />
  );
}

function SelectDemo({ mode }: { mode: 'range' | 'lasso' | 'cluster' }) {
  return (
    <Chart
      title={`Select ${mode}`}
      data={line.slice(0, 40)}
      selection={{ mode, axis: 'x' }}
      highlight={mode === 'cluster' ? 'cluster' : undefined}
      onRangeSelect={(sel, e) => log({ kind: 'range-select', mode, reason: e.reason, points: sel.points.length, x: sel.ranges['x'] ? sel.ranges['x'].map(Math.round) : null })}
      onSelectedPointsChange={(points, e) => log({ kind: 'select', mode, points: points.map((p) => `${p.seriesId}:${p.index}`), reason: e.reason })}
      series={mode === 'cluster' ? [{ type: 'column', xField: 'x', yField: 'y', name: 'A' }, { type: 'column', xField: 'x', yField: 'y', name: 'B' }] : [{ type: 'scatter', xField: 'x', yField: 'y', name: 'Points' }]}
    />
  );
}

function RangeDemo() {
  const [range, setRange] = useState<RangeValue>([Date.UTC(2024, 2, 1), Date.UTC(2024, 5, 1)]);
  return (
    <>
      <Chart title="Linked" data={daily} xAxis={{ scale: 'time' }} zoomRange={{ x: range }} series={[{ xField: 'd', yField: 'c', name: 'Close' }]} height={200} />
      <form id="range-form">
        <RangeSelector
          data={daily}
          xField="d"
          yField="c"
          name="window"
          value={range}
          onValueChange={(v, e) => log({ kind: 'range-change', reason: e.reason, source: e.source })}
          onValueCommit={(v, e) => {
            log({ kind: 'range-commit', reason: e.reason, source: e.source, value: [new Date(v[0]).toISOString().slice(0, 10), new Date(v[1]).toISOString().slice(0, 10)] });
            setRange(v);
          }}
          periods={periods}
          aria-label="Visible dates"
        />
      </form>
      <output id="range-state">{`${new Date(range[0]).toISOString().slice(0, 10)}..${new Date(range[1]).toISOString().slice(0, 10)}`}</output>
    </>
  );
}

// a StockChart with a reactive `data` array and a ref (`?live`).
const liveRow = (day: number, c: number) => ({ d: new Date(T0 + day * DAY).toISOString().slice(0, 10), o: c - 1, h: c + 2, l: c - 2, c, v: 1000 });
function StockLive() {
  const [data, setData] = useState(() => [101, 102, 103, 104, 105].map((c, i) => liveRow(i, c)));
  return (
    <Section id="stock-live" title="Stock chart live data">
      <button type="button" id="stock-live-set" onClick={() => setData((d) => [...d, liveRow(d.length, 150)])}>Add a row</button>
      <StockChart ref={(api) => { window.__stockApi = api; }} title="Live" data={data} xField="d" openField="o" highField="h" lowField="l" closeField="c" toolbar={false} navigator={false} periodSelector={false} height={220} />
    </Section>
  );
}

// period triad and forwarded Chart props (`?stock-props`).
const OHLC = { xField: 'd', openField: 'o', highField: 'h', lowField: 'l', closeField: 'c', toolbar: false, navigator: false } as const;
const day = (t: number) => new Date(t).toISOString().slice(0, 10);
function StockProps() {
  const [period, setPeriod] = useState<string | null>('3m');
  return (
    <Section id="stock-props" title="Stock chart props">
      <div id="stock-default"><StockChart ref={keep('StockDefault')} {...OHLC} title="Default period" data={daily} defaultPeriod="3m" height={180} onPeriodChange={(id, e) => log({ kind: 'stock-period', id, reason: e.reason })} onRangeChange={(r, e) => log({ kind: 'stock-period-range', reason: e.reason, range: [day(r[0]), day(r[1])] })} /></div>
      <div id="stock-controlled"><output id="stock-controlled-state">{period ?? 'none'}</output><StockChart {...OHLC} title="Controlled period" data={daily} period={period} height={180} onPeriodChange={(id) => setPeriod(id)} /></div>
      <div id="stock-veto"><StockChart {...OHLC} title="Vetoed period" data={daily} period="3m" height={180} onPeriodChange={(id) => log({ kind: 'stock-veto', id })} /></div>
      <div id="stock-tools"><StockChart {...OHLC} periodSelector={false} title="Tools" data={daily.slice(0, 30)} height={220} defaultIndicators={['sma']} crosshair={{ snap: true, lines: 'both' }} tooltip={{ mode: 'shared' }} selection={{ mode: 'point' }} legend annotations={[{ x: daily[10]?.d as string, y: daily[10]?.h as number, content: <span id="stock-note">Note</span> }]} onSelectedPointsChange={(points) => log({ kind: 'stock-selected', points })} /></div>
      <div id="stock-panes"><StockChart {...OHLC} periodSelector={false} title="Panes" data={daily.slice(0, 60)} height={320} defaultIndicators={['rsi']} panes={{ rows: ['60%', '40%'] }} axes={[{ id: 'indicator', direction: 'y', pane: { row: 1 } }]} /></div>
      <div id="stock-transposed"><StockChart {...OHLC} periodSelector={false} title="Transposed" data={daily.slice(0, 12)} height={320} orientation="horizontal" /></div>
    </Section>
  );
}

// one instance per family with the DOM handlers it supports (`?pointer`).
const domLog = (family: string, type: string) => (event: SyntheticEvent) => log({ kind: 'dom', family, type, root: (event.currentTarget as Element).getAttribute('class') });
const clicks = (family: string) => ({ onClick: domLog(family, 'click'), onDoubleClick: domLog(family, 'dblclick'), onContextMenu: domLog(family, 'contextmenu'), onPointerMove: domLog(family, 'move') });
const pointers = (family: string) => ({ ...clicks(family), onPointerDown: domLog(family, 'down'), onPointerUp: domLog(family, 'up'), onPointerLeave: domLog(family, 'leave') });
function PointerProbes() {
  return (
    <Section id="pointer" title="Container pointer events">
      <div id="probe-chart"><Chart title="Chart" data={sales} series={[{ type: 'column', xField: 'month', yField: 'north' }]} height={160} {...pointers('chart')} /></div>
      <div id="probe-stock"><StockChart title="Stock" data={daily.slice(0, 20)} xField="d" openField="o" highField="h" lowField="l" closeField="c" toolbar={false} navigator={false} periodSelector={false} height={160} {...pointers('stock')} /></div>
      <div id="probe-gauge"><Gauge title="Gauge" pointers={[{ value: 40 }]} height={160} {...pointers('gauge')} /></div>
      <div id="probe-tree"><TreeMap title="Tree" data={sales.map((d) => ({ ...d, g: 'H' }))} weightField="north" levels={[{ groupBy: 'g' }]} leaves={{ labelField: 'month' }} height={160} {...clicks('tree')} /></div>
      <div id="probe-geo" className="probe-wrap" {...clicks('geo')}><GeoMap title="Map" layers={[{ shapes: { type: 'FeatureCollection', features: [square('A', 0), square('B', 10)] } }]} height={160} /></div>
      <div id="probe-spark" className="probe-wrap" style={{ display: 'inline-block' }} {...clicks('spark')}><Sparkline data={[1, 3, 2, 5, 4]} /></div>
    </Section>
  );
}

function App() {
  const [hidden, setHidden] = useState<readonly string[]>([]);
  return (
    <StrictMode>
      <ThemeProvider theme={{ colorScheme: scheme }}>
        <div dir={dir} id="page" data-salmon-a11y-root="" style={{ padding: 16, background: 'var(--salmon-surface-base)', color: 'var(--salmon-text-primary)' }}>
          <Section id="basic" title="Basic chart">
            <Chart
              ref={(api) => {
                window.__chartApi = api;
              }}
              title="Sales"
              subtitle="2024"
              data={sales}
              selection
              crosshair
              tooltip
              hiddenSeries={hidden}
              onHiddenSeriesChange={(ids, e) => {
                log({ kind: 'hidden', ids: [...ids], source: e.source });
                setHidden(ids);
              }}
              onPointClick={(ctx) => log({ kind: 'click', series: ctx.seriesId, index: ctx.index })}
              onSelectedPointsChange={(points, e) => log({ kind: 'select', points: points.map((p) => `${p.seriesId}:${p.index}`), source: e.source })}
              onResize={(size) => log({ kind: 'resize', width: size.width })}
              series={[
                { type: 'column', xField: 'month', yField: 'north', name: 'North' },
                { type: 'line', xField: 'month', yField: 'south', name: 'South', markers: true },
              ]}
            />
          </Section>
          <Section id="shared" title="Shared tooltip">
            <Chart title="Shared" data={sales} tooltip={{ mode: 'shared', render: (ctx) => <span className="custom-tip">{`${ctx.header}: ${ctx.points.map((p) => p.yText).join(' / ')}`}</span> }} crosshair={{ snap: true }} series={[{ xField: 'month', yField: 'north', name: 'North' }, { xField: 'month', yField: 'south', name: 'South' }]} />
          </Section>
          <Section id="zoom" title="Zoom">
            <ZoomDemo />
          </Section>
          <Section id="toolbar" title="Zoom toolbar">
            <Chart
              title="Toolbar"
              data={line}
              series={[{ xField: 'x', yField: 'y', name: 'Signal' }]}
              zoom={{ toolbar: true, deferred: true }}
              onZoomRangeChange={(range, event) => log({ kind: 'toolbar-zoom', reason: event.reason, x: range.x ? [Math.round(range.x[0]), Math.round(range.x[1])] : null })}
            />
          </Section>
          <Section id="edit" title="Point drag">
            <EditDemo />
          </Section>
          <Section id="range-select" title="Range selection">
            <SelectDemo mode="range" />
          </Section>
          <Section id="lasso" title="Lasso selection">
            <SelectDemo mode="lasso" />
          </Section>
          <Section id="cluster" title="Cluster selection">
            <SelectDemo mode="cluster" />
          </Section>
          <Section id="axis-events" title="Axis events">
            <Chart
              title="Axis events"
              data={sales}
              onPointDoubleClick={(ctx) => log({ kind: 'dblclick', series: ctx.seriesId, index: ctx.index })}
              onAxisLabelClick={(ctx) => log({ kind: 'axis-label', axis: ctx.axisId, value: ctx.value, index: ctx.index })}
              onAxisLabelGroupClick={(ctx) => log({ kind: 'axis-group', axis: ctx.axisId, label: ctx.label })}
              xAxis={{ labelGroups: [{ levels: [{ from: 'Jan', to: 'Mar', label: 'Q1' }, { from: 'Apr', to: 'Jun', label: 'Q2' }] }] }}
              series={[{ type: 'column', xField: 'month', yField: 'north', name: 'North' }]}
            />
          </Section>
          <Section id="polar" title="Polar and radar">
            <div style={{ display: 'flex', gap: 8 }}>
              <Chart title="Polar" coordinate="polar" features={[polar]} tooltip height={280} data={wind} series={[{ type: 'column', xField: 'd', yField: 'a', name: 'Gusts' }, { type: 'line', xField: 'd', yField: 'b', name: 'Mean', markers: true }]} />
              <Chart title="Radar" coordinate="radar" features={[polar]} tooltip height={280} data={wind} series={[{ type: 'area', xField: 'd', yField: 'a', name: 'A' }, { type: 'line', xField: 'd', yField: 'b', name: 'B' }]} />
            </div>
          </Section>
          <Section id="sync" title="Sync group">
            <ChartSyncGroup>
              <div id="sync-a">
                <Chart title="Sync A" data={sales} tooltip series={[{ xField: 'month', yField: 'north', name: 'North' }]} height={160} />
              </div>
              <div id="sync-b">
                <Chart title="Sync B" data={sales} tooltip series={[{ xField: 'month', yField: 'south', name: 'South' }]} height={160} />
              </div>
            </ChartSyncGroup>
          </Section>
          <Section id="canvas" title="Canvas renderer">
            <Chart
              ref={(api) => {
                window.__canvasApi = api;
              }}
              title="Canvas"
              renderer="canvas"
              data={line}
              series={[{ xField: 'x', yField: 'y', name: 'Signal' }]}
            />
          </Section>
          <Section id="bullet" title="Bullet chart">
            <BulletChart title="KPIs" data={[{ k: 'Revenue', v: 270, t: 250 }, { k: 'Profit', v: 22, t: 25 }]} valueField="v" targetField="t" categoryField="k" max={300} bands={[{ to: 150 }, { to: 225 }, { to: 300 }]} legend onItemClick={(ctx) => log({ kind: 'bullet-click', index: ctx.index })} />
          </Section>
          <Section id="range" title="Range selector">
            <RangeDemo />
          </Section>
          <Section id="periods" title="Period selector">
            <PeriodSelector periods={periods} defaultValue="1m" onValueChange={(v) => log({ kind: 'period', value: v })} />
          </Section>
          <Section id="stock-custom" title="Stock chart custom range">
            <StockChart title="ACME range" data={daily} xField="d" openField="o" highField="h" lowField="l" closeField="c" volumeField="v" customRange toolbar={false} navigator={false} events={[{ date: '2024-02-01', label: 'Split', shape: 'arrowUp', seriesIds: ['price', 'volume'] }]} onRangeChange={(r, e) => log({ kind: 'stock-custom', reason: e.reason, range: [new Date(r[0]).toISOString().slice(0, 10), new Date(r[1]).toISOString().slice(0, 10)] })} />
          </Section>
          <Section id="stock" title="Stock chart">
            <StockChart title="ACME" data={daily} xField="d" openField="o" highField="h" lowField="l" closeField="c" exportWriters={window.__vizWriters} onSeriesTypeChange={(t) => log({ kind: 'series-type', type: t })} onRangeChange={(r, e) => log({ kind: 'stock-range', reason: e.reason })} />
          </Section>
          {params.has('live') ? <StockLive /> : null}
          {params.has('pointer') ? <PointerProbes /> : null}
          {params.has('stock-props') ? <StockProps /> : null}
          <Section id="families" title="Every family">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              <BulletChart ref={keep('BulletChart')} title="Bullet" data={[{ k: 'A', v: 3, t: 4 }]} valueField="v" targetField="t" categoryField="k" />
              <PieChart ref={keep('PieChart')} title="Pie" data={sales} valueField="north" labelField="month" height={200} />
              <FunnelChart ref={keep('FunnelChart')} title="Funnel" data={sales} valueField="north" labelField="month" height={200} />
              <Gauge ref={keep('Gauge')} title="Gauge" pointers={[{ value: 40 }]} height={200} />
              <HeatMap ref={keep('HeatMap')} title="Heat" data={sales.map((d) => ({ ...d, r: 'north' }))} xField="month" yField="r" valueField="north" height={160} />
              <TreeMap ref={keep('TreeMap')} title="Tree" data={sales.map((d) => ({ ...d, g: 'H' }))} weightField="north" levels={[{ groupBy: 'g' }]} leaves={{ labelField: 'month' }} height={160} />
              <SankeyChart ref={keep('SankeyChart')} title="Flow" nodes={[{ id: 'a' }, { id: 'b' }]} links={[{ source: 'a', target: 'b', value: 3 }]} height={160} />
              <GeoMap ref={keep('GeoMap')} title="Map" layers={[{ shapes: { type: 'FeatureCollection', features: [square('A', 0), square('B', 10)] } }]} height={160} />
              <Barcode ref={keep('Barcode')} value="12345" type="code128" />
              <QRCode ref={keep('QRCode')} value="hello" />
            </div>
          </Section>
        </div>
      </ThemeProvider>
    </StrictMode>
  );
}

const root = document.getElementById('root') as HTMLElement;
const app = <App />;
if (params.has('hydrate')) {
  root.innerHTML = renderToString(app);
  hydrateRoot(root, app, { onRecoverableError: (error) => console.error('recoverable', error) });
} else {
  createRoot(root).render(app);
}
