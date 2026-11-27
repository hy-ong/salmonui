// Chart feature and timing page (tests/browser/chart-features.spec.ts,
// chart-perf.spec.ts): split and positioned tooltips, crosshair bands and
// axis labels with the crosshair API, shared selection in a sync group,
// RTL, and the hover, wheel zoom and live append budgets.
//
//   ?dir=rtl                    renders inside dir="rtl"
//   ?perf=hover|zoom|append     a single timing case (100,000 / 1,000 points)
//   ?perf=million               1,000,000-point canvas mount (window.__mountMillion)
//
// window.__vizEvents records callbacks; window.__crossApi is the crosshair
// chart's API; window.__perfApi the timing chart's API.
import { StrictMode, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import '@salmonui/core/styles.css';
import '@salmonui/charts/chart/styles.css';
import '@salmonui/charts/viz-animations.css';
import '@salmonui/charts/viz-rtl.css';
import '@salmonui/buttons/menu/styles.css';
import '@salmonui/navigation/toolbar/styles.css';
import './app.css';
import { Chart, ChartSyncGroup, type ChartApi, type ChartDatum, type ChartZoomRange } from '@salmonui/charts/chart';
import { ThemeProvider } from '@salmonui/core/theme';

declare global {
  interface Window {
    __vizEvents?: Record<string, unknown>[];
    __crossApi?: ChartApi | null;
    __perfApi?: ChartApi | null;
    __append?: () => number;
    __mountMillion?: () => Promise<number>;
    __millionCommit?: number;
    __renders?: number;
  }
}

const params = new URLSearchParams(location.search);
const dir = params.get('dir') === 'rtl' ? 'rtl' : 'ltr';
const perf = params.get('perf');
window.__vizEvents = [];
window.__renders = 0;
const log = (entry: Record<string, unknown>) => window.__vizEvents?.push(entry);

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const sales = months.map((month, i) => ({ month, north: [12, 15, 9, 20, 18, 25][i], south: [8, 6, 11, 9, 14, 10][i] }));

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} style={{ marginBlock: 24, maxInlineSize: 720 }}>
      <h2 style={{ fontSize: 16 }}>{title}</h2>
      {children}
    </section>
  );
}

function SyncSelection() {
  return (
    <ChartSyncGroup>
      {(['a', 'b'] as const).map((k) => (
        <div key={k} id={`sel-${k}`}>
          <Chart
            title={`Selection ${k.toUpperCase()}`}
            data={sales}
            height={160}
            selection
            series={[{ type: 'column', xField: 'month', yField: k === 'a' ? 'north' : 'south', name: k === 'a' ? 'North' : 'South' }]}
            onSelectedPointsChange={(points, e) => log({ kind: 'select', chart: k, points: points.map((p) => `${p.seriesId}:${p.index}`), reason: e.reason, source: e.source })}
          />
        </div>
      ))}
    </ChartSyncGroup>
  );
}

const big = Array.from({ length: 100_000 }, (_, i) => ({ x: i, y: Math.sin(i / 500) * 50 + Math.sin(i / 17) * 5 }));

function PerfZoom() {
  const [zoom, setZoom] = useState<ChartZoomRange>({});
  return <Chart title="Zoom 100k" data={big} height={300} zoom={{ wheel: true, pan: true }} zoomRange={zoom} onZoomRangeChange={(r) => setZoom(r)} series={[{ xField: 'x', yField: 'y', name: 'Signal' }]} />;
}

function PerfAppend() {
  const [rows, setRows] = useState<ChartDatum[]>(() => Array.from({ length: 1000 }, (_, i) => ({ x: i, y: Math.sin(i / 20) })));
  // Appends one point to the 1,000-point window synchronously and returns the render + commit time (ms).
  window.__append = () => {
    const t0 = performance.now();
    flushSync(() =>
      setRows((r) => {
        const n = (r[r.length - 1]?.['x'] as number) + 1;
        return [...r.slice(1), { x: n, y: Math.sin(n / 20) }];
      }),
    );
    return performance.now() - t0;
  };
  return <Chart title="Live" data={rows} height={240} animated={false} series={[{ xField: 'x', yField: 'y', name: 'Live' }]} />;
}

// a 1,000,000-point line on the canvas renderer. A small canvas chart loads the canvas chunk first, so
// the timing is mount (render, decimation, commit) to the first painted frame of the marks.
function PerfMillion() {
  const [rows] = useState<ChartDatum[]>(() => Array.from({ length: 1_000_000 }, (_, i) => ({ x: i, y: Math.sin(i / 5000) * 50 + Math.sin(i / 37) * 5 })));
  const [on, setOn] = useState(false);
  window.__mountMillion = () =>
    new Promise((resolve) => {
      const t0 = performance.now();
      flushSync(() => setOn(true));
      const painted = () => {
        const c = document.querySelector<HTMLCanvasElement>('#million canvas');
        const ctx = c?.getContext('2d');
        if (!c || !ctx) return false;
        const col = ctx.getImageData(Math.floor(c.width / 2), 0, 1, c.height).data;
        for (let i = 3; i < col.length; i += 4) if ((col[i] as number) > 0) return true;
        return false;
      };
      const commit = performance.now() - t0;
      // The canvas chunk draws in a promise callback after the commit; the frame after the draw is the first paint.
      const poll = () => (painted() ? requestAnimationFrame(() => resolve(performance.now() - t0)) : requestAnimationFrame(poll));
      setTimeout(poll, 0);
      window.__millionCommit = commit;
    });
  return (
    <>
      <div id="warm">
        <Chart title="Warm-up" data={sales} height={120} renderer="canvas" animated={false} series={[{ xField: 'month', yField: 'north', name: 'North' }]} />
      </div>
      <div id="million">{on ? <Chart title="Million" data={rows} height={300} renderer="canvas" animated={false} series={[{ xField: 'x', yField: 'y', name: 'Signal' }]} /> : null}</div>
    </>
  );
}

function Perf({ kind }: { kind: string }) {
  if (kind === 'million') return <PerfMillion />;
  if (kind === 'zoom') return <PerfZoom />;
  if (kind === 'append') return <PerfAppend />;
  return (
    <Chart
      ref={(api) => {
        window.__perfApi = api;
      }}
      title="Hover 100k"
      data={big}
      height={300}
      tooltip
      series={[{ xField: 'x', yField: 'y', name: 'Signal' }]}
    />
  );
}

function App() {
  return (
    <StrictMode>
      <ThemeProvider theme={{ colorScheme: 'light' }}>
        <div dir={dir} id="page" data-salmon-a11y-root="" style={{ padding: 16, background: 'var(--salmon-surface-base)', color: 'var(--salmon-text-primary)' }}>
          {perf ? (
            <Section id="perf" title="Timing">
              <Perf kind={perf} />
            </Section>
          ) : (
            <>
              <Section id="split" title="Split tooltip">
                <Chart title="Split" data={sales} tooltip={{ mode: 'split' }} series={[{ xField: 'month', yField: 'north', name: 'North' }, { xField: 'month', yField: 'south', name: 'South' }]} />
              </Section>
              <Section id="fixed" title="Fixed tooltip">
                <Chart title="Fixed" data={sales} tooltip={{ position: { x: 60, y: 60 }, offset: 0 }} series={[{ xField: 'month', yField: 'north', name: 'North' }]} />
              </Section>
              <Section id="follow" title="Pointer tooltip">
                <Chart title="Follow" data={sales} tooltip={{ position: 'pointer', offset: 24 }} series={[{ xField: 'month', yField: 'north', name: 'North' }]} />
              </Section>
              <Section id="cross" title="Crosshair">
                <Chart
                  ref={(api) => {
                    window.__crossApi = api;
                  }}
                  title="Crosshair"
                  data={sales}
                  crosshair={{ highlightCategory: true, axisLabels: true, formatLabel: (v, axisId) => (axisId === 'x' ? `Month ${String(v)}` : `${Math.round(Number(v))} u`) }}
                  series={[{ type: 'column', xField: 'month', yField: 'north', name: 'North' }]}
                />
              </Section>
              <Section id="sync-select" title="Shared selection">
                <SyncSelection />
              </Section>
              <Section id="plot-events" title="Plot events">
                <Chart
                  title="Plot events"
                  data={sales}
                  tooltip
                  onPlotClick={(pt) => log({ kind: 'plot-click', xValue: pt.xValue, yValue: Math.round(Number(pt.yValue)) })}
                  onPlotPointerMove={(pt) => log({ kind: 'plot-move', xValue: pt.xValue })}
                  series={[{ type: 'column', xField: 'month', yField: 'north', name: 'North' }]}
                />
              </Section>
              <Section id="css-size" title="CSS-driven size">
                <div id="size-auto">
                  <Chart title="Auto" data={sales} series={[{ xField: 'month', yField: 'north', name: 'North' }]} />
                </div>
                <div id="size-css">
                  <Chart title="Height" data={sales} style={{ height: 420 }} onResize={(size) => log({ kind: 'resize', height: size.height })} series={[{ xField: 'month', yField: 'north', name: 'North' }]} />
                </div>
                <div id="size-ratio">
                  <Chart title="Ratio" data={sales} style={{ aspectRatio: '3 / 1' }} series={[{ xField: 'month', yField: 'north', name: 'North' }]} />
                </div>
                <div id="size-fixed">
                  <Chart title="Fixed" data={sales} height={180} style={{ height: 420 }} series={[{ xField: 'month', yField: 'north', name: 'North' }]} />
                </div>
              </Section>
              <Section id="legend" title="Legend">
                <Chart title="Legend" data={sales} legend={{ position: 'top', align: 'end' }} series={[{ xField: 'month', yField: 'north', name: 'North' }, { xField: 'month', yField: 'south', name: 'South' }]} />
              </Section>
            </>
          )}
        </div>
      </ThemeProvider>
    </StrictMode>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(<App />);
