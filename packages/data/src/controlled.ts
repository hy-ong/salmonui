// Custom binding: the application performs data operations
// itself. `onQueryChange` receives every read;
// `onDataChange` receives every write (`dataSourceChanged`).
//
// A controlled source keeps the rows of its last main result (the ones the
// grid shows). When a write settles, the rows the application applied (the
// `WriteResult` echo, else the request rows) replace, join, or leave that
// result and are emitted as one `patch` (in-place changes) or `reset` (added
// or deleted rows) event, so the grid shows them without a re-read. Rows the
// result reports as failed (row or cell errors, conflicts, a rejected write)
// keep their previous values.

import type {
  DataSourceCapabilities,
  DataSourceEvent,
  DataSourceRequest,
  DataSourceResult,
  DataSource,
  RowId,
  WriteRequest,
  WriteResult,
} from './types.js';

export interface ControlledDataSourceOptions<Row> {
  readonly onQueryChange: (request: DataSourceRequest) => DataSourceResult<Row> | Promise<DataSourceResult<Row>>;
  readonly onDataChange?: (request: WriteRequest<Row>) => Promise<WriteResult<Row>>;
  readonly capabilities?: Partial<DataSourceCapabilities>;
}

const NO_IDS: readonly RowId[] = Object.freeze([]);

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function';
}

/** Ids a write result reports as failed (the grid's edit module reads the same fields). */
function failedIds<Row>(request: WriteRequest<Row>, result: WriteResult<Row>): Set<RowId> {
  const failed = new Set<RowId>();
  for (const id of Object.keys(result.rowErrors ?? {})) failed.add(id);
  for (const key of Object.keys(result.cellErrors ?? {})) failed.add(key.slice(0, key.lastIndexOf(':')));
  for (const conflict of result.conflicts ?? []) failed.add(conflict.rowId);
  if (result.status === 'rejected' && failed.size === 0) {
    for (const a of request.added) failed.add(a.tempId);
    for (const c of request.changed) failed.add(c.rowId);
    for (const d of request.deleted) failed.add(d.rowId);
  }
  return failed;
}

export function createControlledDataSource<Row>(options: ControlledDataSourceOptions<Row>): DataSource<Row> {
  const onDataChange = options.onDataChange;
  const listeners = new Set<(event: DataSourceEvent<Row>) => void>();
  /** Last main result (no group, tree, or facet request) by request version. */
  let last: { version: number; rows: readonly Row[]; totalRowCount: number } | null = null;

  const remember = (request: DataSourceRequest, result: DataSourceResult<Row>): void => {
    if (request.groupPath || request.parentRowId !== undefined || request.facet) return;
    if (last && request.version < last.version) return;
    last = { version: request.version, rows: result.rows, totalRowCount: result.totalRowCount ?? result.rows.length };
  };

  const emit = (event: DataSourceEvent<Row>): void => {
    for (const listener of [...listeners]) listener(event);
  };

  /** Applies the settled write to the last result and notifies the grid. */
  const applyWrite = (request: WriteRequest<Row>, result: WriteResult<Row>): void => {
    const current = last;
    if (!current || listeners.size === 0) return;
    const failed = failedIds(request, result);
    const changedEcho = new Map<RowId, Row>();
    for (const c of result.changed ?? []) changedEcho.set(c.rowId, c.row);
    const addedEcho = new Map<RowId, Row>();
    for (const a of result.added ?? []) addedEcho.set(a.tempId, a.row);
    let positions: Map<Row, number> | null = null;
    const positionOf = (row: Row): number | undefined => {
      if (positions === null) {
        positions = new Map();
        for (let i = 0; i < current.rows.length; i++) positions.set(current.rows[i] as Row, i);
      }
      return positions.get(row);
    };
    const next = current.rows.slice();
    const updated: RowId[] = [];
    for (const c of request.changed) {
      if (failed.has(c.rowId)) continue;
      const at = positionOf(c.previous);
      if (at === undefined) continue;
      next[at] = changedEcho.get(c.rowId) ?? c.row;
      updated.push(c.rowId);
    }
    let structural = false;
    const drop = new Set<number>();
    for (const d of request.deleted) {
      if (failed.has(d.rowId)) continue;
      const at = positionOf(d.row);
      if (at !== undefined) drop.add(at);
    }
    let rows: Row[] = next;
    if (drop.size) {
      rows = next.filter((_, i) => !drop.has(i));
      structural = true;
    }
    for (const a of request.added) {
      if (failed.has(a.tempId)) continue;
      rows.push(addedEcho.get(a.tempId) ?? a.row);
      structural = true;
    }
    if (!structural && updated.length === 0) return;
    const delta = rows.length - current.rows.length;
    const totalRowCount = result.totalRowCount ?? Math.max(0, current.totalRowCount + delta);
    const frozen = Object.freeze(rows);
    last = { version: current.version, rows: frozen, totalRowCount };
    emit(
      structural
        ? Object.freeze({ type: 'reset', rows: frozen, totalRowCount })
        : Object.freeze({ type: 'patch', rows: frozen, updated: Object.freeze(updated), added: NO_IDS, removed: NO_IDS, totalRowCount }),
    );
  };

  return {
    mode: 'remote',
    capabilities: Object.freeze({ write: onDataChange !== undefined, ...options.capabilities }),
    read(request) {
      const result = options.onQueryChange(request);
      if (!isPromiseLike<DataSourceResult<Row>>(result)) {
        remember(request, result);
        return result;
      }
      return Promise.resolve(result).then((value) => {
        if (!request.signal.aborted) remember(request, value);
        return value;
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    ...(onDataChange
      ? {
          write: (request: WriteRequest<Row>) =>
            onDataChange(request).then((result) => {
              applyWrite(request, result);
              return result;
            }),
        }
      : {}),
  };
}
