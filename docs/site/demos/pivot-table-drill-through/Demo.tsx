'use client';

import { useState } from 'react';
import { PivotTable, type PivotFieldDefinition, type PivotModelInput } from '@salmonui/pivot-table';

type Sale = { region: string; product: string; year: string; amount: number; units: number };

const REGIONS = ['Asia', 'Europe', 'Americas'];
const PRODUCTS = ['Bikes', 'Helmets', 'Gloves'];

function makeSales(): Sale[] {
  const rows: Sale[] = [];
  let n = 0;
  for (const region of REGIONS) {
    for (const product of PRODUCTS) {
      for (const year of ['2025', '2026']) {
        for (let k = 0; k < 4; k++) {
          n++;
          const amount = ((n * 173) % 700) + 100;
          rows.push({ region, product, year, amount, units: (amount % 23) + 1 });
        }
      }
    }
  }
  return rows;
}

const INITIAL = makeSales();

const FIELDS: PivotFieldDefinition<Sale>[] = [
  { field: 'region', caption: 'Region', type: 'string' },
  { field: 'product', caption: 'Product', type: 'string' },
  { field: 'year', caption: 'Year', type: 'string' },
  { field: 'amount', caption: 'Amount', type: 'number' },
  { field: 'units', caption: 'Units', type: 'number' },
];

const MODEL: PivotModelInput = {
  rows: [{ field: 'region' }, { field: 'product' }],
  columns: [{ field: 'year' }],
  values: [{ field: 'amount', aggregate: 'sum' }],
};

/** Double-click (or Enter on) a value cell to see its raw rows; edits write through and re-aggregate. */
export default function PivotTableDrillThroughDemo() {
  const [data, setData] = useState<readonly Sale[]>(INITIAL);
  const [status, setStatus] = useState(`${INITIAL.length} raw rows`);
  return (
    <div>
      <PivotTable<Sale>
        data={data}
        fields={FIELDS}
        defaultPivotModel={MODEL}
        locale="en-US"
        height={320}
        drillThrough={{ maxRows: 50 }}
        editing={{ mode: 'row' }}
        onDrillThrough={(event) => setStatus(`Drill through ${event.rowKey || 'Grand Total'} × ${event.columnKey || 'Grand Total'}: ${event.rows().length} rows`)}
        onDataChange={(event) => {
          setData(event.data);
          setStatus(`${event.action}: ${event.changes.length} row(s) written, ${event.data.length} raw rows`);
        }}
        aria-label="Sales with drill through"
      />
      <p className="demo-status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
