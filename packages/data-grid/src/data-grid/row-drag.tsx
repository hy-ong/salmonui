'use client';

// Row drag and drop, the host of the `rowDrag` render feature
// (`features/feature-row-drag.ts`): the
// `rowDrag` prop helpers, the engine options, a stand-in for the core
// `rowDragDrop` module, the drag handle column, the indicator / preview
// layer and its store, and the bindings (handle pointer down,
// Alt+Shift+ArrowUp / ArrowDown, `moveRows`) that forward to the drag
// controller. The controller and the core module are the lazy
// `row-drag-chunk.ts`, warmed in parallel with the feature and installed in
// mount. At rest (no drag) the
// stand-in renders the same markup. Without `rowDrag` the instance holds
// the inert host of `features/inert.ts`.

import { memo, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { CommandResult, DataGridModule, RowDragHandoff, RowId } from '@salmonui/data-grid/engine';
import { createInitialRowDragState, createRowDragHandoff, ROW_DRAG_COMMANDS } from '@salmonui/data-grid/engine/row-drag-state';
import { DEV, warnOnce } from '@salmonui/core/internal/dev';
import { useDataGridInstance } from './context.js';
import { deferModule, type DeferredModule } from './deferred-module.js';
import type { DataGridMoveTarget, DataGridRowDrag, DataGridRowDragPreviewContext } from './detail-types.js';
import { customIcon, useDataGridIcons } from './icons.js';
import type { DataGridInstance } from './instance.js';
import type { RowDragController } from './row-drag-controller.js';
import { ROW_DRAG_COLUMN_ID } from './row-drag-id.js';
import type { DataGridActionResult, DataGridCellContext, DataGridColumn, DataGridProps } from './types.js';

/** The lazy row drag chunk. */
type RowDragChunk = typeof import('./row-drag-chunk.js');

let chunkLoad: Promise<RowDragChunk> | null = null;
let loadedChunk: RowDragChunk | null = null;

/** Starts (once) and returns the row drag chunk load (a load cache, not render state). */
export function loadRowDragChunk(): Promise<RowDragChunk> {
  return (chunkLoad ??= import('./row-drag-chunk.js').then((chunk) => (loadedChunk = chunk)));
}

/** `rowDrag` prop as an object (`true`: defaults; `false` and absent: null). */
export function rowDragOf(props: { readonly rowDrag?: boolean | DataGridRowDrag | undefined }): DataGridRowDrag | null {
  const r = props.rowDrag;
  if (!r) return null;
  return r === true ? {} : r;
}

/**
 * Default registry shared by every `DataGrid` on the page, so `rowDrag.targetId`
 * works without wiring. It holds only the payload of an active pointer drag
 * (set and cleared by event handlers); renders never read or write it.
 */
let sharedHandoff: RowDragHandoff | null = null;
function defaultHandoff(): RowDragHandoff {
  return (sharedHandoff ??= createRowDragHandoff());
}

/** At-rest results of the `rowDragDrop` methods (no drag until the module loads). */
const AT_REST = { getPayload: () => null, getSession: () => null, getEventArgs: () => null };

/**
 * The row drag module the `rowDrag` prop adds (none when the app passes
 * one): the real module once the chunk is loaded, else a stand-in collected
 * in `deferred` and resolved by `DataGridRowDragUi` when the chunk arrives.
 */
export function rowDragModules<Row>(props: DataGridProps<Row>, modules: readonly DataGridModule<Row>[], deferred: DeferredModule<Row>[]): readonly DataGridModule<Row>[] {
  if (!rowDragOf(props) || modules.some((m) => m.name === 'rowDragDrop')) return [];
  if (loadedChunk) return [loadedChunk.createRowDragDropModule<Row>() as unknown as DataGridModule<Row>];
  const d = deferModule<Row>({ name: 'rowDragDrop', inSnapshot: false, commands: ROW_DRAG_COMMANDS, initialState: createInitialRowDragState<Row>, methods: AT_REST, notify: true });
  deferred.push(d);
  return [d.module as unknown as DataGridModule<Row>];
}

/** Engine options of the row drag module (`options.rowDragDrop`). */
export function rowDragEngineOptions<Row>(props: DataGridProps<Row>): Record<string, unknown> {
  const r = rowDragOf(props);
  if (!r) return {};
  return {
    rowDragDrop: {
      enabled: true,
      allowGroupChange: r.acrossGroups ?? false,
      ...(r.orderField !== undefined ? { orderField: r.orderField } : {}),
      handoff: r.handoff ?? defaultHandoff(),
    },
  };
}

export class DataGridRowDragUi<Row> {
  private readonly instance: DataGridInstance<Row>;
  readonly enabled: boolean;
  readonly handoff: RowDragHandoff | null;
  private indicator: HTMLElement | null = null;
  private preview: HTMLElement | null = null;
  private previewState: DataGridRowDragPreviewContext<Row> | null = null;
  private readonly previewListeners = new Set<() => void>();
  private controller: RowDragController<Row> | null = null;
  private readonly deferred: readonly DeferredModule<Row>[];
  /** Props the engine options were built from (synced into the module when it loads). */
  private readonly initialProps: DataGridProps<Row>;
  private mounted = false;
  /** Work waiting for the chunk and the mount (early keyboard moves, `moveRows`). */
  private queue: (() => void)[] = [];

  constructor(instance: DataGridInstance<Row>, deferred: readonly DeferredModule<Row>[] = []) {
    this.instance = instance;
    this.enabled = instance.engine.getModuleState('rowDragDrop') !== undefined && rowDragOf(instance.props) !== null;
    this.handoff = this.enabled ? (rowDragOf(instance.props)?.handoff ?? defaultHandoff()) : null;
    this.deferred = deferred.filter((d) => d.module.name === 'rowDragDrop');
    this.initialProps = instance.props;
    if (!this.enabled) return;
    this.registerKeys();
    if (loadedChunk && this.deferred.length === 0) this.attach(loadedChunk);
    // Warm the chunk on the client (a cached import; the server renders the stand-in).
    else if (typeof window !== 'undefined') void loadRowDragChunk().catch(() => undefined);
  }

  private attach(chunk: RowDragChunk): void {
    if (this.controller) return;
    for (const d of this.deferred) d.resolve(chunk.createRowDragDropModule<Row>());
    this.controller = new chunk.RowDragController<Row>(this.instance, this);
    if (this.deferred.length && this.instance.props !== this.initialProps) this.controller.sync(this.initialProps, this.instance.props);
  }

  /** Runs `work` with the controller now, or once the chunk is loaded and the grid mounted. */
  private run(work: (controller: RowDragController<Row>) => void): void {
    const controller = this.controller;
    if (controller && this.mounted) work(controller);
    else this.queue.push(() => {
      if (this.controller) work(this.controller);
    });
  }

  // ------------------------------------------------------------------------
  // Preview layer store (start and end only) and layer elements
  // ------------------------------------------------------------------------

  readonly subscribePreview = (listener: () => void): (() => void) => {
    this.previewListeners.add(listener);
    return () => this.previewListeners.delete(listener);
  };

  readonly getPreview = (): DataGridRowDragPreviewContext<Row> | null => this.previewState;

  setPreview(next: DataGridRowDragPreviewContext<Row> | null): void {
    this.previewState = next;
    for (const listener of this.previewListeners) listener();
  }

  readonly setIndicatorElement = (el: HTMLElement | null): void => {
    this.indicator = el;
  };

  readonly setPreviewElement = (el: HTMLElement | null): void => {
    this.preview = el;
  };

  get indicatorElement(): HTMLElement | null {
    return this.indicator;
  }

  get previewElement(): HTMLElement | null {
    return this.preview;
  }

  // ------------------------------------------------------------------------
  // Lifecycle and prop sync
  // ------------------------------------------------------------------------

  sync(props: DataGridProps<Row>, prev: DataGridProps<Row>): void {
    if (!this.enabled) return;
    // Before the chunk loads, `attach()` syncs from the initial props.
    this.controller?.sync(prev, props);
  }

  mount(): () => void {
    if (!this.enabled) return () => {};
    let live = true;
    let off: (() => void) | null = null;
    const start = (controller: RowDragController<Row>): void => {
      if (!live) return;
      off = controller.mount();
      this.mounted = true;
      const queue = this.queue;
      this.queue = [];
      for (const work of queue) work();
    };
    if (this.controller) start(this.controller);
    else {
      loadRowDragChunk().then(
        (chunk) => {
          if (!live) return;
          this.attach(chunk);
          if (this.controller) start(this.controller);
        },
        (error: unknown) => {
          if (DEV) warnOnce(`${this.instance.gridId}:row-drag-chunk`, `DataGrid "${this.instance.gridId}": the row drag code failed to load; row drag stays off (${String(error)}).`);
        },
      );
    }
    return () => {
      live = false;
      this.mounted = false;
      off?.();
      off = null;
    };
  }

  // ------------------------------------------------------------------------
  // API, keyboard and the handle
  // ------------------------------------------------------------------------

  /** `moveRows`; called before the chunk loaded it returns `async` and runs once it is loaded. */
  moveRows(rowIds: RowId | readonly RowId[], toIndex: number | DataGridMoveTarget): DataGridActionResult {
    if (!this.enabled) return { status: 'rejected', reason: 'row drag is off (set rowDrag)' };
    const controller = this.controller;
    if (controller && this.mounted) return controller.moveRows(rowIds, toIndex);
    const promise = new Promise<void>((resolve) => {
      this.run((c) => {
        const result: CommandResult = c.moveRows(rowIds, toIndex);
        if (result.status === 'async') result.promise.then(resolve, resolve);
        else resolve();
      });
    });
    return Object.freeze({ status: 'async', promise });
  }

  private registerKeys(): void {
    const interaction = this.instance.interaction;
    const move = (offset: number): boolean => {
      const controller = this.controller;
      if (controller && this.mounted) return controller.moveFocused(offset);
      this.run((c) => c.moveFocused(offset));
      return true;
    };
    interaction.registerKeyHandler('row.moveUp', () => move(-1), 10);
    interaction.registerKeyHandler('row.moveDown', () => move(1), 10);
  }

  /** Pointer down on a drag handle (delegated from the handle cell); a drag needs the loaded controller. */
  readonly onHandlePointerDown = (event: ReactPointerEvent<HTMLElement>, rowId: RowId): void => {
    if (this.controller && this.mounted) this.controller.onHandlePointerDown(event, rowId);
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function DataGridRowDragHandleImpl({ rowId }: { rowId: RowId }) {
  const instance = useDataGridInstance<unknown>();
  const icons = useDataGridIcons();
  const text = instance.interaction.text;
  return (
    <span
      className="salmon-data-grid-row-drag-handle"
      role="button"
      aria-roledescription={text('rowDragHandleRole')}
      aria-label={text('rowDragHandle')}
      onPointerDown={(event) => instance.rowDragUi.onHandlePointerDown(event, rowId)}
      data-custom-icon={customIcon(icons, 'dragHandle')}
    >
      {icons?.dragHandle}
    </span>
  );
}

const DataGridRowDragHandle = memo(DataGridRowDragHandleImpl);

const renderHandleCell = (ctx: DataGridCellContext<unknown>): ReactNode => <DataGridRowDragHandle rowId={ctx.rowId} />;

/** Utility column definition of the drag handle (not sortable, filterable, exported, or movable). */
export function rowDragColumn(header: string, pinned: boolean): DataGridColumn<unknown> {
  return {
    id: ROW_DRAG_COLUMN_ID,
    header,
    width: 36,
    minWidth: 36,
    align: 'center',
    // No field: a declared type skips value-type inference.
    type: 'string',
    sortable: false,
    filterable: false,
    searchable: false,
    groupable: false,
    editable: false,
    resizable: false,
    reorderable: false,
    lockPosition: true,
    hideable: false,
    // A utility column has no column menu (no ⋮ header button).
    menu: false,
    meta: { utility: true },
    ...(pinned ? { pinned: 'start' as const } : {}),
    renderHeader: () => <span className="salmon-data-grid-visually-hidden">{header}</span>,
    renderCell: renderHandleCell,
  };
}

function defaultPreview<Row>(instance: DataGridInstance<Row>, ctx: DataGridRowDragPreviewContext<Row>): ReactNode {
  const first = ctx.rowIds[0];
  const column = instance.engine.getSnapshot().columns.visible.find((c) => !(c.def.meta as { utility?: boolean } | undefined)?.utility);
  const label = first !== undefined && column ? (instance.engine.getCellSnapshot(first, column.columnId)?.formattedValue ?? first) : (first ?? '');
  return (
    <>
      <span className="salmon-data-grid-row-drag-preview__label">{label}</span>
      {ctx.rowIds.length > 1 ? <span className="salmon-data-grid-row-drag-preview__count">{ctx.rowIds.length}</span> : null}
    </>
  );
}

function DataGridRowDragLayerImpl() {
  const instance = useDataGridInstance<unknown>();
  const ui = instance.rowDragUi;
  const preview = useSyncExternalStore(ui.subscribePreview, ui.getPreview, () => null);
  const render = instance.props.renderRowDragPreview;
  return (
    <>
      <div className="salmon-data-grid-row-drop-indicator" ref={ui.setIndicatorElement} aria-hidden="true" />
      <div className="salmon-data-grid-row-drag-preview" ref={ui.setPreviewElement} aria-hidden="true" data-visible={preview ? '' : undefined}>
        {preview ? (render ? render(preview) : defaultPreview(instance, preview)) : null}
      </div>
    </>
  );
}

/** Drop indicator and drag preview of a grid with `rowDrag` (renders on drag start and end only). */
export const DataGridRowDragLayer = memo(DataGridRowDragLayerImpl);

