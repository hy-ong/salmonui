// `?pivot`: a Pivot Table on local data, server rendered and hydrated
// (tests/browser/ssr-pivot.spec.ts). The first result is computed during the
// server render (local data under `deferComputeAbove`), so the HTML carries the
// row headers and the aggregated cells; PivotAxisBar and PivotFieldList share
// the store through `usePivot()`.
import { PivotAxisBar, PivotFieldList, PivotTable, usePivot } from '@salmonui/pivot-table';

interface Sale {
  region: string;
  country: string;
  product: string;
  year: number;
  amount: number;
  units: number;
}

const COUNTRIES = [
  ['Asia', 'Japan'],
  ['Asia', 'India'],
  ['Europe', 'France'],
  ['Europe', 'Germany'],
  ['Americas', 'Canada'],
] as const;
const PRODUCTS = ['Laptop', 'Phone', 'Desk'] as const;

/** 600 deterministic rows: amount = 10 + i % 90, units = 1 + i % 7. */
const SALES: Sale[] = Array.from({ length: 600 }, (_, i) => {
  const [region, country] = COUNTRIES[i % COUNTRIES.length] as readonly [string, string];
  return { region, country, product: PRODUCTS[(i >> 1) % PRODUCTS.length] as string, year: 2024 + (i % 3), amount: 10 + (i % 90), units: 1 + (i % 7) };
});

const FIELDS = [
  { field: 'region', caption: 'Region', type: 'string' },
  { field: 'country', caption: 'Country', type: 'string' },
  { field: 'product', caption: 'Product', type: 'string' },
  { field: 'year', caption: 'Year', type: 'number' },
  { field: 'amount', caption: 'Amount', type: 'number' },
  { field: 'units', caption: 'Units', type: 'number' },
] as const;

export function Pivot() {
  const pivot = usePivot<Sale>({
    data: SALES,
    fields: FIELDS,
    locale: 'en-US',
    defaultPivotModel: { rows: [{ field: 'region' }, { field: 'country' }], columns: [{ field: 'year' }], values: [{ field: 'amount', aggregate: 'sum' }], expanded: [['rows', 'Asia']] },
  });
  return (
    <main id="pivot-ssr" style={{ display: 'grid', gap: 12, padding: 16 }}>
      <PivotAxisBar pivot={pivot} />
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 0', minWidth: 0 }}>
          <PivotTable pivot={pivot} aria-label="Sales by region" height={320} />
        </div>
        <PivotFieldList pivot={pivot} style={{ flex: '0 0 320px' }} />
      </div>
    </main>
  );
}
