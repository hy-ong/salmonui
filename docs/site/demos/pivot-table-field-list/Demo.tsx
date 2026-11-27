'use client';

import { useState } from 'react';
import { PivotFieldList, PivotTable, usePivot, type PivotFieldDefinition, type PivotModelInput } from '@salmonui/pivot-table';
import { Checkbox } from '@salmonui/inputs/checkbox';

type Order = { region: string; country: string; channel: string; product: string; year: string; revenue: number; cost: number; orders: number; internalId: string };

const COUNTRIES: Record<string, string[]> = { Asia: ['Japan', 'India'], Europe: ['France', 'Germany'] };
const PRODUCTS = ['Bikes', 'Helmets', 'Gloves'];
const CHANNELS = ['Online', 'Retail'];

function makeOrders(): Order[] {
  const rows: Order[] = [];
  let n = 0;
  for (const [region, countries] of Object.entries(COUNTRIES)) {
    for (const country of countries) {
      for (const product of PRODUCTS) {
        for (const channel of CHANNELS) {
          for (const year of ['2025', '2026']) {
            n++;
            const revenue = ((n * 211) % 800) + 200;
            rows.push({ region, country, channel, product, year, revenue, cost: Math.round(revenue * 0.6), orders: (n % 9) + 1, internalId: `ord-${n}` });
          }
        }
      }
    }
  }
  return rows;
}

const ORDERS = makeOrders();

// Folders group the field list; `hidden` keeps a field off the list.
const FIELDS: PivotFieldDefinition<Order>[] = [
  { field: 'region', caption: 'Region', type: 'string', folder: 'Geography' },
  { field: 'country', caption: 'Country', type: 'string', folder: 'Geography' },
  { field: 'channel', caption: 'Channel', type: 'string' },
  { field: 'product', caption: 'Product', type: 'string', removable: false },
  { field: 'year', caption: 'Year', type: 'string' },
  { field: 'revenue', caption: 'Revenue', type: 'number', folder: 'Measures' },
  { field: 'cost', caption: 'Cost', type: 'number', folder: 'Measures' },
  { field: 'orders', caption: 'Orders', type: 'number', folder: 'Measures' },
  { field: 'internalId', caption: 'Internal id', type: 'string', hidden: true },
];

const MODEL: PivotModelInput = {
  rows: [{ field: 'product' }],
  columns: [{ field: 'year' }],
  values: [
    { field: 'revenue', aggregate: 'sum' },
    { field: 'orders', aggregate: 'count' },
  ],
};

/** A standalone field list with deferred updates: moves edit a draft until Apply. */
export default function PivotTableFieldListDemo() {
  const [deferUpdate, setDeferUpdate] = useState(true);
  const [last, setLast] = useState('none yet');
  const pivot = usePivot<Order>({
    data: ORDERS,
    fields: FIELDS,
    defaultPivotModel: MODEL,
    locale: 'en-US',
    onBeforeFieldMove: (event) => {
      // Keep at least one value field on the report.
      if (event.from === 'values' && event.to === null && (pivot.getSnapshot().draft ?? pivot.model).values.length === 1) event.preventDefault();
    },
    onFieldMove: (event) => setLast(`${event.field}: ${event.from ?? 'list'} → ${event.to ?? 'removed'} at ${event.index} (${event.source})`),
  });
  return (
    <div>
      <div className="demo-toolbar">
        <Checkbox checked={deferUpdate} onCheckedChange={(checked) => setDeferUpdate(checked)}>
          Defer layout update
        </Checkbox>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <PivotFieldList pivot={pivot} deferUpdate={deferUpdate} fieldOrder="asc" aria-label="Order fields" style={{ flex: '1 1 300px', minInlineSize: 0 }} />
        <div style={{ flex: '999 1 380px', minInlineSize: 0 }}>
          <PivotTable pivot={pivot} height={320} aria-label="Orders by product and year" />
        </div>
      </div>
      <p className="demo-status" aria-live="polite">
        Last move: <code>{last}</code>
      </p>
    </div>
  );
}
