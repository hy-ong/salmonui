// Utility columns: the row drag handle (`rowDrag`) and the detail
// expand/collapse toggle (`renderDetail` / `childGrid`), placed before the
// user columns. They are
// pinned to the start when any user column is pinned there, carry
// `meta.utility` (excluded from export), and count in `aria-colcount`
// (leaf count including utility columns).
// Results are cached per input array so the column resolver sees a stable
// identity while nothing changes.

import { DEFAULT_LOCALE_TEXT } from '@salmonui/data-grid/engine/locale';
import { hasDetailContent } from './features/detect.js';
import type { DataGridFeatureParts } from './features/types.js';
import type { DataGridColumn, DataGridProps } from './types.js';

const cache = new WeakMap<readonly DataGridColumn<any>[], Map<string, readonly DataGridColumn<any>[]>>();

function pinnedStart(columns: readonly DataGridColumn<any>[]): boolean {
  return columns.some((c) => (c.columns?.length ? pinnedStart(c.columns) : c.pinned === 'start'));
}

/**
 * `columns` with the utility columns the props need in front (the same array
 * when none). The handle column comes from the `rowDrag` render feature
 * (`rowDragColumn` part) and the toggle column from the `detail` render
 * feature (`detailToggleColumn` part); each is `null` without its feature.
 */
export function withUtilityColumns<Row>(
  props: DataGridProps<Row>,
  columns: readonly DataGridColumn<Row>[],
  parts: Pick<DataGridFeatureParts, 'rowDragColumn' | 'detailToggleColumn'>,
): readonly DataGridColumn<Row>[] {
  const { rowDragColumn, detailToggleColumn } = parts;
  const drag = rowDragColumn !== null && !!props.rowDrag;
  const detail = detailToggleColumn !== null && hasDetailContent(props);
  if (!drag && !detail) return columns;
  // Plain catalog strings (column headers are compiled once per text).
  const text = props.localeText;
  const dragHeader = typeof text?.rowDragColumnHeader === 'string' ? text.rowDragColumnHeader : DEFAULT_LOCALE_TEXT.rowDragColumnHeader;
  const detailHeader = typeof text?.detailColumnHeader === 'string' ? text.detailColumnHeader : DEFAULT_LOCALE_TEXT.detailColumnHeader;
  const pin = pinnedStart(columns);
  const key = `${drag ? dragHeader : ''}\u0000${detail ? detailHeader : ''}\u0000${pin}`;
  let byKey = cache.get(columns);
  if (!byKey) cache.set(columns, (byKey = new Map()));
  let out = byKey.get(key);
  if (!out) {
    const extra: DataGridColumn<Row>[] = [];
    if (drag) extra.push(rowDragColumn(dragHeader, pin) as DataGridColumn<Row>);
    if (detail) extra.push(detailToggleColumn(detailHeader, pin) as DataGridColumn<Row>);
    out = Object.freeze([...extra, ...columns]);
    byKey.set(key, out);
  }
  return out as readonly DataGridColumn<Row>[];
}
