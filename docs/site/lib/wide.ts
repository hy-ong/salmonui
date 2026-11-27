import type { DataGridColumn } from '@salmonui/data-grid';
import { cellHash, type WideRow } from './fixtures';

const WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet'];

/**
 * Columns of the wide fixture: values derive from the row index, so a million
 * rows cost one small object each and server and client agree.
 */
export function createWideColumns(count: number): DataGridColumn<WideRow>[] {
  const columns: DataGridColumn<WideRow>[] = [{ id: 'row', field: 'id', header: '#', type: 'number', format: 'N0', width: 90, align: 'end', primaryKey: true }];
  for (let c = 1; c < count; c++) {
    if (c % 3 === 0) {
      columns.push({ id: `s${c}`, header: `Text ${c}`, width: 130, valueGetter: (row) => `${WORDS[cellHash(row.id, c) % WORDS.length]}-${row.id % 97}` });
    } else {
      columns.push({ id: `n${c}`, header: `Value ${c}`, type: 'number', format: 'N0', align: 'end', width: c % 2 === 0 ? 110 : '8%', minWidth: 100, valueGetter: (row) => cellHash(row.id, c) % 100_000 });
    }
  }
  return columns;
}
