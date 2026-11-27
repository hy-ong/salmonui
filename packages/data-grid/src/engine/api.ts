import type { GroupRowSnapshot, GroupTarget } from './grouping.js';
import type { ColumnFacet, FacetOptions } from './filter.js';
import type { PageInfo } from './paging.js';
import type {
  AggregateValues,
  CellSnapshot,
  ColumnId,
  CommandResult,
  CompiledColumn,
  DataSource,
  Json,
  DataGridEngine,
  RowId,
  RowSnapshot,
} from './types.js';

/** Options of `DataGridApi.filterColumn`. */
export interface FilterColumnOptions {
  /** Combination with the column's previous condition. Default `and`. */
  readonly logic?: 'and' | 'or';
  readonly matchCase?: boolean;
  readonly ignoreAccents?: boolean;
}

/**
 * Imperative DataGrid API over an engine (re-exported by `@salmonui/data-grid` as
 * `DataGridCoreApi` and extended there). Every method that takes a column accepts
 * a `field` or a column id: the column id wins, else the first leaf with that
 * `field`. Mutating methods dispatch a serializable command and return its
 * `CommandResult`; read methods return engine-owned frozen values or raw row
 * references.
 */
export interface DataGridApi<Row> {
  readonly engine: DataGridEngine<Row>;
  /** Leaf column by column id, else the first leaf with that `field`. */
  getColumn(fieldOrId: string): CompiledColumn<Row> | undefined;
  /** Every leaf column in definition order, including hidden ones. */
  getColumns(): readonly CompiledColumn<Row>[];
  /** Visible leaves in runtime order. */
  getVisibleColumns(): readonly CompiledColumn<Row>[];
  /** Leaves hidden at runtime, in definition order. */
  getHiddenColumns(): readonly CompiledColumn<Row>[];
  /** Visible leaf at an index of `getVisibleColumns()`. */
  getColumnAt(index: number): CompiledColumn<Row> | undefined;
  /** Index of a column in `getVisibleColumns()`, or -1. */
  getColumnIndex(fieldOrId: string): number;
  showColumns(fieldsOrIds: string | readonly string[]): CommandResult;
  hideColumns(fieldsOrIds: string | readonly string[]): CommandResult;
  /** Rows of the current view (after the query pipeline), as raw references. */
  getViewRows(): readonly Row[];
  /**
   * Rows passing search and every filter, in sort order, across every page,
   * as raw references. Without the
   * `filter` module, every row.
   */
  getFilteredRows(): readonly Row[];
  getRow(rowId: RowId): Row | undefined;
  getRowInfo(rowId: RowId): RowSnapshot<Row> | undefined;
  /** Visible index of a row, or -1. */
  getRowIndex(rowId: RowId): number;
  /** Row id at a visible index (the inverse of `getRowIndex`), or undefined. */
  getRowIdAt(index: number): RowId | undefined;
  getCell(rowId: RowId, field: string): CellSnapshot | undefined;
  getDataSource(): DataSource<Row>;
  /** `field` of each `primaryKey` leaf column, in column order. */
  getPrimaryKeyFields(): readonly string[];
  /** `multiple` adds to the current sort (Ctrl+click). Needs the `sort` module. */
  sortColumn(field: string, direction: 'asc' | 'desc', options?: { readonly multiple?: boolean }): CommandResult;
  removeSort(field: string): CommandResult;
  clearSorting(): CommandResult;
  /** An array value with a scalar operator ORs one condition per value. Needs the `filter` module. */
  filterColumn(field: string, operator: string, value: Json, options?: FilterColumnOptions): CommandResult;
  /** Clears every filter, or the filters of the given columns. */
  clearFiltering(fields?: string | readonly string[]): CommandResult;
  removeFilter(field: string): CommandResult;
  /** Distinct values with counts for checkbox / Excel filters, or undefined without the `filter` module. */
  getColumnFacet(field: string, options?: FacetOptions): ColumnFacet | undefined;
  /** Searches with the `search` module settings; empty text clears the search. */
  search(text: string): CommandResult;
  clearSearch(): CommandResult;
  /** Needs the `paging` module. */
  goToPage(page: number): CommandResult;
  setPageSize(pageSize: number): CommandResult;
  /** Pager model, or undefined without the `paging` module. */
  getPageInfo(): PageInfo | undefined;
  /** Needs the `grouping` module. */
  groupColumn(field: string, index?: number): CommandResult;
  ungroupColumn(field: string): CommandResult;
  clearGrouping(): CommandResult;
  /** Toggles (or sets) one group by row id, path key, or path. */
  toggleGroup(group: GroupTarget, expanded?: boolean): CommandResult;
  expandAllGroups(): CommandResult;
  collapseAllGroups(): CommandResult;
  /** Caption or footer snapshot of a group row id, or undefined. */
  getGroup(rowId: RowId): GroupRowSnapshot | undefined;
  /**
   * Without an argument the footer aggregates (undefined without the
   * `aggregates` module); with a group row id that group's aggregates
   * (undefined for an unknown id).
   */
  getAggregates(groupId?: RowId): AggregateValues | undefined;
  /**
   * Re-reads the data with the current query and keeps the grid state: `engine.refresh()`.
   */
  refresh(): void;
  dispose(): void;
}

type Facades<Row> = {
  readonly filter?: { getFacet(columnId: ColumnId, options?: FacetOptions): ColumnFacet | undefined; getFilteredRows(): readonly Row[] };
  readonly paging?: { getInfo(): PageInfo };
  readonly grouping?: { getGroup(rowId: RowId): GroupRowSnapshot | undefined };
  readonly aggregates?: { getFooter(): AggregateValues };
};

/** Leaf column by column id, else the first leaf with that `field`. */
export function findColumn<Row>(engine: DataGridEngine<Row>, fieldOrId: string): CompiledColumn<Row> | undefined {
  const columns = engine.getSnapshot().columns;
  const byId = columns.byId.get(fieldOrId);
  if (byId?.leaf) return byId;
  return columns.leaves.find((c) => c.field === fieldOrId);
}

export function createDataGridApi<Row>(engine: DataGridEngine<Row>): DataGridApi<Row> {
  let viewRowsFor: unknown = null;
  let viewRows: readonly Row[] = [];
  let keyFieldsFor: unknown = null;
  let keyFields: readonly string[] = [];
  let hiddenFor: unknown = null;
  let hidden: readonly CompiledColumn<Row>[] = [];

  /** Column id of a field or id; unknown keys pass through so the command rejects them. */
  const idOf = (fieldOrId: string): ColumnId => findColumn(engine, fieldOrId)?.columnId ?? fieldOrId;
  const idsOf = (keys: string | readonly string[]): ColumnId[] => (typeof keys === 'string' ? [idOf(keys)] : keys.map(idOf));
  const facades = () => engine as unknown as Facades<Row>;

  return Object.freeze({
    engine,
    getColumn: (fieldOrId) => findColumn(engine, fieldOrId),
    getColumns: () => engine.getSnapshot().columns.leaves,
    getVisibleColumns: () => engine.getSnapshot().columns.visible,
    getHiddenColumns() {
      const columns = engine.getSnapshot().columns;
      if (hiddenFor !== columns) {
        const shown = new Set(columns.visible);
        hidden = Object.freeze(columns.leaves.filter((c) => !shown.has(c)));
        hiddenFor = columns;
      }
      return hidden;
    },
    getColumnAt: (index) => engine.getSnapshot().columns.visible[index],
    getColumnIndex(fieldOrId) {
      const column = findColumn(engine, fieldOrId);
      return column ? engine.getSnapshot().columns.visible.indexOf(column) : -1;
    },
    showColumns: (fieldsOrIds) => engine.dispatch({ type: 'columns.show', keys: idsOf(fieldsOrIds) }),
    hideColumns: (fieldsOrIds) => engine.dispatch({ type: 'columns.hide', keys: idsOf(fieldsOrIds) }),
    getViewRows() {
      const model = engine.getSnapshot().rows;
      if (model.order === null && !model.view) return model.source;
      if (viewRowsFor !== model) {
        const out: Row[] = [];
        const view = model.view;
        if (view) {
          // Visible data rows of a grouped view (captions and footers are not rows of data).
          for (let i = 0; i < model.count; i++) {
            const at = view.sourceIndexAt(i);
            if (at >= 0) out.push(model.source[at] as Row);
            else if (view.kindAt(i) === 'data') {
              const row = engine.getRowAt(i);
              if (row !== undefined) out.push(row);
            }
          }
        } else for (let i = 0; i < model.count; i++) out.push(model.source[(model.order as Int32Array)[i] as number] as Row);
        viewRows = Object.freeze(out);
        viewRowsFor = model;
      }
      return viewRows;
    },
    getFilteredRows: () => facades().filter?.getFilteredRows() ?? engine.getSnapshot().rows.source,
    getRow: (rowId) => engine.getRow(rowId),
    getRowInfo: (rowId) => engine.getRowSnapshot(rowId),
    getRowIndex: (rowId) => engine.getRowIndex(rowId),
    getRowIdAt: (index) => engine.getRowIdAt(index),
    getCell: (rowId, field) => engine.getCellSnapshot(rowId, idOf(field)),
    getDataSource: () => engine.getDataSource(),
    getPrimaryKeyFields() {
      const leaves = engine.getSnapshot().columns.leaves;
      if (keyFieldsFor !== leaves) {
        keyFields = Object.freeze(leaves.flatMap((c) => (c.flags.isPrimaryKey && c.field !== null ? [c.field] : [])));
        keyFieldsFor = leaves;
      }
      return keyFields;
    },
    sortColumn: (field, direction, options) =>
      engine.dispatch(
        options?.multiple === undefined
          ? { type: 'sort.column', columnId: idOf(field), direction }
          : { type: 'sort.column', columnId: idOf(field), direction, multi: options.multiple },
      ),
    removeSort: (field) => engine.dispatch({ type: 'sort.remove', columnId: idOf(field) }),
    clearSorting: () => engine.dispatch({ type: 'sort.clear' }),
    filterColumn: (field, operator, value, options = {}) => {
      // Public option names map to the engine command (`logic` -> `predicate`, `ignoreAccents` -> `ignoreAccent`).
      const command: { type: 'filter.byColumn'; [key: string]: Json } = { type: 'filter.byColumn', columnId: idOf(field), operator, value };
      if (options.logic !== undefined) command['predicate'] = options.logic;
      if (options.matchCase !== undefined) command['matchCase'] = options.matchCase;
      if (options.ignoreAccents !== undefined) command['ignoreAccent'] = options.ignoreAccents;
      return engine.dispatch(command);
    },
    clearFiltering: (fields) => engine.dispatch(fields === undefined ? { type: 'filter.clear' } : { type: 'filter.clear', columnIds: idsOf(fields) }),
    removeFilter: (field) => engine.dispatch({ type: 'filter.remove', columnId: idOf(field) }),
    getColumnFacet: (field, options) => facades().filter?.getFacet(idOf(field), options),
    search: (text) => engine.dispatch(text === '' ? { type: 'search.clear' } : { type: 'search.set', text }),
    clearSearch: () => engine.dispatch({ type: 'search.clear' }),
    goToPage: (page) => engine.dispatch({ type: 'paging.goToPage', page }),
    setPageSize: (pageSize) => engine.dispatch({ type: 'paging.setPageSize', pageSize }),
    getPageInfo: () => facades().paging?.getInfo(),
    groupColumn: (field, index) =>
      engine.dispatch(index === undefined ? { type: 'grouping.groupBy', columnId: idOf(field) } : { type: 'grouping.groupBy', columnId: idOf(field), index }),
    ungroupColumn: (field) => engine.dispatch({ type: 'grouping.ungroup', columnId: idOf(field) }),
    clearGrouping: () => engine.dispatch({ type: 'grouping.clear' }),
    toggleGroup: (group, expanded) => {
      const target: Json = typeof group === 'string' ? group : group.map((s) => ({ columnId: s.columnId, key: s.key }));
      return engine.dispatch(expanded === undefined ? { type: 'grouping.toggle', group: target } : { type: 'grouping.toggle', group: target, expanded });
    },
    expandAllGroups: () => engine.dispatch({ type: 'grouping.expandAll' }),
    collapseAllGroups: () => engine.dispatch({ type: 'grouping.collapseAll' }),
    getGroup: (rowId) => facades().grouping?.getGroup(rowId),
    getAggregates: (groupId) => (groupId === undefined ? facades().aggregates?.getFooter() : facades().grouping?.getGroup(groupId)?.aggregates),
    refresh: () => engine.refresh(),
    dispose: () => engine.dispose(),
  } satisfies DataGridApi<Row>);
}

/**
 * Builds a `getRowId` from a primary key: a field name, several field names
 * (joined with `\u001f`), or a function. The React `DataGrid` uses it for `primaryKey` columns.
 */
export function rowIdFromKey<Row>(key: string | readonly string[] | ((row: Row) => RowId | number)): (row: Row) => RowId {
  if (typeof key === 'function') return (row) => String(key(row));
  const fields = typeof key === 'string' ? [key] : key;
  if (fields.length === 1) {
    const field = fields[0] as string;
    return (row) => String((row as Record<string, unknown>)[field]);
  }
  return (row) => fields.map((f) => String((row as Record<string, unknown>)[f])).join('\u001f');
}
