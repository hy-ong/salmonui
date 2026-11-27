// Selection module. Row, cell, and column
// selection by stable ids. The slice is `inSnapshot: false` and notifies only
// the rows (or cells, through their rows) whose state flipped, plus the
// module channel for summary subscribers (header select-all, live region).
//
// Cost model: toggling one row is O(1) and notifies one row;
// a range is O(range); select-all-filtered is O(1) (scope `allFiltered` with
// excluded ids). The row id set is owned by the module and updated in place
// between versions, so a toggle never copies the selection. Read it through
// the module methods or `serialize()`; never retain `rows.ids` across commands.

import { expandSpanRect, spanResolverOf, type CellSpanResolver } from './cell-spans.js';
import { defineDataGridModule } from './engine.js';
import { spanAnchorOf, visibleColumnIndex } from './focus.js';
import type { ColumnId, CommandResult, DataGridEngine, DataGridModule, DataGridOptions, ModuleContext, NotificationScope, RowId, RowModelSnapshot } from './types.js';

export type SelectionType = 'single' | 'multiple';
export type SelectionMode = 'row' | 'cell' | 'both';
export type CellSelectionMode = 'flow' | 'box';
export type CheckboxMode = 'default' | 'resetOnRowClick';

export interface SelectionOptions {
  /** Enables selection. Default true. */
  readonly enabled?: boolean;
  /** Default `single`. */
  readonly type?: SelectionType;
  /** Default `row`. */
  readonly mode?: SelectionMode;
  /** Cell range shape. Default `flow`. */
  readonly cellSelectionMode?: CellSelectionMode;
  /** Enables column selection. */
  readonly columns?: boolean;
  /** A checkbox column drives row selection. */
  readonly checkbox?: boolean;
  /** Only the checkbox selects rows. */
  readonly checkboxOnly?: boolean;
  readonly checkboxMode?: CheckboxMode;
  /** Clicking the only selected row deselects it. Default true. */
  readonly toggle?: boolean;
  /** Keep selection across sort, filter, search, page, and group changes. Default false. */
  readonly persist?: boolean;
  /** Plain clicks toggle rows in multiple mode. */
  readonly simpleMultiRow?: boolean;
  /** Enter / Shift+Enter select and move down / up. Default true. */
  readonly enterMoves?: boolean;
  readonly defaultSelectedRowIds?: readonly RowId[];
}

export interface ResolvedSelectionOptions {
  readonly enabled: boolean;
  readonly type: SelectionType;
  readonly mode: SelectionMode;
  readonly cellSelectionMode: CellSelectionMode;
  readonly columns: boolean;
  readonly checkbox: boolean;
  readonly checkboxOnly: boolean;
  readonly checkboxMode: CheckboxMode;
  readonly toggle: boolean;
  readonly persist: boolean;
  readonly simpleMultiRow: boolean;
  readonly enterMoves: boolean;
}

/** A cell by ids (a type alias of the core `CellKey` shape, so commands stay JSON-typed). */
export type CellKey = { readonly rowId: RowId; readonly columnId: ColumnId };

export type CellRange = {
  readonly anchor: CellKey;
  readonly focus: CellKey;
};

export interface RowSelection {
  /** `explicit`: `ids` are selected. `allFiltered`: every row matching the query is selected except `ids`. */
  readonly scope: 'explicit' | 'allFiltered';
  /** Live, module-owned set (selected ids, or excluded ids for `allFiltered`). Do not retain or mutate. */
  readonly ids: ReadonlySet<RowId>;
  readonly anchorId: RowId | null;
}

export interface SelectionState {
  readonly options: ResolvedSelectionOptions;
  readonly version: number;
  readonly rows: RowSelection;
  readonly cells: { readonly anchor: CellKey | null; readonly ranges: readonly CellRange[] };
  readonly columns: readonly ColumnId[];
  /** What the last command changed (membership flips of `rows.ids`). */
  readonly change: SelectionChange;
}

export interface SelectionChange {
  readonly from: number;
  /** The row set was replaced (scope change or replace). */
  readonly reset: boolean;
  /** Ids added to / removed from `rows.ids` (flips only). Empty on reset. */
  readonly added: readonly RowId[];
  readonly removed: readonly RowId[];
  /** Rows to notify for a cell range change. */
  readonly cellRows: readonly RowId[] | 'all';
  readonly columns: boolean;
}

/** JSON form (getState/restore, persistence, server-side select-all). */
export type SerializedSelection = {
  readonly scope: 'explicit' | 'allFiltered';
  /** `explicit`: selected ids. */
  readonly rowIds: readonly RowId[];
  /** `allFiltered`: excluded ids. */
  readonly excludedRowIds: readonly RowId[];
  readonly anchorRowId: RowId | null;
  readonly cellRanges: readonly CellRange[];
  readonly columnIds: readonly ColumnId[];
};

export interface SelectionSummary {
  readonly scope: 'explicit' | 'allFiltered';
  /** Selected rows among the rows matching the current query. */
  readonly count: number;
  /** Rows matching the current query (all pages). */
  readonly total: number;
  /** Header select-all checkbox state. */
  readonly header: 'none' | 'some' | 'all';
  readonly cellRangeCount: number;
  readonly columnCount: number;
}

type RowMode = 'replace' | 'add' | 'remove' | 'toggle';

export type SelectionSelectRowsCommand = { type: 'selection.selectRows'; rowIds: RowId[]; mode?: RowMode };
export type SelectionToggleRowCommand = { type: 'selection.toggleRow'; rowId: RowId };
/** Rows between `fromId` (default: the anchor) and `toId` in visible order. */
export type SelectionSelectRangeCommand = { type: 'selection.selectRange'; toId: RowId; fromId?: RowId; mode?: 'replace' | 'add' };
/** Every row of the current view (current page). Without paging this is `selectAllFiltered`. */
export type SelectionSelectAllVisibleCommand = { type: 'selection.selectAllVisible' };
export type SelectionSelectAllFilteredCommand = { type: 'selection.selectAllFiltered' };
/** Header checkbox: all → none, otherwise all filtered. */
export type SelectionToggleAllCommand = { type: 'selection.toggleAll' };
export type SelectionClearCommand = { type: 'selection.clear'; rows?: boolean; cells?: boolean; columns?: boolean };
export type SelectionSetCellRangeCommand = { type: 'selection.setCellRange'; anchor: CellKey; focus: CellKey; mode?: 'replace' | 'add' };
export type SelectionSelectCellsCommand = { type: 'selection.selectCells'; cells: CellKey[]; mode?: 'replace' | 'add' | 'toggle' };
/** Moves the focus end of the last range (Shift+click, Shift+Arrow in cell mode). */
export type SelectionExtendCellSelectionCommand = { type: 'selection.extendCellSelection'; focus: CellKey };
export type SelectionSelectColumnsCommand = { type: 'selection.selectColumns'; columnIds: ColumnId[]; mode?: 'replace' | 'add' | 'toggle' };
export type SelectionRestoreCommand = { type: 'selection.restore'; selection: SerializedSelection };
export type SelectionSetOptionsCommand = { type: 'selection.setOptions'; options: Omit<SelectionOptions, 'defaultSelectedRowIds'> };

export type SelectionCommand =
  | SelectionSelectRowsCommand
  | SelectionToggleRowCommand
  | SelectionSelectRangeCommand
  | SelectionSelectAllVisibleCommand
  | SelectionSelectAllFilteredCommand
  | SelectionToggleAllCommand
  | SelectionClearCommand
  | SelectionSetCellRangeCommand
  | SelectionSelectCellsCommand
  | SelectionExtendCellSelectionCommand
  | SelectionSelectColumnsCommand
  | SelectionRestoreCommand
  | SelectionSetOptionsCommand;

/**
 * Proposed selection of a command (rows, cells and columns), computed without
 * committing: before-events and controlled renderers. Parts the command leaves
 * alone report the current selection with empty added / removed lists. Large
 * fields are computed on first read; read them synchronously.
 */
export interface SelectionPreview {
  readonly scope: 'explicit' | 'allFiltered';
  /** Which parts of the selection the command changes. */
  readonly changes: { readonly rows: boolean; readonly cells: boolean; readonly columns: boolean };
  /** Rows that become selected / deselected; computed on first read. */
  readonly added: readonly RowId[];
  readonly removed: readonly RowId[];
  /** Selected ids after the command; materialized on first read (O(selected)). Read synchronously. */
  readonly selectedRowIds: readonly RowId[];
  /** Excluded ids when the scope is `allFiltered`. */
  readonly excludedRowIds: readonly RowId[];
  /** Cell ranges after the command. */
  readonly cellRanges: readonly CellRange[];
  /** Cells (data rows, visible columns) that become selected / deselected; O(cells in the old and new ranges) on first read. */
  readonly addedCells: readonly CellKey[];
  readonly removedCells: readonly CellKey[];
  /** Selected column ids after the command. */
  readonly columnIds: readonly ColumnId[];
  readonly addedColumns: readonly ColumnId[];
  readonly removedColumns: readonly ColumnId[];
}

export type SelectionMethods<Row> = {
  isRowSelected(ctx: ModuleContext<Row>, rowId: RowId): boolean;
  isCellSelected(ctx: ModuleContext<Row>, rowId: RowId, columnId: ColumnId): boolean;
  isColumnSelected(ctx: ModuleContext<Row>, columnId: ColumnId): boolean;
  /** Selected row ids in selection order (`allFiltered`: in view order). O(selected). */
  getSelectedRowIds(ctx: ModuleContext<Row>): readonly RowId[];
  getSummary(ctx: ModuleContext<Row>): SelectionSummary;
  serialize(ctx: ModuleContext<Row>): SerializedSelection;
  /** Selection outcome of a command without applying it; null when nothing (rows, cells, columns) would change or the command is rejected. */
  preview(ctx: ModuleContext<Row>, command: SelectionCommand): SelectionPreview | null;
};

export type SelectionModule<Row> = DataGridModule<Row, SelectionState, SelectionCommand, 'selection', SelectionMethods<Row>>;

/** Above this many changed rows a change notifies every subscribed row instead of listing ids. */
const LIST_LIMIT = 512;

const EMPTY: readonly never[] = Object.freeze([]);
const ROW_COMMANDS = new Set<string>([
  'selection.selectRows',
  'selection.toggleRow',
  'selection.selectRange',
  'selection.selectAllVisible',
  'selection.selectAllFiltered',
  'selection.toggleAll',
]);
const NO_CHANGE: SelectionChange = Object.freeze({ from: 0, reset: false, added: EMPTY, removed: EMPTY, cellRows: EMPTY, columns: false });

function resolveOptions(o: SelectionOptions, base?: ResolvedSelectionOptions): ResolvedSelectionOptions {
  return Object.freeze({
    enabled: o.enabled ?? base?.enabled ?? true,
    type: o.type === 'multiple' || o.type === 'single' ? o.type : (base?.type ?? 'single'),
    mode: o.mode === 'cell' || o.mode === 'both' || o.mode === 'row' ? o.mode : (base?.mode ?? 'row'),
    cellSelectionMode: o.cellSelectionMode === 'box' || o.cellSelectionMode === 'flow' ? o.cellSelectionMode : (base?.cellSelectionMode ?? 'flow'),
    columns: o.columns ?? base?.columns ?? false,
    checkbox: o.checkbox ?? base?.checkbox ?? false,
    checkboxOnly: o.checkboxOnly ?? base?.checkboxOnly ?? false,
    checkboxMode: o.checkboxMode === 'resetOnRowClick' || o.checkboxMode === 'default' ? o.checkboxMode : (base?.checkboxMode ?? 'default'),
    toggle: o.toggle ?? base?.toggle ?? true,
    persist: o.persist ?? base?.persist ?? false,
    simpleMultiRow: o.simpleMultiRow ?? base?.simpleMultiRow ?? false,
    enterMoves: o.enterMoves ?? base?.enterMoves ?? true,
  });
}

function isIdList(value: unknown): value is RowId[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function isCellKey(value: unknown): value is CellKey {
  return typeof value === 'object' && value !== null && typeof (value as CellKey).rowId === 'string' && typeof (value as CellKey).columnId === 'string';
}

function ref(c: CellKey): CellKey {
  return Object.freeze({ rowId: c.rowId, columnId: c.columnId });
}

// ---------------------------------------------------------------------------
// Row plans: what a command does to the row set, computed without mutation
// ---------------------------------------------------------------------------

type RowPlan =
  | { readonly kind: 'reset'; readonly scope: 'explicit' | 'allFiltered'; readonly ids: readonly RowId[]; readonly anchorId: RowId | null }
  | { readonly kind: 'delta'; readonly select: readonly RowId[]; readonly deselect: readonly RowId[]; readonly anchorId: RowId | null };

/** Stages that take rows out (pinned rows), add synthetic rows (captions, footers, detail rows), or page the model, in pipeline order. */
const STRUCTURAL_STAGES = ['pin', 'group', 'aggregate', 'groupExpansion', 'treeExpansion', 'detailExpansion', 'page'] as const;

/**
 * Rows matching the query on every page: the model entering the first
 * structural stage (filtered and sorted data rows only, no captions, group
 * footers, or detail rows), or the visible model when no such stage exists.
 */
function filteredModel<Row>(ctx: ModuleContext<Row>): RowModelSnapshot<Row> {
  for (const name of STRUCTURAL_STAGES) {
    const input = ctx.getStageInput(name);
    if (input) return input;
  }
  return ctx.getRows();
}

/** True when the visible model is one page of the filtered rows (paging on). */
function isPaged<Row>(ctx: ModuleContext<Row>): boolean {
  const input = ctx.getStageInput('page');
  // Pinned rows are added after the page window; compare with the model before them.
  return input !== undefined && input !== (ctx.getStageInput('pinnedRows') ?? ctx.getRows());
}

/** Data row id at index `i` of a model, or undefined for captions, group footers, and detail rows. */
function dataIdAt<Row>(model: RowModelSnapshot<Row>, i: number): RowId | undefined {
  const view = model.view;
  if (view) return view.kindAt(i) === 'data' ? view.idAt(i) : undefined;
  return model.sourceIds[model.order === null ? i : (model.order[i] as number)];
}

/** Data rows of a model (`count` minus synthetic rows). */
function dataCountOf<Row>(model: RowModelSnapshot<Row>): number {
  return model.view ? model.view.dataCount : model.count;
}

const inverseCache = new WeakMap<object, Int32Array>();

function sourceIndexMap<Row>(model: RowModelSnapshot<Row>): Map<RowId, number> {
  let map = sourceMaps.get(model.sourceIds);
  if (!map) {
    map = new Map();
    const ids = model.sourceIds;
    for (let i = 0; i < ids.length; i++) if (!map.has(ids[i] as RowId)) map.set(ids[i] as RowId, i);
    sourceMaps.set(model.sourceIds, map);
  }
  return map;
}
const sourceMaps = new WeakMap<object, Map<RowId, number>>();

/** True when the row matches the current query (on any page). */
function inFiltered<Row>(ctx: ModuleContext<Row>, rowId: RowId): boolean {
  if (ctx.getRowIndex(rowId) >= 0) return true; // visible rows are a subset of the filtered rows
  const model = filteredModel(ctx);
  if (model === ctx.getRows()) return false;
  const at = sourceIndexMap(model).get(rowId);
  if (at === undefined) return false;
  if (model.view) return model.view.indexOfSource(at) >= 0;
  if (model.order === null) return at < model.count;
  let inv = inverseCache.get(model);
  if (!inv) {
    inv = new Int32Array(model.source.length).fill(-1);
    for (let v = 0; v < model.count; v++) inv[model.order[v] as number] = v;
    inverseCache.set(model, inv);
  }
  return (inv[at] ?? -1) >= 0;
}

function isSelected<Row>(state: SelectionState, ctx: ModuleContext<Row>, rowId: RowId): boolean {
  const rows = state.rows;
  if (rows.scope === 'explicit') return rows.ids.has(rowId);
  return !rows.ids.has(rowId) && inFiltered(ctx, rowId);
}

/** Data row ids of visible indexes `[from, to]`; captions, group footers, and detail rows are skipped. */
function visibleIds<Row>(model: RowModelSnapshot<Row>, from: number, to: number): RowId[] {
  if (model.view) {
    const out: RowId[] = [];
    for (let i = from; i <= to; i++) {
      const id = dataIdAt(model, i);
      if (id !== undefined) out.push(id);
    }
    return out;
  }
  const out: RowId[] = new Array(to - from + 1);
  const ids = model.sourceIds;
  const order = model.order;
  for (let i = from; i <= to; i++) out[i - from] = ids[order === null ? i : (order[i] as number)] as RowId;
  return out;
}

function planRows<Row>(state: SelectionState, command: SelectionCommand, ctx: ModuleContext<Row>): RowPlan | null | string {
  const o = state.options;
  const single = o.type === 'single';
  switch (command.type) {
    case 'selection.selectRows': {
      if (!isIdList(command.rowIds)) return 'invalidRowIds';
      const mode = command.mode ?? 'replace';
      let ids = command.rowIds;
      if (single && ids.length > 1) ids = [ids[ids.length - 1] as RowId];
      const anchorId = ids.length ? (ids[ids.length - 1] as RowId) : state.rows.anchorId;
      if (mode === 'replace' || (single && mode !== 'remove')) {
        if (single && mode === 'toggle' && ids.length === 1 && isSelected(state, ctx, ids[0] as RowId)) return { kind: 'reset', scope: 'explicit', ids: EMPTY, anchorId };
        return { kind: 'reset', scope: 'explicit', ids, anchorId };
      }
      if (mode === 'add') return { kind: 'delta', select: ids, deselect: EMPTY, anchorId };
      if (mode === 'remove') return { kind: 'delta', select: EMPTY, deselect: ids, anchorId: state.rows.anchorId };
      const select: RowId[] = [];
      const deselect: RowId[] = [];
      for (const id of ids) (isSelected(state, ctx, id) ? deselect : select).push(id);
      return { kind: 'delta', select, deselect, anchorId };
    }
    case 'selection.toggleRow': {
      if (typeof command.rowId !== 'string') return 'invalidRowId';
      const selected = isSelected(state, ctx, command.rowId);
      if (single) return { kind: 'reset', scope: 'explicit', ids: selected ? EMPTY : [command.rowId], anchorId: command.rowId };
      return selected
        ? { kind: 'delta', select: EMPTY, deselect: [command.rowId], anchorId: command.rowId }
        : { kind: 'delta', select: [command.rowId], deselect: EMPTY, anchorId: command.rowId };
    }
    case 'selection.selectRange': {
      if (typeof command.toId !== 'string') return 'invalidRowId';
      const to = ctx.getRowIndex(command.toId);
      if (to < 0) return 'rowNotVisible';
      const fromId = command.fromId ?? state.rows.anchorId ?? command.toId;
      let from = ctx.getRowIndex(fromId);
      if (from < 0) from = to;
      const anchorId = command.fromId ?? state.rows.anchorId ?? command.toId;
      if (single) return { kind: 'reset', scope: 'explicit', ids: [command.toId], anchorId };
      const ids = visibleIds(ctx.getRows(), Math.min(from, to), Math.max(from, to));
      return command.mode === 'add' ? { kind: 'delta', select: ids, deselect: EMPTY, anchorId } : { kind: 'reset', scope: 'explicit', ids, anchorId };
    }
    case 'selection.selectAllVisible': {
      if (single) return 'singleSelection';
      const model = ctx.getRows();
      if (!isPaged(ctx)) return { kind: 'reset', scope: 'allFiltered', ids: EMPTY, anchorId: state.rows.anchorId };
      return model.count ? { kind: 'reset', scope: 'explicit', ids: visibleIds(model, 0, model.count - 1), anchorId: state.rows.anchorId } : null;
    }
    case 'selection.selectAllFiltered':
      if (single) return 'singleSelection';
      return { kind: 'reset', scope: 'allFiltered', ids: EMPTY, anchorId: state.rows.anchorId };
    case 'selection.toggleAll': {
      if (single) return 'singleSelection';
      const header = summaryOf(state, ctx).header;
      return header === 'all'
        ? { kind: 'reset', scope: 'explicit', ids: EMPTY, anchorId: null }
        : { kind: 'reset', scope: 'allFiltered', ids: EMPTY, anchorId: state.rows.anchorId };
    }
    case 'selection.clear':
      if (command.rows === false || ((command.cells || command.columns) && !command.rows)) return null;
      return { kind: 'reset', scope: 'explicit', ids: EMPTY, anchorId: null };
    case 'selection.restore': {
      const s = command.selection;
      if (typeof s !== 'object' || s === null || !isIdList(s.rowIds ?? []) || !isIdList(s.excludedRowIds ?? [])) return 'invalidSelection';
      const scope = s.scope === 'allFiltered' ? 'allFiltered' : 'explicit';
      return { kind: 'reset', scope, ids: scope === 'allFiltered' ? (s.excludedRowIds ?? EMPTY) : (s.rowIds ?? EMPTY), anchorId: typeof s.anchorRowId === 'string' ? s.anchorRowId : null };
    }
    default:
      return null;
  }
}

/** Plans that leave the row selection as it is become null (no notification, no change event). */
function isNoop(state: SelectionState, plan: RowPlan, ctx: ModuleContext<unknown>): boolean {
  const rows = state.rows;
  if (plan.kind === 'reset') {
    if (plan.scope !== rows.scope) return false;
    if (plan.ids.length !== rows.ids.size) return false;
    for (const id of plan.ids) if (!rows.ids.has(id)) return false;
    return plan.anchorId === rows.anchorId || plan.ids.length === 0;
  }
  for (const id of plan.select) if (!isSelected(state, ctx, id)) return false;
  for (const id of plan.deselect) if (isSelected(state, ctx, id)) return false;
  return plan.anchorId === rows.anchorId;
}

// ---------------------------------------------------------------------------
// Summary (header checkbox, live region): incremental per version
// ---------------------------------------------------------------------------

interface SummaryCache {
  state: SelectionState;
  model: RowModelSnapshot<unknown>;
  inFiltered: number; // ids of the set that match the query
  summary: SelectionSummary;
}
const summaries = new WeakMap<object, SummaryCache>();

function countInFiltered<Row>(ids: ReadonlySet<RowId>, ctx: ModuleContext<Row>): number {
  let n = 0;
  for (const id of ids) if (inFiltered(ctx, id)) n++;
  return n;
}

function summaryOf<Row>(state: SelectionState, ctx: ModuleContext<Row>): SelectionSummary {
  const model = filteredModel(ctx) as RowModelSnapshot<unknown>;
  const key = state.rows.ids;
  const cached = summaries.get(key);
  let inF: number;
  if (cached && cached.model === model && cached.state === state) return cached.summary;
  if (cached && cached.model === model && !state.change.reset && state.change.from === cached.state.version && cached.state.rows.scope === state.rows.scope) {
    inF = cached.inFiltered;
    for (const id of state.change.added) if (inFiltered(ctx, id)) inF++;
    for (const id of state.change.removed) if (inFiltered(ctx, id)) inF--;
  } else {
    inF = countInFiltered(state.rows.ids, ctx);
  }
  const total = dataCountOf(model);
  const count = state.rows.scope === 'explicit' ? inF : total - inF;
  const header = count === 0 ? 'none' : count >= total ? 'all' : 'some';
  const summary: SelectionSummary = Object.freeze({
    scope: state.rows.scope,
    count,
    total,
    header,
    cellRangeCount: state.cells.ranges.length,
    columnCount: state.columns.length,
  });
  summaries.set(key, { state, model, inFiltered: inF, summary });
  return summary;
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

interface ResolvedRange {
  readonly r0: number;
  readonly r1: number;
  readonly c0: number;
  readonly c1: number;
  /** Flow mode: anchor and focus positions in reading order. */
  readonly p0: number;
  readonly p1: number;
}
const rangeCache = new WeakMap<CellRange, { rows: unknown; cols: unknown; resolved: ResolvedRange | null }>();

function resolveRange<Row>(range: CellRange, ctx: ModuleContext<Row>): ResolvedRange | null {
  const rows = ctx.getRows();
  const columns = ctx.getColumns();
  const hit = rangeCache.get(range);
  if (hit && hit.rows === rows && hit.cols === columns.visible) return hit.resolved;
  const ra = ctx.getRowIndex(range.anchor.rowId);
  const rf = ctx.getRowIndex(range.focus.rowId);
  const ca = visibleColumnIndex(columns, range.anchor.columnId);
  const cf = visibleColumnIndex(columns, range.focus.columnId);
  let resolved: ResolvedRange | null = null;
  if (ra >= 0 && rf >= 0 && ca >= 0 && cf >= 0) {
    const n = columns.visible.length;
    const pa = ra * n + ca;
    const pf = rf * n + cf;
    resolved = { r0: Math.min(ra, rf), r1: Math.max(ra, rf), c0: Math.min(ca, cf), c1: Math.max(ca, cf), p0: Math.min(pa, pf), p1: Math.max(pa, pf) };
  }
  rangeCache.set(range, { rows, cols: columns.visible, resolved });
  return resolved;
}

function cellInRanges<Row>(state: SelectionState, ctx: ModuleContext<Row>, rowId: RowId, columnId: ColumnId): boolean {
  const ranges = state.cells.ranges;
  if (ranges.length === 0) return false;
  const r = ctx.getRowIndex(rowId);
  if (r < 0) return false;
  const columns = ctx.getColumns();
  const c = visibleColumnIndex(columns, columnId);
  if (c < 0) return false;
  const flow = state.options.cellSelectionMode === 'flow';
  const p = r * columns.visible.length + c;
  for (const range of ranges) {
    const x = resolveRange(range, ctx);
    if (!x || r < x.r0 || r > x.r1) continue;
    if (flow ? p >= x.p0 && p <= x.p1 : c >= x.c0 && c <= x.c1) return true;
  }
  return false;
}

function containsCell<Row>(range: CellRange, ctx: ModuleContext<Row>, cell: CellKey): boolean {
  const x = resolveRange(range, ctx);
  if (!x) return false;
  const r = ctx.getRowIndex(cell.rowId);
  const c = visibleColumnIndex(ctx.getColumns(), cell.columnId);
  return r >= x.r0 && r <= x.r1 && c >= x.c0 && c <= x.c1;
}

/** Rows touched by ranges (for notification), or 'all' when too many. */
function rangeRows<Row>(ranges: readonly CellRange[], ctx: ModuleContext<Row>, into: Set<RowId>): boolean {
  const model = ctx.getRows();
  for (const range of ranges) {
    const x = resolveRange(range, ctx);
    if (!x) {
      into.add(range.anchor.rowId);
      into.add(range.focus.rowId);
      continue;
    }
    if (x.r1 - x.r0 + 1 + into.size > LIST_LIMIT) return false;
    for (const id of visibleIds(model, x.r0, x.r1)) into.add(id);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

/** A change record without its base version. */
type ChangeBody = Pick<SelectionChange, 'reset' | 'added' | 'removed' | 'cellRows' | 'columns'>;

function withChange(state: SelectionState, patch: Partial<SelectionState>, change: ChangeBody): SelectionState {
  return Object.freeze({ ...state, ...patch, version: state.version + 1, change: Object.freeze({ from: state.version, ...change }) });
}

function applyRows<Row>(state: SelectionState, plan: RowPlan, ctx: ModuleContext<Row>): SelectionState {
  if (plan.kind === 'reset') {
    const rows: RowSelection = Object.freeze({ scope: plan.scope, ids: new Set(plan.ids), anchorId: plan.anchorId });
    return withChange(state, { rows }, { reset: true, added: EMPTY, removed: EMPTY, cellRows: EMPTY, columns: false });
  }
  const explicit = state.rows.scope === 'explicit';
  // Selecting into an empty set (a cascade check of a large subtree): one native construction.
  const fresh = explicit && !state.rows.ids.size && !plan.deselect.length;
  const set = (fresh ? new Set(plan.select) : state.rows.ids) as Set<RowId>;
  const added: RowId[] = fresh ? [...set] : [];
  const removed: RowId[] = [];
  // explicit: select adds to the set. allFiltered: select removes from the excluded set.
  if (!fresh) for (const id of plan.select) {
    if (explicit) {
      if (!set.has(id)) {
        set.add(id);
        added.push(id);
      }
    } else if (set.delete(id)) removed.push(id);
  }
  for (const id of plan.deselect) {
    if (explicit) {
      if (set.delete(id)) removed.push(id);
    } else if (!set.has(id) && inFiltered(ctx, id)) {
      set.add(id);
      added.push(id);
    }
  }
  const rows: RowSelection = Object.freeze({ scope: state.rows.scope, ids: set, anchorId: plan.anchorId });
  return withChange(state, { rows }, { reset: false, added, removed, cellRows: EMPTY, columns: false });
}

function sameRef(a: CellKey | null, b: CellKey | null): boolean {
  return a === b || (a !== null && b !== null && a.rowId === b.rowId && a.columnId === b.columnId);
}

/** A cell, or the anchor of the span covering it. */
function anchorRef<Row>(ctx: ModuleContext<Row>, spans: CellSpanResolver | null, c: CellKey): CellKey {
  return ref(spanAnchorOf(ctx, spans, c.rowId, c.columnId) ?? c);
}

/**
 * A box range from `start` to `focus` grown to cover every span it touches: its anchor corner is on the side of `start`. Flow ranges and
 * ranges without spans are returned as given.
 */
function spanRange<Row>(ctx: ModuleContext<Row>, spans: CellSpanResolver | null, flow: boolean, start: CellKey, focus: CellKey): CellRange {
  const plain = (): CellRange => Object.freeze({ anchor: start, focus });
  if (!spans || flow) return plain();
  const columns = ctx.getColumns();
  const ra = ctx.getRowIndex(start.rowId);
  const rf = ctx.getRowIndex(focus.rowId);
  const ca = visibleColumnIndex(columns, start.columnId);
  const cf = visibleColumnIndex(columns, focus.columnId);
  if (ra < 0 || rf < 0 || ca < 0 || cf < 0) return plain();
  const rect = { r0: Math.min(ra, rf), r1: Math.max(ra, rf), c0: Math.min(ca, cf), c1: Math.max(ca, cf) };
  const x = expandSpanRect(spans, rect);
  if (x.r0 === rect.r0 && x.r1 === rect.r1 && x.c0 === rect.c0 && x.c1 === rect.c1) return plain();
  const key = (r: number, c: number): CellKey | null => {
    const rowId = ctx.getRowIdAt(r);
    const col = columns.visible[c] as { columnId: ColumnId } | undefined;
    return rowId === undefined || !col ? null : Object.freeze({ rowId, columnId: col.columnId });
  };
  const a = key(ra <= rf ? x.r0 : x.r1, ca <= cf ? x.c0 : x.c1);
  const f = key(ra <= rf ? x.r1 : x.r0, ca <= cf ? x.c1 : x.c0);
  return a && f ? Object.freeze({ anchor: a, focus: f }) : plain();
}

function reduceCells<Row>(state: SelectionState, command: SelectionCommand, ctx: ModuleContext<Row>, spans: CellSpanResolver | null = null): SelectionState | string | null {
  const o = state.options;
  const cells = state.cells;
  let ranges: readonly CellRange[] | null = null;
  let anchor: CellKey | null = cells.anchor;
  const flow = o.cellSelectionMode === 'flow';
  switch (command.type) {
    case 'selection.setCellRange': {
      if (!isCellKey(command.anchor) || !isCellKey(command.focus)) return 'invalidCell';
      if (o.mode === 'row') return 'cellSelectionDisabled';
      const start = anchorRef(ctx, spans, command.anchor);
      const range = o.type === 'single' ? Object.freeze({ anchor: start, focus: start }) : spanRange(ctx, spans, flow, start, anchorRef(ctx, spans, command.focus));
      // The selection anchor stays the anchor cell; the stored range may be grown around it to cover spans.
      anchor = start;
      ranges = command.mode === 'add' && o.type === 'multiple' ? [...cells.ranges, range] : [range];
      break;
    }
    case 'selection.selectCells': {
      if (!Array.isArray(command.cells) || !command.cells.every(isCellKey)) return 'invalidCell';
      if (o.mode === 'row') return 'cellSelectionDisabled';
      let list = command.cells.map((c) => anchorRef(ctx, spans, c));
      if (o.type === 'single' && list.length > 1) list = [list[list.length - 1] as CellKey];
      const mode = command.mode ?? 'replace';
      if (mode === 'toggle') {
        const keep = cells.ranges.filter((r) => !list.some((c) => sameRef(r.anchor, c) && sameRef(r.focus, c)));
        const removedSome = keep.length !== cells.ranges.length;
        ranges = removedSome ? keep : [...(o.type === 'multiple' ? cells.ranges : []), ...list.map((c) => Object.freeze({ anchor: c, focus: c }))];
      } else {
        const fresh = list.map((c) => Object.freeze({ anchor: c, focus: c }));
        ranges = mode === 'add' && o.type === 'multiple' ? [...cells.ranges, ...fresh] : fresh;
      }
      anchor = list.length ? (list[list.length - 1] as CellKey) : anchor;
      break;
    }
    case 'selection.extendCellSelection': {
      if (!isCellKey(command.focus)) return 'invalidCell';
      if (o.mode === 'row') return 'cellSelectionDisabled';
      const focus = anchorRef(ctx, spans, command.focus);
      const start = anchor ?? focus;
      const range: CellRange = o.type === 'single' ? Object.freeze({ anchor: start, focus: start }) : spanRange(ctx, spans, flow, start, focus);
      const last = cells.ranges[cells.ranges.length - 1];
      if (last && sameRef(last.anchor, range.anchor) && sameRef(last.focus, range.focus)) return null;
      // The last range belongs to the anchor when it starts there, or (grown around spans) contains it.
      const own = last !== undefined && (sameRef(last.anchor, start) || (spans !== null && !flow && containsCell(last, ctx, start)));
      ranges = own ? [...cells.ranges.slice(0, -1), range] : [...(o.type === 'multiple' ? cells.ranges.slice(0, -1) : []), range];
      anchor = start;
      break;
    }
    case 'selection.clear':
      if (command.cells === false || ((command.rows || command.columns) && !command.cells)) return null;
      if (cells.ranges.length === 0 && cells.anchor === null) return null;
      ranges = EMPTY;
      anchor = null;
      break;
    case 'selection.restore':
      ranges = Array.isArray(command.selection?.cellRanges)
        ? command.selection.cellRanges.filter((r) => isCellKey(r?.anchor) && isCellKey(r?.focus)).map((r) => Object.freeze({ anchor: ref(r.anchor), focus: ref(r.focus) }))
        : EMPTY;
      if (ranges.length === 0 && cells.ranges.length === 0) return null;
      anchor = ranges.length ? (ranges[ranges.length - 1] as CellRange).anchor : null;
      break;
    default:
      return null;
  }
  const touched = new Set<RowId>();
  const listed = rangeRows(cells.ranges, ctx, touched) && rangeRows(ranges, ctx, touched);
  return withChange(
    state,
    { cells: Object.freeze({ anchor, ranges: Object.freeze([...ranges]) }) },
    { reset: false, added: EMPTY, removed: EMPTY, cellRows: listed ? [...touched] : 'all', columns: false },
  );
}

function reduceColumns(state: SelectionState, command: SelectionCommand): SelectionState | string | null {
  let next: readonly ColumnId[];
  switch (command.type) {
    case 'selection.selectColumns': {
      if (!isIdList(command.columnIds)) return 'invalidColumnIds';
      if (!state.options.columns) return 'columnSelectionDisabled';
      let ids = command.columnIds;
      if (state.options.type === 'single' && ids.length > 1) ids = [ids[ids.length - 1] as ColumnId];
      const mode = command.mode ?? 'replace';
      if (mode === 'replace' || state.options.type === 'single') next = mode === 'toggle' && ids.length === 1 && state.columns.length === 1 && state.columns[0] === ids[0] ? [] : ids;
      else if (mode === 'add') next = [...state.columns, ...ids.filter((id) => !state.columns.includes(id))];
      else {
        const remove = ids.filter((id) => state.columns.includes(id));
        next = [...state.columns.filter((id) => !remove.includes(id)), ...ids.filter((id) => !remove.includes(id))];
      }
      break;
    }
    case 'selection.clear':
      if (command.columns === false || ((command.rows || command.cells) && !command.columns)) return null;
      next = EMPTY;
      break;
    case 'selection.restore':
      next = isIdList(command.selection?.columnIds) ? command.selection.columnIds : EMPTY;
      break;
    default:
      return null;
  }
  if (next.length === state.columns.length && next.every((id, i) => state.columns[i] === id)) return null;
  return withChange(state, { columns: Object.freeze([...next]) }, { reset: false, added: EMPTY, removed: EMPTY, cellRows: EMPTY, columns: true });
}

/** Visible positions (`row * columns + column`) of the data cells covered by `ranges`. */
function cellPositions<Row>(ranges: readonly CellRange[], flow: boolean, ctx: ModuleContext<Row>): Set<number> {
  const out = new Set<number>();
  const model = ctx.getRows();
  const n = ctx.getColumns().visible.length;
  for (const range of ranges) {
    const x = resolveRange(range, ctx);
    if (!x) continue;
    for (let r = x.r0; r <= x.r1; r++) {
      if (dataIdAt(model, r) === undefined) continue;
      const c0 = flow ? (r === x.r0 ? x.p0 - r * n : 0) : x.c0;
      const c1 = flow ? (r === x.r1 ? x.p1 - r * n : n - 1) : x.c1;
      for (let c = c0; c <= c1; c++) out.add(r * n + c);
    }
  }
  return out;
}

function cellDiff<Row>(before: readonly CellRange[], after: readonly CellRange[], flow: boolean, ctx: ModuleContext<Row>): { added: CellKey[]; removed: CellKey[] } {
  const a = cellPositions(before, flow, ctx);
  const b = cellPositions(after, flow, ctx);
  const visible = ctx.getColumns().visible;
  const n = visible.length;
  const key = (p: number): CellKey => {
    const r = Math.floor(p / n);
    return Object.freeze({ rowId: ctx.getRowIdAt(r) as RowId, columnId: (visible[p - r * n] as { columnId: ColumnId }).columnId });
  };
  const added: CellKey[] = [];
  const removed: CellKey[] = [];
  for (const p of b) if (!a.has(p)) added.push(key(p));
  for (const p of a) if (!b.has(p)) removed.push(key(p));
  const order = (x: CellKey, y: CellKey): number => ctx.getRowIndex(x.rowId) - ctx.getRowIndex(y.rowId) || visibleColumnIndex(ctx.getColumns(), x.columnId) - visibleColumnIndex(ctx.getColumns(), y.columnId);
  return { added: added.sort(order), removed: removed.sort(order) };
}

function sameRanges(a: readonly CellRange[], b: readonly CellRange[]): boolean {
  return a.length === b.length && a.every((r, i) => sameRef(r.anchor, (b[i] as CellRange).anchor) && sameRef(r.focus, (b[i] as CellRange).focus));
}

/** The no-op row plan: the preview of a command that leaves the rows alone. */
function keepRows(state: SelectionState): RowPlan {
  return { kind: 'delta', select: EMPTY, deselect: EMPTY, anchorId: state.rows.anchorId };
}

function makePreview<Row>(
  state: SelectionState,
  plan: RowPlan,
  ctx: ModuleContext<Row>,
  cells: SelectionState | null = null,
  columns: SelectionState | null = null,
  rowsChange = true,
): SelectionPreview {
  const base = state.rows;
  const scope = plan.kind === 'reset' ? plan.scope : base.scope;
  // Delta plans mutate the set in place on commit, so their flips are computed
  // now. Reset plans replace the set, so the old one stays valid for lazy reads.
  let added: RowId[] | null = null;
  let removed: RowId[] | null = null;
  if (plan.kind === 'delta') {
    added = plan.select.filter((id) => !isSelected(state, ctx, id));
    removed = plan.deselect.filter((id) => isSelected(state, ctx, id));
  }
  let next: Set<RowId> | null = null;
  let selected: RowId[] | null = null;
  const nextSet = (): Set<RowId> => {
    if (next) return next;
    if (plan.kind === 'reset') return (next = new Set(plan.ids));
    const set = new Set(base.ids);
    // Idempotent: also correct when read after the delta committed.
    for (const id of base.scope === 'explicit' ? (added as RowId[]) : (removed as RowId[])) set.add(id);
    for (const id of base.scope === 'explicit' ? (removed as RowId[]) : (added as RowId[])) set.delete(id);
    return (next = set);
  };
  const materialize = (scopeOf: 'explicit' | 'allFiltered', ids: ReadonlySet<RowId>): RowId[] => {
    if (scopeOf === 'explicit') return [...ids];
    const model = filteredModel(ctx);
    const out: RowId[] = [];
    for (let i = 0; i < model.count; i++) {
      const id = dataIdAt(model, i);
      if (id !== undefined && !ids.has(id)) out.push(id);
    }
    return out;
  };
  const selectedIds = (): RowId[] => (selected ??= materialize(scope, nextSet()));
  const diff = (): void => {
    if (added && removed) return;
    const before = new Set(materialize(base.scope, base.ids));
    const after = selectedIds();
    const afterSet = new Set(after);
    added = after.filter((id) => !before.has(id));
    removed = [...before].filter((id) => !afterSet.has(id));
  };
  const cellRanges = cells ? cells.cells.ranges : state.cells.ranges;
  let cellChange: { added: CellKey[]; removed: CellKey[] } | null = null;
  const cellDelta = (): { added: CellKey[]; removed: CellKey[] } =>
    (cellChange ??= cells ? cellDiff(state.cells.ranges, cellRanges, state.options.cellSelectionMode === 'flow', ctx) : { added: [], removed: [] });
  const columnIds = columns ? columns.columns : state.columns;
  return {
    scope,
    changes: Object.freeze({ rows: rowsChange, cells: cells !== null, columns: columns !== null }),
    cellRanges,
    columnIds,
    get addedCells() {
      return cellDelta().added;
    },
    get removedCells() {
      return cellDelta().removed;
    },
    get addedColumns() {
      return columnIds.filter((id) => !state.columns.includes(id));
    },
    get removedColumns() {
      return state.columns.filter((id) => !columnIds.includes(id));
    },
    get added() {
      diff();
      return added as RowId[];
    },
    get removed() {
      diff();
      return removed as RowId[];
    },
    get selectedRowIds() {
      return selectedIds();
    },
    get excludedRowIds() {
      return scope === 'allFiltered' ? [...nextSet()] : [];
    },
  };
}

/**
 * Creates the `selection` module. Options are read from `options.selection`
 * (`SelectionOptions`).
 */
export function createSelectionModule<Row>(): SelectionModule<Row> {
  let spans: CellSpanResolver | null = null;
  const methods: SelectionMethods<Row> = {
    isRowSelected: (ctx, rowId) => isSelected(ctx.getModuleState<SelectionState>('selection') as SelectionState, ctx, rowId),
    isCellSelected(ctx, rowId, columnId) {
      const state = ctx.getModuleState<SelectionState>('selection') as SelectionState;
      if (state.columns.length && state.columns.includes(columnId)) return true;
      return cellInRanges(state, ctx, rowId, columnId);
    },
    isColumnSelected: (ctx, columnId) => (ctx.getModuleState<SelectionState>('selection') as SelectionState).columns.includes(columnId),
    getSelectedRowIds(ctx) {
      const state = ctx.getModuleState<SelectionState>('selection') as SelectionState;
      if (state.rows.scope === 'explicit') return Object.freeze([...state.rows.ids]);
      const model = filteredModel(ctx);
      const out: RowId[] = [];
      for (let i = 0; i < model.count; i++) {
        const id = dataIdAt(model, i);
        if (id !== undefined && !state.rows.ids.has(id)) out.push(id);
      }
      return Object.freeze(out);
    },
    getSummary: (ctx) => summaryOf(ctx.getModuleState<SelectionState>('selection') as SelectionState, ctx),
    serialize(ctx) {
      const state = ctx.getModuleState<SelectionState>('selection') as SelectionState;
      const ids = Object.freeze([...state.rows.ids]);
      return Object.freeze({
        scope: state.rows.scope,
        rowIds: state.rows.scope === 'explicit' ? ids : EMPTY,
        excludedRowIds: state.rows.scope === 'allFiltered' ? ids : EMPTY,
        anchorRowId: state.rows.anchorId,
        cellRanges: state.cells.ranges,
        columnIds: state.columns,
      });
    },
    preview(ctx, command) {
      const state = ctx.getModuleState<SelectionState>('selection') as SelectionState;
      if (!state.options.enabled || command.type === 'selection.setOptions') return null;
      // Mirrors reduce(): rows, then cells, then columns; a rejected step rejects the command.
      let plan: RowPlan | null = null;
      if (state.options.mode !== 'cell' || command.type === 'selection.clear' || command.type === 'selection.restore') {
        const p = planRows(state, command, ctx);
        if (typeof p === 'string') return null;
        if (p && !isNoop(state, p, ctx as ModuleContext<unknown>)) plan = p;
      } else if (ROW_COMMANDS.has(command.type)) {
        return null;
      }
      // reduceCells / reduceColumns are pure (only applyRows updates the row set in place).
      let cells = reduceCells(state, command, ctx, spans);
      if (typeof cells === 'string') return null;
      // A command that rebuilds the same ranges changes nothing a listener can see.
      if (cells && sameRanges(cells.cells.ranges, state.cells.ranges)) cells = null;
      const columns = reduceColumns(state, command);
      if (typeof columns === 'string') return null;
      if (plan === null && cells === null && columns === null) return null;
      return makePreview(state, plan ?? keepRows(state), ctx, cells, columns, plan !== null);
    },
  };

  return defineDataGridModule<Row, SelectionState, SelectionCommand, 'selection', SelectionMethods<Row>>({
    name: 'selection',
    inSnapshot: false,
    commands: [
      'selection.selectRows',
      'selection.toggleRow',
      'selection.selectRange',
      'selection.selectAllVisible',
      'selection.selectAllFiltered',
      'selection.toggleAll',
      'selection.clear',
      'selection.setCellRange',
      'selection.selectCells',
      'selection.extendCellSelection',
      'selection.selectColumns',
      'selection.restore',
      'selection.setOptions',
    ],
    methods,
    initialState(options: DataGridOptions<Row>): SelectionState {
      spans = spanResolverOf(options);
      const o = (options['selection'] ?? {}) as SelectionOptions;
      const resolved = resolveOptions(o);
      let initial = isIdList(o.defaultSelectedRowIds) ? [...o.defaultSelectedRowIds] : [];
      if (resolved.type === 'single' && initial.length > 1) initial = [initial[initial.length - 1] as RowId];
      return Object.freeze({
        options: resolved,
        version: 0,
        rows: Object.freeze({ scope: 'explicit', ids: new Set(initial), anchorId: initial.length ? (initial[initial.length - 1] as RowId) : null }),
        cells: Object.freeze({ anchor: null, ranges: EMPTY }),
        columns: EMPTY,
        change: NO_CHANGE,
      });
    },
    reduce(state, command, ctx) {
      if (command.type === 'selection.setOptions') {
        if (typeof command.options !== 'object' || command.options === null) return ctx.reject('invalidOptions');
        const options = resolveOptions(command.options, state.options);
        const same = (Object.keys(options) as (keyof ResolvedSelectionOptions)[]).every((k) => options[k] === state.options[k]);
        if (same) return state;
        // A type or mode change resets the selection.
        const reset = options.type !== state.options.type || options.mode !== state.options.mode || options.cellSelectionMode !== state.options.cellSelectionMode;
        if (!reset) return Object.freeze({ ...state, options });
        return withChange(
          { ...state, options },
          { rows: Object.freeze({ scope: 'explicit', ids: new Set<RowId>(), anchorId: null }), cells: Object.freeze({ anchor: null, ranges: EMPTY }), columns: EMPTY },
          { reset: true, added: EMPTY, removed: EMPTY, cellRows: 'all', columns: true },
        );
      }
      if (!state.options.enabled && command.type !== 'selection.clear' && command.type !== 'selection.restore') return ctx.reject('selectionDisabled');
      let next = state;
      // Rows (row and both modes).
      if (state.options.mode !== 'cell' || command.type === 'selection.clear' || command.type === 'selection.restore') {
        const plan = planRows(next, command, ctx);
        if (typeof plan === 'string') return ctx.reject(plan);
        if (plan && !isNoop(next, plan, ctx as ModuleContext<unknown>)) next = applyRows(next, plan, ctx);
      } else if (ROW_COMMANDS.has(command.type)) {
        return ctx.reject('rowSelectionDisabled');
      }
      const cells = reduceCells(next, command, ctx, spans);
      if (typeof cells === 'string') return ctx.reject(cells);
      if (cells) next = mergeChange(state, next, cells);
      const columns = reduceColumns(next, command);
      if (typeof columns === 'string') return ctx.reject(columns);
      if (columns) next = mergeChange(state, next, columns);
      return next;
    },
    notify(previous, next): NotificationScope {
      const change = next.change;
      if (next.version === previous.version) return {};
      let allRows = change.reset || change.cellRows === 'all';
      let rows: RowId[] = [];
      if (!allRows) {
        if (change.added.length + change.removed.length + (change.cellRows as readonly RowId[]).length > LIST_LIMIT) allRows = true;
        else rows = [...change.added, ...change.removed, ...(change.cellRows as readonly RowId[])];
      }
      return allRows ? { allRows: true, allHeaders: change.columns } : { rows, allHeaders: change.columns };
    },
    onQueryChange(previous, next, ctx) {
      const state = ctx.getModuleState<SelectionState>('selection') as SelectionState;
      if (state.options.persist) return;
      const empty = state.rows.scope === 'explicit' && state.rows.ids.size === 0 && state.cells.ranges.length === 0 && state.columns.length === 0;
      if (empty) return;
      if (
        previous.sorting !== next.sorting ||
        previous.filters !== next.filters ||
        previous.search !== next.search ||
        previous.grouping !== next.grouping ||
        previous.paging?.page !== next.paging?.page ||
        previous.paging?.pageSize !== next.paging?.pageSize
      ) {
        ctx.dispatch({ type: 'selection.clear' });
      }
    },
  });
}

/** Folds a later step of one command (rows, then cells, then columns) into one version and one change record. */
function mergeChange(original: SelectionState, first: SelectionState, second: SelectionState): SelectionState {
  if (first === original) return second;
  const a = first.change;
  const b = second.change;
  const cellRows: readonly RowId[] | 'all' = a.cellRows === 'all' || b.cellRows === 'all' ? 'all' : [...a.cellRows, ...b.cellRows];
  return Object.freeze({
    ...second,
    version: first.version,
    change: Object.freeze({ from: a.from, reset: a.reset || b.reset, added: a.added, removed: a.removed, cellRows, columns: a.columns || b.columns }),
  });
}

// ---------------------------------------------------------------------------
// Imperative façade
// ---------------------------------------------------------------------------

type SelectionFacade = { readonly selection?: { [K in keyof SelectionMethods<unknown>]: (...args: any[]) => any } };

export interface SelectionApi<Row> {
  /** Replaces by default; `add` keeps the current selection. */
  selectRows(rowIds: RowId | readonly RowId[], options?: { mode?: RowMode }): CommandResult;
  /** Selects the rows between two ids (visible order). */
  selectRowRange(fromId: RowId, toId: RowId, options?: { mode?: 'replace' | 'add' }): CommandResult;
  toggleRowSelection(rowId: RowId): CommandResult;
  /** Ctrl+A: every row of the current page (all rows without paging). */
  selectAll(): CommandResult;
  /** Every row matching the query on every page, O(1) (scope `allFiltered`). */
  selectAllFiltered(): CommandResult;
  /** Clears every selection, or only the `rows`, `cells` or `columns` parts. */
  clearSelection(parts?: { rows?: boolean; cells?: boolean; columns?: boolean }): CommandResult;
  selectCells(cells: readonly CellKey[], options?: { mode?: 'replace' | 'add' | 'toggle' }): CommandResult;
  selectCellRange(anchor: CellKey, focus: CellKey, options?: { mode?: 'replace' | 'add' }): CommandResult;
  selectColumns(columnIds: ColumnId | readonly ColumnId[], options?: { mode?: 'replace' | 'add' | 'toggle' }): CommandResult;
  isRowSelected(rowId: RowId): boolean;
  /** Selected row ids. */
  getSelectedRowIds(): readonly RowId[];
  /** Selected raw rows, in the order of `getSelectedRowIds()`. */
  getSelectedRows(): readonly Row[];
  /** Serializable selection (scope, ids or excluded ids, cell ranges, columns). */
  getSelection(): SerializedSelection | undefined;
  setSelection(selection: SerializedSelection): CommandResult;
  getSelectionSummary(): SelectionSummary | undefined;
}

/** Selection methods over an engine with the `selection` module (spread into the DataGrid API). */
export function createSelectionApi<Row>(engine: DataGridEngine<Row>): SelectionApi<Row> {
  const facade = (): SelectionFacade['selection'] => (engine as unknown as SelectionFacade).selection;
  const list = (ids: string | readonly string[]): string[] => (typeof ids === 'string' ? [ids] : [...ids]);
  const withMode = <C extends object>(command: C, mode: string | undefined): C => (mode === undefined ? command : { ...command, mode });
  const api: SelectionApi<Row> = {
    selectRows: (rowIds, options) => engine.dispatch(withMode({ type: 'selection.selectRows', rowIds: list(rowIds) }, options?.mode)),
    selectRowRange: (fromId, toId, options) => engine.dispatch(withMode({ type: 'selection.selectRange', fromId, toId }, options?.mode)),
    toggleRowSelection: (rowId) => engine.dispatch({ type: 'selection.toggleRow', rowId }),
    selectAll: () => engine.dispatch({ type: 'selection.selectAllVisible' }),
    selectAllFiltered: () => engine.dispatch({ type: 'selection.selectAllFiltered' }),
    clearSelection: (parts) => {
      const command: Record<string, unknown> = { type: 'selection.clear' };
      for (const k of ['rows', 'cells', 'columns'] as const) if (parts?.[k] !== undefined) command[k] = parts[k];
      return engine.dispatch(command as SelectionClearCommand);
    },
    selectCells: (cells, options) => engine.dispatch(withMode({ type: 'selection.selectCells', cells: cells.map(ref) }, options?.mode)),
    selectCellRange: (anchor, focus, options) => engine.dispatch(withMode({ type: 'selection.setCellRange', anchor: ref(anchor), focus: ref(focus) }, options?.mode)),
    selectColumns: (columnIds, options) => engine.dispatch(withMode({ type: 'selection.selectColumns', columnIds: list(columnIds) }, options?.mode)),
    isRowSelected: (rowId) => facade()?.isRowSelected(rowId) === true,
    getSelectedRowIds: () => (facade()?.getSelectedRowIds() as readonly RowId[] | undefined) ?? EMPTY,
    getSelectedRows: () => {
      const ids = (facade()?.getSelectedRowIds() as readonly RowId[] | undefined) ?? EMPTY;
      const out: Row[] = [];
      for (const id of ids) {
        const row = engine.getRow(id);
        if (row !== undefined) out.push(row);
      }
      return Object.freeze(out);
    },
    getSelection: () => facade()?.serialize() as SerializedSelection | undefined,
    setSelection: (selection) => engine.dispatch({ type: 'selection.restore', selection: JSON.parse(JSON.stringify(selection)) as SerializedSelection }),
    getSelectionSummary: () => facade()?.getSummary() as SelectionSummary | undefined,
  };
  return Object.freeze(api);
}
