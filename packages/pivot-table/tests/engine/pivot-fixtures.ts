// Shared pivot fixtures (`pivot`).
import assert from 'node:assert/strict';
import type { PivotResult } from '@salmonui/pivot-table/engine';

export interface SaleRow {
  readonly region: string;
  readonly country: string;
  readonly product: string;
  readonly year: number;
  readonly quarter: string;
  readonly amount: number;
  readonly units: number;
  readonly date: string;
}

/** A small hand-checkable sales table. */
export const SALES: readonly SaleRow[] = Object.freeze([
  { region: 'Asia', country: 'Japan', product: 'Bike', year: 2024, quarter: 'Q1', amount: 100, units: 1, date: '2024-01-15' },
  { region: 'Asia', country: 'Japan', product: 'Car', year: 2024, quarter: 'Q2', amount: 200, units: 2, date: '2024-04-02' },
  { region: 'Asia', country: 'India', product: 'Bike', year: 2025, quarter: 'Q1', amount: 50, units: 5, date: '2025-02-20' },
  { region: 'Europe', country: 'France', product: 'Bike', year: 2024, quarter: 'Q1', amount: 300, units: 3, date: '2024-03-30' },
  { region: 'Europe', country: 'France', product: 'Car', year: 2025, quarter: 'Q2', amount: 400, units: 4, date: '2025-05-05' },
  { region: 'Europe', country: 'Germany', product: 'Car', year: 2025, quarter: 'Q1', amount: 150, units: 1, date: '2025-01-09' },
  { region: 'America', country: 'USA', product: 'Bike', year: 2024, quarter: 'Q2', amount: 250, units: 2, date: '2024-06-11' },
]);

export interface PivotFixtureRow {
  readonly r0: string;
  readonly r1: string;
  readonly r2: string;
  readonly c0: string;
  readonly c1: string;
  readonly amount: number;
  readonly units: number;
}

/**
 * The `pivot` fixture: deterministic (seeded), 3 row fields (50 x 20 x 50
 * members), 2 column fields (25 x 10), 2 value fields. Fully expanded it is
 * about 50,000 row leaves x 250 column tuples x 2 values (500 value columns).
 */
export function pivotFixture(count = 1_000_000): PivotFixtureRow[] {
  let seed = 0x2f6b3c1d;
  const rand = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  const names = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(2, '0')}`);
  const R0 = names('Region ', 50);
  const R1 = names('Country ', 20);
  const R2 = names('City ', 50);
  const C0 = names('Year ', 25);
  const C1 = names('Product ', 10);
  const rows: PivotFixtureRow[] = new Array(count);
  for (let i = 0; i < count; i++) {
    rows[i] = {
      r0: R0[(rand() * 50) | 0]!,
      r1: R1[(rand() * 20) | 0]!,
      r2: R2[(rand() * 50) | 0]!,
      c0: C0[(rand() * 25) | 0]!,
      c1: C1[(rand() * 10) | 0]!,
      amount: Math.round(rand() * 10_000) / 100,
      units: (rand() * 20) | 0,
    };
  }
  return rows;
}

/** `[label, ...values]` per visible row; values in column order. */
export function table(r: PivotResult): (string | number | null)[][] {
  const out: (string | number | null)[][] = [];
  for (let i = 0; i < r.rowCount; i++) {
    const row: (string | number | null)[] = [r.memberAt('rows', i).label];
    for (let c = 0; c < r.columnCount; c++) row.push(r.valueAt(i, c));
    out.push(row);
  }
  return out;
}
/** Tables equal up to floating point noise. */
export function assertNear(a: (string | number | null)[][], b: (string | number | null)[][]) {
  assert.equal(a.length, b.length);
  a.forEach((row, i) =>
    row.forEach((v, j) => {
      const w = b[i]![j];
      if (typeof v === 'number' && typeof w === 'number') assert.ok(Math.abs(v - w) <= 1e-9 * Math.max(1, Math.abs(w)), `${i},${j}: ${v} vs ${w}`);
      else assert.equal(v, w, `${i},${j}`);
    }),
  );
}
export const columnKeys = (r: PivotResult) => Array.from({ length: r.columnCount }, (_, c) => r.memberAt('columns', c).key);
export const rowKeys = (r: PivotResult) => Array.from({ length: r.rowCount }, (_, c) => r.memberAt('rows', c).key);

