// Export model. A
// framework-agnostic, format-neutral description of what an export writes:
// the exported leaf columns (visibility, order, widths, formatting), the
// header rows (stacked header tree), the body rows (data rows, group
// captions, group footers, detail blocks), and the grid footer aggregate
// rows. The model types, CSV and the writers of `@salmonui/export` live in
// `@salmonui/core/export-model`; this module builds the model from the engine.
//
// The body is a plan of typed arrays (kind + reference per output row), not a
// list of row objects, so a 100k-row model costs two typed arrays and rows
// are materialized one at a time by `getRow(index)` while a writer streams.

import { createExportModel, isExportCapableEngine } from '@salmonui/core/export-model';
import type {
  ExportScope,
  ExportHierarchyMode,
  ExportCellStyle,
  ExportImage,
  ExportCell,
  ExportCellOverride,
  ExportColumn,
  ExportHeaderCell,
  ExportHeaderRow,
  ExportAggregateCell,
  ExportAggregateCells,
  ExportDataRow,
  ExportGroupRow,
  ExportGroupFooterRow,
  ExportAggregateRow,
  ExportDetail,
  ExportDetailRow,
  ExportRow,
  ExportCellContext,
  ExportGroupCaptionContext,
  ExportAggregateContext,
  ExportDetailContext,
  ExportHeaderContext,
  ExportColumnSelection,
  ExportModelOptions,
  ExportModel,
  ExportCapableEngine,
} from '@salmonui/core/export-model';
export type {
  ExportScope,
  ExportHierarchyMode,
  ExportCellStyle,
  ExportImage,
  ExportCell,
  ExportCellOverride,
  ExportColumn,
  ExportHeaderCell,
  ExportHeaderRow,
  ExportAggregateCell,
  ExportAggregateCells,
  ExportDataRow,
  ExportGroupRow,
  ExportGroupFooterRow,
  ExportAggregateRow,
  ExportDetail,
  ExportDetailRow,
  ExportRow,
  ExportCellContext,
  ExportGroupCaptionContext,
  ExportAggregateContext,
  ExportDetailContext,
  ExportHeaderContext,
  ExportColumnSelection,
  ExportModelOptions,
  ExportModel,
  ExportCapableEngine,
} from '@salmonui/core/export-model';
export { createExportModel, isExportCapableEngine };
import { defineDataGridModule } from './engine.js';
import { baseView } from './view-helpers.js';
import { aggregatesForModel, computeAggregates, getAggregateValues, type AggregateResult, type AggregatesState } from './aggregates.js';
import { orderLeaves, type ColumnsState } from './columns.js';
import { createValueFormatter, describeFormat, toDate, type FormatEnvironment } from '@salmonui/core/format';
import { groupCode, groupPathKey, groupRowId, groupValue, jsonKey, GROUP_FOOTER_ID_PREFIX, type GroupTree } from './group-tree.js';
import { GroupView, resolveExpanded } from './group-view.js';
import type { GroupingState } from './grouping.js';
import type { SelectionState } from './selection.js';
import type {
  AggregateDescriptor,
  AggregateType,
  AggregateValues,
  ColumnId,
  ColumnSnapshot,
  ColumnType,
  CompiledColumn,
  FormatDescriptor,
  DataGridEngine,
  DataGridModule,
  Json,
  ModuleContext,
  RowId,
  RowModelSnapshot,
  RowModelView,
} from './types.js';

/** An export column of this engine: the source column is the compiled column. */
type GridExportColumn<Row> = ExportColumn<Row> & { readonly column: CompiledColumn<Row> };

export type ExportMethods<Row> = {
  /** Builds the export model of the current grid state. */
  getModel(ctx: ModuleContext<Row>, options?: ExportModelOptions<Row>): ExportModel<Row>;
};

export type ExportModule<Row> = DataGridModule<Row, null, never, 'export', ExportMethods<Row>>;

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

/** Creates the `export` module: `engine.export.getModel(options)`. */
export function createExportModule<Row>(): ExportModule<Row> {
  return defineDataGridModule<Row, null, never, 'export', ExportMethods<Row>>({
    name: 'export',
    inSnapshot: false,
    commands: [],
    initialState: () => null,
    methods: {
      getModel: (ctx, options) => buildExportModel(ctx, options ?? {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

const DATA = 0;
const CAPTION = 1;
const FOOTER = 2;
const DETAIL = 3;
const DEFAULT_WIDTH = 150;
const DATE_TEXT_CACHE = 4096;
const EMPTY: readonly never[] = Object.freeze([]);
const EMPTY_STATE: ColumnsState = Object.freeze({ visibility: Object.freeze({}), widths: Object.freeze({}), order: null, freeze: Object.freeze({}), frozenCount: Object.freeze({ left: 0, right: 0 }) });

// Outline flags of `TreeExportRows.flags` (tree-view.ts).
const COLLAPSED = 1;
const HIDDEN = 2;

/** Export rows of a tree view (`TreeView.exportRows`, tree-view.ts): read duck-typed so no tree code loads here. */
interface TreeExportRows {
  readonly order: Int32Array;
  readonly depth: Uint16Array;
  readonly flags: Uint8Array | null;
  readonly maxDepth: number;
}
type TreeExportView = { exportRows(all: boolean, source: boolean): TreeExportRows };

/** The tree view of a tree-mode model (structural base view), or null. */
function treeViewOf<Row>(model: RowModelSnapshot<Row>): TreeExportView | null {
  const view = baseView(model.view) as (RowModelView & Partial<TreeExportView>) | null;
  return view && typeof view.exportRows === 'function' ? (view as TreeExportView) : null;
}

/** Tree column: TreeState `column`, else the first visible exported column (-1 when not exported). */
function treeColumnOf<Row>(ctx: ModuleContext<Row>, columns: readonly GridExportColumn<Row>[]): number {
  const id = ctx.getModuleState<{ column: string | null }>('tree')?.column ?? null;
  return columns.findIndex((c) => (id ? c.columnId === id || c.field === id : c.visible));
}

function alignOf(align: string | undefined): 'start' | 'center' | 'end' {
  return align === 'center' ? 'center' : align === 'end' ? 'end' : 'start';
}

/** Typed value of a cell: dates become `Date`, everything else is the raw value. */
function typedValue(type: ColumnType, value: unknown): unknown {
  if (value === undefined) return null;
  if ((type === 'date' || type === 'datetime') && value !== null && !(value instanceof Date)) return toDate(value) ?? value;
  return value;
}

function exportColumn<Row>(column: CompiledColumn<Row>, index: number, state: ColumnsState, visible: boolean, freeze: 'left' | 'right' | null, pick?: ExportColumnSelection): GridExportColumn<Row> {
  const type = column.type;
  const accessor = column.accessor;
  const formatter = column.formatter;
  const width = pick?.width ?? state.widths[column.columnId] ?? (typeof column.width.initial === 'number' ? column.width.initial : DEFAULT_WIDTH);
  let text: (row: Row) => string = (row) => formatter(accessor(row), row);
  if ((type === 'date' || type === 'datetime') && column.def.valueFormatter === undefined) {
    // Date formatting through Intl dominates large exports; memoize by instant (bounded).
    const memo = new Map<number, string>();
    text = (row) => {
      const value = accessor(row);
      const d = value instanceof Date ? value : null;
      if (d === null) return formatter(value, row);
      const t = d.getTime();
      let hit = memo.get(t);
      if (hit === undefined) {
        if (memo.size >= DATE_TEXT_CACHE) memo.clear();
        hit = formatter(value, row);
        memo.set(t, hit);
      }
      return hit;
    };
  }
  return Object.freeze({
    index,
    columnId: column.columnId,
    field: column.field,
    headerText: pick?.headerText ?? column.headerText,
    type,
    width,
    textAlign: alignOf(column.def.align),
    format: column.format,
    freeze,
    visible,
    column,
    value: (row: Row) => typedValue(type, accessor(row)),
    text,
  });
}

/** Exported leaves: visible leaves in runtime order, hidden ones after their runtime predecessor when included. */
function exportColumns<Row>(columns: ColumnSnapshot<Row>, state: ColumnsState, options: ExportModelOptions<Row>): GridExportColumn<Row>[] {
  const left = new Set(columns.left.map((c) => c.columnId));
  const right = new Set(columns.right.map((c) => c.columnId));
  const zone = (c: CompiledColumn<Row>): 'left' | 'right' | null => (left.has(c.columnId) ? 'left' : right.has(c.columnId) ? 'right' : null);
  const visibleIds = new Set(columns.visible.map((c) => c.columnId));
  let list: CompiledColumn<Row>[];
  const picks = new Map<ColumnId, ExportColumnSelection>();
  if (options.columns) {
    list = [];
    for (const entry of options.columns) {
      const id = typeof entry === 'string' ? entry : entry.columnId;
      const c = columns.byId.get(id) ?? columns.leaves.find((l) => l.field === id);
      if (!c?.leaf || list.includes(c)) continue;
      list.push(c);
      if (typeof entry !== 'string') picks.set(c.columnId, entry);
    }
  } else if (options.includeHiddenColumns) {
    const ordered = orderLeaves(columns.leaves, state.order);
    const front: CompiledColumn<Row>[] = [];
    const after = new Map<ColumnId, CompiledColumn<Row>[]>();
    let previous: ColumnId | null = null;
    for (const c of ordered) {
      if (visibleIds.has(c.columnId)) previous = c.columnId;
      else if (previous === null) front.push(c);
      else {
        const bucket = after.get(previous) ?? [];
        bucket.push(c);
        after.set(previous, bucket);
      }
    }
    list = [...front];
    for (const c of columns.visible) list.push(c, ...(after.get(c.columnId) ?? EMPTY));
  } else {
    list = [...columns.visible];
  }
  // Renderer utility columns (detail toggle, drag handle: `meta.utility`) carry no data.
  list = list.filter((c) => !isUtilityColumn(c));
  return list.map((c, i) => exportColumn(c, i, state, visibleIds.has(c.columnId), visibleIds.has(c.columnId) ? zone(c) : null, picks.get(c.columnId)));
}

/** A renderer utility column (`meta: { utility: true }`): detail toggle, row drag handle. */
function isUtilityColumn<Row>(column: CompiledColumn<Row>): boolean {
  const meta = column.def.meta;
  return meta !== null && typeof meta === 'object' && !Array.isArray(meta) && (meta as { utility?: unknown }).utility === true;
}

/**
 * Header rows from the stacked header tree: group cells merge over contiguous
 * runs of their leaves within one freeze zone. A group whose leaves sit in two
 * zones is split at the frozen edge, as the grid header renders it.
 * Hidden exported columns (`includeHiddenColumns`) belong to the zone of the
 * column before them.
 */
function headerRowsOf<Row>(columns: readonly GridExportColumn<Row>[], byId: ColumnSnapshot<Row>['byId']): ExportHeaderRow[] {
  let depth = 1;
  for (const c of columns) depth = Math.max(depth, c.column.path.length);
  const zones: ('left' | 'right' | 'center')[] = [];
  const firstVisible = columns.find((c) => c.visible);
  let zone: 'left' | 'right' | 'center' = firstVisible?.freeze ?? 'center';
  for (const c of columns) {
    if (c.visible) zone = c.freeze ?? 'center';
    zones.push(zone);
  }
  const rows: ExportHeaderCell[][] = [];
  for (let level = 0; level < depth; level++) {
    const row: ExportHeaderCell[] = [];
    let i = 0;
    while (i < columns.length) {
      const c = columns[i] as GridExportColumn<Row>;
      const path = c.column.path;
      if (level === path.length - 1 || (path.length === 0 && level === 0)) {
        row.push(Object.freeze({ text: c.headerText, columnId: c.columnId, colIndex: i, colSpan: 1, rowSpan: depth - level, leaf: true, textAlign: alignOf(c.column.def.headerAlign ?? c.column.def.align) }));
        i++;
        continue;
      }
      if (level >= path.length) {
        i++;
        continue;
      }
      const groupId = path[level] as ColumnId;
      let j = i + 1;
      while (j < columns.length && zones[j] === zones[i] && (columns[j] as GridExportColumn<Row>).column.path[level] === groupId && (columns[j] as GridExportColumn<Row>).column.path.length - 1 > level) j++;
      const group = byId.get(groupId);
      row.push(Object.freeze({ text: group?.headerText ?? groupId, columnId: groupId, colIndex: i, colSpan: j - i, rowSpan: 1, leaf: false, textAlign: alignOf(group?.def.headerAlign ?? 'center') }));
      i = j;
    }
    rows.push(row);
  }
  return rows.map((r) => Object.freeze(r));
}

interface AggregateSource {
  readonly descriptors: readonly AggregateDescriptor[];
  /** Values for a group (g >= 0) or the totals (g = -1). */
  values(g: number): AggregateValues;
}

function formatAggregate<Row>(env: FormatEnvironment, cache: Map<string, (v: unknown) => string>, column: CompiledColumn<Row> | undefined, d: AggregateDescriptor, value: unknown): string {
  if (value === null || value === undefined) return '';
  const type = d.type;
  if (d.format) {
    const valueType: ColumnType = type === 'count' || type === 'trueCount' || type === 'falseCount' || type === 'sum' || type === 'average' ? 'number' : (column?.type ?? 'number');
    const key = `${valueType}|${d.format}`;
    let f = cache.get(key);
    if (!f) {
      f = createValueFormatter(describeFormat(d.format, valueType, env.warn, d.columnId), valueType, env);
      cache.set(key, f);
    }
    return f(value);
  }
  if (type === 'count' || type === 'trueCount' || type === 'falseCount') return String(value);
  if (column && (type !== 'custom' || typeof value === 'number')) {
    if (!(column.type === 'boolean' && typeof value !== 'boolean')) return column.formatter(value, undefined as unknown as Row);
  }
  return typeof value === 'number' ? String(Math.round(value * 1e10) / 1e10) : String(value);
}

/**
 * Builds the export model from a module context. For renderers that load the
 * export code on demand: they register a context-only module up front (no
 * export code in the default bundle) and pass its context here later.
 */
export function createExportModelFromContext<Row>(ctx: ModuleContext<Row>, options: ExportModelOptions<Row> = {}): ExportModel<Row> {
  return buildExportModel(ctx, options);
}

function buildExportModel<Row>(ctx: ModuleContext<Row>, options: ExportModelOptions<Row>): ExportModel<Row> {
  const snapshot = ctx.getSnapshot();
  const columnSnapshot = ctx.getColumns();
  const columnsState = ctx.getModuleState<ColumnsState>('columns') ?? EMPTY_STATE;
  const columns = Object.freeze(exportColumns(columnSnapshot, columnsState, options));
  const built = headerRowsOf(columns, columnSnapshot.byId);
  const headerRows = Object.freeze(options.headerRows ? [...options.headerRows({ columns, headerRows: built })] : built);
  const scope: ExportScope = options.rows ? 'all' : (options.scope ?? 'filtered');
  const locale = snapshot.locale;
  const withAggregates = options.aggregates !== false;
  const captions = options.groups !== 'flatten';
  const env: FormatEnvironment = { getLocale: () => locale, timeZone: ctx.timeZone, currency: 'USD', cache: new Map(), warn: ctx.warn };
  const aggregateFormatters = new Map<string, (v: unknown) => string>();
  const columnIndex = new Map<ColumnId, number>();
  columns.forEach((c, i) => columnIndex.set(c.columnId, i));

  // --- rows ---------------------------------------------------------------
  const finalModel = ctx.getRows();
  const queryModel = ctx.getStageInput('page') ?? finalModel;
  let source: readonly Row[] = finalModel.source;
  let sourceIds: readonly RowId[] = finalModel.sourceIds;
  let order: Int32Array | null = null;
  let tree: GroupTree | null = null;
  let range: readonly [number, number] | null = null;
  let expanded: Uint8Array | null = null;
  let aggregateModel: RowModelSnapshot<Row> | null = null;
  let pageWise = false;
  // Tree mode: depth by source index and outline flags.
  let treeRows: TreeExportRows | null = null;

  const identityOrder = (n: number): Int32Array => {
    const o = new Int32Array(n);
    for (let i = 0; i < n; i++) o[i] = i;
    return o;
  };
  const dataOrder = (model: RowModelSnapshot<Row>): Int32Array => {
    // Detail rows wrap the structural view; data rows come from the view below them.
    const view = baseView(model.view);
    if (view instanceof GroupView) {
      // Every data row of the grouped order, collapsed groups included.
      return view.range ? view.tree.order.subarray(view.range[0], view.range[1]) : view.tree.order;
    }
    if (view) {
      const out: number[] = [];
      for (let i = 0; i < view.count; i++) {
        const s = view.sourceIndexAt(i);
        if (s >= 0) out.push(s);
      }
      return Int32Array.from(out);
    }
    return model.order ?? identityOrder(model.count);
  };
  // Pinned rows leave the order before the page window and the
  // groups; ungrouped exports put them first, as the grid shows them.
  const pinned = finalModel.pinned ?? null;
  const withPinned = (rows: Int32Array): Int32Array => {
    if (!pinned || pinned.length === 0) return rows;
    const out = new Int32Array(pinned.length + rows.length);
    out.set(pinned);
    out.set(rows, pinned.length);
    return out;
  };

  const treeView = options.rows ? null : treeViewOf(scope === 'page' ? finalModel : queryModel);
  if (options.rows) {
    source = options.rows;
    sourceIds = options.rows.map((_, i) => `__export:${i}`);
    order = identityOrder(options.rows.length);
  } else if (options.rowIds || scope === 'selected') {
    let ids: readonly RowId[] | null = options.rowIds ?? null;
    const filtered = withPinned(dataOrder(queryModel));
    if (ids) {
      const index = new Map<RowId, number>();
      for (let i = 0; i < sourceIds.length; i++) if (!index.has(sourceIds[i] as RowId)) index.set(sourceIds[i] as RowId, i);
      const out: number[] = [];
      for (const id of ids) {
        const s = index.get(id);
        if (s !== undefined) out.push(s);
      }
      order = Int32Array.from(out);
    } else {
      const selection = ctx.getModuleState<SelectionState>('selection');
      const rows = selection?.rows;
      const out: number[] = [];
      if (rows) {
        const explicit = rows.scope === 'explicit';
        for (let i = 0; i < filtered.length; i++) {
          const s = filtered[i] as number;
          if (rows.ids.has(sourceIds[s] as RowId) === explicit) out.push(s);
        }
      }
      order = Int32Array.from(out);
    }
    if (treeView) treeRows = treeView.exportRows(false, false);
  } else if (treeView) {
    // Tree pre-order (scope `all`: every source row, ignoring the query), with depths and outline flags.
    treeRows = treeView.exportRows(options.tree === 'all', scope === 'all');
    order = treeRows.order;
    if (scope !== 'all' && pinned && pinned.length > 0) order = withPinned(order);
  } else if (scope === 'all') {
    order = identityOrder(source.length);
  } else {
    const model = scope === 'page' ? finalModel : queryModel;
    const groups = (model.groups ?? null) as GroupTree | null;
    const view = baseView(model.view);
    if (groups && (!view || view instanceof GroupView)) {
      tree = groups;
      if (view instanceof GroupView) {
        range = scope === 'page' ? view.range : null;
        expanded = view.expanded;
      } else {
        const state = ctx.getModuleState<GroupingState>('grouping');
        expanded = resolveExpanded(groups, state?.expanded ?? {}, state?.defaultExpanded ?? true);
      }
      if (options.collapsedGroups !== 'exclude') expanded = null;
      aggregateModel = model;
      pageWise = scope === 'page';
    } else if (pinned && pinned.length > 0) {
      // The page model without views already starts with them; totals are computed over `order`.
      order = model === finalModel && !model.view ? dataOrder(model) : withPinned(dataOrder(model));
    } else {
      order = dataOrder(model);
      if (!view) {
        aggregateModel = model;
        pageWise = scope === 'page';
      }
    }
  }

  // --- aggregates -----------------------------------------------------------
  const descriptors = withAggregates ? snapshot.query.aggregates : EMPTY;
  let aggregates: AggregateSource | null = null;
  if (descriptors.length) {
    const result = (aggregateModel?.aggregates ?? null) as AggregateResult | null;
    if (aggregateModel && result) {
      const model = aggregateModel;
      const remoteTotals = snapshot.data.performed.includes('aggregate') ? snapshot.data.aggregates : null;
      aggregates = {
        descriptors,
        values: (g) => (g < 0 && remoteTotals ? remoteTotals : ((pageWise ? aggregatesForModel(model, g) : getAggregateValues(result, g)) ?? {})),
      };
    } else if (order) {
      const scopeState = ctx.getModuleState<AggregatesState>('aggregates');
      const computed = computeAggregates(
        Object.freeze({ source, sourceIds, order, count: order.length }),
        descriptors,
        columnSnapshot,
        scopeState?.scope ?? 'all',
        locale,
      );
      aggregates = { descriptors, values: (g) => (g < 0 ? getAggregateValues(computed, -1) : {}) };
    }
  }

  const placementLines = (placement: 'footer' | 'groupFooter' | 'groupCaption'): AggregateDescriptor[][] => {
    const perColumn: AggregateDescriptor[][] = columns.map(() => []);
    for (const d of descriptors) {
      if (!d.placement.includes(placement)) continue;
      const i = columnIndex.get(d.columnId);
      if (i !== undefined) (perColumn[i] as AggregateDescriptor[]).push(d);
    }
    const lines = Math.max(0, ...perColumn.map((l) => l.length));
    const out: AggregateDescriptor[][] = [];
    for (let line = 0; line < lines; line++) out.push(perColumn.map((l) => l[line] as AggregateDescriptor));
    return out;
  };
  const footerLines = aggregates ? placementLines('footer') : [];
  const groupFooterLines = aggregates && tree && captions ? placementLines('groupFooter') : [];
  const captionLine = aggregates && tree && captions ? (placementLines('groupCaption')[0] ?? null) : null;

  const aggregateCells = (line: readonly (AggregateDescriptor | undefined)[], g: number, placement: ExportAggregateContext['placement'], groupId: RowId | null): ExportAggregateCells => {
    const values = (aggregates as AggregateSource).values(g);
    return Object.freeze(
      line.map((d) => {
        if (!d) return null;
        const value = values[d.columnId]?.[d.type] ?? null;
        let text = formatAggregate(env, aggregateFormatters, columnSnapshot.byId.get(d.columnId), d, value);
        let style: ExportCellStyle | undefined;
        let typed: unknown = value;
        if (options.aggregate) {
          const before = text;
          const custom = options.aggregate({ placement, columnId: d.columnId, type: d.type, value, text, groupId });
          if (typeof custom === 'string') text = custom;
          else if (custom) {
            if (custom.text !== undefined) text = custom.text;
            style = custom.style;
          }
          // Replaced text wins over the typed value in every writer.
          if (text !== before) typed = text;
        }
        return Object.freeze(style ? { columnId: d.columnId, type: d.type, value: typed, text, style } : { columnId: d.columnId, type: d.type, value: typed, text });
      }),
    );
  };

  // --- plan -----------------------------------------------------------------
  let kinds = new Uint8Array(1024);
  let refs = new Int32Array(1024);
  let n = 0;
  const details = options.detail ? new Map<number, ExportDetail>() : null;
  const hierarchy = options.hierarchy ?? 'expanded';
  const push = (kind: number, ref: number): void => {
    if (n === kinds.length) {
      const k = new Uint8Array(n * 2);
      k.set(kinds);
      kinds = k;
      const r = new Int32Array(n * 2);
      r.set(refs);
      refs = r;
    }
    kinds[n] = kind;
    refs[n++] = ref;
  };
  const dataDepth = tree && captions ? tree.depth : 0;
  // Pinned rows leave the hierarchy and export at depth 0.
  const tr = treeRows as TreeExportRows | null;
  const pinnedSet = tr && pinned && pinned.length ? new Set(pinned) : null;
  const depthOf = tr
    ? (s: number): number => (pinnedSet?.has(s) ? 0 : (tr.depth[s] as number))
    : (): number => dataDepth;
  const pushData = (s: number): void => {
    push(DATA, s);
    if (details && hierarchy !== 'none') {
      const d = (options.detail as NonNullable<ExportModelOptions<Row>['detail']>)({ row: source[s] as Row, rowId: sourceIds[s] as RowId, depth: depthOf(s), hierarchy });
      if (d) {
        details.set(n, d);
        push(DETAIL, s);
      }
    }
  };

  let dataRowCount = 0;
  if (tree) {
    const t = tree;
    const { level, next, start, size } = t;
    const lo = range ? range[0] : 0;
    const hi = range ? range[1] : t.dataCount;
    const D = t.depth;
    const stack: number[] = [];
    const closeGroup = (g: number): void => {
      for (let line = 0; line < groupFooterLines.length; line++) push(FOOTER, g * 256 + line);
    };
    let g = 0;
    while (g < t.count) {
      while (stack.length && (next[stack[stack.length - 1] as number] as number) <= g) closeGroup(stack.pop() as number);
      const a = start[g] as number;
      const b = a + (size[g] as number);
      if (b <= lo || a >= hi) {
        g = next[g] as number;
        continue;
      }
      if (captions) push(CAPTION, g);
      if (expanded && !expanded[g]) {
        g = next[g] as number;
        continue;
      }
      if (captions) stack.push(g);
      if ((level[g] as number) === D - 1) {
        const from = a > lo ? a : lo;
        const to = b < hi ? b : hi;
        for (let p = from; p < to; p++) pushData(t.order[p] as number);
        dataRowCount += to - from;
      }
      g++;
    }
    while (stack.length) closeGroup(stack.pop() as number);
  } else if (order) {
    for (let i = 0; i < order.length; i++) pushData(order[i] as number);
    dataRowCount = order.length;
  }
  const rowCount = n;
  const planKinds = kinds;
  const planRefs = refs;

  // Remote lookup columns queue unresolved keys as cells are read and
  // batch them per microtask. XLSX / PDF writers await between rows, so
  // reading the cells here first queues every missing key in one load.
  const remoteLookups = columns.filter((c) => c.column.lookup !== undefined && !Array.isArray(c.column.lookup.data));
  if (remoteLookups.length) {
    for (let i = 0; i < rowCount; i++) {
      if (planKinds[i] !== DATA) continue;
      const row = source[planRefs[i] as number] as Row;
      for (const c of remoteLookups) c.column.accessor(row);
    }
  }

  // --- rows -----------------------------------------------------------------
  const captionOf = (g: number, index: number): ExportGroupRow => {
    const t = tree as GroupTree;
    const depth = t.level[g] as number;
    const levelInfo = t.levels[depth] as GroupTree['levels'][number];
    const column = columnSnapshot.byId.get(levelInfo.columnId);
    const value = groupValue(t, g);
    const code = groupCode(t, g);
    const formattedKey = levelInfo.label ? levelInfo.label(code) : column ? column.formatter(value, levelInfo.keys.sample[code] as Row) : String(value ?? '');
    let count = t.size[g] as number;
    if (range) {
      const a = Math.max(range[0], t.start[g] as number);
      const b = Math.min(range[1], (t.start[g] as number) + count);
      count = Math.max(0, b - a);
    }
    const headerText = column?.headerText ?? levelInfo.columnId;
    const key = jsonKey(value);
    let caption = `${headerText}: ${formattedKey} - ${count} ${count === 1 ? 'item' : 'items'}`;
    if (options.groupCaption) {
      const custom = options.groupCaption({ columnId: levelInfo.columnId, headerText, key, value, formattedKey, count, depth, caption });
      if (typeof custom === 'string') caption = custom;
    }
    const id = groupRowId(t, g);
    return Object.freeze({
      kind: 'group',
      index,
      id,
      depth,
      columnId: levelInfo.columnId,
      headerText,
      key,
      value,
      formattedKey,
      count,
      caption,
      aggregates: captionLine ? aggregateCells(captionLine, g, 'groupCaption', id) : EMPTY,
    });
  };

  const getRow = (index: number): ExportRow<Row> => {
    if (!(index >= 0 && index < rowCount)) throw new RangeError(`Export row ${index} is out of range (0..${rowCount - 1}).`);
    const kind = planKinds[index] as number;
    const ref = planRefs[index] as number;
    if (kind === DATA) {
      const r: { -readonly [K in keyof ExportDataRow<Row>]: ExportDataRow<Row>[K] } = { kind: 'data', index, id: sourceIds[ref] as RowId, row: source[ref] as Row, depth: depthOf(ref) };
      const flags = tr?.flags ? (tr.flags[ref] as number) : 0;
      if (flags & COLLAPSED) r.collapsed = true;
      if (flags & HIDDEN) r.hidden = true;
      return r;
    }
    if (kind === DETAIL) {
      return { kind: 'detail', index, id: `__detail:${sourceIds[ref] as RowId}`, parentId: sourceIds[ref] as RowId, row: source[ref] as Row, depth: depthOf(ref) + 1, detail: (details as Map<number, ExportDetail>).get(index) as ExportDetail };
    }
    if (kind === CAPTION) return captionOf(ref, index);
    const g = Math.floor(ref / 256);
    const line = ref % 256;
    const t = tree as GroupTree;
    const groupId = groupRowId(t, g);
    return Object.freeze({
      kind: 'groupFooter',
      index,
      id: `${GROUP_FOOTER_ID_PREFIX}${groupPathKey(t, g)}${line ? `#${line}` : ''}`,
      groupId,
      depth: t.level[g] as number,
      line,
      aggregates: aggregateCells(groupFooterLines[line] as AggregateDescriptor[], g, 'groupFooter', groupId),
    });
  };

  const footerRows: ExportAggregateRow[] = footerLines.map((line, i) =>
    Object.freeze({ kind: 'aggregate' as const, index: i, id: i ? `__agg#${i}` : '__agg', depth: 0 as const, line: i, aggregates: aggregateCells(line, -1, 'footer', null) }),
  );

  const hook = options.cell;
  const cell = (row: ExportDataRow<Row>, column: GridExportColumn<Row>): ExportCell => {
    const base: ExportCell = { value: column.value(row.row), text: column.text(row.row), type: column.type };
    if (!hook) return base;
    const o = hook({ row: row.row, rowId: row.id, column, cell: base });
    if (!o) return base;
    return {
      // A `text` patch without `value` replaces the typed value too, so typed writers (XLSX) write the text.
      value: 'value' in o ? o.value : o.text !== undefined ? o.text : base.value,
      text: o.text ?? base.text,
      type: column.type,
      ...(o.style ? { style: o.style } : {}),
      ...(o.formula !== undefined ? { formula: o.formula } : {}),
      ...(o.colSpan !== undefined ? { colSpan: o.colSpan } : {}),
      ...(o.rowSpan !== undefined ? { rowSpan: o.rowSpan } : {}),
      ...(o.image ? { image: o.image } : {}),
    };
  };

  let left = 0;
  while (left < columns.length && (columns[left] as GridExportColumn<Row>).freeze === 'left') left++;
  let right = 0;
  while (right < columns.length - left && (columns[columns.length - 1 - right] as GridExportColumn<Row>).freeze === 'right') right++;

  return Object.freeze({
    scope,
    columns,
    headerRows,
    rowCount,
    dataRowCount,
    detailRowCount: details ? details.size : 0,
    groupDepth: tree && captions ? tree.depth : 0,
    ...(tr ? { tree: { column: treeColumnOf(ctx, columns), depth: tr.maxDepth } } : {}),
    footerRows: Object.freeze(footerRows),
    frozen: Object.freeze({ left, right, top: 0 }),
    locale,
    direction: snapshot.direction,
    timeZone: ctx.timeZone,
    hasCellHook: hook !== undefined,
    getRow,
    *rows() {
      for (let i = 0; i < rowCount; i++) yield getRow(i);
    },
    cell,
  });
}
