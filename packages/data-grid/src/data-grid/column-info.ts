// Public column view (`DataGridColumnInfo`) of a compiled column. Render props
// and events receive this view instead of the engine's `CompiledColumn`, so
// engine-internal names (`headerText`, `flags.allow*`, `freeze`, accessors,
// module metadata) never reach applications. One frozen view per compiled
// column (compiled columns are immutable), built on first use: rendering
// plain cells never builds one.

import type { CompiledColumn } from '@salmonui/data-grid/engine';
import type { DataGridColumnInfo } from './feature-types.js';

const views = new WeakMap<CompiledColumn<any>, DataGridColumnInfo<any>>();
const compiled = new WeakMap<DataGridColumnInfo<any>, CompiledColumn<any>>();

/** The public view of a compiled column (cached per column). */
export function columnInfo<Row>(column: CompiledColumn<Row>): DataGridColumnInfo<Row> {
  let view = views.get(column) as DataGridColumnInfo<Row> | undefined;
  if (view) return view;
  const def = column.def;
  const flags = column.flags;
  view = Object.freeze({
    id: column.columnId,
    field: column.field,
    header: column.headerText,
    type: column.type,
    format: def.format,
    align: def.align,
    headerAlign: def.headerAlign,
    width: column.width.initial,
    minWidth: column.width.min,
    maxWidth: column.width.max,
    pinned: column.freeze === 'left' ? 'start' : column.freeze === 'right' ? 'end' : column.freeze === 'fixed' ? 'center' : null,
    hidden: def.hidden === true,
    sortable: flags.allowSorting,
    filterable: flags.allowFiltering,
    searchable: flags.allowSearching,
    groupable: flags.allowGrouping,
    editable: flags.allowEditing,
    resizable: flags.allowResizing,
    reorderable: flags.allowReordering,
    hideable: flags.showInColumnChooser,
    primaryKey: flags.isPrimaryKey,
    lockPosition: flags.lockColumn,
    displayAsCheckbox: flags.displayAsCheckBox,
    leaf: column.leaf,
    depth: column.depth,
    path: column.path,
    children: column.children,
    definition: def as unknown as Readonly<Record<string, unknown>>,
    getValue: (row: Row) => column.accessor(row),
    formatValue: (value: unknown, row: Row) => column.formatter(value, row),
  }) as DataGridColumnInfo<Row>;
  views.set(column, view);
  compiled.set(view, column);
  return view;
}

/** Public views of several columns. */
export function columnInfos<Row>(columns: readonly CompiledColumn<Row>[]): readonly DataGridColumnInfo<Row>[] {
  return Object.freeze(columns.map(columnInfo));
}

/** The compiled column behind a public view (internal callers that received a view). */
export function compiledOf<Row>(view: DataGridColumnInfo<Row>): CompiledColumn<Row> | undefined {
  return compiled.get(view) as CompiledColumn<Row> | undefined;
}
