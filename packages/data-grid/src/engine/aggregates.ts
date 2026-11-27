// Aggregates module (aggregation stage). Values are computed in typed-array passes over the cached column
// keys: one pass per aggregated column accumulates sum / min / max /
// true / false counts per leaf group, then groups roll up into their parents
// and the top-level groups into the totals slot. A small data change
// recomputes only the leaf groups whose rows changed and their ancestor chain.
// Custom aggregates run lazily, per group, when read.

import { defineDataGridModule } from './engine.js';
import { describeFormat, createValueFormatter, type FormatEnvironment } from '@salmonui/core/format';
import { freezeJsonCopy } from '@salmonui/core/data';
import { aggregatedNumericColumns, Need, needOf } from './aggregate-need.js';
import { acceptMappedDeltas } from './row-delta.js';
import { ensureColumnKeys, getColumnKeys, getNumericValues, getRowRanks, getSortRanks, type ColumnKeys } from './keys.js';
import { isLeaf, type GroupTree } from './group-tree.js';
import type { PlainView } from './detail-view.js';
import { baseView } from './view-helpers.js';
import type { GroupView } from './group-view.js';
import type {
  AggregateDescriptor,
  AggregateModelSnapshot,
  AggregateType,
  AggregateValues,
  ColumnId,
  ColumnSnapshot,
  CompiledColumn,
  DataGridModule,
  DataGridOptions,
  DataQuery,
  ModuleContext,
  RowDelta,
  RowModelSnapshot,
  RowModelView,
} from './types.js';

export type AggregateScope = 'page' | 'all';
export type BuiltInAggregateType = Exclude<AggregateType, 'custom'>;
export const AGGREGATE_TYPES: readonly AggregateType[] = Object.freeze(['sum', 'average', 'min', 'max', 'count', 'trueCount', 'falseCount', 'custom']);

/** A custom aggregate (`type: 'custom'`): receives the group's (or the grid's) rows. */
export type CustomAggregate = (rows: readonly unknown[], column: CompiledColumn<unknown>) => unknown;

export interface AggregatesOptions {
  /**
   * `page` (default): with paging, footer and group aggregates
   * cover the rows of the current page. `all` (`disablePageWiseAggregates`):
   * they cover every row of the query.
   */
  readonly scope?: AggregateScope;
  /** Custom aggregates referenced by `customId` in commands (functions are not serializable). */
  readonly custom?: Readonly<Record<string, CustomAggregate>> | ((customId: string) => CustomAggregate | undefined);
}

/** Serializable aggregate descriptor of `aggregates.set`. */
export type AggregateInput = {
  readonly columnId: ColumnId;
  readonly type: AggregateType;
  /** `type: 'custom'`: key of the function in `AggregatesOptions.custom`. */
  readonly customId?: string;
  readonly placement?: readonly ('footer' | 'groupFooter' | 'groupCaption')[];
  readonly format?: string;
};

export interface AggregatesState {
  readonly aggregates: readonly AggregateInput[];
  readonly scope: AggregateScope;
}

export type AggregatesSetCommand = { type: 'aggregates.set'; aggregates: AggregateInput[] };
export type AggregatesSetScopeCommand = { type: 'aggregates.setScope'; scope: AggregateScope };
export type AggregatesCommand = AggregatesSetCommand | AggregatesSetScopeCommand;

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------

interface ColumnStats {
  readonly column: CompiledColumn<unknown>;
  /** Per source row: numeric key (numbers, epoch ms, booleans 0/1; NaN when absent) or, for strings, the sort rank (0 = blank). */
  readonly vals: Float64Array | Int32Array;
  /** String min/max work on ranks; this maps a rank back to its value. */
  readonly reps: readonly (number | string)[] | null;
  readonly need: number;
  sum: Float64Array | null;
  min: Float64Array | null;
  max: Float64Array | null;
  trues: Float64Array | null;
  falses: Float64Array | null;
}

/** Aggregate results of one row model; group `g` is slot `g`, the totals are slot `tree.count` (or 0 without groups). */
export interface AggregateResult extends AggregateModelSnapshot {
  readonly scope: AggregateScope;
  readonly descriptors: readonly AggregateDescriptor[];
  readonly tree: GroupTree | null;
  /** Data order the values were computed over. */
  readonly order: Int32Array | null;
  readonly dataCount: number;
  readonly source: readonly unknown[];
  readonly columns: ReadonlyMap<ColumnId, ColumnStats>;
  /** @internal per slot lazily built values */
  readonly cache: Map<number, AggregateValues>;
}

function makeStats(column: CompiledColumn<unknown>, vals: Float64Array | Int32Array, reps: readonly (number | string)[] | null, need: number, slots: number): ColumnStats {
  return {
    column,
    vals,
    reps,
    need,
    sum: need & Need.Sum ? new Float64Array(slots) : null,
    min: need & Need.MinMax ? new Float64Array(slots).fill(Number.POSITIVE_INFINITY) : null,
    max: need & Need.MinMax ? new Float64Array(slots).fill(Number.NEGATIVE_INFINITY) : null,
    trues: need & Need.Bool ? new Float64Array(slots) : null,
    falses: need & Need.Bool ? new Float64Array(slots) : null,
  };
}

/** Accumulates rows `order[a..b)` into slot `slot` (overwriting it). */
function accumulate(stats: ColumnStats, order: Int32Array | null, a: number, b: number, slot: number): void {
  const vals = stats.vals;
  const strings = stats.reps !== null;
  if (stats.sum && !stats.min && !stats.trues) {
    // Hot path: sum / average only.
    let sum = 0;
    if (order) {
      for (let i = a; i < b; i++) {
        const v = vals[order[i] as number] as number;
        if (v === v) sum += v;
      }
    } else {
      for (let i = a; i < b; i++) {
        const v = vals[i] as number;
        if (v === v) sum += v;
      }
    }
    stats.sum[slot] = strings ? 0 : sum;
    return;
  }
  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let trues = 0;
  let falses = 0;
  for (let i = a; i < b; i++) {
    const v = vals[order ? (order[i] as number) : i] as number;
    if (strings ? v === 0 : v !== v) continue;
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
    if (v === 1) trues++;
    else if (v === 0) falses++;
  }
  if (stats.sum) stats.sum[slot] = strings ? 0 : sum;
  if (stats.min) (stats.min as Float64Array)[slot] = min;
  if (stats.max) (stats.max as Float64Array)[slot] = max;
  if (stats.trues) (stats.trues as Float64Array)[slot] = trues;
  if (stats.falses) (stats.falses as Float64Array)[slot] = falses;
}

/** Combines slot `from` into slot `into`. */
function combine(stats: ColumnStats, into: number, from: number): void {
  if (stats.sum) stats.sum[into]! += stats.sum[from] as number;
  if (stats.min && (stats.min[from] as number) < (stats.min[into] as number)) stats.min[into] = stats.min[from] as number;
  if (stats.max && (stats.max[from] as number) > (stats.max[into] as number)) stats.max[into] = stats.max[from] as number;
  if (stats.trues) stats.trues[into]! += stats.trues[from] as number;
  if (stats.falses) stats.falses[into]! += stats.falses[from] as number;
}

function resetSlot(stats: ColumnStats, slot: number): void {
  if (stats.sum) stats.sum[slot] = 0;
  if (stats.min) stats.min[slot] = Number.POSITIVE_INFINITY;
  if (stats.max) stats.max[slot] = Number.NEGATIVE_INFINITY;
  if (stats.trues) stats.trues[slot] = 0;
  if (stats.falses) stats.falses[slot] = 0;
}

function columnNeeds<Row>(descriptors: readonly AggregateDescriptor[], columns: ColumnSnapshot<Row>): Map<ColumnId, { column: CompiledColumn<Row>; need: number }> {
  const out = new Map<ColumnId, { column: CompiledColumn<Row>; need: number }>();
  for (const d of descriptors) {
    const column = columns.byId.get(d.columnId);
    if (!column?.leaf) continue;
    const entry = out.get(column.columnId) ?? { column, need: 0 };
    entry.need |= needOf(d.type);
    out.set(column.columnId, entry);
  }
  return out;
}

/** Per-row values of a column: numeric keys, or sort ranks for string columns. */
function valuesFor(source: readonly unknown[], column: CompiledColumn<unknown>, locale: string): { vals: Float64Array | Int32Array; reps: readonly (number | string)[] | null } {
  if (column.type !== 'string') return { vals: getNumericValues(source, column), reps: null };
  const keys: ColumnKeys = getColumnKeys(source, column);
  const ranks = getSortRanks(keys, locale);
  return { vals: getRowRanks(keys, ranks), reps: ranks.reps };
}

/** Full computation over a row model (grouped when `input.groups` is set). */
export function computeAggregates<Row>(
  input: RowModelSnapshot<Row>,
  descriptors: readonly AggregateDescriptor[],
  columns: ColumnSnapshot<Row>,
  scope: AggregateScope,
  locale: string,
): AggregateResult {
  const tree = (input.groups ?? null) as GroupTree | null;
  const order = tree ? tree.order : input.order;
  const G = tree ? tree.count : 0;
  const slots = G + 1;
  const needs = columnNeeds(descriptors, columns);
  const numeric = [...needs.values()].filter((n) => n.need !== 0 && n.column.type !== 'string').map((n) => n.column as CompiledColumn<unknown>);
  if (numeric.length > 1) ensureColumnKeys(input.source, [], numeric);
  const stats = new Map<ColumnId, ColumnStats>();
  for (const { column, need } of needs.values()) {
    const c = column as CompiledColumn<unknown>;
    const { vals, reps } = need === 0 ? { vals: new Float64Array(0), reps: null } : valuesFor(input.source, c, locale);
    const s = makeStats(c, vals, reps, need, slots);
    stats.set(column.columnId, s);
    if (need === 0) continue;
    if (!tree) {
      accumulate(s, order, 0, input.count, 0);
      continue;
    }
    for (let i = 0; i < tree.leaves.length; i++) {
      const g = tree.leaves[i] as number;
      const a = tree.start[g] as number;
      accumulate(s, order, a, a + (tree.size[g] as number), g);
    }
    rollUp(s, tree);
  }
  return {
    scope,
    descriptors,
    tree,
    order,
    dataCount: tree ? tree.dataCount : input.count,
    source: input.source,
    columns: stats,
    cache: new Map(),
    read: aggregatesForModel,
    range: getRangeAggregateValues,
  };
}

/** Child groups of `g` (top-level groups for -1); a local copy of `group-tree.ts` `childrenOf`, so aggregates without grouping do not load the group tree. */
function childrenOf(tree: GroupTree, g: number): number[] {
  const out: number[] = [];
  const end = g < 0 ? tree.count : (tree.next[g] as number);
  for (let c = g + 1; c < end; c = tree.next[c] as number) out.push(c);
  return out;
}

/** Rolls leaf slots up into parents and the totals slot (reverse pre-order visits children first). */
function rollUp(s: ColumnStats, tree: GroupTree): void {
  const G = tree.count;
  const parent = tree.parent;
  const D = tree.depth;
  for (let g = 0; g < G; g++) if ((tree.level[g] as number) !== D - 1) resetSlot(s, g);
  resetSlot(s, G);
  for (let g = G - 1; g >= 0; g--) {
    const p = parent[g] as number;
    combine(s, p < 0 ? G : p, g);
  }
}

function cloneStats(s: ColumnStats): ColumnStats {
  return {
    ...s,
    sum: s.sum ? s.sum.slice() : null,
    min: s.min ? s.min.slice() : null,
    max: s.max ? s.max.slice() : null,
    trues: s.trues ? s.trues.slice() : null,
    falses: s.falses ? s.falses.slice() : null,
  };
}

/**
 * Incremental update after `updateGroupTree`: recomputes the changed leaf
 * groups from their rows and re-combines only their ancestor chains and the
 * totals. Null when a full computation is needed.
 */
export function updateAggregates<Row>(
  previous: AggregateResult,
  input: RowModelSnapshot<Row>,
  descriptors: readonly AggregateDescriptor[],
  delta: RowDelta,
  locale: string,
): AggregateResult | null {
  const tree = (input.groups ?? null) as GroupTree | null;
  if (!tree || tree.base !== previous.tree || !tree.changedLeaves || previous.descriptors !== descriptors) return null;
  const G = tree.count;
  const stats = new Map<ColumnId, ColumnStats>();
  for (const [id, old] of previous.columns) {
    if (old.need === 0) {
      stats.set(id, old);
      continue;
    }
    let vals: Float64Array | Int32Array;
    if (old.reps !== null) {
      // String ranks may have been repaired (new values): rebuild.
      const keys = getColumnKeys(input.source, old.column);
      const ranks = getSortRanks(keys, locale);
      if (ranks.reps !== old.reps || ranks.count !== old.reps.length) return null;
      vals = getRowRanks(keys, ranks);
    } else {
      // Carried to the new rows by the engine's key maintenance (advanceColumnKeys).
      vals = getNumericValues(input.source, old.column);
      void delta;
    }
    stats.set(id, cloneStats({ ...old, vals }));
  }
  const ancestors = new Set<number>();
  for (const leaf of tree.changedLeaves) for (let x = tree.parent[leaf] as number; x >= 0; x = tree.parent[x] as number) ancestors.add(x);
  const inner = [...ancestors].sort((a, b) => b - a); // deepest (largest pre-order index) first
  const roots = childrenOf(tree, -1);
  for (const s of stats.values()) {
    if (s.need === 0) continue;
    for (const leaf of tree.changedLeaves) {
      const a = tree.start[leaf] as number;
      accumulate(s, tree.order, a, a + (tree.size[leaf] as number), leaf);
    }
    for (const g of inner) {
      resetSlot(s, g);
      for (const c of childrenOf(tree, g)) combine(s, g, c);
    }
    resetSlot(s, G);
    for (const r of roots) combine(s, G, r);
  }
  return { ...previous, tree, order: tree.order, dataCount: tree.dataCount, source: input.source, columns: stats, cache: new Map() };
}

function valueOf(result: AggregateResult, s: ColumnStats, type: AggregateType, slot: number, count: number): unknown {
  switch (type) {
    case 'sum':
      return s.sum ? s.sum[slot] : null;
    case 'average':
      // Sum over the group's item count.
      return s.sum && count > 0 ? (s.sum[slot] as number) / count : null;
    case 'min':
    case 'max': {
      const v = (type === 'min' ? s.min : s.max)?.[slot];
      if (v === undefined || !Number.isFinite(v)) return null;
      if (s.reps) return s.reps[v] ?? null;
      const t = s.column.type;
      if (t === 'date' || t === 'datetime') return new Date(v);
      if (t === 'boolean' || t === 'selection') return v === 1;
      return v;
    }
    case 'count':
      return count;
    case 'trueCount':
      return s.trues ? s.trues[slot] : 0;
    case 'falseCount':
      return s.falses ? s.falses[slot] : 0;
    default:
      void result;
      return null;
  }
}

/** Data positions `[a, b)` and item count of a slot. */
function slotRange(result: AggregateResult, slot: number): [number, number] {
  const tree = result.tree;
  if (!tree || slot === tree.count) return [0, result.dataCount];
  const a = tree.start[slot] as number;
  return [a, a + (tree.size[slot] as number)];
}

function rowsOf(result: AggregateResult, a: number, b: number): unknown[] {
  const out = new Array<unknown>(b - a);
  const { order, source } = result;
  for (let i = a; i < b; i++) out[i - a] = source[order ? (order[i] as number) : i];
  return out;
}

function buildValues(result: AggregateResult, slot: number, a: number, b: number, partial: boolean): AggregateValues {
  const out: Record<ColumnId, Record<string, unknown>> = {};
  let rows: unknown[] | null = null;
  const temp = partial ? new Map<ColumnId, ColumnStats>() : null;
  for (const d of result.descriptors) {
    const s = result.columns.get(d.columnId);
    if (!s) continue;
    let stats = s;
    let at = slot;
    if (temp) {
      let t = temp.get(d.columnId);
      if (!t) {
        t = makeStats(s.column, s.vals, s.reps, s.need, 1);
        if (t.need) accumulate(t, result.order, a, b, 0);
        temp.set(d.columnId, t);
      }
      stats = t;
      at = 0;
    }
    const entry = (out[d.columnId] ??= {});
    if (d.type === 'custom') {
      rows ??= rowsOf(result, a, b);
      entry['custom'] = d.custom ? d.custom(rows, s.column) : null;
    } else entry[d.type] = valueOf(result, stats, d.type, at, b - a);
  }
  for (const k of Object.keys(out)) Object.freeze(out[k]);
  return Object.freeze(out);
}

/** Aggregate values of a group (or of the totals for `g = -1`), cached per result. */
export function getAggregateValues(result: AggregateResult, g: number): AggregateValues {
  const slot = g < 0 ? (result.tree ? result.tree.count : 0) : g;
  let hit = result.cache.get(slot);
  if (!hit) {
    const [a, b] = slotRange(result, slot);
    hit = buildValues(result, slot, a, b, false);
    result.cache.set(slot, hit);
  }
  return hit;
}

const partialCache = new WeakMap<object, Map<string, AggregateValues>>();

/** Aggregate values over data positions `[a, b)` (page-wise aggregates of a paged view). */
export function getRangeAggregateValues(result: AggregateResult, owner: object, slot: number, a: number, b: number): AggregateValues {
  let map = partialCache.get(owner);
  if (!map) {
    map = new Map();
    partialCache.set(owner, map);
  }
  const key = `${slot}:${a}:${b}`;
  let hit = map.get(key);
  if (!hit) {
    hit = buildValues(result, slot, a, b, true);
    map.set(key, hit);
  }
  return hit;
}

/** Structural `PlainView` test (no `instanceof`, so this module does not load `detail-view.ts`). */
function isPlainView(view: RowModelView | null): view is PlainView {
  return view !== null && view.kind === 'plain';
}

/**
 * Footer totals of a model with pinned rows. The aggregate stage
 * runs without the pinned rows (they leave the order before grouping), so
 * the totals add them back: every matching row for the `all` scope, the
 * pinned rows plus the page for the page-wise scope.
 */
function pinnedTotals<Row>(model: RowModelSnapshot<Row>, result: AggregateResult, pinned: Int32Array): AggregateValues {
  let rest: Int32Array | null = result.order;
  if (result.scope === 'page') {
    const base = baseView(model.view);
    if (isPlainView(base)) {
      if (base.order) rest = base.order.subarray(base.start, base.start + base.count);
      else {
        rest = new Int32Array(base.count);
        for (let i = 0; i < base.count; i++) rest[i] = base.start + i;
      }
    } else if (base && base.kind === 'grouped' && (base as GroupView).range) {
      const view = base as GroupView;
      const [lo, hi] = view.range as readonly [number, number];
      rest = view.tree.order.subarray(lo, hi);
    } else if (!base && model.order) rest = model.order.subarray(pinned.length);
  }
  if (rest === null) {
    rest = new Int32Array(result.dataCount);
    for (let i = 0; i < rest.length; i++) rest[i] = i;
  }
  const order = new Int32Array(pinned.length + rest.length);
  order.set(pinned);
  order.set(rest, pinned.length);
  return getRangeAggregateValues({ ...result, tree: null, order, dataCount: order.length }, model, 0, 0, order.length);
}

/**
 * Values of group `g` (or the totals for -1) as the final row model shows
 * them: with a page-wise scope and a paged view (or a paged ungrouped
 * model), only the page's rows count.
 */
export function aggregatesForModel<Row>(model: RowModelSnapshot<Row>, g: number): AggregateValues | null {
  const result = (model.aggregates ?? null) as AggregateResult | null;
  if (!result) return null;
  const pinned = model.pinned;
  if (pinned && pinned.length > 0 && g < 0) return pinnedTotals(model, result, pinned);
  if (result.scope === 'page') {
    const base = baseView(model.view);
    const view = isPlainView(base) ? null : (base as GroupView | null);
    if (view && view.kind === 'grouped' && view.range) {
      const [lo, hi] = view.range;
      const tree = view.tree;
      const slot = g < 0 ? tree.count : g;
      const a = g < 0 ? lo : Math.max(lo, tree.start[g] as number);
      const b = g < 0 ? hi : Math.min(hi, (tree.start[g] as number) + (tree.size[g] as number));
      if (a !== (g < 0 ? 0 : (tree.start[g] as number)) || b !== (g < 0 ? tree.dataCount : (tree.start[g] as number) + (tree.size[g] as number))) {
        return getRangeAggregateValues(result, view, slot, a, b);
      }
    } else if (isPlainView(base) && !base.full && !result.tree && g < 0) {
      const plain = base;
      // Ungrouped paged model with detail rows: the page is a window of the plain view.
      let order: Int32Array;
      if (plain.order) order = plain.order.subarray(plain.start, plain.start + plain.count);
      else {
        order = new Int32Array(plain.count);
        for (let i = 0; i < plain.count; i++) order[i] = plain.start + i;
      }
      return getRangeAggregateValues({ ...result, order }, plain, 0, 0, plain.count);
    } else if (!view && !result.tree && g < 0 && model.order !== result.order && model.count !== result.dataCount) {
      // Ungrouped paged model: the page is a window of the aggregated order.
      return getRangeAggregateValues(
        { ...result, order: model.order },
        model,
        0,
        0,
        model.count,
      );
    }
  }
  return getAggregateValues(result, g);
}

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export type AggregatesMethods<Row> = {
  /** Footer (grid-level) aggregate values: server totals when the source performed aggregation, else computed. */
  getFooter(ctx: ModuleContext<Row>): AggregateValues;
  /** Formats an aggregate value with the descriptor's `format`, else the column format. */
  format(ctx: ModuleContext<Row>, columnId: ColumnId, type: AggregateType, value: unknown): string;
};

export type AggregatesModule<Row> = DataGridModule<Row, AggregatesState, AggregatesCommand, 'aggregates', AggregatesMethods<Row>>;

const EMPTY: readonly never[] = Object.freeze([]);
const EMPTY_VALUES: AggregateValues = Object.freeze({});
const PLACEMENTS = new Set(['footer', 'groupFooter', 'groupCaption']);

function normalizeInput(list: readonly AggregateInput[]): AggregateInput[] | null {
  const out: AggregateInput[] = [];
  for (const a of list) {
    if (!a || typeof a.columnId !== 'string' || !AGGREGATE_TYPES.includes(a.type)) return null;
    const placement = a.placement ?? ['footer'];
    if (!Array.isArray(placement) || placement.some((p) => !PLACEMENTS.has(p))) return null;
    if (a.type === 'custom' && typeof a.customId !== 'string') return null;
    out.push({ ...a, placement: [...placement] });
  }
  return out;
}

/** Descriptors from `defaultQuery.aggregates` (functions kept) to serializable inputs. */
function inputsFromQuery(list: readonly AggregateDescriptor[], custom: Map<string, CustomAggregate>): AggregateInput[] {
  return list.map((d, i) => {
    const base: AggregateInput = { columnId: d.columnId, type: d.type, placement: [...d.placement], ...(d.format ? { format: d.format } : {}) };
    if (d.type !== 'custom' || !d.custom) return base;
    const customId = `__query${i}`;
    custom.set(customId, d.custom as CustomAggregate);
    return { ...base, customId };
  });
}

/**
 * Creates the `aggregates` module. Options come from
 * `options.aggregates` (`AggregatesOptions`); the initial descriptors from
 * `options.defaultQuery.aggregates`.
 */
export function createAggregatesModule<Row>(): AggregatesModule<Row> {
  let resolveCustom: (id: string) => CustomAggregate | undefined = () => undefined;
  const fromQuery = new Map<string, CustomAggregate>();
  const descriptorCache = new WeakMap<object, readonly AggregateDescriptor[]>();
  let env: FormatEnvironment | null = null;
  const formatters = new Map<string, (value: unknown) => string>();
  let footerFor: { model: unknown; data: unknown; values: AggregateValues } | null = null;

  function descriptorsOf(state: AggregatesState): readonly AggregateDescriptor[] {
    let hit = descriptorCache.get(state.aggregates);
    if (!hit) {
      hit = state.aggregates.length
        ? Object.freeze(
            state.aggregates.map((a) => {
              const custom = a.type === 'custom' && a.customId ? (fromQuery.get(a.customId) ?? resolveCustom(a.customId)) : undefined;
              return Object.freeze({
                columnId: a.columnId,
                type: a.type,
                placement: Object.freeze([...(a.placement ?? ['footer'])]),
                ...(a.format ? { format: a.format } : {}),
                ...(custom ? { custom: custom as AggregateDescriptor['custom'] } : {}),
              }) as AggregateDescriptor;
            }),
          )
        : EMPTY;
      descriptorCache.set(state.aggregates, hit);
    }
    return hit;
  }

  const methods: AggregatesMethods<Row> = {
    getFooter(ctx) {
      const snapshot = ctx.getSnapshot();
      if (footerFor && footerFor.model === snapshot.rows && footerFor.data === snapshot.data) return footerFor.values;
      let values: AggregateValues = EMPTY_VALUES;
      if (snapshot.data.performed.includes('aggregate') && snapshot.data.aggregates) values = snapshot.data.aggregates;
      else values = aggregatesForModel(snapshot.rows, -1) ?? EMPTY_VALUES;
      footerFor = { model: snapshot.rows, data: snapshot.data, values };
      return values;
    },
    format(ctx, columnId, type, value) {
      if (value === null || value === undefined) return '';
      const state = ctx.getModuleState<AggregatesState>('aggregates') as AggregatesState;
      const d = state.aggregates.find((a) => a.columnId === columnId && a.type === type && a.format) ?? state.aggregates.find((a) => a.columnId === columnId && a.format);
      const column = ctx.getColumns().byId.get(columnId);
      if (d?.format) {
        const key = `${column?.type ?? 'number'}|${d.format}`;
        let f = formatters.get(key);
        if (!f) {
          env ??= { getLocale: () => ctx.getSnapshot().locale, timeZone: ctx.timeZone, currency: 'USD', cache: new Map(), warn: ctx.warn };
          const valueType = type === 'count' || type === 'trueCount' || type === 'falseCount' || type === 'sum' || type === 'average' ? 'number' : (column?.type ?? 'number');
          f = createValueFormatter(describeFormat(d.format, valueType, ctx.warn, columnId), valueType, env);
          formatters.set(key, f);
        }
        return f(value);
      }
      if (type === 'count' || type === 'trueCount' || type === 'falseCount') return String(value);
      if (column && (type !== 'custom' || typeof value === 'number')) {
        const sample = column.type === 'boolean' && typeof value !== 'boolean' ? null : value;
        if (sample !== null) return column.formatter(value, undefined as unknown as Row);
      }
      return typeof value === 'number' ? String(Math.round(value * 1e10) / 1e10) : String(value);
    },
  };

  return defineDataGridModule<Row, AggregatesState, AggregatesCommand, 'aggregates', AggregatesMethods<Row>>({
    name: 'aggregates',
    commands: ['aggregates.set', 'aggregates.setScope'],
    initialState(options: DataGridOptions<Row>): AggregatesState {
      const o = (options['aggregates'] ?? {}) as AggregatesOptions;
      const custom = o.custom;
      resolveCustom = typeof custom === 'function' ? custom : (id) => custom?.[id];
      const list = options.defaultQuery?.aggregates ?? EMPTY;
      return Object.freeze({
        aggregates: list.length ? freezeJsonCopy(inputsFromQuery(list, fromQuery)) : EMPTY,
        scope: o.scope === 'all' ? 'all' : 'page',
      });
    },
    reduce(state, command, ctx) {
      switch (command.type) {
        case 'aggregates.set': {
          if (!Array.isArray(command.aggregates)) return ctx.reject('invalidAggregates');
          const list = normalizeInput(command.aggregates);
          if (!list) return ctx.reject('invalidAggregates');
          for (const a of list) {
            const column = ctx.getColumns().byId.get(a.columnId);
            if (!column?.leaf) return ctx.reject('unknownColumn');
          }
          return Object.freeze({ ...state, aggregates: list.length ? freezeJsonCopy(list) : EMPTY });
        }
        case 'aggregates.setScope':
          if (command.scope !== 'page' && command.scope !== 'all') return ctx.reject('invalidScope');
          return command.scope === state.scope ? state : Object.freeze({ ...state, scope: command.scope });
        default:
          return state;
      }
    },
    extendQuery(query: DataQuery, state) {
      const aggregates = descriptorsOf(state);
      return query.aggregates === aggregates ? query : Object.freeze({ ...query, aggregates });
    },
    notify() {
      return { grid: true };
    },
    methods,
    pipeline: [
      acceptMappedDeltas({
        name: 'aggregate',
        key: (query, state) => [query.aggregates, state.scope],
        run(input: RowModelSnapshot<Row>, ctx) {
          const descriptors = ctx.query.aggregates;
          if (descriptors.length === 0) return input;
          const aggregates = computeAggregates(input, descriptors, ctx.columns, ctx.state.scope, ctx.locale);
          return Object.freeze({ ...input, aggregates });
        },
        update(input: RowModelSnapshot<Row>, previous, delta, ctx) {
          const descriptors = ctx.query.aggregates;
          if (descriptors.length === 0) return input;
          const prev = (previous.output.aggregates ?? null) as AggregateResult | null;
          if (!prev || previous.output === previous.input) return undefined;
          const aggregates = updateAggregates(prev, input, descriptors, delta, ctx.locale);
          return aggregates ? Object.freeze({ ...input, aggregates }) : undefined;
        },
      }),
    ],
  });
}

export { aggregatedNumericColumns, isLeaf };
