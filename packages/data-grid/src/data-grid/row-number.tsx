'use client';

// Row number column (`type: 'rowNumber'`). The number is the 1-based
// position of the data row in the current view, across pages: the page start
// plus the data index of the visible row (`dataIndexAt`: group captions,
// group footers, and detail rows are not counted). It is derived from the
// visible index the row renders at, so it costs O(log groups) per rendered
// row-number cell and nothing for other columns; under virtualization only
// rendered rows compute one.

import type { DataGridSnapshot } from '@salmonui/data-grid/engine';
import { dataIndexAt } from '@salmonui/data-grid/engine/expansion';
import { useEngineSelector } from './context.js';
import type { DataGridInstance } from './instance.js';
import type { DataGridColumn } from './types.js';

/** Default id of a `type: 'rowNumber'` column without `id` or `field`. */
export const ROW_NUMBER_COLUMN_ID = '__salmon_row_number';

/**
 * Row number column defaults (header from `localeText.rowNumberColumnHeader`,
 * narrow, end-aligned, no sort / filter / search / group / edit). The
 * definition's own fields win. Returns a new object only for row number columns.
 */
export function rowNumberColumnDef<Row>(column: DataGridColumn<Row>, header: string): DataGridColumn<Row> {
  return {
    ...(column.field === undefined && column.id === undefined ? { id: ROW_NUMBER_COLUMN_ID } : {}),
    header,
    width: 64,
    minWidth: 40,
    align: 'end',
    sortable: false,
    filterable: false,
    searchable: false,
    groupable: false,
    editable: false,
    ...column,
  };
}

/** 1-based number of the data row at visible `rowIndex`, or 0 for a synthetic row. */
export function rowNumberAt<Row>(instance: DataGridInstance<Row>, snapshot: DataGridSnapshot<Row>, rowIndex: number): number {
  const index = dataIndexAt(snapshot.rows, rowIndex);
  if (index < 0) return 0;
  return (instance.query.pageInfo()?.start ?? 0) + index + 1;
}

/** Number text of a row-number cell; re-renders when the number changes (view, page, grouping). */
export function DataGridRowNumber<Row>({ instance, rowIndex }: { instance: DataGridInstance<Row>; rowIndex: number }) {
  const n = useEngineSelector(instance, (s) => rowNumberAt(instance, s, rowIndex));
  return <>{n > 0 ? String(n) : ''}</>;
}
