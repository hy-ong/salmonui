'use client';

// Pager filter status:
// with the filter row (`filtering.ui: 'row'`) and
// `filtering.showStatus` (default true), the default pager shows the applied
// filters as "Filtered by Customer: Contains ann; Amount: Greater than 50".
// The message lives in the pager only: a grid without a
// pager shows none. Every applied condition is listed, whatever set it (the
// filter row, a menu, a method or `filtering.filters`); nested groups are
// flattened. The text renders on the server (initial filters) and re-renders
// only when the filter list, the columns or the catalog change.

import type { ColumnSnapshot, CompiledColumn, FilterEntry, Json } from '@salmonui/data-grid/engine';
import { memo, useMemo } from 'react';
import { useEngineSelector, useDataGridInstance, useDataGridText } from './context.js';
import { formatFilterValue, NO_VALUE_OPERATORS, operatorLabel } from './filter-ui.js';
import type { DataGridText } from './locale-text.js';

/** Values of an `in` / `notIn` list shown before the ellipsis. */
const MAX_LISTED_VALUES = 5;

// `filterStatusEnabled` lives in query-config.ts: the grid reads it on every render, while this module
// (the status text and line) loads with the pager.

function valueText(column: CompiledColumn<unknown> | undefined, operator: string, value: Json, text: DataGridText): string {
  if (NO_VALUE_OPERATORS.has(operator)) return '';
  const one = (v: Json): string => {
    const out = column ? formatFilterValue(column, v) : v === null ? '' : String(v);
    return out === '' ? text('blank') : out;
  };
  if (!Array.isArray(value)) return one(value);
  if (operator === 'between') return value.map(one).join(' – ');
  const shown = value.slice(0, MAX_LISTED_VALUES).map(one).join(', ');
  return value.length > MAX_LISTED_VALUES ? `${shown}, …` : shown;
}

/** The status message of the applied filters, or '' when none apply. */
export function filterStatusText(filters: readonly FilterEntry[], columns: ColumnSnapshot<unknown>, text: DataGridText): string {
  const parts: string[] = [];
  const visit = (entries: readonly FilterEntry[]): void => {
    for (const entry of entries) {
      if (entry.kind === 'group') visit(entry.filters);
      else {
        const column = columns.byId.get(entry.columnId);
        const { columnId, operator } = entry;
        parts.push(text('filterStatusCondition', { column: column?.headerText ?? columnId, operator: operatorLabel(text, operator), value: valueText(column, operator, entry.value, text) }).trim());
      }
    }
  };
  visit(filters);
  return parts.length ? text('filterStatus', { conditions: parts.join(text('filterStatusSeparator')) }) : '';
}

/** The filter status line of the default pager (`.salmon-data-grid-pager__filter-status`). */
export const DataGridFilterStatus = memo(function DataGridFilterStatus() {
  const instance = useDataGridInstance<unknown>();
  const text = useDataGridText();
  const filters = useEngineSelector(instance, (s) => s.query.filters);
  const columns = useEngineSelector(instance, (s) => s.columns);
  const status = useMemo(() => filterStatusText(filters, columns, text), [filters, columns, text]);
  if (!status) return null;
  return (
    <div className="salmon-data-grid-pager__filter-status" data-filter-status="">
      {status}
    </div>
  );
});
