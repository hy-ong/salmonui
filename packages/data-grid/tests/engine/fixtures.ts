import type { ColumnDef, DataGridWarning } from '@salmonui/data-grid/engine';

export interface Person {
  readonly id: string;
  readonly name: string;
  readonly age: number | null;
  readonly active: boolean;
  readonly joined: Date;
  readonly address: { readonly city: string };
}

export function people(count = 5): Person[] {
  const cities = ['Taipei', 'Kuala Lumpur', 'Tokyo'];
  const out: Person[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: `p${i}`,
      name: `Person ${i}`,
      age: i === 0 ? null : 20 + i,
      active: i % 2 === 0,
      joined: new Date(Date.UTC(2024, 0, 1 + i)),
      address: { city: cities[i % cities.length] as string },
    });
  }
  return out;
}

export const personColumns: readonly ColumnDef<Person>[] = [
  { field: 'id', primaryKey: true, header: 'ID' },
  { field: 'name', header: 'Name' },
  { field: 'age', header: 'Age' },
  { field: 'active' },
  { field: 'joined', format: 'yMd' },
  { field: 'address.city', header: 'City' },
];

export function collectWarnings(): { warnings: DataGridWarning[]; onWarning: (w: DataGridWarning) => void; codes(): string[] } {
  const warnings: DataGridWarning[] = [];
  return {
    warnings,
    onWarning: (w) => {
      warnings.push(w);
    },
    codes: () => warnings.map((w) => w.code),
  };
}

export type WideRow = Record<string, string | number | boolean | Date> & { readonly id: string };

/**
 * Deterministic `large` fixture: 40 string, 30 number,
 * 20 date, 10 boolean columns. Strings and dates come from small shared pools
 * so the fixture itself stays near the documented ~80 MB.
 */
export function wideFixture(rowCount: number, seed = 1): { rows: WideRow[]; columns: ColumnDef<WideRow>[] } {
  let state = seed >>> 0;
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  const words = Array.from({ length: 256 }, (_, i) => `word-${i}`);
  const dates = Array.from({ length: 365 }, (_, i) => new Date(Date.UTC(2025, 0, 1 + i)));
  const keys: string[] = [];
  for (let c = 0; c < 40; c++) keys.push(`s${c}`);
  for (let c = 0; c < 30; c++) keys.push(`n${c}`);
  for (let c = 0; c < 20; c++) keys.push(`d${c}`);
  for (let c = 0; c < 10; c++) keys.push(`b${c}`);
  const rows: WideRow[] = new Array(rowCount);
  for (let r = 0; r < rowCount; r++) {
    const row: Record<string, string | number | boolean | Date> = { id: `r${r}` };
    for (let c = 0; c < 40; c++) row[`s${c}`] = words[next() & 255] as string;
    for (let c = 0; c < 30; c++) row[`n${c}`] = next() % 100000;
    for (let c = 0; c < 20; c++) row[`d${c}`] = dates[next() % 365] as Date;
    for (let c = 0; c < 10; c++) row[`b${c}`] = (next() & 1) === 1;
    // 100 computed-key stores turn `row` into a dictionary-mode object; the
    // spread copy is a fast-mode object, as rows from JSON.parse or object
    // literals are. Dictionary rows also made every read of a column depend
    // on where the garbage collector had scattered their property tables in
    // that process, so the cold timings changed from process to process.
    rows[r] = { ...row } as WideRow;
  }
  const columns: ColumnDef<WideRow>[] = keys.map((field) => ({ field, width: 160 }));
  return { rows, columns };
}
