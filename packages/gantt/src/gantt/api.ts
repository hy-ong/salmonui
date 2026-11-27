// `GanttApi`: the Gantt methods over
// the instance, with every other member delegated to the grid pane's
// `DataGridApi` (the grid-pane rows keep the Data Grid methods). Addressed by
// task id, never by index.

import type { RowId } from '@salmonui/core/data';
import { parseDependencies } from '../internal/timeline/project/dependencies.js';
import type { Dependency } from '../internal/timeline/project/types.js';
import type { SplitterSize } from '@salmonui/layout/splitter';
import type { GanttInstance } from './instance.js';
import type { GanttApi, GanttDateInput, GanttExportFile, GanttPdfExportOptions, GanttState } from './types.js';

type ExportModule = typeof import('./export.js');
const loadExport = (): Promise<ExportModule> => import('./export.js');

const list = (ids: RowId | readonly RowId[]): string[] => (Array.isArray(ids) ? ids.map(String) : [String(ids)]);

export interface ApiHost {
  readonly setSplitterSize: (size: SplitterSize | null) => void;
  readonly openMenu: () => void;
}

export function createGanttApi<Row>(g: GanttInstance<Row>, host: ApiHost): GanttApi<Row> {
  const historyStep = (dir: 'undo' | 'redo'): void => {
    const h = g.history;
    if (!h) return;
    const result = dir === 'undo' ? h.undo() : h.redo();
    if (!result) return;
    g.syncSourceFromEngine();
    g.commit(typeof result === 'object' && 'changed' in result ? result : null, dir, [], 'api');
  };
  const methods: Partial<GanttApi<Row>> = {
    get grid() {
      return g.gridApi as GanttApi<Row>['grid'];
    },
    getTask: (id) => g.getRow(id),
    getTaskInfo: (id) => g.info(id),
    getViewRows: () => g.visibleRows(),
    getCriticalTasks() {
      if (!g.critical) g.computeCritical();
      return [...(g.critical ?? [])].map((id) => g.getRow(id)).filter((r): r is Row => r !== undefined);
    },
    formatDuration: (id) => g.formatDuration(id),
    formatWork: (id) => g.formatWork(id),
    addTask: (task, options) => g.addTask(task, options, 'api'),
    updateTask: (id, changes) => g.updateFields(id, changes, 'api'),
    deleteTasks: (ids) => g.deleteTasks(list(ids), 'api'),
    changeTaskId: (id, newId) => g.changeTaskId(id, newId, 'api'),
    cancelEdit() {
      g.gridApi?.cancelEdit?.();
      if (g.dialog) {
        g.dialog = null;
        g.emit();
      }
    },
    indent: (ids) => g.run('indent', list(ids), 'api', () => g.engine.indent(list(ids))),
    outdent: (ids) => g.run('outdent', list(ids), 'api', () => g.engine.outdent(list(ids))),
    moveTasks: (ids, targetId, position) => g.run('move', list(ids), 'api', () => g.engine.move(list(ids), String(targetId), position)),
    // The Data Grid `moveRows` through the engine: the moved subtree is rescheduled.
    moveRows(ids, to) {
      const rows = g.visibleRows();
      const at = typeof to === 'number' ? rows[Math.min(Math.max(0, to), rows.length - 1)] : undefined;
      const target = typeof to === 'number' ? (at === undefined ? null : g.idOf(at)) : String(to.targetRowId);
      if (target === null) return Object.freeze({ status: 'rejected', reason: 'no target row' });
      const position = typeof to === 'number' ? (to >= rows.length ? 'below' : 'above') : to.position === 'into' ? 'child' : to.position === 'before' ? 'above' : 'below';
      return g.run('move', list(ids), 'api', () => g.engine.move(list(ids), target, position)) as ReturnType<GanttApi<Row>['moveRows']>;
    },
    addDependency(taskId, dependency) {
      const add = typeof dependency === 'string' ? parseDependencies(dependency) : [dependency];
      const existing = g.engine.getTask(String(taskId))?.predecessors ?? [];
      const merged = [...existing.filter((d) => !add.some((a) => a.id === d.id)), ...add];
      return g.dependencies(taskId, merged, 'add', 'api');
    },
    removeDependency(taskId, predecessorId) {
      const existing = g.engine.getTask(String(taskId))?.predecessors ?? [];
      return g.dependencies(taskId, existing.filter((d) => d.id !== String(predecessorId)), 'remove', 'api');
    },
    updateDependencies(taskId, dependencies) {
      const deps: Dependency[] = typeof dependencies === 'string' ? parseDependencies(dependencies) : [...dependencies];
      return g.dependencies(taskId, deps, 'update', 'api');
    },
    splitTask(id, date) {
      const at = g.wall(date);
      if (at === null) return Object.freeze({ status: 'rejected', reason: 'invalid date' });
      return g.run('split', [String(id)], 'api', () => g.engine.splitTask(String(id), at));
    },
    mergeSegments: (id, indexes) => g.run('merge', [String(id)], 'api', () => g.engine.mergeSegments(String(id), indexes)),
    convertToMilestone: (id) => g.run('update', [String(id)], 'api', () => g.engine.convertToMilestone(String(id))),
    convertToTask: (id) => g.run('update', [String(id)], 'api', () => g.engine.convertToTask(String(id))),
    setTaskMode: (id, mode) => g.run('update', [String(id)], 'api', () => g.engine.setTaskMode(String(id), mode === 'manual')),
    setProjectDates(start: GanttDateInput, end: GanttDateInput) {
      g.engine.setProjectDates(g.wall(start), g.wall(end));
      g.commit(null, 'update', [], 'api');
    },
    expandAll: () => void g.gridApi?.expandAllTreeRows(),
    collapseAll: () => void g.gridApi?.collapseAllTreeRows(),
    expandRows: (ids) => void g.gridApi?.expandTreeRows(list(ids)),
    collapseRows: (ids) => void g.gridApi?.collapseTreeRows(list(ids)),
    zoomIn: () => g.applyZoom(g.zoomIndex + 1, 'api'),
    zoomOut: () => g.applyZoom(g.zoomIndex - 1, 'api'),
    zoomToFit: () => g.zoomToFit('api'),
    getZoom: () => g.zoomIndex,
    extendTimeline: (side) => g.extendTimeline(side),
    scrollToDate: (date) => g.scrollToDate(date),
    scrollToTask(id) {
      g.gridApi?.scrollToRow(String(id));
      const s = g.engine.getSchedule(String(id));
      if (s?.start != null) g.setScrollLeft(Math.max(0, (s.start - g.scale.start) * g.scale.pxPerMs - 40));
    },
    scrollTo({ top, left }) {
      if (top !== undefined) g.gridApi?.scrollTo({ top });
      if (left !== undefined) g.setScrollLeft(left);
    },
    setSplitterPosition: (position) => host.setSplitterSize(position as SplitterSize),
    openAddDialog() {
      if (!g.editable()) return;
      if (!g.dialogBefore('add', null)) return;
      g.dialog = { mode: 'add', id: null };
      g.emit();
    },
    openEditDialog(id) {
      const key = String(id);
      if (!g.editable() || !g.engine.getTask(key)) return;
      if (!g.dialogBefore('edit', key)) return;
      g.dialog = { mode: 'edit', id: key };
      g.emit();
    },
    closeDialog() {
      g.dialog = null;
      g.emit();
    },
    undo: () => historyStep('undo'),
    redo: () => historyStep('redo'),
    getUndoActions: () => g.history?.getUndoActions() ?? [],
    getRedoActions: () => g.history?.getRedoActions() ?? [],
    clearUndo() {
      g.history?.clearUndo();
      g.emit();
    },
    clearRedo() {
      g.history?.clearRedo();
      g.emit();
    },
    setLoading(loading) {
      g.loading = loading;
      g.gridApi?.setLoading(loading);
      g.emit();
    },
    getState(): GanttState {
      const el = g.chartScroll;
      const left = el ? Math.abs(el.scrollLeft) : 0;
      const date = g.date(g.scale.start + left / g.scale.pxPerMs);
      return Object.freeze({ grid: g.gridApi?.getState?.() ?? null, splitter: g.splitterPosition, zoom: g.zoomIndex, scrollDate: Number.isNaN(date.getTime()) ? null : date.toISOString() });
    },
    restoreState(state) {
      if (state.grid && g.gridApi?.restoreState) g.gridApi.restoreState(state.grid as never);
      if (state.splitter !== null) host.setSplitterSize(state.splitter);
      if (state.zoom !== g.zoomIndex) g.applyZoom(state.zoom, 'api', false);
      if (state.scrollDate) queueMicrotask(() => g.scrollToDate(state.scrollDate as string));
    },
    exportToExcel: (options) => loadExport().then((m) => m.exportExcel(g, options ?? {})) as Promise<GanttExportFile<Uint8Array> | null>,
    exportToCsv: (options) => loadExport().then((m) => m.exportCsv(g, options ?? {})),
    exportToPdf: (options?: GanttPdfExportOptions<Row>) => loadExport().then((m) => m.exportPdf(g, options ?? {})),
    print: () => void loadExport().then((m) => m.print(g)),
    getTaskbarElement: (id) => g.chartRoot?.querySelector<HTMLElement>(`.salmon-gantt__row[data-task-id="${CSS.escape(String(id))}"] [data-part]`) ?? null,
    getChartElement: () => g.chartRoot,
  };
  // Every other member (selection, columns, search, sort, filter, tree ...) is the grid's.
  return new Proxy(methods as GanttApi<Row>, {
    get(target, key) {
      if (key in target) return (target as unknown as Record<PropertyKey, unknown>)[key];
      const grid = g.gridApi as unknown as Record<PropertyKey, unknown> | null;
      const value = grid?.[key];
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(grid) : value;
    },
    has: (target, key) => key in target || (g.gridApi !== null && key in g.gridApi),
  });
}

