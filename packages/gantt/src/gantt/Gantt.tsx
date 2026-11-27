'use client';

// Gantt. The grid pane is `DataGrid` in tree mode composed only
// through its public extension points (row model, scroll sync, row height); the chart pane draws the same
// rendered window. State follows the Data Grid model: one instance created
// from the initial props and synced in a layout effect, React reading it
// through `useSyncExternalStore`, before / after events, `ref` receiving the
// `GanttApi` (the grid's `DataGridApi` plus the Gantt methods). Dialogs,
// menus and export are lazy chunks.

import { Suspense, use, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { peekGanttModules, readGanttModules } from '#gantt-modules';
import type { GanttModuleName, GanttModules } from './modules.js';
import type { RowId } from '@salmonui/core/data';
import { DataGrid } from '@salmonui/data-grid';
import type { DataGridApi, DataGridProps } from '@salmonui/data-grid';
import type { DataGridSaveEvent } from '@salmonui/data-grid';
import type { DataGridContextMenuItemClickEvent, DataGridMenuItem } from '@salmonui/data-grid';
import { gridEvent } from '@salmonui/core/internal/events';
import { useHydrated } from '@salmonui/core/internal/hydrated';
import { useLocale, useLocaleText } from '@salmonui/core/internal/locale';
import { Splitter, type SplitterSize } from '@salmonui/layout/splitter';
import { buildColumns } from './columns.js';
import { ChartViewport, createFormatters, GanttChart } from './chart.js';
import { GRID_PARENT_FIELD } from './fields.js';
import { GanttInstance } from './instance.js';
import { createGanttApi } from './api.js';
import { CONTEXT_ITEMS, contextItemsOf } from './menu-items.js';
import type { GanttApi, GanttChartPointerEvent, GanttContextMenuItemClickEvent, GanttContextMenuOpenEvent, GanttProps, GanttSplitterEvent, GanttTaskbarClickEvent } from './types.js';

type PopupsModule = typeof import('./popups.js');
const loadPopups = (): Promise<PopupsModule> => import('./popups.js');
type InteractModule = typeof import('./interact.js');
// Taskbar editing is a chunk requested right after mount (the chart is visible before it can be dragged).
const loadInteract = (): Promise<InteractModule> => import('./interact.js');

const cx = (...parts: (string | false | null | undefined)[]): string => parts.filter(Boolean).join(' ');

type TooltipModule = typeof import('./tooltip.js');
const loadTooltip = (): Promise<TooltipModule> => import('./tooltip.js');

/** Lazy module, requested when idle after mount and at once when needed. */
function useLazy<T>(load: () => Promise<T>, needed: boolean, enabled = true): T | null {
  const [module, setModule] = useState<T | null>(null);
  useEffect(() => {
    if (module || !enabled) return;
    let live = true;
    const fetch = (): void => void load().then((m) => live && setModule(() => m));
    let id: ReturnType<typeof setTimeout> | null = null;
    if (needed) fetch();
    else id = setTimeout(fetch, 1500);
    return () => {
      live = false;
      if (id) clearTimeout(id);
    };
  }, [load, needed, module, enabled]);
  return module;
}

/** `#gantt-modules` the props render with (modules.ts). */
function neededModules<Row>(props: GanttProps<Row>): GanttModuleName[] {
  const out: GanttModuleName[] = [];
  if (props.resourceView || props.multiTaskbar) out.push('resources');
  if (props.toolbar?.length) out.push('toolbar');
  if (props.criticalPath) out.push('critical');
  if (props.adaptive) out.push('adaptive');
  if (props.loadingIndicator === 'skeleton' || props.loadChildren) out.push('loading');
  // A writable remote source.
  if (typeof (props.data as { write?: unknown } | undefined)?.write === 'function') out.push('remote');
  return out;
}

/** Waits for the render modules: never on the server (static registry); in the browser hydration keeps the server HTML until they load. */
function GanttGate<Row>(props: GanttProps<Row>): ReactNode {
  // The nearest LocaleProvider resolves here: every Gantt part (instance, columns, popups, export) reads `props`.
  const locale = useLocale(props.locale);
  const localeText = useLocaleText('gantt', props.localeText);
  const needed = neededModules(props);
  if (needed.length) {
    const got = readGanttModules(needed);
    if ('then' in got) use(got as Promise<unknown>);
  }
  return <GanttBody {...props} {...({ locale, localeText } as object)} />;
}

export function Gantt<Row = Record<string, unknown>>(props: GanttProps<Row>): ReactNode {
  const pending = <div id={props.id} className={cx('salmon-gantt', props.className)} style={{ ...props.style, height: props.height ?? 450, ...(props.width !== undefined ? { width: props.width } : {}) }} data-salmon-pending="" aria-busy="true" />;
  return (
    <Suspense fallback={pending}>
      <GanttGate {...props} />
    </Suspense>
  );
}

function GanttBody<Row>(props: GanttProps<Row>): ReactNode {
  const Toolbar = peekGanttModules().toolbar?.GanttToolbar;
  const [g] = useState(() => new GanttInstance<Row>(props));
  useLayoutEffect(() => {
    g.syncProps(props);
  });
  const version = useSyncExternalStore(g.subscribe, g.getVersion, g.getVersion);
  const [viewport] = useState(() => new ChartViewport<Row>(g));
  const hydrated = useHydrated();
  const locale = props.locale ?? 'en-US';
  const formatters = useMemo(() => createFormatters(locale, props.dateFormat), [locale, props.dateFormat]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [gridReady, setGridReady] = useState(false);
  const [popup, setPopup] = useState<{ kind: 'menu'; x: number; y: number; taskId: string | null; items: readonly DataGridMenuItem[] } | null>(null);
  const [splitterSize, setSplitterSize] = useState<SplitterSize | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // `ref`: the grid API plus the Gantt methods.
  const api = useMemo(() => createGanttApi(g, { setSplitterSize, openMenu: () => {} }), [g]);
  useLayoutEffect(() => {
    g.api = api;
    g.formatters = formatters;
  }, [g, api, formatters]);
  useImperativeHandle(props.ref, () => api, [api]);
  const readyFired = useRef(false);
  useEffect(() => {
    if (gridReady && !readyFired.current) {
      readyFired.current = true;
      g.props.onReady?.(api);
    }
  }, [gridReady, api, g]);

  const gridRef = useCallback(
    (gridApi: DataGridApi<Row> | null) => {
      g.gridApi = gridApi;
      if (gridApi) {
        viewport.attach();
        setGridReady(true);
      } else viewport.detach();
    },
    [g, viewport],
  );
  useEffect(
    () => () => {
      viewport.detach();
      // Unmount aborts the remote writes in flight.
      g.remote?.abort();
    },
    [viewport, g],
  );
  // Undo history: attached after mount, again when the `undo` options change.
  const undoKey = props.undo ? JSON.stringify(props.undo === true ? {} : props.undo) : '';
  // biome-ignore lint/correctness/useExhaustiveDependencies: `undoKey` stands for the options.
  useEffect(() => g.setupHistory(g.props.undo), [g, undoKey]);

  const needPopups = g.dialog !== null || g.conflict !== null || popup !== null;
  const popups = useLazy(loadPopups, needPopups);
  const interact = useLazy(loadInteract, g.editable());
  const tooltip = useLazy(loadTooltip, false, !!props.tooltip);

  // Columns: rebuilt when a column-shaping prop changes; cell values read the live engine.
  const fine = g.level.bottom.unit === 'hour' || g.level.bottom.unit === 'minute';
  // biome-ignore lint/correctness/useExhaustiveDependencies: `fine` and the listed props shape the columns.
  // `g.adopted`: remote rows joined the engine, their date cells re-read the computed dates.
  const columns = useMemo(() => buildColumns(g, props), [g, props.columns, props.wbs, props.dateFormat, props.localeText, props.inlineNotes, props.resources, props.locale, props.timeZone, fine, g.adopted]);

  const editing = props.readOnly || props.editing === false ? null : typeof props.editing === 'object' ? props.editing : {};
  const editMode = editing?.mode ?? 'auto';
  const gridEditing = useMemo(
    () =>
      editing
        ? {
            mode: editMode === 'auto' ? 'cell' : editMode === 'dialog' ? 'cell' : editMode,
            edit: editing.edit ?? true,
            add: editing.add ?? true,
            delete: editing.delete ?? true,
            confirmDelete: editing.confirmDelete ?? false,
            editOnDoubleClick: editMode !== 'dialog',
          }
        : undefined,
    // biome-ignore lint/correctness/useExhaustiveDependencies: the editing object identity is the input.
    [props.editing, props.readOnly],
  );

  // Grid edits reschedule through the engine.
  const onSave = useCallback(
    (event: DataGridSaveEvent<Row>) => {
      g.props.onSave?.(event);
      if (event.status !== 'applied' && event.status !== 'partial') return;
      const batch = event.rows();
      for (const changed of batch.changedRecords) {
        const id = g.idOf(changed);
        const row = changed as Record<string, unknown>;
        const current = g.getRow(id) as Record<string, unknown> | undefined;
        if (!current) continue;
        const diff: Record<string, unknown> = {};
        for (const k of Object.keys(row)) {
          if (k === GRID_PARENT_FIELD) continue;
          const a = row[k];
          const b = current[k];
          if (a instanceof Date && b instanceof Date ? a.getTime() !== b.getTime() : a !== b) diff[k] = a;
        }
        if (Object.keys(diff).length) g.updateFields(id, diff as Partial<Row>, 'keyboard', 'edit');
      }
      if (batch.deletedRecords.length) g.deleteTasks(batch.deletedRecords.map((d) => g.idOf(d)), 'keyboard');
      for (const added of batch.addedRecords) if (!g.getRow(g.idOf(added))) g.addTask(added as Partial<Row>, { position: 'bottom' }, 'keyboard');
    },
    [g],
  );

  const onSelectionChange = useCallback<NonNullable<DataGridProps<Row>['onSelectionChange']>>(
    (event) => {
      g.props.onSelectionChange?.(event);
      const ids = new Set((g.gridApi?.getSelectedRowIds() ?? []).map(String));
      setSelected(ids);
      // Scroll the chart to the selected task (`focusTaskOnSelect`).
      const first = [...ids][0];
      const task = first === undefined ? null : g.taskIdOfKey(first);
      if (task !== null && g.props.focusTaskOnSelect !== false && event.source !== 'pointer') {
        const s = g.engine.getSchedule(task);
        const el = g.chartScroll;
        if (s?.start != null && el) {
          const x = (s.start - g.scale.start) * g.scale.pxPerMs;
          const left = Math.abs(el.scrollLeft);
          if (x < left || x > left + el.clientWidth - 40) g.setScrollLeft(Math.max(0, x - 40));
        }
      }
    },
    [g],
  );

  // Context menu of the grid pane: Gantt items as Data Grid custom items.
  const contextMenu = useMemo(() => (props.contextMenu ? contextItemsOf(g, props.contextMenu === true ? CONTEXT_ITEMS : props.contextMenu) : undefined), [g, props.contextMenu]);
  const onContextMenuItemClick = useCallback(
    (event: DataGridContextMenuItemClickEvent<Row>) => {
      const id = event.rowIds[0] !== undefined ? g.taskIdOfKey(String(event.rowIds[0])) : null;
      const e = gridEvent<GanttContextMenuItemClickEvent<Row>>('contextMenuItemClick', event.source, { item: event.item.id, taskId: id, task: id ? (g.getRow(id) ?? null) : null });
      g.props.onContextMenuItemClick?.(e);
      if (e.defaultPrevented) return;
      void loadPopups().then((m) => m.runContextItem(g, event.item.id, id, event.source));
    },
    [g],
  );

  const getRowProps = useCallback<NonNullable<DataGridProps<Row>['getRowProps']>>(
    (row, index, ctx) => {
      const base = g.props.getRowProps?.(row, index, ctx);
      return { ...base, 'aria-describedby': `${g.props.id ?? 'gantt'}-bar-${g.keyOf(row)}` } as ReturnType<NonNullable<DataGridProps<Row>['getRowProps']>>;
    },
    [g],
  );

  // Row drag: a drop on a task row moves the tasks in the engine, which reschedules them; the grid gets the new rows.
  const onBeforeRowDrop = useCallback<NonNullable<DataGridProps<Row>['onBeforeRowDrop']>>(
    (e) => {
      g.props.onBeforeRowDrop?.(e);
      const target = e.targetRowId === null ? null : String(e.targetRowId);
      if (e.defaultPrevented || !e.valid || !e.position || target === null || !g.engine.getTask(target)) return;
      e.preventDefault();
      const ids = e.rowIds.map(String);
      const position = e.position === 'into' ? 'child' : e.position === 'before' ? 'above' : 'below';
      if (g.run('move', ids, e.source, () => g.engine.move(ids, target, position)).status === 'applied') g.props.onRowDrop?.(e);
    },
    [g],
  );

  // Chart pointer: taskbar drag, click selects, double click edits.
  const onChartPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      if (interact?.startTaskbarDrag(g, e.nativeEvent, formatters)) e.stopPropagation();
    },
    [g, formatters, interact],
  );
  const onChartClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as Element;
      const rowEl = target.closest<HTMLElement>('.salmon-gantt__row');
      const key = rowEl?.dataset['rowKey'];
      if (!key) return;
      const id = rowEl.dataset['taskId'];
      const part = target.closest<HTMLElement>('[data-part]')?.dataset['part'];
      if (id && part && g.props.onTaskbarClick) {
        const s = g.engine.getSchedule(id);
        const kind = part === 'milestone' ? 'milestone' : part === 'baseline' ? 'baseline' : s?.parent ? 'parent' : 'taskbar';
        const ev = gridEvent<GanttTaskbarClickEvent<Row>>('taskbarClick', 'pointer', { taskId: id, task: g.getRow(id) as Row, target: kind });
        g.props.onTaskbarClick(ev);
        if (ev.defaultPrevented) return;
      }
      if (g.props.selection !== false) g.gridApi?.selectRows([key], e.ctrlKey || e.metaKey ? { mode: 'toggle' } : undefined);
    },
    [g],
  );
  const onChartDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const id = (e.target as Element).closest<HTMLElement>('.salmon-gantt__row')?.dataset['taskId'];
      if (!id || !g.editable()) return;
      const mode = typeof g.props.editing === 'object' ? (g.props.editing.mode ?? 'auto') : 'auto';
      if (mode === 'auto' || mode === 'dialog') api.openEditDialog(id);
    },
    [g, api],
  );
  const onChartContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!g.props.contextMenu) return;
      const id = (e.target as Element).closest<HTMLElement>('.salmon-gantt__row')?.dataset['taskId'] ?? null;
      if (g.props.onBeforeContextMenuOpen) {
        const ev = gridEvent<GanttContextMenuOpenEvent<Row>>('beforeContextMenuOpen', 'pointer', { pane: 'chart', taskId: id, task: id ? (g.getRow(id) ?? null) : null });
        g.props.onBeforeContextMenuOpen(ev);
        if (ev.defaultPrevented) return;
      }
      e.preventDefault();
      if (id) g.gridApi?.selectRows([id]);
      setPopup({ kind: 'menu', x: e.clientX, y: e.clientY, taskId: id, items: (contextMenu ?? []).filter((i) => typeof i === 'object' && i.id.startsWith('gantt:')) as DataGridMenuItem[] });
    },
    [g, contextMenu],
  );

  // Vertical wheel over the chart scrolls the grid (scroll sync); Ctrl+wheel zooms.
  const chartPaneRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = chartPaneRef.current;
    if (!el) return;
    let pending = 0;
    const onWheel = (e: WheelEvent): void => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        pending += e.deltaY;
        if (Math.abs(pending) >= 40) {
          if (pending < 0) api.zoomIn();
          else api.zoomOut();
          pending = 0;
        }
        return;
      }
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || e.shiftKey) return;
      const grid = g.gridApi;
      if (!grid) return;
      e.preventDefault();
      grid.scrollTo({ top: grid.getViewport().top + e.deltaY * (e.deltaMode === 1 ? 36 : 1) });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [g, api]);

  // `onChartPointerMove`: the date and task under the pointer, at most once per animation frame.
  const pointerMove = props.onChartPointerMove !== undefined;
  useEffect(() => {
    const el = rootRef.current;
    if (!el || !pointerMove) return;
    let frame = 0;
    let last: PointerEvent | null = null;
    const run = (): void => {
      frame = 0;
      const inner = g.chartRoot?.querySelector('.salmon-gantt__chart-inner');
      if (!last || !inner) return;
      const r = inner.getBoundingClientRect();
      const x = g.isRtl() ? r.right - last.clientX : last.clientX - r.left;
      const id = (last.target as Element).closest?.<HTMLElement>('.salmon-gantt__row')?.dataset['taskId'] ?? null;
      const date = g.date(g.scale.start + x / g.scale.pxPerMs);
      g.props.onChartPointerMove?.(gridEvent<GanttChartPointerEvent<Row>>('chartPointerMove', last.pointerType === 'touch' ? 'touch' : 'pointer', { date, taskId: id, task: id ? (g.getRow(id) ?? null) : null }));
    };
    const onMove = (e: PointerEvent): void => {
      if (!(e.target as Element).closest?.('.salmon-gantt__chart-body')) return;
      last = e;
      if (!frame) frame = requestAnimationFrame(run);
    };
    el.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      el.removeEventListener('pointermove', onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [g, pointerMove]);

  // Keyboard: Gantt shortcuts on the root, the grid keeps its own model.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const mod = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, [contenteditable="true"], [role="dialog"]')) return;
      const id = g.selectedId();
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'z' && g.history) {
        e.preventDefault();
        api.undo();
      } else if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z')) && g.history) {
        e.preventDefault();
        api.redo();
      } else if (e.altKey && e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') && id && g.editable()) {
        e.preventDefault();
        const rtl = g.isRtl();
        if ((e.key === 'ArrowRight') !== rtl) api.indent([id]);
        else api.outdent([id]);
      } else if (e.key === 'F6') {
        e.preventDefault();
        const chart = g.chartRoot?.querySelector<HTMLElement>('.salmon-gantt__chart-scroll');
        if (chart && !chart.contains(target)) chart.focus();
        else g.gridApi?.focus();
      } else if (target.classList.contains('salmon-gantt__chart-scroll')) {
        // Chart pane keys: scroll the timeline, move between tasks, open the editor.
        const el = target;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          el.scrollLeft += (e.key === 'ArrowRight' ? 1 : -1) * (mod ? el.clientWidth : g.scale.level.unitWidth);
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const rows = g.visibleRows();
          const sel = g.gridApi?.getSelectedRowIds()[0];
          const at = sel !== undefined ? rows.findIndex((r) => g.keyOf(r) === String(sel)) : -1;
          const next = rows[Math.max(0, Math.min(rows.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))];
          if (next) {
            const nid = g.keyOf(next);
            g.gridApi?.selectRows([nid]);
            g.gridApi?.scrollToRow(nid);
          }
        } else if (e.key === 'Enter' && id && g.editable()) {
          e.preventDefault();
          api.openEditDialog(id);
        } else if ((e.key === '+' || e.key === '=') && mod) {
          e.preventDefault();
          api.zoomIn();
        } else if (e.key === '-' && mod) {
          e.preventDefault();
          api.zoomOut();
        }
      }
    },
    [g, api],
  );

  // Gantt keys inside the grid pane run before the grid's own bindings.
  const onGridKeyDown = useCallback<NonNullable<DataGridProps<Row>['onKeyDown']>>(
    (ctx) => {
      g.props.onKeyDown?.(ctx);
      const e = ctx.nativeEvent;
      const mod = e.ctrlKey || e.metaKey;
      const id = ctx.rowId === null ? null : String(ctx.rowId);
      if (e.altKey && e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') && id && g.editable() && ctx.context !== 'header') {
        ctx.preventDefault();
        e.preventDefault();
        if ((e.key === 'ArrowRight') !== g.isRtl()) api.indent([id]);
        else api.outdent([id]);
      } else if (g.history && mod && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
        ctx.preventDefault();
        e.preventDefault();
        if (e.key.toLowerCase() === 'y' || e.shiftKey) api.redo();
        else api.undo();
      }
    },
    [g, api],
  );

  // Splitter.
  const splitterEvent = (type: string, position: number): GanttSplitterEvent => gridEvent<GanttSplitterEvent>(type, 'pointer', { position });
  const panes = props.panes ?? 'both';
  const gridDefault = props.splitter?.position ?? (props.splitter?.columnIndex !== undefined ? columnsWidth(columns, props.splitter.columnIndex) : '40%');
  const sizes = splitterSize === null ? undefined : { grid: splitterSize };
  const gridDefaultSize = gridDefault as SplitterSize;

  const headerHeight = 2 * 28;
  // The chart timeline follows the grid header's height (a filter bar or stacked headers make it taller).
  const [gridHeader, setGridHeader] = useState(headerHeight);
  useEffect(() => {
    const el = gridReady ? g.gridApi?.element?.querySelector<HTMLElement>('.salmon-data-grid-header') : null;
    if (!el || typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(() => setGridHeader(Math.round(el.getBoundingClientRect().height) || headerHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [g, gridReady]);
  const rowHeight = props.rowHeight ?? 36;

  // Adaptive (adaptive.tsx): one pane at a time; `{ breakpoint }` flips `g.narrow` after mount.
  const mods = peekGanttModules();
  const PaneSwitch = props.adaptive ? mods.adaptive?.GanttPaneSwitch : undefined;
  const compact = !!PaneSwitch && (props.adaptive === true || g.narrow);
  const pane = g.pane;
  // Loading skeleton (loading.tsx): the chart mirrors the grid's skeleton.
  const Loading = props.loadingIndicator === 'skeleton' ? mods.loading?.ChartLoading : undefined;
  const root: CSSProperties = { ...props.style, height: props.height ?? 450, ...(props.width !== undefined ? { width: props.width } : {}) };
  const local = Array.isArray(props.data);
  const treeOptions = useMemo(
    () => ({
      // Local data: the flat rows the Gantt writes; a source: the rows' own parent field.
      parentIdField: local ? GRID_PARENT_FIELD : g.fields.parentId,
      expandedField: g.fields.expanded,
      column: props.treeColumn ?? g.fields.title,
      defaultExpanded: props.defaultExpanded === 'none' || props.defaultExpanded === false ? false : true,
      ...(props.treeFilterMode ? { filterMode: props.treeFilterMode } : {}),
      ...(props.hasChildrenField ? { hasChildrenField: props.hasChildrenField } : {}),
      // The chart's skeleton row follows the lazy parents that load (the `loading` module is loaded with `loadChildren`).
      ...(props.loadChildren ? { loadChildren: (ctx: Parameters<NonNullable<GanttProps<Row>['loadChildren']>>[0]) => (peekGanttModules().loading as GanttModules['loading'] & object).trackChildren(g, ctx) } : {}),
    }),
    [g, local, props.treeColumn, props.defaultExpanded, props.treeFilterMode, props.hasChildrenField, props.loadChildren],
  );

  // Grid-pane props passed through unchanged (GGRID rows).
  const {
    data: _data, taskFields: _tf, columns: _c, treeColumn: _tc, defaultExpanded: _de, treeFilterMode: _tf2, hasChildrenField: _h, loadChildren: _lc, contextMenu: _cm, onContextMenuItemClick: _oc, onBeforeContextMenuOpen: _ob,
    onSave: _os, onSelectionChange: _osc, getRowProps: _grp, rowHeight: _rh, getRowHeight, height: _he, width: _w, className, style: _st, id, dir, locale: _lo, timeZone, ref: _ref, onReady: _or, toolbar,
    ...rest
  } = props;
  // Lanes of resource rows grow the row through the shared row-height extension point.
  const lanes = !!props.resourceView && !!props.multiTaskbar && props.taskbarOverlap === false;
  const laneHeight = useCallback(
    (row: Row): number => {
      const resource = g.taskIdOf(row) === null ? g.groupOf(row) : undefined;
      const h = resource !== undefined ? (peekGanttModules().resources?.resourceRowHeight(g, resource) ?? null) : null;
      return h ?? g.props.getRowHeight?.(row) ?? g.props.rowHeight ?? 36;
    },
    [g],
  );
  const rowHeightOf = lanes ? laneHeight : getRowHeight;
  const gridProps: Record<string, unknown> = {};
  for (const k of GRID_PASS_THROUGH) if ((rest as Record<string, unknown>)[k] !== undefined) gridProps[k] = (rest as Record<string, unknown>)[k];

  const gridPane = (
    <div className={compact && pane === 'chart' ? 'salmon-gantt__grid-pane salmon-gantt__hidden-grid' : 'salmon-gantt__grid-pane'}>
      <DataGrid<Row>
        {...(gridProps as DataGridProps<Row>)}
        ref={gridRef}
        data={Array.isArray(props.data) ? g.gridRows : (props.data as NonNullable<DataGridProps<Row>['data']>)}
        columns={columns}
        getRowId={g.keyOf}
        tree={treeOptions}
        height="100%"
        rowHeight={rowHeight}
        {...(rowHeightOf ? { getRowHeight: rowHeightOf } : {})}
        headerHeight={headerHeight}
        locale={locale}
        {...(timeZone ? { timeZone } : {})}
        {...(dir ? { dir } : {})}
        {...(gridEditing ? { editing: gridEditing as NonNullable<DataGridProps<Row>['editing']> } : {})}
        {...(contextMenu ? { contextMenu, onContextMenuItemClick } : {})}
        {...(props.exportWriters?.excel ? { exportWriters: { excel: props.exportWriters.excel } as NonNullable<DataGridProps<Row>['exportWriters']> } : {})}
        onSave={onSave}
        onKeyDown={onGridKeyDown}
        onSelectionChange={onSelectionChange}
        onBeforeRowDrop={onBeforeRowDrop}
        getRowProps={getRowProps}
        {...(props.localeText?.grid ? { localeText: props.localeText.grid } : {})}
        aria-label={props['aria-label'] ?? g.text('label')}
      />
    </div>
  );
  const chartPane = (
    <div className="salmon-gantt__chart-pane" ref={chartPaneRef}>
      <GanttChart
        g={g}
        version={version}
        viewport={viewport}
        formatters={formatters}
        headerHeight={gridHeader}
        hydrated={hydrated}
        selectedIds={selected}
        onPointerDown={onChartPointerDown}
        onClick={onChartClick}
        onDoubleClick={onChartDoubleClick}
        onContextMenu={onChartContextMenu}
        overlay={Loading ? <Loading g={g} ready={gridReady} headerHeight={gridHeader} /> : null}
      />
    </div>
  );

  return (
    <div
      ref={rootRef}
      id={id}
      className={cx('salmon-gantt', className)}
      style={root}
      dir={dir === 'auto' ? undefined : dir}
      data-critical-path={props.criticalPath || undefined}
      data-loading={g.loading || undefined}
      data-adaptive={compact || undefined}
      aria-busy={g.loading || undefined}
      onKeyDown={onKeyDown}
    >
      {toolbar?.length && Toolbar ? <Toolbar g={g} api={api} items={toolbar} /> : null}
      {PaneSwitch ? <PaneSwitch g={g} root={rootRef} compact={compact} /> : null}
      <div className="salmon-gantt__panes" data-panes={compact ? pane : panes}>
        {compact ? (
          <>
            {gridPane}
            {pane === 'chart' ? chartPane : null}
          </>
        ) : panes === 'both' ? (
          <Splitter
            className="salmon-gantt__splitter"
            {...(sizes ? { sizes } : { defaultSizes: { grid: gridDefaultSize } })}
            onResizeStart={() => g.props.onSplitterResizeStart?.(splitterEvent('splitterResizeStart', paneWidth(rootRef.current)))}
            onResize={(s) => g.props.onSplitterResize?.(splitterEvent('splitterResize', s['grid'] ?? 0))}
            onSizesChange={(s) => {
              const pos = s['grid'];
              if (pos !== undefined) setSplitterSize(pos);
              g.splitterPosition = typeof pos === 'number' ? pos : paneWidth(rootRef.current);
              g.props.onSplitterResizeEnd?.(splitterEvent('splitterResizeEnd', g.splitterPosition));
            }}
            localeText={{ separatorLabel: g.text('splitter') } as never}
            panes={[
              { id: 'grid', content: gridPane, minSize: props.splitter?.minSize ?? 0 },
              { id: 'chart', content: chartPane, minSize: props.splitter?.minSize ?? 0 },
            ]}
          />
        ) : panes === 'grid' ? (
          gridPane
        ) : (
          <>
            <div className="salmon-gantt__hidden-grid">{gridPane}</div>
            {chartPane}
          </>
        )}
      </div>
      {popups ? <popups.GanttPopups g={g} api={api} version={version} menu={popup} onCloseMenu={() => setPopup(null)} formatters={formatters} /> : null}
      {tooltip && props.tooltip && hydrated ? <tooltip.GanttTooltip g={g} formatters={formatters} /> : null}
    </div>
  );
}

/** Width of the first `n` columns (splitter `columnIndex`). */
function columnsWidth(columns: readonly { width?: unknown }[], n: number): number {
  let w = 0;
  for (let i = 0; i <= n && i < columns.length; i++) {
    const c = columns[i]?.width;
    w += typeof c === 'number' ? c : 160;
  }
  return w + 2;
}

const paneWidth = (root: HTMLElement | null): number => root?.querySelector<HTMLElement>('.salmon-gantt__grid-pane')?.getBoundingClientRect().width ?? 0;

/** Props given to the grid pane unchanged (`GanttGridProps`). */
const GRID_PASS_THROUGH = [
  'sorting', 'onBeforeSortChange', 'onSortChange', 'filtering', 'onBeforeFilterChange', 'onFilterChange', 'search', 'onBeforeSearchChange', 'onSearchChange',
  'selection', 'onBeforeSelectionChange', 'columnMenu', 'renderContextMenu', 'reorderable', 'onBeforeColumnReorder', 'onColumnReorder', 'resizable', 'resizeMode',
  'onColumnResizeStart', 'onColumnResize', 'onColumnResizeEnd', 'columnChooser', 'onBeforeColumnVisibilityChange', 'onColumnVisibilityChange', 'gridLines',
  'highlightOnHover', 'striped', 'textWrap', 'overflow', 'getCellProps', 'rowClassName', 'renderEmpty', 'loadingIndicator', 'onViewChange', 'onRowDoubleClick',
  'onRowClick', 'onCellClick', 'rowDrag', 'onRowDrop', 'onRowDragStart', 'onRowDrag', 'onBeforeTreeToggle', 'onTreeToggle', 'onBeforeEditStart',
  'onBeforeCellValueChange', 'onBeforeSave', 'keyBindings', 'virtualization', 'initialRows', 'currency', 'icons', 'features',
] as const;

export type { GanttApi };
