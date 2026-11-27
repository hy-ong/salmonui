// Tree mode. The
// `tree` module turns the filtered and sorted rows entering the
// `treeExpansion` stage (rank 700) into a hierarchy: a tree index over the
// source rows (tree-index.ts), a kept layout that applies the filter mode and
// orders siblings by the sort stage's order, and a range-based visible view
// (tree-view.ts) that `detailExpansion` and `page` wrap unchanged. Expansion
// is keyed by row id (`query.expansion.tree`, overrides over a default under
// the reserved key `'*'`) and survives sorting, filtering, paging and data
// patches. The sort, filter and search stages are unaware of the tree.
//
// Source rows: the engine's source is always flat. Nested data is flattened
// in pre-order by `flattenTree(rows, childrenField)` before it reaches the
// engine (rows by reference); the nesting is recovered from the children
// arrays. Flat data names its parent through `parentIdField`, resolved via
// the engine id index (`getRowId` ids).
//
// Entry `./tree.js`; not re-exported from the root. The
// remote adapter (`createRemoteTree`) is the entry `./tree-remote`, so local
// trees never carry it.

import { createAbortController, isPromiseLike, type AbortControllerLike } from './abort.js';
import { defineDataGridModule } from './engine.js';
import type { AggregateResult } from './aggregates.js';
import { effectiveSortKeys, sortRowOrder } from './sort.js';
import { buildTreeLayout, childrenIn, hasTreeChildren, siblingInfo, isAncestorOf, parentsFromIds, parentsFromNested, spliceTreeLayout, type TreeIssue, type TreeLayout } from './tree-index.js';
import { dirtyRows, isMappedDelta, survivorMap } from './row-delta.js';
import { buildVisibleRanges, TREE_FOOTER_ID_PREFIX, TreeView, type TreeStructure, type TreeViewModel } from './tree-view.js';
import { applySelectionDelta, cascadePlan, checkStateOf, countSelectedDescendants, type TreeCheckState } from './tree-cascade.js';
import { treeOf } from './tree-of.js';
import type {
  AbortSignalLike,
  AggregateValues,
  DataGridModule,
  DataGridOptions,
  DataQuery,
  LocalDataSource,
  ModuleContext,
  RowId,
  RowDelta,
  RowModelSnapshot,
  StageContext,
} from './types.js';

export { flattenTree, buildTreeLayout, siblingInfo, parentsFromIds, parentsFromNested, isAncestorOf, descendantsOf, childrenIn } from './tree-index.js';
export type { TreeIssue, TreeLayout } from './tree-index.js';
export { TreeView, TREE_FOOTER_ID_PREFIX, buildVisibleRanges, positionOfSlot, slotAtPosition } from './tree-view.js';
export type { TreeRanges, TreeStructure, TreeViewModel } from './tree-view.js';
export { applySelectionDelta, cascadePlan, checkStateOf, countSelectedDescendants, descendantCount } from './tree-cascade.js';
export type { TreeCheckState } from './tree-cascade.js';
export { treeOf } from './tree-of.js';
export { treeCopyRowIds } from './tree-copy.js';
export { getTreeState, restoreTreeState, treePartOf, withTreePersistence, withTreeState } from './tree-state.js';
export type { TreeStatePart } from './tree-state.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type TreeFilterMode = 'ancestors' | 'descendants' | 'both' | 'none';
export type TreePageBy = 'all' | 'root';
export type TreeCascade = boolean | 'filtered';
export type TreeLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface TreeLoadContext<Row> {
  readonly rowId: RowId;
  readonly row: Row;
  readonly signal: AbortSignalLike;
}

export interface TreeOptions<Row = unknown> {
  /** Nested rows: the field holding child arrays (`tree: true` means `'children'`). The engine source must be `flattenTree(data, childrenField)`. */
  readonly childrenField?: string;
  /** Flat self-referential rows: the field holding the parent's row id (root: missing, null, `''`, or unknown). */
  readonly parentIdField?: string;
  /** Rows whose children load on demand (`hasChildMapping`). */
  readonly hasChildrenField?: string;
  /** Initial expansion from a boolean data field (`expandStateMapping`); overridden by `expandedRows` and every expand command. */
  readonly expandedField?: string;
  /** Field or column id of the tree column (default: the first visible data column; resolved by the renderer). */
  readonly column?: string;
  /** `true` (default): every parent expanded; `false`: collapsed; `n`: rows of depth < n expanded. */
  readonly defaultExpanded?: boolean | number;
  /** Initial per-row overrides over `defaultExpanded` (reactive input through `tree.setExpanded`). */
  readonly expandedRows?: Readonly<Record<RowId, boolean>>;
  /** Rows a filter or search keeps: matches with their ancestors (default), with their descendants, both, or matches only (re-parented). */
  readonly filterMode?: TreeFilterMode;
  /** Paging counts every visible row (default) or root rows with their subtrees. */
  readonly pageBy?: TreePageBy;
  /** Checkbox in the tree column; `cascade` selects subtrees (`'filtered'`: kept rows only). */
  readonly checkbox?: boolean | { readonly cascade?: TreeCascade };
  /** Rows `copy()` adds around the copied rows (clipboard, read by the renderer). */
  readonly copyMode?: TreeFilterMode;
  /** Child summary rows (`__tf:<rowId>`) after the last visible descendant of each expanded parent (`showChildSummary`). */
  readonly childSummary?: boolean;
  /** Loads the children of a lazy row (`hasChildrenField`). Returned rows join the data source (local sources) under the row. */
  readonly loadChildren?: (ctx: TreeLoadContext<Row>) => readonly Row[] | Promise<readonly Row[]>;
  /** Copy of a row with a new parent (flat data writes). Default: a shallow copy with `parentIdField` set. */
  readonly setParentId?: (row: Row, parentId: RowId | null) => Row;
  /**
   * Whether a row has children to load when `hasChildrenField` cannot be read
   * (remote envelopes, tuple rows; `createRemoteTree`). `undefined` falls back
   * to `hasChildrenField`.
   */
  readonly hasChildren?: (row: Row, rowId: RowId) => boolean | undefined;
  /**
   * Parent row id of a row when the data does not carry it (remote envelopes,
   * tuple rows; `createRemoteTree`); null: a root, `undefined`: fall back to
   * `parentIdField` (or the nesting). Setting it reads parents as flat data.
   */
  readonly parentIdOf?: (row: Row, rowId: RowId) => RowId | null | undefined;
}

export interface TreeState {
  readonly childrenField: string | null;
  readonly parentIdField: string | null;
  readonly hasChildrenField: string | null;
  readonly expandedField: string | null;
  readonly column: string | null;
  readonly defaultExpanded: boolean | number;
  /** `expandedField` still applies (cleared by expand all, collapse all and an explicit default). */
  readonly useField: boolean;
  /** Row id -> expanded, overriding the per-row default (only values that differ from it). */
  readonly expanded: Readonly<Record<RowId, boolean>>;
  readonly filterMode: TreeFilterMode;
  readonly pageBy: TreePageBy;
  readonly checkbox: boolean;
  readonly cascade: TreeCascade;
  readonly copyMode: TreeFilterMode;
  readonly childSummary: boolean;
  /** Bumped when a child load or a parent override (`tree.setParents`) changes the tree. */
  readonly loadVersion: number;
}

/** What the renderer needs per tree row (`ctx.tree`, row ARIA, toggle). Stable identity while unchanged. */
export interface TreeRowInfo {
  readonly rowId: RowId;
  readonly depth: number;
  readonly parentId: RowId | null;
  /** Kept children, or unloaded lazy children (`hasChildrenField`). */
  readonly hasChildren: boolean;
  readonly childCount: number;
  /** Shown expanded: false for a lazy parent whose children were never requested, whatever its default (`isExpanded` reads the state). */
  readonly expanded: boolean;
  readonly loadStatus: TreeLoadStatus;
  /** 1-based ordinal and count among kept siblings (`aria-posinset` / `aria-setsize`). */
  readonly posinset: number;
  readonly setsize: number;
  /** Kept only as an ancestor or descendant of a match (`data-tree-context`). */
  readonly context: boolean;
  /** Visible in the current view (not hidden by a collapsed ancestor, a filter, or the page). */
  readonly visible: boolean;
}

export interface TreeInfo {
  readonly shape: 'nested' | 'flat';
  readonly childrenField: string | null;
  readonly parentIdField: string | null;
  readonly hasChildrenField: string | null;
  readonly column: string | null;
  readonly defaultExpanded: boolean | number;
  readonly filterMode: TreeFilterMode;
  readonly pageBy: TreePageBy;
  readonly checkbox: boolean;
  readonly cascade: TreeCascade;
  readonly copyMode: TreeFilterMode;
  readonly childSummary: boolean;
}

type IdTarget = { rowId?: RowId; rowIds?: RowId[] };
export type TreeExpandCommand = { type: 'tree.expand' } & IdTarget;
export type TreeCollapseCommand = { type: 'tree.collapse' } & IdTarget;
export type TreeToggleCommand = { type: 'tree.toggle'; rowId: RowId; expanded?: boolean };
export type TreeExpandAllCommand = { type: 'tree.expandAll' };
export type TreeCollapseAllCommand = { type: 'tree.collapseAll' };
/** Expands (collapses) every parent at `depth` (0: roots). */
export type TreeExpandLevelCommand = { type: 'tree.expandLevel'; depth: number };
export type TreeCollapseLevelCommand = { type: 'tree.collapseLevel'; depth: number };
/** Controlled expansion: replaces the overrides (and optionally the default). */
export type TreeSetExpandedCommand = { type: 'tree.setExpanded'; expanded: { [rowId: string]: boolean }; defaultExpanded?: boolean | number };
export type TreeSetOptionsCommand = {
  type: 'tree.setOptions';
  filterMode?: TreeFilterMode;
  pageBy?: TreePageBy;
  defaultExpanded?: boolean | number;
  checkbox?: boolean;
  cascade?: TreeCascade;
  copyMode?: TreeFilterMode;
  childSummary?: boolean;
  column?: string | null;
};
/** Moves rows as the last children of their previous sibling (requires the `rowDragDrop` module). */
export type TreeIndentCommand = { type: 'tree.indent'; rowIds: RowId[] };
/** Moves rows to just after their parent, as its siblings (requires the `rowDragDrop` module). */
export type TreeOutdentCommand = { type: 'tree.outdent'; rowIds: RowId[] };
export type TreeLoadChildrenCommand = { type: 'tree.loadChildren'; rowId: RowId };
export type TreeRetryCommand = { type: 'tree.retry'; rowId: RowId };
/**
 * A child load settled (dispatched by the module; also the hook for data
 * layers that load children through their own channel). `childIds` names
 * rows that join `rowId` without carrying the relation in their data.
 */
export type TreeLoadedCommand = { type: 'tree.loaded'; rowId: RowId; status: 'loading' | 'loaded' | 'error' | 'idle'; childIds?: RowId[]; error?: string };
/**
 * Parents the data does not carry (row id -> parent id, null: root): row
 * moves of nested (`childrenField`) or `parentIdOf` rows dispatch it, since
 * their write cannot change the nesting. Overrides last until disposal.
 */
export type TreeSetParentsCommand = { type: 'tree.setParents'; parents: { [rowId: string]: RowId | null } };
/** Checkbox toggle: with a cascade, the row's subtree in one selection update and the derived ancestors. */
export type TreeCheckCommand = { type: 'tree.check'; rowId: RowId; checked?: boolean };
/** Key commands: expand / collapse the focused row. */
export type TreeExpandFocusedCommand = { type: 'tree.expandFocused' };
export type TreeCollapseFocusedCommand = { type: 'tree.collapseFocused' };

export type TreeCommand =
  | TreeExpandCommand
  | TreeCollapseCommand
  | TreeToggleCommand
  | TreeExpandAllCommand
  | TreeCollapseAllCommand
  | TreeExpandLevelCommand
  | TreeCollapseLevelCommand
  | TreeSetExpandedCommand
  | TreeSetOptionsCommand
  | TreeIndentCommand
  | TreeOutdentCommand
  | TreeLoadChildrenCommand
  | TreeRetryCommand
  | TreeLoadedCommand
  | TreeSetParentsCommand
  | TreeCheckCommand
  | TreeExpandFocusedCommand
  | TreeCollapseFocusedCommand;

export const TREE_COMMANDS: readonly TreeCommand['type'][] = Object.freeze([
  'tree.expand',
  'tree.collapse',
  'tree.toggle',
  'tree.expandAll',
  'tree.collapseAll',
  'tree.expandLevel',
  'tree.collapseLevel',
  'tree.setExpanded',
  'tree.setOptions',
  'tree.indent',
  'tree.outdent',
  'tree.loadChildren',
  'tree.retry',
  'tree.loaded',
  'tree.setParents',
  'tree.check',
  'tree.expandFocused',
  'tree.collapseFocused',
]);

export type TreeMethods<Row> = {
  /** Row info for the renderer and `getRowInfo()`; null for unknown rows. */
  getTreeRow(ctx: ModuleContext<Row>, rowId: RowId): TreeRowInfo | null;
  /** Kept children of a row in view order (null: the roots). */
  getChildRows(ctx: ModuleContext<Row>, rowId: RowId | null): readonly Row[];
  getChildRowIds(ctx: ModuleContext<Row>, rowId: RowId | null): readonly RowId[];
  isExpanded(ctx: ModuleContext<Row>, rowId: RowId): boolean;
  getLoadStatus(ctx: ModuleContext<Row>, rowId: RowId): TreeLoadStatus;
  /** Checkbox tri-state derived from selected descendants (`aria-checked="mixed"`). */
  checkState(ctx: ModuleContext<Row>, rowId: RowId): TreeCheckState;
  /** Child summary values of a parent (over its kept descendants), or null without aggregates. */
  getChildSummary(ctx: ModuleContext<Row>, rowId: RowId): AggregateValues | null;
  /** Can `tree.indent` / `tree.outdent` move these rows (toolbar disabled state)? */
  canIndent(ctx: ModuleContext<Row>, rowIds: readonly RowId[]): boolean;
  canOutdent(ctx: ModuleContext<Row>, rowIds: readonly RowId[]): boolean;
  /** Persistable expansion (`getState().tree`). */
  getExpansion(ctx: ModuleContext<Row>): { readonly expandedRows: Readonly<Record<RowId, boolean>>; readonly defaultExpanded: boolean | number };
  getInfo(ctx: ModuleContext<Row>): TreeInfo;
};

export type TreeModule<Row> = DataGridModule<Row, TreeState, TreeCommand, 'tree', TreeMethods<Row>>;

/** Reserved `query.expansion.tree` key carrying a boolean `defaultExpanded`; `'*<n>': true` carries a depth default. */
export const TREE_DEFAULT_KEY = '*';

const EMPTY_RECORD: Readonly<Record<string, boolean>> = Object.freeze({});
const EMPTY_IDS: readonly RowId[] = Object.freeze([]);
const FILTER_MODES: readonly TreeFilterMode[] = ['ancestors', 'descendants', 'both', 'none'];

function validId(id: unknown): id is RowId {
  return typeof id === 'string' && id !== '';
}

function validDefault(v: unknown): v is boolean | number {
  return typeof v === 'boolean' || (typeof v === 'number' && Number.isInteger(v) && v >= 0);
}

/** `query.expansion.tree` record of a state. */
function encodeExpansion(state: TreeState): Readonly<Record<RowId, boolean>> {
  const d = state.defaultExpanded;
  const out: Record<string, boolean> = { ...state.expanded, [TREE_DEFAULT_KEY]: d === true };
  if (typeof d === 'number') out[TREE_DEFAULT_KEY + d] = true;
  return Object.freeze(out);
}

/** Default and overrides from a `query.expansion.tree` record. */
function decodeExpansion(record: Readonly<Record<string, boolean>> | null | undefined): { defaultExpanded: boolean | number | undefined; expanded: Record<RowId, boolean> } {
  const expanded: Record<RowId, boolean> = {};
  let defaultExpanded: boolean | number | undefined;
  for (const [key, v] of Object.entries(record ?? {})) {
    if (key === TREE_DEFAULT_KEY) {
      defaultExpanded ??= v === true;
      continue;
    }
    if (key.startsWith(TREE_DEFAULT_KEY) && /^\*\d+$/.test(key)) {
      defaultExpanded = Number(key.slice(1));
      continue;
    }
    expanded[key] = v === true;
  }
  return { defaultExpanded, expanded };
}

interface LoadEntry {
  status: TreeLoadStatus;
  controller: AbortControllerLike | null;
  error: unknown;
}

/** Per-source data the stage builds once per source rows identity. */
/** Touched rows a source change may have and still carry the tree index (`carryIndex`); each costs one splice. */
const CARRY_LIMIT = 64;

interface IndexMemo {
  source: readonly unknown[];
  sourceIds: readonly RowId[];
  shape: string;
  extraVersion: number;
  parent: Int32Array;
  index: TreeLayout;
  /** A parent cycle was broken: where depends on the source order, so the index is rebuilt, never carried. */
  cycles: boolean;
}

/**
 * Creates the `tree` module. Options come from `options` merged under
 * `DataGridOptions.tree` (`TreeOptions`, or `true` for nested rows under
 * `'children'`).
 */
export function createTreeModule<Row>(defaults: TreeOptions<Row> = {}): TreeModule<Row> {
  let loadChildren: TreeOptions<Row>['loadChildren'] | null = defaults.loadChildren ?? null;
  let setParentId: TreeOptions<Row>['setParentId'] | null = defaults.setParentId ?? null;
  let hasChildrenOf: TreeOptions<Row>['hasChildren'] | null = defaults.hasChildren ?? null;
  let parentIdOf: TreeOptions<Row>['parentIdOf'] | null = defaults.parentIdOf ?? null;
  let getRowIdOption: ((row: Row, index: number) => RowId) | null = null;
  let disposed = false;
  const loads = new Map<RowId, LoadEntry>();
  /** Parents the data does not carry (child id -> parent id, null: root): lazily loaded rows and moves of nested rows. */
  const extraParents = new Map<RowId, RowId | null>();
  let extraVersion = 0;
  let indexMemo: IndexMemo | null = null;
  let layoutMemo: { index: TreeLayout; order: Int32Array | null; count: number; mode: TreeFilterMode; sorted: unknown; layout: TreeLayout; match: Uint8Array | null } | null = null;
  let baseFlagsMemo: { index: TreeLayout; source: readonly unknown[]; d: boolean | number; field: string | null; flags: Uint8Array } | null = null;
  let flagsMemo: { base: Uint8Array; expanded: Readonly<Record<RowId, boolean>>; flags: Uint8Array } | null = null;
  let lastQuery: { input: DataQuery; record: Readonly<Record<RowId, boolean>>; output: DataQuery } | null = null;
  let queryRecord: { state: TreeState; record: Readonly<Record<RowId, boolean>> } | null = null;
  let infoCache: { rows: unknown; loadVersion: number; map: Map<RowId, TreeRowInfo> } = { rows: null, loadVersion: -1, map: new Map() };
  /** Both shapes were configured (warned once by the stage). */
  let bothShapes = false;
  /**
   * Development warnings found by the stage (which has no warning channel),
   * emitted through the module context by the next method call, command, or
   * notification.
   */
  const pending: [string, string][] = [];
  const queueWarn = (code: string, message: string): void => {
    if (pending.length < 16) pending.push([code, message]);
  };
  const flush = (ctx: ModuleContext<Row>): void => {
    if (pending.length === 0) return;
    for (const [code, message] of pending.splice(0)) ctx.warn(code, message);
  };
  let summaryOwner: { aggregates: AggregateResult; order: Int32Array; result: AggregateResult } | null = null;
  let countsMemo: { layout: TreeLayout; selection: unknown; version: number; counts: Int32Array; scope: string } | null = null;

  // --- structure ------------------------------------------------------------

  const shapeOf = (state: TreeState): string => (state.parentIdField !== null ? `flat:${state.parentIdField}` : `nested:${state.childrenField ?? 'children'}`);

  /** Parent id of source row `i` (flat shape): a loaded or moved parent kept by the module, `parentIdOf`, then the field. */
  const parentIdReader = (source: readonly unknown[], sourceIds: readonly RowId[], field: string | null) => {
    const of = parentIdOf;
    return (i: number): string | null => {
      const extra = extraParents.size ? extraParents.get(sourceIds[i] as RowId) : undefined;
      if (extra !== undefined) return extra;
      if (of) {
        const p = of(source[i] as Row, sourceIds[i] as RowId);
        if (p !== undefined) return p;
      }
      if (field === null) return null;
      const v = (source[i] as Record<string, unknown> | null)?.[field];
      return v === null || v === undefined || v === '' ? null : String(v);
    };
  };

  /**
   * The previous index carried through a small source change (a move,
   * indent / outdent, or parent id edit): the parents of the rows
   * the change touched are re-read, every other parent is carried through
   * the index map, and the moved subtrees are spliced in the pre-order
   * (`spliceTreeLayout`). Null (full rebuild) for removed or added rows, more
   * than `CARRY_LIMIT` touched rows, or any orphan or cycle (the rebuild
   * reports them; after a broken cycle the index is never carried).
   */
  const carryIndex = (prev: IndexMemo, source: readonly unknown[], sourceIds: readonly RowId[], delta: RowDelta, parentIdAt: (i: number) => string | null, indexOf: (id: RowId) => number): { parent: Int32Array; index: TreeLayout } | null => {
    const n = source.length;
    if (delta.count !== n || delta.previousCount !== n || prev.parent.length !== n || prev.index.count !== n) return null;
    const dirty = dirtyRows(delta);
    if (dirty.length > CARRY_LIMIT) return null;
    const mapped = isMappedDelta(delta);
    let map: Int32Array | null = null;
    let stale: Map<number, number> | null = null;
    if (mapped) {
      map = survivorMap(delta);
      // `removed` of a mapped delta lists the rows it does not carry (moved or updated): find them by id.
      stale = new Map();
      for (const p of delta.removed) {
        const j = indexOf(prev.sourceIds[p as number] as RowId);
        if (j < 0) return null;
        stale.set(p as number, j);
      }
    } else if (delta.removed.length) return null;
    const moves: [number, number][] = [];
    for (const d of dirty) {
      const id = parentIdAt(d);
      const p = id === null ? -1 : indexOf(id);
      if (id !== null && (p < 0 || p === d)) return null;
      // In place (no map): only a parent change moves the row.
      if (!mapped && (prev.parent[d] as number) === p) continue;
      moves.push([d, p]);
    }
    if (!mapped && moves.length === 0) return { parent: prev.parent, index: prev.index };
    const index = spliceTreeLayout(prev.index, map, stale, moves);
    return index ? { parent: index.parent, index } : null;
  };

  const buildIndex = (source: readonly unknown[], sourceIds: readonly RowId[], state: TreeState, indexOf: (id: RowId) => number, warn: (code: string, message: string) => void, change: StageContext<Row, TreeState>['sourceChange']): IndexMemo => {
    const shape = shapeOf(state);
    if (indexMemo && indexMemo.source === source && indexMemo.sourceIds === sourceIds && indexMemo.shape === shape && indexMemo.extraVersion === extraVersion) return indexMemo;
    const flat = state.parentIdField !== null || parentIdOf !== null;
    if (flat && change && indexMemo && !indexMemo.cycles && change.from === indexMemo.source && indexMemo.shape === shape && indexMemo.extraVersion === extraVersion) {
      const carried = carryIndex(indexMemo, source, sourceIds, change.delta, parentIdReader(source, sourceIds, state.parentIdField), indexOf);
      if (carried) {
        indexMemo = { source, sourceIds, shape, extraVersion, parent: carried.parent, index: carried.index, cycles: false };
        return indexMemo;
      }
    }
    const orphans: number[] = [];
    const cycles: number[] = [];
    const onIssue = (issue: TreeIssue): void => {
      (issue.kind === 'orphan' ? orphans : cycles).push(issue.index);
    };
    let parent: Int32Array;
    if (flat) {
      parent = parentsFromIds(source.length, parentIdReader(source, sourceIds, state.parentIdField), indexOf, onIssue);
    } else {
      parent = parentsFromNested(source, state.childrenField ?? 'children', getRowIdOption ? (row) => indexOf(String((getRowIdOption as (r: Row, i: number) => RowId)(row as Row, -1))) : undefined);
      if (extraParents.size) {
        for (const [child, p] of extraParents) {
          const c = indexOf(child);
          const at = p === null ? -1 : indexOf(p);
          if (c >= 0 && (p === null || at >= 0) && c !== at) parent[c] = at;
        }
        // Re-break any cycle the overrides introduced.
        parent = parentsFromIds(source.length, (i) => (parent[i] as number) < 0 ? null : (sourceIds[parent[i] as number] as RowId), indexOf, onIssue);
      }
    }
    if (orphans.length) {
      const first = orphans[0] as number;
      const field = state.parentIdField ?? '';
      warn('tree-orphan', `${orphans.length} tree row(s) name a parent that matches no row (first: "${sourceIds[first]}" with ${field} "${String((source[first] as Record<string, unknown>)?.[field])}"); they are shown as roots.`);
    }
    if (cycles.length) warn('tree-cycle', `${cycles.length} tree parent cycle(s) were broken at the first repeated row (first: "${sourceIds[cycles[0] as number]}"), which is shown as a root.`);
    const index = buildTreeLayout(parent, null, null);
    indexMemo = { source, sourceIds, shape, extraVersion, parent, index, cycles: cycles.length > 0 };
    return indexMemo;
  };

  const withParentFor = (state: TreeState) => (row: unknown, parentId: RowId | null): unknown => {
    if (setParentId) return setParentId(row as Row, parentId);
    const field = state.parentIdField;
    if (field === null || row === null || typeof row !== 'object') return null;
    const old = (row as Record<string, unknown>)[field];
    const value = parentId === null ? null : typeof old === 'number' && Number.isFinite(Number(parentId)) ? Number(parentId) : parentId;
    return { ...(row as Record<string, unknown>), [field]: value };
  };

  /** Kept layout for a stage input: filter mode mask and sibling order. */
  const layoutFor = (input: RowModelSnapshot<Row>, memo: IndexMemo, state: TreeState, ctx: StageContext<Row, TreeState>): { layout: TreeLayout; match: Uint8Array | null } => {
    const index = memo.index;
    const n = input.source.length;
    const order = input.order;
    const filtered = input.count < n;
    const sorted = ctx.query.sorting.length > 0 ? ctx.query.sorting : null;
    if (layoutMemo && layoutMemo.index === index && layoutMemo.order === order && layoutMemo.count === input.count && layoutMemo.mode === state.filterMode && layoutMemo.sorted === sorted) {
      return layoutMemo;
    }
    let layout: TreeLayout;
    let match: Uint8Array | null = null;
    if (!filtered) {
      layout = sorted && order ? buildTreeLayout(memo.parent, order, null, index) : index;
    } else {
      match = new Uint8Array(n);
      if (order) for (let i = 0; i < input.count; i++) match[order[i] as number] = 1;
      else for (let i = 0; i < input.count; i++) match[i] = 1;
      const mode = state.filterMode;
      let keep: Uint8Array = match;
      let context = false;
      if (mode !== 'none') {
        keep = match.slice();
        if (mode === 'ancestors' || mode === 'both') {
          const parent = memo.parent;
          for (let s = 0; s < n; s++) {
            if (!match[s]) continue;
            for (let p = parent[s] as number; p >= 0 && !keep[p]; p = parent[p] as number) {
              keep[p] = 1;
              context = true;
            }
          }
        }
        if (mode === 'descendants' || mode === 'both') {
          const { order: pre, next } = index;
          let until = -1;
          for (let slot = 0; slot < index.count; slot++) {
            const s = pre[slot] as number;
            if (slot < until) {
              if (!keep[s]) {
                keep[s] = 1;
                context = true;
              }
            } else if (match[s]) until = next[slot] as number;
          }
        }
      }
      let priority: Int32Array | null = order && order.subarray(0, input.count);
      if (!sorted) priority = null; // source order
      else if (context) {
        // Context rows have no rank from the sort stage: sort every kept row.
        let m = 0;
        for (let s = 0; s < n; s++) m += keep[s] as number;
        const kept = new Int32Array(m);
        for (let s = 0, w = 0; s < n; s++) if (keep[s]) kept[w++] = s;
        priority = sortRowOrder(input.source, kept, effectiveSortKeys(ctx.query, ctx.columns), ctx.locale);
      }
      layout = buildTreeLayout(memo.parent, priority, keep, index);
      if (!context) match = null;
    }
    layoutMemo = { index, order, count: input.count, mode: state.filterMode, sorted, layout, match };
    return layoutMemo;
  };

  /** Expanded flags by source index for the state (default, field, overrides). */
  const flagsFor = (input: RowModelSnapshot<Row>, memo: IndexMemo, state: TreeState, indexOf: (id: RowId) => number): Uint8Array => {
    const index = memo.index;
    const field = state.useField ? state.expandedField : null;
    const d = state.defaultExpanded;
    if (!baseFlagsMemo || baseFlagsMemo.index !== index || baseFlagsMemo.source !== input.source || baseFlagsMemo.d !== d || baseFlagsMemo.field !== field) {
      const n = input.source.length;
      const flags = new Uint8Array(n);
      if (d === true) flags.fill(1);
      else if (typeof d === 'number') {
        const depth = index.depth;
        for (let s = 0; s < n; s++) if ((depth[s] as number) < d) flags[s] = 1;
      }
      if (field !== null) {
        for (let s = 0; s < n; s++) {
          const v = (input.source[s] as Record<string, unknown> | null)?.[field];
          if (typeof v === 'boolean') flags[s] = v ? 1 : 0;
        }
      }
      baseFlagsMemo = { index, source: input.source, d, field, flags };
      flagsMemo = null;
    }
    const base = baseFlagsMemo.flags;
    if (state.expanded === EMPTY_RECORD) return base;
    if (flagsMemo && flagsMemo.base === base && flagsMemo.expanded === state.expanded) return flagsMemo.flags;
    const flags = base.slice();
    for (const id in state.expanded) {
      const s = indexOf(id);
      if (s >= 0) flags[s] = state.expanded[id] ? 1 : 0;
    }
    flagsMemo = { base, expanded: state.expanded, flags };
    return flags;
  };

  /** Per-row default expansion (before overrides). */
  const defaultOf = (state: TreeState, structure: TreeStructure, s: number, row: unknown): boolean => {
    if (state.useField && state.expandedField !== null) {
      const v = (row as Record<string, unknown> | null)?.[state.expandedField];
      if (typeof v === 'boolean') return v;
    }
    const d = state.defaultExpanded;
    return d === true || (typeof d === 'number' && (structure.index.depth[s] as number) < d);
  };

  const structureOf = (ctx: ModuleContext<Row>): TreeStructure | null => treeOf(ctx.getRows());

  const isExpandedIn = (state: TreeState, structure: TreeStructure | null, rowId: RowId, row: unknown): boolean => {
    const o = state.expanded[rowId];
    if (o !== undefined) return o;
    if (!structure) return state.defaultExpanded === true;
    const s = structure.sourceIndexOf(rowId);
    return s >= 0 ? defaultOf(state, structure, s, row) : state.defaultExpanded === true;
  };

  /** State with `rowId` set to `expanded` (the override is dropped when it equals the row default). */
  const withExpanded = (state: TreeState, structure: TreeStructure | null, rowId: RowId, row: unknown, expanded: boolean, next: Record<RowId, boolean> | null): Record<RowId, boolean> | null => {
    if (isExpandedIn(state, structure, rowId, row) === expanded && !(next && rowId in next)) return next;
    const out = next ?? { ...state.expanded };
    const s = structure ? structure.sourceIndexOf(rowId) : -1;
    const def = structure && s >= 0 ? defaultOf(state, structure, s, row) : state.defaultExpanded === true;
    if (def === expanded) delete out[rowId];
    else out[rowId] = expanded;
    return out;
  };

  const freezeRecord = (r: Record<RowId, boolean>): Readonly<Record<RowId, boolean>> => (Object.keys(r).length ? Object.freeze(r) : EMPTY_RECORD);

  const rowHasChildren = (state: TreeState, structure: TreeStructure, s: number, row: unknown, rowId: RowId): boolean => {
    if (hasTreeChildren(structure.index, s)) return true;
    if (state.hasChildrenField === null && !hasChildrenOf) return false;
    const status = loads.get(rowId)?.status ?? 'idle';
    if (status === 'loaded') return false;
    const own = hasChildrenOf ? hasChildrenOf(row as Row, rowId) : undefined;
    if (own !== undefined) return own;
    return state.hasChildrenField !== null && Boolean((row as Record<string, unknown> | null)?.[state.hasChildrenField]);
  };

  // --- loads ------------------------------------------------------------------

  const startLoad = (ctx: ModuleContext<Row>, rowId: RowId, force: boolean): string | null => {
    if (!loadChildren) return 'noLoader';
    if (disposed) return 'disposed';
    const row = ctx.getRow(rowId);
    if (row === undefined) return 'unknownRow';
    const previous = loads.get(rowId);
    if (previous && !force && previous.status !== 'idle') return null;
    previous?.controller?.abort();
    const controller = createAbortController();
    const entry: LoadEntry = { status: 'loading', controller, error: undefined };
    loads.set(rowId, entry);
    const settle = (rows: readonly Row[] | null, error: unknown): void => {
      if (disposed || loads.get(rowId) !== entry || controller.signal.aborted) return;
      entry.controller = null;
      if (rows === null) {
        entry.status = 'error';
        entry.error = error;
        ctx.dispatch({ type: 'tree.loaded', rowId, status: 'error', error: error instanceof Error ? error.message : String(error) });
        return;
      }
      const source = ctx.getDataSource() as Partial<LocalDataSource<Row>>;
      if (rows.length && typeof source.patch !== 'function') {
        entry.status = 'error';
        entry.error = new Error('noLocalSource');
        ctx.dispatch({ type: 'tree.loaded', rowId, status: 'error', error: 'noLocalSource' });
        return;
      }
      entry.status = 'loaded';
      if (rows.length) {
        const state = ctx.getModuleState<TreeState>('tree') as TreeState;
        const ids = rows.map((r, i) => (getRowIdOption ? String(getRowIdOption(r, i)) : String(i)));
        if (state.parentIdField === null || !rows.every((r) => (r as Record<string, unknown> | null)?.[state.parentIdField as string] != null)) {
          for (const id of ids) extraParents.set(id, rowId);
          extraVersion++;
        }
        (source.patch as LocalDataSource<Row>['patch'])({ upsert: rows });
      }
      ctx.dispatch({ type: 'tree.loaded', rowId, status: 'loaded' });
    };
    let result: readonly Row[] | Promise<readonly Row[]>;
    try {
      result = loadChildren({ rowId, row, signal: controller.signal });
    } catch (error) {
      entry.status = 'error';
      entry.error = error;
      entry.controller = null;
      return null;
    }
    if (isPromiseLike(result)) {
      Promise.resolve(result).then(
        (rows) => settle(rows ?? [], undefined),
        (error: unknown) => settle(null, error),
      );
    } else void Promise.resolve().then(() => settle(result as readonly Row[], undefined));
    return null;
  };


  const queueLoad = (ctx: ModuleContext<Row>, rowId: RowId): void => {
    if (!loadChildren) return;
    void Promise.resolve().then(() => {
      if (disposed) return;
      const state = ctx.getModuleState<TreeState>('tree');
      if (!state || (loads.get(rowId)?.status ?? 'idle') !== 'idle') return;
      startLoad(ctx, rowId, false);
      ctx.dispatch({ type: 'tree.loaded', rowId, status: 'loading' });
    });
  };

  // --- selection cascade ---------------------------------------------------------

  type SelectionLike = { rows: { scope: 'explicit' | 'allFiltered'; ids: ReadonlySet<RowId> }; version: number; change: { from: number; reset: boolean; added: readonly RowId[]; removed: readonly RowId[] } };

  const selectedFn = (ctx: ModuleContext<Row>, structure: TreeStructure, sel: SelectionLike | undefined): ((s: number) => boolean) => {
    if (!sel) return () => false;
    const ids = sel.rows.ids;
    const sourceIds = structure.sourceIds;
    if (sel.rows.scope === 'explicit') return (s) => ids.has(sourceIds[s] as RowId);
    // allFiltered: every row matching the query except the excluded ids.
    const input = ctx.getStageInput('treeExpansion');
    let matching: Uint8Array | null = null;
    if (input && input.count < input.source.length) {
      matching = new Uint8Array(input.source.length);
      for (let i = 0; i < input.count; i++) matching[input.order ? (input.order[i] as number) : i] = 1;
    }
    return (s) => !ids.has(sourceIds[s] as RowId) && (matching === null || matching[s] === 1);
  };

  const cascadeLayout = (state: TreeState, structure: TreeStructure): TreeLayout => (state.cascade === 'filtered' ? structure.layout : structure.index);

  const countsFor = (ctx: ModuleContext<Row>, state: TreeState, structure: TreeStructure): { counts: Int32Array; selected: (s: number) => boolean; layout: TreeLayout } => {
    const layout = cascadeLayout(state, structure);
    const sel = ctx.getModuleState<SelectionLike>('selection');
    const selected = selectedFn(ctx, structure, sel);
    const scope = sel?.rows.scope ?? 'explicit';
    if (countsMemo && countsMemo.layout === layout && countsMemo.selection === sel) return { counts: countsMemo.counts, selected, layout };
    if (sel && countsMemo && countsMemo.layout === layout && scope === 'explicit' && countsMemo.scope === 'explicit' && !sel.change.reset && sel.change.from === countsMemo.version) {
      const toIndex = (ids: readonly RowId[]): number[] => ids.map((id) => structure.sourceIndexOf(id));
      applySelectionDelta(layout, countsMemo.counts, toIndex(sel.change.added), toIndex(sel.change.removed));
      countsMemo = { ...countsMemo, selection: sel, version: sel.version };
      return { counts: countsMemo.counts, selected, layout };
    }
    const counts = countSelectedDescendants(layout, selected);
    countsMemo = { layout, selection: sel, version: sel?.version ?? 0, counts, scope };
    return { counts, selected, layout };
  };

  // --- indent / outdent -------------------------------------------------------------

  /** Sibling ids of the kept layout (null parent: roots). */
  const siblingsOf = (structure: TreeStructure, s: number): number[] => childrenIn(structure.layout, structure.layout.parent[s] as number);

  const indentTarget = (structure: TreeStructure, rowIds: readonly RowId[]): { target: RowId; ids: RowId[] } | string => {
    const ids = orderedIds(structure, rowIds);
    if (typeof ids === 'string') return ids;
    const first = structure.sourceIndexOf(ids[0] as RowId);
    const siblings = siblingsOf(structure, first);
    const at = siblings.indexOf(first);
    if (at <= 0) return 'noPreviousSibling';
    const target = siblings[at - 1] as number;
    if (ids.some((id) => structure.sourceIndexOf(id) === target)) return 'noPreviousSibling';
    return { target: structure.sourceIds[target] as RowId, ids };
  };

  const outdentTarget = (structure: TreeStructure, rowIds: readonly RowId[]): { target: RowId; ids: RowId[] } | string => {
    const ids = orderedIds(structure, rowIds);
    if (typeof ids === 'string') return ids;
    const first = structure.sourceIndexOf(ids[0] as RowId);
    const p = structure.layout.parent[first] as number;
    if (p < 0) return 'root';
    return { target: structure.sourceIds[p] as RowId, ids };
  };

  /** Kept rows sharing one parent, in sibling order; nested selections keep only the outermost rows. */
  const orderedIds = (structure: TreeStructure, rowIds: readonly RowId[]): RowId[] | string => {
    const layout = structure.layout;
    const slots: number[] = [];
    for (const id of new Set(rowIds)) {
      const s = structure.sourceIndexOf(id);
      if (s < 0 || (layout.slot[s] as number) < 0) return 'unknownRow';
      slots.push(s);
    }
    if (slots.length === 0) return 'invalidRowIds';
    const outer = slots.filter((s) => !slots.some((a) => a !== s && isAncestorOf(layout, a, s)));
    const parent = layout.parent[outer[0] as number];
    if (outer.some((s) => layout.parent[s] !== parent)) return 'mixedParents';
    outer.sort((a, b) => (layout.slot[a] as number) - (layout.slot[b] as number));
    return outer.map((s) => structure.sourceIds[s] as RowId);
  };

  // --- methods ------------------------------------------------------------------------

  const viewModelOf = (ctx: ModuleContext<Row>): TreeViewModel | null => {
    const base = ctx.getRows().view;
    let v = base ?? null;
    while (v && v.inner) v = v.inner;
    return v && v.kind === 'tree' ? (v as TreeView).model : null;
  };

  const methods: TreeMethods<Row> = {
    getTreeRow(ctx, rowId) {
      flush(ctx);
      const state = ctx.getModuleState<TreeState>('tree') as TreeState;
      const model = viewModelOf(ctx);
      if (!model) return null;
      const rows = ctx.getRows();
      if (infoCache.rows !== rows || infoCache.loadVersion !== state.loadVersion) infoCache = { rows, loadVersion: state.loadVersion, map: new Map() };
      const hit = infoCache.map.get(rowId);
      if (hit) return hit;
      const structure = model.structure;
      const s = structure.sourceIndexOf(rowId);
      if (s < 0) return null;
      const layout = structure.layout;
      const kept = (layout.slot[s] as number) >= 0;
      const tree = kept ? layout : structure.index;
      const row = ctx.getRow(rowId);
      const p = tree.parent[s] as number;
      const [childCount, posinset, setsize] = siblingInfo(tree, s);
      const loadStatus = loads.get(rowId)?.status ?? 'idle';
      const hasChildren = childCount > 0 || rowHasChildren(state, structure, s, row, rowId);
      const info: TreeRowInfo = Object.freeze({
        rowId,
        depth: tree.depth[s] as number,
        parentId: p < 0 ? null : (structure.sourceIds[p] as RowId),
        hasChildren,
        childCount,
        // A lazy parent whose children were never requested shows collapsed (SSR `aria-expanded="false"`).
        expanded: (kept ? model.expanded[s] === 1 : isExpandedIn(state, structure, rowId, row)) && !(hasChildren && childCount === 0 && loadStatus === 'idle'),
        loadStatus,
        posinset,
        setsize,
        context: kept && model.match !== null && model.match[s] === 0,
        visible: ctx.getRowIndex(rowId) >= 0,
      });
      infoCache.map.set(rowId, info);
      return info;
    },
    getChildRows(ctx, rowId) {
      const ids = methods.getChildRowIds(ctx, rowId);
      const out: Row[] = [];
      for (const id of ids) {
        const row = ctx.getRow(id);
        if (row !== undefined) out.push(row);
      }
      return Object.freeze(out);
    },
    getChildRowIds(ctx, rowId) {
      const structure = structureOf(ctx);
      if (!structure) return EMPTY_IDS;
      const s = rowId === null ? -1 : structure.sourceIndexOf(rowId);
      if (rowId !== null && s < 0) return EMPTY_IDS;
      return Object.freeze(childrenIn(structure.layout, s).map((c) => structure.sourceIds[c] as RowId));
    },
    isExpanded(ctx, rowId) {
      const state = ctx.getModuleState<TreeState>('tree') as TreeState;
      return isExpandedIn(state, structureOf(ctx), rowId, ctx.getRow(rowId));
    },
    getLoadStatus(_ctx, rowId) {
      return loads.get(rowId)?.status ?? 'idle';
    },
    checkState(ctx, rowId) {
      const state = ctx.getModuleState<TreeState>('tree') as TreeState;
      const structure = structureOf(ctx);
      if (!structure) return 'unchecked';
      const s = structure.sourceIndexOf(rowId);
      if (s < 0) return 'unchecked';
      if (!state.cascade) {
        const sel = ctx.getModuleState<SelectionLike>('selection');
        return selectedFn(ctx, structure, sel)(s) ? 'checked' : 'unchecked';
      }
      const { counts, selected, layout } = countsFor(ctx, state, structure);
      return checkStateOf(layout, counts, s, selected(s));
    },
    getChildSummary(ctx, rowId) {
      const model = ctx.getRows();
      const aggregates = (model.aggregates ?? null) as AggregateResult | null;
      const structure = structureOf(ctx);
      if (!aggregates || !aggregates.columns || !aggregates.range || !structure) return null;
      const s = structure.sourceIndexOf(rowId);
      const layout = structure.layout;
      const slot = s < 0 ? -1 : (layout.slot[s] as number);
      if (slot < 0) return null;
      // Values over the kept descendants `[slot + 1, next)` of the pre-order, cached per layout.
      const order = layout.order;
      if (!summaryOwner || summaryOwner.aggregates !== aggregates || summaryOwner.order !== order) {
        summaryOwner = { aggregates, order, result: { ...aggregates, tree: null, order, dataCount: order.length } };
      }
      return aggregates.range(summaryOwner.result, summaryOwner.result, 0, slot + 1, layout.next[slot] as number);
    },
    canIndent(ctx, rowIds) {
      const structure = structureOf(ctx);
      return structure !== null && ctx.getModuleState('rowDragDrop') !== undefined && typeof indentTarget(structure, rowIds) !== 'string';
    },
    canOutdent(ctx, rowIds) {
      const structure = structureOf(ctx);
      return structure !== null && ctx.getModuleState('rowDragDrop') !== undefined && typeof outdentTarget(structure, rowIds) !== 'string';
    },
    getExpansion(ctx) {
      const state = ctx.getModuleState<TreeState>('tree') as TreeState;
      return Object.freeze({ expandedRows: state.expanded, defaultExpanded: state.defaultExpanded });
    },
    getInfo(ctx) {
      flush(ctx);
      const s = ctx.getModuleState<TreeState>('tree') as TreeState;
      const flat = s.parentIdField !== null;
      return Object.freeze({
        shape: flat ? ('flat' as const) : ('nested' as const),
        childrenField: flat ? null : (s.childrenField ?? 'children'),
        parentIdField: s.parentIdField,
        hasChildrenField: s.hasChildrenField,
        column: s.column,
        defaultExpanded: s.defaultExpanded,
        filterMode: s.filterMode,
        pageBy: s.pageBy,
        checkbox: s.checkbox,
        cascade: s.cascade,
        copyMode: s.copyMode,
        childSummary: s.childSummary,
      });
    },
  };

  const setExpandedFor = (ctx: ModuleContext<Row>, state: TreeState, ids: readonly RowId[], expanded: boolean | null): TreeState | string => {
    const structure = structureOf(ctx);
    let next: Record<RowId, boolean> | null = null;
    const lazy: RowId[] = [];
    for (const id of ids) {
      const row = ctx.getRow(id);
      const s = structure ? structure.sourceIndexOf(id) : -1;
      const has = structure !== null && s >= 0 && rowHasChildren(state, structure, s, row, id);
      if (ids.length === 1 && structure && s >= 0 && !has) return 'noChildren';
      const unloaded = has && !hasTreeChildren((structure as TreeStructure).index, s);
      // An unloaded lazy row shows collapsed (getTreeRow), so a toggle expands it.
      const current = isExpandedIn(state, structure, id, row) && !(unloaded && (loads.get(id)?.status ?? 'idle') === 'idle');
      const target = expanded ?? !current;
      if (target && unloaded) lazy.push(id);
      next = withExpanded(state, structure, id, row, target, next);
    }
    for (const id of lazy) queueLoad(ctx, id);
    if (next === null) return state;
    return Object.freeze({ ...state, expanded: freezeRecord(next) });
  };

  const levelChange = (ctx: ModuleContext<Row>, state: TreeState, depth: number, expanded: boolean): TreeState => {
    const structure = structureOf(ctx);
    if (!structure) return state;
    const index = structure.index;
    let next: Record<RowId, boolean> | null = null;
    for (let slot = 0; slot < index.count; slot++) {
      const s = index.order[slot] as number;
      if ((index.depth[s] as number) !== depth || !hasTreeChildren(index, s)) continue;
      const id = structure.sourceIds[s] as RowId;
      next = withExpanded(state, structure, id, ctx.getRow(id), expanded, next);
    }
    return next === null ? state : Object.freeze({ ...state, expanded: freezeRecord(next) });
  };

  /** A next state, or the rejection reason. */
  const settled = (ctx: ModuleContext<Row>, r: TreeState | string): TreeState | ReturnType<ModuleContext<Row>['reject']> => (typeof r === 'string' ? ctx.reject(r) : r);

  const focusedRow = (ctx: ModuleContext<Row>): RowId | null => {
    const target = ctx.getModuleState<{ target: { kind: string; rowId?: RowId } | null }>('focus')?.target;
    return target && target.kind === 'cell' && typeof target.rowId === 'string' ? target.rowId : null;
  };

  const move = (ctx: ModuleContext<Row>, target: { target: RowId; ids: RowId[] } | string, position: 'into' | 'after'): TreeState | string | null => {
    if (typeof target === 'string') return target;
    if (ctx.getModuleState('rowDragDrop') === undefined) return 'noRowDragDrop';
    const result = ctx.dispatch({ type: 'rowDragDrop.move', rowIds: target.ids, targetRowId: target.target, position });
    return result.status === 'rejected' ? result.reason : null;
  };

  return defineDataGridModule<Row, TreeState, TreeCommand, 'tree', TreeMethods<Row>>({
    name: 'tree',
    commands: TREE_COMMANDS,
    initialState(options: DataGridOptions<Row>): TreeState {
      const raw = options['tree'];
      const o: TreeOptions<Row> = { ...defaults, ...(raw === true ? { childrenField: 'children' } : typeof raw === 'object' && raw !== null ? (raw as TreeOptions<Row>) : {}) };
      loadChildren = o.loadChildren ?? null;
      setParentId = o.setParentId ?? null;
      hasChildrenOf = o.hasChildren ?? null;
      parentIdOf = o.parentIdOf ?? null;
      getRowIdOption = options.getRowId;
      bothShapes = typeof o.childrenField === 'string' && typeof o.parentIdField === 'string';
      const fromQuery = decodeExpansion(options.defaultQuery?.expansion?.tree);
      const defaultExpanded = validDefault(o.defaultExpanded) ? o.defaultExpanded : (fromQuery.defaultExpanded ?? true);
      const expanded: Record<RowId, boolean> = {};
      for (const [id, v] of Object.entries(o.expandedRows ?? fromQuery.expanded)) if (validId(id) && id !== TREE_DEFAULT_KEY) expanded[id] = v === true;
      const cascade = typeof o.checkbox === 'object' && o.checkbox !== null ? (o.checkbox.cascade ?? false) : false;
      const parentIdField = typeof o.parentIdField === 'string' && o.parentIdField !== '' ? o.parentIdField : null;
      const childrenField = typeof o.childrenField === 'string' && o.childrenField !== '' ? o.childrenField : parentIdField === null ? 'children' : null;
      return Object.freeze({
        // `childrenField` wins when both are given (the stage warns).
        childrenField,
        parentIdField: childrenField !== null && typeof o.childrenField === 'string' ? null : parentIdField,
        hasChildrenField: o.hasChildrenField ?? null,
        expandedField: o.expandedField ?? null,
        column: o.column ?? null,
        defaultExpanded,
        useField: (o.expandedField ?? null) !== null,
        expanded: freezeRecord(expanded),
        filterMode: FILTER_MODES.includes(o.filterMode as TreeFilterMode) ? (o.filterMode as TreeFilterMode) : 'ancestors',
        pageBy: o.pageBy === 'root' ? 'root' : 'all',
        checkbox: o.checkbox !== undefined && o.checkbox !== false,
        cascade: cascade === true || cascade === 'filtered' ? cascade : false,
        copyMode: FILTER_MODES.includes(o.copyMode as TreeFilterMode) ? (o.copyMode as TreeFilterMode) : 'ancestors',
        childSummary: o.childSummary === true,
        loadVersion: 0,
      });
    },
    reduce(state, command, ctx) {
      flush(ctx);
      switch (command.type) {
        case 'tree.expand':
        case 'tree.collapse': {
          const ids = Array.isArray(command.rowIds) ? command.rowIds : command.rowId !== undefined ? [command.rowId] : null;
          if (!ids || ids.length === 0 || !ids.every(validId)) return ctx.reject('invalidRowId');
          return settled(ctx, setExpandedFor(ctx, state, ids, command.type === 'tree.expand'));
        }
        case 'tree.toggle':
          if (!validId(command.rowId)) return ctx.reject('invalidRowId');
          return settled(ctx, setExpandedFor(ctx, state, [command.rowId], typeof command.expanded === 'boolean' ? command.expanded : null));
        case 'tree.expandFocused':
        case 'tree.collapseFocused': {
          const id = focusedRow(ctx);
          if (id === null) return ctx.reject('noFocus');
          return settled(ctx, setExpandedFor(ctx, state, [id], command.type === 'tree.expandFocused'));
        }
        case 'tree.expandAll':
        case 'tree.collapseAll': {
          const all = command.type === 'tree.expandAll';
          return state.defaultExpanded === all && state.expanded === EMPTY_RECORD && !state.useField ? state : Object.freeze({ ...state, defaultExpanded: all, useField: false, expanded: EMPTY_RECORD });
        }
        case 'tree.expandLevel':
        case 'tree.collapseLevel':
          if (typeof command.depth !== 'number' || !Number.isInteger(command.depth) || command.depth < 0) return ctx.reject('invalidDepth');
          return levelChange(ctx, state, command.depth, command.type === 'tree.expandLevel');
        case 'tree.setExpanded': {
          if (typeof command.expanded !== 'object' || command.expanded === null || Array.isArray(command.expanded)) return ctx.reject('invalidExpanded');
          if (command.defaultExpanded !== undefined && !validDefault(command.defaultExpanded)) return ctx.reject('invalidDefault');
          const expanded: Record<RowId, boolean> = {};
          for (const [id, v] of Object.entries(command.expanded)) if (validId(id) && id !== TREE_DEFAULT_KEY) expanded[id] = v === true;
          const hasDefault = command.defaultExpanded !== undefined;
          return Object.freeze({
            ...state,
            defaultExpanded: hasDefault ? (command.defaultExpanded as boolean | number) : state.defaultExpanded,
            useField: hasDefault ? false : state.useField,
            expanded: freezeRecord(expanded),
          });
        }
        case 'tree.setOptions': {
          let next: TreeState = state;
          const set = <K extends keyof TreeState>(key: K, value: TreeState[K]): void => {
            if (next[key] !== value) next = { ...next, [key]: value };
          };
          for (const key of ['filterMode', 'copyMode'] as const) {
            const mode = command[key];
            if (mode === undefined) continue;
            if (!FILTER_MODES.includes(mode)) return ctx.reject(key === 'filterMode' ? 'invalidFilterMode' : 'invalidCopyMode');
            set(key, mode);
          }
          if (command.pageBy !== undefined) {
            if (command.pageBy !== 'all' && command.pageBy !== 'root') return ctx.reject('invalidPageBy');
            set('pageBy', command.pageBy);
          }
          if (command.defaultExpanded !== undefined) {
            if (!validDefault(command.defaultExpanded)) return ctx.reject('invalidDefault');
            set('defaultExpanded', command.defaultExpanded);
            set('useField', false);
          }
          if (command.checkbox !== undefined) set('checkbox', command.checkbox === true);
          if (command.cascade !== undefined) {
            if (command.cascade !== true && command.cascade !== false && command.cascade !== 'filtered') return ctx.reject('invalidCascade');
            set('cascade', command.cascade);
          }
          if (command.childSummary !== undefined) set('childSummary', command.childSummary === true);
          if (command.column !== undefined) set('column', typeof command.column === 'string' ? command.column : null);
          return next === state ? state : Object.freeze(next);
        }
        case 'tree.indent':
        case 'tree.outdent': {
          if (!Array.isArray(command.rowIds) || command.rowIds.length === 0 || !command.rowIds.every(validId)) return ctx.reject('invalidRowIds');
          const structure = structureOf(ctx);
          if (!structure) return ctx.reject('noTree');
          const target = command.type === 'tree.indent' ? indentTarget(structure, command.rowIds) : outdentTarget(structure, command.rowIds);
          const r = move(ctx, target, command.type === 'tree.indent' ? 'into' : 'after');
          if (typeof r === 'string') return ctx.reject(r);
          if (command.type === 'tree.indent' && typeof target !== 'string') {
            // The new parent opens so the moved rows stay visible.
            const e = setExpandedFor(ctx, state, [target.target], true);
            if (typeof e !== 'string') return e;
          }
          return state;
        }
        case 'tree.loadChildren':
        case 'tree.retry': {
          if (!validId(command.rowId)) return ctx.reject('invalidRowId');
          const current = loads.get(command.rowId)?.status ?? 'idle';
          if (command.type === 'tree.retry' && current !== 'error') return ctx.reject('notFailed');
          if (command.type === 'tree.loadChildren' && current !== 'idle') return state;
          const error = startLoad(ctx, command.rowId, command.type === 'tree.retry');
          if (error) return ctx.reject(error);
          return Object.freeze({ ...state, loadVersion: state.loadVersion + 1 });
        }
        case 'tree.loaded': {
          if (!validId(command.rowId)) return ctx.reject('invalidRowId');
          const status = command.status;
          if (status !== 'idle' && status !== 'loading' && status !== 'loaded' && status !== 'error') return ctx.reject('invalidStatus');
          let entry = loads.get(command.rowId);
          if (!entry) loads.set(command.rowId, (entry = { status, controller: null, error: undefined }));
          if (entry.status !== status) {
            if (status !== 'loading') entry.controller?.abort();
            entry.status = status;
            if (status === 'error') entry.error = command.error ?? 'error';
          }
          if (Array.isArray(command.childIds) && command.childIds.length) {
            for (const id of command.childIds) if (validId(id)) extraParents.set(id, command.rowId);
            extraVersion++;
          }
          return Object.freeze({ ...state, loadVersion: state.loadVersion + 1 });
        }
        case 'tree.setParents': {
          const parents = command.parents;
          if (typeof parents !== 'object' || parents === null) return ctx.reject('invalidParents');
          for (const [id, p] of Object.entries(parents)) if (validId(id) && (p === null || validId(p))) extraParents.set(id, p);
          extraVersion++;
          return Object.freeze({ ...state, loadVersion: state.loadVersion + 1 });
        }
        case 'tree.check': {
          if (!validId(command.rowId)) return ctx.reject('invalidRowId');
          if (ctx.getModuleState('selection') === undefined) return ctx.reject('noSelection');
          const structure = structureOf(ctx);
          if (!structure) return ctx.reject('noTree');
          const s = structure.sourceIndexOf(command.rowId);
          if (s < 0) return ctx.reject('unknownRow');
          const sel = ctx.getModuleState<SelectionLike>('selection');
          if (!state.cascade) {
            const on = selectedFn(ctx, structure, sel)(s);
            const checked = typeof command.checked === 'boolean' ? command.checked : !on;
            if (checked === on) return state;
            const r = ctx.dispatch({ type: 'selection.selectRows', rowIds: [command.rowId], mode: checked ? 'add' : 'remove' });
            return r.status === 'rejected' ? ctx.reject(r.reason) : state;
          }
          const { counts, selected, layout } = countsFor(ctx, state, structure);
          if ((layout.slot[s] as number) < 0) return ctx.reject('notKept');
          const current = checkStateOf(layout, counts, s, selected(s));
          const checked = typeof command.checked === 'boolean' ? command.checked : current !== 'checked';
          const plan = cascadePlan(layout, counts, s, checked, selected);
          const ids = (list: number[]): RowId[] => list.map((x) => structure.sourceIds[x] as RowId);
          if (plan.select.length) {
            const r = ctx.dispatch({ type: 'selection.selectRows', rowIds: ids(plan.select), mode: 'add' });
            if (r.status === 'rejected') return ctx.reject(r.reason);
          }
          if (plan.deselect.length) {
            const r = ctx.dispatch({ type: 'selection.selectRows', rowIds: ids(plan.deselect), mode: 'remove' });
            if (r.status === 'rejected') return ctx.reject(r.reason);
          }
          // The plan's source indexes update the counts directly (no id -> index lookups for a large subtree).
          const after = ctx.getModuleState<SelectionLike>('selection');
          const dispatched = (plan.select.length ? 1 : 0) + (plan.deselect.length ? 1 : 0);
          if (countsMemo && countsMemo.counts === counts && after && after.rows.scope === 'explicit' && !after.change.reset && after.version === countsMemo.version + dispatched) {
            applySelectionDelta(layout, counts, plan.select, plan.deselect);
            countsMemo = { ...countsMemo, selection: after, version: after.version };
          }
          return state;
        }
        default:
          return state;
      }
    },
    extendQuery(query: DataQuery, state: TreeState): DataQuery {
      let record: Readonly<Record<RowId, boolean>>;
      if (queryRecord && queryRecord.state.expanded === state.expanded && queryRecord.state.defaultExpanded === state.defaultExpanded) record = queryRecord.record;
      else {
        record = encodeExpansion(state);
        queryRecord = { state, record };
      }
      if (query.expansion.tree === record) return query;
      if (lastQuery && lastQuery.input === query && lastQuery.record === record) return lastQuery.output;
      const output: DataQuery = Object.freeze({ ...query, expansion: Object.freeze({ ...query.expansion, tree: record }) });
      lastQuery = { input: query, record, output };
      return output;
    },
    notify(_previous, _next, ctx) {
      flush(ctx);
      return { grid: true };
    },
    dispose() {
      disposed = true;
      for (const entry of loads.values()) entry.controller?.abort();
      loads.clear();
    },
    methods,
    pipeline: [
      {
        name: 'treeExpansion',
        key: (query, state) => [
          state.childrenField,
          state.parentIdField,
          state.defaultExpanded,
          state.useField,
          state.expandedField,
          state.expanded,
          state.filterMode,
          state.pageBy,
          state.childSummary,
          query.sorting,
          query.paging !== null,
          extraVersion,
        ],
        run(input: RowModelSnapshot<Row>, ctx) {
          const state = ctx.state;
          const warn = queueWarn;
          if (bothShapes) warn('tree-shape', 'tree sets both childrenField and parentIdField; childrenField is used.');
          if (ctx.query.grouping.length) warn('tree-grouping', 'grouping is ignored in tree mode (tree wins); remove the grouping option.');
          // The engine always passes its id index.
          const indexOf = ctx.sourceIndexOf as (rowId: RowId) => number;
          const memo = buildIndex(input.source, input.sourceIds, state, indexOf, warn, ctx.sourceChange);
          // Tree wins over grouping: the grouped view is replaced by the tree view.
          const { layout, match } = layoutFor(input, memo, state, ctx);
          const expanded = flagsFor(input, memo, state, indexOf);
          const structure: TreeStructure = {
            index: memo.index,
            layout,
            sourceIds: input.sourceIds,
            sourceIndexOf: indexOf,
            parentIdField: state.parentIdField,
            withParent: withParentFor(state),
            nested: state.parentIdField === null && !parentIdOf,
          };
          const model: TreeViewModel = { structure, expanded, match, lazy: null, ranges: buildVisibleRanges(layout, expanded, state.childSummary, state.defaultExpanded === true && state.expanded === EMPTY_RECORD && !(state.useField && state.expandedField !== null)), pageBy: state.pageBy === 'root' && ctx.query.paging !== null ? 'root' : 'all' };
          const view = new TreeView(model);
          return Object.freeze({ source: input.source, sourceIds: input.sourceIds, order: layout.order, count: view.count, groups: null, aggregates: input.aggregates ?? null, view });
        },
      },
    ],
  });
}

