// Per-DataGrid instance: engine, local data source, layout store, imperative API,
// DOM bindings, and delegated pointer/keyboard interactions. Created once per
// mounted DataGrid from its initial props; later prop changes are synced in
// effects. Nothing here runs during render except construction, which only
// allocates (no subscriptions, no browser APIs).

import type { DataGridAdaptiveController } from './adaptive-controller.js';
import {
  clampColumnWidth,
  columnZone,
  createFocusModule,
  createDataGridEngine,
  createSelectionModule,
  createLocalDataSource,
  isColumnVisible,
  previewColumnsCommand,
  rowIdFromKey,
  type ColumnId,
  type ColumnsCommand,
  type ColumnsState,
  type ColumnsStateInit,
  type CommandEvent,
  type CommandResult,
  type CompiledColumn,
  type DataGridCommand,
  type DataSource,
  type DataGridEngine,
  type DataGridModule,
  type DataGridOptions,
  type DataGridQueryInit,
  type DataGridWarning,
  type LocalDataSource,
  type RowId,
  type SelectionOptions,
  type SelectionState,
} from '@salmonui/data-grid/engine';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { DEV, warnOnce } from '@salmonui/core/internal/dev';
import { createReactDataGridApi } from './api.js';
import type { DataGridColumnDragEvent, DataGridColumnReorderEvent, DataGridColumnResizeEvent, DataGridColumnVisibilityChangeEvent } from './chrome-types.js';
import { ColumnResolver } from './children.js';
import { normalizeProps } from './normalize-props.js';
import { FEATURE_TRIGGERS } from './features/detect.js';
import { readFeatures } from '#data-grid-features';
import { featureSet, INERT_EDITING, INERT_ROW_DRAG, NO_FEATURES, type DataGridFeatureSet } from './features/inert.js';
import type { DataGridFeature, DataGridFeatureParts, DataGridFeatureUi, DataGridSpanPlanner, NormalizedProps } from './features/types.js';
import { gridEvent, type DataGridEventSource } from '@salmonui/core/internal/events';
import { DataGridInteraction, SELECTION_COLUMN_ID } from './interaction.js';
import { DataGridChrome } from './chrome.js';
import { DataGridInstanceDev } from './instance-dev.js';
import { commandColumnDefaults } from './editing/command-column.js';
import type { DataGridEditUi } from './editing/edit-host.js';
import type { DeferredModule } from './deferred-module.js';
import { canGroupColumn, toggleColumnGrouping } from './group-static.js';
import { createOutputContextModule, DataGridOutput } from './output.js';
import { fitWidthsOf, DataGridLayout, widthVar, writeLayoutVars, type ColumnLayout, type ColumnView, type LayoutConfig } from './layout.js';
import type { RowSpanPlans } from './Row.js';
import { spanFlags, type RowSpanInfo } from './spans.js';
import type { DataGridMergeCells } from './chrome-types.js';
import { DataGridQueryUi, nextSortCommand, queryDefaultQuery, queryEngineOptions, withQueryModules } from './query-config.js';
import type { DataGridRowDragUi } from './row-drag.js';
import { withUtilityColumns } from './utility-columns.js';
import { catalogOf, createDataGridText, localeTextOverrides, resolveDir, syncGlobalization, withLocaleTextModule, type DataGridText } from './locale-text.js';
import { DataGridStatePersistence } from './state-api.js';
import { resolveLocaleText } from '@salmonui/data-grid/engine/locale';
import { rowNumberColumnDef } from './row-number.js';
import { mountDataErrorEvents } from './data-errors.js';
import { DataGridDataUi } from './data-ui.js';
import type { DataGridApi, DataGridColumn, DataGridProps, DataGridSelection, DataGridVirtualization } from './types.js';

const noop = (): void => {};

function frozenCountValue(n: number | undefined): number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export const DEFAULT_ROW_HEIGHT = 36;
export const DEFAULT_HEADER_HEIGHT = 40;
export const DEFAULT_COLUMN_WIDTH = 160;
/** Indent per group level in px (theme-owned sizing; no size API). */
export const DEFAULT_INDENT_WIDTH = 28;
const HEADER_AFFORDANCE_WIDTH = 28;
const DRAG_THRESHOLD = 5;

/** Dev-only commit report passed to `globalThis.__SALMON_UI_DEVTOOLS__.onCommit`. */
export interface DataGridDevtoolsCommit {
  readonly gridId: string;
  readonly phase: 'mount' | 'update' | 'nested-update';
  readonly actualDuration: number;
  /** `rowId:columnId` of every body cell rendered in the commit. */
  readonly cells: readonly string[];
  readonly rows: readonly RowId[];
  readonly headers: readonly ColumnId[];
}

type AnyProps<Row> = DataGridProps<Row>;

function definedEntries<T extends object>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = v;
  return out as T;
}

function leafColumns<Row>(columns: readonly DataGridColumn<Row>[]): DataGridColumn<Row>[] {
  return columns.flatMap((c) => (c.columns?.length ? leafColumns(c.columns) : [c]));
}

/** `data` as rows (arrays) or a data source. */
export function isDataSource<Row>(data: AnyProps<Row>['data']): data is DataSource<Row> {
  return data !== undefined && !Array.isArray(data);
}

export function resolveGetRowId<Row>(props: AnyProps<Row>): { getRowId: (row: Row) => RowId; fallback: boolean } {
  const get = props.getRowId;
  if (get !== undefined) return { getRowId: (row) => String(get(row)), fallback: false };
  const keys = leafColumns(props.columns ?? []).filter((c) => c.primaryKey && c.field);
  if (keys.length) return { getRowId: rowIdFromKey<Row>(keys.map((c) => c.field as string)), fallback: false };
  return { getRowId: rowIdFromKey<Row>('id'), fallback: true };
}

/** A `type: 'selection'` column without a field or getter is the selection checkbox column. */
function isSelectionColumnDef<Row>(c: DataGridColumn<Row>): boolean {
  return c.id === SELECTION_COLUMN_ID || (c.type === 'selection' && c.field === undefined && c.valueGetter === undefined);
}

/** `selection` prop as an object (`true` and absent: defaults; `false`: null). */
export function selectionOf(value: boolean | DataGridSelection | undefined): DataGridSelection | null {
  if (value === false) return null;
  return value === true || value === undefined ? {} : value;
}

/** Engine selection options for the `selection` prop. */
function selectionOptions(selection: DataGridSelection | null, hasSelectionColumn: boolean): Omit<SelectionOptions, 'defaultSelectedRowIds'> {
  if (!selection) return { enabled: false };
  return definedEntries({
    enabled: true,
    // A selection column selects several rows unless `multiple: false` says otherwise.
    type: (selection.multiple ?? hasSelectionColumn) ? 'multiple' : 'single',
    mode: selection.mode,
    // `boxWithBorder` draws like `box`; the border is the selection outline.
    cellSelectionMode: selection.cellRange === undefined ? undefined : selection.cellRange === 'flow' ? 'flow' : 'box',
    columns: selection.columns,
    checkbox: hasSelectionColumn || undefined,
    checkboxOnly: selection.checkboxOnly,
    checkboxMode: selection.checkboxRowClick === undefined ? undefined : selection.checkboxRowClick === 'replace' ? 'resetOnRowClick' : 'default',
    toggle: selection.toggle,
    persist: selection.persistent,
    simpleMultiRow: selection.additive,
  }) as Omit<SelectionOptions, 'defaultSelectedRowIds'>;
}

function virtualizationOf(value: boolean | DataGridVirtualization | undefined): DataGridVirtualization {
  if (value === false) return { rows: false, columns: false };
  return value === true || value === undefined ? {} : value;
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export class DataGridInstance<Row> {
  readonly gridId: string;
  readonly engine: DataGridEngine<Row>;
  readonly source: LocalDataSource<Row> | null;
  readonly layout: DataGridLayout<Row>;
  readonly getRowId: (row: Row) => RowId;
  /** Resolved direction: the `dir` prop, or the inherited `dir` detected on mount. */
  rtl: boolean;
  /**
   * Engine warnings (already deduped by the engine) queued until after commit:
   * column compiles run during render, where `onWarning` must not be called.
   */
  private warnings: DataGridWarning[] = [];
  private warningsMounted = false;
  private warningsScheduled = false;
  /** Latest props (children resolved); written in a layout effect, read only by event handlers and effects. */
  props: AnyProps<Row>;
  /** Initial body height for SSR and the first client render; the layout store owns it afterwards. */
  readonly initialBodyHeight: number;

  /** @internal True when no getRowId and no primaryKey column name the row id (development warning). */
  readonly rowKeyFallback: boolean;
  private syncing = 0;
  /** @internal Source attributed to commands dispatched now (onBeforeCommand reads it). */
  pendingSource: DataGridEventSource | null = null;
  /** @internal */
  readonly columnResolver = new ColumnResolver();
  /** Selection column present in the definitions (checkbox selection). */
  private hasSelectionColumn = false;
  /** Column visibility / reorder before-events that passed, awaiting the after-event. */
  private pendingColumnEvent: { readonly kind: 'visibility' | 'reorder'; readonly event: DataGridColumnVisibilityChangeEvent | DataGridColumnReorderEvent } | null = null;
  readonly interaction: DataGridInteraction<Row>;
  /** Row drag and drop: the `rowDrag` feature's host, else the inert host. */
  readonly rowDragUi: DataGridRowDragUi<Row>;
  /** Column chrome: overlays, menus, toolbar, UI commands. */
  readonly chrome: DataGridChrome<Row>;
  /**
   * Adaptive UI controller: mode projection of the container width, adaptive sheets, touch.
   * Set at creation by the `adaptive` render feature; null without it.
   */
  adaptive: DataGridAdaptiveController<Row> | null = null;
  /** Export, print, and their busy state. */
  readonly output: DataGridOutput<Row>;

  root: HTMLDivElement | null = null;
  /** The group drop area: a sibling before the root (a grid may own rows and rowgroups only). */
  groupPanel: HTMLDivElement | null = null;
  private viewport: HTMLDivElement | null = null;
  private body: HTMLDivElement | null = null;
  private rowsElement: HTMLDivElement | null = null;
  private indicator: HTMLDivElement | null = null;
  private preview: HTMLDivElement | null = null;
  /** The grid's one ResizeObserver: the viewport plus, in measured-height mode, every rendered row. */
  private observer: ResizeObserver | null = null;
  private wheelAttached = false;
  private suppressClick = false;
  private tooltipCell: Element | null = null;
  focusAfterCommit: ColumnId | null = null;

  /**
   * Hydration reads (`useSyncExternalStore` getServerSnapshot): the first
   * value read per key is kept until the grid mounts, so an engine change that
   * lands while React is still hydrating never reaches hydrating markup.
   * Released on mount; getServerSnapshot is not called after hydration.
   */
  private serverReads: Map<string, unknown> | null = new Map();

  /**
   * Render features resolved before creation (`features` prop and the
   * registry): their modules, engine options, default
   * query, controllers and API sections compose in one loop below; their
   * parts and selectors fall back to the inert values of `features/inert.ts`.
   */
  readonly features: DataGridFeatureSet;
  private readonly featureUis: readonly DataGridFeatureUi[];
  /** @internal The `features` prop at creation. */
  readonly initialProvided: readonly DataGridFeature[] | undefined;
  /** @internal Development only (null in production builds): render records and development warnings. */
  readonly dev: DataGridInstanceDev<Row> | null;
  /**
   * Span planner of the `spans` feature: the
   * creation one, or the one installed after spans appear on the client
   * (`syncProps`). Null: nothing spans, the default path.
   */
  private spanPlanner: DataGridSpanPlanner | null = null;
  private spansRequested = false;
  /** The toolbar part: the creation one, or the one installed after a toolbar appears on the client. */
  private toolbarPart: DataGridFeatureParts['Toolbar'] = null;
  private toolbarRequested = false;

  constructor(rawProps: AnyProps<Row>, reactId: string, features: readonly DataGridFeature[] = NO_FEATURES) {
    const props = normalizeProps(rawProps);
    this.props = props;
    this.features = featureSet(features);
    this.spanPlanner = this.features.parts.spans;
    this.toolbarPart = this.features.parts.Toolbar;
    this.initialProvided = rawProps.features;
    this.dev = DEV ? new DataGridInstanceDev(this, props) : null;
    const featureProps = props as NormalizedProps;
    this.gridId = props.id ?? `salmon-data-grid${reactId.replace(/[^\w-]/g, '')}`;
    const dir = resolveDir(props.dir, props.locale);
    this.rtl = dir === 'rtl';
    this.columnText = createDataGridText(resolveLocaleText(localeTextOverrides(props.localeText)), props.locale ?? 'en-US');
    const { getRowId, fallback } = resolveGetRowId(props);
    this.getRowId = getRowId;
    this.rowKeyFallback = fallback;
    const data = props.data;
    this.source = isDataSource(data) ? null : createLocalDataSource(data ?? [], { getRowId });
    const columns = this.resolveColumns(props).columns;
    const frozenCount = this.frozenCountOf(props);
    const initialColumnState = definedEntries({
      frozenCount: frozenCount.left || frozenCount.right ? frozenCount : undefined,
    }) as ColumnsStateInit;
    const rowHeight = props.rowHeight ?? DEFAULT_ROW_HEIGHT;
    const measureRows = props.estimatedRowHeight !== undefined || props.textWrap === true || props.textWrap === 'content' || props.textWrap === 'both' || props.renderRow !== undefined;
    // Stand-ins of lazily loaded feature modules (editing, row drag) until their chunks load.
    const deferred: DeferredModule<unknown>[] = [];
    const userModules = withLocaleTextModule((withQueryModules(props, props.modules) ?? []) as readonly DataGridModule<Row>[]);
    const modules: DataGridModule<Row, any, any>[] = [...userModules];
    // Render feature modules after the app's (a module the app passes wins).
    let featureQuery: DataGridQueryInit | undefined;
    const featureOptions: Record<string, unknown> = {};
    for (const feature of features) {
      for (const m of feature.modules?.(featureProps, { modules: modules as readonly DataGridModule<unknown>[], deferred }) ?? []) {
        if (!modules.some((x) => x.name === m.name)) modules.push(m as DataGridModule<Row, any, any>);
      }
      const query = feature.defaultQuery?.(featureProps);
      if (query) featureQuery = { ...featureQuery, ...query };
      Object.assign(featureOptions, feature.engineOptions?.(featureProps, () => this.props as NormalizedProps));
    }
    if (!userModules.some((m) => m.name === 'selection')) modules.push(createSelectionModule<Row>() as DataGridModule<Row, any, any>);
    if (!userModules.some((m) => m.name === 'focus')) modules.push(createFocusModule<Row>() as DataGridModule<Row, any, any>);
    // Export and print build their model through this context-only module (output.ts).
    modules.push(createOutputContextModule<Row>());
    const selection = selectionOf(props.selection);
    const options = definedEntries({
      id: this.gridId,
      getRowId,
      columns,
      dataSource: (isDataSource(data) ? data : this.source) as DataSource<Row>,
      modules,
      selection: { ...selectionOptions(selection, this.hasSelectionColumn), ...(selection?.rowIds ? { defaultSelectedRowIds: [...selection.rowIds] } : {}) },
      defaultQuery: queryDefaultQuery(props, featureQuery),
      ...queryEngineOptions(props),
      ...featureOptions,
      locale: props.locale,
      timeZone: props.timeZone,
      currency: props.currency,
      direction: dir,
      localeText: props.localeText ? localeTextOverrides(props.localeText) : undefined,
      rowHeight,
      estimatedRowHeight: props.estimatedRowHeight,
      headerRowHeight: props.headerHeight,
      defaultColumnWidth: props.defaultColumnWidth,
      initialRows: props.initialRows,
      initialColumns: props.initialColumns,
      initialColumnState,
      onWarning: (warning: DataGridWarning) => this.queueWarning(warning),
      // Span-aware focus, selection, and editing; read lazily, so it sees the engine and current props.
      cellSpans: Object.assign((rowIndex: number, columnIndex: number) => this.spanPlanner?.block(this, rowIndex, columnIndex) ?? null, { active: () => this.spansActive() }),
      dev: DEV,
      // Dev tooling (initial only): off, the engine keeps no log and no counters.
      recordCommands: props.recordCommands || undefined,
      instrument: props.instrument || undefined,
      // Construction runs during render (also renders React discards): the
      // source is subscribed and read in mount(), never here.
      deferDataSource: true,
    }) as DataGridOptions<Row>;
    this.engine = createDataGridEngine(options);
    const autoHeight = props.height === 'auto';
    const virtualization = virtualizationOf(props.virtualization);
    const config: LayoutConfig<Row> = {
      rowHeight,
      headerHeight: props.headerHeight ?? DEFAULT_HEADER_HEIGHT,
      defaultColumnWidth: props.defaultColumnWidth ?? DEFAULT_COLUMN_WIDTH,
      getRowHeight: props.getRowHeight ?? null,
      measureRows,
      estimatedRowHeight: props.estimatedRowHeight ?? rowHeight,
      virtualRows: !autoHeight && virtualization.rows !== false,
      virtualColumns: virtualization.columns !== false,
      rowOverscan: virtualization.rowOverscan ?? 5,
      columnOverscan: virtualization.columnOverscan ?? 2,
      maxScrollHeight: virtualization.maxScrollHeight ?? 15_000_000,
      initialRows: props.initialRows ?? 20,
      initialColumns: props.initialColumns ?? 20,
      indentWidth: DEFAULT_INDENT_WIDTH,
    };
    this.layout = new DataGridLayout(this.engine, config);
    this.layout.setResizeMode(props.resizeMode);
    this.initialBodyHeight = this.layout.getServerScrollHeight();
    this.sortable = this.engine.getModuleState<{ enabled: boolean }>('sort')?.enabled === true;
    this.groupable = this.engine.getModuleState('grouping') !== undefined;
    this.interaction = new DataGridInteraction(this);
    this.rowDragUi = INERT_ROW_DRAG as unknown as DataGridRowDragUi<Row>;
    this.chrome = new DataGridChrome(this);
    this.query = new DataGridQueryUi(this);
    this.editing = INERT_EDITING as unknown as DataGridEditUi<Row>;
    this.persistence = new DataGridStatePersistence(this);
    this.output = new DataGridOutput(this);
    this.dataUi = new DataGridDataUi(this);
    const featureUis: DataGridFeatureUi[] = [];
    for (const feature of features) {
      const ui = feature.createUi?.(this as unknown as DataGridInstance<unknown>, { deferred });
      if (!ui) continue;
      // The stored state is restored before the other features mount, so a `paging.syncUrl` page wins over it.
      if (feature.name === 'persistState') featureUis.unshift(ui);
      else featureUis.push(ui);
      // The hosts the view, the API and the lazy chunks read (inert without the feature).
      if (feature.name === 'editing') this.editing = ui as DataGridEditUi<Row>;
      else if (feature.name === 'rowDrag') this.rowDragUi = ui as DataGridRowDragUi<Row>;
    }
    this.featureUis = featureUis;
    // Feature API sections replace the inert methods before the API is frozen.
    this.api = createReactDataGridApi(this, featureUis.map((ui) => ui.api));
    this.output.register(this.api);
  }

  /** State API and `persistState` binding. */
  readonly persistence: DataGridStatePersistence<Row>;
  /** Loading indicator, `refresh()`, row and cell click events, silent data updates. */
  readonly dataUi: DataGridDataUi<Row>;
  /** Text for column definitions (selection column header); follows `localeText` and `locale`. */
  private columnText: DataGridText;
  private textCache: DataGridText | null = null;

  /**
   * Text in the engine's current catalog and locale, for event handlers,
   * announcements, and imperative labels. Render code reads
   * `useDataGridRender().text`, which re-renders on a catalog or locale change.
   */
  get text(): DataGridText {
    const snap = this.engine.getSnapshot();
    const catalog = catalogOf(snap as never);
    const cached = this.textCache;
    if (cached && cached.catalog === catalog && cached.locale === snap.locale) return cached;
    return (this.textCache = createDataGridText(catalog, snap.locale));
  }

  /** The `dir` prop resolved against `locale` (`'auto'`); undefined when inherited. */
  resolvedDir(props: AnyProps<Row>): 'ltr' | 'rtl' | undefined {
    return resolveDir(props.dir, props.locale);
  }

  /** `pinnedColumns` as engine counts. */
  private frozenCountOf(props: AnyProps<Row>): { left: number; right: number } {
    return { left: frozenCountValue(props.pinnedColumns?.start), right: frozenCountValue(props.pinnedColumns?.end) };
  }

  /** Selection column defaults (header text, width, no sort/filter/group/edit/resize/reorder, locked, not hideable). */
  private prepareColumn = (column: DataGridColumn<Row>): DataGridColumn<Row> => {
    if (column.type === 'rowNumber' && !column.columns?.length) return rowNumberColumnDef(column, this.columnText('rowNumberColumnHeader'));
    if (!column.columns?.length && column.commands?.length) return commandColumnDefaults(column);
    if (column.columns?.length || !isSelectionColumnDef(column)) return column;
    return {
      id: SELECTION_COLUMN_ID,
      header: this.columnText('selectionColumnHeader'),
      width: 44,
      minWidth: 44,
      align: 'center',
      sortable: false,
      filterable: false,
      searchable: false,
      groupable: false,
      editable: false,
      resizable: false,
      reorderable: false,
      lockPosition: true,
      hideable: false,
      ...column,
    };
  };

  /** Stable engine definitions for `props.columns`, plus the runtime commands of reactive column fields. */
  private resolveColumns(props: AnyProps<Row>): { columns: readonly DataGridColumn<Row>[]; commands: readonly DataGridCommand[]; renderChanged: readonly ColumnId[] } {
    const resolved = this.columnResolver.resolve(withUtilityColumns(props, props.columns ?? [], this.features.parts) as readonly DataGridColumn<unknown>[], this.prepareColumn as (c: DataGridColumn<unknown>) => DataGridColumn<unknown>);
    this.hasSelectionColumn = leafColumns(resolved.columns as readonly DataGridColumn<Row>[]).some(isSelectionColumnDef);
    return resolved as { columns: readonly DataGridColumn<Row>[]; commands: readonly DataGridCommand[]; renderChanged: readonly ColumnId[] };
  }

  // Render-only column fields (`renderCell`, `cellClassName`, ...) change
  // without a recompile: a per-column key re-renders that column's mounted
  // cells, and one grid-level version re-renders the body and header (rows
  // and the header pass the keys down). Null until the first such change, so
  // the default path reads one field.
  private columnRenderKeys: Map<ColumnId, number> | null = null;
  private columnRenderVersion = 0;
  private readonly columnRenderListeners = new Set<() => void>();

  readonly subscribeColumnRender = (listener: () => void): (() => void) => {
    this.columnRenderListeners.add(listener);
    return () => this.columnRenderListeners.delete(listener);
  };

  readonly getColumnRenderVersion = (): number => this.columnRenderVersion;

  /** `renderKey` of a column's cells: undefined until one of its render fields changed. */
  readonly renderKeyOf = (columnId: ColumnId): number | undefined => this.columnRenderKeys?.get(columnId);

  private bumpColumnRender(ids: readonly ColumnId[]): void {
    const keys = (this.columnRenderKeys ??= new Map());
    const version = ++this.columnRenderVersion;
    for (const id of ids) keys.set(id, version);
    for (const listener of this.columnRenderListeners) listener();
  }

  setDirection(direction: 'ltr' | 'rtl'): void {
    this.rtl = direction === 'rtl';
    // The engine direction drives focus moves and `snapshot.direction`.
    this.engine.setLocale({ direction });
  }

  readonly api: DataGridApi<Row>;
  /** Editing UI: editors, dialog, command column, keys, events, guard; the `editing` feature's host, else the inert host. */
  readonly editing: DataGridEditUi<Row>;
  /** Sorting, filtering, searching, and paging props, events, and pager keys. */
  readonly query: DataGridQueryUi<Row>;
  /** An enabled `sort` module is registered: headers dispatch `sort.toggle` and expose `aria-sort`. */
  readonly sortable: boolean;
  /** The `grouping` module is registered: the group panel, drag-to-group, and group keys are active. */
  readonly groupable: boolean;

  /** Cell span plans of one rendered row; null without spans. */
  /**
   * Column `colSpan` / `rowSpan` and the grid `mergeCells` (pass the render
   * value: `instance.props` is synced only after the render). The default
   * path is one cached flag check per row.
   */
  spanPlans(
    row: Row,
    rowId: RowId,
    rowIndex: number,
    view: ColumnView<Row>,
    rowSpans: RowSpanInfo | null = null,
    merge: DataGridMergeCells | undefined = this.props.mergeCells,
  ): RowSpanPlans<Row> | null {
    const planner = this.spanPlanner;
    if (!planner) return null;
    const flags = spanFlags(this.engine.getSnapshot().columns.visible, merge);
    if (!flags.col && !rowSpans) return null;
    const columns = this.engine.getSnapshot().columns;
    // Clamped spans are collected, not warned about: renders stay pure and
    // the row reports them from a layout effect (`warnSpanEdges`).
    let clamped: ColumnId[] | undefined;
    const onClamp = (id: ColumnId): void => {
      (clamped ??= []).push(id);
    };
    // Row spans over per-row heights (a `rowHeight` function) are sized from the row metrics.
    const config = this.layout.config;
    const metrics = rowSpans && config.getRowHeight && !config.measureRows ? this.layout.getRowMetrics() : null;
    const plan = (zone: readonly CompiledColumn<Row>[], start: number, end: number) =>
      planner.planZone(this.engine, merge, flags, row, rowId, rowIndex, zone, start, end, rowSpans, onClamp, metrics);
    const left = plan(columns.left, 0, columns.left.length);
    const center = plan(columns.center, view.centerStart, view.centerStart + view.center.length);
    const right = plan(columns.right, 0, columns.right.length);
    if (!left && !center && !right) return null;
    return clamped ? { left, center, right, clamped } : { left, center, right };
  }

  /** The span planner the body renders with (`useSyncExternalStore` over the column render version). */
  readonly getSpanPlanner = (): DataGridSpanPlanner | null => this.spanPlanner;
  /** The server and hydration snapshot: the creation planner (a late one is client-only). */
  readonly getServerSpanPlanner = (): DataGridSpanPlanner | null => this.features.parts.spans;

  private spansActive(): boolean {
    if (!this.spanPlanner) return false;
    const flags = spanFlags(this.engine.getSnapshot().columns.visible, this.props.mergeCells);
    return flags.col || flags.row;
  }

  /**
   * Late enable of `spans`: spans that appear
   * after creation load the feature through the registry on the client and
   * install it, then bump the column render version so the body, rows and
   * cells re-render once. Until then the grid renders as if nothing spans.
   */
  private enableSpansLate(): void {
    if (this.spansRequested) return;
    this.spansRequested = true;
    const install = (list: readonly DataGridFeature[]): void => {
      const planner = list.find((f) => f.name === 'spans')?.parts?.spans;
      if (!planner || this.spanPlanner || this.engine.disposed) return;
      this.spanPlanner = planner;
      this.bumpColumnRender([]);
    };
    const read = readFeatures(['spans'], this.initialProvided);
    if ('then' in read) {
      read.then(install, () => {
        this.spansRequested = false; // the next column change retries
      });
    } else install(read);
  }

  /** The toolbar part the view renders (`useSyncExternalStore` over the column render version). */
  readonly getToolbarPart = (): DataGridFeatureParts['Toolbar'] => this.toolbarPart;
  /** The server and hydration snapshot: the creation part (a late one is client-only). */
  readonly getServerToolbarPart = (): DataGridFeatureParts['Toolbar'] => this.features.parts.Toolbar;

  /**
   * Late enable of `toolbar`, as for `spans`: a
   * toolbar that appears after creation loads the feature through the
   * registry on the client, installs its part and bumps the column render
   * version so the view re-renders once. Until then no toolbar renders.
   */
  private enableToolbarLate(): void {
    if (this.toolbarRequested) return;
    this.toolbarRequested = true;
    const install = (list: readonly DataGridFeature[]): void => {
      const part = list.find((f) => f.name === 'toolbar')?.parts?.Toolbar;
      if (!part || this.toolbarPart || this.engine.disposed) return;
      this.toolbarPart = part;
      this.bumpColumnRender([]);
    };
    const read = readFeatures(['toolbar'], this.initialProvided);
    if ('then' in read) {
      read.then(install, () => {
        this.toolbarRequested = false; // the next props change retries
      });
    } else install(read);
  }

  /** Dev warning for spans clamped at a pin edge or the last column; called from a layout effect. */
  warnSpanEdges(clamped: readonly ColumnId[]): void {
    // Development only: production builds fold this to an empty body.
    if (!DEV) return;
    const gridId = this.gridId;
    for (const id of clamped) {
      warnOnce(`${gridId}:span-edge:${id}`, `DataGrid "${gridId}": the colSpan of column "${id}" crosses a pin edge or the last column and is clamped.`);
    }
  }

  getRowsElement(): HTMLDivElement | null {
    return this.rowsElement;
  }

  /** getServerSnapshot for fine-grained reads: the value the server rendered for `key`, frozen until mount. */
  serverRead<T>(key: string, read: () => T): T {
    const reads = this.serverReads;
    if (!reads) return read();
    if (reads.has(key)) return reads.get(key) as T;
    const value = read();
    reads.set(key, value);
    return value;
  }

  // ------------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------------

  /** Client-only setup after the first commit. Returns the teardown. */
  mount(): () => void {
    this.serverReads = null;
    const viewport = this.viewport;
    const offCommands = this.engine.onBeforeCommand((event) => this.beforeCommand(event.command));
    const offAfterCommands = this.engine.onCommand((event) => this.afterCommand(event));
    const offQuery = this.query.mount();
    let offReady = (): void => {};
    const offBefore = (): void => {
      offReady();
      offCommands();
      offAfterCommands();
      offQuery();
      this.output.dispose();
    };
    const offInteraction = this.interaction.mount();
    if (DEV) this.dev?.mountChecks();
    this.warningsMounted = true;
    this.flushWarnings();
    const offWarnings = (): void => {
      this.warningsMounted = false;
    };
    // Before connect: a read that fails while connecting reports `onError` too.
    const offDataErrors = mountDataErrorEvents(this);
    // Data-source side effects (subscribe, loads, user callbacks) start here, after commit.
    const offSource = this.engine.connect();
    const offFeatures = this.featureUis.map((ui) => ui.mount?.() ?? noop);
    const offUrl = (): void => {
      for (const off of offFeatures) off();
    };
    const offDataUi = this.dataUi.mount(this.body);
    // With `editing`, after the editing chunk loaded (edit-host.ts), so the editing methods work in onReady.
    offReady = this.editing.whenReady(() => this.props.onReady?.(this.api));
    if (!viewport) {
      return () => {
        offDataUi();
        offUrl();
        offDataErrors();
        offSource();
        offBefore();
        offInteraction();
        offWarnings();
      };
    }
    const onScroll = (): void => {
      this.layout.setScroll(viewport.scrollTop, this.rtl ? -viewport.scrollLeft : viewport.scrollLeft);
    };
    viewport.addEventListener('scroll', onScroll, { passive: true });
    this.layout.setViewportSize(viewport.clientWidth, viewport.clientHeight);
    this.getObserver().observe(viewport);
    this.fitAutoColumns();
    this.updateWheelListener();
    return () => {
      offDataUi();
      offUrl();
      offDataErrors();
      offSource();
      offBefore();
      offInteraction();
      offWarnings();
      viewport.removeEventListener('scroll', onScroll);
      this.observer?.disconnect();
      this.observer = null;
      this.detachWheel();
    };
  }

  /** @internal */
  queueWarning(warning: DataGridWarning): void {
    this.warnings.push(warning);
    // After mount, warnings raised outside a commit (event handlers, async loads) flush on a microtask.
    if (this.warningsMounted && !this.warningsScheduled) {
      this.warningsScheduled = true;
      queueMicrotask(() => {
        this.warningsScheduled = false;
        if (this.warningsMounted) this.flushWarnings();
      });
    }
  }

  /** Delivers queued engine warnings to `onWarning` (else the console); called after commit. */
  flushWarnings(): void {
    if (!this.warnings.length) return;
    const queued = this.warnings;
    this.warnings = [];
    const handler = this.props.onWarning;
    for (const warning of queued) {
      if (handler) handler(warning);
      else (globalThis as { console?: { warn?(...args: unknown[]): void } }).console?.warn?.(`[salmonui/grid] ${warning.message} (${warning.code}, grid "${warning.gridId}")`);
    }
  }

  /** Syncs prop changes into the engine; called from a layout effect. Options are compared with the previous prop value. */
  syncProps(rawProps: AnyProps<Row>): void {
    const prev = this.props;
    const props = normalizeProps(rawProps);
    this.props = props;
    // Text and locale first: the selection column header is a definition.
    this.withSync(() => syncGlobalization(this.engine, prev, props, undefined));
    if (this.columnText !== this.text) {
      this.columnText = this.text;
      this.columnResolver.invalidate();
    }
    this.layout.setResizeMode(props.resizeMode);
    this.interaction.syncKeyBindings(prev.keyBindings, props.keyBindings);
    const dir = this.resolvedDir(props);
    if (dir !== undefined && dir !== this.resolvedDir(prev) && (dir === 'rtl') !== this.rtl) this.setDirection(dir);
    const resolved = this.resolveColumns(props);
    this.engine.setColumns(resolved.columns);
    if (resolved.renderChanged.length) this.bumpColumnRender(resolved.renderChanged);
    if (resolved.commands.length) this.withSync(() => {
      for (const command of resolved.commands) this.engine.dispatch(command);
    });
    if (this.source && props.data !== prev.data && !isDataSource(props.data)) this.source.setRows(props.data ?? []);
    if (DEV) this.dev?.checkTemplateIdentity(prev, props);
    this.query.sync(prev, props);
    for (const ui of this.featureUis) ui.sync?.(props as NormalizedProps, prev as NormalizedProps);
    if (!this.spanPlanner && FEATURE_TRIGGERS.spans?.(props as NormalizedProps)) this.enableSpansLate();
    if (!this.toolbarPart && FEATURE_TRIGGERS.toolbar?.(props as NormalizedProps)) this.enableToolbarLate();
    if (DEV) this.dev?.checkFeatureSet(rawProps, props);
    this.dataUi.sync();
    if (props.pinnedColumns?.start !== prev.pinnedColumns?.start || props.pinnedColumns?.end !== prev.pinnedColumns?.end) {
      const next = this.frozenCountOf(props);
      const current = this.columnsState().frozenCount;
      if (next.left !== current.left || next.right !== current.right) this.withSync(() => this.engine.dispatch({ type: 'columns.setFrozenCount', left: next.left, right: next.right }));
    }
    const selection = selectionOf(props.selection);
    const previousSelection = selectionOf(prev.selection);
    this.withSync(() => {
      const options = selectionOptions(selection, this.hasSelectionColumn);
      if (JSON.stringify(options) !== JSON.stringify(selectionOptions(previousSelection, this.hasSelectionColumn))) {
        this.engine.dispatch({ type: 'selection.setOptions', options });
      }
      const ids = selection?.rowIds;
      if (ids && !(previousSelection?.rowIds && sameList(previousSelection.rowIds, ids))) {
        const state = this.engine.getModuleState<SelectionState>('selection');
        const same = state !== undefined && state.rows.scope === 'explicit' && state.rows.ids.size === ids.length && ids.every((id) => state.rows.ids.has(id));
        if (state && !same) this.engine.dispatch({ type: 'selection.selectRows', rowIds: [...ids] });
      }
    });
  }

  /** Dispatches a prop-sync command: no events. */
  syncDispatch(command: DataGridCommand): CommandResult {
    let result: CommandResult = { status: 'applied' };
    this.withSync(() => {
      result = this.engine.dispatch(command);
    });
    return result;
  }

  isSyncing(): boolean {
    return this.syncing > 0;
  }

  /** Input source of the command being dispatched (`api` outside `dispatchFrom`). */
  currentSource(): DataGridEventSource {
    return this.pendingSource ?? 'api';
  }

  private withSync(run: () => void): void {
    this.syncing++;
    try {
      this.engine.batch(run);
    } finally {
      this.syncing--;
    }
  }

  private columnsState(): ColumnsState {
    return this.engine.getModuleState<ColumnsState>('columns') as ColumnsState;
  }

  /** Column visibility and reorder before-events; selection before-events (interaction). */
  private beforeCommand(command: DataGridCommand): boolean | void {
    if (this.syncing) return;
    if (command.type.startsWith('selection.')) {
      return this.interaction.beforeSelectionCommand(command, this.pendingSource ?? 'api');
    }
    if (!command.type.startsWith('columns.')) return;
    const p = this.props;
    const wantsVisibility = p.onBeforeColumnVisibilityChange !== undefined || p.onColumnVisibilityChange !== undefined;
    const wantsReorder = command.type === 'columns.move' && (p.onBeforeColumnReorder !== undefined || p.onColumnReorder !== undefined);
    if (!wantsVisibility && !wantsReorder) return;
    const snap = this.engine.getSnapshot();
    const state = this.columnsState();
    const next = previewColumnsCommand(snap.columns, state, command as unknown as ColumnsCommand);
    if (!next || next === state) return;
    const source = this.pendingSource ?? 'api';
    if (wantsReorder) {
      const field = String(command['columnId']);
      const fromIndex = snap.columns.visible.findIndex((c) => c.columnId === field);
      const event = gridEvent<DataGridColumnReorderEvent>('beforeColumnReorder', source, { field, fromIndex, toIndex: Number(command['toIndex']) });
      p.onBeforeColumnReorder?.(event);
      if (event.defaultPrevented) return false;
      this.pendingColumnEvent = { kind: 'reorder', event };
      return;
    }
    if (next.visibility === state.visibility) return;
    const hidden: string[] = [];
    const shown: string[] = [];
    for (const col of snap.columns.leaves) {
      const was = isColumnVisible(col, state);
      const now = isColumnVisible(col, next);
      if (was && !now) hidden.push(col.columnId);
      else if (!was && now) shown.push(col.columnId);
    }
    if (!hidden.length && !shown.length) return;
    const event = gridEvent<DataGridColumnVisibilityChangeEvent>('beforeColumnVisibilityChange', source, { hidden, shown });
    p.onBeforeColumnVisibilityChange?.(event);
    if (event.defaultPrevented) return false;
    this.pendingColumnEvent = { kind: 'visibility', event };
  }

  private afterCommand(event: CommandEvent): void {
    const pending = this.pendingColumnEvent;
    if (event.command.type.startsWith('selection.')) {
      this.interaction.afterSelectionCommand(event);
      return;
    }
    if (!pending || !event.command.type.startsWith('columns.')) return;
    this.pendingColumnEvent = null;
    if (event.result.status !== 'applied') return;
    const p = this.props;
    if (pending.kind === 'reorder') {
      const e = pending.event as DataGridColumnReorderEvent;
      p.onColumnReorder?.(gridEvent<DataGridColumnReorderEvent>('columnReorder', e.source, { field: e.field, fromIndex: e.fromIndex, toIndex: e.toIndex }));
    } else {
      const e = pending.event as DataGridColumnVisibilityChangeEvent;
      p.onColumnVisibilityChange?.(gridEvent<DataGridColumnVisibilityChangeEvent>('columnVisibilityChange', e.source, { hidden: e.hidden, shown: e.shown }));
    }
  }

  /** Dispatches a command attributed to a user input source. */
  dispatchFrom(source: DataGridEventSource, command: DataGridCommand): CommandResult {
    this.pendingSource = source;
    try {
      return this.engine.dispatch(command);
    } finally {
      this.pendingSource = null;
    }
  }

  // ------------------------------------------------------------------------
  // DOM refs (stable callbacks)
  // ------------------------------------------------------------------------

  readonly setRoot = (el: HTMLDivElement | null): void => {
    this.root = el;
  };

  readonly setViewport = (el: HTMLDivElement | null): void => {
    this.viewport = el;
    this.layout.attach(this.viewport, this.body, this.rowsElement);
  };

  readonly setBody = (el: HTMLDivElement | null): void => {
    this.body = el;
    this.layout.attach(this.viewport, this.body, this.rowsElement);
  };

  readonly setRows = (el: HTMLDivElement | null): void => {
    this.rowsElement = el;
    this.layout.attach(this.viewport, this.body, this.rowsElement);
  };

  readonly setGroupPanel = (el: HTMLDivElement | null): void => {
    this.groupPanel = el;
  };

  readonly setIndicator = (el: HTMLDivElement | null): void => {
    this.indicator = el;
  };

  readonly setPreview = (el: HTMLDivElement | null): void => {
    this.preview = el;
  };

  getViewport(): HTMLDivElement | null {
    return this.viewport;
  }

  private getObserver(): ResizeObserver {
    return (this.observer ??= new ResizeObserver((entries) => this.onResize(entries)));
  }

  /** Row ref in measured-height mode: rows join the shared ResizeObserver (never one per row or cell). */
  readonly measureRow = (el: HTMLDivElement | null): (() => void) | void => {
    if (!el) return;
    const observer = this.getObserver();
    observer.observe(el);
    return () => observer.unobserve(el);
  };

  private readonly resizeCallbacks = new Map<Element, () => void>();

  /** Observes an element with the grid's one ResizeObserver (toolbar overflow); returns the teardown. */
  observeElement(el: Element, callback: () => void): () => void {
    this.resizeCallbacks.set(el, callback);
    const observer = this.getObserver();
    observer.observe(el);
    return () => {
      this.resizeCallbacks.delete(el);
      this.observer?.unobserve(el);
    };
  }

  private onResize(entries: ResizeObserverEntry[]): void {
    const batch: [RowId, number][] = [];
    for (const entry of entries) {
      const callback = this.resizeCallbacks.get(entry.target);
      if (callback) {
        callback();
        continue;
      }
      if (entry.target === this.viewport) {
        const viewport = entry.target as HTMLElement;
        this.layout.setViewportSize(viewport.clientWidth, viewport.clientHeight);
        continue;
      }
      const id = (entry.target as HTMLElement).dataset['rowId'];
      if (id === undefined || !entry.target.isConnected) continue;
      const size = entry.borderBoxSize?.[0];
      batch.push([id, size ? size.blockSize : (entry.target as HTMLElement).offsetHeight]);
    }
    if (!batch.length) return;
    const anchor = this.layout.reportRowHeights(batch);
    const viewport = this.viewport;
    if (anchor !== 0 && viewport && !this.layout.getScrollMapping().compressed) viewport.scrollTop += anchor;
  }

  // ------------------------------------------------------------------------
  // Compressed scroll: wheel deltas move content 1:1 instead of `ratio`:1
  // ------------------------------------------------------------------------

  private readonly onWheel = (event: WheelEvent): void => {
    const viewport = this.viewport;
    if (!viewport || event.ctrlKey) return;
    const unit = event.deltaMode === 1 ? this.layout.config.rowHeight : event.deltaMode === 2 ? this.layout.bodyExtent() : 1;
    const dy = (event.shiftKey && event.deltaX === 0 ? 0 : event.deltaY) * unit;
    const dx = (event.shiftKey && event.deltaX === 0 ? event.deltaY : event.deltaX) * unit;
    if (dy === 0) return;
    event.preventDefault();
    if (dx) viewport.scrollLeft += dx;
    const physical = this.layout.wheelBy(dy);
    viewport.scrollTop = physical;
  };

  /** Attaches the (non-passive) wheel listener only while the scroll height is compressed. */
  updateWheelListener(): void {
    const compressed = this.layout.getScrollMapping().compressed;
    if (compressed && !this.wheelAttached && this.viewport) {
      this.viewport.addEventListener('wheel', this.onWheel, { passive: false });
      this.wheelAttached = true;
    } else if (!compressed && this.wheelAttached) {
      this.detachWheel();
    }
  }

  private detachWheel(): void {
    if (this.wheelAttached) this.viewport?.removeEventListener('wheel', this.onWheel);
    this.wheelAttached = false;
  }

  // ------------------------------------------------------------------------
  // Column resize, reorder, keyboard, autofit
  // ------------------------------------------------------------------------

  private column(columnId: string | undefined): CompiledColumn<Row> | undefined {
    if (columnId === undefined) return undefined;
    const col = this.engine.getSnapshot().columns.byId.get(columnId);
    return col?.leaf ? col : undefined;
  }

  canResize(column: CompiledColumn<Row>): boolean {
    return (this.props.resizable ?? false) && column.flags.allowResizing;
  }

  canReorder(column: CompiledColumn<Row>): boolean {
    return (this.props.reorderable ?? false) && column.flags.allowReordering && !column.flags.lockColumn;
  }

  private zoneOf(column: CompiledColumn<Row>): 'left' | 'center' | 'right' {
    return columnZone(this.engine.getSnapshot().columns, column.columnId);
  }

  private zoneVar(column: CompiledColumn<Row>): string {
    return `--salmon-data-grid-${this.zoneOf(column)}-width`;
  }

  readonly onHeaderPointerDown = (event: ReactPointerEvent<HTMLElement>): void => {
    if (event.button !== 0) return;
    const target = event.target as Element;
    const cell = target.closest<HTMLElement>('[data-column-id]');
    const column = this.column(cell?.dataset['columnId']);
    if (!cell || !column) return;
    if (target.closest('.salmon-data-grid-header-button')) return;
    const handle = target.closest<HTMLElement>('.salmon-data-grid-resize-handle');
    if (handle) {
      if (this.canResize(column)) this.startResize(event, handle, column);
      return;
    }
    if (this.canReorder(column) || canGroupColumn(this, column)) this.startReorder(event, cell, column);
  };

  private startResize(event: ReactPointerEvent<HTMLElement>, handle: HTMLElement, column: CompiledColumn<Row>): void {
    const root = this.root;
    if (!root) return;
    event.preventDefault();
    event.stopPropagation();
    const layout = this.layout.getColumnLayout();
    const startWidth = layout.widths.get(column.columnId) ?? this.layout.config.defaultColumnWidth;
    const zone = this.zoneOf(column);
    const zoneWidth = zone === 'left' ? layout.leftWidth : zone === 'right' ? layout.rightWidth : layout.centerWidth;
    const startX = event.clientX;
    const pointerId = event.pointerId;
    let width = startWidth;
    const field = column.columnId;
    const p = this.props;
    if (p.onColumnResizeStart) {
      const start = gridEvent<DataGridColumnResizeEvent>('columnResizeStart', 'pointer', { field, width: startWidth, previousWidth: startWidth });
      p.onColumnResizeStart(start);
      if (start.defaultPrevented) return;
    }
    handle.setPointerCapture(pointerId);
    root.dataset['resizing'] = '';
    let fitted: ColumnLayout | null = null;
    const write = (w: number): void => {
      fitted = this.layout.previewResize(column.columnId, w);
      if (fitted) return writeLayoutVars(root, fitted); // resizeMode 'auto'
      const delta = w - startWidth;
      root.style.setProperty(widthVar(column.leafIndex), `${w}px`);
      root.style.setProperty(this.zoneVar(column), `${zoneWidth + delta}px`);
      root.style.setProperty('--salmon-data-grid-total-width', `${layout.totalWidth + delta}px`);
    };
    const move = (e: PointerEvent): void => {
      const dx = (e.clientX - startX) * (this.rtl ? -1 : 1);
      const next = clampColumnWidth(column, startWidth + dx);
      if (next === width) return;
      width = next;
      write(next); // DOM only: zero React commits per drag frame
      if (this.props.onColumnResize) this.props.onColumnResize(gridEvent<DataGridColumnResizeEvent>('columnResize', 'pointer', { field, width: next, previousWidth: startWidth }));
    };
    const end = (): void => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      delete root.dataset['resizing'];
      this.suppressClick = true;
      if (width === startWidth) {
        if (fitted) writeLayoutVars(root, this.layout.getColumnLayout());
        if (this.props.onColumnResizeEnd) this.props.onColumnResizeEnd(gridEvent<DataGridColumnResizeEvent>('columnResizeEnd', 'pointer', { field, width, previousWidth: startWidth }));
        return;
      }
      if (fitted) {
        const result = this.dispatchFrom('pointer', { type: 'columns.setWidths', widths: fitWidthsOf(this.engine.getSnapshot().columns.visible, fitted) });
        const final = this.layout.getColumnLayout();
        writeLayoutVars(root, final);
        const committed = result.status === 'applied' ? final.widths.get(column.columnId) : startWidth;
        if (this.props.onColumnResizeEnd) this.props.onColumnResizeEnd(gridEvent<DataGridColumnResizeEvent>('columnResizeEnd', 'pointer', { field, width: committed ?? startWidth, previousWidth: startWidth }));
        return;
      }
      const result = this.dispatchFrom('pointer', { type: 'columns.setWidth', columnId: column.columnId, width });
      const committed = this.layout.getColumnLayout().widths.get(column.columnId);
      if (result.status !== 'applied' || committed !== width) write(committed ?? startWidth);
      if (this.props.onColumnResizeEnd) this.props.onColumnResizeEnd(gridEvent<DataGridColumnResizeEvent>('columnResizeEnd', 'pointer', { field, width: committed ?? startWidth, previousWidth: startWidth }));
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  private startReorder(event: ReactPointerEvent<HTMLElement>, cell: HTMLElement, column: CompiledColumn<Row>): void {
    const root = this.root;
    if (!root) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    let dragging = false;
    let toIndex = -1;
    let overPanel = false;
    let panelHot = false;
    const visible = this.engine.getSnapshot().columns.visible;
    const from = visible.indexOf(column);
    const move = (e: PointerEvent): void => {
      if (!dragging) {
        if (Math.abs(e.clientX - startX) < DRAG_THRESHOLD && Math.abs(e.clientY - startY) < DRAG_THRESHOLD) return;
        dragging = true;
        cell.setPointerCapture(pointerId);
        root.dataset['reordering'] = '';
        if (this.preview) this.preview.textContent = column.headerText;
        this.dragEvent('onColumnDragStart', column, from, from);
      }
      // Read phase.
      const rootRect = root.getBoundingClientRect();
      const cellRect = cell.getBoundingClientRect();
      // Dropping on the group panel groups by the column.
      const panel = canGroupColumn(this, column) ? root.ownerDocument.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('.salmon-data-grid-group-panel') : null;
      overPanel = panel !== null && panel !== undefined && panel === this.groupPanel;
      if (overPanel !== panelHot) {
        panelHot = overPanel;
        const target = this.groupPanel;
        if (target) {
          if (overPanel) target.dataset['dropActive'] = '';
          else delete target.dataset['dropActive'];
        }
      }
      if (!this.canReorder(column) || overPanel) {
        toIndex = -1;
        if (this.preview) this.preview.style.transform = this.previewTransform(e, rootRect);
        if (this.indicator) this.indicator.dataset['invalid'] = 'true';
        this.dragEvent('onColumnDrag', column, from, -1);
        return;
      }
      const hit = root.ownerDocument.elementFromPoint(e.clientX, cellRect.top + cellRect.height / 2);
      const targetCell = hit?.closest<HTMLElement>('.salmon-data-grid-header-cell');
      const target = targetCell && root.contains(targetCell) ? this.column(targetCell.dataset['columnId']) : undefined;
      let x = e.clientX - rootRect.left;
      let valid = false;
      if (target && targetCell) {
        const rect = targetCell.getBoundingClientRect();
        const before = (e.clientX < rect.left + rect.width / 2) !== this.rtl;
        let index = visible.indexOf(target) + (before ? 0 : 1);
        if (index > from) index -= 1;
        toIndex = index;
        const state = this.columnsState();
        valid = index !== from && previewColumnsCommand(this.engine.getSnapshot().columns, state, { type: 'columns.move', columnId: column.columnId, toIndex: index }) !== null;
        x = (before !== this.rtl ? rect.left : rect.right) - rootRect.left;
      } else {
        toIndex = -1;
      }
      // Write phase. The indicator and preview sit at the logical start (inset-inline-start), so RTL offsets count from the right edge.
      if (this.indicator) {
        this.indicator.style.transform = `translateX(${this.rtl ? x - rootRect.width : x}px)`;
        this.indicator.dataset['invalid'] = valid ? 'false' : 'true';
      }
      if (this.preview) this.preview.style.transform = this.previewTransform(e, rootRect);
      if (!valid) toIndex = -1;
      this.dragEvent('onColumnDrag', column, from, toIndex);
    };
    const end = (e: PointerEvent): void => {
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerup', end);
      root.removeEventListener('pointercancel', end);
      if (cell.hasPointerCapture(pointerId)) cell.releasePointerCapture(pointerId);
      if (!dragging) return;
      // A cancelled pointer (the browser took over the gesture) drops nothing: no move, no grouping.
      if (e.type === 'pointercancel') {
        toIndex = -1;
        overPanel = false;
      }
      const groupPanel = this.groupPanel;
      if (groupPanel) delete groupPanel.dataset['dropActive'];
      if (overPanel) {
        delete root.dataset['reordering'];
        this.suppressClick = true;
        this.dispatchFrom('pointer', { type: 'grouping.groupBy', columnId: column.columnId });
        return;
      }
      delete root.dataset['reordering'];
      this.suppressClick = true;
      this.dragEvent('onColumnDrop', column, from, toIndex);
      if (toIndex >= 0 && toIndex !== from) this.dispatchFrom('pointer', { type: 'columns.move', columnId: column.columnId, toIndex });
    };
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
  }

  private dragEvent(name: 'onColumnDragStart' | 'onColumnDrag' | 'onColumnDrop', column: CompiledColumn<Row>, fromIndex: number, toIndex: number): void {
    const handler = this.props[name];
    if (!handler) return;
    const type = name === 'onColumnDragStart' ? 'columnDragStart' : name === 'onColumnDrag' ? 'columnDrag' : 'columnDrop';
    handler(gridEvent<DataGridColumnDragEvent>(type, 'pointer', { field: column.columnId, fromIndex, toIndex }));
  }

  private previewTransform(e: PointerEvent, rootRect: DOMRect): string {
    const x = this.rtl ? e.clientX - rootRect.right - 12 : e.clientX - rootRect.left + 12;
    return `translate(${x}px, ${e.clientY - rootRect.top + 8}px)`;
  }

  readonly onHeaderClickCapture = (event: ReactMouseEvent<HTMLElement>): void => {
    if (this.suppressClick) {
      this.suppressClick = false;
      event.stopPropagation();
      event.preventDefault();
    }
  };

  readonly onHeaderPointerDownCapture = (): void => {
    this.suppressClick = false;
  };

  /**
   * Header activation. Sorting is a query module: when a module named
   * `sort` is registered, activation dispatches the next step of `sorting.order`.
   */
  private toggleSort(column: CompiledColumn<Row>, multi: boolean, source: DataGridEventSource): boolean {
    if (!this.sortable || !column.flags.allowSorting) return false;
    const command = nextSortCommand(this, column.columnId, multi);
    if (command) this.dispatchFrom(source, command);
    return true;
  }

  readonly onHeaderClick = (event: ReactMouseEvent<HTMLElement>): void => {
    const target = event.target as Element;
    if (target.closest('.salmon-data-grid-resize-handle')) return;
    const column = this.column(target.closest<HTMLElement>('[data-column-id]')?.dataset['columnId']);
    if (!column) return;
    const button = target.closest<HTMLElement>('.salmon-data-grid-header-button');
    if (button) {
      const kind = button.dataset['kind'];
      if (kind === 'filter') this.chrome.openFilterMenu(column.columnId, 'pointer', button);
      else if (kind === 'group') toggleColumnGrouping(this, column, event.detail === 0 ? 'keyboard' : 'pointer');
      else this.chrome.openColumnMenu(column.columnId, 'pointer', button);
      return;
    }
    if (this.interaction.isSelectionColumn(column)) {
      this.interaction.toggleAll('pointer');
      return;
    }
    // Ctrl/Cmd+click adds to a multi-column sort, Shift+click removes the column's sort.
    if (event.shiftKey && !event.ctrlKey && !event.metaKey) {
      if (this.sortable && column.flags.allowSorting) this.dispatchFrom('pointer', { type: 'sort.remove', columnId: column.columnId });
      return;
    }
    // a touch tap that sorts opens the multi-sort popup; while its toggle is on, taps add like Ctrl+click.
    const touch = (event.nativeEvent as PointerEvent).pointerType === 'touch';
    const multi = this.chrome.touchSort?.multi === true;
    if (this.toggleSort(column, event.ctrlKey || event.metaKey || (touch && multi), 'pointer') && touch && this.engine.getModuleState<{ mode: string }>('sort')?.mode === 'multiple') {
      this.chrome.setTouchSort({ columnId: column.columnId, multi });
    }
  };

  readonly onHeaderDoubleClick = (event: ReactMouseEvent<HTMLElement>): void => {
    const target = event.target as Element;
    if (!target.closest('.salmon-data-grid-resize-handle')) return;
    const column = this.column(target.closest<HTMLElement>('[data-column-id]')?.dataset['columnId']);
    if (column && this.canResize(column)) this.autoSizeColumns([column.columnId], 'pointer');
  };

  /**
   * Header keyboard commands, routed from the keymap: sort, move, resize, autofit.
   */
  headerCommand(kind: 'sort' | 'sortMulti' | 'removeSort' | 'moveLeft' | 'moveRight' | 'resizeNarrower' | 'resizeWider' | 'autoSize', columnId: ColumnId | null): boolean {
    const column = this.column(columnId ?? undefined);
    if (!column) return false;
    switch (kind) {
      case 'sort':
      case 'sortMulti':
        return this.toggleSort(column, kind === 'sortMulti', 'keyboard');
      case 'removeSort':
        if (!this.sortable || !column.flags.allowSorting) return false;
        this.dispatchFrom('keyboard', { type: 'sort.remove', columnId: column.columnId });
        return true;
      case 'moveLeft':
      case 'moveRight': {
        if (!this.canReorder(column)) return false;
        const visualStep = kind === 'moveRight' ? 1 : -1;
        const step = this.rtl ? -visualStep : visualStep;
        const visible = this.engine.getSnapshot().columns.visible;
        const toIndex = visible.indexOf(column) + step;
        if (toIndex < 0 || toIndex >= visible.length) return true;
        this.focusAfterCommit = column.columnId;
        this.dispatchFrom('keyboard', { type: 'columns.move', columnId: column.columnId, toIndex });
        return true;
      }
      case 'resizeNarrower':
      case 'resizeWider': {
        if (!this.canResize(column)) return false;
        // Visual: in RTL the column end is on the left, so ArrowLeft widens.
        const visual = kind === 'resizeWider' ? 1 : -1;
        const width = this.layout.getColumnLayout().widths.get(column.columnId) ?? this.layout.config.defaultColumnWidth;
        this.keyboardResize(column, clampColumnWidth(column, width + 10 * visual * (this.rtl ? -1 : 1)));
        return true;
      }
      case 'autoSize': {
        if (!this.canResize(column)) return false;
        const width = this.measureColumns([column.columnId]).get(column.columnId);
        if (width !== undefined) this.keyboardResize(column, width);
        return true;
      }
    }
  }

  /** A keyboard resize step: the same start / resize / end events as a pointer drag. */
  private keyboardResize(column: CompiledColumn<Row>, width: number): void {
    const field = column.columnId;
    const previousWidth = this.layout.getColumnLayout().widths.get(field) ?? this.layout.config.defaultColumnWidth;
    const p = this.props;
    if (p.onColumnResizeStart) {
      const start = gridEvent<DataGridColumnResizeEvent>('columnResizeStart', 'keyboard', { field, width: previousWidth, previousWidth });
      p.onColumnResizeStart(start);
      if (start.defaultPrevented) return;
    }
    if (width !== previousWidth) {
      if (this.props.onColumnResize) this.props.onColumnResize(gridEvent<DataGridColumnResizeEvent>('columnResize', 'keyboard', { field, width, previousWidth }));
      this.dispatchFrom('keyboard', { type: 'columns.setWidth', columnId: field, width });
    }
    const committed = this.layout.getColumnLayout().widths.get(field) ?? previousWidth;
    if (this.props.onColumnResizeEnd) this.props.onColumnResizeEnd(gridEvent<DataGridColumnResizeEvent>('columnResizeEnd', 'keyboard', { field, width: committed, previousWidth }));
  }

  /** Restores header focus after a keyboard reorder moved the element. */
  restoreHeaderFocus(): void {
    const id = this.focusAfterCommit;
    if (id === null || !this.root) return;
    this.focusAfterCommit = null;
    const el = this.root.querySelector<HTMLElement>(`.salmon-data-grid-header-cell[data-column-id="${CSS.escape(id)}"]`);
    el?.focus({ preventScroll: true });
  }

  /** Delegated overflow tooltip for `overflow: 'ellipsisWithTooltip'` (no per-cell listeners). */
  readonly onPointerOver = (event: ReactPointerEvent<HTMLElement>): void => {
    const cell = (event.target as Element).closest('[data-clip="tooltip"]');
    if (!cell || cell === this.tooltipCell) return;
    this.tooltipCell = cell;
    if (cell.scrollWidth > cell.clientWidth) cell.setAttribute('title', cell.textContent ?? '');
    else cell.removeAttribute('title');
  };

  /**
   * Measures header and loaded-viewport content widths. All DOM writes (one
   * offscreen measurer) happen before all reads, so layout runs once.
   */
  measureColumns(columnIds: readonly ColumnId[]): Map<ColumnId, number> {
    const out = new Map<ColumnId, number>();
    const root = this.root;
    if (!root || columnIds.length === 0) return out;
    const engine = this.engine;
    const { start, end } = this.layout.getRowWindow();
    const doc = root.ownerDocument;
    const measurer = doc.createElement('div');
    measurer.className = 'salmon-data-grid-measure';
    measurer.setAttribute('aria-hidden', 'true');
    const groups: [CompiledColumn<Row>, HTMLElement][] = [];
    for (const id of columnIds) {
      const column = this.column(id);
      if (!column) continue;
      const group = doc.createElement('div');
      group.className = 'salmon-data-grid-measure__group';
      const header = doc.createElement('div');
      header.className = 'salmon-data-grid-measure__header';
      header.textContent = column.headerText;
      group.appendChild(header);
      for (let i = start; i < end; i++) {
        const rowId = engine.getRowIdAt(i);
        if (rowId === undefined) continue;
        const cell = doc.createElement('div');
        cell.className = 'salmon-data-grid-measure__cell';
        cell.textContent = engine.getCellSnapshot(rowId, id)?.formattedValue ?? '';
        group.appendChild(cell);
      }
      measurer.appendChild(group);
      groups.push([column, group]);
    }
    root.appendChild(measurer);
    for (const [column, group] of groups) {
      let width = group.getBoundingClientRect().width + HEADER_AFFORDANCE_WIDTH;
      // Custom cell templates: also read the rendered cells of the column.
      if ((column.def as DataGridColumn<Row>).renderCell) {
        for (const el of root.querySelectorAll<HTMLElement>(`.salmon-data-grid-cell[data-column-id="${CSS.escape(column.columnId)}"]`)) {
          width = Math.max(width, el.scrollWidth);
        }
      }
      out.set(column.columnId, clampColumnWidth(column, Math.ceil(width)));
    }
    measurer.remove();
    return out;
  }

  autoSizeColumns(columnIds: readonly ColumnId[] | undefined, source: DataGridEventSource): void {
    const ids = columnIds ?? this.engine.getSnapshot().columns.visible.map((c) => c.columnId);
    const widths = this.measureColumns(ids);
    if (widths.size === 0) return;
    this.dispatchFrom(source, { type: 'columns.setWidths', widths: Object.fromEntries(widths) });
  }

  /** Content-fits `width: 'auto'` columns once after mount (renderer-local, not user state). */
  fitAutoColumns(): void {
    const ids = this.engine
      .getSnapshot()
      .columns.visible.filter((c) => c.def.width === 'auto' && !this.layout.hasAutoWidth(c.columnId))
      .map((c) => c.columnId);
    if (ids.length) this.layout.setAutoWidths(this.measureColumns(ids));
  }
}
