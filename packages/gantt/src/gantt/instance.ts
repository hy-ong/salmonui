// The Gantt instance: one
// per component, created from the initial props and synced in a layout
// effect (the DataGridInstance model). It owns the project engine, the
// grid-pane rows (data rows with the computed roles written), the time
// scale and zoom, the undo history and the chart DOM targets; React reads it
// through `useSyncExternalStore` on `version`. Drag and scroll transients
// never pass through here as React state.

import type { RowId } from '@salmonui/core/data';
import { formatMessage, localeFirstDay } from '@salmonui/core/internal/dates/index';
import type { DataGridApi } from '@salmonui/data-grid';
import { gridEvent } from '@salmonui/core/internal/events';
import { createProjectEngine, type ProjectEngine, type ProjectOptions, type UpdateResult } from '../internal/timeline/project/engine.js';
import { peekGanttModules, readGanttModules } from '#gantt-modules';
import type { ProjectHistory } from '../internal/timeline/project/history.js';
import type { CalendarException } from '../internal/timeline/project/calendar.js';
import type { Dependency, ProjectTaskInput, ScheduleConflict, TaskSchedule } from '../internal/timeline/project/types.js';
import { createScale, fitLevel, nearestLevel, VIEW_MODES, ZOOM_LEVELS, type TimeScale, type ZoomLevel } from '../internal/timeline/scale.js';
import { DAY } from '@salmonui/core/internal/timeline/axis';
import type { Formatters } from './chart.js';
import { dateOf, flatten, resolveFields, toTaskInput, wallOf, writeRow, type Fields, type FlatData, type MapContext } from './fields.js';
import { GANTT_DEFAULT_LOCALE_TEXT, type GanttLocaleKey } from './locale.js';
import { RESOURCE_KEY, ROW_KEY, TASK_KEY } from './fields.js';
import type { ResourceRowModel } from './resource-view.js';
import type { RemoteWriter } from './remote.js';
import type { GanttApi, GanttDependencyChangeEvent, GanttDialogOpenEvent, GanttExportFile, GanttActionResult, GanttDateInput, GanttEventSource, GanttProps, GanttScheduleConflictEvent, GanttTaskChangeEvent, GanttTaskInfo, GanttZoomChangeEvent } from './types.js';

type Listener = () => void;

const APPLIED: GanttActionResult = Object.freeze({ status: 'applied' });
const rejected = (reason: string): GanttActionResult => Object.freeze({ status: 'rejected', reason });

/** Zoom ladder of the props (custom `zoomLevels`, else the built-in levels with the `timeline` tiers at the configured level). */
function levelsOf<Row>(props: GanttProps<Row>): readonly ZoomLevel[] {
  if (!props.zoomLevels?.length) return ZOOM_LEVELS;
  return props.zoomLevels.map((l, i) => ({
    level: i,
    top: l.top ? { unit: l.top.unit, count: l.top.count ?? 1 } : null,
    bottom: { unit: l.bottom.unit, count: l.bottom.count ?? 1 },
    unitWidth: l.unitWidth ?? 33,
  }));
}

/** The level of the `timeline` prop (mode preset, explicit tiers, unit width). */
function timelineLevel<Row>(props: GanttProps<Row>): ZoomLevel {
  const t = props.timeline;
  const base = VIEW_MODES[t?.mode ?? 'week'];
  return {
    level: t?.topTier || t?.bottomTier || t?.unitWidth || (t?.mode && t.mode !== 'week') ? -1 : base.level,
    top: t?.topTier === null ? null : t?.topTier ? { unit: t.topTier.unit, count: t.topTier.count ?? 1 } : base.top,
    bottom: t?.bottomTier ? { unit: t.bottomTier.unit, count: t.bottomTier.count ?? 1 } : base.bottom,
    unitWidth: t?.unitWidth ?? base.unitWidth,
  };
}

/** Two zoom levels with the same tiers and unit width (an inline `timeline` object is a new reference every render). */
function sameLevel(a: ZoomLevel, b: ZoomLevel): boolean {
  return a.level === b.level && a.unitWidth === b.unitWidth && a.bottom.unit === b.bottom.unit && a.bottom.count === b.bottom.count && (a.top === null ? b.top === null : b.top !== null && a.top.unit === b.top.unit && a.top.count === b.top.count);
}

export class GanttInstance<Row> {
  props: GanttProps<Row>;
  fields: Fields;
  ctx: MapContext;
  readonly engine: ProjectEngine;
  history: ProjectHistory | null = null;
  private detachHistory: (() => void) | null = null;

  /** Data as given (flattened) and the rows the grid shows. */
  flat: FlatData<Row> = { rows: [], ids: [], parents: [] };
  private source: Map<string, Row> = new Map();
  rows: readonly Row[] = [];
  /** The rows the grid receives: `rows`, or the resource view rows. */
  gridRows: readonly Row[] = [];
  private rowById = new Map<string, Row>();
  /** Resource view models per version (resource-view.ts). */
  resourceCache: { version: number; models: Map<string, ResourceRowModel> } | null = null;
  private resourceIds: ReadonlySet<string> = new Set();
  /** The array last sent to `onDataChange` (a round trip through `data` is not a reload). */
  private emitted: readonly Row[] | null = null;
  private loadedData: unknown = null;

  levels: readonly ZoomLevel[];
  level: ZoomLevel;
  zoomIndex: number;
  scale: TimeScale;
  /** Extra time added by `extendTimeline` / infinite scroll (ms before and after the project range). */
  private extendBefore = 0;
  private extendAfter = 0;

  critical: ReadonlySet<string> | null = null;
  loading = false;
  /** Bumped when remote rows join the engine: the grid's start and finish cells read the computed dates. */
  adopted = 0;
  /** Tasks with a remote write in flight. */
  pending: ReadonlySet<string> = new Set();
  /** Remote writer of a writable source (`#gantt-modules` `remote`). */
  remote: RemoteWriter | null = null;
  /** Lazy parents whose children are loading (skeleton row). */
  loadingParents: ReadonlySet<string> = new Set();
  /** Adaptive layout: the container is under the breakpoint; the pane shown. */
  narrow = false;
  pane: 'grid' | 'chart' = 'grid';
  version = 0;
  private readonly listeners = new Set<Listener>();
  gridApi: DataGridApi<Row> | null = null;
  chartRoot: HTMLElement | null = null;
  chartScroll: HTMLElement | null = null;

  /** Dialog state (lazy dialog chunk). */
  dialog: { readonly mode: 'add' | 'edit'; readonly id: string | null; readonly tab?: string } | null = null;
  /** A pending conflict from a user edit (built-in conflict dialog). */
  conflict: { readonly conflicts: readonly ScheduleConflict[]; readonly apply: (choice: 'move' | 'removeLink' | 'cancel') => void } | null = null;
  splitterPosition: number | null = null;
  /** The public API (set by the component). */
  api: GanttApi<Row> | null = null;
  /** The chart date under the last context menu (split position). */
  menuDate: number | null = null;
  /** Critical path toggled from the toolbar without the `criticalPath` prop. */
  criticalToggled = false;
  /** Date formatters of the current locale (set by the component). */
  formatters: Formatters | null = null;

  constructor(props: GanttProps<Row>) {
    this.props = props;
    this.fields = resolveFields(props.taskFields);
    this.ctx = this.mapContext(props);
    this.engine = createProjectEngine(this.engineOptions(props));
    this.levels = levelsOf(props);
    const initial = props.zoom ?? props.defaultZoom;
    this.level = initial !== undefined ? (this.levels[Math.max(0, Math.min(this.levels.length - 1, initial))] as ZoomLevel) : timelineLevel(props);
    this.zoomIndex = initial ?? nearestLevel(this.level, this.levels);
    this.load(props.data);
    this.scale = this.buildScale();
  }

  // ------------------------------------------------------------------
  // Store
  // ------------------------------------------------------------------

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getVersion = (): number => this.version;

  emit(): void {
    this.version++;
    for (const l of this.listeners) l();
  }

  // ------------------------------------------------------------------
  // Props
  // ------------------------------------------------------------------

  private mapContext(props: GanttProps<Row>): MapContext {
    return { fields: this.fields, timeZone: props.timeZone, resourceIdField: props.resourceFields?.id ?? 'id', resourceUnitField: props.resourceFields?.unit ?? 'unit' };
  }

  wall(value: GanttDateInput | null | undefined): number | null {
    return wallOf(value, this.props.timeZone);
  }

  date(wall: number): Date {
    return dateOf(wall, this.props.timeZone);
  }

  private exceptionsOf(list: readonly { start: GanttDateInput; end?: GanttDateInput; ranges?: readonly { from: number; to: number }[] }[] | undefined): CalendarException[] {
    const out: CalendarException[] = [];
    for (const h of list ?? []) {
      const s = this.wall(h.start);
      if (s === null) continue;
      const e = this.wall(h.end ?? h.start) ?? s;
      const day = Math.floor(s / DAY) * DAY;
      out.push({ start: day, end: Math.floor(e / DAY) * DAY + DAY, ...(h.ranges ? { ranges: h.ranges } : {}) });
    }
    return out;
  }

  engineOptions(props: GanttProps<Row>): ProjectOptions {
    const o: Record<string, unknown> = {
      workingTime: props.workingTime,
      holidays: this.exceptionsOf(props.holidays),
      calendars: props.calendars?.map((c) => ({ id: c.id, workingTime: c.workingTime, exceptions: this.exceptionsOf(c.exceptions) })),
      projectCalendar: props.projectCalendar,
      taskMode: props.taskMode,
      autoSchedule: props.autoSchedule,
      projectStart: props.projectStart === undefined ? undefined : this.wall(props.projectStart),
      projectEnd: props.projectEnd === undefined ? undefined : this.wall(props.projectEnd),
      durationUnit: props.durationUnit,
      workUnit: props.workUnit,
      taskType: props.taskType,
      dependencyTypes: props.dependencyTypes,
      validateDependencies: props.validateDependencies,
      validateManualTasks: props.validateManualTasks,
      parentDependencies: props.parentDependencies,
      dependencyLag: props.dependencyLag,
      unscheduledTasks: props.unscheduledTasks,
    };
    for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
    return o as ProjectOptions;
  }

  private historyToken = 0;
  /**
   * Undo history: a lazy chunk attached after mount (the
   * component's effect), so a page without `undo` never loads it and the
   * server render does no work for it.
   */
  setupHistory(undo: GanttProps<Row>['undo']): () => void {
    const token = ++this.historyToken;
    const off = (): void => {
      this.detachHistory?.();
      this.detachHistory = null;
      this.history = null;
    };
    off();
    if (!undo) return off;
    void import('../internal/timeline/project/history.js').then((m) => {
      if (token !== this.historyToken) return;
      const opts = undo === true ? {} : undo;
      this.history = m.createHistory(opts.limit ?? 50);
      this.detachHistory = m.attachHistory(this.engine, this.history, opts.actions ? { actions: opts.actions } : {});
      this.emit();
    });
    return () => {
      if (token === this.historyToken) {
        this.historyToken++;
        off();
      }
    };
  }

  idOf = (row: Row): string => String((row as Record<string, unknown>)[this.fields.id]);

  /** Full load of `data`. */
  private load(data: GanttProps<Row>['data']): void {
    this.loadedData = data;
    this.remote?.dispose();
    const mod = peekGanttModules().remote;
    this.remote = mod?.writableSource(data) ? mod.createRemoteWriter(this) : null;
    if (!Array.isArray(data)) {
      // A remote source: the grid pane reads it; the chart follows the rows the grid loads.
      this.flat = { rows: [], ids: [], parents: [] };
      this.engine.load([]);
      this.rebuildRows(null);
      return;
    }
    this.flat = flatten(data as readonly Row[], this.fields, this.idOf);
    this.source = new Map();
    const tasks: ProjectTaskInput[] = [];
    for (let i = 0; i < this.flat.rows.length; i++) {
      const id = this.flat.ids[i] as string;
      const row = this.flat.rows[i] as Row;
      this.source.set(id, row);
      tasks.push(toTaskInput(row, id, this.flat.parents[i] ?? null, this.ctx));
    }
    this.engine.load(tasks);
    this.history?.clear();
    if (this.props.criticalPath) this.computeCritical();
    this.rebuildRows(null);
  }

  /** Remote rows the grid loaded: added to the engine with their computed dates. */
  adoptRemoteRows(rows: readonly Row[], parentOf: (row: Row) => string | null): void {
    let added = false;
    for (const row of rows) {
      const id = this.idOf(row);
      if (this.source.has(id)) continue;
      this.source.set(id, row);
      this.engine.add(toTaskInput(row, id, parentOf(row), this.ctx));
      added = true;
    }
    // Adopted rows are the source's state, not a change to write back.
    this.remote?.discard();
    if (added) {
      this.adopted++;
      this.rebuildRows(null);
      this.scale = this.buildScale();
      this.emit();
    }
  }

  /** Rebuilds the grid rows (all, or the changed ids only). */
  private rebuildRows(changed: ReadonlySet<string> | null): void {
    const tasks = this.engine.getTasks();
    const out: Row[] = new Array(tasks.length);
    const next = new Map<string, Row>();
    let same = tasks.length === this.rows.length;
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i] as ProjectTaskInput;
      const prev = this.rowById.get(t.id);
      let row: Row | undefined;
      if (prev && changed && !changed.has(t.id)) row = prev;
      else {
        const base = this.source.get(t.id) ?? prev;
        const schedule = this.engine.getSchedule(t.id);
        row = base && schedule ? writeRow(base, schedule, t.parentId, this.ctx, prev) : prev;
      }
      if (!row) continue;
      out[i] = row;
      next.set(t.id, row);
      if (same && this.rows[i] !== row) same = false;
    }
    this.rowById = next;
    if (!same) this.rows = out.filter(Boolean);
    this.rebuildGridRows(!same);
  }

  /** Resource view: the grid rows grouped by resource. */
  resourceMode(): boolean {
    return !!this.props.resourceView && Array.isArray(this.props.data);
  }

  private gridRowsFor: { rows: readonly Row[]; resources: unknown; on: boolean } | null = null;
  rebuildGridRows(force: boolean): void {
    // The resource view module comes from `#gantt-modules`; the component suspends until it is loaded.
    const mod = this.resourceMode() ? peekGanttModules().resources : undefined;
    const on = !!mod;
    const idField = this.props.resourceFields?.id ?? 'id';
    this.resourceIds = new Set((this.props.resources ?? []).map((r) => String(r[idField])));
    const k = this.gridRowsFor;
    if (!force && k && k.rows === this.rows && k.resources === this.props.resources && k.on === on) return;
    this.gridRowsFor = { rows: this.rows, resources: this.props.resources, on };
    this.gridRows = mod ? mod.buildResourceRows(this, (id) => this.rowById.get(id)) : this.rows;
  }

  isResource(id: string): boolean {
    return this.resourceIds.has(id);
  }

  /** Grid row key (the task id, or the resource view key). */
  keyOf = (row: Row): string => {
    const k = (row as Record<string, unknown>)[ROW_KEY];
    return k === undefined ? this.idOf(row) : String(k);
  };

  /** Task id of a grid row; null for a resource row. */
  taskIdOf(row: Row): string | null {
    const r = row as Record<string, unknown>;
    if (r[ROW_KEY] === undefined) return this.idOf(row);
    return r[TASK_KEY] === undefined ? null : String(r[TASK_KEY]);
  }

  /** Task id of a grid row key (resource view keys `id@resource`). */
  taskIdOfKey(key: string): string | null {
    if (!this.resourceMode()) return key;
    if (key.startsWith('__res:')) return null;
    if (this.engine.getTask(key)) return key;
    const at = key.lastIndexOf('@');
    return at > 0 ? key.slice(0, at) : key;
  }

  /** Resource group of a grid row in the resource view. */
  groupOf(row: Row): string | undefined {
    const v = (row as Record<string, unknown>)[RESOURCE_KEY];
    return typeof v === 'string' ? v : undefined;
  }

  syncProps(props: GanttProps<Row>): void {
    const prev = this.props;
    this.props = props;
    let changed = false;
    if (props.taskFields !== prev.taskFields || props.timeZone !== prev.timeZone || props.resourceFields !== prev.resourceFields) {
      this.fields = resolveFields(props.taskFields);
      this.ctx = this.mapContext(props);
    }
    const engineKeys: (keyof GanttProps<Row>)[] = ['workingTime', 'holidays', 'calendars', 'projectCalendar', 'taskMode', 'autoSchedule', 'projectStart', 'projectEnd', 'durationUnit', 'workUnit', 'taskType', 'dependencyTypes', 'validateDependencies', 'validateManualTasks', 'parentDependencies', 'dependencyLag', 'unscheduledTasks', 'timeZone'];
    if (engineKeys.some((k) => props[k] !== prev[k])) {
      this.engine.setOptions(this.engineOptions(props));
      changed = true;
    }
    if (props.data !== this.loadedData && props.data !== this.emitted) {
      this.load(props.data);
      changed = true;
    } else if (props.data === this.emitted) this.loadedData = props.data;
    else if (changed || props.taskFields !== prev.taskFields) this.rebuildRows(null);
    if (props.resourceView !== prev.resourceView || props.resources !== prev.resources || props.overAllocation !== prev.overAllocation || props.taskbarOverlap !== prev.taskbarOverlap || props.multiTaskbar !== prev.multiTaskbar) {
      this.rebuildGridRows(true);
      changed = true;
    }
    if (props.criticalPath !== prev.criticalPath || (changed && props.criticalPath)) {
      this.critical = null;
      if (props.criticalPath) this.computeCritical();
      changed = true;
    }
    if (props.zoomLevels !== prev.zoomLevels) this.levels = levelsOf(props);
    if (props.zoom !== undefined && props.zoom !== prev.zoom && props.zoom !== this.zoomIndex) {
      this.applyZoom(props.zoom, 'api', false);
      changed = true;
    } else if (props.timeline !== prev.timeline && props.zoom === undefined) {
      // Only a different level resets the zoom; an equal one (a re-created object) keeps zoomIn / zoomOut / zoomToFit.
      const next = timelineLevel(props);
      if (!sameLevel(next, timelineLevel(prev))) {
        this.level = next;
        this.zoomIndex = nearestLevel(this.level, this.levels);
      }
      changed = true;
    }
    if (changed || props.projectStart !== prev.projectStart || props.projectEnd !== prev.projectEnd || props.timeline?.weekStart !== prev.timeline?.weekStart || props.locale !== prev.locale) {
      this.scale = this.buildScale();
      changed = true;
    }
    if (changed) this.emit();
  }

  // ------------------------------------------------------------------
  // Text
  // ------------------------------------------------------------------

  text = (key: GanttLocaleKey, params?: Readonly<Record<string, string | number>>): string => {
    const lt = this.props.localeText as Record<string, unknown> | undefined;
    return formatMessage((lt?.[key] as never) ?? GANTT_DEFAULT_LOCALE_TEXT[key], params, this.props.locale ?? 'en-US');
  };

  /** `'3 days'`. */
  formatDuration(id: RowId): string {
    const s = this.engine.getSchedule(String(id));
    if (!s) return '';
    return this.text(s.durationUnit, { count: Math.round(s.duration * 100) / 100 });
  }

  /** Parses `'3 days'`, `'2h'`, `'1.5'` with the localized unit words; a bare number takes `durationUnit`. */
  parseDuration(text: string): { value: number; unit: 'minute' | 'hour' | 'day' } | null {
    const m = /^\s*(-?\d+(?:[.,]\d+)?)\s*(\S*)\s*$/u.exec(text);
    if (!m) return null;
    const value = Number.parseFloat((m[1] as string).replace(',', '.'));
    const word = (m[2] ?? '').toLowerCase();
    if (!word) return { value, unit: this.props.durationUnit ?? 'day' };
    for (const unit of ['minute', 'hour', 'day'] as const) {
      const words = this.text(`${unit}Units`).toLowerCase().split(',').map((w) => w.trim());
      if (words.includes(word)) return { value, unit };
    }
    return null;
  }

  /** Work in `workUnit`. */
  formatWork(id: RowId): string {
    const s = this.engine.getSchedule(String(id));
    if (!s) return '';
    return this.text(this.props.workUnit ?? 'hour', { count: Math.round(s.work * 100) / 100 });
  }

  // ------------------------------------------------------------------
  // Scale and zoom
  // ------------------------------------------------------------------

  weekStart(): number {
    return this.props.timeline?.weekStart ?? localeFirstDay(this.props.locale ?? 'en-US');
  }

  projectRange(): { start: number; end: number } {
    const r = this.engine.projectRange();
    if (r) return r;
    // No tasks: the project start, else a fixed anchor (never today: SSR determinism).
    const s = this.wall(this.props.projectStart) ?? Date.UTC(2026, 0, 1);
    return { start: s, end: s + 7 * DAY };
  }

  buildScale(): TimeScale {
    const r = this.projectRange();
    return createScale(r.start - this.extendBefore, r.end + this.extendAfter, this.level, this.weekStart());
  }

  applyZoom(index: number, source: GanttEventSource, notify = true): void {
    const i = Math.max(0, Math.min(this.levels.length - 1, Math.round(index)));
    const prev = this.zoomIndex;
    if (notify && this.props.onZoomChange) {
      const e = gridEvent<GanttZoomChangeEvent>('zoomChange', source, { level: i, previous: prev });
      this.props.onZoomChange(e);
      if (e.defaultPrevented) return;
    }
    // A controlled `zoom` waits for the prop.
    if (notify && this.props.zoom !== undefined) return;
    this.zoomIndex = i;
    this.level = this.levels[i] as ZoomLevel;
    this.rescale();
  }

  /** Rebuilds the scale keeping the date at the chart's inline start in view. */
  rescale(): void {
    const el = this.chartScroll;
    const anchor = el ? this.scale.start + Math.abs(el.scrollLeft) / this.scale.pxPerMs : null;
    this.scale = this.buildScale();
    this.emit();
    if (el && anchor !== null) {
      const x = Math.max(0, (anchor - this.scale.start) * this.scale.pxPerMs);
      queueMicrotask(() => this.setScrollLeft(x));
    }
  }

  zoomToFit(source: GanttEventSource): void {
    const r = this.projectRange();
    const width = this.chartScroll?.clientWidth ?? 800;
    let level = fitLevel(r.start, r.end, width, this.levels);
    // Whole top-tier units widen the scale: shrink the unit width until it fits.
    for (let i = 0; i < 4; i++) {
      const w = createScale(r.start, r.end, level, this.weekStart()).width;
      if (w <= width) break;
      level = { ...level, unitWidth: Math.max(4, Math.floor((level.unitWidth * width) / w)) };
    }
    this.level = level;
    this.zoomIndex = this.level.level;
    this.extendBefore = 0;
    this.extendAfter = 0;
    this.props.onZoomChange?.(gridEvent<GanttZoomChangeEvent>('zoomChange', source, { level: this.zoomIndex, previous: this.zoomIndex }));
    this.scale = this.buildScale();
    this.emit();
    queueMicrotask(() => this.setScrollLeft(0));
  }

  extendTimeline(side: 'start' | 'end'): void {
    const step = (this.chartScroll?.clientWidth ?? 600) / this.scale.pxPerMs;
    if (side === 'start') this.extendBefore += step;
    else this.extendAfter += step;
    const before = this.scale.start;
    const el = this.chartScroll;
    const left = el ? Math.abs(el.scrollLeft) : 0;
    this.scale = this.buildScale();
    this.emit();
    if (side === 'start') queueMicrotask(() => this.setScrollLeft(left + (before - this.scale.start) * this.scale.pxPerMs));
  }

  setScrollLeft(x: number): void {
    const el = this.chartScroll;
    if (!el) return;
    const rtl = this.isRtl();
    el.scrollLeft = rtl ? -x : x;
  }

  isRtl(): boolean {
    const el = this.chartRoot;
    return !!el && getComputedStyle(el).direction === 'rtl';
  }

  scrollToDate(date: GanttDateInput): void {
    const w = this.wall(date);
    if (w === null) return;
    this.setScrollLeft(Math.max(0, (w - this.scale.start) * this.scale.pxPerMs));
  }

  // ------------------------------------------------------------------
  // Critical path
  // ------------------------------------------------------------------

  private criticalLoading = false;

  /**
   * Marks the critical tasks. The backward pass is a `#gantt-modules` module
   * (the component waits for it with `criticalPath`); a toolbar toggle or an
   * API call before it loaded requests it and marks the bars when it arrives.
   */
  computeCritical(): void {
    const impl = peekGanttModules().critical?.computeCritical;
    if (impl) this.critical = this.engine.computeCriticalPath(impl).critical;
    else this.loadCritical();
  }

  private loadCritical(): void {
    if (this.criticalLoading) return;
    this.criticalLoading = true;
    void Promise.resolve(readGanttModules(['critical'])).then(() => {
      this.criticalLoading = false;
      if (this.props.criticalPath || this.criticalToggled) {
        this.computeCritical();
        this.emit();
      }
    });
  }

  // ------------------------------------------------------------------
  // Commits
  // ------------------------------------------------------------------

  /** Applies an engine result: rows, critical path, scale, events. */
  commit(result: UpdateResult | null, action: GanttTaskChangeEvent<Row>['action'], ids: readonly string[], source: GanttEventSource, silent = false): void {
    const changed = result ? result.changed : null;
    this.rebuildRows(changed);
    if (this.props.criticalPath) this.computeCritical();
    const r = this.projectRange();
    if (r.start < this.scale.start || r.end > this.scale.end) this.scale = this.buildScale();
    this.emit();
    if (silent) return;
    this.remote?.committed(changed, action, ids);
    const rows = ids.map((id) => this.rowById.get(id)).filter((x): x is Row => x !== undefined);
    if (this.props.onTaskChange || this.props.onDataChange) {
      const event = gridEvent<GanttTaskChangeEvent<Row>>('taskChange', source, { action, taskIds: ids, rows });
      this.props.onTaskChange?.(event);
      if (this.props.onDataChange) {
        const data = this.outputData();
        this.emitted = data;
        this.props.onDataChange(data, event);
      }
    }
  }

  /** The rows in the shape of the input (`children` nesting kept for nested data). */
  outputData(): readonly Row[] {
    const childKey = this.fields.children;
    const tasks = this.engine.getTasks();
    const parentField = this.fields.parentId;
    if (!childKey) {
      return tasks.map((t) => {
        const row = { ...(this.rowById.get(t.id) as Record<string, unknown>) };
        delete row['__salmonParentId'];
        row[parentField] = t.parentId;
        return row as Row;
      });
    }
    const kids = new Map<string | null, Row[]>();
    const built = new Map<string, Record<string, unknown>>();
    for (const t of tasks) {
      const row = { ...(this.rowById.get(t.id) as Record<string, unknown>) };
      delete row['__salmonParentId'];
      built.set(t.id, row);
      let list = kids.get(t.parentId);
      if (!list) kids.set(t.parentId, (list = []));
      list.push(row as Row);
    }
    for (const [id, row] of built) {
      const list = kids.get(id);
      if (list) row[childKey] = list;
    }
    return kids.get(null) ?? [];
  }

  /** Before-event of a task change; false when prevented. */
  before(action: GanttTaskChangeEvent<Row>['action'], ids: readonly string[], source: GanttEventSource): boolean {
    if (!this.props.onBeforeTaskChange) return true;
    const rows = ids.map((id) => this.rowById.get(id)).filter((x): x is Row => x !== undefined);
    const e = gridEvent<GanttTaskChangeEvent<Row>>('beforeTaskChange', source, { action, taskIds: ids, rows });
    this.props.onBeforeTaskChange(e);
    return !e.defaultPrevented;
  }

  editable(): boolean {
    return !this.props.readOnly && this.props.editing !== false;
  }

  /**
   * A user-level task update through the engine with dependency validation: conflicts go to `onScheduleConflict` or the built-in dialog.
   */
  update(id: string, changes: Partial<ProjectTaskInput>, source: GanttEventSource, origin: 'taskbar' | 'edit' | 'api' = 'api'): GanttActionResult {
    if (!this.engine.getTask(id)) return rejected(`unknown task "${id}"`);
    if (!this.before('update', [id], source)) return rejected('prevented');
    const validate = origin !== 'api' && this.props.validateDependencies !== false;
    const result = this.engine.batch('update', () => this.engine.update(id, changes, { source: origin, validate }));
    if (result.conflicts.length && validate && !result.changed.size) {
      this.raiseConflict(id, changes, result.conflicts, source, origin);
      return Object.freeze({ status: 'conflict', reason: 'dependency' });
    }
    // Data-only fields (title, notes, ...) change the row even when the schedule does not.
    this.commit({ ...result, changed: new Set([...result.changed, id]) }, 'update', [id], source);
    return APPLIED;
  }

  private raiseConflict(id: string, changes: Partial<ProjectTaskInput>, conflicts: readonly ScheduleConflict[], source: GanttEventSource, origin: 'taskbar' | 'edit' | 'api'): void {
    let settled = false;
    const apply = (choice: 'move' | 'removeLink' | 'cancel'): void => {
      if (settled) return;
      settled = true;
      this.conflict = null;
      if (choice === 'cancel') {
        this.emit();
        return;
      }
      const result = this.engine.batch('update', () => {
        if (choice === 'removeLink') {
          const task = this.engine.getTask(id);
          const drop = new Set(conflicts.map((c) => c.predecessorId));
          this.engine.setDependencies(id, (task?.predecessors ?? []).filter((d) => !drop.has(d.id)));
        }
        return this.engine.update(id, changes, { source: origin, validate: false });
      });
      this.commit(result, 'update', [id], source);
    };
    if (this.props.onScheduleConflict) {
      let chosen: 'move' | 'removeLink' | 'cancel' | null = null;
      const e = gridEvent<GanttScheduleConflictEvent<Row>>('scheduleConflict', source, {
        conflicts: conflicts.map((c) => ({ ...c, task: this.rowById.get(c.taskId) ?? null })),
        resolve: (choice: 'move' | 'removeLink' | 'cancel') => {
          chosen = choice;
          apply(choice);
        },
      });
      this.props.onScheduleConflict(e);
      if (chosen !== null || e.defaultPrevented) return;
    }
    this.conflict = { conflicts, apply };
    this.emit();
  }

  // ------------------------------------------------------------------
  // Lookup
  // ------------------------------------------------------------------

  getRow(id: RowId): Row | undefined {
    return this.rowById.get(String(id));
  }

  info(id: RowId): GanttTaskInfo | undefined {
    const s = this.engine.getSchedule(String(id));
    const t = this.engine.getTask(String(id));
    if (!s || !t) return undefined;
    return infoOf(s, t, this);
  }

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------

  private newId(): string {
    let max = 0;
    let numeric = true;
    for (const t of this.engine.getTasks()) {
      const n = Number(t.id);
      if (Number.isFinite(n)) max = Math.max(max, n);
      else numeric = false;
    }
    if (numeric) return String(max + 1);
    let i = this.engine.getTasks().length + 1;
    while (this.engine.getTask(`task-${i}`)) i++;
    return `task-${i}`;
  }

  addTask(task: Partial<Row> | undefined, options: { position?: 'top' | 'bottom' | 'above' | 'below' | 'child'; targetId?: RowId } | undefined, source: GanttEventSource): GanttActionResult {
    const f = this.fields;
    const raw = { ...(task as Record<string, unknown> | undefined) };
    const id = raw[f.id] !== undefined && raw[f.id] !== null ? String(raw[f.id]) : this.newId();
    if (this.engine.getTask(id)) return rejected(`duplicate task id "${id}"`);
    if (!this.before('add', [id], source)) return rejected('prevented');
    const position = options?.position ?? (typeof this.props.editing === 'object' ? this.props.editing.newRowPosition : undefined) ?? 'top';
    const target = options?.targetId !== undefined ? String(options.targetId) : (this.selectedId() ?? null);
    const targetTask = target ? this.engine.getTask(target) : undefined;
    const tasks = this.engine.getTasks();
    let parentId: string | null = null;
    let index = position === 'bottom' ? tasks.length : 0;
    if (targetTask && (position === 'above' || position === 'below' || position === 'child')) {
      const at = tasks.findIndex((t) => t.id === target);
      if (position === 'child') {
        parentId = target;
        index = at + 1;
      } else {
        parentId = targetTask.parentId;
        index = position === 'above' ? at : at + 1 + this.descendantCount(target as string);
      }
    }
    if (raw[f.id] === undefined) {
      const first = tasks[0] ? (this.source.get(tasks[0].id) as Record<string, unknown> | undefined) : undefined;
      raw[f.id] = typeof first?.[f.id] === 'number' && Number.isFinite(Number(id)) ? Number(id) : id;
    }
    if (raw[f.title] === undefined) raw[f.title] = this.text('newTask');
    if (raw[f.start] === undefined && raw[f.end] === undefined) {
      const ref = targetTask ? this.engine.getSchedule(target as string)?.start : null;
      raw[f.start] = this.date(ref ?? this.projectRange().start);
    }
    if (raw[f.duration] === undefined && raw[f.end] === undefined) raw[f.duration] = raw[f.milestone] === true ? 0 : 1;
    const row = raw as Row;
    this.source.set(id, row);
    this.engine.batch('add', () => this.engine.add(toTaskInput(row, id, parentId, this.ctx), { index }));
    this.commit(null, 'add', [id], source);
    return APPLIED;
  }

  private descendantCount(id: string): number {
    let n = 0;
    const tasks = this.engine.getTasks();
    const inside = new Set([id]);
    const at = tasks.findIndex((t) => t.id === id);
    for (let i = at + 1; i < tasks.length; i++) {
      const t = tasks[i] as ProjectTaskInput;
      if (t.parentId === null || !inside.has(t.parentId)) break;
      inside.add(t.id);
      n++;
    }
    return n;
  }

  deleteTasks(ids: readonly RowId[], source: GanttEventSource): GanttActionResult {
    const list = ids.map(String).filter((id) => this.engine.getTask(id));
    if (!list.length) return rejected('no tasks');
    if (!this.before('delete', list, source)) return rejected('prevented');
    // Source rows are kept: undo can bring the tasks back.
    this.engine.batch('delete', () => this.engine.remove(list));
    this.commit(null, 'delete', list, source);
    return APPLIED;
  }

  changeTaskId(id: RowId, newId: RowId, source: GanttEventSource): GanttActionResult {
    const from = String(id);
    const to = String(newId);
    if (!this.engine.getTask(from)) return rejected(`unknown task "${from}"`);
    if (this.engine.getTask(to)) return rejected(`duplicate task id "${to}"`);
    const row = this.source.get(from);
    this.engine.batch('changeId', () => this.engine.changeId(from, to));
    if (row) {
      this.source.delete(from);
      this.source.set(to, { ...(row as Record<string, unknown>), [this.fields.id]: typeof (row as Record<string, unknown>)[this.fields.id] === 'number' ? Number(to) : to } as Row);
    }
    this.commit(null, 'update', [to], source);
    return APPLIED;
  }

  /** Writes changed data fields into the source row and the engine (api.updateTask, dialog saves, grid edits). */
  updateFields(id: RowId, changes: Partial<Row>, source: GanttEventSource, origin: 'edit' | 'api' = 'api'): GanttActionResult {
    const key = String(id);
    const base = this.source.get(key) ?? this.rowById.get(key);
    const task = this.engine.getTask(key);
    if (!base || !task) return rejected(`unknown task "${key}"`);
    const merged = { ...(base as Record<string, unknown>), ...(changes as Record<string, unknown>) } as Row;
    const fields = Object.keys(changes as object);
    const next = toTaskInput(merged, key, task.parentId, this.ctx) as unknown as Record<string, unknown>;
    const f = this.fields as unknown as Record<string, string>;
    const engineChanges: Record<string, unknown> = {};
    for (const role of Object.keys(f)) {
      if (role === 'children' || role === 'id' || role === 'parentId') continue;
      if (!fields.includes(f[role] as string)) continue;
      if (role in next) engineChanges[role] = next[role];
    }
    // An end edit recomputes the duration; a start edit keeps it (the end follows).
    if (fields.includes(f['end'] as string) && !fields.includes(f['duration'] as string)) engineChanges['duration'] = null;
    if (fields.includes(f['start'] as string) && !fields.includes(f['end'] as string) && !fields.includes(f['duration'] as string)) engineChanges['end'] = null;
    if (fields.includes(f['duration'] as string) && !fields.includes(f['end'] as string)) engineChanges['end'] = null;
    if (fields.includes(f['parentId'] as string)) {
      const p = (changes as Record<string, unknown>)[f['parentId'] as string];
      engineChanges['parentId'] = p === null || p === undefined || p === '' ? null : String(p);
    }
    const prevSource = this.source.get(key);
    this.source.set(key, merged);
    const r = this.update(key, engineChanges as Partial<ProjectTaskInput>, source, origin);
    if (r.status !== 'applied') {
      if (prevSource) this.source.set(key, prevSource);
      return r;
    }
    return r;
  }

  run(action: GanttTaskChangeEvent<Row>['action'], ids: readonly string[], source: GanttEventSource, fn: () => UpdateResult | void): GanttActionResult {
    if (!ids.length) return rejected('no tasks');
    if (!this.before(action, ids, source)) return rejected('prevented');
    const result = this.engine.batch(action, fn) as UpdateResult | undefined;
    this.commit(result ?? null, action, ids, source);
    return APPLIED;
  }

  dependencies(taskId: RowId, deps: readonly Dependency[], action: 'add' | 'remove' | 'update', source: GanttEventSource): GanttActionResult {
    const id = String(taskId);
    const task = this.engine.getTask(id);
    if (!task) return rejected(`unknown task "${id}"`);
    const previous = task.predecessors ?? [];
    const row = this.rowById.get(id) ?? null;
    const p = this.props;
    if (p.onBeforeDependencyChange) {
      const e = gridEvent<GanttDependencyChangeEvent<Row>>('beforeDependencyChange', source, { action, taskId: id, task: row, dependencies: deps, previous });
      p.onBeforeDependencyChange(e);
      if (e.defaultPrevented) return rejected('prevented');
    }
    const result = this.engine.batch('dependency', () => this.engine.setDependencies(id, deps));
    this.writePredecessors(id);
    this.commit(result, 'update', [id], source);
    p.onDependencyChange?.(gridEvent<GanttDependencyChangeEvent<Row>>('dependencyChange', source, { action, taskId: id, task: this.rowById.get(id) ?? null, dependencies: deps, previous }));
    return APPLIED;
  }

  /** Keeps the source row's predecessor field in the input's format (string or array). */
  private writePredecessors(id: string): void {
    const row = this.source.get(id);
    const task = this.engine.getTask(id);
    if (!row || !task) return;
    const f = this.fields.predecessors;
    const prev = (row as Record<string, unknown>)[f];
    const deps = task.predecessors ?? [];
    const value = Array.isArray(prev) ? deps.map((d) => ({ ...d })) : formatDeps(deps);
    this.source.set(id, { ...(row as Record<string, unknown>), [f]: value } as Row);
  }

  /** Toolbar critical path toggle (`'criticalPath'` item). */
  toggleCriticalPath(): void {
    const on = this.critical !== null || (this.criticalToggled && !peekGanttModules().critical);
    this.criticalToggled = !on;
    if (this.criticalToggled) this.computeCritical();
    else this.critical = null;
    this.emit();
  }

  /** Saves an exported file in the browser (toolbar export items). */
  download(file: GanttExportFile<unknown>): void {
    const doc = this.chartRoot?.ownerDocument;
    if (!doc) return;
    const blob = new Blob([file.data as BlobPart], { type: file.mimeType });
    const url = URL.createObjectURL(blob);
    const a = doc.createElement('a');
    a.href = url;
    a.download = file.fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** `onBeforeDialogOpen`; false when prevented. */
  dialogBefore(mode: 'add' | 'edit', id: string | null): boolean {
    if (!this.props.onBeforeDialogOpen) return true;
    const e = gridEvent<GanttDialogOpenEvent<Row>>('beforeDialogOpen', 'api', { mode, taskId: id, task: id ? (this.rowById.get(id) ?? null) : null });
    this.props.onBeforeDialogOpen(e);
    return !e.defaultPrevented;
  }

  /** A source row replaced from outside (a reverted remote write). */
  setSourceRow(id: string, row: Row): void {
    this.source.set(id, row);
  }

  /** After undo / redo: predecessor fields of the source rows follow the engine. */
  syncSourceFromEngine(): void {
    for (const t of this.engine.getTasks()) {
      this.writePredecessors(t.id);
      this.writeResources(t.id);
    }
  }

  /** Keeps the source row's resource assignments in step with the engine (undo of a resource view drop). */
  private writeResources(id: string): void {
    const row = this.source.get(id) as Record<string, unknown> | undefined;
    const list = this.engine.getTask(id)?.resources ?? [];
    const f = this.fields.resources;
    if (!row || (row[f] === undefined && !list.length)) return;
    const prev = Array.isArray(row[f]) ? (row[f] as unknown[]) : [];
    const idField = this.ctx.resourceIdField;
    const unitField = this.ctx.resourceUnitField;
    const idOf = (v: unknown): string => String(v !== null && typeof v === 'object' ? (v as Record<string, unknown>)[idField] : v);
    if (prev.length === list.length && prev.every((v, i) => idOf(v) === list[i]?.id)) return;
    const numeric = (this.props.resources ?? []).some((r) => typeof r[idField] === 'number');
    this.source.set(id, { ...row, [f]: list.map((a) => ({ [idField]: numeric ? Number(a.id) : a.id, [unitField]: a.unit })) } as Row);
  }

  /**
   * Taskbar dropped on another row: in the resource view the task
   * moves from the `from` resource to the target row's resource (the
   * "Unassigned" row removes it); otherwise it moves below the target, or
   * into it when the target is a parent.
   */
  dropOnRow(id: string, target: { readonly key: string; readonly group: string | undefined }, from: string | undefined, dates: { start: number; end: number }, source: GanttEventSource): GanttActionResult {
    if (this.resourceMode()) {
      const to = target.group;
      if (to === undefined || to === from) return rejected('same resource');
      const idField = this.ctx.resourceIdField;
      const unitField = this.ctx.resourceUnitField;
      const current = this.engine.getTask(id)?.resources ?? [];
      const moved = current.find((a) => a.id === from);
      const list = current.filter((a) => a.id !== from && a.id !== to);
      if (to !== '') list.push({ id: to, unit: moved?.unit ?? 100 });
      const numeric = (this.props.resources ?? []).some((r) => typeof r[idField] === 'number');
      const changes: Record<string, unknown> = { [this.fields.resources]: list.map((a) => ({ [idField]: numeric ? Number(a.id) : a.id, [unitField]: a.unit })) };
      if (this.engine.getSchedule(id)?.start !== dates.start) changes[this.fields.start] = this.date(dates.start);
      return this.updateFields(id, changes as Partial<Row>, source, 'edit');
    }
    const targetId = this.taskIdOfKey(target.key);
    if (!targetId || targetId === id) return rejected('same row');
    return this.run('move', [id], source, () => {
      this.engine.update(id, { start: dates.start }, { source: 'taskbar', validate: false });
      const t = this.engine.getSchedule(targetId);
      this.engine.move([id], targetId, t?.parent ? 'child' : 'below');
    });
  }

  // ------------------------------------------------------------------
  // Selection (taskbar click selects its row)
  // ------------------------------------------------------------------

  selectedId(): string | null {
    const ids = this.gridApi?.getSelectedRowIds?.() ?? [];
    const first = ids[0];
    if (first !== undefined) return this.taskIdOfKey(String(first));
    const cell = this.gridApi?.getFocusedCell?.();
    return cell ? this.taskIdOfKey(String(cell.rowId)) : null;
  }

  /** Data-grid tree expansion is the source of row visibility. */
  visibleRows(): readonly Row[] {
    return this.gridApi ? this.gridApi.getVisibleRows() : this.rows;
  }
}

/** `'2FS+3d'` form of dependencies. */
export function formatDeps(deps: readonly Dependency[]): string {
  return deps
    .map((d) => {
      const type = d.type.toUpperCase();
      const lag = d.lag ? `${d.lag > 0 ? '+' : ''}${d.lag}${d.lagUnit === 'day' ? 'd' : d.lagUnit === 'hour' ? 'h' : 'm'}` : '';
      return `${d.id}${type === 'FS' && !lag ? '' : type}${lag}`;
    })
    .join(',');
}

export function infoOf<Row>(s: TaskSchedule, t: ProjectTaskInput, g: GanttInstance<Row>): GanttTaskInfo {
  return Object.freeze({
    id: s.id,
    parentId: s.parentId,
    level: s.level,
    start: s.start === null ? null : g.date(s.start),
    end: s.end === null ? null : g.date(s.end),
    duration: s.duration,
    durationUnit: s.durationUnit,
    progress: s.progress,
    milestone: s.milestone,
    parent: s.parent,
    manual: s.manual,
    unscheduled: s.unscheduled,
    work: s.work,
    wbs: s.wbs,
    critical: g.critical?.has(s.id) ?? s.critical,
    totalFloat: s.totalFloat / 3_600_000,
    predecessors: t.predecessors ?? [],
    segments: s.segments ? s.segments.map((x) => ({ start: g.date(x.start), end: g.date(x.end) })) : null,
  });
}
