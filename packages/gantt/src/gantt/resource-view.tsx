// Resource view model: the grid-pane rows
// of `resourceView` (one parent row per resource with its tasks as
// children, then an "Unassigned" row with the unassigned leaf tasks; a task
// with several resources appears under each), the summary span, the
// over-allocated ranges and the lanes of a resource row. Grid row keys are
// the task id for the first appearance of a task and `taskId@resourceId`
// after that, so `api.selectRows([taskId])` and the other id-addressed
// methods keep working; resource rows use `__res:<resourceId>`. Also the
// resource rows and multi-taskbars of the chart. A module of the
// `#gantt-modules` registry (lazy in the browser, static on the server),
// loaded only with `resourceView` or `multiTaskbar`.

import { memo, type ReactNode } from 'react';
import { overAllocations, resourceRows, stackLanes, type TimeRange } from '../internal/timeline/project/resources.js';
import { xOf, type TimeScale } from '../internal/timeline/scale.js';
import { barOf } from './chart.js';
import { GRID_PARENT_FIELD, RESOURCE_KEY, ROW_KEY, TASK_KEY } from './fields.js';
import type { GanttInstance } from './instance.js';

const resourceKey = (resourceId: string): string => `__res:${resourceId}`;

export interface ResourceInfo {
  readonly id: string;
  readonly name: string;
  /** Max units in percent (resource `unit` field; default 100). */
  readonly max: number;
}

export function resourcesOf<Row>(g: GanttInstance<Row>): ResourceInfo[] {
  const p = g.props;
  const idField = p.resourceFields?.id ?? 'id';
  const nameField = p.resourceFields?.name ?? 'name';
  const unitField = p.resourceFields?.unit ?? 'unit';
  return (p.resources ?? []).map((r) => {
    const unit = Number(r[unitField]);
    return { id: String(r[idField]), name: String(r[nameField] ?? r[idField]), max: Number.isFinite(unit) && unit > 0 ? unit : 100 };
  });
}

/** The resource view rows over the task rows the grid would show. */
export function buildResourceRows<Row>(g: GanttInstance<Row>, rowOf: (id: string) => Row | undefined): Row[] {
  const f = g.fields;
  const res = resourcesOf(g);
  const groups = resourceRows(g.engine.getTasks(), g.engine.getSchedule, res.map((r) => r.id));
  const seen = new Set<string>();
  const out: Row[] = [];
  for (const group of groups) {
    const rid = group.resourceId ?? '';
    const key = resourceKey(rid);
    const info = res.find((r) => r.id === rid);
    out.push({ [ROW_KEY]: key, [RESOURCE_KEY]: rid, [f.title]: info ? info.name : g.text('unassigned'), [GRID_PARENT_FIELD]: null } as Row);
    for (const id of group.taskIds) {
      const row = rowOf(id);
      if (!row) continue;
      const first = !seen.has(id);
      seen.add(id);
      out.push({ ...(row as Record<string, unknown>), [ROW_KEY]: first ? id : `${id}@${rid}`, [TASK_KEY]: id, [RESOURCE_KEY]: rid, [GRID_PARENT_FIELD]: key } as Row);
    }
  }
  return out;
}

export interface ResourceRowModel {
  readonly taskIds: readonly string[];
  readonly span: TimeRange | null;
  readonly over: readonly TimeRange[];
  /** Lane per entry of `taskIds` (`taskbarOverlap: false`), and the lane count. */
  readonly lanes: Int32Array;
  readonly laneCount: number;
}

/** Per-resource model, cached per instance version. */
export function resourceRowModel<Row>(g: GanttInstance<Row>, resourceId: string): ResourceRowModel {
  let cache = g.resourceCache;
  if (!cache || cache.version !== g.version) cache = g.resourceCache = { version: g.version, models: new Map() };
  const hit = cache.models.get(resourceId);
  if (hit) return hit;
  const tasks = g.engine.getTasks();
  const info = resourcesOf(g).find((r) => r.id === resourceId);
  const taskIds: string[] = [];
  const ranges: TimeRange[] = [];
  for (const t of tasks) {
    const s = g.engine.getSchedule(t.id);
    if (!s || s.start === null || s.end === null) continue;
    const assigned = resourceId === '' ? !s.parent && !(t.resources ?? []).some((a) => g.isResource(a.id)) : (t.resources ?? []).some((a) => a.id === resourceId);
    if (!assigned) continue;
    taskIds.push(t.id);
    ranges.push({ start: s.start, end: s.end });
  }
  let span: TimeRange | null = null;
  for (const r of ranges) span = span ? { start: Math.min(span.start, r.start), end: Math.max(span.end, r.end) } : r;
  const over = info && g.props.overAllocation ? overAllocations(resourceId, tasks, g.engine.getSchedule, (id) => g.engine.calendarOf(id), info.max) : [];
  const { lanes, count } = g.props.taskbarOverlap === false ? stackLanes(ranges) : { lanes: new Int32Array(ranges.length), count: 1 };
  const model: ResourceRowModel = { taskIds, span, over, lanes, laneCount: Math.max(1, count) };
  cache.models.set(resourceId, model);
  return model;
}

export interface ResourceRowView {
  readonly key: string;
  readonly resource: string;
  readonly title: string;
  readonly index: number;
  readonly top: number;
  readonly height: number;
  readonly collapsed: boolean;
}

const taskbarHeightOf = (p: { readonly taskbarHeight?: number | undefined; readonly rowHeight?: number | undefined }): number => p.taskbarHeight ?? Math.round((p.rowHeight ?? 36) * 0.6);

/** Child bars drawn in a collapsed parent or a resource row: plain marks, lanes when `taskbarOverlap` is false. */
export function MultiBars<Row>({ g, scale, ids, lanes, top, height, laneHeight, over }: { g: GanttInstance<Row>; scale: TimeScale; ids: readonly string[]; lanes: Int32Array | null; top: number; height: number; laneHeight: number; over: readonly { start: number; end: number }[] }) {
  return (
    <>
      {ids.map((id, i) => {
        const s = g.engine.getSchedule(id);
        const box = s ? barOf(scale, s) : null;
        if (!s || !box) return null;
        const lane = lanes ? (lanes[i] ?? 0) : 0;
        const overAllocated = over.some((r) => s.start !== null && s.end !== null && s.start < r.end && s.end > r.start);
        const title = String((g.getRow(id) as Record<string, unknown> | undefined)?.[g.fields.title] ?? '');
        return (
          <span
            key={id}
            className={s.milestone ? 'salmon-gantt__multi-bar salmon-gantt__multi-bar--milestone' : 'salmon-gantt__multi-bar'}
            data-part="multiTaskbar"
            data-task-id={id}
            data-lane={lane}
            data-over-allocated={overAllocated || undefined}
            title={title}
            style={{ insetInlineStart: s.milestone ? box.x - height / 2 : box.x, width: s.milestone ? height : box.width, top: top + lane * laneHeight, height }}
          >
            {s.milestone ? null : <span className="salmon-gantt__progress" style={{ width: `${s.progress}%` }} />}
          </span>
        );
      })}
    </>
  );
}

/** A resource row of the resource view: the span of its tasks, or their bars with `multiTaskbar`; over-allocated ranges marked. */
export const ResourceChartRow = memo(function ResourceChartRow<Row>({ g, view, scale, selected, version: _version }: { g: GanttInstance<Row>; view: ResourceRowView; scale: TimeScale; selected: boolean; version: number }) {
  const p = g.props;
  const m = resourceRowModel(g, view.resource);
  const th = Math.min(view.height - 4, taskbarHeightOf(p));
  const laneHeight = th + 4;
  const barTop = m.laneCount > 1 ? 4 : Math.round((view.height - th) / 2);
  const label = g.text('resourceLabel', { title: view.title, count: m.taskIds.length });
  const span = m.span;
  const x = span ? xOf(scale, span.start) : 0;
  const w = span ? Math.max(2, xOf(scale, span.end) - x) : 0;
  return (
    <div className="salmon-gantt__row salmon-gantt__row--resource" data-row-key={view.key} data-resource={view.resource} data-row-index={view.index} data-selected={selected || undefined} style={{ top: view.top, height: view.height }}>
      {m.over.map((r) => {
        const ox = xOf(scale, r.start);
        return <span key={r.start} className="salmon-gantt__over-allocation" data-part="overAllocation" title={g.text('overAllocated')} style={{ insetInlineStart: ox, width: Math.max(2, xOf(scale, r.end) - ox) }} />;
      })}
      {p.multiTaskbar ? (
        <>
          <span className="salmon-gantt__resource-bar" data-part="resource" role="img" aria-label={label} id={`${p.id ?? 'gantt'}-bar-${view.key}`} data-over-allocated={m.over.length ? '' : undefined} style={{ insetInlineStart: x, width: w, top: barTop, height: th }} />
          <MultiBars g={g} scale={scale} ids={m.taskIds} lanes={m.laneCount > 1 ? m.lanes : null} top={barTop} height={th} laneHeight={laneHeight} over={m.over} />
        </>
      ) : span ? (
        <div className="salmon-gantt__taskbar salmon-gantt__summary" data-part="taskbar" data-parent="" data-over-allocated={m.over.length ? '' : undefined} role="img" aria-label={label} id={`${p.id ?? 'gantt'}-bar-${view.key}`} style={{ insetInlineStart: x, width: w, top: barTop, height: th }} />
      ) : (
        <span role="img" aria-label={label} id={`${p.id ?? 'gantt'}-bar-${view.key}`} />
      )}
    </div>
  );
}) as <Row>(props: { g: GanttInstance<Row>; view: ResourceRowView; scale: TimeScale; selected: boolean; version: number }) => ReactNode;

/** Row height of a resource row with stacked lanes (`taskbarOverlap: false`), else null. */
export function resourceRowHeight<Row>(g: GanttInstance<Row>, resource: string): number | null {
  const p = g.props;
  if (p.taskbarOverlap !== false || !p.multiTaskbar) return null;
  const m = resourceRowModel(g, resource);
  if (m.laneCount <= 1) return null;
  return 8 + m.laneCount * (taskbarHeightOf(p) + 4) - 4;
}
