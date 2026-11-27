// Task field mapping of the Gantt: data rows
// (nested `children` or flat `parentId`) to the project engine's task
// inputs, and computed schedules back into rows. Dates are wall-clock ms in
// `timeZone` inside the engine; rows carry `Date` instants (computed values are
// written into the records too). Pure, no React.

import { toDate, toPlainDateTime, utc } from '@salmonui/core/internal/dates/index';
import { parseDependencies } from '../internal/timeline/project/dependencies.js';
import type { ConstraintType, DurationUnit, ProjectTaskInput, ResourceAssignment, SegmentInput, TaskSchedule, TaskType } from '../internal/timeline/project/types.js';
import type { GanttTaskFields, GanttTaskRole } from './types.js';

export type Fields = Readonly<Record<GanttTaskRole, string>> & { readonly children: string | null };

const ROLES: readonly GanttTaskRole[] = [
  'id', 'title', 'start', 'end', 'duration', 'durationUnit', 'progress', 'parentId', 'predecessors', 'milestone', 'notes',
  'baselineStart', 'baselineEnd', 'baselineDuration', 'resources', 'work', 'taskType', 'manual', 'segments', 'indicators',
  'expanded', 'constraintType', 'constraintDate', 'calendar', 'className',
];

/** Field names per role; nested data unless `parentId` is mapped (or `children` explicitly set). */
export function resolveFields(map: GanttTaskFields | undefined): Fields {
  const out: Record<string, string | null> = {};
  for (const r of ROLES) out[r] = map?.[r] ?? r;
  out['children'] = map?.children ?? (map?.parentId ? null : 'children');
  return out as unknown as Fields;
}

/** Wall ms of a date input in `timeZone` (host zone without one); null when empty or invalid. */
export function wallOf(value: unknown, timeZone: string | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const p = toPlainDateTime(typeof value === 'number' ? new Date(value) : value, timeZone);
  return p ? utc(p.year, p.month, p.day, p.hour, p.minute, p.second, p.millisecond) : null;
}

/** The instant of a wall time in `timeZone` (host zone without one). */
export function dateOf(wall: number, timeZone: string | undefined): Date {
  const d = new Date(wall);
  if (timeZone) return toDate({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds() }, timeZone);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

const UNITS = new Set(['minute', 'hour', 'day']);
const TYPES = new Set(['fixedUnit', 'fixedWork', 'fixedDuration']);
const CONSTRAINTS = new Set(['asSoonAsPossible', 'asLateAsPossible', 'startNoEarlierThan', 'startNoLaterThan', 'finishNoEarlierThan', 'finishNoLaterThan', 'mustStartOn', 'mustFinishOn']);
/** Constraint numbers and abbreviations accepted as aliases. */
const CONSTRAINT_ALIASES: Readonly<Record<string, ConstraintType>> = {
  '0': 'asSoonAsPossible', '1': 'asLateAsPossible', '2': 'mustStartOn', '3': 'mustFinishOn', '4': 'startNoEarlierThan', '5': 'startNoLaterThan', '6': 'finishNoEarlierThan', '7': 'finishNoLaterThan',
  asap: 'asSoonAsPossible', alap: 'asLateAsPossible', mso: 'mustStartOn', mfo: 'mustFinishOn', snet: 'startNoEarlierThan', snlt: 'startNoLaterThan', fnet: 'finishNoEarlierThan', fnlt: 'finishNoLaterThan',
};

function unitOf(v: unknown): DurationUnit | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.toLowerCase().replace(/s$/, '');
  return UNITS.has(s) ? (s as DurationUnit) : undefined;
}

function typeOf(v: unknown): TaskType | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.charAt(0).toLowerCase() + v.slice(1);
  return TYPES.has(s) ? (s as TaskType) : undefined;
}

function constraintOf(v: unknown): ConstraintType | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v);
  if (CONSTRAINTS.has(s)) return s as ConstraintType;
  return CONSTRAINT_ALIASES[s.toLowerCase()];
}

function resourcesOf(v: unknown, idField: string, unitField: string): ResourceAssignment[] | undefined {
  if (v === null || v === undefined) return undefined;
  const list = Array.isArray(v) ? v : [v];
  const out: ResourceAssignment[] = [];
  for (const item of list) {
    if (item === null || item === undefined) continue;
    if (typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const id = o[idField] ?? o['id'];
      if (id === undefined || id === null) continue;
      out.push({ id: String(id), unit: num(o[unitField] ?? o['unit']) ?? 100 });
    } else out.push({ id: String(item), unit: 100 });
  }
  return out;
}

export interface MapContext {
  readonly fields: Fields;
  readonly timeZone: string | undefined;
  readonly resourceIdField: string;
  readonly resourceUnitField: string;
}

/** One row as an engine task input. */
export function toTaskInput(row: unknown, id: string, parentId: string | null, ctx: MapContext): ProjectTaskInput {
  const r = row as Record<string, unknown>;
  const f = ctx.fields;
  const tz = ctx.timeZone;
  const segs = r[f.segments];
  const segments: SegmentInput[] | null = Array.isArray(segs)
    ? segs.map((s) => {
        const o = s as Record<string, unknown>;
        return { start: wallOf(o['start'] ?? o['startDate'], tz), end: wallOf(o['end'] ?? o['endDate'], tz), duration: num(o['duration']) };
      })
    : null;
  const input: Record<string, unknown> = {
    id,
    parentId,
    start: wallOf(r[f.start], tz),
    end: wallOf(r[f.end], tz),
    duration: num(r[f.duration]),
    progress: num(r[f.progress]) ?? 0,
    milestone: r[f.milestone] === true,
    predecessors: parseDependencies(r[f.predecessors] as string | readonly unknown[] | null | undefined),
    constraintDate: wallOf(r[f.constraintDate], tz),
    baselineStart: wallOf(r[f.baselineStart], tz),
    baselineEnd: wallOf(r[f.baselineEnd], tz),
    work: num(r[f.work]),
    segments,
  };
  const unit = unitOf(r[f.durationUnit]);
  if (unit) input['durationUnit'] = unit;
  const type = typeOf(r[f.taskType]);
  if (type) input['taskType'] = type;
  const c = constraintOf(r[f.constraintType]);
  if (c) input['constraintType'] = c;
  if (typeof r[f.manual] === 'boolean') input['manual'] = r[f.manual];
  const cal = r[f.calendar];
  if (typeof cal === 'string') input['calendar'] = cal;
  const res = resourcesOf(r[f.resources], ctx.resourceIdField, ctx.resourceUnitField);
  if (res) input['resources'] = res;
  return input as unknown as ProjectTaskInput;
}

/** Flattened data: rows in tree order with their parent ids. */
export interface FlatData<Row> {
  readonly rows: Row[];
  readonly ids: string[];
  readonly parents: (string | null)[];
}

/** Flattens nested (`children`) or flat (`parentId`) rows in tree (depth-first) order. */
export function flatten<Row>(data: readonly Row[], fields: Fields, idOf: (row: Row) => string): FlatData<Row> {
  const rows: Row[] = [];
  const ids: string[] = [];
  const parents: (string | null)[] = [];
  const childKey = fields.children;
  if (childKey) {
    const walk = (list: readonly Row[], parent: string | null): void => {
      for (const row of list) {
        const id = idOf(row);
        rows.push(row);
        ids.push(id);
        parents.push(parent);
        const kids = (row as Record<string, unknown>)[childKey];
        if (Array.isArray(kids) && kids.length) walk(kids as Row[], id);
      }
    };
    walk(data, null);
    return { rows, ids, parents };
  }
  // Flat: keep data order but group children under parents (depth-first).
  const byParent = new Map<string | null, Row[]>();
  const known = new Set<string>();
  for (const row of data) known.add(idOf(row));
  for (const row of data) {
    const p = (row as Record<string, unknown>)[fields.parentId];
    const key = p === null || p === undefined || p === '' || !known.has(String(p)) ? null : String(p);
    let list = byParent.get(key);
    if (!list) byParent.set(key, (list = []));
    list.push(row);
  }
  const seen = new Set<string>();
  const walk = (parent: string | null): void => {
    for (const row of byParent.get(parent) ?? []) {
      const id = idOf(row);
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push(row);
      ids.push(id);
      parents.push(parent);
      walk(id);
    }
  };
  walk(null);
  return { rows, ids, parents };
}

/**
 * The grid-pane row of a task: the data row with the computed roles written
 * (dates as instants, duration, progress, the parent id for the flat tree)
 * and the nested child array removed. A new object only when something changed.
 */
export function writeRow<Row>(row: Row, schedule: TaskSchedule, parentId: string | null, ctx: MapContext, previous: Row | undefined): Row {
  const f = ctx.fields;
  const r = row as Record<string, unknown>;
  const start = schedule.start === null ? null : dateOf(schedule.start, ctx.timeZone);
  const end = schedule.end === null ? null : dateOf(schedule.end, ctx.timeZone);
  const prev = previous as Record<string, unknown> | undefined;
  const same = (a: unknown, b: Date | null): boolean => (a instanceof Date && b ? a.getTime() === b.getTime() : a === b);
  if (
    prev &&
    same(prev[f.start], start) &&
    same(prev[f.end], end) &&
    prev[f.duration] === schedule.duration &&
    prev[f.progress] === schedule.progress &&
    prev['__salmonParentId'] === parentId &&
    Object.keys(r).every((k) => k === f.start || k === f.end || k === f.duration || k === f.progress || k === f.children || prev[k] === r[k])
  ) {
    return previous as Row;
  }
  const out: Record<string, unknown> = { ...r, [f.start]: start, [f.end]: end, [f.duration]: schedule.duration, [f.progress]: schedule.progress, __salmonParentId: parentId };
  if (f.children) delete out[f.children];
  return out as Row;
}

/** Field for the flat tree of the grid pane. */
export const GRID_PARENT_FIELD = '__salmonParentId';
/** Resource view: grid row key, task id of a task row, resource of a row ('' = unassigned). */
export const ROW_KEY = '__salmonKey';
export const TASK_KEY = '__salmonTask';
export const RESOURCE_KEY = '__salmonResource';

/** The changes of a grid-pane edit as engine changes (field values to roles). */
export function changesOf(row: unknown, changedFields: readonly string[], ctx: MapContext, id: string, parentId: string | null): Partial<ProjectTaskInput> {
  const full = toTaskInput(row, id, parentId, ctx) as unknown as Record<string, unknown>;
  const f = ctx.fields as unknown as Record<string, string>;
  const out: Record<string, unknown> = {};
  for (const field of changedFields) {
    for (const role of ROLES) {
      if (f[role] !== field) continue;
      if (role in full) out[role] = full[role];
      // A start edit keeps the duration (end follows); an end edit changes the duration.
      if (role === 'end') out['duration'] = null;
    }
  }
  return out as Partial<ProjectTaskInput>;
}
