// Aggregate need table of the group stage. A small file shared by `sort.ts`, `grouping.ts` and
// `aggregates.ts`, so the sort stage can warm the numeric keys of aggregated
// columns without importing the aggregates module.

import type { AggregateType, ColumnSnapshot, CompiledColumn, DataQuery } from './types.js';

/** Per-column accumulator bits an aggregate type needs. */
export const Need = {
  Sum: 1,
  MinMax: 2,
  Bool: 4,
} as const;

/** Accumulator bits of an aggregate type (0: computed lazily, e.g. `count` / `custom`). */
export function needOf(type: AggregateType): number {
  switch (type) {
    case 'sum':
    case 'average':
      return Need.Sum;
    case 'min':
    case 'max':
      return Need.MinMax;
    case 'trueCount':
    case 'falseCount':
      return Need.Bool;
    default:
      return 0;
  }
}

/** Non-string leaf columns the query aggregates (warmed together with the sort/group keys in one row pass). */
export function aggregatedNumericColumns<Row>(query: DataQuery, columns: ColumnSnapshot<Row>): CompiledColumn<Row>[] {
  const out: CompiledColumn<Row>[] = [];
  for (const d of query.aggregates) {
    if (needOf(d.type) === 0) continue;
    const column = columns.byId.get(d.columnId);
    if (column?.leaf && column.type !== 'string' && !out.includes(column)) out.push(column);
  }
  return out;
}
