'use client';

import { useRef, useState } from 'react';
import { Chart, type ChartApi } from '@salmonui/charts/chart';
import { pivotChartImage, PivotTable, usePivot, usePivotChartProps, type PivotChartSeriesType, type PivotExportWriters, type PivotModelInput, type PivotTableApi, type PivotWriterModule, type PivotFieldDefinition } from '@salmonui/pivot-table';
import { Button } from '@salmonui/buttons/button';
import { Select } from '@salmonui/dropdowns/select';
import '@salmonui/charts/chart/styles.css';

type Sale = { region: string; country: string; year: string; amount: number };

const COUNTRIES: Record<string, string[]> = { Asia: ['Japan', 'India'], Europe: ['France', 'Germany'], Americas: ['Brazil', 'Canada'] };

function makeSales(): Sale[] {
  const rows: Sale[] = [];
  let n = 0;
  for (const [region, countries] of Object.entries(COUNTRIES)) {
    for (const country of countries) {
      for (const year of ['2025', '2026']) {
        for (let k = 0; k < 3; k++) {
          n++;
          rows.push({ region, country, year, amount: ((n * 263) % 900) + 100 });
        }
      }
    }
  }
  return rows;
}

const SALES = makeSales();

// Captions for the headers, the axis bar and the field list (the raw field names otherwise).
const FIELDS: PivotFieldDefinition<Sale>[] = [
  { field: 'region', caption: 'Region', type: 'string' },
  { field: 'country', caption: 'Country', type: 'string' },
  { field: 'year', caption: 'Year', type: 'string' },
  { field: 'amount', caption: 'Amount', type: 'number' },
];

const MODEL: PivotModelInput = {
  rows: [{ field: 'region' }, { field: 'country' }],
  columns: [{ field: 'year' }],
  values: [{ field: 'amount', aggregate: 'sum', caption: 'Amount' }],
};

/** The pivot writers load on the first PDF export. */
const WRITERS: PivotExportWriters = { pivot: () => import('@salmonui/export/pivot') as unknown as Promise<PivotWriterModule> };

const TYPES: PivotChartSeriesType[] = ['column', 'bar', 'stackingColumn', 'line', 'spline', 'area'];
const VIEWS = ['both', 'chart', 'table'] as const;
const TYPE_OPTIONS = TYPES.map((t) => ({ value: t, label: t }));
const VIEW_OPTIONS = VIEWS.map((v) => ({ value: v, label: v }));

/**
 * `usePivotChartProps()` feeds `Chart` from the pivot store, shown next to
 * the table or alone: one series per year, the visible row members as
 * categories. Clicking a region drills it down, clicking a country opens
 * drill through; "Export PDF" writes the table and the chart in one PDF.
 */
export default function PivotTableChartDataDemo() {
  const [type, setType] = useState<PivotChartSeriesType>('column');
  const [view, setView] = useState<(typeof VIEWS)[number]>('both');
  const [last, setLast] = useState('Click a column to drill down.');
  const chartRef = useRef<ChartApi>(null);
  const tableRef = useRef<PivotTableApi<Sale>>(null);
  const pivot = usePivot<Sale>({ data: SALES, fields: FIELDS, defaultPivotModel: MODEL, locale: 'en-US' });
  const chart = usePivotChartProps(pivot, {
    type,
    onPointClick: (ctx, point) => setLast(`${String(ctx.x)} · ${ctx.seriesName}: ${ctx.yText}${point ? ` (cell ${point.rowKey} × ${point.columnKey})` : ''}`),
  });
  const exportPdf = async () => {
    const image = chartRef.current ? await pivotChartImage(chartRef.current) : undefined;
    await tableRef.current?.exportToPdf({ fileName: 'pivot-chart', ...(image ? { chart: image } : {}) });
  };
  return (
    <div>
      <div className="demo-toolbar">
        <label>
          View
          <Select aria-label="View" data={VIEW_OPTIONS} value={view} onValueChange={(next) => next != null && setView(next as (typeof VIEWS)[number])} />
        </label>
        <label>
          Chart type
          <Select aria-label="Chart type" data={TYPE_OPTIONS} value={type} onValueChange={(next) => next != null && setType(next as PivotChartSeriesType)} />
        </label>
        <Button variant="outline" onClick={() => pivot.collapseAll('rows')}>
          Collapse all
        </Button>
        <Button variant="outline" onClick={() => chartRef.current?.print()} disabled={view === 'table'}>
          Print chart
        </Button>
        <Button variant="outline" onClick={() => void exportPdf()}>
          Export PDF
        </Button>
      </div>
      {view === 'table' ? null : <Chart {...chart} ref={chartRef} title="Amount by region and year" legend tooltip height={280} />}
      <p className="demo-status" aria-live="polite">
        {last}
      </p>
      {/* Kept mounted in the chart-only view: drill through and the PDF export are table features. */}
      <div hidden={view === 'chart'}>
        <PivotTable pivot={pivot} ref={tableRef} height={260} drillThrough aria-label="The pivot behind the chart" exportWriters={WRITERS} />
      </div>
    </div>
  );
}
