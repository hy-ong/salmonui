'use client';

import { useState } from 'react';
import { PivotAxisBar, PivotTable, usePivot, type PivotAxis, type PivotFieldDefinition, type PivotModelInput } from '@salmonui/pivot-table';
import { Checkbox } from '@salmonui/inputs/checkbox';

type Sale = { region: string; country: string; product: string; channel: string; year: string; amount: number; units: number };

const COUNTRIES: Record<string, string[]> = { Asia: ['Japan', 'India'], Europe: ['France', 'Germany'] };
const PRODUCTS = ['Bikes', 'Helmets'];
const CHANNELS = ['Online', 'Retail'];

function makeSales(): Sale[] {
  const rows: Sale[] = [];
  let n = 0;
  for (const [region, countries] of Object.entries(COUNTRIES)) {
    for (const country of countries) {
      for (const product of PRODUCTS) {
        for (const channel of CHANNELS) {
          for (const year of ['2025', '2026']) {
            n++;
            const amount = ((n * 311) % 1200) + 150;
            rows.push({ region, country, product, channel, year, amount, units: (amount % 17) + 1 });
          }
        }
      }
    }
  }
  return rows;
}

const SALES = makeSales();

// Per-field capabilities: Region has no sort or filter icon and cannot be removed; Year cannot be dragged.
const FIELDS: PivotFieldDefinition<Sale>[] = [
  { field: 'region', caption: 'Region', sortable: false, filterable: false, removable: false },
  { field: 'country', caption: 'Country' },
  { field: 'product', caption: 'Product' },
  { field: 'channel', caption: 'Channel' },
  { field: 'year', caption: 'Year', draggable: false },
  { field: 'amount', caption: 'Amount', type: 'number' },
  { field: 'units', caption: 'Units', type: 'number' },
];

const MODEL: PivotModelInput = {
  rows: [{ field: 'region' }, { field: 'country' }],
  columns: [{ field: 'year' }],
  values: [{ field: 'amount', aggregate: 'sum' }],
  filters: [{ field: 'channel' }],
};

const ALL_AXES: PivotAxis[] = ['filters', 'columns', 'rows', 'values'];

/** Axis bar options, per-field icons and capabilities, and field moves with their cancellable events. */
export default function PivotTableAxisBarDemo() {
  const [showSort, setShowSort] = useState(true);
  const [showFilter, setShowFilter] = useState(true);
  const [showRemove, setShowRemove] = useState(true);
  const [draggable, setDraggable] = useState(true);
  const [showFieldsPanel, setShowFieldsPanel] = useState(true);
  const [axes, setAxes] = useState<PivotAxis[]>(ALL_AXES);
  const [lockFilters, setLockFilters] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const push = (line: string) => setLog((items) => [line, ...items].slice(0, 6));
  const pivot = usePivot<Sale>({
    data: SALES,
    fields: FIELDS,
    defaultPivotModel: MODEL,
    locale: 'en-US',
    onBeforeFieldMove: (event) => {
      if (lockFilters && event.to === 'filters') {
        event.preventDefault();
        push(`refused ${event.field} → filters`);
      }
    },
    onFieldMove: (event) => push(`${event.field}: ${event.from ?? 'none'} → ${event.to ?? 'removed'} at ${event.index} (${event.source})`),
  });
  const toggleAxis = (axis: PivotAxis, on: boolean) => setAxes((list) => (on ? ALL_AXES.filter((a) => a === axis || list.includes(a)) : list.filter((a) => a !== axis)));

  return (
    <div>
      <div className="demo-toolbar" role="group" aria-label="Axis bar options">
        <Checkbox checked={showSort} onCheckedChange={(checked) => setShowSort(checked)}>
          <code>showSort</code>
        </Checkbox>
        <Checkbox checked={showFilter} onCheckedChange={(checked) => setShowFilter(checked)}>
          <code>showFilter</code>
        </Checkbox>
        <Checkbox checked={showRemove} onCheckedChange={(checked) => setShowRemove(checked)}>
          <code>showRemove</code>
        </Checkbox>
        <Checkbox checked={draggable} onCheckedChange={(checked) => setDraggable(checked)}>
          <code>draggable</code>
        </Checkbox>
        <Checkbox checked={showFieldsPanel} onCheckedChange={(checked) => setShowFieldsPanel(checked)}>
          <code>showFieldsPanel</code>
        </Checkbox>
        <Checkbox checked={lockFilters} onCheckedChange={(checked) => setLockFilters(checked)}>
          Refuse moves to Filters
        </Checkbox>
      </div>
      <div className="demo-toolbar" role="group" aria-label="Axes shown">
        {ALL_AXES.map((axis) => (
          <Checkbox key={axis} checked={axes.includes(axis)} onCheckedChange={(checked) => toggleAxis(axis, checked)}>
            {axis}
          </Checkbox>
        ))}
      </div>
      <PivotAxisBar pivot={pivot} showSort={showSort} showFilter={showFilter} showRemove={showRemove} draggable={draggable} showFieldsPanel={showFieldsPanel} axes={axes} />
      <PivotTable pivot={pivot} height={300} aria-label="Sales by axis bar fields" />
      <div className="demo-log" aria-label="Field moves">
        {log.length ? (
          <ol>
            {log.map((line, i) => (
              <li key={`${i}-${line}`}>{line}</li>
            ))}
          </ol>
        ) : (
          'Drag a field button to another axis or reorder it. With the keyboard, focus a button and press Alt+ArrowUp or Alt+ArrowDown to reorder, Enter for its menu ("Move to"), or Delete to remove it.'
        )}
      </div>
    </div>
  );
}
