// Row pinning. Pinned
// rows leave their place in the sorted order and are shown once, at the head
// of the visible model, where the renderer keeps them in the sticky top zone.
//
// Two stages: `pin` (after `sort`) removes the pinned rows that pass search
// and filter from the order and remembers them in sort order; `pinnedRows`
// (after `page`) puts them in front of the final model. Everything between
// (grouping, aggregates, expansion, detail rows, the page window and its
// totals) never sees them, so `pageSize` counts scrolling rows only. With
// nothing pinned both stages return their input: no allocation, the row
// delta of an incremental update passes through, and an engine without the
// module pays nothing (the module is on its own subpath).

import { defineDataGridModule } from './engine.js';
import { createRowModel } from './pipeline.js';
import type { DataGridModule, DataGridOptions, ModuleContext, RowDelta, RowId, RowKind, RowModelSnapshot, RowModelView, StageContext, ViewRowInfo } from './types.js';

export interface RowPinningOptions<Row> {
  /**
   * Rows pinned by data. Evaluated once per row
   * of a data array; a patch re-tests only the added and changed rows, so
   * pinning follows CRUD. Must be pure. Read at engine creation.
   */
  readonly isRowPinned?: (row: Row) => boolean;
  /** Initially pinned row ids (besides `isRowPinned`). */
  readonly rowIds?: readonly RowId[];
}

export interface RowPinningState {
  /** Rows pinned explicitly (`pinRows`, `rowIds`), in pin order. */
  readonly pinned: readonly RowId[];
  /** Rows unpinned explicitly although `isRowPinned` matches them. */
  readonly unpinned: readonly RowId[];
}

export type RowPinningPinCommand = { type: 'rowPinning.pin'; rowIds: RowId[] };
export type RowPinningUnpinCommand = { type: 'rowPinning.unpin'; rowIds: RowId[] };
/** Replaces the explicit pins and unpins (state restore). */
export type RowPinningSetCommand = { type: 'rowPinning.set'; pinned: RowId[]; unpinned?: RowId[] };
export type RowPinningCommand = RowPinningPinCommand | RowPinningUnpinCommand | RowPinningSetCommand;

export type RowPinningMethods<Row> = {
  /** True when the row is pinned (explicitly, or by `isRowPinned` and not unpinned). Filtered-out rows can be pinned. */
  isPinned(ctx: ModuleContext<Row>, rowId: RowId): boolean;
  /** Ids of the pinned rows the view shows, in display order. */
  getPinnedRowIds(ctx: ModuleContext<Row>): readonly RowId[];
};

export type RowPinningModule<Row> = DataGridModule<Row, RowPinningState, RowPinningCommand, 'rowPinning', RowPinningMethods<Row>>;

const NO_IDS: readonly RowId[] = Object.freeze([]);
const INITIAL: RowPinningState = Object.freeze({ pinned: NO_IDS, unpinned: NO_IDS });

function validIds(value: unknown): value is RowId[] {
  return Array.isArray(value) && value.every((id) => typeof id === 'string');
}

function freezeIds(ids: Iterable<RowId>): readonly RowId[] {
  const list = [...ids];
  return list.length ? Object.freeze(list) : NO_IDS;
}

function withState(state: RowPinningState, pinned: readonly RowId[], unpinned: readonly RowId[]): RowPinningState {
  const same = (a: readonly RowId[], b: readonly RowId[]) => a.length === b.length && a.every((id, i) => id === b[i]);
  if (same(pinned, state.pinned) && same(unpinned, state.unpinned)) return state;
  return pinned.length === 0 && unpinned.length === 0 ? INITIAL : Object.freeze({ pinned, unpinned });
}

/**
 * Visible model with the pinned rows in front of a structured inner view
 * (grouped, detail, lazy groups, or a page of them). Pinned rows are data
 * rows at depth 0; every other lookup is the inner lookup shifted by the
 * pinned count.
 */
export class PinnedView implements RowModelView {
  readonly kind = 'pinned' as const;
  readonly inner: RowModelView;
  readonly count: number;
  readonly dataCount: number;
  private readonly pinned: Int32Array;
  private readonly sourceIds: readonly RowId[];
  private positions: Map<number, number> | null = null;

  constructor(inner: RowModelView, pinned: Int32Array, sourceIds: readonly RowId[]) {
    this.inner = inner;
    this.pinned = pinned;
    this.sourceIds = sourceIds;
    this.count = inner.count + pinned.length;
    // Pinned rows are not data positions (`dataIndexAt`): the count covers the scrolling rows.
    this.dataCount = inner.dataCount;
  }

  /** Inner index of a visible index, or -1 for a pinned row. */
  innerIndex(index: number): number {
    return index < this.pinned.length ? -1 : index - this.pinned.length;
  }

  /** Visible index of an inner index. */
  outerIndex(innerIndex: number): number {
    return innerIndex < 0 ? -1 : innerIndex + this.pinned.length;
  }

  kindAt(index: number): RowKind {
    return index >= 0 && index < this.pinned.length ? 'data' : this.inner.kindAt(index - this.pinned.length);
  }

  sourceIndexAt(index: number): number {
    if (index < 0 || index >= this.count) return -1;
    return index < this.pinned.length ? (this.pinned[index] as number) : this.inner.sourceIndexAt(index - this.pinned.length);
  }

  idAt(index: number): RowId | undefined {
    if (index < 0 || index >= this.count) return undefined;
    return index < this.pinned.length ? this.sourceIds[this.pinned[index] as number] : this.inner.idAt(index - this.pinned.length);
  }

  depthAt(index: number): number {
    return index < this.pinned.length ? 0 : this.inner.depthAt(index - this.pinned.length);
  }

  private positionOf(sourceIndex: number): number {
    if (!this.positions) {
      const map = new Map<number, number>();
      for (let j = 0; j < this.pinned.length; j++) map.set(this.pinned[j] as number, j);
      this.positions = map;
    }
    return this.positions.get(sourceIndex) ?? -1;
  }

  indexOfSource(sourceIndex: number): number {
    const j = this.positionOf(sourceIndex);
    return j >= 0 ? j : this.outerIndex(this.inner.indexOfSource(sourceIndex));
  }

  parentOfSource(sourceIndex: number): RowId | null {
    return this.positionOf(sourceIndex) >= 0 ? null : this.inner.parentOfSource(sourceIndex);
  }

  resolve(id: RowId): ViewRowInfo | undefined {
    const info = this.inner.resolve(id);
    return info ? Object.freeze({ ...info, index: this.outerIndex(info.index) }) : undefined;
  }
}

/** The `pinned` source indexes of a model (empty when nothing is pinned). */
export function pinnedSourceIndexes<Row>(model: RowModelSnapshot<Row>): Int32Array {
  return model.pinned ?? EMPTY_ORDER;
}

const EMPTY_ORDER = new Int32Array(0);

/**
 * Creates the `rowPinning` module. Options are read from
 * `options.rowPinning` (`RowPinningOptions`).
 */
export function createRowPinningModule<Row>(): RowPinningModule<Row> {
  let predicate: ((row: Row) => boolean) | null = null;
  // `isRowPinned` verdicts per source index, per source array. A data patch
  // carries them to the new array (`update`) and re-tests only changed rows.
  const verdictCache = new WeakMap<readonly Row[], Uint8Array>();
  // Output of the last `pin` run and its pinned order; `pinnedRows` keys on it.
  let extracted: { readonly output: RowModelSnapshot<Row>; readonly pinned: Int32Array } | null = null;

  const matches = (row: Row | undefined): boolean => predicate !== null && row !== undefined && predicate(row) === true;

  const verdictsOf = (source: readonly Row[]): Uint8Array => {
    let verdicts = verdictCache.get(source);
    if (!verdicts) {
      verdicts = new Uint8Array(source.length);
      for (let i = 0; i < source.length; i++) if (matches(source[i])) verdicts[i] = 1;
      verdictCache.set(source, verdicts);
    }
    return verdicts;
  };

  /** Pinned flags per source index, or null when nothing can be pinned. */
  const flagsFor = (input: RowModelSnapshot<Row>, ctx: StageContext<Row, RowPinningState>): Uint8Array | null => {
    const state = ctx.state;
    const n = input.source.length;
    if (!predicate && state.pinned.length === 0) return null;
    const overrides = state.pinned.length > 0 || state.unpinned.length > 0;
    const flags = predicate ? (overrides ? verdictsOf(input.source).slice() : verdictsOf(input.source)) : new Uint8Array(n);
    if (!overrides) return flags;
    const indexOf = ctx.sourceIndexOf ?? ((id: RowId) => input.sourceIds.indexOf(id));
    for (const id of state.unpinned) {
      const s = indexOf(id);
      if (s >= 0 && s < n) flags[s] = 0;
    }
    for (const id of state.pinned) {
      const s = indexOf(id);
      if (s >= 0 && s < n) flags[s] = 1;
    }
    return flags;
  };

  /** Carries the verdicts of the previous source array through a row delta. */
  const carryVerdicts = (previous: readonly Row[], next: readonly Row[], delta: RowDelta): boolean => {
    const before = verdictCache.get(previous);
    if (!before || before.length !== delta.previousCount || next.length !== delta.count) return false;
    if (verdictCache.has(next)) return true;
    const after = new Uint8Array(delta.count);
    const removed = delta.removed;
    let r = 0;
    let at = 0;
    for (let p = 0; p < delta.previousCount; p++) {
      if (r < removed.length && removed[r] === p) {
        r++;
        continue;
      }
      after[at++] = before[p] as number;
    }
    const updated = delta.updated;
    r = 0;
    for (let u = 0; u < updated.length; u++) {
      const p = updated[u] as number;
      while (r < removed.length && (removed[r] as number) < p) r++;
      const i = p - r;
      after[i] = matches(next[i]) ? 1 : 0;
    }
    for (let i = at; i < delta.count; i++) after[i] = matches(next[i]) ? 1 : 0;
    verdictCache.set(next, after);
    return true;
  };

  const extract = (input: RowModelSnapshot<Row>, ctx: StageContext<Row, RowPinningState>): RowModelSnapshot<Row> => {
    const flags = flagsFor(input, ctx);
    const order = input.order;
    const count = order === null ? input.count : order.length;
    let k = 0;
    if (flags) for (let i = 0; i < count; i++) if (flags[order === null ? i : (order[i] as number)]) k++;
    if (k === 0) {
      extracted = null;
      return input;
    }
    const pinned = new Int32Array(k);
    const rest = new Int32Array(count - k);
    let p = 0;
    let r = 0;
    for (let i = 0; i < count; i++) {
      const s = order === null ? i : (order[i] as number);
      if ((flags as Uint8Array)[s]) pinned[p++] = s;
      else rest[r++] = s;
    }
    const output = createRowModel(input, rest);
    extracted = { output, pinned };
    return output;
  };

  return defineDataGridModule<Row, RowPinningState, RowPinningCommand, 'rowPinning', RowPinningMethods<Row>>({
    name: 'rowPinning',
    commands: ['rowPinning.pin', 'rowPinning.unpin', 'rowPinning.set'],
    initialState(options: DataGridOptions<Row>): RowPinningState {
      const o = (options['rowPinning'] ?? {}) as RowPinningOptions<Row>;
      predicate = typeof o.isRowPinned === 'function' ? o.isRowPinned : null;
      const ids = validIds(o.rowIds) ? freezeIds(new Set(o.rowIds)) : NO_IDS;
      return ids.length ? Object.freeze({ pinned: ids, unpinned: NO_IDS }) : INITIAL;
    },
    reduce(state, command, ctx) {
      switch (command.type) {
        case 'rowPinning.pin': {
          if (!validIds(command.rowIds)) return ctx.reject('invalidRowIds');
          const pinned = new Set(state.pinned);
          for (const id of command.rowIds) pinned.add(id);
          const drop = new Set(command.rowIds);
          return withState(state, freezeIds(pinned), freezeIds(state.unpinned.filter((id) => !drop.has(id))));
        }
        case 'rowPinning.unpin': {
          if (!validIds(command.rowIds)) return ctx.reject('invalidRowIds');
          const drop = new Set(command.rowIds);
          const unpinned = new Set(state.unpinned);
          // Only a predicate can pin a row that is not in `pinned`; remember the override then.
          if (predicate) for (const id of command.rowIds) unpinned.add(id);
          return withState(state, freezeIds(state.pinned.filter((id) => !drop.has(id))), freezeIds(unpinned));
        }
        case 'rowPinning.set': {
          const unpinned = command.unpinned ?? [];
          if (!validIds(command.pinned) || !validIds(unpinned)) return ctx.reject('invalidRowIds');
          return withState(state, freezeIds(new Set(command.pinned)), freezeIds(new Set(unpinned)));
        }
      }
    },
    // Rows whose pin changed re-render even when their visible index stays the same (a sticky row pinned in place).
    notify(previous, next) {
      const rows: RowId[] = [];
      if (previous === next) return { rows };
      const diff = (a: readonly RowId[], b: readonly RowId[]): void => {
        const other = new Set(b);
        for (const id of a) if (!other.has(id)) rows.push(id);
      };
      diff(previous.pinned, next.pinned);
      diff(next.pinned, previous.pinned);
      diff(previous.unpinned, next.unpinned);
      diff(next.unpinned, previous.unpinned);
      return { rows };
    },
    methods: {
      isPinned(ctx, rowId) {
        const state = ctx.getModuleState<RowPinningState>('rowPinning') as RowPinningState;
        if (state.pinned.includes(rowId)) return true;
        if (!predicate || state.unpinned.includes(rowId)) return false;
        return matches(ctx.getRow(rowId));
      },
      getPinnedRowIds(ctx) {
        const model = ctx.getRows();
        const pinned = model.pinned;
        if (!pinned || pinned.length === 0) return NO_IDS;
        return Object.freeze(Array.from(pinned, (s) => model.sourceIds[s] as RowId));
      },
    },
    pipeline: [
      {
        name: 'pin',
        key: (_query, state) => [state],
        run: extract,
        update(input, previous, delta, ctx) {
          // Explicit pins resolve through the id index; only the predicate verdicts need the delta.
          if (predicate && !carryVerdicts(previous.input.source, input.source, delta)) return undefined;
          return extract(input, ctx);
        },
      },
      {
        name: 'pinnedRows',
        // `pin` ran (or hit its memo) earlier in the same pass, so `extracted` is current.
        key: () => [extracted],
        run(input) {
          const pinned = extracted?.pinned;
          if (!pinned) return input;
          const view = input.view;
          if (view) {
            const wrapped = new PinnedView(view, pinned, input.sourceIds);
            return Object.freeze({ ...input, count: wrapped.count, view: wrapped, pinned });
          }
          const rest = input.order;
          const n = rest === null ? input.count : rest.length;
          const order = new Int32Array(pinned.length + n);
          order.set(pinned);
          if (rest === null) for (let i = 0; i < n; i++) order[pinned.length + i] = i;
          else order.set(rest, pinned.length);
          return Object.freeze({ ...input, order, count: order.length, pinned });
        },
      },
    ],
  });
}
