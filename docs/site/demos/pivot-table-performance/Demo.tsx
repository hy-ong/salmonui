'use client';

import { useMemo, useRef, useState } from 'react';
import { PivotTable, usePivot, type PivotComputeEvent, type PivotModelInput, type PivotFieldDefinition } from '@salmonui/pivot-table';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';

const SIZE_OPTIONS = [
  { value: 20_000, label: '20,000' },
  { value: 200_000, label: '200,000' },
  { value: 1_000_000, label: '1,000,000' },
];

type Sale = { country: string; product: string; year: string; quarter: string; amount: number; units: number };

const COUNTRIES = Array.from({ length: 40 }, (_, i) => `Country ${String(i + 1).padStart(2, '0')}`);
const PRODUCTS = Array.from({ length: 12 }, (_, i) => `Product ${String.fromCharCode(65 + i)}`);
const YEARS = ['2022', '2023', '2024', '2025', '2026'];
const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

/** `count` deterministic rows (a linear congruential sequence; strings are shared, not copied). */
function makeSales(count: number): Sale[] {
  const rows: Sale[] = new Array(count);
  let seed = 7;
  // The high bits pick the value: the low bits of a power-of-two LCG repeat
  // with a short period and would leave most countries empty.
  const next = (n: number) => {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    return Math.floor((seed / 0x80000000) * n);
  };
  for (let i = 0; i < count; i++) {
    const amount = next(1000) + 1;
    rows[i] = { country: COUNTRIES[next(40)]!, product: PRODUCTS[next(12)]!, year: YEARS[next(5)]!, quarter: QUARTERS[next(4)]!, amount, units: (amount % 9) + 1 };
  }
  return rows;
}

const INITIAL_ROWS = 20_000;
const INITIAL = makeSales(INITIAL_ROWS);

// Captions for the headers, the axis bar and the field list (the raw field names otherwise).
const FIELDS: PivotFieldDefinition<Sale>[] = [
  { field: 'country', caption: 'Country', type: 'string' },
  { field: 'product', caption: 'Product', type: 'string' },
  { field: 'year', caption: 'Year', type: 'string' },
  { field: 'quarter', caption: 'Quarter', type: 'string' },
  { field: 'amount', caption: 'Amount', type: 'number' },
  { field: 'units', caption: 'Units', type: 'number' },
];

const MODEL: PivotModelInput = {
  rows: [{ field: 'country' }, { field: 'product' }],
  columns: [{ field: 'year' }, { field: 'quarter' }],
  values: [{ field: 'amount', aggregate: 'sum' }],
  formats: { amount: { number: { maximumFractionDigits: 0 } } },
};

// Performance budgets (1,000,000 rows, reference hardware).
const BUDGETS: Record<string, string> = { data: '≤ 1,500 ms (initial aggregation)', sort: '≤ 100 ms', filter: '≤ 300 ms', drill: '≤ 50 ms', average: '-' };

type Timing = { action: string; ms: number; rows: number };

const fmt = (n: number) => n.toLocaleString('en-US');

/** Timed aggregation, sort, filter and drill over up to 1,000,000 generated rows, exact averages, and opt-in paging. */
export default function PivotTablePerformanceDemo() {
  const [data, setData] = useState<Sale[]>(INITIAL);
  const [size, setSize] = useState(INITIAL_ROWS);
  const [paging, setPaging] = useState(false);
  const [timings, setTimings] = useState<Timing[]>([]);
  // The action being timed (a ref: written by click handlers, read by the compute event).
  const actionRef = useRef('data');
  const pivot = usePivot<Sale>({
    data,
    fields: FIELDS,
    defaultPivotModel: MODEL,
    locale: 'en-US',
    onComputeEnd: (event: PivotComputeEvent) => {
      const action = event.phase === 'initial' ? 'data' : actionRef.current;
      const rows = pivot.getData().length;
      setTimings((list) => [{ action, ms: event.duration, rows }, ...list].slice(0, 8));
    },
  });

  const generate = () => {
    actionRef.current = 'data';
    // Generation is app work, not pivot work: only the engine's compute is timed.
    setData(makeSales(size));
  };
  const act = (action: string, fn: () => void) => {
    actionRef.current = action;
    fn();
  };
  const sorted = pivot.model.sort.country === 'desc';
  const filtered = Boolean(pivot.model.filterBy.country);
  const average = pivot.model.values[0]?.aggregate === 'average';

  // Pre-aggregation by axis tuple never downgrades average to sum.
  // The direct average skips the countries the demo's filter excludes, as the engine does.
  const countryFilter = pivot.model.filterBy.country;
  const directAverage = useMemo(() => {
    if (!average) return null;
    const excluded = new Set(countryFilter && 'exclude' in countryFilter ? countryFilter.exclude : []);
    let sum = 0;
    let count = 0;
    for (const row of data) {
      if (excluded.has(row.country)) continue;
      sum += row.amount;
      count++;
    }
    return count ? sum / count : null;
  }, [average, data, countryFilter]);
  const result = pivot.result;
  const engineAverage = average && result && result.rowCount > 0 ? result.valueAt(result.rowCount - 1, result.columnCount - 1) : null;

  return (
    <div>
      <div className="demo-toolbar" role="group" aria-label="Data size">
        <label>
          Rows
          <Select aria-label="Rows" data={SIZE_OPTIONS} value={size} onValueChange={(next) => next != null && setSize(Number(next))} />
        </label>
        <Button variant="outline" onClick={generate}>
          Generate and aggregate
        </Button>
        <Checkbox checked={paging} onCheckedChange={(checked) => setPaging(checked)}>
          Paging (10 rows, 5 columns per page)
        </Checkbox>
      </div>
      <div className="demo-toolbar" role="group" aria-label="Timed actions">
        <Button variant="outline" onClick={() => act('sort', () => pivot.setSort('country', sorted ? 'asc' : 'desc'))}>
          Sort countries {sorted ? 'ascending' : 'descending'}
        </Button>
        <Button variant="outline" onClick={() => act('filter', () => pivot.setFilter('country', filtered ? null : { exclude: COUNTRIES.slice(0, 10) }))}>
          {filtered ? 'Clear the filter' : 'Exclude 10 countries'}
        </Button>
        <Button variant="outline" onClick={() => act('drill', () => pivot.expand(['rows', pivot.result?.memberAt('rows', 0).path[0] ?? COUNTRIES[0]!]))}>
          Drill into the first country
        </Button>
        <Button variant="outline" onClick={() => act('drill', () => pivot.collapseAll('rows'))}>
          Collapse all
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            act('average', () => {
              pivot.setAggregate(0, average ? 'sum' : 'average');
            })
          }
        >
          {average ? 'Back to sum' : 'Average instead of sum'}
        </Button>
      </div>
      <PivotTable
        // Paging applies when the grid is created: switching it remounts the table (the store keeps the report).
        key={paging ? 'paged' : 'virtual'}
        pivot={pivot}
        paging={paging ? { rows: 10, columns: 5 } : false} height={320} columnWidth={112} aria-label="Generated sales" />
      <table className="demo-timings" aria-label="Measured engine times" style={{ marginBlockStart: 8, borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th scope="col" style={{ textAlign: 'start', paddingInlineEnd: 16 }}>
              Action
            </th>
            <th scope="col" style={{ textAlign: 'end', paddingInlineEnd: 16 }}>
              Raw rows
            </th>
            <th scope="col" style={{ textAlign: 'end', paddingInlineEnd: 16 }}>
              Engine time
            </th>
            <th scope="col" style={{ textAlign: 'start' }}>
              Budget at 1,000,000 rows
            </th>
          </tr>
        </thead>
        <tbody>
          {timings.map((t, i) => (
            <tr key={`${i}-${t.action}-${t.ms}`}>
              <td style={{ paddingInlineEnd: 16 }}>{t.action}</td>
              <td style={{ textAlign: 'end', paddingInlineEnd: 16 }}>{fmt(t.rows)}</td>
              <td style={{ textAlign: 'end', paddingInlineEnd: 16 }}>{t.ms.toFixed(1)} ms</td>
              <td>{BUDGETS[t.action]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="demo-status" aria-live="polite">
        {average && engineAverage !== null && directAverage !== null
          ? `Grand total average ${engineAverage.toFixed(4)} · computed directly over the raw rows ${directAverage.toFixed(4)}`
          : `Status ${pivot.status} · ${result ? `${fmt(result.rowCount)} rows × ${fmt(result.columnCount)} value columns` : 'computing'}`}
      </p>
    </div>
  );
}
