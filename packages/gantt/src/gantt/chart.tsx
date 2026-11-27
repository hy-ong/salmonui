'use client';

// The Gantt chart pane. It draws
// exactly the rows of the grid pane's visible row model in the grid's
// rendered window: the window
// and row offsets come from `api.getViewport()` / `api.getRowOffsets()`, a
// grid scroll moves the chart rows with one transform write (no React), and
// React re-renders only when the rendered window, the row model or the
// horizontal window changes. Before the grid mounts (server, hydration) the
// chart renders the grid's deterministic initial range.

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import type { RowMetrics } from '@salmonui/core/virtual';
import { DAY } from '@salmonui/core/internal/timeline/axis';
import { tierCells, xOf, type ScaleCell, type ScaleUnit, type TierSpec, type TimeScale } from '../internal/timeline/scale.js';
import type { Dependency, TaskSchedule } from '../internal/timeline/project/types.js';
import { GRID_PARENT_FIELD } from './fields.js';
import { formatDeps, type GanttInstance } from './instance.js';
import { peekGanttModules } from '#gantt-modules';
import type { ResourceRowView } from './resource-view.js';
import type { GanttIndicator, GanttLabel, GanttProps, GanttTaskbarContext, GanttTier, GanttTimelineCellContext } from './types.js';

/** Rows and offsets the chart renders. */
export interface ChartWindow<Row> {
  readonly start: number;
  readonly end: number;
  readonly rows: readonly Row[];
  readonly metrics: RowMetrics;
}

const fixedMetrics = (count: number, h: number): RowMetrics => ({
  count,
  totalHeight: count * h,
  offsetOf: (i) => i * h,
  heightOf: () => h,
  indexAt: (o) => Math.max(0, Math.min(count - 1, Math.floor(o / h))),
});

/** Visible rows before the grid mounts: tree order with collapsed subtrees removed (the grid's own rule). */
function initialVisible<Row>(g: GanttInstance<Row>): readonly Row[] {
  const p = g.props;
  const expandedField = g.fields.expanded;
  const collapsedAll = p.defaultExpanded === 'none' || p.defaultExpanded === false;
  const hidden = new Set<string>();
  const out: Row[] = [];
  for (const row of g.gridRows) {
    const r = row as Record<string, unknown>;
    const key = g.keyOf(row);
    const parent = r[GRID_PARENT_FIELD];
    if (parent !== null && parent !== undefined && hidden.has(String(parent))) {
      hidden.add(key);
      continue;
    }
    out.push(row);
    const flag = r[expandedField];
    if (typeof flag === 'boolean' ? !flag : collapsedAll) hidden.add(key);
  }
  return out;
}

/** Store of the rendered window, fed by the grid's viewport subscription. */
export class ChartViewport<Row> {
  private window: ChartWindow<Row> | null = null;
  private readonly listeners = new Set<() => void>();
  rowsEl: HTMLElement | null = null;
  private off: (() => void) | null = null;
  private top = 0;
  private written = '';
  constructor(private readonly g: GanttInstance<Row>) {}

  readonly subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  readonly get = (): ChartWindow<Row> => {
    if (this.window) return this.window;
    return this.initial();
  };

  /** The deterministic server / first-render window (grid `initialRows`, fixed row height). */
  private initialCache: { version: number; value: ChartWindow<Row> } | null = null;
  initial(): ChartWindow<Row> {
    const g = this.g;
    if (this.initialCache?.version === g.version) return this.initialCache.value;
    const rows = initialVisible(g);
    const h = g.props.rowHeight ?? 36;
    const value = { start: 0, end: Math.min(rows.length, g.props.initialRows ?? 20), rows, metrics: fixedMetrics(rows.length, h) };
    this.initialCache = { version: g.version, value };
    return value;
  }

  attach(): void {
    const api = this.g.gridApi;
    if (!api || this.off) return;
    this.off = api.subscribeViewport(this.onViewport);
    this.onViewport();
  }

  detach(): void {
    this.off?.();
    this.off = null;
  }

  /** Grid scroll or layout change: a transform write, or a new window for React when the rows changed. */
  readonly onViewport = (): void => {
    const api = this.g.gridApi;
    if (!api) return;
    const vp = api.getViewport();
    const metrics = api.getRowOffsets();
    const rows = api.getVisibleRows();
    const w = this.window;
    // The grid's rendered range (with overscan): every grid row has its bar (aria-describedby).
    const start = Math.min(vp.rows.overscanStart, metrics.count);
    const end = Math.min(vp.rows.overscanEnd, metrics.count);
    this.top = vp.top;
    // Rows the grid loaded itself (remote `data`, lazy children) join the engine.
    const g = this.g;
    if ((!w || w.rows !== rows) && (g.props.loadChildren || !Array.isArray(g.props.data))) {
      const fresh = rows.filter((r) => !g.engine.getTask(g.idOf(r)));
      if (fresh.length) g.adoptRemoteRows(fresh, (r) => {
        const p = api.getTreeRow(g.idOf(r))?.parentId;
        return p === null || p === undefined ? null : String(p);
      });
      g.remote?.confirm(rows);
    }
    if (!w || w.start !== start || w.end !== end || w.metrics !== metrics || w.rows !== rows) {
      this.window = { start, end, rows, metrics };
      for (const l of this.listeners) l();
    }
    this.apply();
  };

  /** Writes the rows transform for the current scroll offset. */
  apply(): void {
    const el = this.rowsEl;
    const w = this.window;
    if (!el || !w) return;
    const value = `translateY(${w.metrics.offsetOf(w.start) - this.top}px)`;
    if (value !== this.written) {
      el.style.transform = value;
      this.written = value;
    }
  }

  resetWritten(): void {
    this.written = '';
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const TOP_FORMATS: Readonly<Record<ScaleUnit, Intl.DateTimeFormatOptions>> = {
  year: { year: 'numeric' },
  month: { month: 'short', year: 'numeric' },
  week: { month: 'short', day: 'numeric', year: 'numeric' },
  day: { weekday: 'short', month: 'short', day: 'numeric' },
  hour: { month: 'short', day: 'numeric', hour: 'numeric' },
  minute: { hour: 'numeric', minute: '2-digit' },
};
const BOTTOM_FORMATS: Readonly<Record<ScaleUnit, Intl.DateTimeFormatOptions>> = {
  year: { year: 'numeric' },
  month: { month: 'short' },
  week: { month: 'short', day: 'numeric' },
  day: { weekday: 'narrow' },
  hour: { hour: 'numeric' },
  minute: { minute: '2-digit' },
};

/** `Intl` options of a CLDR skeleton (`'yMMMd'`) or a style (`'short'`); null for a pattern. */
function skeletonOf(f: string): Intl.DateTimeFormatOptions | null {
  if (/^(short|medium|long|full)$/.test(f)) return { dateStyle: f as 'short' };
  if (!/^[yMdEHhms]+$/.test(f)) return null;
  const o: Record<string, string> = {};
  for (const run of f.match(/(.)\1*/g) ?? []) {
    const n = run.length;
    const num = n === 2 ? '2-digit' : 'numeric';
    const c = run[0];
    if (c === 'y') o['year'] = num;
    else if (c === 'M') o['month'] = n <= 2 ? num : n === 3 ? 'short' : n === 4 ? 'long' : 'narrow';
    else if (c === 'd') o['day'] = num;
    else if (c === 'E') o['weekday'] = n === 4 ? 'long' : 'short';
    else if (c === 'm') o['minute'] = num;
    else if (c === 's') o['second'] = num;
    else {
      o['hour'] = num;
      o['hourCycle'] = c === 'H' ? 'h23' : 'h12';
    }
  }
  return o as Intl.DateTimeFormatOptions;
}

/** Formatters of wall ms (the scale's `Date.UTC` numbers, so always formatted in UTC). */
export function createFormatters(locale: string, dateFormat: Intl.DateTimeFormatOptions | string | undefined) {
  const cache = new Map<string, Intl.DateTimeFormat>();
  const fmt = (o: Intl.DateTimeFormatOptions): Intl.DateTimeFormat => {
    const key = JSON.stringify(o);
    let f = cache.get(key);
    if (!f) {
      try {
        f = new Intl.DateTimeFormat(locale, { ...o, timeZone: 'UTC' });
      } catch {
        f = new Intl.DateTimeFormat('en-US', { ...o, timeZone: 'UTC' });
      }
      cache.set(key, f);
    }
    return f;
  };
  // A skeleton or style string (`'yMMMd'`, `'short'`) formats the chart text too; a pattern formats the grid columns only.
  const dateOptions = (typeof dateFormat === 'object' ? dateFormat : dateFormat ? skeletonOf(dateFormat) : null) ?? { year: 'numeric', month: 'short', day: 'numeric' };
  return {
    tier: (wall: number, tier: 'top' | 'bottom', spec: TierSpec, format?: Intl.DateTimeFormatOptions): string => {
      if (!format && spec.unit === 'minute' && tier === 'bottom') return String(new Date(wall).getUTCMinutes()).padStart(2, '0');
      return fmt(format ?? (tier === 'top' ? TOP_FORMATS : BOTTOM_FORMATS)[spec.unit]).format(wall);
    },
    date: (wall: number): string => fmt(dateOptions).format(wall),
    full: (wall: number): string => fmt({ year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(wall),
  };
}

export type Formatters = ReturnType<typeof createFormatters>;

// ---------------------------------------------------------------------------
// Chart pane
// ---------------------------------------------------------------------------

export interface ChartProps<Row> {
  readonly g: GanttInstance<Row>;
  readonly version: number;
  readonly viewport: ChartViewport<Row>;
  readonly formatters: Formatters;
  readonly headerHeight: number;
  readonly hydrated: boolean;
  readonly selectedIds: ReadonlySet<string>;
  readonly onPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
  readonly onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;
  readonly onDoubleClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  readonly onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  readonly onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  readonly overlay?: ReactNode;
}

/** Horizontal window in px: changes only when the scroll crosses half a viewport. */
function useHorizontalWindow<Row>(g: GanttInstance<Row>, scrollEl: HTMLElement | null, scaleWidth: number): { from: number; to: number } {
  const [chunk, setChunk] = useState<{ from: number; to: number }>({ from: 0, to: 1600 });
  useEffect(() => {
    const el = scrollEl;
    if (!el) return;
    let frame = 0;
    let scrolled = false;
    const read = (): void => {
      frame = 0;
      const width = el.clientWidth || 800;
      const left = Math.abs(el.scrollLeft);
      const size = Math.max(200, width / 2);
      const from = Math.max(0, Math.floor((left - width) / size) * size);
      const to = Math.min(scaleWidth, from + width * 3 + size);
      setChunk((c) => (c.from === from && c.to === to ? c : { from, to }));
      // Infinite timeline: extend at the edges a user scroll reaches (not on mount or after a rescale).
      if (g.props.timeline?.infinite && scrolled) {
        scrolled = false;
        if (left < 2) g.extendTimeline('start');
        else if (left + width >= el.scrollWidth - 2) g.extendTimeline('end');
      }
    };
    const schedule = (): void => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    const onScroll = (): void => {
      scrolled = true;
      schedule();
    };
    read();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro?.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [g, scrollEl, scaleWidth]);
  return chunk;
}

function tierOf(spec: GanttTier | null | undefined, fallback: TierSpec | null): { spec: TierSpec; tier: GanttTier | null } | null {
  if (!fallback) return null;
  return { spec: fallback, tier: spec ?? null };
}

function Tiers<Row>({ g, scale, from, to, formatters, height }: { g: GanttInstance<Row>; scale: TimeScale; from: number; to: number; formatters: Formatters; height: number }) {
  const t = g.props.timeline;
  const top = tierOf(t?.topTier, scale.level.top);
  const bottom = tierOf(t?.bottomTier, scale.level.bottom);
  const rows = [top && { key: 'top' as const, ...top }, bottom && { key: 'bottom' as const, ...bottom }].filter(Boolean) as { key: 'top' | 'bottom'; spec: TierSpec; tier: GanttTier | null }[];
  const rowHeight = height / Math.max(1, rows.length);
  const tooltips = t?.tooltips !== false;
  return (
    <div className="salmon-gantt__timeline" aria-hidden="true" style={{ height, width: scale.width }}>
      {rows.map((r) => (
        <div key={r.key} className="salmon-gantt__tier" data-tier={r.key} style={{ height: rowHeight }}>
          {tierCells(scale, r.spec, from, to).map((c: ScaleCell) => {
            const text = formatters.tier(c.start, r.key, r.spec, r.tier?.format);
            const ctx: GanttTimelineCellContext = { tier: r.key, date: new Date(c.start), unit: r.spec.unit, width: c.width, text };
            const render = r.tier?.render ?? t?.renderCell;
            return (
              <div key={c.start} className="salmon-gantt__tier-cell" data-unit={r.spec.unit} title={tooltips ? formatters.full(c.start) : undefined} style={{ insetInlineStart: c.x, width: c.width }}>
                {render ? render(ctx) : text}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Weekend and holiday shading and markers in the horizontal window. */
function Background<Row>({ g, scale, from, to }: { g: GanttInstance<Row>; scale: TimeScale; from: number; to: number }) {
  const p = g.props;
  const items: ReactNode[] = [];
  const fine = scale.level.bottom.unit === 'day' || scale.level.bottom.unit === 'hour' || scale.level.bottom.unit === 'minute';
  if (p.highlightWeekends && fine) {
    const cal = g.engine.calendarOf(null);
    const first = Math.floor((scale.start + from / scale.pxPerMs) / DAY);
    const last = Math.ceil((scale.start + to / scale.pxPerMs) / DAY);
    for (let d = first; d <= last && d - first < 2000; d++) {
      const wd = (((d + 4) % 7) + 7) % 7;
      if (wd !== 0 && wd !== 6 && cal.isWorkingDay(d)) continue;
      if (wd !== 0 && wd !== 6) continue;
      const x = xOf(scale, d * DAY);
      items.push(<div key={`w${d}`} className="salmon-gantt__weekend" style={{ insetInlineStart: x, width: DAY * scale.pxPerMs }} />);
    }
  }
  for (const [i, h] of (p.holidays ?? []).entries()) {
    const s = g.wall(h.start);
    if (s === null) continue;
    const e = (g.wall(h.end ?? h.start) ?? s) + DAY;
    const x = xOf(scale, Math.floor(s / DAY) * DAY);
    const w = (Math.floor(e / DAY) * DAY - Math.floor(s / DAY) * DAY) * scale.pxPerMs;
    if (x + w < from || x > to) continue;
    items.push(
      <div key={`h${i}`} className={h.className ? `salmon-gantt__holiday ${h.className}` : 'salmon-gantt__holiday'} style={{ insetInlineStart: x, width: Math.max(1, w) }}>
        {h.label ? <span className="salmon-gantt__holiday-label">{h.label}</span> : null}
      </div>,
    );
  }
  for (const [i, m] of (p.markers ?? []).entries()) {
    const w = g.wall(m.date);
    if (w === null) continue;
    const x = xOf(scale, w);
    if (x < from || x > to) continue;
    items.push(
      <div key={`m${i}`} className={m.className ? `salmon-gantt__marker ${m.className}` : 'salmon-gantt__marker'} style={{ insetInlineStart: x }}>
        {m.label ? <span className="salmon-gantt__marker-label">{m.label}</span> : null}
      </div>,
    );
  }
  return <div className="salmon-gantt__background" aria-hidden="true">{items}</div>;
}

/** Bar geometry of a schedule. */
export interface BarBox {
  readonly x: number;
  readonly width: number;
}

export function barOf(scale: TimeScale, s: TaskSchedule): BarBox | null {
  if (s.start === null || s.end === null) return null;
  const x = xOf(scale, s.start);
  return { x, width: Math.max(s.milestone ? 0 : 2, xOf(scale, s.end) - x) };
}

interface RowView<Row> {
  /** Task id. */
  readonly id: string;
  /** Grid row key (the task id, or `id@resource` in the resource view). */
  readonly key: string;
  /** Resource group in the resource view. */
  readonly group: string | undefined;
  readonly row: Row;
  readonly index: number;
  readonly top: number;
  readonly height: number;
  readonly schedule: TaskSchedule;
  /** A parent whose children are hidden (multi-taskbar). */
  readonly collapsed: boolean;
}

function labelValue<Row>(label: GanttLabel<Row> | undefined, ctx: GanttTaskbarContext<Row>): ReactNode {
  if (label === undefined) return null;
  if (typeof label === 'function') return label(ctx);
  const v = (ctx.task as Record<string, unknown>)[label];
  return v === null || v === undefined ? null : String(v);
}

const ChartRow = memo(function ChartRow<Row>({ g, view, scale, selected, critical, formatters, version: _version }: { g: GanttInstance<Row>; view: RowView<Row>; scale: TimeScale; selected: boolean; critical: boolean; formatters: Formatters; version: number }) {
  const p = g.props;
  const { schedule: s, row } = view;
  const f = g.fields;
  const r = row as Record<string, unknown>;
  const box = barOf(scale, s);
  const taskbarHeight = Math.min(view.height - 4, p.taskbarHeight ?? Math.round((p.rowHeight ?? 36) * 0.6));
  const barTop = Math.round((view.height - taskbarHeight) / 2) - (p.baselines ? 3 : 0);
  const editable = g.editable() && (typeof p.editing !== 'object' || p.editing.taskbar !== false);
  const title = String(r[f.title] ?? '');
  const startText = s.start === null ? '' : formatters.date(s.start);
  const endText = s.end === null ? '' : formatters.date(s.end);
  const ctx: GanttTaskbarContext<Row> = {
    task: row,
    info: g.info(view.id) as GanttTaskbarContext<Row>['info'],
    start: s.start === null ? null : g.date(s.start),
    end: s.end === null ? null : g.date(s.end),
    progress: s.progress,
    width: box?.width ?? 0,
    critical,
    selected,
  };
  const extra = p.getTaskbarProps?.(ctx);
  const deps = g.engine.getTask(view.id)?.predecessors ?? [];
  const label =
    s.unscheduled || !box
      ? g.text('unscheduledLabel', { title })
      : s.milestone
        ? g.text('milestoneLabel', { title, start: startText })
        : g.text(s.parent ? 'parentLabel' : 'taskbarLabel', { title, start: startText, end: endText, progress: Math.round(s.progress) });
  const aria = deps.length ? `${label}, ${g.text('dependsOn', { list: formatDeps(deps) })}${critical ? `, ${g.text('critical')}` : ''}` : critical ? `${label}, ${g.text('critical')}` : label;
  const userClass = typeof r[f.className] === 'string' ? (r[f.className] as string) : '';
  const cls = (base: string): string => [base, userClass, extra?.className].filter(Boolean).join(' ');
  const dataAttrs: Record<string, unknown> = {};
  if (extra) for (const k of Object.keys(extra)) if (k.startsWith('data-')) dataAttrs[k] = (extra as Record<string, unknown>)[k];
  // Over-allocation: a task bar of a resource group inside an over-allocated range.
  const rv = peekGanttModules().resources;
  const over = view.group && p.overAllocation && rv ? rv.resourceRowModel(g, view.group).over : null;
  const overAllocated = !!over && s.start !== null && s.end !== null && over.some((x) => (s.start as number) < x.end && (s.end as number) > x.start);
  const multi = p.multiTaskbar && rv && view.collapsed && s.parent ? g.engine.getTasks().filter((t) => t.parentId === view.id).map((t) => t.id) : null;
  const state = {
    'data-over-allocated': overAllocated || undefined,
    'data-multi': multi ? '' : undefined,
    'data-critical': critical || undefined,
    'data-manual': s.manual || undefined,
    'data-selected': selected || undefined,
    'data-parent': s.parent || undefined,
    'data-editable': editable || undefined,
    ...dataAttrs,
  };
  const barStyle: CSSProperties = { top: barTop, height: taskbarHeight, ...extra?.style };

  let bar: ReactNode = null;
  if (s.unscheduled || !box) {
    const x = xOf(scale, g.projectRange().start);
    bar = <div className={cls('salmon-gantt__taskbar salmon-gantt__unscheduled')} data-part="taskbar" data-unscheduled="" role="img" aria-label={aria} id={`${g.props.id ?? 'gantt'}-bar-${view.key}`} style={{ ...barStyle, insetInlineStart: x, width: scale.level.unitWidth }} />;
  } else if (s.milestone) {
    const size = taskbarHeight;
    bar = (
      <div className={cls('salmon-gantt__milestone')} data-part="milestone" role="img" aria-label={aria} {...state} data-template={p.renderMilestone ? '' : undefined} id={`${g.props.id ?? 'gantt'}-bar-${view.key}`} style={{ ...barStyle, insetInlineStart: box.x - size / 2, width: size, height: size }}>
        {p.renderMilestone ? p.renderMilestone(ctx) : null}
        {editable ? <span className="salmon-gantt__connector-point" data-end="end" aria-hidden="true" /> : null}
      </div>
    );
  } else if (s.parent) {
    const rollup = s.manual && s.rollupStart !== null && s.rollupEnd !== null ? { x: xOf(scale, s.rollupStart), w: xOf(scale, s.rollupEnd) - xOf(scale, s.rollupStart) } : null;
    bar = (
      <>
        {rollup ? <div className="salmon-gantt__rollup" aria-hidden="true" style={{ top: barTop + taskbarHeight, insetInlineStart: rollup.x, width: Math.max(2, rollup.w) }} /> : null}
        <div className={cls('salmon-gantt__taskbar salmon-gantt__summary')} data-part="taskbar" role="img" aria-label={aria} {...state} data-template={p.renderParentTaskbar && !multi ? '' : undefined} id={`${g.props.id ?? 'gantt'}-bar-${view.key}`} style={{ ...barStyle, insetInlineStart: box.x, width: box.width }}>
          {multi ? null : p.renderParentTaskbar ? (
            p.renderParentTaskbar(ctx)
          ) : (
            <>
              <div className="salmon-gantt__progress" style={{ width: `${s.progress}%` }} />
              {p.labels?.inside ? <span className="salmon-gantt__label" data-side="inside">{labelValue(p.labels.inside, ctx)}</span> : null}
            </>
          )}
          {editable && s.manual ? (
            <>
              <span className="salmon-gantt__handle" data-handle="start" aria-hidden="true" />
              <span className="salmon-gantt__handle" data-handle="end" aria-hidden="true" />
            </>
          ) : null}
        </div>
        {multi && rv ? <rv.MultiBars g={g} scale={scale} ids={multi} lanes={null} top={barTop} height={taskbarHeight} laneHeight={0} over={[]} /> : null}
      </>
    );
  } else {
    const segments = s.segments && s.segments.length > 1 ? s.segments : null;
    bar = (
      <div className={cls('salmon-gantt__taskbar')} data-part="taskbar" role="img" aria-label={aria} {...state} data-split={segments ? '' : undefined} data-template={p.renderTaskbar ? '' : undefined} id={`${g.props.id ?? 'gantt'}-bar-${view.key}`} style={{ ...barStyle, insetInlineStart: box.x, width: box.width }}>
        {p.renderTaskbar ? (
          p.renderTaskbar(ctx)
        ) : segments ? (
          segments.map((seg, i) => {
            const sx = xOf(scale, seg.start) - box.x;
            const sw = Math.max(2, xOf(scale, seg.end) - xOf(scale, seg.start));
            const next = segments[i + 1];
            return (
              <span key={seg.start} className="salmon-gantt__segment-wrap">
                <span className="salmon-gantt__segment" data-segment={i} style={{ insetInlineStart: sx, width: sw }}>
                  {editable ? (
                    <>
                      <span className="salmon-gantt__handle" data-handle="start" data-segment={i} aria-hidden="true" />
                      <span className="salmon-gantt__handle" data-handle="end" data-segment={i} aria-hidden="true" />
                    </>
                  ) : null}
                </span>
                {next ? <span className="salmon-gantt__segment-gap" style={{ insetInlineStart: sx + sw, width: Math.max(0, xOf(scale, next.start) - xOf(scale, seg.end)) }} /> : null}
              </span>
            );
          })
        ) : (
          <>
            <div className="salmon-gantt__progress" style={{ width: `${s.progress}%` }} />
            {p.labels?.inside ? <span className="salmon-gantt__label" data-side="inside">{labelValue(p.labels.inside, ctx)}</span> : null}
          </>
        )}
        {editable ? (
          <>
            {segments ? null : (
              <>
                <span className="salmon-gantt__handle" data-handle="start" aria-hidden="true" />
                <span className="salmon-gantt__handle" data-handle="end" aria-hidden="true" />
                <span className="salmon-gantt__progress-handle" aria-hidden="true" style={{ insetInlineStart: `${s.progress}%` }} />
              </>
            )}
            <span className="salmon-gantt__connector-point" data-end="start" aria-hidden="true" />
            <span className="salmon-gantt__connector-point" data-end="end" aria-hidden="true" />
          </>
        ) : null}
      </div>
    );
  }

  // Baseline.
  let baseline: ReactNode = null;
  if (p.baselines) {
    const t = g.engine.getTask(view.id);
    const bs = t?.baselineStart ?? null;
    const be = t?.baselineEnd ?? bs;
    if (bs !== null && be !== null) {
      const bx = xOf(scale, bs);
      const bw = xOf(scale, be) - bx;
      baseline = p.renderBaseline ? (
        <div className="salmon-gantt__baseline" data-part="baseline" style={{ insetInlineStart: bx, width: Math.max(2, bw), top: barTop + taskbarHeight + 2 }}>
          {p.renderBaseline(ctx)}
        </div>
      ) : (
        <div className="salmon-gantt__baseline" data-part="baseline" data-milestone={bw <= 0 || undefined} aria-hidden="true" style={{ insetInlineStart: bw <= 0 ? bx - 5 : bx, width: bw <= 0 ? 10 : bw, top: barTop + taskbarHeight + 2 }} />
      );
    }
  }

  // Labels and indicators.
  const startLabel = box && p.labels?.start ? labelValue(p.labels.start, ctx) : null;
  const endLabel = box && p.labels?.end ? labelValue(p.labels.end, ctx) : null;
  const indicators = (r[f.indicators] as readonly GanttIndicator[] | undefined) ?? null;
  const rowClass = s.parent ? 'salmon-gantt__row salmon-gantt__row--parent' : 'salmon-gantt__row';
  // A remote write in flight.
  const pending = g.pending.has(view.id);

  return (
    <div className={rowClass} data-task-id={view.id} data-row-key={view.key} data-resource={view.group} data-row-index={view.index} data-pending={pending || undefined} style={{ top: view.top, height: view.height, opacity: pending ? 0.6 : undefined }}>
      {baseline}
      {bar}
      {startLabel !== null && box ? (
        <span className="salmon-gantt__label" data-side="start" style={{ insetInlineEnd: `calc(100% - ${box.x - (s.milestone ? taskbarHeight / 2 : 0) - 4}px)`, top: barTop, lineHeight: `${taskbarHeight}px` }}>
          {startLabel}
        </span>
      ) : null}
      {endLabel !== null && box ? (
        <span className="salmon-gantt__label" data-side="end" style={{ insetInlineStart: box.x + box.width + (s.milestone ? taskbarHeight / 2 : 0) + 4, top: barTop, lineHeight: `${taskbarHeight}px` }}>
          {endLabel}
        </span>
      ) : null}
      {indicators?.map((ind, i) => {
        const w = g.wall(ind.date);
        if (w === null) return null;
        return (
          <span key={i} className={ind.className ? `salmon-gantt__indicator ${ind.className}` : 'salmon-gantt__indicator'} title={ind.tooltip} style={{ insetInlineStart: xOf(scale, w), top: barTop }}>
            {ind.icon ?? <span className="salmon-gantt__indicator-dot" aria-hidden="true" />}
            {ind.label ? <span className="salmon-gantt__indicator-label">{ind.label}</span> : null}
          </span>
        );
      })}
    </div>
  );
}) as <Row>(props: { g: GanttInstance<Row>; view: RowView<Row>; scale: TimeScale; selected: boolean; critical: boolean; formatters: Formatters; version: number }) => ReactNode;

/** Orthogonal connector path between two bars. */
export function connectorPath(x1: number, y1: number, fromEnd: boolean, x2: number, y2: number, toStart: boolean, rowGap: number): { d: string; arrow: string } {
  const g = 10;
  const out = fromEnd ? 1 : -1;
  const dir = toStart ? 1 : -1;
  const a = x1 + out * g;
  const b = x2 - dir * g;
  let d: string;
  if (out === dir && (dir === 1 ? b >= a : b <= a)) d = `M${x1} ${y1}H${a}V${y2}H${x2}`;
  else if (out !== dir) {
    const xm = out === -1 ? Math.min(a, b) : Math.max(a, b);
    d = `M${x1} ${y1}H${xm}V${y2}H${x2}`;
  } else {
    const ym = y1 + (y2 >= y1 ? rowGap : -rowGap);
    d = `M${x1} ${y1}H${a}V${ym}H${b}V${y2}H${x2}`;
  }
  const arrow = `M${x2} ${y2}l${-dir * 6} -4v8z`;
  return { d, arrow };
}

function Connectors<Row>({ g, views, window: w, scale, from, to, indexOf }: { g: GanttInstance<Row>; views: readonly RowView<Row>[]; window: ChartWindow<Row>; scale: TimeScale; from: number; to: number; indexOf: ReadonlyMap<string, number> }) {
  const base = w.metrics.offsetOf(w.start);
  const paths: ReactNode[] = [];
  const p = g.props;
  const taskbarHeight = (h: number): number => Math.min(h - 4, p.taskbarHeight ?? Math.round((p.rowHeight ?? 36) * 0.6));
  const width = p.connectorWidth ?? 1;
  const edge = (s: TaskSchedule, end: boolean): number | null => {
    const box = barOf(scale, s);
    if (!box) return null;
    if (s.milestone) {
      const half = taskbarHeight(p.rowHeight ?? 36) / 2;
      return end ? box.x + half : box.x - half;
    }
    return end ? box.x + box.width : box.x;
  };
  const drawn = new Set<string>();
  const draw = (fromId: string, toId: string, dep: Dependency): void => {
    const key = `${fromId}>${toId}`;
    if (drawn.has(key)) return;
    drawn.add(key);
    const fi = indexOf.get(fromId);
    const ti = indexOf.get(toId);
    if (fi === undefined || ti === undefined) return;
    const fs = g.engine.getSchedule(fromId);
    const ts = g.engine.getSchedule(toId);
    if (!fs || !ts) return;
    const fromEnd = dep.type === 'fs' || dep.type === 'ff';
    const toStart = dep.type === 'fs' || dep.type === 'ss';
    const x1 = edge(fs, fromEnd);
    const x2 = edge(ts, !toStart);
    if (x1 === null || x2 === null) return;
    if (Math.max(x1, x2) < from - 200 || Math.min(x1, x2) > to + 200) return;
    const y1 = w.metrics.offsetOf(fi) - base + w.metrics.heightOf(fi) / 2;
    const y2 = w.metrics.offsetOf(ti) - base + w.metrics.heightOf(ti) / 2;
    const { d, arrow } = connectorPath(x1, y1, fromEnd, x2, y2, toStart, w.metrics.heightOf(fi) / 2);
    const critical = !!g.critical?.has(fromId) && !!g.critical?.has(toId);
    paths.push(
      <g key={key} className="salmon-gantt__connector" data-part="connector" data-from={fromId} data-to={toId} data-type={dep.type} data-critical={critical || undefined}>
        <path d={d} fill="none" strokeWidth={width} />
        <path d={arrow} className="salmon-gantt__connector-arrow" />
        <path d={d} fill="none" className="salmon-gantt__connector-hit" strokeWidth={8} />
      </g>,
    );
  };
  for (const v of views) {
    const t = g.engine.getTask(v.id);
    for (const dep of t?.predecessors ?? []) draw(dep.id, v.id, dep);
  }
  // Links from rendered predecessors to successors outside the window.
  for (const v of views) {
    for (const succ of g.engine.successorsOf?.(v.id) ?? []) {
      const dep = g.engine.getTask(succ)?.predecessors?.find((d) => d.id === v.id);
      if (dep) draw(v.id, succ, dep);
    }
  }
  const height = w.metrics.offsetOf(w.end) - base;
  return (
    <svg className="salmon-gantt__connectors" aria-hidden="true" width={scale.width} height={Math.max(1, height)} style={{ width: scale.width, height: Math.max(1, height) }}>
      {paths}
    </svg>
  );
}

export function GanttChart<Row>(props: ChartProps<Row>) {
  const { g, version, viewport, formatters, headerHeight } = props;
  const w = useSyncExternalStore(viewport.subscribe, viewport.get, viewport.get);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const scale = g.scale;
  const { from, to } = useHorizontalWindow(g, scrollEl, scale.width);
  const rowsRef = useCallback(
    (el: HTMLDivElement | null) => {
      viewport.rowsEl = el;
      viewport.resetWritten();
      viewport.apply();
    },
    [viewport],
  );
  useLayoutEffect(() => {
    viewport.apply();
  });
  const scrollRef = useCallback(
    (el: HTMLDivElement | null) => {
      g.chartScroll = el;
      setScrollEl(el);
    },
    [g],
  );

  const indexOf = useMemo(() => {
    const m = new Map<string, number>();
    w.rows.forEach((r, i) => {
      const id = g.taskIdOf(r);
      if (id !== null && !m.has(id)) m.set(id, i);
    });
    return m;
  }, [w.rows, g]);

  const views: RowView<Row>[] = [];
  const resourceViews: ResourceRowView[] = [];
  const ResourceRow = peekGanttModules().resources?.ResourceChartRow;
  const base = w.metrics.offsetOf(w.start);
  // Skeleton rows under lazy parents whose children load (loading.tsx).
  const sk = g.loadingParents.size ? (peekGanttModules().loading?.skeletonRows(g, w, scale) ?? null) : null;
  for (let i = w.start; i < w.end; i++) {
    const row = w.rows[i];
    if (row === undefined) continue;
    const key = g.keyOf(row);
    const next = w.rows[i + 1];
    const collapsed = next === undefined || String((next as Record<string, unknown>)[GRID_PARENT_FIELD]) !== key;
    const top = w.metrics.offsetOf(i) - base + (sk ? sk.shift(i) : 0);
    const height = w.metrics.heightOf(i);
    const id = g.taskIdOf(row);
    if (id === null) {
      const resource = g.groupOf(row) ?? '';
      resourceViews.push({ key, resource, title: String((row as Record<string, unknown>)[g.fields.title] ?? ''), index: i, top, height, collapsed });
      continue;
    }
    const schedule = g.engine.getSchedule(id);
    if (!schedule) continue;
    // The grid row object may be a stale copy; the chart reads the current one.
    views.push({ id, key, group: g.groupOf(row), row: g.getRow(id) ?? row, index: i, top, height, schedule, collapsed: schedule.parent && collapsed });
  }

  return (
    <div className="salmon-gantt__chart" ref={(el) => void (g.chartRoot = el)} onPointerDown={props.onPointerDown} onContextMenu={props.onContextMenu} onDoubleClick={props.onDoubleClick} onClick={props.onClick} onKeyDown={props.onKeyDown}>
      <div className="salmon-gantt__chart-scroll" ref={scrollRef} tabIndex={0} role="group" aria-label={g.text('chart')}>
        <div className="salmon-gantt__chart-inner" style={{ width: scale.width }}>
          <Tiers g={g} scale={scale} from={from} to={to} formatters={formatters} height={headerHeight} />
          <div className="salmon-gantt__chart-body">
            <Background g={g} scale={scale} from={from} to={to} />
            <div className="salmon-gantt__rows" ref={rowsRef}>
              <Connectors g={g} views={views} window={w} scale={scale} from={from} to={to} indexOf={indexOf} />
              {ResourceRow
                ? resourceViews.map((v) => <ResourceRow key={v.key} g={g} view={v} scale={scale} selected={props.selectedIds.has(v.key)} version={version} />)
                : null}
              {views.map((v) => (
                <ChartRow key={v.key} g={g} view={v} scale={scale} selected={props.selectedIds.has(v.key)} critical={!!g.critical?.has(v.id)} formatters={formatters} version={version} />
              ))}
              {sk?.nodes}
            </div>
          </div>
        </div>
      </div>
      {props.overlay}
    </div>
  );
}
