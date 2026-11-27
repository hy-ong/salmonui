// Grouping module. Two
// pipeline stages: `group` turns the sorted order into a group tree using the
// cached per-column key ranks (boundaries are rank changes, no per-row
// objects), and `groupExpansion` flattens the tree into the visible row model
// (captions, data rows, group footers) by prefix sums over the collapsed
// state. Expansion state is keyed by group path, so it survives data
// patches, sorting, filtering, and virtualization. With `lazy: true` and a
// remote source that supports `lazyGroups`, group levels are loaded on
// demand through `read({ groupPath })`.

import { aggregatedNumericColumns } from './aggregate-need.js';
// Type only: group aggregates are read through `model.aggregates.read`, so grouping never loads the aggregates code.
import type { AggregateResult } from './aggregates.js';
import { defineDataGridModule } from './engine.js';
import { acceptMappedDeltas } from './row-delta.js';
import { createValueFormatter, describeFormat, type FormatEnvironment } from '@salmonui/core/format';
import {
  buildGroupTree,
  childrenOf,
  findGroup,
  GROUP_FOOTER_ID_PREFIX,
  GROUP_ID_PREFIX,
  groupCode,
  groupPath,
  groupPathKey,
  groupRowId,
  groupValue,
  jsonKey,
  sortByLevels,
  updateGroupTree,
  type GroupLevel,
  type GroupTree,
} from './group-tree.js';
import { baseView, outerIndex } from './view-helpers.js';
import { GroupView, resolveExpanded } from './group-view.js';
import { freezeJsonCopy } from '@salmonui/core/data';
import { collatorFor, ensureColumnKeys, getColumnKeys, getRowRanks, getSortRanks, type ColumnKeys } from './keys.js';
import { LazyGroupStore, LazyGroupView, pathKeyOf, type LazyNode, type LazyStatus } from './lazy-groups.js';
import { serializeDataGridQuery } from './query.js';
import { effectiveSortKeys, resolveLeaf, rowComparator } from './sort.js';
import type {
  AggregateValues,
  ColumnId,
  ColumnSnapshot,
  CompiledColumn,
  DataSource,
  DataGridModule,
  DataGridOptions,
  DataQuery,
  GroupDescriptor,
  GroupPathSegment,
  Json,
  ModuleContext,
  RowId,
  RowModelSnapshot,
} from './types.js';

export interface GroupingOptions {
  /** Enables grouping. When false, grouping commands are rejected and the query has no grouping. Default true. */
  readonly enabled?: boolean;
  /** Keep grouped columns visible. Default true. */
  readonly showGroupedColumns?: boolean;
  /** Groups start expanded. Default true (false in lazy mode). */
  readonly defaultExpanded?: boolean;
  /** Initial per-group expansion by group path key or row id. */
  readonly expandedGroups?: Readonly<Record<string, boolean>>;
  /** Load group levels on demand from a remote source with `capabilities.lazyGroups`. */
  readonly lazy?: boolean;
  /** Lazy mode: child rows per load. Default 100. */
  readonly lazyChunk?: number;
}

export interface GroupingState {
  readonly enabled: boolean;
  readonly grouping: readonly GroupDescriptor[];
  readonly showGroupedColumns: boolean;
  /** Group path key -> expanded, overriding `defaultExpanded`. */
  readonly expanded: Readonly<Record<string, boolean>>;
  readonly defaultExpanded: boolean;
  readonly lazy: boolean;
  /** Lazy store version (bumped when a lazy load settles). */
  readonly lazyVersion: number;
  /**
   * Lazy mode: top-level groups matching the query, as the root level
   * reported them (the pager pages top-level groups); null before
   * the root loads and outside lazy mode.
   */
  readonly lazyTotal?: number | null;
}

export type GroupDescriptorInput = { columnId: ColumnId; format?: string; direction?: 'asc' | 'desc' };
/** Groups / group target: a group row id (`__g:...`), a path key, or a path. */
export type GroupTarget = string | { columnId: ColumnId; key: Json }[];

export type GroupingSetCommand = { type: 'grouping.set'; grouping: GroupDescriptorInput[] };
/** `groupColumn()`: appends (or inserts at `index`) a grouped column. */
export type GroupingGroupByCommand = { type: 'grouping.groupBy'; columnId: ColumnId; index?: number; format?: string };
/** `ungroupColumn()`. */
export type GroupingUngroupCommand = { type: 'grouping.ungroup'; columnId: ColumnId };
/** `clearGrouping()`. */
export type GroupingClearCommand = { type: 'grouping.clear' };
/** Group chip reorder. */
export type GroupingMoveCommand = { type: 'grouping.move'; columnId: ColumnId; toIndex: number };
export type GroupingSetDirectionCommand = { type: 'grouping.setDirection'; columnId: ColumnId; direction: 'asc' | 'desc' };
/** Toggles (or sets) one group. */
export type GroupingToggleCommand = { type: 'grouping.toggle'; group: GroupTarget; expanded?: boolean };
export type GroupingExpandAllCommand = { type: 'grouping.expandAll' };
export type GroupingCollapseAllCommand = { type: 'grouping.collapseAll' };
/** Controlled expansion: replaces the per-group overrides (and optionally the default). */
export type GroupingSetExpandedCommand = { type: 'grouping.setExpanded'; expanded: Record<string, boolean>; defaultExpanded?: boolean };
export type GroupingSetEnabledCommand = { type: 'grouping.setEnabled'; enabled: boolean };
export type GroupingSetOptionsCommand = { type: 'grouping.setOptions'; showGroupedColumns?: boolean };
/** Lazy mode: retry a failed group (or the root level when `group` is omitted). */
export type GroupingRetryCommand = { type: 'grouping.retry'; group?: GroupTarget };
/** Lazy mode: load the next chunk of a group's children. */
export type GroupingLoadMoreCommand = { type: 'grouping.loadMore'; group: GroupTarget };
/** Lazy mode: a load settled (dispatched by the engine; part of the public command union). */
export type GroupingLoadedCommand = { type: 'grouping.loaded'; version: number };
export type GroupingCommand =
  | GroupingSetCommand
  | GroupingGroupByCommand
  | GroupingUngroupCommand
  | GroupingClearCommand
  | GroupingMoveCommand
  | GroupingSetDirectionCommand
  | GroupingToggleCommand
  | GroupingExpandAllCommand
  | GroupingCollapseAllCommand
  | GroupingSetExpandedCommand
  | GroupingSetEnabledCommand
  | GroupingSetOptionsCommand
  | GroupingRetryCommand
  | GroupingLoadMoreCommand
  | GroupingLoadedCommand;

/** Caption or footer row of a group, for renderers and templates. */
export interface GroupRowSnapshot {
  readonly id: RowId;
  readonly kind: 'group' | 'groupFooter';
  /** Visible index. */
  readonly index: number;
  /** Group level (0 = top). */
  readonly depth: number;
  readonly parentId: RowId | null;
  readonly path: readonly GroupPathSegment[];
  readonly pathKey: string;
  readonly columnId: ColumnId;
  readonly headerText: string;
  /** JSON form of the key (path segment key). */
  readonly key: Json;
  /** Raw key value (first row's value, or the group-by-format label). */
  readonly value: unknown;
  readonly formattedKey: string;
  /** Data rows in the group (all of them, also in lazy mode). */
  readonly count: number;
  readonly expanded: boolean;
  /** Group aggregates as shown (page-wise when paged with `scope: 'page'`). */
  readonly aggregates: AggregateValues;
  /** 1-based position among sibling groups and their number (`aria-posinset`, `aria-setsize`). */
  readonly posInSet: number;
  readonly setSize: number;
  /** Lazy mode load state of the group's children; `ready` for local groups. */
  readonly status: LazyStatus;
  readonly error: unknown;
  /** Lazy mode: more children can be loaded (`grouping.loadMore`). */
  readonly hasMore: boolean;
}

export type GroupingMethods<Row> = {
  /** Caption or footer snapshot by row id (`__g:` / `__gf:` ids). Identity is stable while nothing about the group changes. */
  getGroup(ctx: ModuleContext<Row>, rowId: RowId): GroupRowSnapshot | undefined;
  /** Data rows of a group (template `items`), in view order. */
  getGroupRows(ctx: ModuleContext<Row>, rowId: RowId): readonly Row[];
  /** Whether a group (row id, path key, or path) is expanded. */
  isExpanded(ctx: ModuleContext<Row>, group: GroupTarget): boolean;
  /** Lazy mode root level status. */
  getLazyStatus(ctx: ModuleContext<Row>): { readonly status: LazyStatus; readonly error: unknown } | null;
};

export type GroupingModule<Row> = DataGridModule<Row, GroupingState, GroupingCommand, 'grouping', GroupingMethods<Row>>;

const EMPTY: readonly never[] = Object.freeze([]);
const EMPTY_RECORD: Readonly<Record<string, boolean>> = Object.freeze({});
const EMPTY_VALUES: AggregateValues = Object.freeze({});

/** Normalizes a group target to its path key. */
export function groupTargetKey(target: GroupTarget): string | null {
  if (typeof target === 'string') {
    if (target.startsWith(GROUP_ID_PREFIX)) return target.slice(GROUP_ID_PREFIX.length);
    if (target.startsWith(GROUP_FOOTER_ID_PREFIX)) return target.slice(GROUP_FOOTER_ID_PREFIX.length);
    return target.startsWith('[') ? target : null;
  }
  if (!Array.isArray(target)) return null;
  for (const s of target) if (!s || typeof s.columnId !== 'string') return null;
  return pathKeyOf(target as GroupPathSegment[]);
}

function withGrouping(state: GroupingState, grouping: readonly GroupDescriptor[]): GroupingState {
  if (JSON.stringify(grouping) === JSON.stringify(state.grouping)) return state;
  // A different grouping is a different set of groups: expansion overrides start over.
  return Object.freeze({ ...state, grouping: grouping.length ? freezeJsonCopy([...grouping]) : EMPTY, expanded: EMPTY_RECORD });
}

function groupable<Row>(ctx: ModuleContext<Row>, key: string): CompiledColumn<Row> | null {
  const column = resolveLeaf(ctx.getColumns(), key);
  if (!column) {
    ctx.warn('column-unknown', `grouping: no column matches "${key}".`);
    return null;
  }
  return column;
}

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

function rawLevel(columnId: ColumnId, keys: ColumnKeys, desc: boolean, locale: string): GroupLevel {
  const ranks = getSortRanks(keys, locale);
  return { columnId, keys, desc, codeRank: ranks.byCode, rankCount: ranks.count, rowRank: () => getRowRanks(keys, ranks), label: null, ranks };
}

/** Group-by-format level: codes with the same label form one group; groups order by their smallest value. */
function labelLevel(columnId: ColumnId, keys: ColumnKeys, desc: boolean, locale: string, format: (value: unknown, row: unknown) => string): GroupLevel {
  const ranks = getSortRanks(keys, locale);
  const size = keys.values.length;
  const labels: string[] = new Array(size);
  const first = new Map<string, number>();
  for (let c = 0; c < size; c++) {
    const label = format(keys.values[c], keys.sample[c]);
    labels[c] = label;
    const r = ranks.byCode[c] as number;
    const at = first.get(label);
    if (at === undefined || r < at) first.set(label, r);
  }
  const distinct = [...first.entries()].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const rankOf = new Map<string, number>();
  for (let i = 0; i < distinct.length; i++) rankOf.set((distinct[i] as [string, number])[0], i);
  const codeRank = new Int32Array(size);
  for (let c = 0; c < size; c++) codeRank[c] = rankOf.get(labels[c] as string) as number;
  let rows: Int32Array | null = null;
  return {
    columnId,
    keys,
    desc,
    codeRank,
    rankCount: distinct.length,
    rowRank: () => {
      if (!rows) {
        rows = new Int32Array(keys.rowCount);
        const codes = keys.codes;
        for (let i = 0; i < keys.rowCount; i++) rows[i] = codeRank[codes[i] as number] as number;
      }
      return rows;
    },
    label: (code) => labels[code] ?? '',
    ranks: null,
  };
}

/** Order of custom group keys: blanks first, then booleans, numbers and dates by value, then strings by the locale collator. */
function compareGroupKeys(a: unknown, b: unknown, compare: (x: string, y: string) => number): number {
  const ka = keyClass(a);
  const kb = keyClass(b);
  if (ka !== kb) return ka - kb;
  if (ka === 0) return 0;
  if (ka === 1) {
    const x = a instanceof Date ? a.getTime() : Number(a);
    const y = b instanceof Date ? b.getTime() : Number(b);
    return x < y ? -1 : x > y ? 1 : 0;
  }
  return compare(String(a), String(b));
}

function keyClass(v: unknown): number {
  if (v == null) return 0;
  return typeof v === 'number' || typeof v === 'boolean' || v instanceof Date ? 1 : 2;
}

/**
 * Custom group key level (`column.groupKey`): rows with an equal key
 * (dates by time) form one group; groups order by key. The caption is the
 * key, formatted when a format applies (descriptor `format`, or the column
 * formatter with `groupByFormat`).
 */
function keyLevel<Row>(
  columnId: ColumnId,
  keys: ColumnKeys,
  desc: boolean,
  locale: string,
  source: readonly Row[],
  groupKey: (row: Row) => unknown,
  format: ((value: unknown, row: unknown) => string) | null,
): GroupLevel {
  const n = source.length;
  const rowCodes = new Int32Array(n);
  const byValue = new Map<unknown, number>();
  const byTime = new Map<number, number>();
  const keyValues: unknown[] = [];
  const firstRow: number[] = [];
  for (let r = 0; r < n; r++) {
    const row = source[r] as Row;
    const k = row == null ? undefined : groupKey(row);
    const map: Map<unknown, number> = k instanceof Date ? (byTime as Map<unknown, number>) : byValue;
    const id = k instanceof Date ? k.getTime() : k;
    let code = map.get(id);
    if (code === undefined) {
      code = keyValues.length;
      map.set(id, code);
      keyValues.push(k);
      firstRow.push(r);
    }
    rowCodes[r] = code;
  }
  const size = keyValues.length;
  const compare = collatorFor(locale).compare;
  const sorted = Array.from({ length: size }, (_, i) => i).sort((a, b) => compareGroupKeys(keyValues[a], keyValues[b], compare) || a - b);
  const codeRank = new Int32Array(size);
  for (let i = 0; i < size; i++) codeRank[sorted[i] as number] = i;
  const labels: (string | undefined)[] = new Array(size);
  let rows: Int32Array | null = null;
  return {
    columnId,
    keys,
    desc,
    codeRank,
    rankCount: size,
    rowRank: () => {
      if (!rows) {
        rows = new Int32Array(n);
        for (let r = 0; r < n; r++) rows[r] = codeRank[rowCodes[r] as number] as number;
      }
      return rows;
    },
    label: (code) => {
      let label = labels[code];
      if (label === undefined) {
        const k = keyValues[code];
        label = k == null ? '' : format ? format(k, source[firstRow[code] as number]) : k instanceof Date ? k.toISOString() : String(k);
        labels[code] = label;
      }
      return label;
    },
    ranks: null,
    rowCodes,
    keyValues,
  };
}

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

/**
 * Creates the `grouping` module. Options come from
 * `options.grouping` (`GroupingOptions`); the initial grouping from
 * `options.defaultQuery.grouping`. Register `createSortModule()` too so the
 * grouped order comes from the shared sort keys; without it the group stage
 * sorts by the group keys itself.
 */
export function createGroupingModule<Row>(): GroupingModule<Row> {
  let getRowId: (row: Row, index: number) => RowId = () => '';
  let lazyStore: LazyGroupStore | null = null;
  let lazyChunk = 100;
  let env: FormatEnvironment | null = null;
  const groupFormatters = new Map<string, (value: unknown, row: unknown) => string>();
  const snapshots = new Map<RowId, GroupRowSnapshot>();
  let snapshotsFor: unknown = null;
  const siblingIndex = new WeakMap<object, Map<number, Map<number, number>>>();

  function formatterFor(ctx: { locale: string; timeZone: string | undefined }, column: CompiledColumn<Row>, format: string | undefined, byFormat: boolean): ((value: unknown, row: unknown) => string) | null {
    if (format) {
      const key = `${column.type}|${format}`;
      let f = groupFormatters.get(key);
      if (!f) {
        env ??= { getLocale: () => ctx.locale, timeZone: ctx.timeZone, currency: 'USD', cache: new Map(), warn: () => {} };
        const fn = createValueFormatter(describeFormat(format, column.type, () => {}, column.columnId), column.type, env);
        f = (value) => fn(value);
        groupFormatters.set(key, f);
      }
      return f;
    }
    return byFormat ? (value, row) => column.formatter(value, row as Row) : null;
  }

  function levelsFor(source: readonly Row[], query: DataQuery, columns: ColumnSnapshot<Row>, state: GroupingState, locale: string, timeZone: string | undefined): GroupLevel[] {
    const direction = new Map<ColumnId, 'asc' | 'desc'>();
    for (const s of query.sorting) direction.set(s.columnId, s.direction);
    const list: { column: CompiledColumn<Row>; g: GroupDescriptor }[] = [];
    const seen = new Set<ColumnId>();
    for (const g of query.grouping) {
      const column = columns.byId.get(g.columnId);
      if (!column?.leaf || seen.has(column.columnId)) continue;
      seen.add(column.columnId);
      list.push({ column, g });
    }
    ensureColumnKeys(
      source,
      list.map((l) => l.column),
      aggregatedNumericColumns(query, columns),
    );
    return list.map(({ column, g }) => {
      const keys = getColumnKeys(source, column);
      const desc = (direction.get(column.columnId) ?? g.direction ?? 'asc') === 'desc';
      const format = formatterFor({ locale, timeZone }, column, g.format, column.def.groupByFormat === true);
      const groupKey = column.def.groupKey;
      if (groupKey) return keyLevel(column.columnId, keys, desc, locale, source, groupKey, format);
      return format ? labelLevel(column.columnId, keys, desc, locale, format) : rawLevel(column.columnId, keys, desc, locale);
    });
  }

  function lazyActive(state: GroupingState, query: DataQuery, source: DataSource<Row>): boolean {
    return state.lazy && query.grouping.length > 0 && source.mode === 'remote' && source.capabilities?.lazyGroups === true;
  }

  function isExpandedKey(state: GroupingState, key: string): boolean {
    return state.expanded[key] ?? state.defaultExpanded;
  }

  function currentExpanded(ctx: ModuleContext<Row>, state: GroupingState, key: string): boolean {
    // Overrides are canonical path keys; a non-canonical key resolves through the tree.
    if (key in state.expanded) return state.expanded[key] as boolean;
    const view = baseView(ctx.getRows().view);
    if (view instanceof GroupView) {
      const g = findGroup(view.tree, key);
      if (g >= 0) return isExpandedKey(state, groupPathKey(view.tree, g));
    }
    return state.defaultExpanded;
  }

  function canonicalKey(ctx: ModuleContext<Row>, key: string): string {
    const view = baseView(ctx.getRows().view);
    if (view instanceof GroupView) {
      const g = findGroup(view.tree, key);
      if (g >= 0) return groupPathKey(view.tree, g);
    }
    return key;
  }

  function lazyNode(key: string | null): LazyNode | null {
    if (!lazyStore || key === null) return null;
    return lazyStore.byKey.get(key) ?? null;
  }

  function positionOf(tree: GroupTree, g: number): [number, number] {
    let byParent = siblingIndex.get(tree.shared);
    if (!byParent) {
      byParent = new Map();
      siblingIndex.set(tree.shared, byParent);
    }
    const p = tree.parent[g] as number;
    let map = byParent.get(p);
    if (!map) {
      map = new Map();
      const kids = childrenOf(tree, p);
      for (let i = 0; i < kids.length; i++) map.set(kids[i] as number, i);
      byParent.set(p, map);
    }
    return [(map.get(g) ?? 0) + 1, map.size];
  }

  function sameSnapshot(a: GroupRowSnapshot, b: GroupRowSnapshot): boolean {
    return (
      a.index === b.index &&
      a.count === b.count &&
      a.expanded === b.expanded &&
      a.aggregates === b.aggregates &&
      a.posInSet === b.posInSet &&
      a.setSize === b.setSize &&
      a.status === b.status &&
      a.error === b.error &&
      a.hasMore === b.hasMore &&
      a.formattedKey === b.formattedKey &&
      a.headerText === b.headerText &&
      a.parentId === b.parentId
    );
  }

  function remember(snap: GroupRowSnapshot): GroupRowSnapshot {
    const previous = snapshots.get(snap.id);
    if (previous && sameSnapshot(previous, snap)) return previous;
    snapshots.set(snap.id, snap);
    return snap;
  }

  const methods: GroupingMethods<Row> = {
    getGroup(ctx, rowId) {
      const model = ctx.getRows();
      if (snapshotsFor !== model) {
        snapshotsFor = model;
        if (snapshots.size > 4096) snapshots.clear();
      }
      const outer = model.view;
      const view = baseView(outer);
      const footer = rowId.startsWith(GROUP_FOOTER_ID_PREFIX);
      const columns = ctx.getColumns();
      if (view instanceof GroupView) {
        const tree = view.tree;
        const g = view.groupOfId(rowId);
        if (g < 0) return undefined;
        const index = outerIndex(outer, footer ? view.footerIndex(g) : view.captionIndex(g));
        if (index < 0) return undefined;
        const depth = tree.level[g] as number;
        const level = tree.levels[depth] as GroupLevel;
        const column = columns.byId.get(level.columnId);
        const value = groupValue(tree, g);
        const code = groupCode(tree, g);
        const formattedKey = level.label ? level.label(code) : column ? column.formatter(value, level.keys.sample[code] as Row) : String(value ?? '');
        const [posInSet, setSize] = positionOf(tree, g);
        const p = tree.parent[g] as number;
        const pathKey = groupPathKey(tree, g);
        let count = tree.size[g] as number;
        if (view.range) {
          const a = Math.max(view.range[0], tree.start[g] as number);
          const b = Math.min(view.range[1], (tree.start[g] as number) + count);
          count = Math.max(0, b - a);
        }
        return remember(
          Object.freeze({
            id: rowId,
            kind: footer ? 'groupFooter' : 'group',
            index,
            depth,
            parentId: footer ? groupRowId(tree, g) : p < 0 ? null : groupRowId(tree, p),
            path: Object.freeze(groupPath(tree, g).map((s) => Object.freeze(s))),
            pathKey,
            columnId: level.columnId,
            headerText: column?.headerText ?? level.columnId,
            key: jsonKey(value),
            value,
            formattedKey,
            count,
            expanded: view.expanded[g] === 1,
            aggregates: model.aggregates?.read?.(model as RowModelSnapshot<unknown>, g) ?? EMPTY_VALUES,
            posInSet,
            setSize,
            status: 'ready',
            error: null,
            hasMore: false,
          }),
        );
      }
      if (view instanceof LazyGroupView) {
        const node = view.nodeOfId(rowId);
        if (!node) return undefined;
        const index = outerIndex(outer, footer ? view.footerOf(node) : view.captionOf(node));
        if (index < 0) return undefined;
        const column = columns.byId.get(node.columnId);
        const siblings = node.parent ? (node.parent.groups ?? []) : view.store.roots;
        const state = ctx.getModuleState<GroupingState>('grouping') as GroupingState;
        return remember(
          Object.freeze({
            id: rowId,
            kind: footer ? 'groupFooter' : 'group',
            index,
            depth: node.depth,
            parentId: footer ? GROUP_ID_PREFIX + node.pathKey : node.parent ? GROUP_ID_PREFIX + node.parent.pathKey : null,
            path: node.path,
            pathKey: node.pathKey,
            columnId: node.columnId,
            headerText: column?.headerText ?? node.columnId,
            key: node.key,
            value: node.key,
            formattedKey: column && node.key !== null ? column.formatter(node.key, undefined as unknown as Row) : String(node.key ?? ''),
            count: node.count,
            expanded: isExpandedKey(state, node.pathKey),
            aggregates: node.aggregates ?? EMPTY_VALUES,
            posInSet: siblings.indexOf(node) + 1,
            setSize: siblings.length,
            status: node.status,
            error: node.error,
            hasMore: node.hasMore,
          }),
        );
      }
      return undefined;
    },
    getGroupRows(ctx, rowId) {
      const view = baseView(ctx.getRows().view);
      if (view instanceof GroupView) {
        const g = view.groupOfId(rowId);
        if (g < 0) return EMPTY;
        const tree = view.tree;
        const a = tree.start[g] as number;
        const b = a + (tree.size[g] as number);
        const source = ctx.getRows().source;
        const out: Row[] = new Array(b - a);
        for (let i = a; i < b; i++) out[i - a] = source[tree.order[i] as number] as Row;
        return out;
      }
      if (view instanceof LazyGroupView) {
        const node = view.nodeOfId(rowId);
        if (!node) return EMPTY;
        const out: Row[] = [];
        const collect = (n: LazyNode): void => {
          for (const r of n.rows) out.push(r as Row);
          for (const c of n.groups ?? []) collect(c);
        };
        collect(node);
        return out;
      }
      return EMPTY;
    },
    isExpanded(ctx, group) {
      const key = groupTargetKey(group);
      if (key === null) return false;
      return currentExpanded(ctx, ctx.getModuleState<GroupingState>('grouping') as GroupingState, key);
    },
    getLazyStatus() {
      return lazyStore ? Object.freeze({ status: lazyStore.status, error: lazyStore.error }) : null;
    },
  };

  return defineDataGridModule<Row, GroupingState, GroupingCommand, 'grouping', GroupingMethods<Row>>({
    name: 'grouping',
    commands: [
      'grouping.set',
      'grouping.groupBy',
      'grouping.ungroup',
      'grouping.clear',
      'grouping.move',
      'grouping.setDirection',
      'grouping.toggle',
      'grouping.expandAll',
      'grouping.collapseAll',
      'grouping.setExpanded',
      'grouping.setEnabled',
      'grouping.setOptions',
      'grouping.retry',
      'grouping.loadMore',
      'grouping.loaded',
    ],
    initialState(options: DataGridOptions<Row>): GroupingState {
      const o = (options['grouping'] ?? {}) as GroupingOptions;
      getRowId = options.getRowId;
      lazyChunk = o.lazyChunk && o.lazyChunk > 0 ? Math.floor(o.lazyChunk) : 100;
      const grouping = options.defaultQuery?.grouping ?? EMPTY;
      const lazy = o.lazy === true;
      const expanded: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(o.expandedGroups ?? options.defaultQuery?.expansion?.groups ?? {})) {
        const key = groupTargetKey(k) ?? k;
        expanded[key] = v === true;
      }
      return Object.freeze({
        enabled: o.enabled ?? true,
        grouping: grouping.length ? freezeJsonCopy([...grouping]) : EMPTY,
        showGroupedColumns: o.showGroupedColumns ?? true,
        expanded: Object.keys(expanded).length ? Object.freeze(expanded) : EMPTY_RECORD,
        defaultExpanded: o.defaultExpanded ?? options.defaultQuery?.expansion?.defaultGroupExpanded ?? !lazy,
        lazy,
        lazyVersion: 0,
      });
    },
    reduce(state, command, ctx) {
      switch (command.type) {
        case 'grouping.set': {
          if (!Array.isArray(command.grouping)) return ctx.reject('invalidGrouping');
          if (!state.enabled && command.grouping.length) return ctx.reject('groupingDisabled');
          const list: GroupDescriptor[] = [];
          const seen = new Set<ColumnId>();
          for (const g of command.grouping) {
            const column = groupable(ctx, g?.columnId);
            if (!column) return ctx.reject('unknownColumn');
            if (!column.flags.allowGrouping) return ctx.reject('columnNotGroupable');
            if (seen.has(column.columnId)) continue;
            if (g.direction !== undefined && g.direction !== 'asc' && g.direction !== 'desc') return ctx.reject('invalidDirection');
            seen.add(column.columnId);
            list.push({ columnId: column.columnId, ...(g.format ? { format: g.format } : {}), ...(g.direction ? { direction: g.direction } : {}) });
          }
          return withGrouping(state, list);
        }
        case 'grouping.groupBy': {
          if (!state.enabled) return ctx.reject('groupingDisabled');
          const column = groupable(ctx, command.columnId);
          if (!column) return ctx.reject('unknownColumn');
          if (!column.flags.allowGrouping) return ctx.reject('columnNotGroupable');
          if (state.grouping.some((g) => g.columnId === column.columnId)) return state;
          const list = [...state.grouping];
          const at = typeof command.index === 'number' && Number.isInteger(command.index) ? Math.max(0, Math.min(list.length, command.index)) : list.length;
          list.splice(at, 0, { columnId: column.columnId, ...(command.format ? { format: command.format } : {}) });
          return withGrouping(state, list);
        }
        case 'grouping.ungroup': {
          const column = resolveLeaf(ctx.getColumns(), command.columnId);
          const id = column?.columnId ?? command.columnId;
          if (!state.grouping.some((g) => g.columnId === id)) return state;
          return withGrouping(
            state,
            state.grouping.filter((g) => g.columnId !== id),
          );
        }
        case 'grouping.clear':
          return withGrouping(state, EMPTY);
        case 'grouping.move': {
          const from = state.grouping.findIndex((g) => g.columnId === command.columnId);
          if (from < 0) return ctx.reject('notGrouped');
          if (typeof command.toIndex !== 'number' || !Number.isInteger(command.toIndex)) return ctx.reject('invalidIndex');
          const to = Math.max(0, Math.min(state.grouping.length - 1, command.toIndex));
          if (to === from) return state;
          const list = [...state.grouping];
          const [moved] = list.splice(from, 1) as [GroupDescriptor];
          list.splice(to, 0, moved);
          return withGrouping(state, list);
        }
        case 'grouping.setDirection': {
          if (command.direction !== 'asc' && command.direction !== 'desc') return ctx.reject('invalidDirection');
          const at = state.grouping.findIndex((g) => g.columnId === command.columnId);
          if (at < 0) return ctx.reject('notGrouped');
          const list = state.grouping.map((g, i) => (i === at ? { ...g, direction: command.direction } : g));
          // Direction changes keep the groups (same keys), so keep the expansion overrides.
          return JSON.stringify(list) === JSON.stringify(state.grouping) ? state : Object.freeze({ ...state, grouping: freezeJsonCopy(list) });
        }
        case 'grouping.toggle': {
          const raw = groupTargetKey(command.group);
          if (raw === null) return ctx.reject('invalidGroup');
          const key = canonicalKey(ctx, raw);
          const current = currentExpanded(ctx, state, key);
          const next = typeof command.expanded === 'boolean' ? command.expanded : !current;
          if (next === current) return state;
          const expanded = { ...state.expanded };
          if (next === state.defaultExpanded) delete expanded[key];
          else expanded[key] = next;
          return Object.freeze({ ...state, expanded: Object.keys(expanded).length ? Object.freeze(expanded) : EMPTY_RECORD });
        }
        case 'grouping.expandAll':
          return state.defaultExpanded && state.expanded === EMPTY_RECORD ? state : Object.freeze({ ...state, defaultExpanded: true, expanded: EMPTY_RECORD });
        case 'grouping.collapseAll':
          return !state.defaultExpanded && state.expanded === EMPTY_RECORD ? state : Object.freeze({ ...state, defaultExpanded: false, expanded: EMPTY_RECORD });
        case 'grouping.setExpanded': {
          if (typeof command.expanded !== 'object' || command.expanded === null) return ctx.reject('invalidExpanded');
          const expanded: Record<string, boolean> = {};
          const def = typeof command.defaultExpanded === 'boolean' ? command.defaultExpanded : state.defaultExpanded;
          for (const [k, v] of Object.entries(command.expanded)) {
            const key = groupTargetKey(k);
            if (key === null) continue;
            if ((v === true) !== def) expanded[canonicalKey(ctx, key)] = v === true;
          }
          return Object.freeze({ ...state, defaultExpanded: def, expanded: Object.keys(expanded).length ? Object.freeze(expanded) : EMPTY_RECORD });
        }
        case 'grouping.setEnabled':
          if (typeof command.enabled !== 'boolean') return ctx.reject('invalidEnabled');
          return command.enabled === state.enabled ? state : Object.freeze({ ...state, enabled: command.enabled });
        case 'grouping.setOptions': {
          let next = state;
          if (typeof command.showGroupedColumns === 'boolean' && command.showGroupedColumns !== state.showGroupedColumns) next = { ...next, showGroupedColumns: command.showGroupedColumns };
          return next === state ? state : Object.freeze(next);
        }
        case 'grouping.retry': {
          if (!lazyStore) return ctx.reject('notLazy');
          const key = command.group === undefined ? null : groupTargetKey(command.group);
          lazyStore.retry(key === null ? null : lazyNode(key));
          return state;
        }
        case 'grouping.loadMore': {
          const node = lazyNode(groupTargetKey(command.group));
          if (!node || !lazyStore) return ctx.reject('unknownGroup');
          if (node.hasMore) lazyStore.load(node, true);
          return state;
        }
        case 'grouping.loaded': {
          const lazyTotal = lazyStore && lazyStore.status === 'ready' ? lazyStore.totalRowCount : null;
          return command.version === state.lazyVersion && lazyTotal === (state.lazyTotal ?? null)
            ? state
            : Object.freeze({ ...state, lazyVersion: command.version, lazyTotal });
        }
        default:
          return state;
      }
    },
    extendQuery(query, state) {
      const grouping = state.enabled ? state.grouping : EMPTY;
      const expansion = query.expansion;
      const sameExpansion = expansion.groups === state.expanded && expansion.defaultGroupExpanded === state.defaultExpanded;
      if (query.grouping === grouping && sameExpansion) return query;
      return Object.freeze({
        ...query,
        grouping,
        expansion: sameExpansion ? expansion : Object.freeze({ ...expansion, groups: state.expanded, defaultGroupExpanded: state.defaultExpanded }),
      });
    },
    notify(previous, next, ctx) {
      if (lazyStore && (previous.expanded !== next.expanded || previous.defaultExpanded !== next.defaultExpanded)) {
        lazyStore.sync((node) => isExpandedKey(next, node.pathKey));
      }
      const headers = new Set<ColumnId>();
      if (previous.grouping !== next.grouping || previous.showGroupedColumns !== next.showGroupedColumns) {
        for (const g of previous.grouping) headers.add(g.columnId);
        for (const g of next.grouping) headers.add(g.columnId);
      }
      void ctx;
      return { grid: true, headers: [...headers] };
    },
    hiddenColumns(state) {
      return state.showGroupedColumns || !state.enabled ? EMPTY : state.grouping.map((g) => g.columnId);
    },
    interceptRead(query, state, ctx) {
      const source = ctx.getDataSource();
      if (!lazyActive(state, query, source)) {
        lazyStore?.dispose();
        lazyStore = null;
        return false;
      }
      lazyStore ??= new LazyGroupStore({
        source: source as DataSource<unknown>,
        getRowId: getRowId as (row: unknown, index: number) => RowId,
        chunk: lazyChunk,
        onChange: () => {
          const s = ctx.getModuleState<GroupingState>('grouping') as GroupingState;
          const store = lazyStore;
          if (!store) return;
          // Newly loaded groups may already be expanded (state survives reloads).
          store.sync((node) => isExpandedKey(s, node.pathKey));
          if (store.version !== s.lazyVersion) queueLoaded(ctx, store);
        },
      });
      lazyStore.reset(query, serializeDataGridQuery(Object.freeze({ ...query, expansion: EMPTY_EXPANSION })));
      return true;
    },
    dispose() {
      lazyStore?.dispose();
      lazyStore = null;
    },
    methods,
    pipeline: [
      acceptMappedDeltas({
        name: 'group',
        key: (query) => [query.grouping, query.sorting],
        run(input: RowModelSnapshot<Row>, ctx) {
          if (ctx.query.grouping.length === 0) return input;
          const levels = levelsFor(input.source, ctx.query, ctx.columns, ctx.state, ctx.locale, ctx.timeZone);
          if (levels.length === 0) return input;
          let order = input.order;
          if (!order) {
            order = new Int32Array(input.count);
            for (let i = 0; i < input.count; i++) order[i] = i;
          }
          let tree = buildGroupTree(order, input.source.length, input.sourceIds, levels, false);
          tree ??= buildGroupTree(sortByLevels(order, levels), input.source.length, input.sourceIds, levels, true) as GroupTree;
          return Object.freeze({ source: input.source, sourceIds: input.sourceIds, order: tree.order, count: tree.dataCount, groups: tree });
        },
        update(input: RowModelSnapshot<Row>, previous, delta, ctx) {
          if (ctx.query.grouping.length === 0) return input;
          const prevTree = (previous.output.groups ?? null) as GroupTree | null;
          const order = input.order;
          if (!prevTree || !order) return undefined;
          const levels = levelsFor(input.source, ctx.query, ctx.columns, ctx.state, ctx.locale, ctx.timeZone);
          const compare = rowComparator(input.source, effectiveSortKeys(ctx.query, ctx.columns), ctx.locale);
          const isMember = (r: number): boolean => {
            let lo = 0;
            let hi = order.length;
            while (lo < hi) {
              const mid = (lo + hi) >> 1;
              if (compare(order[mid] as number, r) < 0) lo = mid + 1;
              else hi = mid;
            }
            return lo < order.length && order[lo] === r;
          };
          const tree = updateGroupTree(prevTree, order, input.sourceIds, levels, delta, isMember);
          return tree ? Object.freeze({ source: input.source, sourceIds: input.sourceIds, order: tree.order, count: tree.dataCount, groups: tree }) : undefined;
        },
      }),
      {
        name: 'groupExpansion',
        key: (query, state) => [query.expansion.groups, query.expansion.defaultGroupExpanded, query.aggregates, state.lazy ? state.lazyVersion : 0, query.grouping],
        run(input: RowModelSnapshot<Row>, ctx) {
          const footers = ctx.query.aggregates.some((a) => a.placement.includes('groupFooter'));
          if (lazyStore && ctx.query.grouping.length > 0 && ctx.state.lazy) {
            const state = ctx.state;
            const view = new LazyGroupView(lazyStore, ctx.query.grouping.length, (node) => isExpandedKey(state, node.pathKey), footers);
            return Object.freeze({ ...input, count: view.count, view });
          }
          const tree = (input.groups ?? null) as GroupTree | null;
          if (!tree) return input;
          const expanded = resolveExpanded(tree, ctx.query.expansion.groups, ctx.query.expansion.defaultGroupExpanded);
          const view = new GroupView(tree, expanded, footers, null);
          return Object.freeze({ ...input, count: view.count, view });
        },
      },
    ],
  });
}

const EMPTY_EXPANSION = Object.freeze({ groups: EMPTY_RECORD, tree: EMPTY_RECORD, detail: EMPTY_RECORD, defaultGroupExpanded: true });

const pendingLoaded = new WeakSet<object>();
/** Lazy loads settle asynchronously; the version bump is one command per microtask. */
function queueLoaded<Row>(ctx: ModuleContext<Row>, store: LazyGroupStore): void {
  if (pendingLoaded.has(store)) return;
  pendingLoaded.add(store);
  void Promise.resolve().then(() => {
    pendingLoaded.delete(store);
    ctx.dispatch({ type: 'grouping.loaded', version: store.version });
  });
}

export type { AggregateResult };
