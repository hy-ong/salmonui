import type { DataGridColumn } from '@salmonui/data-grid';
import type { Row } from './fixture.ts';

/** Lookup table of the `?lookup` switch: the s2 cells hold `code`, the grid shows `title`. */
export const STATUS_LOOKUP = [
  { code: 0, title: 'Open' },
  { code: 1, title: 'Closed' },
  { code: 2, title: 'Pending' },
  { code: 3, title: 'On hold' },
] as const;

/**
 * `?lookup`: replaces the s2 values with keys 0..3 (row index % 4)
 * and turns the s2 column into a local lookup column (header "Status").
 */
export function applyLookup(rows: Row[], columns: DataGridColumn<Row>[]): void {
  const at = columns.findIndex((c) => c.field === 's2');
  const s2 = columns[at];
  if (!s2) return;
  for (let i = 0; i < rows.length; i++) (rows[i] as Record<string, unknown>)['s2'] = i % STATUS_LOOKUP.length;
  // The cells hold numbers now: drop the fixture's `type: 'string'`.
  const { type: _type, ...rest } = s2;
  columns[at] = { ...rest, header: 'Status', lookup: { data: STATUS_LOOKUP, keyField: 'code', displayField: 'title' } };
}
