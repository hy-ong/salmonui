// Pivot Table browser page (tests/browser/pivot.spec.ts, pivot-perf.spec.ts,
// a11y.spec.ts, aria-snapshots.spec.ts): one report on the deterministic sales
// fixture (pivot-fixture.ts), shared through `usePivot()` by PivotToolbar,
// PivotAxisBar, PivotTable and PivotFieldList.
//
//   ?case=compact      (default) compact layout, rows Region > Country > City, columns Year
//   ?case=tabular      tabular layout, every row level expanded
//   ?case=fieldlist    standalone PivotFieldList beside the table (`&defer`, `&order=asc|desc|custom`)
//   ?case=axisbar      PivotAxisBar with the fields panel
//   ?case=toolbar      PivotToolbar with every built-in item and the export writers
//   ?case=drill        drill through (`&maxRows=n`) with editing
//   ?case=paging       row pager (5 rows) and column pager (3 columns)
//   ?case=selection    cell selection
//   ?case=templates    renderCell link, getCellClassName, renderTooltip, renderLoading, onCellClick; deferred first compute
//   ?case=virtual      2,000 customers x 365 dates (row and column virtualization)
//   ?case=persist      persistState { id: 'pivot-test' }
//   ?case=large        1,000,000 rows (`&rows=customer` puts 100,000 customers on the rows axis)
//   ?case=all          toolbar, axis bar, table and field list together
//   ?case=chart        Pivot Chart: `Chart` from `usePivotChartProps()` beside the table (`&view=table|chart|both`,
//                      `&type=<PivotChartSeriesType>`); point click drills down, then through (drill through with editing)
//   ?rows=<n>          fixture size (default 2,000)
//   ?worker            run the engine in a Worker (`@salmonui/pivot-table/engine/worker`)
//
// Window hooks: `__pivot` (the controller), `__pivotApi` (the table ref),
// `__pivotLog` (every pivot event as `{ type, ...fields }`), `__pivotCancel`
// (`{ [eventType]: true | action | field }` cancels matching before-events),
// `__pivotBusy` (aria-busy / loading samples from a MutationObserver),
// `__pivotTimes` (`ready`: first painted value cell, from `start`), `__pivotChart` (the chart ref, case=chart),
// `__pivotChartClicks` (chart point clicks with their pivot cell), `__pivotChartImage` (`pivotChartImage(chart)`).
import { StrictMode, useRef, type CSSProperties, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@salmonui/core/styles.css';
import '@salmonui/navigation/toolbar/styles.css';
import '@salmonui/pivot-table/styles.css';
import '@salmonui/charts/chart/styles.css';
import '@salmonui/charts/pie-chart/styles.css';
import { PivotChart } from '@salmonui/pivot-table/chart';
import { Chart, type ChartApi } from '@salmonui/charts/chart';
import './app.css';
import {
  PivotAxisBar,
  PivotFieldList,
  PivotTable,
  PivotToolbar,
  pivotChartImage,
  usePivot,
  usePivotChartProps,
  type PivotChartSeriesType,
  type PivotController,
  type PivotEventHandlers,
  type PivotExportWriters,
  type PivotFieldDefinition,
  type PivotModelInput,
  type PivotTableApi,
  type PivotToolbarItemId,
  type PivotWorkerLike,
  type PivotWriterModule,
} from '@salmonui/pivot-table';
import { createSales, type SalesRow } from './pivot-fixture.ts';

interface LogEntry {
  readonly type: string;
  readonly [field: string]: unknown;
}

const win = window as unknown as {
  __pivot: PivotController<SalesRow> | null;
  __pivotApi: PivotTableApi<SalesRow> | null;
  __pivotLog: LogEntry[];
  __pivotCancel: Record<string, true | string>;
  __pivotBusy: { busy: boolean; loading: boolean; custom: boolean; t: number }[];
  __pivotTimes: { start: number; ready?: number; generated?: number };
  __pivotData: SalesRow[];
  __pivotCellClicks: { rowKey: string; columnKey: string | null; value: number | null }[];
  __pivotChart: ChartApi | null;
  __pivotChartClicks: { seriesId: string; index: number; rowKey: string | null; columnKey: string | null }[];
  __pivotChartImage: () => ReturnType<typeof pivotChartImage>;
};
win.__pivotLog = [];
win.__pivotCancel = {};
win.__pivotBusy = [];
win.__pivotCellClicks = [];
win.__pivotChartClicks = [];
win.__pivotChart = null;
win.__pivotChartImage = () => pivotChartImage(win.__pivotChart as ChartApi);

const params = new URLSearchParams(location.search);
const kase = params.get('case') ?? 'compact';
if (params.get('dir') === 'rtl') document.documentElement.dir = 'rtl';

const t0 = performance.now();
const rowCount = Number(params.get('rows') ?? (kase === 'large' ? 1_000_000 : kase === 'virtual' ? 20_000 : 2_000));
const customers = kase === 'large' ? 100_000 : kase === 'virtual' ? 2_000 : 500;
const data = createSales(rowCount, customers);
win.__pivotData = data;
const generated = performance.now();
win.__pivotTimes = { start: generated, generated: generated - t0 };

const FIELDS: PivotFieldDefinition<SalesRow>[] = [
  { field: 'region', caption: 'Region', type: 'string', folder: 'Geography' },
  { field: 'country', caption: 'Country', type: 'string', folder: 'Geography' },
  { field: 'city', caption: 'City', type: 'string', folder: 'Geography' },
  { field: 'product', caption: 'Product', type: 'string', folder: 'Product' },
  { field: 'category', caption: 'Category', type: 'string', folder: 'Product' },
  { field: 'year', caption: 'Year', type: 'number', folder: 'Time' },
  { field: 'quarter', caption: 'Quarter', type: 'string', folder: 'Time' },
  { field: 'date', caption: 'Date', type: 'date', folder: 'Time' },
  { field: 'customer', caption: 'Customer', type: 'string' },
  { field: 'amount', caption: 'Amount', type: 'number' },
  { field: 'units', caption: 'Units', type: 'number' },
  { field: 'id', caption: 'Id', type: 'number', hidden: true },
];

const VALUES = [
  { field: 'amount', aggregate: 'sum' },
  { field: 'units', aggregate: 'sum' },
] as const;

function modelFor(c: string): PivotModelInput {
  const geo = [{ field: 'region' }, { field: 'country' }, { field: 'city' }];
  switch (c) {
    case 'tabular':
      return { rows: geo.slice(0, 2), columns: [{ field: 'year' }], values: [VALUES[0]], expanded: 'all' };
    case 'paging':
      return { rows: geo, columns: [{ field: 'year' }, { field: 'quarter' }], values: [VALUES[0]], expanded: 'all' };
    case 'virtual':
      return { rows: [{ field: 'customer' }], columns: [{ field: 'date' }], values: [VALUES[0]] };
    case 'large':
      return params.get('rows') === 'customer' || params.has('scroll')
        ? { rows: [{ field: 'customer' }], columns: [{ field: 'year' }], values: [...VALUES] }
        : { rows: geo, columns: [{ field: 'year' }], values: [...VALUES], filters: [{ field: 'customer' }] };
    case 'chart':
      return { rows: geo, columns: [{ field: 'year' }], values: [VALUES[0]] };
    case 'drill':
    case 'selection':
    case 'templates':
      return { rows: geo.slice(0, 2), columns: [{ field: 'year' }], values: [VALUES[0]] };
    default:
      return { rows: geo, columns: [{ field: 'year' }], values: [...VALUES], filters: [{ field: 'category' }] };
  }
}

/** JSON-safe copy of an event's fields (functions, DOM nodes and the result are dropped). */
function plain(event: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(event)) {
    if (typeof v === 'function' || k === 'result' || k === 'cell' || k === 'element' || k === 'nativeEvent' || k === 'model' || k === 'previousModel') continue;
    if (v instanceof Node || v instanceof Event) continue;
    try {
      out[k] = v === undefined ? null : JSON.parse(JSON.stringify(v));
    } catch {
      // not serializable
    }
  }
  return out;
}

const HANDLERS = [
  'onBeforePivotModelChange',
  'onPivotModelChange',
  'onBeforeExpandedChange',
  'onExpandedChange',
  'onBeforeFilterChange',
  'onFilterChange',
  'onBeforeSortChange',
  'onSortChange',
  'onBeforeFieldMove',
  'onFieldMove',
  'onBeforeMemberEditorOpen',
  'onBeforeAggregateMenuOpen',
  'onBeforeCalculatedFieldChange',
  'onCalculatedFieldChange',
  'onBeforeDrillThrough',
  'onDrillThrough',
  'onBeforeSelectionChange',
  'onSelectionChange',
  'onComputeStart',
  'onComputeEnd',
  'onBeforeExport',
  'onExport',
  'onError',
] as const;

function handlers(): PivotEventHandlers<SalesRow> {
  const out: Record<string, (event: never) => void> = {};
  for (const name of HANDLERS) {
    const type = name.slice(2, 3).toLowerCase() + name.slice(3);
    out[name] = (event: { preventDefault?: () => void; action?: string; field?: string; items?: string[]; model?: { rows: readonly { field: string }[] } }) => {
      const entry: LogEntry = { type, ...plain(event) };
      if (event.model) (entry as Record<string, unknown>)['rows'] = event.model.rows.map((r) => r.field);
      if (type === 'error') (entry as Record<string, unknown>)['message'] = String((event as unknown as { error: Error }).error?.message);
      win.__pivotLog.push(entry);
      const cancel = win.__pivotCancel[type];
      if (cancel !== undefined && (cancel === true || cancel === event.action || cancel === event.field)) event.preventDefault?.();
      // `aggregateOptions` test: the before-event may edit the offered items.
      if (type === 'beforeAggregateMenuOpen' && win.__pivotCancel['aggregateItems'] === 'trim' && event.items) event.items.splice(2);
    };
  }
  out['onDataChange'] = (event: { action: string; changes: readonly unknown[] }) => {
    win.__pivotLog.push({ type: 'dataChange', action: event.action, changes: event.changes.length });
  };
  return out as PivotEventHandlers<SalesRow>;
}

/** The pivot writers, loaded on first export (`@salmonui/export/pivot`, `exportPivot()`). */
const exportWriters: PivotExportWriters = { pivot: () => import('@salmonui/export/pivot') as unknown as Promise<PivotWriterModule> };

const TOOLBAR_ITEMS: PivotToolbarItemId[] = ['fieldList', 'subtotals', 'grandTotals', 'formatting', 'numberFormat', 'conditionalFormat', 'calculatedField', 'export', 'expandAll', 'collapseAll'];

function createWorker(): PivotWorkerLike | undefined {
  if (!params.has('worker')) return undefined;
  return new Worker(new URL('@salmonui/pivot-table/engine/worker', import.meta.url), { type: 'module' }) as unknown as PivotWorkerLike;
}

function Section({ id, children, style }: { id: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <section data-case={id} data-salmon-a11y-root="" style={{ display: 'grid', gap: 8, ...style }}>
      <h1 style={{ fontSize: 16, margin: 0 }}>Pivot table: {id}</h1>
      {children}
    </section>
  );
}

/** Pivot Chart: the app composes `Chart` with the pivot's chart props. */
function PivotChartPanel({ pivot }: { pivot: PivotController<SalesRow> }) {
  const props = usePivotChartProps(pivot, {
    type: (params.get('type') as PivotChartSeriesType | null) ?? 'column',
    onPointClick: (ctx, point) => {
      win.__pivotChartClicks.push({ seriesId: ctx.seriesId, index: ctx.index, rowKey: point?.rowKey ?? null, columnKey: point?.columnKey ?? null });
    },
  });
  return (
    <div style={{ flex: '1 1 0', minWidth: 0 }}>
      <Chart
        {...props}
        ref={(api) => {
          win.__pivotChart = api;
        }}
        title="Amount by region"
        legend
        tooltip
        crosshair
        zoom
        animated={false}
        height={360}
        className="pivot-chart"
      />
    </div>
  );
}

/** `&family`: `PivotChart` draws the type with its real chart family. */
function PivotFamilyPanel({ pivot }: { pivot: PivotController<SalesRow> }) {
  return (
    <div style={{ flex: '1 1 0', minWidth: 0 }}>
      <PivotChart
        pivot={pivot}
        type={(params.get('type') as PivotChartSeriesType | null) ?? 'column'}
        title="Amount by region"
        legend
        tooltip
        height={360}
        className="pivot-chart"
        chartProps={{ animated: false }}
        accumulationProps={{ animated: false }}
        onPointClick={(ctx, point) => {
          win.__pivotChartClicks.push({ seriesId: ctx.seriesId, index: ctx.index, rowKey: point?.rowKey ?? null, columnKey: point?.columnKey ?? null });
        }}
      />
    </div>
  );
}

function Report() {
  const workerRef = useRef<PivotWorkerLike | undefined | null>(null);
  if (workerRef.current === null) workerRef.current = createWorker();
  const worker = workerRef.current;
  const pivot = usePivot<SalesRow>({
    data,
    fields: FIELDS,
    defaultPivotModel: modelFor(kase),
    locale: 'en-US',
    ...(worker ? { worker } : {}),
    ...(kase === 'templates' ? { deferComputeAbove: 0 } : {}),
    ...handlers(),
  });
  win.__pivot = pivot;
  const showToolbar = kase === 'toolbar' || kase === 'all';
  const showAxisBar = kase === 'axisbar' || kase === 'all';
  const showFieldList = kase === 'fieldlist' || kase === 'all';
  const order = params.get('order');
  const maxRows = params.get('maxRows');
  const templates = kase === 'templates';
  const view = kase === 'chart' ? (params.get('view') ?? 'both') : 'table';
  return (
    <Section id={kase}>
      {showToolbar ? <PivotToolbar pivot={pivot} items={TOOLBAR_ITEMS} exportWriters={exportWriters} /> : null}
      {showAxisBar ? <PivotAxisBar pivot={pivot} showFieldsPanel aggregateOptions={params.has('aggregates') ? ['sum', 'count', 'average', 'max'] : undefined} /> : null}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', minWidth: 0 }}>
        {view === 'chart' || view === 'both' ? params.has('family') ? <PivotFamilyPanel pivot={pivot} /> : <PivotChartPanel pivot={pivot} /> : null}
        <div style={{ flex: '1 1 0', minWidth: 0, display: view === 'chart' ? 'none' : undefined }}>
          <PivotTable<SalesRow>
            pivot={pivot}
            ref={(api) => {
              win.__pivotApi = api;
            }}
            id="pivot"
            aria-label="Sales report"
            className={kase === 'compact' ? 'sales-report' : undefined}
            style={kase === 'compact' ? { maxWidth: 1100, outline: '1px solid transparent' } : undefined}
            layout={kase === 'tabular' ? 'tabular' : 'compact'}
            height={kase === 'large' || kase === 'virtual' ? 600 : 420}
            fieldList="popup"
            exportWriters={exportWriters}
            {...(params.has('aggregates') ? { aggregateOptions: ['sum', 'count', 'average', 'max'] as const } : {})}
            {...(params.has('resizable') ? { resizable: true } : {})}
            {...(params.has('valueSorting') ? { valueSorting: true } : {})}
            {...(params.get('gridLines') ? { gridLines: params.get('gridLines') as 'horizontal' } : {})}
            {...(params.get('rowHeight') ? { rowHeight: Number(params.get('rowHeight')) } : {})}
            {...(kase === 'drill' || kase === 'chart' ? { drillThrough: maxRows ? { maxRows: Number(maxRows) } : true, editing: true } : {})}
            {...(kase === 'paging' ? { paging: { rows: 5, columns: 3 } } : {})}
            {...(kase === 'selection' ? { selection: { multiple: true } } : {})}
            {...(kase === 'persist' ? { persistState: { id: 'pivot-test', version: '1' } } : {})}
            {...(templates
              ? {
                  emptyCellText: '-',
                  renderCell: (ctx) =>
                    ctx.cell.kind === 'value' && ctx.cell.value !== null ? (
                      <a href={`#cell-${ctx.cell.rowIndex}-${ctx.cell.columnIndex}`} className="pivot-link">
                        {ctx.defaultContent}
                      </a>
                    ) : (
                      ctx.defaultContent
                    ),
                  getCellClassName: (ctx) => ((ctx.cell.value ?? 0) > 100_000 ? 'pivot-high' : ''),
                  renderTooltip: (ctx) => `${ctx.rowHeader.label} / ${ctx.columnHeader.label}: ${ctx.cell.formattedValue}`,
                  renderLoading: () => <span className="pivot-custom-loading">Crunching numbers</span>,
                  onCellClick: (event) => {
                    win.__pivotCellClicks.push({ rowKey: event.rowKey, columnKey: event.columnKey, value: event.cell?.value ?? null });
                  },
                }
              : {})}
          />
        </div>
        {showFieldList ? (
          <PivotFieldList
            pivot={pivot}
            deferUpdate={params.has('defer')}
            {...(params.has('aggregates') ? { aggregateOptions: ['sum', 'count', 'average', 'max'] as const } : {})}
            style={{ flex: '0 0 360px' }}
            {...(order === 'asc' || order === 'desc' ? { fieldOrder: order } : order === 'custom' ? { fieldOrder: ['units', 'amount', 'year'] } : {})}
          />
        ) : null}
      </div>
    </Section>
  );
}

// Loading samples: every DOM change records whether the root is busy and the loading layer is shown.
new MutationObserver(() => {
  const root = document.querySelector('.salmon-pivot-table');
  if (!root) return;
  const busy = root.getAttribute('aria-busy') === 'true';
  const loading = root.querySelector('.salmon-pivot-table-loading') !== null;
  const custom = root.querySelector('.pivot-custom-loading') !== null;
  const last = win.__pivotBusy[win.__pivotBusy.length - 1];
  if (!last || last.busy !== busy || last.loading !== loading || last.custom !== custom) win.__pivotBusy.push({ busy, loading, custom, t: performance.now() });
  // First painted value cell (perf: initial render to first painted viewport).
  if (win.__pivotTimes.ready === undefined && root.querySelector('.salmon-data-grid-rows .salmon-data-grid-cell[data-column-id^="c"]')) {
    requestAnimationFrame(() => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => {
        win.__pivotTimes.ready ??= performance.now() - win.__pivotTimes.start;
      };
      ch.port2.postMessage(0);
    });
  }
}).observe(document.getElementById('root') as HTMLElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-busy'] });

createRoot(document.getElementById('root') as HTMLElement).render(
  params.has('strict') ? (
    <StrictMode>
      <Report />
    </StrictMode>
  ) : (
    <Report />
  ),
);
