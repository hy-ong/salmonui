// Resource allocation:
// the resource view model (each resource with its tasks, an unassigned group
// of leaf tasks, all in tree order), over-allocated ranges of one resource (a
// sweep over its task intervals, segments counted per segment), and lane
// stacking of overlapping bars for `taskbarOverlap: false`. Pure: no React,
// no DOM globals, zero dependencies.

import type { WorkCalendar } from './calendar.js';
import type { ProjectTaskInput, TaskId, TaskSchedule } from './types.js';

/** Schedules by id: a map or a lookup function (`engine.getSchedule`). */
export type ScheduleLookup = ReadonlyMap<TaskId, TaskSchedule> | ((id: TaskId) => TaskSchedule | undefined);

const lookup = (s: ScheduleLookup, id: TaskId): TaskSchedule | undefined => (typeof s === 'function' ? s(id) : s.get(id));

export interface ResourceRow {
  /** null = the unassigned group. */
  readonly resourceId: string | null;
  readonly taskIds: readonly TaskId[];
}

/** Rows of the resource view: the resources in the given order, then the unassigned leaf tasks. */
export function resourceRows(tasks: readonly ProjectTaskInput[], schedules: ScheduleLookup, resourceIds: readonly string[]): ResourceRow[] {
  const byResource = new Map<string, TaskId[]>();
  for (const id of resourceIds) byResource.set(id, []);
  const unassigned: TaskId[] = [];
  for (const t of tasks) {
    const s = lookup(schedules, t.id);
    const res = t.resources ?? [];
    let assigned = false;
    for (const r of res) {
      const list = byResource.get(r.id);
      if (list) {
        if (list[list.length - 1] !== t.id) list.push(t.id);
        assigned = true;
      }
    }
    if (!assigned && s && !s.parent) unassigned.push(t.id);
  }
  const rows: ResourceRow[] = resourceIds.map((id) => ({ resourceId: id, taskIds: byResource.get(id) ?? [] }));
  rows.push({ resourceId: null, taskIds: unassigned });
  return rows;
}

export interface TimeRange {
  readonly start: number;
  readonly end: number;
}

/**
 * Ranges where the summed units of `resourceId` exceed `maxUnit` (percent),
 * trimmed to working time of the tasks' calendars; adjacent ranges merge.
 */
export function overAllocations(
  resourceId: string,
  tasks: readonly ProjectTaskInput[],
  schedules: ScheduleLookup,
  calendarOf: (id: TaskId) => WorkCalendar,
  maxUnit = 100,
): TimeRange[] {
  const times: number[] = [];
  const deltas: number[] = [];
  const cals: WorkCalendar[] = [];
  for (const t of tasks) {
    const r = t.resources?.find((x) => x.id === resourceId);
    if (!r) continue;
    const s = lookup(schedules, t.id);
    if (!s || s.parent || s.start === null || s.end === null || s.end <= s.start) continue;
    const unit = Number.isFinite(r.unit) ? r.unit : 100;
    cals.push(calendarOf(t.id));
    for (const seg of s.segments ?? [{ start: s.start, end: s.end }]) {
      if (seg.end <= seg.start) continue;
      times.push(seg.start, seg.end);
      deltas.push(unit, -unit);
    }
  }
  if (!times.length) return [];
  const order = Array.from(times.keys()).sort((a, b) => (times[a] as number) - (times[b] as number) || (deltas[a] as number) - (deltas[b] as number));
  const raw: TimeRange[] = [];
  let sum = 0;
  let openAt = NaN;
  for (const k of order) {
    sum += deltas[k] as number;
    const t = times[k] as number;
    if (sum > maxUnit + 1e-9) {
      if (Number.isNaN(openAt)) openAt = t;
    } else if (!Number.isNaN(openAt)) {
      if (t > openAt) raw.push({ start: openAt, end: t });
      openAt = NaN;
    }
  }
  // Trim to working time (the first calendar of the resource's tasks) and merge touching ranges.
  const cal = cals[0] as WorkCalendar;
  const out: TimeRange[] = [];
  for (const r of raw) {
    const start = cal.nextWorkingStart(r.start);
    const end = cal.prevWorkingEnd(r.end);
    if (end <= start) continue;
    const last = out[out.length - 1];
    if (last && start <= last.end) out[out.length - 1] = { start: last.start, end: Math.max(last.end, end) };
    else out.push({ start, end });
  }
  return out;
}

/** Lane per interval (greedy, lowest free lane, in start order) so overlapping intervals never share a lane. */
export function stackLanes(intervals: readonly TimeRange[]): { lanes: Int32Array; count: number } {
  const n = intervals.length;
  const lanes = new Int32Array(n);
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => (intervals[a] as TimeRange).start - (intervals[b] as TimeRange).start || a - b);
  const laneEnd: number[] = [];
  for (const i of order) {
    const iv = intervals[i] as TimeRange;
    const end = Math.max(iv.end, iv.start + 1); // milestones occupy their instant
    let lane = 0;
    while (lane < laneEnd.length && (laneEnd[lane] as number) > iv.start) lane++;
    laneEnd[lane] = end;
    lanes[i] = lane;
  }
  return { lanes, count: laneEnd.length };
}
