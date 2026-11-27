// Detail rows and child grids between `DataGridProps` and the engine:
// module registration, engine options, the detail events
// (`onBeforeDetailToggle` / `onDetailToggle`), keyboard commands, the API
// methods, and the registry of mounted child grids. No rendering here
// (detail.tsx renders). Public names are the binding names; the core
// names (`detail.*` commands, `hierarchy.childGrid`) stay in this layer.
// The controller is reached through the `detail` render feature
// (feature-detail.tsx). The static public exports `DETAIL_COLUMN_ID` and
// `defineChildGrid` live in child-grid.ts, so an app that imports them does
// not pull this module (a module that a static and a lazy importer share
// lands in the static chunk).

import type { CommandEvent, DataGridCommand, DataGridModule, RowId } from '@salmonui/data-grid/engine';
import { createDetailModule, detailParentId, detailRowId, type DetailLoadSnapshot } from '@salmonui/data-grid/engine/expansion';
import { createHierarchyModule } from '@salmonui/data-grid/engine/hierarchy';
import { DETAIL_COLUMN_ID } from './child-grid.js';
import { gridEvent } from '@salmonui/core/internal/events';
import { hasDetailContent } from './features/detect.js';
import type { DataGridFeatureUi, NormalizedProps } from './features/types.js';
import type { DataGridInstance } from './instance.js';
import type { DataGridChildGrid, DataGridDetailApi, DataGridDetailToggleEvent } from './detail-types.js';
import type { DataGridApi, DataGridProps } from './types.js';

export { DETAIL_COLUMN_ID } from './child-grid.js';

type DetailFacade = {
  isExpanded(rowId: RowId): boolean;
  getLoad(rowId: RowId): DetailLoadSnapshot;
};

/** The detail and hierarchy modules the detail props need that the app does not pass. */
export function detailModules(props: NormalizedProps, modules: readonly DataGridModule<unknown>[]): readonly DataGridModule<unknown>[] {
  if (!hasDetailContent(props)) return [];
  const names = new Set(modules.map((m) => m.name));
  const extra: DataGridModule<unknown>[] = [];
  if (!names.has('detail')) extra.push(createDetailModule<unknown>() as unknown as DataGridModule<unknown>);
  if (props.childGrid && !names.has('hierarchy')) extra.push(createHierarchyModule<unknown>() as unknown as DataGridModule<unknown>);
  return extra;
}

function leafFields(columns: readonly { readonly field?: string; readonly primaryKey?: boolean; readonly columns?: readonly unknown[] }[] | undefined): string | null {
  for (const c of columns ?? []) {
    if (c.columns?.length) {
      const nested = leafFields(c.columns as never);
      if (nested) return nested;
    } else if (c.primaryKey && c.field) return c.field;
  }
  return null;
}

/** Child row id getter: `getRowId`, else the `primaryKey` column, else the `id` field (as the root grid). */
export function childRowIdOf<Child>(childGrid: DataGridChildGrid<Child>): (row: Child) => RowId {
  const get = childGrid.getRowId;
  if (get) return (row) => String(get(row));
  const field = leafFields(childGrid.columns as never) ?? 'id';
  return (row) => String((row as Record<string, unknown> | null)?.[field]);
}

/** Core `ChildGridConfig` of a `childGrid` prop (export and `getChildGrid` descriptors). */
function coreChildGrid(childGrid: DataGridChildGrid): Record<string, unknown> {
  const { data, joinField, parentField, childField, columns, childGrid: nested } = childGrid;
  const getRowId = childRowIdOf(childGrid);
  return {
    ...(joinField !== undefined ? { relationField: joinField } : {}),
    ...(parentField !== undefined ? { parentField } : {}),
    ...(childField !== undefined ? { childField } : {}),
    data,
    getRowId: (row: unknown) => getRowId(row),
    columns: columns ?? [],
    ...(nested ? { childGrid: coreChildGrid(nested) } : {}),
  };
}

/** Engine options of the detail and hierarchy modules (`options.detail`, `options.hierarchy`). */
export function detailEngineOptions<Row>(props: DataGridProps<Row>, latest: () => DataGridProps<Row>): Record<string, unknown> {
  if (!hasDetailContent(props)) return {};
  const initial = props.defaultExpandedDetails;
  const detail = {
    enabled: true,
    ...(initial === true ? { defaultExpanded: true } : {}),
    ...(Array.isArray(initial) ? { expanded: Object.fromEntries((initial as readonly RowId[]).map((id) => [id, true])) } : {}),
    ...(props.hasDetail ? { hasDetail: (row: Row) => latest().hasDetail?.(row) ?? true } : {}),
    ...(props.loadDetail ? { load: (ctx: never) => latest().loadDetail?.(ctx) } : {}),
    ...(props.detailHeight !== undefined ? { height: props.detailHeight } : {}),
  };
  return {
    detail,
    ...(props.childGrid ? { hierarchy: { childGrid: coreChildGrid(props.childGrid as DataGridChildGrid) } } : {}),
  };
}

const DETAIL_TOGGLES = new Set(['detail.expand', 'detail.collapse', 'detail.toggle']);
const DETAIL_ALL = new Set(['detail.expandAll', 'detail.collapseAll', 'detail.setExpanded']);
const KEY_PRIORITY = 20;
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]';

/** Detail controller of each instance with the `detail` feature (detail.tsx and the tests read it). */
const uis = new WeakMap<object, DataGridDetailUi<unknown>>();

/** The detail controller of a grid with the `detail` feature, else null. */
export function detailUiOf<Row>(instance: DataGridInstance<Row>): DataGridDetailUi<Row> | null {
  return (uis.get(instance) as DataGridDetailUi<Row> | undefined) ?? null;
}

/** The `detail` feature controller: keys now, the detail events after mount, prop sync, the detail API. */
export function createDetailUi(instance: DataGridInstance<unknown>): DataGridFeatureUi {
  const ui = new DataGridDetailUi(instance);
  uis.set(instance, ui);
  return {
    mount: () => ui.mount(),
    sync: (props, prev) => ui.sync(prev, props),
    api: ui.api(),
  };
}

/**
 * Detail behavior of one grid: state reads for the renderer, events,
 * keyboard commands, API methods, and the mounted child grids. Created
 * once per grid; `enabled` is fixed for the grid lifetime (modules are
 * initial).
 */
export class DataGridDetailUi<Row> {
  private readonly instance: DataGridInstance<Row>;
  readonly enabled: boolean;
  readonly hierarchy: boolean;
  readonly hasLoader: boolean;
  private readonly children = new Map<RowId, DataGridApi<unknown>>();
  /** Bumped when a render prop of the detail content changes, so mounted detail rows re-render. */
  private renderVersion = 0;
  private readonly renderListeners = new Set<() => void>();

  constructor(instance: DataGridInstance<Row>) {
    this.instance = instance;
    const engine = instance.engine;
    this.enabled = engine.getModuleState('detail') !== undefined && hasDetailContent(instance.props);
    this.hierarchy = this.enabled && instance.props.childGrid !== undefined;
    this.hasLoader = instance.props.loadDetail !== undefined;
    if (this.enabled) this.registerKeys();
  }

  private facade(): DetailFacade {
    return (this.instance.engine as unknown as { detail: DetailFacade }).detail;
  }

  isExpanded(rowId: RowId): boolean {
    return this.enabled && this.facade().isExpanded(rowId);
  }

  /** `hasDetail` of a data row (render-time, rendered rows only). */
  hasDetail(row: Row | undefined): boolean {
    if (!this.enabled || row === undefined) return false;
    const has = this.instance.props.hasDetail;
    return has ? has(row) : true;
  }

  /** A pinned row: it shows no detail row and no toggle. */
  isPinnedRow(rowId: RowId): boolean {
    const engine = this.instance.engine;
    const pinned = engine.getSnapshot().rows.pinned?.length ?? 0;
    if (pinned === 0) return false;
    const index = engine.getRowIndex(rowId);
    return index >= 0 && index < pinned;
  }

  /** Expansion of a data row (toggle `aria-expanded`, row `data-expanded`): undefined for rows without a detail and pinned rows. */
  ariaExpanded(rowId: RowId): boolean | undefined {
    if (!this.enabled) return undefined;
    if (!this.hasDetail(this.instance.engine.getRow(rowId)) || this.isPinnedRow(rowId)) return undefined;
    return this.facade().isExpanded(rowId);
  }

  getLoad(parentRowId: RowId): DetailLoadSnapshot {
    return this.facade().getLoad(parentRowId);
  }

  toggle(rowId: RowId, source: 'pointer' | 'keyboard' | 'api', expanded?: boolean): void {
    this.instance.dispatchFrom(source, expanded === undefined ? { type: 'detail.toggle', rowId } : { type: 'detail.toggle', rowId, expanded });
  }

  readonly subscribeRender = (listener: () => void): (() => void) => {
    this.renderListeners.add(listener);
    return () => this.renderListeners.delete(listener);
  };

  readonly getRenderVersion = (): number => this.renderVersion;

  /** Prop sync (layout effect): a changed `renderDetail` or `childGrid` re-renders mounted detail rows. */
  sync(prev: DataGridProps<Row>, props: DataGridProps<Row>): void {
    if (!this.enabled) return;
    if (prev.renderDetail !== props.renderDetail || prev.childGrid !== props.childGrid) {
      this.renderVersion++;
      for (const listener of this.renderListeners) listener();
    }
  }

  registerChild(parentRowId: RowId, api: DataGridApi<unknown> | null): void {
    if (api) this.children.set(parentRowId, api);
    else this.children.delete(parentRowId);
  }

  /** Before/after command hooks of the detail events. Event objects are created only for bound handlers. */
  mount(): () => void {
    if (!this.enabled) return () => {};
    const engine = this.instance.engine;
    let pending: { readonly rows: Map<RowId, boolean>; readonly source: DataGridDetailToggleEvent<Row>['source'] } | null = null;
    const offBefore = engine.onBeforeCommand((event) => {
      const command = event.command;
      if (!DETAIL_TOGGLES.has(command.type) && !DETAIL_ALL.has(command.type)) return undefined;
      pending = null;
      const p = this.instance.props;
      if (this.instance.isSyncing() || (!p.onBeforeDetailToggle && !p.onDetailToggle)) return undefined;
      const source = this.instance.currentSource();
      if (DETAIL_TOGGLES.has(command.type)) {
        const rowId = String(command['rowId'] ?? '');
        const current = this.isExpanded(rowId);
        const next = command.type === 'detail.expand' ? true : command.type === 'detail.collapse' ? false : typeof command['expanded'] === 'boolean' ? (command['expanded'] as boolean) : !current;
        if (next === current) return undefined;
        if (p.onBeforeDetailToggle) {
          const e = this.toggleEvent('beforeDetailToggle', source, rowId, next);
          p.onBeforeDetailToggle(e);
          if (e.defaultPrevented) return false;
        }
        pending = { rows: new Map([[rowId, current]]), source };
        return undefined;
      }
      // Expand all / collapse all: events for the rendered rows whose state changes.
      pending = { rows: this.renderedStates(), source };
      return undefined;
    });
    const offAfter = engine.onCommand((event: CommandEvent) => {
      const before = pending;
      if (!before || (!DETAIL_TOGGLES.has(event.command.type) && !DETAIL_ALL.has(event.command.type))) return;
      pending = null;
      if (event.result.status !== 'applied') return;
      const handler = this.instance.props.onDetailToggle;
      if (!handler) return;
      for (const [rowId, was] of before.rows) {
        const now = this.isExpanded(rowId);
        if (now !== was) handler(this.toggleEvent('detailToggle', before.source, rowId, now));
      }
    });
    return () => {
      offBefore();
      offAfter();
      this.children.clear();
    };
  }

  private toggleEvent(type: string, source: DataGridDetailToggleEvent<Row>['source'], rowId: RowId, expanded: boolean): DataGridDetailToggleEvent<Row> {
    return gridEvent<DataGridDetailToggleEvent<Row>>(type, source, { rowId, row: this.instance.engine.getRow(rowId) ?? null, expanded });
  }

  /** Expanded state of the rendered data rows with a detail. */
  private renderedStates(): Map<RowId, boolean> {
    const out = new Map<RowId, boolean>();
    const { start, end } = this.instance.layout.getRowWindow();
    const engine = this.instance.engine;
    for (let i = start; i < end; i++) {
      const id = engine.getRowIdAt(i);
      if (id === undefined || id.startsWith('__')) continue;
      if (this.hasDetail(engine.getRow(id)) && !this.isPinnedRow(id)) out.set(id, this.isExpanded(id));
    }
    return out;
  }

  /** Focuses the first focusable element of a detail row's content (Enter on a detail row). */
  focusContent(parentRowId: RowId): boolean {
    const rows = this.instance.root;
    const row = rows?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(detailRowId(parentRowId))}"] .salmon-data-grid-detail`);
    const target = row?.querySelector<HTMLElement>(FOCUSABLE);
    if (!target) return false;
    target.focus();
    return true;
  }

  /** Enter / Space on the toggle column, Enter on a detail row, Ctrl+ArrowUp / ArrowDown. */
  private registerKeys(): void {
    const interaction = this.instance.interaction;
    const engine = this.instance.engine;
    const focused = (): { rowId: RowId; columnId: string } | null => {
      const t = interaction.focusTarget();
      return t?.kind === 'cell' ? { rowId: t.rowId, columnId: t.columnId } : null;
    };
    const toggleFocused = (): boolean => {
      const t = focused();
      if (!t || t.columnId !== DETAIL_COLUMN_ID || t.rowId.startsWith('__')) return false;
      if (!this.hasDetail(engine.getRow(t.rowId)) || this.isPinnedRow(t.rowId)) return false;
      this.toggle(t.rowId, 'keyboard');
      return true;
    };
    const enter = (): boolean => {
      if (toggleFocused()) return true;
      const t = focused();
      const parent = t ? detailParentId(t.rowId) : null;
      if (parent === null) return false;
      return this.focusContent(parent) || true;
    };
    interaction.registerKeyHandler('selection.enterDown', enter, KEY_PRIORITY);
    interaction.registerKeyHandler('selection.toggle', toggleFocused, KEY_PRIORITY);
    // Below the grouping handlers: with groups, Ctrl+ArrowUp / ArrowDown keep collapsing groups.
    interaction.registerKeyHandler('group.expandAll', () => {
      if (engine.getSnapshot().query.grouping.length > 0) return false;
      this.instance.dispatchFrom('keyboard', { type: 'detail.expandAll' });
      return true;
    }, 5);
    interaction.registerKeyHandler('group.collapseAll', () => {
      if (engine.getSnapshot().query.grouping.length > 0) return false;
      this.instance.dispatchFrom('keyboard', { type: 'detail.collapseAll' });
      return true;
    }, 5);
  }

  /** `DataGridDetailApi` methods (without `moveRows`). */
  api(): Omit<DataGridDetailApi, 'moveRows'> {
    const dispatch = (command: DataGridCommand) =>
      this.enabled ? this.instance.dispatchFrom('api', command) : ({ status: 'rejected', reason: 'detail rows are off (set renderDetail or childGrid)' } as const);
    return {
      expandDetail: (rowId) => dispatch({ type: 'detail.expand', rowId }),
      collapseDetail: (rowId) => dispatch({ type: 'detail.collapse', rowId }),
      toggleDetail: (rowId, expanded) => dispatch(expanded === undefined ? { type: 'detail.toggle', rowId } : { type: 'detail.toggle', rowId, expanded }),
      expandAllDetails: () => dispatch({ type: 'detail.expandAll' }),
      collapseAllDetails: () => dispatch({ type: 'detail.collapseAll' }),
      isDetailExpanded: (rowId) => this.isExpanded(rowId),
      getChildGrid: (rowId) => this.children.get(rowId) ?? null,
    };
  }
}
