import { movedCopy, RowIndex } from './row-index.js';
import type {
  DataSourceEvent,
  DataSourceRequest,
  DataSourceResult,
  LocalDataPatch,
  LocalDataSource,
  RowId,
  RowPlacement,
  WriteRequest,
  WriteResult,
} from './types.js';

export interface LocalDataSourceOptions<Row> {
  /** Required for `patch` upsert/remove and for `write`. The engine passes its own when it wraps an array. */
  readonly getRowId?: (row: Row, index: number) => RowId;
}

const EMPTY_IDS: readonly RowId[] = Object.freeze([]);

/**
 * @internal A row reorder applied by a local source, attached to the `reset`
 * event it emits. `from` is the array before the write; when the write also
 * carried added, changed, or deleted rows, `patched` is the array after them
 * and `patch` their ids (applied before the move). `positions` are the moved
 * rows' positions in `patched ?? from`, in placement order; `insertAt` is
 * where the first of them lands in the list without them.
 */
export interface LocalRowMove<Row> {
  readonly from: readonly Row[];
  readonly patched: readonly Row[] | null;
  readonly patch: { readonly updated: readonly RowId[]; readonly added: readonly RowId[]; readonly removed: readonly RowId[] } | null;
  readonly positions: Int32Array;
  readonly insertAt: number;
}

// Event -> move, keyed by the frozen event object (never outlives it).
const moves = new WeakMap<object, LocalRowMove<unknown>>();

/** @internal The move a local source's `reset` event stands for, if it is one. */
export function localMoveOf<Row>(event: DataSourceEvent<Row>): LocalRowMove<Row> | undefined {
  return moves.get(event) as LocalRowMove<Row> | undefined;
}

/**
 * In-memory data source (`mode: 'local'`). Rows are held by reference and the
 * array is treated as immutable: every change produces a new array and one
 * event. The engine runs every pipeline stage locally.
 */
export function createLocalDataSource<Row>(rows: readonly Row[] = [], options: LocalDataSourceOptions<Row> = {}): LocalDataSource<Row> {
  let current: readonly Row[] = rows;
  // Id -> position, built on the first id-based patch and maintained incrementally afterwards.
  let index: RowIndex | null = null;
  const listeners = new Set<(event: DataSourceEvent<Row>) => void>();

  const requireRowId = (operation: string): ((row: Row, index: number) => RowId) => {
    const getRowId = options.getRowId;
    if (!getRowId) throw new Error(`createLocalDataSource: ${operation} requires the getRowId option.`);
    return getRowId;
  };

  const emit = (event: DataSourceEvent<Row>): void => {
    for (const listener of listeners) listener(event);
  };

  interface Applied {
    readonly updated: RowId[];
    readonly added: RowId[];
    readonly removed: RowId[];
  }

  const ensureIndex = (getRowId: (row: Row, index: number) => RowId): RowIndex => {
    if (!index) {
      const ids: RowId[] = new Array(current.length);
      for (let i = 0; i < current.length; i++) ids[i] = getRowId(current[i] as Row, i);
      index = RowIndex.from(ids);
    }
    return index;
  };

  /** `list` without the rows at ascending `positions`. */
  const without = (list: readonly Row[], positions: readonly number[]): Row[] => {
    if (positions.length <= 32) {
      const out = [...list];
      for (let i = positions.length - 1; i >= 0; i--) out.splice(positions[i] as number, 1);
      return out;
    }
    const out: Row[] = [];
    let next = 0;
    for (let i = 0; i < list.length; i++) {
      if (next < positions.length && positions[next] === i) {
        next++;
        continue;
      }
      out.push(list[i] as Row);
    }
    return out;
  };

  const apply = (append: readonly Row[], upsert: readonly Row[], remove: readonly RowId[]): Applied | null => {
    if (append.length === 0 && upsert.length === 0 && remove.length === 0) return null;
    const getRowId = upsert.length || remove.length ? requireRowId(remove.length ? 'remove' : 'upsert') : (options.getRowId ?? null);
    const updated: RowId[] = [];
    const added: RowId[] = [];
    const removed: RowId[] = [];
    let list: Row[] | null = null;
    if (getRowId && (upsert.length || remove.length)) ensureIndex(getRowId);

    if (remove.length && getRowId) {
      const ids = ensureIndex(getRowId);
      const positions: number[] = [];
      const seen = new Set<number>();
      for (const id of remove) {
        const at = ids.get(id);
        if (at !== undefined && !seen.has(at)) {
          seen.add(at);
          positions.push(at);
        }
      }
      if (positions.length) {
        positions.sort((a, b) => a - b);
        const removedIds = positions.map((p) => getRowId(current[p] as Row, p));
        list = without(current, positions);
        ids.remove(positions, removedIds);
        for (const id of removedIds) removed.push(id);
      }
    }

    // Rows that are not yet in the array: explicit appends first, then upserts with unknown ids.
    const base = (list ?? current).length;
    const pushRow = (row: Row, id: RowId | null): void => {
      list ??= [...current]; // spread stays fast for frozen inputs (slice does not)
      list.push(row);
      if (id !== null) {
        added.push(id);
        index?.append(id);
      }
    };
    for (const row of append) pushRow(row, getRowId ? getRowId(row, (list ?? current).length) : null);

    if (upsert.length && getRowId) {
      const ids = ensureIndex(getRowId);
      const seenUpdates = new Set<RowId>();
      for (const row of upsert) {
        const id = getRowId(row, (list ?? current).length);
        const at = ids.get(id);
        if (at === undefined) {
          pushRow(row, id);
        } else {
          list ??= [...current];
          list[at] = row;
          if (at < base && !seenUpdates.has(id)) {
            seenUpdates.add(id);
            updated.push(id);
          }
        }
      }
    }

    if (!list) return null;
    current = list;
    return { updated, added, removed };
  };

  /**
   * Moves rows next to a target (row reorder). Only the window between the
   * first touched position and the last one is rebuilt; the rest of the new
   * array is one native copy. Returns null when nothing moved.
   */
  const move = (placement: RowPlacement): { readonly positions: Int32Array; readonly insertAt: number } | null => {
    const getRowId = requireRowId('moved');
    const ids = ensureIndex(getRowId);
    const positions: number[] = [];
    const seen = new Set<number>();
    for (const id of placement.rowIds) {
      const at = ids.get(id);
      if (at !== undefined && !seen.has(at)) {
        seen.add(at);
        positions.push(at);
      }
    }
    const k = positions.length;
    if (k === 0) return null;
    const n = current.length;
    let at: number;
    if (placement.targetRowId === null) at = placement.position === 'before' ? 0 : n - k;
    else {
      const t = ids.get(placement.targetRowId);
      if (t === undefined || seen.has(t)) return null;
      // Target position in the list without the moved rows: its index minus the moved rows before it.
      let shift = 0;
      for (const p of positions) if (p < t) shift++;
      at = t - shift + (placement.position === 'after' ? 1 : 0);
    }
    // Nothing moves when the rows already sit, in placement order, at the insertion point.
    let same = at + k <= n;
    for (let i = 0; same && i < k; i++) if (positions[i] !== at + i) same = false;
    if (same) return null;
    current = movedCopy(current, positions, at);
    ids.move(positions, at); // O(window), keeps the id index valid
    return { positions: Int32Array.from(positions), insertAt: at };
  };

  const source: LocalDataSource<Row> = {
    mode: 'local',
    capabilities: Object.freeze({ write: true, facets: false, lazyGroups: false, treeChildren: false, cursor: false, infinite: false, lookups: false, exportJobs: false, reload: false }),
    read(request: DataSourceRequest): DataSourceResult<Row> {
      return { version: request.version, rows: current, totalRowCount: current.length };
    },
    getRows: () => current,
    setRows(next) {
      if (next === current) return;
      current = next;
      index = null;
      emit(Object.freeze({ type: 'reset', rows: current, totalRowCount: current.length }));
    },
    patch(patch: LocalDataPatch<Row>) {
      const result = apply(patch.append ?? [], patch.upsert ?? [], patch.remove ?? []);
      if (!result) return;
      emit(
        Object.freeze({
          type: 'patch',
          rows: current,
          updated: result.updated.length ? Object.freeze(result.updated) : EMPTY_IDS,
          added: result.added.length ? Object.freeze(result.added) : EMPTY_IDS,
          removed: result.removed.length ? Object.freeze(result.removed) : EMPTY_IDS,
          totalRowCount: current.length,
        }),
      );
    },
    write(request: WriteRequest<Row>): Promise<WriteResult<Row>> {
      // Applied synchronously; the promise only reports the outcome.
      try {
        const from = current;
        const result = apply(
          request.added.map((a) => a.row),
          request.changed.map((c) => c.row),
          request.deleted.map((d) => d.rowId),
        );
        const patched = result ? current : null;
        const moved = request.moved ? move(request.moved) : null;
        if (moved) {
          // Public contract: a reorder is one `reset`. The move itself rides
          // along (`localMoveOf`) so the engine can apply it without
          // recomputing every row id.
          const event: DataSourceEvent<Row> = Object.freeze({ type: 'reset', rows: current, totalRowCount: current.length });
          moves.set(event, Object.freeze({ from, patched, patch: result, positions: moved.positions, insertAt: moved.insertAt }));
          emit(event);
        } else if (result) {
          emit(
            Object.freeze({
              type: 'patch',
              rows: current,
              updated: Object.freeze(result.updated),
              added: Object.freeze(result.added),
              removed: Object.freeze(result.removed),
              totalRowCount: current.length,
            }),
          );
        }
        return Promise.resolve(
          Object.freeze({
            version: request.version,
            status: 'applied' as const,
            added: request.added,
            changed: request.changed.map((c) => ({ rowId: c.rowId, row: c.row })),
            deleted: result ? result.removed : [],
            totalRowCount: current.length,
          }),
        );
      } catch (error) {
        return Promise.reject(error);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return source;
}
