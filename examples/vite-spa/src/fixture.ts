import type { DataGridColumn } from '@salmonui/data-grid';

export type Row = Record<string, string | number | boolean | Date> & { readonly id: string };

/**
 * Deterministic `large` fixture: 40 string, 30 number,
 * 20 date and 10 boolean columns per 100 columns. Strings and dates come from
 * shared pools so 100k rows stay near the documented size.
 */
export function createFixture(rowCount: number, columnCount: number, seed = 1): { rows: Row[]; columns: DataGridColumn<Row>[] } {
  let state = seed >>> 0;
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  const words = Array.from({ length: 256 }, (_, i) => `word-${i.toString(36)}-${(i * 7919) % 1000}`);
  const dates = Array.from({ length: 365 }, (_, i) => new Date(Date.UTC(2025, 0, 1 + i)));
  const kinds: ('s' | 'n' | 'd' | 'b')[] = [];
  for (let c = 0; c < columnCount; c++) {
    const slot = c % 10;
    kinds.push(slot < 4 ? 's' : slot < 7 ? 'n' : slot < 9 ? 'd' : 'b');
  }
  const keys = kinds.map((k, c) => `${k}${c}`);
  const rows: Row[] = new Array(rowCount);
  for (let r = 0; r < rowCount; r++) {
    const row: Record<string, string | number | boolean | Date> = { id: `r${r}` };
    for (let c = 0; c < columnCount; c++) {
      const key = keys[c] as string;
      switch (kinds[c]) {
        case 's':
          row[key] = words[next() & 255] as string;
          break;
        case 'n':
          row[key] = next() % 100000;
          break;
        case 'd':
          row[key] = dates[next() % 365] as Date;
          break;
        default:
          row[key] = ((next() >>> 16) & 1) === 1;
      }
    }
    rows[r] = row as Row;
  }
  const columns: DataGridColumn<Row>[] = [
    { field: 'id', header: 'ID', primaryKey: true, width: 90, pinned: 'start' },
    ...keys.map((field, c): DataGridColumn<Row> => {
      const kind = kinds[c];
      if (kind === 'n') return { field, header: `Number ${c}`, type: 'number', format: 'N0', align: 'end', width: 140 };
      if (kind === 'd') return { field, header: `Date ${c}`, type: 'date', format: 'yMMMd', width: 150 };
      if (kind === 'b') return { field, header: `Flag ${c}`, type: 'boolean', displayAsCheckbox: true, align: 'center', width: 110 };
      return { field, header: `Text ${c}`, type: 'string', width: 160, overflow: 'ellipsisWithTooltip' };
    }),
  ];
  return { rows, columns };
}
