// Data Visualization browser page (tests/browser/viz-families*.spec.ts,
// a11y.spec.ts). `?case=` picks the scenario:
//
//   pie         PieChart with legend, tooltip, selection, explosion, center label (default)
//   funnel      FunnelChart (?shape=pyramid, ?variant=trapezoidal)
//   sparkline   line, area, column and win-loss sparklines, one with a tooltip
//   heat        HeatMap 7 x 6 with steps legend, selection and cell labels
//   heat-big    HeatMap 1,000 x 1,000 (?n=<side>) on the canvas renderer; mount
//               time to the first drawn canvas frame in window.__vizMountMs
//   tree        TreeMap with drill-down, breadcrumbs and item selection
//   sankey      SankeyChart with legend and adjacent highlight
//   spark-grid  DataGrid with 500 rows (?rows=<n>) and a Sparkline cell template
//
// `?rtl` wraps the page in dir="rtl". Every change callback is recorded in
// `window.__vizFamilyEvents`.
import { StrictMode, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@salmonui/core/styles.css';
import '@salmonui/charts/heat-map/styles.css';
import '@salmonui/charts/pie-chart/styles.css';
import '@salmonui/charts/sankey-chart/styles.css';
import '@salmonui/charts/sparkline/styles.css';
import '@salmonui/charts/tree-map/styles.css';
import '@salmonui/data-grid/styles.css';
import '@salmonui/charts/viz-animations.css';
import '@salmonui/charts/viz-rtl.css';
import './app.css';
import type { DataGridApi } from '@salmonui/data-grid';
import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { HeatMap } from '@salmonui/charts/heat-map';
import { FunnelChart, PieChart, type AccumulationPointRef } from '@salmonui/charts/pie-chart';
import { SankeyChart, type SankeyChartApi } from '@salmonui/charts/sankey-chart';
import { Sparkline } from '@salmonui/charts/sparkline';
import { TreeMap, type TreeMapPath } from '@salmonui/charts/tree-map';

declare global {
  interface Window {
    __gridApi?: DataGridApi<any> | null;
    __mountMs?: number;
    __vizFamilyEvents: { type: string; value: unknown; source: string | undefined; reason: string | undefined }[];
    __vizMountMs?: number;
    __vizApi?: SankeyChartApi | null;
  }
}
window.__vizFamilyEvents = [];
const log = (type: string, value: unknown, event?: { source?: string; reason?: string }) => window.__vizFamilyEvents.push({ type, value, source: event?.source, reason: event?.reason });

const params = new URLSearchParams(location.search);
const scenario = params.get('case') ?? 'pie';

const sales = [
  { region: 'North', sales: 42 },
  { region: 'South', sales: 28 },
  { region: 'East', sales: 18 },
  { region: 'West', sales: 12 },
];

function PieCase(): ReactNode {
  const [selected, setSelected] = useState<readonly AccumulationPointRef[]>([]);
  return (
    <>
      <PieChart
        id="pie"
        title="Sales by region"
        data={sales}
        valueField="sales"
        labelField="region"
        width={480}
        height={320}
        innerRadius="55%"
        selection
        selectedPoints={selected}
        onSelectedPointsChange={(next, event) => {
          log('selected', next, event);
          setSelected(next);
        }}
        onHiddenPointsChange={(next, event) => log('hidden', next, event)}
        onPointClick={(p, event) => log('click', p.label, event)}
        centerLabel={({ point, total }) => (point ? `${point.label} ${point.value}` : `Total ${total}`)}
      />
      <PieChart id="explode" title="Exploding" data={sales} valueField="sales" labelField="region" width={360} height={260} legend={false} explode onExplodedPointsChange={(next, event) => log('exploded', next, event)} />
      <output data-testid="selected">{selected.map((s) => `${s.series}:${s.index}`).join(',')}</output>
    </>
  );
}

const stages = [
  { stage: 'Visits', n: 1000 },
  { stage: 'Sign-ups', n: 600 },
  { stage: 'Trials', n: 300 },
  { stage: 'Orders', n: 120 },
];

const series = (seed: number, n = 24) => Array.from({ length: n }, (_, i) => Math.round(50 + 30 * Math.sin(i / 3 + seed) + ((i * 7 + seed * 13) % 11)));

function SparklineCase(): ReactNode {
  return (
    <div className="viz-sparks">
      <p>
        Line <Sparkline id="spark-line" data={series(1)} highlights={{ high: true, low: true }} tooltip onPointClick={(e) => log('point', e.point.index, e)} />
      </p>
      <p>
        Area <Sparkline id="spark-area" type="area" data={series(2)} />
      </p>
      <p>
        Column <Sparkline id="spark-column" type="column" data={series(3).map((v) => v - 60)} highlights={{ negative: true }} />
      </p>
      <p>
        Win-loss <Sparkline id="spark-wl" type="winLoss" data={[1, -1, 1, 1, 0, -1, 1]} />
      </p>
    </div>
  );
}

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const slots = ['00', '04', '08', '12', '16', '20'];
const heatTable = slots.map((_, y) => days.map((_, x) => ((x * 7 + y * 13) % 17) + (x === 3 && y === 2 ? 0 : 1)));

function HeatCase(): ReactNode {
  return (
    <HeatMap
      id="heat"
      title="Load by day and hour"
      data={heatTable}
      xAxis={{ labels: days }}
      yAxis={{ labels: slots, title: 'Hour' }}
      width={560}
      height={340}
      cells={{ labels: true }}
      colorScale={{ kind: 'steps', stops: [{ value: 0, color: '#dbeafe', label: 'Low' }, { value: 6, color: '#60a5fa', label: 'Medium' }, { value: 12, color: '#1d4ed8', label: 'High' }] }}
      selection={{ multiple: true }}
      onSelectedCellsChange={(cells, event) => log('selected', cells, event)}
      onHiddenItemsChange={(items, event) => log('hidden', items, event)}
      onCellClick={(cell) => log('click', `${cell.x},${cell.y}`)}
      onCellDoubleClick={(cell) => log('dblclick', `${cell.x},${cell.y}`)}
    />
  );
}

function HeatBigCase(): ReactNode {
  const n = Number(params.get('n') ?? 1000);
  const [data] = useState(() => Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => Math.sin(x / 40) * Math.cos(y / 30))));
  return <HeatMap id="heat-big" title="1,000,000 cells" data={data} width={800} height={600} renderer="auto" legend={false} />;
}

const budget = [
  { dept: 'Engineering', team: 'Platform', cost: 40 },
  { dept: 'Engineering', team: 'Apps', cost: 30 },
  { dept: 'Engineering', team: 'Data', cost: 20 },
  { dept: 'Sales', team: 'EMEA', cost: 25 },
  { dept: 'Sales', team: 'Americas', cost: 35 },
  { dept: 'Support', team: 'Tier 1', cost: 12 },
  { dept: 'Support', team: 'Tier 2', cost: 8 },
];

function TreeCase(): ReactNode {
  const [path, setPath] = useState<TreeMapPath>([]);
  return (
    <>
      <TreeMap
        id="tree"
        title="Budget"
        data={budget}
        weightField="cost"
        levels={[{ groupBy: 'dept' }]}
        leaves={{ labelField: 'team', showValue: true }}
        breadcrumbs
        path={path}
        onPathChange={(next, event) => {
          log('path', next, event);
          setPath(next);
        }}
        selection
        onSelectedItemsChange={(items, event) => log('selected', items, event)}
        legend={{ mode: 'interactive' }}
        width={560}
        height={360}
      />
      <output data-testid="path">{path.join('/')}</output>
    </>
  );
}

const energy = {
  nodes: [{ id: 'coal', label: 'Coal' }, { id: 'gas', label: 'Gas' }, { id: 'solar', label: 'Solar' }, { id: 'grid', label: 'Grid' }, { id: 'homes', label: 'Homes' }, { id: 'industry', label: 'Industry' }],
  links: [
    { source: 'coal', target: 'grid', value: 30 },
    { source: 'gas', target: 'grid', value: 25 },
    { source: 'solar', target: 'grid', value: 15 },
    { source: 'grid', target: 'homes', value: 40 },
    { source: 'grid', target: 'industry', value: 30 },
  ],
};

function SankeyCase(): ReactNode {
  const responsive = params.has('responsive');
  return <SankeyChart id="sankey" title="Energy flow" nodes={energy.nodes} links={energy.links} width={responsive ? undefined : 600} height={340} ref={(api) => { window.__vizApi = api; }} onResize={(size) => log('resize', size)} legend onNodeClick={(n, e) => log('node', n.id, e)} onLinkClick={(l, e) => log('link', `${l.source.id}>${l.target.id}`, e)} />;
}

interface Row {
  id: string;
  name: string;
  trend: number[];
  total: number;
}

function SparkGridCase(): ReactNode {
  const count = Number(params.get('rows') ?? 500);
  const [rows] = useState<Row[]>(() =>
    Array.from({ length: count }, (_, i) => {
      const trend = series(i, 24);
      return { id: `r${i}`, name: `Product ${i + 1}`, trend, total: trend.reduce((a, b) => a + b, 0) };
    }),
  );
  const columns: DataGridColumn<Row>[] = [
    { field: 'id', header: 'Id', primaryKey: true, width: 90 },
    { field: 'name', header: 'Product', width: 160 },
    { field: 'trend', header: 'Trend', type: 'string', sortable: false, width: 160, renderCell: ({ row }) => <Sparkline data={row.trend} width={120} height={24} highlights={{ high: true, low: true }} /> },
    { field: 'total', header: 'Total', type: 'number', width: 110 },
    { field: 'trend', id: 'trend-column', header: 'Weekly', type: 'string', sortable: false, width: 160, renderCell: ({ row }) => <Sparkline data={row.trend.slice(0, 12)} type="column" width={120} height={24} /> },
  ];
  return (
    <DataGrid<Row>
      aria-label="Products with sparklines"
      data={rows}
      columns={columns}
      height={600}
      ref={(api: DataGridApi<Row> | null) => {
        window.__gridApi = api;
      }}
    />
  );
}

const CASES: Record<string, () => ReactNode> = {
  pie: PieCase,
  funnel: () => <FunnelChart id="funnel" title="Conversion" data={stages} valueField="n" labelField="stage" shape={params.get('shape') === 'pyramid' ? 'pyramid' : 'funnel'} variant={params.get('variant') === 'trapezoidal' ? 'trapezoidal' : 'standard'} width={480} height={320} selection onSelectedPointsChange={(next, event) => log('selected', next, event)} />,
  sparkline: SparklineCase,
  heat: HeatCase,
  'heat-big': HeatBigCase,
  tree: TreeCase,
  sankey: SankeyCase,
  'spark-grid': SparkGridCase,
};

function Page(): ReactNode {
  const Case = CASES[scenario] ?? PieCase;
  return (
    <main data-salmon-a11y-root="" dir={params.has('rtl') ? 'rtl' : undefined} style={{ padding: 16 }}>
      <Case />
      <button type="button" data-testid="after">
        After
      </button>
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
if (scenario === 'heat-big') {
  // Mount to the first frame with the canvas drawn (the lazy chunk included).
  const poll = (): void => {
    const c = document.querySelector<HTMLCanvasElement>('.salmon-heat-map-canvas');
    if (c && c.width > 1) requestAnimationFrame(() => (window.__vizMountMs = performance.now() - t0));
    else requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
}
