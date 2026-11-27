// Tuple row mode: rows stay the decoded wire arrays. Column accessors are
// resolved to a fixed index once, so reading a cell is `row[i]` with no
// per-row object materialization.

import type { RowId } from './types.js';

export type TupleRow = readonly unknown[];

/** Minimal structural view of a Data Grid engine `ColumnDef` (only the members tuple mode fills). */
export interface TupleColumnDefLike {
  readonly id?: string;
  readonly field?: string;
  readonly columns?: readonly TupleColumnDefLike[];
}

export interface TupleColumnHooks {
  readonly id?: string;
  readonly valueGetter?: (row: TupleRow) => unknown;
  readonly valueSetter?: (row: TupleRow, value: unknown) => TupleRow;
}

/** Index of each field in the tuple header. */
export function fieldIndex(fields: readonly string[]): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  fields.forEach((f, i) => map.set(f, i));
  return map;
}

/**
 * Returns column definitions whose `field` reads a tuple slot: `valueGetter`
 * is `row => row[i]` and `valueSetter` copies the tuple once. The `id`
 * defaults to the field so column identity does not change. Definitions
 * without a known field are returned unchanged; group headers recurse.
 */
export function tupleColumns<Def extends TupleColumnDefLike>(defs: readonly Def[], fields: readonly string[]): (Def & TupleColumnHooks)[] {
  const index = fieldIndex(fields);
  const map = (def: Def): Def & TupleColumnHooks => {
    if (def.columns) return { ...def, columns: def.columns.map((c) => map(c as Def)) };
    const at = def.field === undefined ? undefined : index.get(def.field);
    if (at === undefined) return def;
    return {
      ...def,
      id: (def.id ?? def.field) as string,
      valueGetter: (row: TupleRow) => row[at],
      valueSetter: (row: TupleRow, value: unknown) => {
        const next = row.slice();
        next[at] = value;
        return next;
      },
    };
  };
  return defs.map(map);
}

/** `getRowId` for tuple rows: the key slot as a string. */
export function tupleRowId(fields: readonly string[], key: string): (row: TupleRow) => RowId {
  const at = fields.indexOf(key);
  if (at < 0) throw new Error(`tupleRowId: key field "${key}" is not in the field list.`);
  return (row) => String(row[at]);
}
