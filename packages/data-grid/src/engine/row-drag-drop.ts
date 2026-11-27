// Row drag and drop. The drag session is high-churn state: the slice
// is not part of the grid snapshot and a pointer move (`rowDragDrop.over`)
// notifies only the module channel and the rows whose drop indicator
// changed. A drop writes through `dataSource.write` (`moved` placement hint,
// `changed` rows for group changes and `orderField`), so local and remote
// sources persist the new order the same way.

import { createAbortController } from './abort.js';
import { baseView, dataIndexAt, dataRowCountOf, dataRowIdAt, detailParentId } from './view-helpers.js';
import { treeOf } from './tree-of.js';
import { visibleRowOf } from './expansion.js';
import { defineDataGridModule } from './engine.js';
import { createInitialRowDragState, ROW_DRAG_COMMANDS } from './row-drag-state.js';
import { GroupView } from './group-view.js';
import type { TreeStructure } from './tree-view.js';
import type {
  ColumnId,
  CompiledColumn,
  DataGridModule,
  DataGridOptions,
  ModuleContext,
  RowId,
  RowKind,
  RowModelSnapshot,
  RowPlacement,
  WriteRequest,
  WriteResult,
} from './types.js';

// ---------------------------------------------------------------------------
// Drop position
// ---------------------------------------------------------------------------

export type DropPosition = 'before' | 'after' | 'into';

/** Where a pointer is over the visible row model. */
export interface DropPoint {
  /** Visible index (clamped); `count` when the model is empty. */
  readonly index: number;
  /** Id of the row under the pointer, or null for an empty model. */
  readonly rowId: RowId | null;
  readonly kind: RowKind;
  readonly position: DropPosition;
  /** Group (caption row id) the drop lands in, or null when ungrouped. */
  readonly groupId: RowId | null;
  /** Tree mode: the parent the dropped rows join (null: roots); absent outside tree mode. */
  readonly parentId?: RowId | null;
}

const TREE_FOOTER_PREFIX = '__tf:';

/**
 * Drop point for a pointer at `fraction` (0..1) of the height of visible row
 * `index`: the upper half of a data row is `before`, the lower half `after`;
 * a group caption is `into` that group; a detail row is `after` its parent
 * and a group footer `after` the group's last row. Indexes past the end land
 * after the last row. O(log) in the row model.
 */
export function computeDropPoint<Row>(model: RowModelSnapshot<Row>, index: number, fraction: number): DropPoint {
  const count = model.count;
  if (count === 0) return Object.freeze({ index: 0, rowId: null, kind: 'data' as const, position: 'after' as const, groupId: null });
  const past = index >= count;
  const i = Math.max(0, Math.min(count - 1, Math.floor(index)));
  const view = model.view;
  if (!view) {
    const id = model.sourceIds[model.order === null ? i : (model.order[i] as number)] as RowId;
    return Object.freeze({ index: i, rowId: id, kind: 'data' as const, position: past || fraction >= 0.5 ? ('after' as const) : ('before' as const), groupId: null });
  }
  const kind = view.kindAt(i);
  const id = view.idAt(i) as RowId;
  const tree = treeOf(model);
  if (tree) {
    // Tree mode: top quarter before, middle half into, bottom quarter after; a child summary row is `into` its parent.
    if (id.startsWith(TREE_FOOTER_PREFIX)) {
      const owner = id.slice(TREE_FOOTER_PREFIX.length);
      return Object.freeze({ index: i, rowId: owner, kind: 'data' as const, position: 'into' as const, groupId: null, parentId: owner });
    }
    const rowId = kind === 'detail' ? (detailParentId(id) as RowId) : id;
    const s = tree.sourceIndexOf(rowId);
    const position: DropPosition = past || fraction >= 0.75 ? 'after' : fraction < 0.25 ? 'before' : 'into';
    const p = s >= 0 ? (tree.index.parent[s] as number) : -1;
    const parentId = position === 'into' ? rowId : p < 0 ? null : (tree.sourceIds[p] as RowId);
    return Object.freeze({ index: i, rowId, kind: 'data' as const, position: kind === 'detail' && position === 'before' ? ('after' as const) : position, groupId: null, parentId });
  }
  switch (kind) {
    case 'group':
      return Object.freeze({ index: i, rowId: id, kind, position: 'into' as const, groupId: id });
    case 'groupFooter': {
      const owner = view.resolve(id)?.parentId ?? null;
      return Object.freeze({ index: i, rowId: id, kind, position: 'after' as const, groupId: owner });
    }
    case 'detail': {
      const parent = detailParentId(id) as RowId;
      const s = view.sourceIndexAt(view.resolve(parent)?.index ?? -1);
      return Object.freeze({ index: i, rowId: parent, kind, position: 'after' as const, groupId: s >= 0 ? view.parentOfSource(s) : (view.resolve(parent)?.parentId ?? null) });
    }
    default: {
      const s = view.sourceIndexAt(i);
      const groupId = s >= 0 ? view.parentOfSource(s) : (view.resolve(id)?.parentId ?? null);
      return Object.freeze({ index: i, rowId: id, kind, position: past || fraction >= 0.5 ? ('after' as const) : ('before' as const), groupId });
    }
  }
}

/** Data placement of a drop point: a data row id and `before` / `after`; null when the group is empty or unknown. */
export function resolvePlacement<Row>(model: RowModelSnapshot<Row>, point: DropPoint): { readonly targetRowId: RowId | null; readonly position: 'before' | 'after'; readonly groupId: RowId | null } | null {
  if (point.rowId === null) return { targetRowId: null, position: 'after', groupId: null };
  if (point.kind === 'data' || point.kind === 'detail') return { targetRowId: point.rowId, position: point.position === 'before' ? 'before' : 'after', groupId: point.groupId };
  const base = baseView(model.view);
  if (!(base instanceof GroupView) || point.groupId === null) return null;
  const g = base.groupOfId(point.groupId);
  if (g < 0) return null;
  const tree = base.tree;
  const size = tree.size[g] as number;
  if (size === 0) return null;
  const start = tree.start[g] as number;
  const at = point.kind === 'group' ? start : start + size - 1;
  const s = tree.order[at] as number;
  return { targetRowId: tree.sourceIds[s] as RowId, position: point.kind === 'group' ? 'before' : 'after', groupId: base.parentOfSource(s) };
}

/**
 * True for a visible index among the pinned rows, which head the
 * model. Pinned rows are neither drag sources nor drop targets: their place
 * comes from pinning and the sort, not from the row order.
 */
export function isPinnedIndex<Row>(model: RowModelSnapshot<Row>, index: number): boolean {
  return index >= 0 && index < (model.pinned?.length ?? 0);
}

// ---------------------------------------------------------------------------
// Cross-grid handoff
// ---------------------------------------------------------------------------

export interface RowDragPayload<Row = unknown> {
  readonly token: string;
  readonly sourceGridId: string;
  readonly rowIds: readonly RowId[];
  /** Row objects by reference (volatile, never serialized). */
  readonly rows: readonly Row[];
}

/** Caller-owned registry shared by grids that drag rows between each other (`rowDragDrop.handoff`). */
export interface RowDragHandoff {
  begin(payload: Omit<RowDragPayload, 'token'>, onDropped: (targetGridId: string) => void): string;
  get(token: string): RowDragPayload | undefined;
  /** The target grid accepted the rows. */
  complete(token: string, targetGridId: string): void;
  cancel(token: string): void;
}

export { createRowDragHandoff, createInitialRowDragState, ROW_DRAG_COMMANDS } from './row-drag-state.js';

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export interface RowDragDropOptions {
  /** Enables row drag and drop. Default true when the module is registered. */
  readonly enabled?: boolean;
  /** Allow drops into another group (grouped column values are rewritten). Default false. */
  readonly allowGroupChange?: boolean;
  /** Column id (or field) holding a persisted order; drops write new values to it. */
  readonly orderField?: string;
  /** Shared registry for drags between grids. */
  readonly handoff?: RowDragHandoff;
}

export interface DropTarget extends DropPoint {
  /**
   * The data row index the first dropped row takes
   * after the drop (`reorderRows(fromIndexes, dropIndex)` semantics); -1 when
   * unknown (a collapsed group's rows).
   */
  readonly dropIndex: number;
  readonly valid: boolean;
  /** `self`, `sorted`, `groupChange`, `lazyGroups`, `emptyGroup`, or null. */
  readonly reason: string | null;
}

export interface RowDragSession {
  readonly id: number;
  /** Handoff token (cross-grid), or null. */
  readonly token: string | null;
  /** True when the rows come from another grid. */
  readonly external: boolean;
  /** Dragged rows in visible order. */
  readonly rowIds: readonly RowId[];
  /** Data row indexes of the dragged rows (ascending; -1 for rows not in the view). Empty for external drags. */
  readonly fromIndexes: readonly number[];
  /** The first dragged row's data row index. */
  readonly fromIndex: number;
  readonly over: DropTarget | null;
}

/** Row drag event fields the core owns (`rows`, `target`, and `originalEvent` are the renderer's). */
export interface RowDragEventInfo<Row = unknown> {
  /** Dragged row objects. */
  readonly data: readonly Row[];
  readonly rowIds: readonly RowId[];
  readonly fromIndex: number;
  readonly dropIndex: number;
  readonly valid: boolean;
  readonly reason: string | null;
}

export interface RowDropStatus {
  readonly id: number;
  readonly status: 'pending' | 'applied' | 'rejected' | 'invalid' | 'error';
  readonly reason: string | null;
}

export interface RowDragDropState {
  readonly enabled: boolean;
  readonly allowGroupChange: boolean;
  readonly orderField: string | null;
  readonly drag: RowDragSession | null;
  readonly lastDrop: RowDropStatus | null;
}

export type RowDragStartCommand = { type: 'rowDragDrop.start'; rowId: RowId; rowIds?: RowId[] };
/** Pointer over visible row `index` at `fraction` (0..1) of its height; or an explicit `rowId` + `position`. */
export type RowDragOverCommand = { type: 'rowDragDrop.over'; index?: number; fraction?: number; rowId?: RowId; position?: DropPosition };
export type RowDragOverExternalCommand = { type: 'rowDragDrop.overExternal'; token: string; index?: number; fraction?: number; rowId?: RowId; position?: DropPosition };
export type RowDragLeaveCommand = { type: 'rowDragDrop.leave' };
export type RowDragDropCommand = { type: 'rowDragDrop.drop' };
export type RowDragReceiveCommand = { type: 'rowDragDrop.receive'; token: string };
/** Ends the drag; `dropped: true` with another `targetGridId` removes the rows from this grid. */
export type RowDragEndCommand = { type: 'rowDragDrop.end'; dropped?: boolean; targetGridId?: string };
export type RowDragCancelCommand = { type: 'rowDragDrop.cancel' };
/** Programmatic reorder. `into` (tree mode) makes the rows the last children of the target. */
export type RowDragMoveCommand = { type: 'rowDragDrop.move'; rowIds: RowId[]; targetRowId: RowId | null; position: 'before' | 'after' | 'into' };
/**
 * `reorderRows(fromIndexes, toIndex)`: data row indexes of the
 * current view; the rows are removed and inserted so the first one ends at
 * data index `toIndex` (clamped).
 */
export type RowDragReorderCommand = { type: 'rowDragDrop.reorder'; fromIndexes: number[]; toIndex: number };
/** Keyboard reorder: move the rows `offset` data rows up (negative) or down. */
export type RowDragMoveByCommand = { type: 'rowDragDrop.moveBy'; rowIds: RowId[]; offset: number };
export type RowDragSetEnabledCommand = { type: 'rowDragDrop.setEnabled'; enabled: boolean };
export type RowDragSetOptionsCommand = { type: 'rowDragDrop.setOptions'; allowGroupChange?: boolean; orderField?: string | null };
/** A row move write settled (dispatched by the engine; part of the public command union). */
export type RowDragSettledCommand = { type: 'rowDragDrop.settled'; id: number; status: 'applied' | 'rejected' | 'error'; reason?: string | null };
export type RowDragCommand =
  | RowDragStartCommand
  | RowDragOverCommand
  | RowDragOverExternalCommand
  | RowDragLeaveCommand
  | RowDragDropCommand
  | RowDragReceiveCommand
  | RowDragEndCommand
  | RowDragCancelCommand
  | RowDragMoveCommand
  | RowDragReorderCommand
  | RowDragMoveByCommand
  | RowDragSetEnabledCommand
  | RowDragSetOptionsCommand
  | RowDragSettledCommand;

export type RowDragDropMethods<Row> = {
  /** The dragged rows (for drops on custom elements and `DataTransfer`), or null. */
  getPayload(ctx: ModuleContext<Row>): RowDragPayload<Row> | null;
  getSession(ctx: ModuleContext<Row>): RowDragSession | null;
  /** Drag event argument fields for the current session, or null. */
  getEventArgs(ctx: ModuleContext<Row>): RowDragEventInfo<Row> | null;
};

export type RowDragDropModule<Row> = DataGridModule<Row, RowDragDropState, RowDragCommand, 'rowDragDrop', RowDragDropMethods<Row>>;

const EMPTY_IDS: readonly RowId[] = Object.freeze([]);

/** A move placement; `into` only in tree mode. */
type MovePlacement = { readonly rowIds: readonly RowId[]; readonly targetRowId: RowId | null; readonly position: DropPosition };

/** True when source row `a` is a proper ancestor of `b` in a tree layout (O(1) slot range test). */
function isTreeAncestor(layout: TreeStructure['index'], a: number, b: number): boolean {
  const x = a < 0 ? -1 : (layout.slot[a] as number);
  const y = b < 0 ? -1 : (layout.slot[b] as number);
  return x >= 0 && y > x && y < (layout.next[x] as number);
}

function isRowId(v: unknown): v is RowId {
  return typeof v === 'string' && v !== '';
}

const sourceMaps = new WeakMap<object, Map<RowId, number>>();
/** Any loaded row by id (visible rows first, then the source by id). */
function rowById<Row>(ctx: ModuleContext<Row>, id: RowId): Row | undefined {
  const visible = visibleRowOf(ctx, id);
  if (visible !== undefined) return visible;
  const model = ctx.getRows();
  let map = sourceMaps.get(model.sourceIds);
  if (!map) {
    map = new Map();
    for (let i = 0; i < model.sourceIds.length; i++) if (!map.has(model.sourceIds[i] as RowId)) map.set(model.sourceIds[i] as RowId, i);
    sourceMaps.set(model.sourceIds, map);
  }
  const at = map.get(id);
  return at === undefined ? undefined : model.source[at];
}

/** Leaf group (caption id) of a row, or null. */
function groupOfRow<Row>(ctx: ModuleContext<Row>, id: RowId): RowId | null {
  const model = ctx.getRows();
  const view = model.view;
  if (!view || treeOf(model)) return null;
  const index = ctx.getRowIndex(id);
  if (index >= 0) {
    const s = view.sourceIndexAt(index);
    return s >= 0 ? view.parentOfSource(s) : (view.resolve(id)?.parentId ?? null);
  }
  const base = baseView(view);
  if (base instanceof GroupView) {
    const map = sourceMaps.get(model.sourceIds);
    const s = map?.get(id);
    if (s !== undefined) return base.parentOfSource(s);
  }
  return null;
}

/**
 * Creates the `rowDragDrop` module. Options are read from
 * `options.rowDragDrop` (`RowDragDropOptions`).
 */
export function createRowDragDropModule<Row>(): RowDragDropModule<Row> {
  let gridId = 'grid';
  let getRowId: (row: Row, index: number) => RowId = () => '';
  let handoff: RowDragHandoff | null = null;
  let seq = 0;
  let writeSeq = 0;
  /** Dragged ids of the current session (O(1) self checks), rows by reference. */
  let dragged: Set<RowId> = new Set();
  let draggedRows: readonly Row[] = [];
  /** Groups of the dragged rows (internal drags). */
  let draggedGroups: Set<RowId | null> = new Set();
  /** Sort rule of the session: null when drops are allowed. */
  let sortReason: string | null = null;
  let lazy = false;
  let eventArgs: { drag: RowDragSession; info: RowDragEventInfo<Row> } | null = null;
  /** Data indexes of the dragged rows in the current session (ascending). */
  let fromIndexes: readonly number[] = [];

  /** Final data index of the first dropped row for a placement relative to data index `t`. */
  const dropIndexFor = (t: number, position: 'before' | 'after'): number => {
    if (t < 0) return -1;
    const edge = position === 'before' ? t : t + 1;
    let before = 0;
    for (const f of fromIndexes) if (f >= 0 && f < edge) before++;
    return edge - before;
  };

  const methods: RowDragDropMethods<Row> = {
    getPayload(ctx) {
      const state = ctx.getModuleState<RowDragDropState>('rowDragDrop') as RowDragDropState;
      const drag = state.drag;
      if (!drag) return null;
      if (drag.external && drag.token && handoff) return (handoff.get(drag.token) as RowDragPayload<Row> | undefined) ?? null;
      return Object.freeze({ token: drag.token ?? '', sourceGridId: gridId, rowIds: drag.rowIds, rows: draggedRows });
    },
    getSession(ctx) {
      return (ctx.getModuleState<RowDragDropState>('rowDragDrop') as RowDragDropState).drag;
    },
    getEventArgs(ctx) {
      const drag = (ctx.getModuleState<RowDragDropState>('rowDragDrop') as RowDragDropState).drag;
      if (!drag) return null;
      if (eventArgs && eventArgs.drag === drag) return eventArgs.info;
      const info: RowDragEventInfo<Row> = Object.freeze({
        data: draggedRows,
        rowIds: drag.rowIds,
        fromIndex: drag.fromIndex,
        dropIndex: drag.over ? drag.over.dropIndex : -1,
        valid: drag.over ? drag.over.valid : false,
        reason: drag.over ? drag.over.reason : null,
      });
      eventArgs = { drag, info };
      return info;
    },
  };

  const orderColumn = (ctx: ModuleContext<Row>, state: RowDragDropState): CompiledColumn<Row> | null => {
    if (state.orderField === null) return null;
    const columns = ctx.getColumns();
    return columns.byId.get(state.orderField) ?? columns.leaves.find((c) => c.field === state.orderField) ?? null;
  };

  /** Session rule for sorted grids: only an ascending sort on the order column keeps drops meaningful. */
  const sortRule = (ctx: ModuleContext<Row>, state: RowDragDropState): string | null => {
    const sorting = ctx.getSnapshot().query.sorting;
    if (sorting.length === 0) return null;
    const column = orderColumn(ctx, state);
    if (column && sorting.length === 1 && sorting[0]?.columnId === column.columnId && sorting[0].direction === 'asc') return null;
    return 'sorted';
  };

  const target = (ctx: ModuleContext<Row>, state: RowDragDropState, command: RowDragOverCommand | RowDragOverExternalCommand, external: boolean): DropTarget | null => {
    const model = ctx.getRows();
    let point: DropPoint;
    if (isRowId(command.rowId)) {
      const index = ctx.getRowIndex(command.rowId);
      if (index < 0) return null;
      const p = computeDropPoint(model, index, command.position === 'before' ? 0 : 1);
      point = command.position === 'into' || p.position === 'into' ? p : Object.freeze({ ...p, position: command.position === 'before' ? ('before' as const) : ('after' as const) });
    } else if (typeof command.index === 'number' && Number.isFinite(command.index)) {
      point = computeDropPoint(model, command.index, typeof command.fraction === 'number' ? command.fraction : 0.5);
    } else return null;
    let reason: string | null = sortReason;
    if (reason === null && lazy && model.view?.kind !== 'plain') reason = baseView(model.view)?.kind === 'lazyGrouped' ? 'lazyGroups' : null;
    if (reason === null && isPinnedIndex(model, point.index)) reason = 'pinnedRow';
    if (reason === null && !external && point.rowId !== null && (point.kind === 'data' || point.kind === 'detail') && dragged.has(point.rowId)) reason = 'self';
    if (reason === null && !external && point.rowId !== null) {
      // Tree mode: a row never drops into or next to its own descendant.
      const tree = treeOf(model);
      const t = tree ? tree.sourceIndexOf(point.rowId) : -1;
      if (tree && t >= 0) for (const id of dragged) if (isTreeAncestor(tree.index, tree.sourceIndexOf(id), t)) reason = 'descendant';
    }
    if (reason === null && !external && !state.allowGroupChange && model.view) {
      let group = point.groupId;
      if (point.kind === 'group') {
        // `into` a caption: the group of its first row (the leaf group).
        const placement = resolvePlacement(model, point);
        group = placement ? placement.groupId : group;
      }
      if (draggedGroups.size !== 1 || !draggedGroups.has(group)) reason = 'groupChange';
    }
    let dropIndex = -1;
    if (point.rowId === null) dropIndex = 0;
    else {
      const placement = point.kind === 'data' || point.kind === 'detail' ? { targetRowId: point.rowId, position: point.position === 'before' ? ('before' as const) : ('after' as const) } : resolvePlacement(model, point);
      if (placement && placement.targetRowId !== null) dropIndex = dropIndexFor(dataIndexAt(model, ctx.getRowIndex(placement.targetRowId)), placement.position);
    }
    return Object.freeze({ ...point, dropIndex, valid: reason === null, reason });
  };

  const sameTarget = (a: DropTarget | null, b: DropTarget | null): boolean =>
    a === b ||
    (a !== null && b !== null && a.index === b.index && a.rowId === b.rowId && a.position === b.position && a.dropIndex === b.dropIndex && a.valid === b.valid && a.reason === b.reason);

  /** Writes a move (and optional group/order value changes); returns the drop status. */
  const write = (ctx: ModuleContext<Row>, state: RowDragDropState, request: Omit<WriteRequest<Row>, 'version' | 'signal' | 'mode'>): RowDropStatus => {
    const id = ++writeSeq;
    const source = ctx.getDataSource();
    if (typeof source.write !== 'function') return Object.freeze({ id, status: 'error' as const, reason: 'readOnlySource' });
    const controller = createAbortController();
    let promise: Promise<WriteResult<Row>>;
    try {
      promise = source.write({ version: id, mode: 'row', signal: controller.signal, ...request });
    } catch (error) {
      return Object.freeze({ id, status: 'error' as const, reason: error instanceof Error ? error.message : String(error) });
    }
    void Promise.resolve(promise).then(
      (result) => ctx.dispatch({ type: 'rowDragDrop.settled', id, status: result.status === 'rejected' ? 'rejected' : 'applied', reason: null }),
      (error: unknown) => ctx.dispatch({ type: 'rowDragDrop.settled', id, status: 'error', reason: error instanceof Error ? error.message : String(error) }),
    );
    void state;
    return Object.freeze({ id, status: 'pending' as const, reason: null });
  };

  /** `changed` rows for a move: grouped column values of the target group and new order values. */
  const changesFor = (
    ctx: ModuleContext<Row>,
    state: RowDragDropState,
    rows: readonly { readonly id: RowId; readonly row: Row }[],
    placement: RowPlacement,
  ): { changed: WriteRequest<Row>['changed']; error: string | null } => {
    const columns = ctx.getColumns();
    const next = new Map<RowId, { row: Row; previous: Row; columns: ColumnId[] }>();
    const setValue = (id: RowId, row: Row, column: CompiledColumn<Row>, value: unknown): string | null => {
      if (!column.setter) return 'readOnlyColumn';
      let entry = next.get(id);
      if (!entry) next.set(id, (entry = { row, previous: row, columns: [] }));
      if (Object.is(column.accessor(entry.row), value)) return null;
      entry.row = column.setter(entry.row, value);
      if (!entry.columns.includes(column.columnId)) entry.columns.push(column.columnId);
      return null;
    };
    // Group change: copy grouped values from the target row.
    const grouping = ctx.getSnapshot().query.grouping;
    if (grouping.length && placement.targetRowId !== null) {
      const targetRow = rowById(ctx, placement.targetRowId);
      if (targetRow !== undefined) {
        for (const g of grouping) {
          const column = columns.byId.get(g.columnId);
          if (!column) continue;
          const value = column.accessor(targetRow);
          for (const r of rows) {
            if (Object.is(column.accessor(r.row), value)) continue;
            const error = setValue(r.id, r.row, column, value);
            if (error) return { changed: [], error };
          }
        }
      }
    }
    const order = orderColumn(ctx, state);
    if (order) {
      const values = orderValues(ctx, order, rows.map((r) => r.id), placement);
      if (values === null) {
        // Gap exhausted: renumber every visible data row in its new order.
        const ids = visibleDataIds(ctx).filter((id) => !rows.some((r) => r.id === id));
        let at = placement.targetRowId === null ? (placement.position === 'before' ? 0 : ids.length) : ids.indexOf(placement.targetRowId) + (placement.position === 'after' ? 1 : 0);
        if (at < 0) at = ids.length;
        ids.splice(at, 0, ...rows.map((r) => r.id));
        for (let i = 0; i < ids.length; i++) {
          const id = ids[i] as RowId;
          const row = next.get(id)?.row ?? rowById(ctx, id);
          if (row === undefined) continue;
          const error = setValue(id, row, order, i + 1);
          if (error) return { changed: [], error };
        }
      } else {
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i] as { id: RowId; row: Row };
          const error = setValue(r.id, next.get(r.id)?.row ?? r.row, order, values[i]);
          if (error) return { changed: [], error };
        }
      }
    }
    const changed: { rowId: RowId; row: Row; previous: Row; changedColumnIds: ColumnId[] }[] = [];
    for (const [rowId, e] of next) if (e.columns.length) changed.push({ rowId, row: e.row, previous: e.previous, changedColumnIds: e.columns });
    return { changed, error: null };
  };

  const visibleDataIds = (ctx: ModuleContext<Row>): RowId[] => {
    const model = ctx.getRows();
    const out: RowId[] = [];
    // Pinned rows keep their order values: they are not part of the reorderable rows.
    for (let i = model.pinned?.length ?? 0; i < model.count; i++) {
      if (model.view && model.view.kindAt(i) !== 'data') continue;
      const id = ctx.getRowIdAt(i);
      if (id !== undefined) out.push(id);
    }
    return out;
  };

  /** Neighbour data row of a visible index in a direction, skipping synthetic and excluded rows. */
  const neighbour = (ctx: ModuleContext<Row>, index: number, step: 1 | -1, exclude: ReadonlySet<RowId>): RowId | null => {
    const model = ctx.getRows();
    // The pinned rows head the model: the first scrolling row has no neighbour above.
    for (let i = index + step; i >= (model.pinned?.length ?? 0) && i < model.count; i += step) {
      if (model.view && model.view.kindAt(i) !== 'data') continue;
      const id = ctx.getRowIdAt(i);
      if (id !== undefined && !exclude.has(id)) return id;
    }
    return null;
  };

  /** Order values strictly between the placement's neighbours, or null when the gap is exhausted. */
  const orderValues = (ctx: ModuleContext<Row>, column: CompiledColumn<Row>, ids: readonly RowId[], placement: RowPlacement): number[] | null => {
    const exclude = new Set(ids);
    const valueOf = (id: RowId | null): number | undefined => {
      if (id === null) return undefined;
      const row = rowById(ctx, id);
      const v = row === undefined ? undefined : column.accessor(row);
      return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
    };
    let lowId: RowId | null;
    let highId: RowId | null;
    if (placement.targetRowId === null) {
      const model = ctx.getRows();
      if (placement.position === 'before') {
        lowId = null;
        highId = neighbour(ctx, -1, 1, exclude);
      } else {
        lowId = neighbour(ctx, model.count, -1, exclude);
        highId = null;
      }
    } else {
      const index = ctx.getRowIndex(placement.targetRowId);
      if (placement.position === 'before') {
        highId = placement.targetRowId;
        lowId = index >= 0 ? neighbour(ctx, index, -1, exclude) : null;
      } else {
        lowId = placement.targetRowId;
        highId = index >= 0 ? neighbour(ctx, index, 1, exclude) : null;
      }
    }
    const a = valueOf(lowId);
    const b = valueOf(highId);
    const k = ids.length;
    if (a === undefined && b === undefined) return ids.map((_, i) => i + 1);
    if (b === undefined) return ids.map((_, i) => (a as number) + i + 1);
    if (a === undefined) return ids.map((_, i) => b - (k - i));
    if (!(b - a > 1e-9 * (k + 1))) return null;
    return ids.map((_, i) => a + ((b - a) * (i + 1)) / (k + 1));
  };

  /** Writes a reorder of `ids` to `placement` (`into`: tree mode only). */
  const move = (ctx: ModuleContext<Row>, state: RowDragDropState, ids: readonly RowId[], placement: MovePlacement): RowDropStatus | string => {
    const tree = treeOf(ctx.getRows());
    if (tree) return treeMove(ctx, state, tree, ids, placement);
    if (placement.position === 'into') return 'invalidPosition';
    const rows: { id: RowId; row: Row }[] = [];
    for (const id of ids) {
      const row = rowById(ctx, id);
      if (row === undefined) return 'unknownRow';
      rows.push({ id, row });
    }
    const { changed, error } = changesFor(ctx, state, rows, placement as RowPlacement);
    if (error) return error;
    return write(ctx, state, { added: [], changed, deleted: [], moved: Object.freeze({ rowIds: Object.freeze([...ids]), targetRowId: placement.targetRowId, position: placement.position as 'before' | 'after' }) });
  };

  /**
   * Tree mode move: rows travel with
   * their subtrees (a row under another moved row is not listed again);
   * `into` appends as the target's last child. The write's `moved` is a
   * source array placement plus the new `parentId`; flat data also lists the
   * rows whose `parentIdField` changes in `changed`.
   */
  const treeMove = (ctx: ModuleContext<Row>, state: RowDragDropState, tree: TreeStructure, ids: readonly RowId[], placement: MovePlacement): RowDropStatus | string => {
    const index = tree.index;
    const t = placement.targetRowId === null ? -1 : tree.sourceIndexOf(placement.targetRowId);
    if (placement.targetRowId !== null && t < 0) return 'unknownRow';
    if (placement.position === 'into' && t < 0) return 'invalidTarget';
    const sources: number[] = [];
    for (const id of ids) {
      const s = tree.sourceIndexOf(id);
      if (s < 0) return 'unknownRow';
      if (s === t) return 'self';
      if (t >= 0 && isTreeAncestor(index, s, t)) return 'descendant';
      sources.push(s);
    }
    const outer = sources.filter((s) => !sources.some((a) => a !== s && isTreeAncestor(index, a, s)));
    const outerIds = outer.map((s) => tree.sourceIds[s] as RowId);
    const moving = new Set(outer);
    const parent = placement.position === 'into' ? t : t < 0 ? -1 : (index.parent[t] as number);
    const parentId = parent < 0 ? null : (tree.sourceIds[parent] as RowId);
    // Source array placement: `into` lands after the target's last remaining child (children follow source order).
    let targetRowId = placement.targetRowId;
    let position: 'before' | 'after' = placement.position === 'before' ? 'before' : 'after';
    if (placement.position === 'into') {
      let last = t;
      const end = index.next[index.slot[t] as number] as number;
      for (let c = (index.slot[t] as number) + 1; c < end; c = index.next[c] as number) {
        const s = index.order[c] as number;
        if (!moving.has(s) && s > last) last = s;
      }
      targetRowId = tree.sourceIds[last] as RowId;
      position = 'after';
    }
    const rows: { id: RowId; row: Row }[] = [];
    for (const id of outerIds) {
      const row = rowById(ctx, id);
      if (row === undefined) return 'unknownRow';
      rows.push({ id, row });
    }
    const arrayPlacement: RowPlacement = { rowIds: outerIds, targetRowId, position };
    const { changed, error } = changesFor(ctx, state, rows, arrayPlacement);
    if (error) return error;
    const merged = new Map(changed.map((c) => [c.rowId, c] as const));
    // Nested data cannot carry the new parent: the tree module keeps it (`tree.setParents`), undone when the write fails.
    const parents: Record<RowId, RowId | null> = {};
    const previous: Record<RowId, RowId | null> = {};
    let reparented = false;
    for (let k = 0; k < outer.length; k++) {
      const s = outer[k] as number;
      if ((index.parent[s] as number) === parent) continue;
      const { id, row } = rows[k] as { id: RowId; row: Row };
      const before = merged.get(id);
      const next = tree.withParent(before ? before.row : row, parentId) as Row | null;
      if (next === null) {
        if (!tree.nested) continue;
        const p = index.parent[s] as number;
        parents[id] = parentId;
        previous[id] = p < 0 ? null : (tree.sourceIds[p] as RowId);
        reparented = true;
        continue;
      }
      const columns = before ? [...before.changedColumnIds] : [];
      if (tree.parentIdField !== null && !columns.includes(tree.parentIdField)) columns.push(tree.parentIdField);
      merged.set(id, { rowId: id, row: next, previous: row, changedColumnIds: columns });
    }
    if (reparented) ctx.dispatch({ type: 'tree.setParents', parents });
    const status = write(ctx, state, {
      added: [],
      changed: [...merged.values()],
      deleted: [],
      moved: Object.freeze({ rowIds: Object.freeze(outerIds), targetRowId, position, parentId }),
    });
    if (reparented && status.status === 'error') ctx.dispatch({ type: 'tree.setParents', parents: previous });
    return status;
  };

  /** True when any of the rows is a pinned row. */
  const hasPinned = (ctx: ModuleContext<Row>, ids: readonly RowId[]): boolean => {
    const model = ctx.getRows();
    return (model.pinned?.length ?? 0) > 0 && ids.some((id) => isPinnedIndex(model, ctx.getRowIndex(id)));
  };

  const inVisibleOrder = (ctx: ModuleContext<Row>, ids: readonly RowId[]): RowId[] => {
    const unique = [...new Set(ids)];
    const keyed = unique.map((id, i) => [ctx.getRowIndex(id), i, id] as const);
    keyed.sort((x, y) => (x[0] < 0 ? Infinity : x[0]) - (y[0] < 0 ? Infinity : y[0]) || x[1] - y[1]);
    return keyed.map((k) => k[2]);
  };

  const endSession = (state: RowDragDropState, lastDrop: RowDropStatus | null = state.lastDrop): RowDragDropState => {
    dragged = new Set();
    draggedRows = [];
    draggedGroups = new Set();
    sortReason = null;
    fromIndexes = [];
    eventArgs = null;
    return Object.freeze({ ...state, drag: null, lastDrop });
  };

  let notifyRows: RowId[] = [];

  return defineDataGridModule<Row, RowDragDropState, RowDragCommand, 'rowDragDrop', RowDragDropMethods<Row>>({
    name: 'rowDragDrop',
    inSnapshot: false,
    commands: ROW_DRAG_COMMANDS,
    initialState(options: DataGridOptions<Row>): RowDragDropState {
      const o = (options['rowDragDrop'] ?? {}) as RowDragDropOptions;
      gridId = options.id ?? 'grid';
      getRowId = options.getRowId;
      handoff = o.handoff ?? null;
      lazy = ((options['grouping'] ?? {}) as { lazy?: boolean }).lazy === true;
      return createInitialRowDragState(options);
    },
    reduce(state, command, ctx) {
      switch (command.type) {
        case 'rowDragDrop.settled': {
          if (!state.lastDrop || state.lastDrop.id !== command.id) return state;
          return Object.freeze({ ...state, lastDrop: Object.freeze({ id: command.id, status: command.status, reason: command.reason ?? null }) });
        }
        case 'rowDragDrop.setEnabled':
          if (typeof command.enabled !== 'boolean') return ctx.reject('invalidEnabled');
          if (command.enabled === state.enabled) return state;
          return command.enabled ? Object.freeze({ ...state, enabled: true }) : Object.freeze({ ...endSession(state), enabled: false });
        case 'rowDragDrop.setOptions': {
          let next = state;
          if (typeof command.allowGroupChange === 'boolean' && command.allowGroupChange !== state.allowGroupChange) next = { ...next, allowGroupChange: command.allowGroupChange };
          if ((typeof command.orderField === 'string' || command.orderField === null) && command.orderField !== state.orderField) next = { ...next, orderField: command.orderField };
          return next === state ? state : Object.freeze(next);
        }
        case 'rowDragDrop.cancel':
        case 'rowDragDrop.leave':
          if (!state.drag) return state;
          if (command.type === 'rowDragDrop.leave') {
            if (!state.drag.over) return state;
            notifyRows = state.drag.over.rowId ? [state.drag.over.rowId] : [];
            return Object.freeze({ ...state, drag: Object.freeze({ ...state.drag, over: null }) });
          }
          notifyRows = state.drag.over?.rowId ? [state.drag.over.rowId] : [];
          if (state.drag.token && !state.drag.external) handoff?.cancel(state.drag.token);
          return endSession(state);
        default:
          break;
      }
      if (!state.enabled) return ctx.reject('rowDragDisabled');
      switch (command.type) {
        case 'rowDragDrop.start': {
          if (!isRowId(command.rowId)) return ctx.reject('invalidRowId');
          const index = ctx.getRowIndex(command.rowId);
          const kind = index >= 0 ? (ctx.getRows().view?.kindAt(index) ?? 'data') : 'data';
          if (kind !== 'data') return ctx.reject('notDataRow');
          if (isPinnedIndex(ctx.getRows(), index)) return ctx.reject('pinnedRow');
          if (rowById(ctx, command.rowId) === undefined) return ctx.reject('unknownRow');
          let ids: RowId[];
          if (Array.isArray(command.rowIds) && command.rowIds.length) {
            if (!command.rowIds.every(isRowId)) return ctx.reject('invalidRowId');
            ids = command.rowIds.includes(command.rowId) ? command.rowIds : [command.rowId, ...command.rowIds];
          } else {
            // dragging a selected row drags the selection.
            const selection = ctx.getModuleState<{ rows?: { scope?: string; ids?: ReadonlySet<RowId> } }>('selection');
            const sel = selection?.rows;
            ids = sel && sel.scope === 'explicit' && sel.ids?.has(command.rowId) ? [...sel.ids] : [command.rowId];
          }
          // Selected pinned rows stay in place.
          const pinnedModel = ctx.getRows();
          if (pinnedModel.pinned?.length) ids = ids.filter((rid) => !isPinnedIndex(pinnedModel, ctx.getRowIndex(rid)));
          ids = inVisibleOrder(ctx, ids);
          const rows: Row[] = [];
          for (const id of ids) {
            const row = rowById(ctx, id);
            if (row === undefined) return ctx.reject('unknownRow');
            rows.push(row);
          }
          dragged = new Set(ids);
          // Tree mode: the payload carries each dragged row's subtree (pre-order, filtered rows too).
          const tree = treeOf(ctx.getRows());
          if (tree) {
            const seen = new Set<RowId>(ids);
            for (const id of ids) {
              const a = tree.index.slot[tree.sourceIndexOf(id)] as number;
              if (a === undefined || a < 0) continue;
              const end = tree.index.next[a] as number;
              for (let x = a + 1; x < end; x++) {
                const d = tree.sourceIds[tree.index.order[x] as number] as RowId;
                const row = seen.has(d) ? undefined : rowById(ctx, d);
                if (row === undefined) continue;
                seen.add(d);
                rows.push(row);
              }
            }
          }
          draggedRows = Object.freeze(rows);
          draggedGroups = new Set(ids.map((id) => groupOfRow(ctx, id)));
          sortReason = sortRule(ctx, state);
          const model = ctx.getRows();
          fromIndexes = Object.freeze(ids.map((rid) => dataIndexAt(model, ctx.getRowIndex(rid))).sort((a, b) => a - b));
          const fromIndex = dataIndexAt(model, ctx.getRowIndex(ids[0] as RowId));
          const id = ++seq;
          let token: string | null = null;
          if (handoff) {
            token = handoff.begin({ sourceGridId: gridId, rowIds: Object.freeze(ids), rows: draggedRows }, (targetGridId) => {
              ctx.dispatch({ type: 'rowDragDrop.end', dropped: true, targetGridId });
            });
          }
          if (state.drag?.over?.rowId) notifyRows = [state.drag.over.rowId];
          return Object.freeze({ ...state, drag: Object.freeze({ id, token, external: false, rowIds: Object.freeze(ids), fromIndexes, fromIndex, over: null }) });
        }
        case 'rowDragDrop.over': {
          const drag = state.drag;
          if (!drag) return ctx.reject('notDragging');
          const over = target(ctx, state, command, drag.external);
          if (sameTarget(over, drag.over)) return state;
          notifyRows = [];
          if (drag.over?.rowId) notifyRows.push(drag.over.rowId);
          if (over?.rowId) notifyRows.push(over.rowId);
          return Object.freeze({ ...state, drag: Object.freeze({ ...drag, over }) });
        }
        case 'rowDragDrop.overExternal': {
          if (!handoff) return ctx.reject('noHandoff');
          const payload = isRowId(command.token) ? handoff.get(command.token) : undefined;
          if (!payload) return ctx.reject('unknownToken');
          if (payload.sourceGridId === gridId) return ctx.reject('sameGrid');
          let drag = state.drag;
          if (!drag || drag.token !== command.token) {
            dragged = new Set();
            draggedRows = payload.rows as readonly Row[];
            draggedGroups = new Set();
            sortReason = sortRule(ctx, state);
            fromIndexes = [];
            drag = Object.freeze({ id: ++seq, token: command.token, external: true, rowIds: payload.rowIds, fromIndexes, fromIndex: -1, over: null });
          }
          const over = target(ctx, state, command, true);
          if (sameTarget(over, drag.over) && drag === state.drag) return state;
          notifyRows = [];
          if (drag.over?.rowId) notifyRows.push(drag.over.rowId);
          if (over?.rowId) notifyRows.push(over.rowId);
          return Object.freeze({ ...state, drag: Object.freeze({ ...drag, over }) });
        }
        case 'rowDragDrop.drop': {
          const drag = state.drag;
          if (!drag || drag.external) return ctx.reject('notDragging');
          const over = drag.over;
          notifyRows = over?.rowId ? [over.rowId] : [];
          if (drag.token) handoff?.cancel(drag.token);
          const placement = over && over.valid ? resolvePlacement(ctx.getRows(), over) : null;
          if (!over || !over.valid || !placement) {
            return endSession(state, Object.freeze({ id: ++writeSeq, status: 'invalid' as const, reason: over?.reason ?? (over ? 'emptyGroup' : 'noTarget') }));
          }
          const position = treeOf(ctx.getRows()) ? over.position : placement.position;
          const result = move(ctx, state, drag.rowIds, { rowIds: drag.rowIds, targetRowId: placement.targetRowId, position });
          return endSession(state, typeof result === 'string' ? Object.freeze({ id: ++writeSeq, status: 'invalid' as const, reason: result }) : result);
        }
        case 'rowDragDrop.receive': {
          const drag = state.drag;
          if (!handoff || !drag || !drag.external || drag.token !== command.token) return ctx.reject('notDragging');
          const payload = handoff.get(command.token);
          const over = drag.over;
          notifyRows = over?.rowId ? [over.rowId] : [];
          const placement = over && over.valid ? resolvePlacement(ctx.getRows(), over) : null;
          if (!payload || !over || !over.valid || !placement) {
            return endSession(state, Object.freeze({ id: ++writeSeq, status: 'invalid' as const, reason: over?.reason ?? 'noTarget' }));
          }
          const rows = payload.rows as readonly Row[];
          const added = rows.map((row, i) => ({ tempId: getRowId(row, i), row }));
          // Tree mode: the dragged rows join the drop parent (`into`: as its last children); their subtrees keep their parents.
          const tree = treeOf(ctx.getRows());
          const outer = tree ? new Set(payload.rowIds) : null;
          const top = outer ? added.filter((a) => outer.has(a.tempId)) : added;
          const placementIds = top.map((a) => a.tempId);
          const into = tree !== null && over.position === 'into';
          const targetRowId = into ? null : placement.targetRowId;
          const position = into ? ('after' as const) : placement.position;
          const { changed, error } = changesFor(ctx, { ...state, orderField: null }, top.map((a) => ({ id: a.tempId, row: a.row })), { rowIds: placementIds, targetRowId, position });
          if (error) return endSession(state, Object.freeze({ id: ++writeSeq, status: 'invalid' as const, reason: error }));
          // Group values of the target are applied to the added rows directly.
          const byId = new Map(changed.map((c) => [c.rowId, c.row] as const));
          const parentId = over.parentId ?? null;
          if (tree) {
            const parents: Record<RowId, RowId | null> = {};
            for (const a of top) {
              const next = tree.withParent(byId.get(a.tempId) ?? a.row, parentId) as Row | null;
              if (next !== null) byId.set(a.tempId, next);
              else if (tree.nested) parents[a.tempId] = parentId;
            }
            if (Object.keys(parents).length) ctx.dispatch({ type: 'tree.setParents', parents });
          }
          const status = write(ctx, state, {
            added: added.map((a) => ({ tempId: a.tempId, row: byId.get(a.tempId) ?? a.row })),
            changed: [],
            deleted: [],
            moved: Object.freeze({ rowIds: Object.freeze(placementIds), targetRowId, position, ...(tree ? { parentId } : {}) }),
          });
          handoff.complete(command.token, gridId);
          return endSession(state, status);
        }
        case 'rowDragDrop.end': {
          const drag = state.drag;
          if (!drag) return state;
          notifyRows = drag.over?.rowId ? [drag.over.rowId] : [];
          if (drag.external) return endSession(state);
          if (command.dropped === true && typeof command.targetGridId === 'string' && command.targetGridId !== gridId) {
            // Tree mode: the subtrees in the payload leave with their rows.
            const ids = treeOf(ctx.getRows()) ? draggedRows.map((row, i) => getRowId(row, i)) : drag.rowIds;
            const deleted = ids.flatMap((id) => {
              const row = rowById(ctx, id);
              return row === undefined ? [] : [{ rowId: id, row }];
            });
            return endSession(state, write(ctx, state, { added: [], changed: [], deleted }));
          }
          if (drag.token && command.dropped !== true) handoff?.cancel(drag.token);
          return endSession(state);
        }
        case 'rowDragDrop.move': {
          if (!Array.isArray(command.rowIds) || command.rowIds.length === 0 || !command.rowIds.every(isRowId)) return ctx.reject('invalidRowIds');
          if (command.targetRowId !== null && !isRowId(command.targetRowId)) return ctx.reject('invalidTarget');
          if (command.position !== 'before' && command.position !== 'after' && !(command.position === 'into' && treeOf(ctx.getRows()))) return ctx.reject('invalidPosition');
          if (command.targetRowId !== null && command.rowIds.includes(command.targetRowId)) return ctx.reject('self');
          if (sortRule(ctx, state)) return ctx.reject('sorted');
          if (hasPinned(ctx, command.targetRowId === null ? command.rowIds : [...command.rowIds, command.targetRowId])) return ctx.reject('pinnedRow');
          const ids = inVisibleOrder(ctx, command.rowIds);
          if (!state.allowGroupChange && ctx.getRows().view && command.targetRowId !== null) {
            const group = groupOfRow(ctx, command.targetRowId);
            if (ids.some((id) => groupOfRow(ctx, id) !== group)) return ctx.reject('groupChange');
          }
          const result = move(ctx, state, ids, { rowIds: ids, targetRowId: command.targetRowId, position: command.position });
          if (typeof result === 'string') return ctx.reject(result);
          return Object.freeze({ ...state, lastDrop: result });
        }
        case 'rowDragDrop.reorder': {
          if (!Array.isArray(command.fromIndexes) || command.fromIndexes.length === 0) return ctx.reject('invalidIndexes');
          if (typeof command.toIndex !== 'number' || !Number.isInteger(command.toIndex) || command.toIndex < 0) return ctx.reject('invalidIndex');
          if (sortRule(ctx, state)) return ctx.reject('sorted');
          const model = ctx.getRows();
          const ids: RowId[] = [];
          const from = new Set<number>();
          for (const f of command.fromIndexes) {
            const rid = typeof f === 'number' ? dataRowIdAt(model, f) : undefined;
            if (rid === undefined) return ctx.reject('invalidIndexes');
            from.add(f as number);
            if (!ids.includes(rid)) ids.push(rid);
          }
          const ordered = inVisibleOrder(ctx, ids);
          // Data index toIndex of the list without the moved rows: skip the
          // moved data indexes at or before it (O(k log k), not O(toIndex)).
          const total = dataRowCountOf(model);
          const moved = [...from].sort((a, b) => a - b);
          let d = command.toIndex;
          for (const m of moved) {
            if (m <= d) d++;
            else break;
          }
          let targetRowId: RowId | null = null;
          let last: RowId | null = null;
          if (d < total) targetRowId = dataRowIdAt(model, d) as RowId;
          else {
            let e = total - 1;
            for (let j = moved.length - 1; j >= 0 && e >= 0 && moved[j] === e; j--) e--;
            last = e >= 0 ? (dataRowIdAt(model, e) as RowId) : null;
          }
          // Past the end: after the view's last remaining row (not the end of the source).
          const placement: RowPlacement =
            targetRowId === null ? { rowIds: ordered, targetRowId: last, position: 'after' } : { rowIds: ordered, targetRowId, position: 'before' };
          if (!state.allowGroupChange && model.view && baseView(model.view)?.kind !== 'plain') {
            const group = placement.targetRowId === null ? null : groupOfRow(ctx, placement.targetRowId);
            if (ordered.some((rid) => groupOfRow(ctx, rid) !== group)) return ctx.reject('groupChange');
          }
          const result = move(ctx, state, ordered, placement);
          if (typeof result === 'string') return ctx.reject(result);
          return Object.freeze({ ...state, lastDrop: result });
        }
        case 'rowDragDrop.moveBy': {
          if (!Array.isArray(command.rowIds) || command.rowIds.length === 0 || !command.rowIds.every(isRowId)) return ctx.reject('invalidRowIds');
          if (typeof command.offset !== 'number' || !Number.isInteger(command.offset) || command.offset === 0) return ctx.reject('invalidOffset');
          if (sortRule(ctx, state)) return ctx.reject('sorted');
          if (hasPinned(ctx, command.rowIds)) return ctx.reject('pinnedRow');
          const ids = inVisibleOrder(ctx, command.rowIds);
          const exclude = new Set(ids);
          const step = command.offset < 0 ? -1 : 1;
          let index = ctx.getRowIndex((step < 0 ? ids[0] : ids[ids.length - 1]) as RowId);
          if (index < 0) return ctx.reject('notVisible');
          let targetId: RowId | null = null;
          for (let n = Math.abs(command.offset); n > 0; n--) {
            const next = neighbour(ctx, index, step, exclude);
            if (next === null) break;
            targetId = next;
            index = ctx.getRowIndex(next);
          }
          if (targetId === null) return ctx.reject('edge');
          if (!state.allowGroupChange && ctx.getRows().view) {
            const group = groupOfRow(ctx, targetId);
            if (ids.some((id) => groupOfRow(ctx, id) !== group)) return ctx.reject('groupChange');
          }
          const placement: RowPlacement = { rowIds: ids, targetRowId: targetId, position: step < 0 ? 'before' : 'after' };
          const result = move(ctx, state, ids, placement);
          if (typeof result === 'string') return ctx.reject(result);
          return Object.freeze({ ...state, lastDrop: result });
        }
        default:
          return state;
      }
    },
    notify() {
      const rows = notifyRows;
      notifyRows = [];
      return rows.length ? { rows } : {};
    },
    methods,
    dispose() {
      dragged = new Set();
      draggedRows = [];
    },
  });

  void EMPTY_IDS;
}
