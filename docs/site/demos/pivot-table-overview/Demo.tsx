'use client';

import { useState } from 'react';
import { PivotAxisBar, PivotFieldList, PivotTable, PivotToolbar, usePivot, type PivotFieldDefinition, type PivotModelInput } from '@salmonui/pivot-table';

type Sale = { region: string; country: string; product: string; year: string; quarter: string; amount: number; units: number };

const COUNTRIES: Record<string, string[]> = { Asia: ['Japan', 'India'], Europe: ['France', 'Germany'], Americas: ['Brazil', 'Canada'] };
const PRODUCTS = ['Bikes', 'Helmets', 'Gloves'];

/** 144 deterministic sales rows: 6 countries x 3 products x 2 years x 4 quarters. */
function makeSales(): Sale[] {
  const rows: Sale[] = [];
  let c = 0;
  for (const [region, countries] of Object.entries(COUNTRIES)) {
    for (const country of countries) {
      c++;
      PRODUCTS.forEach((product, p) => {
        for (const year of [2025, 2026]) {
          for (let q = 1; q <= 4; q++) {
            const amount = ((c * 137 + (p + 1) * 61 + (year - 2024) * 89 + q * 17) % 900) + 100;
            rows.push({ region, country, product, year: String(year), quarter: `Q${q}`, amount, units: (amount % 37) + 3 });
          }
        }
      });
    }
  }
  return rows;
}

const SALES = makeSales();

const FIELDS: PivotFieldDefinition<Sale>[] = [
  { field: 'region', caption: 'Region', type: 'string' },
  { field: 'country', caption: 'Country', type: 'string' },
  { field: 'product', caption: 'Product', type: 'string' },
  { field: 'year', caption: 'Year', type: 'string' },
  { field: 'quarter', caption: 'Quarter', type: 'string' },
  { field: 'amount', caption: 'Amount', type: 'number' },
  { field: 'units', caption: 'Units', type: 'number' },
];

const MODEL: PivotModelInput = {
  rows: [{ field: 'region' }, { field: 'country' }],
  columns: [{ field: 'year' }],
  values: [{ field: 'amount', aggregate: 'sum' }],
  formats: { amount: { number: { style: 'currency', currency: 'USD', maximumFractionDigits: 0 } } },
};

/** One `usePivot()` store shared by the toolbar, the axis bar, the table and a standalone field list. */
export default function PivotTableOverviewDemo() {
  const [log, setLog] = useState<string[]>([]);
  const pivot = usePivot<Sale>({
    data: SALES,
    fields: FIELDS,
    defaultPivotModel: MODEL,
    locale: 'en-US',
    onPivotModelChange: (event) => setLog((items) => [`${event.action}${event.field ? ` ${event.field}` : ''}`, ...items].slice(0, 6)),
  });
  const result = pivot.result;
  return (
    <div>
      <PivotToolbar pivot={pivot} items={['fieldList', 'totals', 'formatting', 'expandAll', 'collapseAll', 'export']} aria-label="Report toolbar" style={{ marginBlockEnd: 8 }} />
      <PivotAxisBar pivot={pivot} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBlockStart: 8 }}>
        <div style={{ flex: '999 1 420px', minInlineSize: 0 }}>
          <PivotTable pivot={pivot} height={360} fieldList="popup" aria-label="Sales by region and year" />
        </div>
        <PivotFieldList pivot={pivot} aria-label="Report fields" style={{ flex: '1 1 280px', minInlineSize: 0 }} />
      </div>
      <p className="demo-status" aria-live="polite">
        Status <code>{pivot.status}</code> · {result ? `${result.rowCount} rows × ${result.columnCount} value columns` : 'no result'}
      </p>
      <div className="demo-log" aria-label="Model changes">
        {log.length ? (
          <ol>
            {log.map((line, i) => (
              <li key={`${i}-${line}`}>{line}</li>
            ))}
          </ol>
        ) : (
          'Drag a field, open a field menu or use the toolbar.'
        )}
      </div>
    </div>
  );
}
