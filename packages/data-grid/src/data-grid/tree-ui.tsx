'use client';

// Tree mode between
// `DataGridProps` and the core `tree` module, reached only through the `tree`
// render feature (features/feature-tree.tsx): module registration (the core
// module, the remote tree adapter, a `rowDragDrop` stand-in for indent and
// outdent), engine options (nested rows flattened by reference), the tree
// cell (toggle, checkbox, indentation, `ctx.tree`), the row view (row ARIA
// and data attributes), child summary rows, the toggle events, the tree key
// commands in the keymap, live messages, the toolbar items, the state
// wrappers and the tree API. Client-only parts load as lazy chunks: the key
// handlers and the skeleton row (tree-client-chunk.ts, on mount) and the
// remote adapter with the root block watcher (tree-remote-chunk.ts). A grid
// without `tree` never loads this module.

import { memo, useSyncExternalStore, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import {
  createKeymap,
  createLocalDataSource,
  DEFAULT_KEY_BINDINGS,
  serializeDataGridQuery,
  type CommandEvent,
  type CompiledColumn,
  type DataGridCommand,
  type DataSource,
  type DataGridModule,
  type DataGridOptions,
  type DataSourceEvent,
  type KeyBinding,
  type Keymap,
  type LocalDataSource,
  type ModuleContext,
  type RowId,
} from '@salmonui/data-grid/engine';
import { createTreeModule, flattenTree, TREE_FOOTER_ID_PREFIX, treeCopyRowIds, treeOf as treeStructureOf, withTreePersistence, withTreeState, type TreeModule, type TreeOptions } from '@salmonui/data-grid/engine/tree';
import type { RemoteTree, RemoteTreeOptions } from '@salmonui/data-grid/engine/tree-remote';
import { createInitialRowDragState, ROW_DRAG_COMMANDS } from '@salmonui/data-grid/engine/row-drag-state';
import { DEV, warnOnce } from '@salmonui/core/internal/dev';
import { holdInput, replayInput } from '@salmonui/core/internal/held-input';
import { useAdaptive } from './adaptive-view.js';
import { columnWidthStyle } from './Cell.js';
import { columnInfo } from './column-info.js';
import { useDataGridInstance, useDataGridRender } from './context.js';
import { deferModule, type DeferredModule } from './deferred-module.js';
import { gridEvent, type DataGridEventSource } from '@salmonui/core/internal/events';
import type { DataGridFeatureUi, DataGridGroupRowProps, DataGridTreeCellPart, DataGridTreeCellProps, DataGridTreeRowView, NormalizedProps } from './features/types.js';
import { centerZone } from './fixed-zone.js';
import { isDataSource, resolveGetRowId, type DataGridInstance } from './instance.js';
import type { DataGridErrorEvent } from './query-types.js';
import { treeCopyHooks } from './tree-hooks.js';
import { DataGridTreeToggle, treeColumnId, treeOf, treeRowLabel, treeText, useTreeRow, type TreeFacade } from './tree-toggle.js';
import type { DataGridTree, DataGridTreeContext, DataGridTreeRowInfo, DataGridTreeToggleEvent } from './tree-types.js';
import type { DataGridAggregate, DataGridAggregateContext, DataGridAggregateRow, DataGridApi, DataGridCellContext } from './types.js';

type AnyInstance = DataGridInstance<unknown>;

/** `tree` prop as an object (`true`: defaults; `false` and absent: null). */
export function treeOptionsOf<Row>(props: { readonly tree?: boolean | DataGridTree<Row> | undefined }): DataGridTree<Row> | null {
  const t = props.tree;
  if (!t) return null;
  return t === true ? {} : t;
}

/** `infiniteScroll` settings (`true`: defaults; null when off). Same as `infiniteOf` of infinite-ui.tsx, which tree mode does not load. */
function infiniteOf(props: NormalizedProps): { readonly blockSize?: number; readonly initialBlocks?: number; readonly threshold?: number } | null {
  const v = props.infiniteScroll;
  return v ? (v === true ? {} : v) : null;
}

/** The nested children field, or null for flat (`parentIdField`) data. */
function childrenFieldOf(t: DataGridTree<unknown>): string | null {
  return t.childrenField ?? (t.parentIdField ? null : 'children');
}

/** An aggregate with a child summary template: child summary rows are on. */
function hasChildFooter(rows: readonly DataGridAggregateRow<unknown>[] | undefined): boolean {
  return (rows ?? []).some((r) => r.columns.some((c) => c.renderChildFooter !== undefined));
}

/** Core tree options of the props (the loader reads the latest props). */
function coreOptions(props: NormalizedProps, latest: () => NormalizedProps): TreeOptions<unknown> {
  const t = treeOptionsOf(props) as DataGridTree<unknown>;
  const { loadChildren, ...rest } = t;
  return {
    ...rest,
    childSummary: hasChildFooter(props.aggregates),
    ...(loadChildren ? { loadChildren: (ctx) => (treeOptionsOf(latest()) as DataGridTree<unknown> | null)?.loadChildren?.(ctx as never) ?? [] } : {}),
  };
}

type AnyTreeModule = TreeModule<unknown>;
type Fn = (...args: never[]) => unknown;

/** The remote tree adapter behind a lazy chunk: the engine's source and tree module, valid before the chunk loads. */
interface LazyRemoteTree {
  readonly dataSource: DataSource<unknown>;
  readonly module: AnyTreeModule;
  /** Loads the chunk (once) and binds the adapter. */
  load(): Promise<RemoteTreeChunk>;
}

/** The loaded remote tree chunk with the bound adapter. */
interface RemoteTreeChunk {
  readonly chunk: typeof import('./tree-remote-chunk.js');
  readonly remote: RemoteTree<unknown>;
}

/**
 * `createRemoteTree` (`bindRemoteTree`, tree-remote-chunk.ts) loaded on the
 * first read: until then the module is a plain tree module (no rows
 * exist before the remote root read answers), then every call goes to the
 * adapter's module, initialized from the same options. The server render
 * never waits for it: reads are asynchronous anyway.
 */
function lazyRemoteTree(source: DataSource<unknown>, options: RemoteTreeOptions<unknown>): LazyRemoteTree {
  let current: AnyTreeModule = createTreeModule<unknown>();
  let real: DataSource<unknown> | null = null;
  let gridOptions: DataGridOptions<unknown> | undefined;
  let ctx: ModuleContext<unknown> | undefined;
  const listeners = new Set<(event: DataSourceEvent<unknown>) => void>();
  let loading: Promise<RemoteTreeChunk> | undefined;
  const load = (): Promise<RemoteTreeChunk> =>
    (loading ??= import('./tree-remote-chunk.js').then((chunk) => {
      const remote = chunk.bindRemoteTree(source, options, { createTreeModule, serializeDataGridQuery });
      const next = remote.module();
      if (gridOptions) next.initialState(gridOptions);
      if (ctx) next.onConnect?.(ctx);
      current.dispose?.();
      current = next;
      remote.dataSource.subscribe?.((event) => listeners.forEach((l) => l(event)));
      real = remote.dataSource;
      return { chunk, remote };
    }));
  const of = (target: object | undefined, name: string): Fn => (target as Record<string, Fn>)[name] as Fn;
  // Hooks that take the module context last: the adapter needs it once it loads.
  const fwd = (name: string): Fn => ((...args: unknown[]) => ((ctx = args[args.length - 1] as ModuleContext<unknown>), of(current, name)?.(...(args as never[])))) as Fn;
  const methods: Record<string, Fn> = {};
  for (const name of Object.keys(current.methods as object)) methods[name] = ((...args: never[]) => of(current.methods, name)(...args)) as Fn;
  const stage = (current.pipeline as NonNullable<AnyTreeModule['pipeline']>)[0] as object;
  const module = {
    name: 'tree',
    commands: current.commands,
    methods,
    initialState: (o: DataGridOptions<unknown>) => current.initialState((gridOptions = o)),
    reduce: fwd('reduce'),
    notify: fwd('notify'),
    onConnect: fwd('onConnect'),
    interceptRead: (...args: never[]) => fwd('interceptRead')(...args) === true,
    extendQuery: (...args: never[]) => of(current, 'extendQuery')(...args),
    dispose: () => current.dispose?.(),
    pipeline: [{ ...stage, key: (...args: never[]) => of(current.pipeline?.[0], 'key')(...args), run: (...args: never[]) => of(current.pipeline?.[0], 'run')(...args) }],
  } as unknown as AnyTreeModule;
  const dataSource: DataSource<unknown> = {
    mode: 'remote',
    capabilities: Object.freeze({ ...source.capabilities, treeChildren: true, lazyGroups: false }),
    read: (request) => load().then((l) => l.remote.dataSource.read(request)),
    ...(source.write ? { write: (request: never) => load().then((l) => of(l.remote.dataSource, 'write')(request) as never) } : {}),
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    invalidate: (scope) => (real ?? source).invalidate?.(scope),
  };
  return { dataSource, module, load };
}

/** What creation built for one grid (keyed by its normalized props): the flattened local source, the remote tree, the row drag stand-in. */
interface TreeSetup {
  local: LocalDataSource<unknown> | null;
  remote: LazyRemoteTree | null;
  rowDrag: DeferredModule<unknown> | null;
  /** The remote tree's child load errors, forwarded by the controller. */
  onRemoteError: ((rowId: RowId, error: unknown) => void) | null;
}

const setups = new WeakMap<object, TreeSetup>();

function setupOf(props: NormalizedProps): TreeSetup {
  let setup = setups.get(props);
  if (setup) return setup;
  setup = { local: null, remote: null, rowDrag: null, onRemoteError: null };
  setups.set(props, setup);
  const data = props.data;
  if (isDataSource(data)) {
    // Remote source with tree reads (`read({ parentRowId })`): the remote tree adapter.
    if (data.mode === 'remote') {
      const s = setup;
      const { getRowId } = resolveGetRowId(props as never);
      // `infiniteScroll` in tree mode: blocks of root rows.
      const inf = infiniteOf(props);
      s.remote = lazyRemoteTree(data as DataSource<unknown>, {
        getRowId: (row) => getRowId(row),
        onError: (e) => s.onRemoteError?.(e.rowId, e.error),
        ...(inf ? { rootBlocks: { ...(inf.blockSize !== undefined ? { blockSize: inf.blockSize } : {}), ...(inf.initialBlocks !== undefined ? { initialBlocks: inf.initialBlocks } : {}) } } : {}),
      });
    }
  } else {
    const field = childrenFieldOf(treeOptionsOf(props) as DataGridTree<unknown>);
    if (field !== null) {
      // Nested rows: the engine source is the pre-order flattening, rows by reference.
      const { getRowId } = resolveGetRowId(props as never);
      setup.local = createLocalDataSource(flattenTree(data ?? [], field), { getRowId });
    }
  }
  return setup;
}

/** At-rest results of the `rowDragDrop` methods until the module loads. */
const AT_REST = { getPayload: () => null, getSession: () => null, getEventArgs: () => null };

/** The modules tree mode needs that the app (or the `rowDrag` feature) does not pass. */
export function treeModules(props: NormalizedProps, modules: readonly DataGridModule<unknown>[], deferred: DeferredModule<unknown>[]): readonly DataGridModule<unknown>[] {
  if (!treeOptionsOf(props)) return [];
  const setup = setupOf(props);
  const out: DataGridModule<unknown>[] = [];
  if (!modules.some((m) => m.name === 'tree')) out.push((setup.remote ? setup.remote.module : createTreeModule<unknown>()) as unknown as DataGridModule<unknown>);
  // Indent and outdent move rows through `rowDragDrop.move`: a stand-in until its code loads.
  if (!props.rowDrag && !modules.some((m) => m.name === 'rowDragDrop')) {
    const d = deferModule<unknown>({ name: 'rowDragDrop', inSnapshot: false, commands: ROW_DRAG_COMMANDS, initialState: createInitialRowDragState, methods: AT_REST, notify: true });
    deferred.push(d);
    setup.rowDrag = d;
    out.push(d.module as unknown as DataGridModule<unknown>);
  }
  return out;
}

/** Engine options: `options.tree`, the flattened or remote source, and the indent stand-in's `rowDragDrop`. */
export function treeEngineOptions(props: NormalizedProps, latest: () => NormalizedProps): Record<string, unknown> {
  if (!treeOptionsOf(props)) return {};
  const setup = setupOf(props);
  return {
    tree: coreOptions(props, latest),
    ...(setup.local ? { dataSource: setup.local } : setup.remote ? { dataSource: setup.remote.dataSource } : {}),
    ...(setup.rowDrag ? { rowDragDrop: { enabled: true } } : {}),
  };
}

// ---------------------------------------------------------------------------
// Row view and tree cell
// ---------------------------------------------------------------------------

const views = new WeakMap<DataGridTreeRowInfo, DataGridTreeRowView>();
const contexts = new WeakMap<DataGridTreeRowInfo, DataGridTreeContext>();

function contextOf(info: DataGridTreeRowInfo): DataGridTreeContext {
  let ctx = contexts.get(info);
  if (!ctx) {
    ctx = Object.freeze({ depth: info.depth, hasChildren: info.hasChildren, expanded: info.hasChildren && info.expanded, loadStatus: info.loadStatus });
    contexts.set(info, ctx);
  }
  return ctx;
}

/** Row ARIA and data attributes of a tree row, and its `getRowProps` context. Pinned rows render at depth 0. */
export function treeRowView(instance: AnyInstance, rowId: RowId): DataGridTreeRowView | null {
  const info = treeOf(instance)?.getTreeRow(rowId) ?? null;
  if (!info) return null;
  let view = views.get(info);
  if (!view) {
    const attrs: Record<string, string | number | boolean> = {
      'aria-level': info.depth + 1,
      'aria-posinset': info.posinset,
      'aria-setsize': info.setsize,
      'data-depth': info.depth,
    };
    if (info.hasChildren) {
      attrs['aria-expanded'] = info.expanded;
      attrs['data-expanded'] = info.expanded ? 'true' : 'false';
      attrs['data-has-children'] = '';
    }
    if (info.loadStatus === 'loading') attrs['aria-busy'] = true;
    if (info.context) attrs['data-tree-context'] = '';
    view = Object.freeze({ attrs: Object.freeze(attrs), ctx: Object.freeze({ tree: contextOf(info) }) });
    views.set(info, view);
  }
  return view;
}

const noopSubscribe = (): (() => void) => () => {};
const off = (): string => 'unchecked';

// The client chunk (key handlers, skeleton row; tree-client-chunk.ts), loaded when a tree grid mounts: a load
// cache shared by every grid of the page, not render state (cells read it through useSyncExternalStore).
type ClientChunk = typeof import('./tree-client-chunk.js');
let clientChunk: ClientChunk | null = null;
let clientLoad: Promise<ClientChunk> | null = null;
const clientListeners = new Set<() => void>();

/** The commands the client chunk handles (tree-client-chunk.ts `registerTreeKeys`). */
const CHUNK_COMMANDS = new Set(['tree.expandFocused', 'tree.collapseFocused', 'group.expandAll', 'group.collapseAll', 'tree.indent', 'tree.outdent', 'focus.right', 'focus.left', 'selection.enterDown', 'selection.toggle']);

function loadClientChunk(): Promise<ClientChunk> {
  return (clientLoad ??= import('./tree-client-chunk.js').then((m) => {
    clientChunk = m;
    clientListeners.forEach((l) => l());
    return m;
  }));
}

function subscribeClientChunk(listener: () => void): () => void {
  clientListeners.add(listener);
  return () => void clientListeners.delete(listener);
}

/** Tree checkbox: the row selection, tri-state from the descendants (`aria-checked="mixed"`). */
function DataGridTreeCheckboxImpl({ rowId }: { readonly rowId: RowId }): ReactNode {
  const instance = useDataGridInstance<unknown>();
  const tree = treeOf(instance) as TreeFacade;
  const engine = instance.engine;
  const read = (): string => tree.checkState(rowId);
  const state = useSyncExternalStore(
    tree ? (onChange) => {
      const a = engine.subscribeModule('selection', onChange);
      const b = engine.subscribe(onChange);
      return () => {
        a();
        b();
      };
    } : noopSubscribe,
    tree ? read : off,
    () => instance.serverRead(`tc\u0000${rowId}`, tree ? read : off),
  );
  const onClick = (event: ReactMouseEvent<HTMLElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    checkRow(instance, rowId, 'pointer');
  };
  return (
    <span
      className="salmon-data-grid-checkbox salmon-data-grid-select-checkbox salmon-data-grid-tree-checkbox"
      role="checkbox"
      aria-checked={state === 'mixed' ? 'mixed' : state === 'checked'}
      aria-label={instance.interaction.text('selectRow')}
      data-checked={state === 'checked' ? '' : undefined}
      data-indeterminate={state === 'mixed' ? '' : undefined}
      onClick={onClick}
    />
  );
}

const DataGridTreeCheckbox = memo(DataGridTreeCheckboxImpl);

/** Checkbox toggle (cascading with `checkbox.cascade`); the selection events carry `target: 'checkbox'`. */
function checkRow(instance: AnyInstance, rowId: RowId, source: DataGridEventSource): void {
  const interaction = instance.interaction as unknown as { inputContext: unknown };
  interaction.inputContext = { ctrlKey: false, shiftKey: false, target: 'checkbox' };
  try {
    instance.dispatchFrom(source, { type: 'tree.check', rowId });
  } finally {
    interaction.inputContext = null;
  }
}

/**
 * Tree column cell content: the toggle, the optional
 * checkbox, then the cell content (`renderCell` receives `ctx.tree`),
 * indented by `--salmon-data-grid-tree-depth`. Adaptive cards show
 * "Level n" instead of the indentation.
 */
function DataGridTreeCellImpl({ rowId, column, context, content }: DataGridTreeCellProps): ReactNode {
  const instance = useDataGridInstance<unknown>();
  const info = useTreeRow(instance, rowId);
  const vertical = useAdaptive()?.vertical === true;
  const checkbox = (instance.engine.getModuleState('tree') as { checkbox?: boolean } | undefined)?.checkbox === true;
  const depth = info?.depth ?? 0;
  const loading = info?.loadStatus === 'loading';
  // The skeleton row under a loading parent, client only.
  const Skeleton = useSyncExternalStore(loading ? subscribeClientChunk : noopSubscribe, () => (loading ? clientChunk : null), () => null)?.DataGridTreeSkeleton;
  const ctx = context();
  const renderCell = (column.def as { renderCell?: (ctx: DataGridCellContext<unknown>) => ReactNode }).renderCell;
  const body = content === undefined && renderCell ? renderCell(info ? { ...ctx, tree: contextOf(info) } : ctx) : content;
  // An added, unsaved row (no tree row yet) inherits the depth its row sets.
  const style = info || vertical ? ({ '--salmon-data-grid-tree-depth': vertical ? 0 : depth } as CSSProperties) : undefined;
  return (
    <span className="salmon-data-grid-tree-cell" style={style}>
      <DataGridTreeToggle rowId={rowId} label={ctx.formattedValue || rowId} />
      {checkbox ? <DataGridTreeCheckbox rowId={rowId} /> : null}
      {vertical ? <span className="salmon-data-grid-tree-level">{treeText(instance.interaction.text, 'treeLevel', { level: depth + 1 })}</span> : null}
      <span className="salmon-data-grid-tree-content">{body}</span>
      {Skeleton ? <Skeleton instance={instance} rowId={rowId} loading /> : null}
    </span>
  );
}

export const TREE_CELL: DataGridTreeCellPart = Object.freeze({
  is: (instance: AnyInstance, columnId: string) => treeColumnId(instance) === columnId,
  Cell: memo(DataGridTreeCellImpl),
});

// ---------------------------------------------------------------------------
// Child summary rows
// ---------------------------------------------------------------------------

type AggregatesFacade = { format(columnId: string, type: string, value: unknown): string };

function typesOf(a: DataGridAggregate<unknown>): readonly string[] {
  return typeof a.type === 'string' ? [a.type] : (a.type as readonly string[]);
}

/** A child summary row `__tf:<rowId>`: `renderChildFooter` of each aggregate, over the parent's kept descendants. */
function DataGridTreeFooterRowImpl({ rowId, rowIndex, view }: DataGridGroupRowProps): ReactNode {
  const instance = useDataGridInstance<unknown>();
  const render = useDataGridRender<unknown>();
  const parentId = rowId.slice(TREE_FOOTER_ID_PREFIX.length);
  const tree = treeOf(instance) as TreeFacade;
  const engine = instance.engine;
  const read = (): Record<string, Record<string, unknown>> | null => tree.getChildSummary(parentId);
  const values = useSyncExternalStore((onChange) => engine.subscribe(onChange), read, () => instance.serverRead(`tf\u0000${rowId}`, read));
  const info = tree.getTreeRow(parentId);
  const byColumn = new Map<string, DataGridAggregate<unknown>[]>();
  for (const row of instance.props.aggregates ?? []) {
    for (const a of row.columns as readonly DataGridAggregate<unknown>[]) {
      if (!a.renderChildFooter) continue;
      const at = a.displayField ?? a.field;
      byColumn.set(at, [...(byColumn.get(at) ?? []), a]);
    }
  }
  const facade = (engine as unknown as { aggregates?: AggregatesFacade }).aggregates;
  const cell = (column: CompiledColumn<unknown>, colIndex: number): ReactNode => {
    const defs = byColumn.get(column.columnId);
    const content = defs?.map((a, i) => {
      const v = values?.[a.field] ?? {};
      const formatted: Record<string, string> = {};
      for (const t of typesOf(a)) formatted[t] = facade ? facade.format(a.field, t, v[t]) : String(v[t] ?? '');
      const compiled = engine.getSnapshot().columns.byId.get(a.field);
      const ctx: DataGridAggregateContext<unknown> = {
        field: a.field,
        column: compiled ? columnInfo(compiled) : undefined,
        values: v,
        formatted,
        group: null,
        key: null,
        count: info?.childCount ?? 0,
        aggregates: (values ?? {}) as never,
        rows: () => tree.getChildRows(parentId),
      };
      return <span key={i}>{a.renderChildFooter?.(ctx)}</span>;
    });
    return (
      <div key={column.columnId} role="gridcell" aria-colindex={colIndex} className="salmon-data-grid-cell salmon-data-grid-aggregate-cell" style={columnWidthStyle(column)} data-column-id={column.columnId}>
        {content}
      </div>
    );
  };
  const leftCount = view.left.length;
  const centerBase = leftCount + view.centerStart + 1;
  const rightBase = leftCount + view.centerCount + 1;
  return (
    <div
      role="row"
      aria-rowindex={render.headerRows + rowIndex + 1}
      aria-level={(info?.depth ?? 0) + 2}
      className="salmon-data-grid-row salmon-data-grid-group-footer salmon-data-grid-tree-footer"
      data-row-id={rowId}
      data-row-index={rowIndex}
      data-depth={(info?.depth ?? 0) + 1}
    >
      {leftCount > 0 ? <div className="salmon-data-grid-pin salmon-data-grid-pin--left" data-frozen-edge="start">{view.left.map((c, i) => cell(c, i + 1))}</div> : null}
      {centerZone(view, view.center.map((c, j) => cell(c, centerBase + j)), view.center, cell)}
      {view.right.length > 0 ? <div className="salmon-data-grid-pin salmon-data-grid-pin--right" data-frozen-edge="end">{view.right.map((c, k) => cell(c, rightBase + k))}</div> : null}
    </div>
  );
}

export const DataGridTreeFooterRow = memo(DataGridTreeFooterRowImpl);

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

const B = (command: string, keys: readonly string[], core: boolean): KeyBinding => Object.freeze({ command, keys, contexts: ['body' as const], feature: 'rows' as const, core });

/** Tree key commands, appended to the default table. */
const TREE_KEYS: readonly KeyBinding[] = Object.freeze([
  B('tree.expandFocused', ['Mod+Shift+ArrowDown'], true),
  B('tree.collapseFocused', ['Mod+Shift+ArrowUp'], true),
  B('tree.indent', ['Alt+Shift+ArrowRight'], false),
  B('tree.outdent', ['Alt+Shift+ArrowLeft'], false),
]);

const ONE_ROW = new Set(['tree.toggle', 'tree.expand', 'tree.collapse', 'tree.expandFocused', 'tree.collapseFocused']);
const ALL_ROWS = new Set(['tree.expandAll', 'tree.collapseAll', 'tree.expandLevel', 'tree.collapseLevel', 'tree.setExpanded']);
const TOOLBAR_TRIGGERS = /^(focus|selection|tree|rowDragDrop|sort|filter|search)\./;

const list = (ids: RowId | readonly RowId[]): RowId[] => (typeof ids === 'string' ? [ids] : [...ids]);

/** The `tree` feature controller: keys and wrappers now, events after mount, prop sync, the tree API. */
export function createTreeUi(instance: AnyInstance, deferred: readonly DeferredModule<unknown>[]): DataGridFeatureUi {
  const ui = new DataGridTreeUi(instance, deferred);
  return { mount: () => ui.mount(), sync: (props, prev) => ui.sync(props, prev), api: ui.api() };
}

export class DataGridTreeUi {
  readonly instance: AnyInstance;
  readonly tree: TreeFacade;
  private readonly setup: TreeSetup;
  private readonly rowDrag: DeferredModule<unknown> | null;
  private keys = false;

  constructor(instance: AnyInstance, deferred: readonly DeferredModule<unknown>[]) {
    this.instance = instance;
    this.tree = treeOf(instance) as TreeFacade;
    this.setup = setupOf(instance.props as NormalizedProps);
    this.rowDrag = this.setup.rowDrag && deferred.includes(this.setup.rowDrag) ? this.setup.rowDrag : null;
    const engine = instance.engine;
    // `getState()` / `restoreState()` and the `persistState` binding include `tree.expandedRows`.
    const persistence = instance.persistence as unknown as { state: Parameters<typeof withTreeState>[0]; fns: Parameters<typeof withTreePersistence>[0] };
    persistence.state = withTreeState(persistence.state, engine);
    persistence.fns = withTreePersistence(persistence.fns);
    // Copies widened by `tree.copyMode` (the clipboard code reads the hook).
    treeCopyHooks.set(engine, (rowIds) => {
      const mode = this.tree.getInfo().copyMode;
      const structure = treeStructureOf(engine.getSnapshot().rows);
      return mode === 'none' || !structure ? rowIds : treeCopyRowIds(structure, rowIds, mode);
    });
    this.setup.onRemoteError = (rowId, error) => this.reportLoadError(rowId, error);
    // The tree key commands join the default table. The keymap builder of this grid's interaction is
    // replaced here (not in interaction.ts) so a grid without `tree` carries no bytes for it.
    const interaction = instance.interaction as unknown as { keymap: Keymap; buildKeymap(platform: 'mac' | 'other'): Keymap };
    const table = [...DEFAULT_KEY_BINDINGS, ...TREE_KEYS];
    const gridId = instance.gridId;
    interaction.buildKeymap = (platform) =>
      createKeymap({ platform, table, bindings: instance.props.keyBindings ?? {}, warn: (code, message) => warnOnce(`${gridId}:${code}:${message}`, `DataGrid "${gridId}": ${message}`) });
    interaction.keymap = interaction.buildKeymap(interaction.keymap.platform);
    // Toolbar items `indent` / `outdent`: the focused or selected rows, disabled when they cannot move
    // (this grid's item state is wrapped, for the same reason).
    const chrome = instance.chrome;
    const itemState = chrome.toolbarItemState.bind(chrome);
    chrome.toolbarItemState = (item, p, editDisabled) => {
      const state = itemState(item, p, editDisabled);
      const id = item.builtIn;
      if (state.disabled || (id !== 'indent' && id !== 'outdent')) return state;
      const rows = this.targetRows();
      return (id === 'indent' ? this.tree.canIndent(rows) : this.tree.canOutdent(rows)) ? state : { disabled: true, reason: undefined };
    };
    chrome.registerCommandHandler('tree.indent', () => this.move(true, 'pointer'));
    chrome.registerCommandHandler('tree.outdent', () => this.move(false, 'pointer'));
    if (DEV) {
      const p = instance.props;
      // Tree wins: grouping and child grids do not combine with a tree.
      if (p.grouping) warnOnce(`${instance.gridId}:tree-grouping`, `DataGrid "${instance.gridId}": \`grouping\` is ignored in tree mode (tree wins); remove the grouping prop.`);
      if (p.childGrid) warnOnce(`${instance.gridId}:tree-childGrid`, `DataGrid "${instance.gridId}": \`childGrid\` does not combine with \`tree\` (tree wins); use renderDetail for detail rows.`);
    }
  }

  // --- reads ---------------------------------------------------------------

  focusedRow(): RowId | null {
    const t = this.instance.interaction.focusTarget();
    return t?.kind === 'cell' && !t.rowId.startsWith('__') ? t.rowId : null;
  }

  /** Rows an indent, outdent or toolbar item acts on: the selection when it holds the focused row, else the focused row. */
  private targetRows(): RowId[] {
    const focused = this.focusedRow();
    const selection = (this.instance.engine as unknown as { selection?: { getSelectedRowIds(): readonly RowId[] } }).selection;
    const selected = selection?.getSelectedRowIds() ?? [];
    if (focused === null) return [...selected];
    return selected.includes(focused) ? [...selected] : [focused];
  }

  private label(rowId: RowId): string {
    return treeRowLabel(this.instance, rowId);
  }

  // --- indent / outdent (keys: tree-client-chunk.ts) -------------------------

  move(indent: boolean, source: DataGridEventSource): boolean {
    const rows = this.targetRows();
    if (!rows.length) return false;
    this.instance.dispatchFrom(source, { type: indent ? 'tree.indent' : 'tree.outdent', rowIds: rows });
    return true;
  }

  // --- events -----------------------------------------------------------------

  private toggleEvent(type: string, source: DataGridEventSource, rowId: RowId, expanded: boolean, loaded = false): DataGridTreeToggleEvent<unknown> {
    const info = this.tree.getTreeRow(rowId);
    const row = this.instance.engine.getRow(rowId) ?? null;
    const field = this.tree.getInfo().hasChildrenField;
    const lazy = field !== null && Boolean((row as Record<string, unknown> | null)?.[field]) && (loaded || info?.loadStatus !== 'loaded');
    return gridEvent<DataGridTreeToggleEvent<unknown>>(type, source, { rowId, row, expanded, depth: info?.depth ?? 0, lazy });
  }

  /** Rows a single-row tree command changes, with their current state. */
  private targetsOf(command: DataGridCommand): Map<RowId, boolean> {
    const out = new Map<RowId, boolean>();
    const t = command.type;
    const ids = t === 'tree.expandFocused' || t === 'tree.collapseFocused' ? [this.focusedRow()] : Array.isArray(command['rowIds']) ? (command['rowIds'] as RowId[]) : [command['rowId'] as RowId];
    for (const id of ids) {
      if (typeof id !== 'string') continue;
      const info = this.tree.getTreeRow(id);
      if (!info?.hasChildren) continue;
      const next = t === 'tree.expand' || t === 'tree.expandFocused' ? true : t === 'tree.collapse' || t === 'tree.collapseFocused' ? false : typeof command['expanded'] === 'boolean' ? (command['expanded'] as boolean) : !info.expanded;
      if (next !== info.expanded) out.set(id, info.expanded);
    }
    return out;
  }

  /** The state a bulk tree command gives a parent row, or null when it leaves it alone. */
  private bulkNext(command: DataGridCommand, rowId: RowId): boolean | null {
    const t = command.type;
    if (t === 'tree.expandAll') return true;
    if (t === 'tree.collapseAll') return false;
    if (t === 'tree.expandLevel' || t === 'tree.collapseLevel') return this.tree.getTreeRow(rowId)?.depth === command['depth'] ? t === 'tree.expandLevel' : null;
    const v = (command['expanded'] as Record<string, unknown> | undefined)?.[rowId];
    return typeof v === 'boolean' ? v : null;
  }

  /** Expansion of the rendered parent rows (expand all, levels). */
  private renderedStates(): Map<RowId, boolean> {
    const out = new Map<RowId, boolean>();
    const { start, end } = this.instance.layout.getRowWindow();
    const engine = this.instance.engine;
    for (let i = start; i < end; i++) {
      const id = engine.getRowIdAt(i);
      if (id === undefined || id.startsWith('__')) continue;
      const info = this.tree.getTreeRow(id);
      if (info?.hasChildren) out.set(id, info.expanded);
    }
    return out;
  }

  private reportLoadError(rowId: RowId, error: unknown): void {
    const interaction = this.instance.interaction;
    interaction.announce(treeText(interaction.text, 'treeLoadError'));
    const onError = this.instance.props.onError;
    if (onError) onError(gridEvent<DataGridErrorEvent>('error', 'api', { error: error instanceof Error ? error : new Error(String(error)), action: 'treeChildren', rowId } as never));
  }

  mount(): () => void {
    const instance = this.instance;
    const engine = instance.engine;
    let live = true;
    // The key handlers and the skeleton row: the client chunk (it carries the chunking hub), keys once per grid.
    if (!this.keys) {
      this.keys = true;
      // Tree keys on a body cell before the chunk are held (not run as plain grid keys) and replayed once it registers them.
      const root = instance.root;
      const held = clientChunk || !root ? null : holdInput(root, ['keydown'], (e) => (e.target as Element).matches('.salmon-data-grid-cell') && CHUNK_COMMANDS.has(instance.interaction.keymap.resolve(e as KeyboardEvent, 'body') as string));
      loadClientChunk().then(
        (m) => {
          const keys = held?.() ?? [];
          if (engine.disposed) return;
          m.registerTreeKeys(this, checkRow, treeColumnId);
          // From where focus is now (each replayed key may move it), while it is still in this grid.
          replayInput(keys, () => {
            const focused = (root as HTMLElement).ownerDocument.activeElement;
            return root?.contains(focused) ? focused : null;
          });
        },
        () => held?.(),
      );
    }
    // The indent stand-in's real module: the row drag chunk (it carries the chunking hub), client only.
    if (this.rowDrag) {
      const d = this.rowDrag;
      void import('./row-drag-chunk.js').then((m) => {
        if (live) d.resolve(m.createRowDragDropModule());
      }, () => undefined);
    }
    let pending: { readonly rows: Map<RowId, boolean>; readonly source: DataGridEventSource } | null = null;
    // Lazy parents whose expand waits for its children: `onTreeToggle` fires when they arrive.
    const awaitingLoad = new Map<RowId, DataGridEventSource>();
    const offBefore = engine.onBeforeCommand((event) => {
      const command = event.command;
      const single = ONE_ROW.has(command.type);
      if (!single && !ALL_ROWS.has(command.type)) return undefined;
      pending = null;
      if (instance.isSyncing()) return undefined;
      const source = instance.currentSource();
      if (!single) {
        const before = instance.props.onBeforeTreeToggle;
        const states = before || instance.props.onTreeToggle ? this.renderedStates() : null;
        // Bulk toggles: one cancelable before event per rendered parent that changes; any cancel stops the command.
        if (before && states) {
          for (const [rowId, was] of states) {
            const next = this.bulkNext(command, rowId);
            if (next === null || next === was) continue;
            const e = this.toggleEvent('beforeTreeToggle', source, rowId, next);
            before(e);
            if (e.defaultPrevented) return false;
          }
        }
        if (instance.props.onTreeToggle && states) pending = { rows: states, source };
        return undefined;
      }
      const rows = this.targetsOf(command);
      const before = instance.props.onBeforeTreeToggle;
      if (before) {
        for (const [rowId, was] of rows) {
          const e = this.toggleEvent('beforeTreeToggle', source, rowId, !was);
          before(e);
          if (e.defaultPrevented) return false;
        }
      }
      pending = { rows, source };
      return undefined;
    });
    let lastColumn = treeColumnId(instance);
    const wantsToolbar = (instance.props.toolbar ?? []).some((item) => {
      const id = typeof item === 'string' ? item : item.id;
      return id === 'indent' || id === 'outdent';
    });
    const offAfter = engine.onCommand((event: CommandEvent) => {
      const type = event.command.type;
      const applied = event.result.status === 'applied';
      if (wantsToolbar && TOOLBAR_TRIGGERS.test(type)) (instance.chrome as unknown as { bumpToolbar(): void }).bumpToolbar();
      if (type === 'tree.loaded' && applied) {
        const status = event.command['status'];
        const loadedId = String(event.command['rowId']);
        const waiting = status === 'loading' ? undefined : awaitingLoad.get(loadedId);
        if (status !== 'loading') awaitingLoad.delete(loadedId);
        if (status === 'loaded' && waiting && this.tree.getTreeRow(loadedId)?.expanded) instance.props.onTreeToggle?.(this.toggleEvent('treeToggle', waiting, loadedId, true, true));
        const interaction = instance.interaction;
        if (status === 'loading') interaction.announce(treeText(interaction.text, 'treeLoading'));
        else if (status === 'error' && !this.setup.remote) this.reportLoadError(String(event.command['rowId']), new Error(String(event.command['error'] ?? 'error')));
        return;
      }
      // A retry or an explicit load starts without a `tree.loaded` command: announce it the same way.
      if ((type === 'tree.retry' || type === 'tree.loadChildren') && applied && this.tree.getTreeRow(String(event.command['rowId']))?.loadStatus === 'loading') {
        const interaction = instance.interaction;
        interaction.announce(treeText(interaction.text, 'treeLoading'));
        return;
      }
      const before = pending;
      if (!before || (!ONE_ROW.has(type) && !ALL_ROWS.has(type))) return;
      pending = null;
      if (!applied) return;
      const handler = instance.props.onTreeToggle;
      const interaction = instance.interaction;
      for (const [rowId, was] of before.rows) {
        const info = this.tree.getTreeRow(rowId);
        const now = info ? info.expanded : was;
        if (now === was) {
          if (!was && info && !type.includes('ollapse') && (info.loadStatus === 'loading' || info.loadStatus === 'idle')) awaitingLoad.set(rowId, before.source);
          continue;
        }
        handler?.(this.toggleEvent('treeToggle', before.source, rowId, now));
        // Live region: one message per single-row toggle.
        if (ONE_ROW.has(type) && info && info.loadStatus !== 'loading') {
          const row = this.label(rowId);
          interaction.announce(now ? treeText(interaction.text, 'treeExpanded', { row, count: info.childCount }) : treeText(interaction.text, 'treeCollapsed', { row }));
        }
      }
    });
    // `infiniteScroll` in tree mode: the root block watcher of the remote tree chunk, once it loads.
    let offBlocks = (): void => {};
    const remote = this.setup.remote;
    const inf = infiniteOf(instance.props as NormalizedProps);
    if (remote && inf) {
      void remote.load().then(({ chunk, remote: r }) => {
        if (live) offBlocks = chunk.watchRootBlocks(instance, r, inf);
      }, () => undefined);
    }
    // The tree column follows reorder, pinning and hiding: the old and new columns' cells re-render.
    const offColumns = engine.subscribe(() => {
      const next = treeColumnId(instance);
      if (next === lastColumn) return;
      const changed = [lastColumn, next].filter((id): id is string => id !== null);
      lastColumn = next;
      (instance as unknown as { bumpColumnRender(ids: readonly string[]): void }).bumpColumnRender(changed);
    });
    return () => {
      live = false;
      offBefore();
      offAfter();
      offColumns();
      offBlocks();
    };
  }

  // --- prop sync ----------------------------------------------------------------

  sync(props: NormalizedProps, prev: NormalizedProps): void {
    const instance = this.instance;
    const local = this.setup.local;
    const next = treeOptionsOf(props);
    const was = treeOptionsOf(prev);
    if (!next) return;
    if (local && props.data !== prev.data && Array.isArray(props.data)) {
      const field = childrenFieldOf(next as DataGridTree<unknown>);
      if (field !== null) local.setRows(flattenTree(props.data, field));
    }
    if (next === was && props.aggregates === prev.aggregates) return;
    if (next.expandedRows !== was?.expandedRows) instance.syncDispatch({ type: 'tree.setExpanded', expanded: { ...(next.expandedRows ?? {}) } });
    const options: Record<string, unknown> = {};
    const diff = (key: string, value: unknown, old: unknown): void => {
      if (value !== old && value !== undefined) options[key] = value;
    };
    diff('filterMode', next.filterMode, was?.filterMode);
    diff('copyMode', next.copyMode, was?.copyMode);
    diff('pageBy', next.pageBy, was?.pageBy);
    diff('defaultExpanded', next.defaultExpanded, was?.defaultExpanded);
    if (next.column !== was?.column) options['column'] = next.column ?? null;
    if (next.checkbox !== was?.checkbox) {
      options['checkbox'] = next.checkbox !== undefined && next.checkbox !== false;
      options['cascade'] = typeof next.checkbox === 'object' ? (next.checkbox.cascade ?? false) : false;
    }
    const summary = hasChildFooter(props.aggregates);
    if (summary !== hasChildFooter(prev.aggregates)) options['childSummary'] = summary;
    if (Object.keys(options).length) instance.syncDispatch({ type: 'tree.setOptions', ...options });
  }

  // --- API ------------------------------------------------------------------------

  api(): Partial<DataGridApi<unknown>> {
    const instance = this.instance;
    const d = (command: DataGridCommand) => instance.dispatchFrom('api', command);
    return {
      expandAllTreeRows: () => d({ type: 'tree.expandAll' }),
      collapseAllTreeRows: () => d({ type: 'tree.collapseAll' }),
      expandTreeLevel: (depth) => d({ type: 'tree.expandLevel', depth }),
      collapseTreeLevel: (depth) => d({ type: 'tree.collapseLevel', depth }),
      expandTreeRows: (rowIds) => d({ type: 'tree.expand', rowIds: list(rowIds) }),
      collapseTreeRows: (rowIds) => d({ type: 'tree.collapse', rowIds: list(rowIds) }),
      toggleTreeRow: (rowId, expanded) => d(expanded === undefined ? { type: 'tree.toggle', rowId } : { type: 'tree.toggle', rowId, expanded }),
      indentRows: (rowIds) => d({ type: 'tree.indent', rowIds: list(rowIds) }),
      outdentRows: (rowIds) => d({ type: 'tree.outdent', rowIds: list(rowIds) }),
      getTreeRow: (rowId) => this.tree.getTreeRow(rowId),
      getChildRows: (rowId) => this.tree.getChildRows(rowId),
      reloadTreeChildren: (rowId) => d({ type: 'tree.retry', rowId }),
      // `moveRows(rowIds, { targetRowId, position })` works without `rowDrag` too.
      moveRows: (rowIds, to) =>
        typeof to === 'object' ? d({ type: 'rowDragDrop.move', rowIds: list(rowIds), targetRowId: to.targetRowId, position: to.position }) : instance.rowDragUi.moveRows(rowIds, to),
    };
  }
}
