// Project scheduling engine (project
// subsystem of `internal/timeline`, with change
// records): the task tree, working-time duration math, task modes and
// types, constraints, dependency propagation with lag (parent dependencies
// through parent gates), cycle detection, roll-ups, validation, tree edits and
// the per-task frozen `TaskSchedule`. The graph has two nodes per task (the
// task or roll-up node and a parent gate that carries a parent's
// dependencies to its children) in one topological order; an edit marks
// nodes dirty and recomputes forward from the first dirty position, so only
// the affected subgraph is rescheduled. Numeric state lives in one strided
// Float64Array. Pure: no React, no DOM globals, zero dependencies, no
// module-level mutable state.

import { createWorkCalendar, type CalendarException, type WorkCalendar, type WorkingTimeInput } from './calendar.js';
import type { computeCritical } from './critical.js';
import { formatDependency } from './dependencies.js';
import { formatDurationValue, parseDurationText, type DurationText } from './format.js';
import type {
  ConstraintType,
  Dependency,
  DependencyType,
  DurationUnit,
  ProjectTaskInput,
  ResourceAssignment,
  ScheduleConflict,
  ScheduleSegment,
  SegmentInput,
  TaskId,
  TaskMode,
  TaskSchedule,
  TaskType,
  UpdateResult,
  WorkUnit,
} from './types.js';

export type { UpdateResult } from './types.js';
export type { CalendarException, WorkCalendar, WorkingTimeInput } from './calendar.js';

export interface ProjectCalendarInput {
  readonly id: string;
  readonly workingTime?: WorkingTimeInput;
  readonly exceptions?: readonly CalendarException[];
}

export interface ProjectOptions {
  readonly workingTime?: WorkingTimeInput;
  readonly holidays?: readonly CalendarException[];
  readonly calendars?: readonly ProjectCalendarInput[];
  readonly projectCalendar?: string;
  readonly taskMode?: TaskMode;
  readonly autoSchedule?: boolean;
  readonly projectStart?: number | null;
  readonly projectEnd?: number | null;
  readonly durationUnit?: DurationUnit;
  readonly workUnit?: WorkUnit;
  readonly taskType?: TaskType;
  readonly dependencyTypes?: readonly DependencyType[];
  readonly validateDependencies?: boolean;
  readonly validateManualTasks?: boolean;
  readonly parentDependencies?: boolean;
  readonly dependencyLag?: { readonly normalizeOnLoad?: boolean; readonly updateOnTaskbarEdit?: boolean };
  readonly unscheduledTasks?: boolean;
}

export type TaskChanges = Partial<Omit<ProjectTaskInput, 'id'>>;

export interface UpdateOptions {
  readonly source?: 'taskbar' | 'edit' | 'api';
  /** Reject a start earlier than the dependencies allow (default: `validateDependencies` for taskbar and edit sources). */
  readonly validate?: boolean;
}

/** A task input at its tree-order position. */
export interface TaskSnapshot {
  readonly id: TaskId;
  readonly index: number;
  readonly task: ProjectTaskInput;
}

/** One user-level change: the touched tasks before (absent = added) and after (absent = removed). */
export interface ChangeRecord {
  readonly action: string;
  readonly before: readonly TaskSnapshot[];
  readonly after: readonly TaskSnapshot[];
}

export type MovePosition = 'above' | 'below' | 'child';

export interface ProjectEngine {
  load(tasks: readonly ProjectTaskInput[]): void;
  setOptions(options: ProjectOptions): void;
  readonly options: ProjectOptions;
  getTask(id: TaskId): ProjectTaskInput | undefined;
  getSchedule(id: TaskId): TaskSchedule | undefined;
  /** Inputs in tree order (a new array after every change). */
  getTasks(): readonly ProjectTaskInput[];
  /** Schedules in tree order. */
  getSchedules(): readonly TaskSchedule[];
  readonly version: number;
  subscribe(listener: (changed: ReadonlySet<TaskId> | null) => void): () => void;
  update(id: TaskId, changes: TaskChanges, options?: UpdateOptions): UpdateResult;
  preview(id: TaskId, changes: TaskChanges, options?: UpdateOptions): UpdateResult & { readonly schedules: ReadonlyMap<TaskId, TaskSchedule> };
  add(task: ProjectTaskInput, at?: { readonly index?: number }): void;
  remove(ids: readonly TaskId[]): void;
  changeId(id: TaskId, newId: TaskId): void;
  move(ids: readonly TaskId[], targetId: TaskId, position: MovePosition): void;
  indent(ids: readonly TaskId[]): void;
  outdent(ids: readonly TaskId[]): void;
  addDependency(taskId: TaskId, dep: Dependency): UpdateResult;
  removeDependency(taskId: TaskId, predecessorId: TaskId): UpdateResult;
  setDependencies(taskId: TaskId, deps: readonly Dependency[]): UpdateResult;
  splitTask(id: TaskId, at: number, gapWorkMs?: number): UpdateResult;
  mergeSegments(id: TaskId, indexes: readonly number[]): UpdateResult;
  setTaskMode(id: TaskId, manual: boolean): UpdateResult;
  convertToMilestone(id: TaskId): UpdateResult;
  convertToTask(id: TaskId): UpdateResult;
  projectRange(): { start: number; end: number } | null;
  setProjectDates(start: number | null, end: number | null): void;
  /**
   * The backward pass (`critical.ts` `computeCritical`), passed in so the
   * engine does not carry it: the Gantt loads it as a chunk when the
   * critical path is first needed.
   */
  computeCriticalPath(compute: typeof computeCritical): { critical: ReadonlySet<TaskId>; finish: number };
  formatDuration(task: TaskId | TaskSchedule, text?: DurationText): string;
  parseDuration(text: string, unit: DurationUnit, words?: DurationText): { value: number; unit: DurationUnit } | null;
  formatWork(task: TaskId | TaskSchedule, text?: DurationText): string;
  formatWbsPredecessors(id: TaskId): string;
  /** The task's calendar; null = the project calendar. */
  calendarOf(id: TaskId | null): WorkCalendar;
  /** Direct successors (tasks whose predecessor links name `id`), in tree order. */
  successorsOf(id: TaskId): readonly TaskId[];
  /** Groups the changes of `fn` into one change record and one notification. */
  batch<T>(action: string, fn: () => T): T;
  /** Change records of committed user-level changes (the history attaches here). */
  onCommit(listener: (record: ChangeRecord) => void): () => void;
  /** Reapplies one side of a record as one change (undo: `'before'`, redo: `'after'`); not recorded. */
  applyRecord(record: ChangeRecord, side: 'before' | 'after'): UpdateResult;
}

// ---------------------------------------------------------------------------

const CONSTRAINT: Readonly<Record<ConstraintType, number>> = {
  asSoonAsPossible: 0,
  asLateAsPossible: 1,
  startNoEarlierThan: 2,
  startNoLaterThan: 3,
  finishNoEarlierThan: 4,
  finishNoLaterThan: 5,
  mustStartOn: 6,
  mustFinishOn: 7,
};
const DEP_CODE: Readonly<Record<DependencyType, number>> = { fs: 0, ss: 1, ff: 2, sf: 3 };
const DEP_NAME: readonly DependencyType[] = ['fs', 'ss', 'ff', 'sf'];
const EMPTY: readonly ScheduleConflict[] = Object.freeze([]);
/** Tolerance (ms) when comparing a requested start with the allowed one. */
const TOL = 500;

// Strided numeric state per task.
const S = 0; // start (final)
const E = 1; // end (final)
const ES = 2; // early start (what successors read)
const EE = 3; // early end
const W = 4; // working ms of the duration
const SW = 5; // roll-up weight (leaf duration, 0 for milestones; parents: sum)
const SWP = 6; // weight x progress
const PR = 7; // parent progress
const RS = 8; // roll-up start
const RE = 9; // roll-up end
const G = 10; // parent gate: earliest start its dependencies allow its children
const B = 11; // dependency bound of the last computation
const UN = 12; // unscheduled
const BP = 13; // bound predecessor index
const BT = 14; // bound type code
const GP = 15; // gate predecessor index
const GT = 16; // gate type code
const WK = 17; // work ms (duration x units; parents: sum)
const K = 18;

const same = (a: number, b: number): boolean => a === b || (a !== a && b !== b);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const round4 = (v: number): number => Math.round(v * 1e4) / 1e4;

interface Prep {
  readonly input: ProjectTaskInput;
  readonly cal: WorkCalendar;
  /** Scheduled by the engine (auto mode and `autoSchedule`). */
  readonly auto: boolean;
  readonly manual: boolean;
  readonly unscheduled: boolean;
  readonly milestone: boolean;
  readonly hasDates: boolean;
  readonly dStart: number;
  readonly dEnd: number;
  readonly w: number;
  readonly span: number;
  readonly segOff: Float64Array | null;
  readonly segLen: Float64Array | null;
  readonly units: number;
  readonly progress: number;
  readonly cType: number;
  readonly cDate: number;
  readonly unit: DurationUnit;
  readonly taskType: TaskType;
}

interface Graph {
  readonly depStart: Int32Array;
  readonly depPred: Int32Array;
  readonly depSucc: Int32Array;
  readonly depType: Uint8Array;
  readonly depLag: Float64Array;
  readonly depDropped: Uint8Array;
  /** Index of the dependency in the successor's `predecessors`. */
  readonly depIndex: Int32Array;
  readonly droppedCount: number;
  readonly outStart: Int32Array;
  readonly outTo: Int32Array;
  readonly outDep: Int32Array;
  readonly topo: Int32Array;
  readonly pos: Int32Array;
}

interface Saved {
  readonly st: Float64Array;
  readonly conf: readonly ScheduleConflict[] | null;
  readonly segs: readonly ScheduleSegment[] | null;
  readonly sched: TaskSchedule;
}

interface World {
  list: ProjectTaskInput[];
  readonly n: number;
  readonly ids: Map<TaskId, number>;
  readonly parentOf: Int32Array;
  readonly isParent: Uint8Array;
  readonly childStart: Int32Array;
  readonly childList: Int32Array;
  readonly level: Int32Array;
  readonly subEnd: Int32Array;
  readonly wbs: string[];
  readonly prep: Prep[];
  g: Graph;
  readonly st: Float64Array;
  readonly conf: (readonly ScheduleConflict[] | null)[];
  readonly segs: (readonly ScheduleSegment[] | null)[];
  readonly sched: TaskSchedule[];
  readonly dirty: Uint8Array;
  pending: number;
  minPos: number;
  readonly touchMark: Uint8Array;
  touched: number[];
  journal: Map<number, Saved> | null;
  alap: Int32Array | null;
  readonly defaultStart: number;
  normalizing: boolean;
}

interface Ctx {
  readonly opt: ProjectOptions;
  readonly base: WorkCalendar;
  readonly project: WorkCalendar;
  readonly named: ReadonlyMap<string, WorkCalendar>;
  readonly autoSchedule: boolean;
  readonly taskMode: TaskMode;
  readonly durationUnit: DurationUnit;
  readonly workUnit: WorkUnit;
  readonly taskType: TaskType;
  readonly validateManual: boolean;
  readonly parentDeps: boolean;
  readonly allowed: ReadonlySet<DependencyType>;
  readonly unscheduledTasks: boolean;
}

function makeCtx(opt: ProjectOptions): Ctx {
  const holidays = opt.holidays ?? [];
  const base = createWorkCalendar(opt.workingTime, holidays);
  const named = new Map<string, WorkCalendar>();
  for (const c of opt.calendars ?? []) named.set(c.id, createWorkCalendar(c.workingTime ?? opt.workingTime, [...(c.exceptions ?? []), ...holidays]));
  return {
    opt,
    base,
    project: (opt.projectCalendar && named.get(opt.projectCalendar)) || base,
    named,
    autoSchedule: opt.autoSchedule !== false,
    taskMode: opt.taskMode ?? 'auto',
    durationUnit: opt.durationUnit ?? 'day',
    workUnit: opt.workUnit ?? 'hour',
    taskType: opt.taskType ?? 'fixedUnit',
    validateManual: opt.validateManualTasks === true,
    parentDeps: opt.parentDependencies !== false,
    allowed: new Set(opt.dependencyTypes ?? DEP_NAME),
    unscheduledTasks: opt.unscheduledTasks === true,
  };
}

/** Start snapping: tasks to the next working start, milestones also stay at a range end. */
function snap(cal: WorkCalendar, t: number, span: number): number {
  if (!Number.isFinite(t)) return t;
  if (span > 0) return cal.nextWorkingStart(t);
  return cal.prevWorkingEnd(t) === t ? t : cal.nextWorkingStart(t);
}

function unitsOf(resources: readonly ResourceAssignment[] | undefined): number {
  if (!resources || !resources.length) return 1;
  let sum = 0;
  for (const r of resources) sum += finite(r.unit) ? r.unit : 100;
  return sum / 100;
}

function prepare(input: ProjectTaskInput, parent: boolean, ctx: Ctx, defaultStart: number): Prep {
  const cal = (input.calendar && ctx.named.get(input.calendar)) || ctx.project;
  const unit = input.durationUnit ?? ctx.durationUnit;
  const manual = ctx.taskMode === 'manual' || (ctx.taskMode === 'custom' && input.manual === true);
  const auto = !manual && ctx.autoSchedule;
  const s = finite(input.start) ? input.start : NaN;
  const e = finite(input.end) ? input.end : NaN;
  const dur = finite(input.duration) && input.duration >= 0 ? input.duration : NaN;
  const units = unitsOf(input.resources);
  const hasDates = !Number.isNaN(s) || !Number.isNaN(e);
  let segOff: Float64Array | null = null;
  let segLen: Float64Array | null = null;
  let w: number;
  let span: number;
  let first = s;
  const segs = !parent ? input.segments : null;
  if (segs && segs.length > 1) {
    const abs: [number, number][] = [];
    let prev = Number.isNaN(s) ? defaultStart : s;
    for (const g of segs) {
      let a = finite(g.start) ? g.start : prev;
      if (auto) a = cal.nextWorkingStart(a);
      const b = finite(g.end) ? g.end : cal.addWork(a, finite(g.duration) ? Math.round(cal.toWorkMs(g.duration, unit)) : cal.unitMs('day'));
      abs.push([a, Math.max(a, b)]);
      prev = Math.max(a, b);
    }
    abs.sort((x, y) => x[0] - y[0]);
    const s0 = (abs[0] as [number, number])[0];
    segOff = new Float64Array(abs.length);
    segLen = new Float64Array(abs.length);
    w = 0;
    for (let k = 0; k < abs.length; k++) {
      const [a, b] = abs[k] as [number, number];
      segOff[k] = Math.max(k ? (segOff[k - 1] as number) + (segLen[k - 1] as number) : 0, cal.workBetween(s0, a));
      segLen[k] = Math.max(0, cal.workBetween(a, b));
      w += segLen[k] as number;
    }
    span = (segOff[abs.length - 1] as number) + (segLen[abs.length - 1] as number);
    if (Number.isNaN(first)) first = s0;
  } else {
    if (!parent && input.milestone === true) w = 0;
    else if (!Number.isNaN(dur)) w = Math.round(cal.toWorkMs(dur, unit));
    else if (!Number.isNaN(s) && !Number.isNaN(e)) w = Math.max(0, cal.workBetween(auto ? cal.nextWorkingStart(s) : s, e));
    else if (finite(input.work) && input.work >= 0) w = Math.round((input.work * cal.unitMs(ctx.workUnit)) / units);
    else w = cal.unitMs('day');
    span = w;
  }
  const unscheduled = ctx.unscheduledTasks && Number.isNaN(s) && Number.isNaN(e) && Number.isNaN(dur) && !segOff;
  let dStart: number;
  if (!Number.isNaN(first)) dStart = auto ? snap(cal, first, span) : first;
  else if (!Number.isNaN(e)) dStart = auto ? snap(cal, cal.addWork(e, -span), span) : cal.addWork(e, -span);
  else dStart = auto ? snap(cal, defaultStart, span) : defaultStart;
  const dEnd = !auto && !Number.isNaN(e) && Number.isNaN(dur) && !segOff && !Number.isNaN(s) ? e : span ? cal.addWork(dStart, span) : dStart;
  let cType = CONSTRAINT[input.constraintType ?? 'asSoonAsPossible'] ?? 0;
  const cDate = finite(input.constraintDate) ? input.constraintDate : NaN;
  if (cType > 1 && Number.isNaN(cDate)) cType = 0;
  return {
    input,
    cal,
    auto,
    manual,
    unscheduled,
    milestone: !parent && !unscheduled && w === 0,
    hasDates,
    dStart,
    dEnd,
    w,
    span,
    segOff,
    segLen,
    units,
    progress: Math.max(0, Math.min(100, finite(input.progress) ? input.progress : 0)),
    cType,
    cDate,
    unit,
    taskType: input.taskType ?? ctx.taskType,
  };
}

/** Tree order of a list: DFS from roots in array order; children in array order; parent cycles become roots. */
function treeOrder(list: readonly ProjectTaskInput[]): ProjectTaskInput[] {
  const ids = new Map<TaskId, number>();
  const keep: number[] = [];
  list.forEach((t, i) => {
    if (!ids.has(t.id)) {
      ids.set(t.id, i);
      keep.push(i);
    }
  });
  const kids = new Map<number, number[]>();
  const roots: number[] = [];
  for (const i of keep) {
    const p = (list[i] as ProjectTaskInput).parentId;
    const pi = p === null || p === undefined ? undefined : ids.get(p);
    if (pi === undefined || pi === i) roots.push(i);
    else {
      let arr = kids.get(pi);
      if (!arr) kids.set(pi, (arr = []));
      arr.push(i);
    }
  }
  const out: ProjectTaskInput[] = [];
  const seen = new Uint8Array(list.length);
  const visit = (r: number): void => {
    const stack = [r];
    while (stack.length) {
      const i = stack.pop() as number;
      if (seen[i]) continue;
      seen[i] = 1;
      out.push(list[i] as ProjectTaskInput);
      const c = kids.get(i);
      if (c) for (let k = c.length - 1; k >= 0; k--) stack.push(c[k] as number);
    }
  };
  for (const r of roots) visit(r);
  for (const i of keep) if (!seen[i]) visit(i);
  return out;
}

function buildGraph(w: Pick<World, 'n' | 'ids' | 'isParent' | 'parentOf' | 'childStart' | 'childList' | 'prep'>, ctx: Ctx): Graph {
  const { n, ids, isParent, prep } = w;
  const depStart = new Int32Array(n + 1);
  const pred: number[] = [];
  const type: number[] = [];
  const lag: number[] = [];
  const index: number[] = [];
  for (let s = 0; s < n; s++) {
    depStart[s] = pred.length;
    const p = prep[s] as Prep;
    const deps = p.input.predecessors;
    if (!deps) continue;
    for (let j = 0; j < deps.length; j++) {
      const d = deps[j] as Dependency;
      const q = ids.get(d.id);
      if (q === undefined || q === s || !ctx.allowed.has(d.type)) continue;
      if (!ctx.parentDeps && (isParent[q] || isParent[s])) continue;
      pred.push(q);
      type.push(DEP_CODE[d.type] ?? 0);
      lag.push(finite(d.lag) ? Math.round(p.cal.toWorkMs(d.lag, d.lagUnit ?? 'day')) : 0);
      index.push(j);
    }
  }
  depStart[n] = pred.length;
  const m = pred.length;
  const depSucc = new Int32Array(m);
  for (let s = 0; s < n; s++) for (let d = depStart[s] as number; d < (depStart[s + 1] as number); d++) depSucc[d] = s;
  const N = 2 * n;
  // Edges: deps, gate -> child, child -> parent.
  const from: number[] = [];
  const to: number[] = [];
  const dep: number[] = [];
  for (let d = 0; d < m; d++) {
    const s = depSucc[d] as number;
    from.push(pred[d] as number);
    to.push(isParent[s] ? n + s : s);
    dep.push(d);
  }
  for (let p = 0; p < n; p++) {
    if (!isParent[p]) continue;
    for (let k = w.childStart[p] as number; k < (w.childStart[p + 1] as number); k++) {
      const c = w.childList[k] as number;
      from.push(n + p);
      to.push(isParent[c] ? n + c : c);
      dep.push(-1);
      from.push(c);
      to.push(p);
      dep.push(-1);
    }
  }
  const M = from.length;
  const outStart = new Int32Array(N + 1);
  // Counting sort into CSR.
  const deg = new Int32Array(N + 1);
  for (let e = 0; e < M; e++) deg[(from[e] as number) + 1] = (deg[(from[e] as number) + 1] as number) + 1;
  for (let v = 0; v < N; v++) deg[v + 1] = (deg[v + 1] as number) + (deg[v] as number);
  outStart.set(deg);
  const fill = deg.slice(0, N);
  const outTo = new Int32Array(M);
  const outDep = new Int32Array(M);
  for (let e = 0; e < M; e++) {
    const f = from[e] as number;
    const at = fill[f] as number;
    fill[f] = at + 1;
    outTo[at] = to[e] as number;
    outDep[at] = dep[e] as number;
  }
  // Kahn's algorithm; a stuck remainder is a cycle: drop its closing link and continue.
  const indeg = new Int32Array(N);
  for (let e = 0; e < M; e++) indeg[outTo[e] as number] = (indeg[outTo[e] as number] as number) + 1;
  const depDropped = new Uint8Array(m);
  let droppedCount = 0;
  const topo = new Int32Array(N);
  const done = new Uint8Array(N);
  let head = 0;
  let tail = 0;
  for (let v = 0; v < N; v++) if (!indeg[v]) topo[tail++] = v;
  let inStart: Int32Array | null = null;
  let inFrom: Int32Array | null = null;
  let inEdge: Int32Array | null = null;
  let scan = 0;
  while (tail < N) {
    while (head < tail) {
      const v = topo[head++] as number;
      done[v] = 1;
      for (let e = outStart[v] as number; e < (outStart[v + 1] as number); e++) {
        const d = outDep[e] as number;
        if (d >= 0 && depDropped[d]) continue;
        const t = outTo[e] as number;
        indeg[t] = (indeg[t] as number) - 1;
        if (!indeg[t]) topo[tail++] = t;
      }
    }
    if (tail >= N) break;
    if (!inStart || !inFrom || !inEdge) {
      inStart = new Int32Array(N + 1);
      for (let e = 0; e < M; e++) inStart[(outTo[e] as number) + 1] = (inStart[(outTo[e] as number) + 1] as number) + 1;
      for (let v = 0; v < N; v++) inStart[v + 1] = (inStart[v + 1] as number) + (inStart[v] as number);
      const f2 = inStart.slice(0, N);
      inFrom = new Int32Array(M);
      inEdge = new Int32Array(M);
      for (let v = 0; v < N; v++)
        for (let e = outStart[v] as number; e < (outStart[v + 1] as number); e++) {
          const t = outTo[e] as number;
          const at = f2[t] as number;
          f2[t] = at + 1;
          inFrom[at] = v;
          inEdge[at] = e;
        }
    }
    while (scan < N && (done[scan] || !indeg[scan])) scan++;
    const v0 = scan;
    // Walk backwards along live edges from unfinished nodes until a node repeats.
    const via = new Map<number, number>();
    let cur = v0;
    while (!via.has(cur)) {
      let picked = -1;
      for (let k = inStart[cur] as number; k < (inStart[cur + 1] as number); k++) {
        const e = inEdge[k] as number;
        const d = outDep[e] as number;
        if (d >= 0 && depDropped[d]) continue;
        if (!done[inFrom[k] as number]) {
          picked = k;
          break;
        }
      }
      if (picked < 0) break;
      via.set(cur, picked);
      cur = inFrom[picked] as number;
    }
    let drop = -1;
    if (via.has(cur)) {
      const startNode = cur;
      let x = startNode;
      let rank = -1;
      do {
        const k = via.get(x) as number;
        const d = outDep[inEdge[k] as number] as number;
        if (d >= 0) {
          // The closing link points backwards in tree order (predecessor after successor); else the last defined.
          const q = pred[d] as number;
          const sc = depSucc[d] as number;
          const r = (q > sc ? 2 ** 40 + q * 65536 : sc * 65536) + (index[d] as number);
          if (r > rank) {
            rank = r;
            drop = d;
          }
        }
        x = inFrom[k] as number;
      } while (x !== startNode);
    }
    if (drop >= 0) {
      depDropped[drop] = 1;
      droppedCount++;
      const s = depSucc[drop] as number;
      const t = isParent[s] ? n + s : s;
      indeg[t] = (indeg[t] as number) - 1;
      if (!indeg[t]) topo[tail++] = t;
    } else {
      indeg[v0] = 0;
      topo[tail++] = v0;
    }
  }
  const pos = new Int32Array(N);
  for (let k = 0; k < N; k++) pos[topo[k] as number] = k;
  return {
    depStart,
    depPred: Int32Array.from(pred),
    depSucc,
    depType: Uint8Array.from(type),
    depLag: Float64Array.from(lag),
    depDropped,
    depIndex: Int32Array.from(index),
    droppedCount,
    outStart,
    outTo,
    outDep,
    topo,
    pos,
  };
}

// ---------------------------------------------------------------------------

export function createProjectEngine(initial: ProjectOptions = {}): ProjectEngine {
  let ctx = makeCtx(initial);
  let world: World = buildWorld([], null, false);
  let version = 0;
  const listeners = new Set<(changed: ReadonlySet<TaskId> | null) => void>();
  const recorders = new Set<(record: ChangeRecord) => void>();
  let critical: ReadonlySet<TaskId> = new Set();
  // Batch state.
  let depth = 0;
  let batchAction = '';
  let batchList: readonly ProjectTaskInput[] = [];
  let batchTouched = new Set<TaskId>();
  let batchChanged: Set<TaskId> | null = new Set();
  let batchNotify = false;
  let recording = true;

  // ---- world construction -------------------------------------------------

  function buildWorld(input: readonly ProjectTaskInput[], prev: World | null, normalize: boolean): World {
    const list = treeOrder(input);
    const n = list.length;
    const ids = new Map<TaskId, number>();
    list.forEach((t, i) => ids.set(t.id, i));
    const parentOf = new Int32Array(n).fill(-1);
    const isParent = new Uint8Array(n);
    const level = new Int32Array(n);
    const counts = new Int32Array(n + 1);
    for (let i = 0; i < n; i++) {
      const p = (list[i] as ProjectTaskInput).parentId;
      const pi = p === null || p === undefined ? undefined : ids.get(p);
      if (pi !== undefined && pi < i) {
        parentOf[i] = pi;
        isParent[pi] = 1;
        level[i] = (level[pi] as number) + 1;
        counts[pi + 1] = (counts[pi + 1] as number) + 1;
      }
    }
    for (let i = 0; i < n; i++) counts[i + 1] = (counts[i + 1] as number) + (counts[i] as number);
    const childStart = counts;
    const fill = counts.slice(0, n);
    const childList = new Int32Array(Math.max(0, childStart[n] as number));
    const wbs: string[] = new Array<string>(n);
    let rootCount = 0;
    for (let i = 0; i < n; i++) {
      const p = parentOf[i] as number;
      if (p < 0) wbs[i] = String(++rootCount);
      else {
        const at = fill[p] as number;
        fill[p] = at + 1;
        childList[at] = i;
        wbs[i] = `${wbs[p] as string}.${at - (childStart[p] as number) + 1}`;
      }
    }
    const subEnd = new Int32Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let end = i + 1;
      const c0 = childStart[i] as number;
      const c1 = childStart[i + 1] as number;
      if (c1 > c0) end = subEnd[childList[c1 - 1] as number] as number;
      subEnd[i] = end;
    }
    let defaultStart = finite(ctx.opt.projectStart) ? ctx.opt.projectStart : Infinity;
    if (!Number.isFinite(defaultStart)) {
      for (const t of list) if (finite(t.start) && t.start < defaultStart) defaultStart = t.start;
      if (!Number.isFinite(defaultStart)) for (const t of list) if (finite(t.end) && t.end < defaultStart) defaultStart = t.end;
      if (!Number.isFinite(defaultStart)) defaultStart = 0;
    }
    const prep = list.map((t, i) => prepare(t, isParent[i] === 1, ctx, defaultStart));
    const partial = { n, ids, isParent, parentOf, childStart, childList, prep };
    const g = buildGraph(partial, ctx);
    const w: World = {
      list,
      n,
      ids,
      parentOf,
      isParent,
      childStart,
      childList,
      level,
      subEnd,
      wbs,
      prep,
      g,
      st: new Float64Array(n * K),
      conf: new Array<readonly ScheduleConflict[] | null>(n).fill(null),
      segs: new Array<readonly ScheduleSegment[] | null>(n).fill(null),
      sched: new Array<TaskSchedule>(n),
      dirty: new Uint8Array(2 * n),
      pending: 0,
      minPos: 2 * n,
      touchMark: new Uint8Array(n),
      touched: [],
      journal: null,
      alap: null,
      defaultStart,
      normalizing: normalize,
    };
    const topo = g.topo;
    for (let k = 0; k < topo.length; k++) computeNode(w, topo[k] as number);
    w.normalizing = false;
    applyAlap(w);
    w.touched = [];
    w.touchMark.fill(0);
    for (let i = 0; i < n; i++) {
      const old = prev ? prev.sched[prev.ids.get(list[i]!.id) ?? -1] : undefined;
      w.sched[i] = makeSchedule(w, i, old);
    }
    return w;
  }

  // ---- node computation ----------------------------------------------------

  function save(w: World, i: number): void {
    const j = w.journal;
    if (!j || j.has(i)) return;
    j.set(i, { st: w.st.slice(i * K, i * K + K), conf: w.conf[i] ?? null, segs: w.segs[i] ?? null, sched: w.sched[i] as TaskSchedule });
  }

  function touch(w: World, i: number): void {
    if (!w.touchMark[i]) {
      w.touchMark[i] = 1;
      w.touched.push(i);
    }
  }

  function computeNode(w: World, v: number): boolean {
    if (v < w.n) return w.isParent[v] ? computeRollup(w, v) : computeLeaf(w, v);
    return w.isParent[v - w.n] ? computeGate(w, v - w.n) : false;
  }

  function conflict(w: World, kind: 'dependency' | 'constraint', i: number, pred: number, type: number, earliest: number): ScheduleConflict {
    return Object.freeze({
      kind,
      taskId: (w.list[i] as ProjectTaskInput).id,
      predecessorId: pred >= 0 ? (w.list[pred] as ProjectTaskInput).id : null,
      type: pred >= 0 ? (DEP_NAME[type] as DependencyType) : null,
      earliestStart: earliest,
    });
  }

  /** Earliest start the links of task `i` allow (with `span` for finish links); sets BP/BT-like outputs. */
  function depBound(w: World, i: number, span: number, out: Float64Array): number {
    const g = w.g;
    const st = w.st;
    const cal = (w.prep[i] as Prep).cal;
    let bound = -Infinity;
    let bp = -1;
    let bt = 0;
    for (let d = g.depStart[i] as number, e = g.depStart[i + 1] as number; d < e; d++) {
      if (g.depDropped[d]) continue;
      const q = g.depPred[d] as number;
      const qo = q * K;
      if (st[qo + UN]) continue;
      const lag = g.depLag[d] as number;
      const t = g.depType[d] as number;
      let b: number;
      if (t === 0) {
        const x = st[qo + EE] as number;
        b = lag ? cal.addWork(x, lag) : x;
      } else if (t === 1) {
        const x = st[qo + ES] as number;
        b = lag ? cal.addWork(x, lag) : x;
      } else {
        const x = (t === 2 ? st[qo + EE] : st[qo + ES]) as number;
        const eb = lag ? cal.addWork(x, lag) : x;
        b = span ? cal.addWork(eb, -span) : eb;
      }
      if (b > bound) {
        bound = b;
        bp = q;
        bt = t;
      }
    }
    out[0] = bp;
    out[1] = bt;
    return bound;
  }

  const scratch = new Float64Array(2);

  /** Places the segments of task `i` from `start`; returns the end. */
  function placeSegments(w: World, i: number, start: number): number {
    const p = w.prep[i] as Prep;
    const off = p.segOff as Float64Array;
    const len = p.segLen as Float64Array;
    const out: ScheduleSegment[] = [];
    let end = start;
    for (let k = 0; k < off.length; k++) {
      const o = off[k] as number;
      const s = k === 0 ? start : p.auto ? p.cal.nextWorkingStart(p.cal.addWork(start, o)) : p.cal.addWork(start, o);
      const l = len[k] as number;
      end = l ? p.cal.addWork(s, l) : s;
      out.push(Object.freeze({ start: s, end }));
    }
    w.segs[i] = Object.freeze(out);
    return end;
  }

  /** Rewrites the lags of task `i` so its links land exactly on its data dates (`dependencyLag.normalizeOnLoad`). */
  function normalizeLags(w: World, i: number): void {
    const p = w.prep[i] as Prep;
    const g = w.g;
    const deps = p.input.predecessors;
    if (!deps || !p.hasDates || (g.depStart[i] as number) === (g.depStart[i + 1] as number)) return;
    const next = deps.slice();
    const end = p.span ? p.cal.addWork(p.dStart, p.span) : p.dStart;
    for (let d = g.depStart[i] as number; d < (g.depStart[i + 1] as number); d++) {
      if (g.depDropped[d]) continue;
      const qo = (g.depPred[d] as number) * K;
      if (w.st[qo + UN]) continue;
      const t = g.depType[d] as number;
      const from = (t === 0 || t === 2 ? w.st[qo + EE] : w.st[qo + ES]) as number;
      const gap = p.cal.workBetween(from, t < 2 ? p.dStart : end);
      g.depLag[d] = gap;
      const j = g.depIndex[d] as number;
      const dep = next[j] as Dependency;
      next[j] = { ...dep, lag: p.cal.fromWorkMs(gap, dep.lagUnit ?? 'day') };
    }
    const input = { ...p.input, predecessors: next };
    w.list[i] = input;
    w.prep[i] = { ...p, input };
  }

  function computeLeaf(w: World, i: number): boolean {
    const st = w.st;
    const o = i * K;
    const p = w.prep[i] as Prep;
    save(w, i);
    touch(w, i);
    const oS = st[o + S] as number;
    const oE = st[o + E] as number;
    const oSW = st[o + SW] as number;
    const oSWP = st[o + SWP] as number;
    const oUN = st[o + UN] as number;
    const oWK = st[o + WK] as number;
    if (p.unscheduled) {
      st[o + S] = st[o + E] = st[o + ES] = st[o + EE] = NaN;
      st[o + W] = p.w;
      st[o + SW] = st[o + SWP] = st[o + WK] = 0;
      st[o + UN] = 1;
      st[o + B] = -Infinity;
      st[o + BP] = -1;
      w.conf[i] = null;
      w.segs[i] = null;
      return !(same(oS, NaN) && oUN === 1 && oSW === 0 && oSWP === 0);
    }
    if (w.normalizing && p.auto) normalizeLags(w, i);
    const cal = p.cal;
    const span = p.span;
    let cf: ScheduleConflict[] | null = null;
    let bound = depBound(w, i, span, scratch);
    let bp = scratch[0] as number;
    let bt = scratch[1] as number;
    const par = w.parentOf[i] as number;
    if (par >= 0) {
      const po = par * K;
      if ((st[po + G] as number) > bound) {
        bound = st[po + G] as number;
        bp = st[po + GP] as number;
        bt = st[po + GT] as number;
      }
    }
    st[o + B] = bound;
    st[o + BP] = bp;
    st[o + BT] = bt;
    let start = p.dStart;
    let moved = false;
    if (p.auto) {
      if (bound > start) start = bound;
      const cd = p.cDate;
      const c = p.cType;
      if (c >= 2) {
        const sb = () => snap(cal, bound, span);
        if (c === 2) {
          if (cd > start) start = cd;
        } else if (c === 4) {
          const ls = span ? cal.addWork(cd, -span) : cd;
          if (ls > start) start = ls;
        } else if (c === 3 || c === 5) {
          const lim = c === 3 ? cd : span ? cal.addWork(cd, -span) : cd;
          if (snap(cal, start, span) > snap(cal, lim, span) + TOL) {
            if (Number.isFinite(bound) && sb() > snap(cal, lim, span) + TOL) (cf ??= []).push(conflict(w, 'constraint', i, bp, bt, sb()));
            else start = lim;
          }
        } else {
          const lim = c === 6 ? cd : span ? cal.addWork(cd, -span) : cd;
          if (Number.isFinite(bound) && sb() > snap(cal, lim, span) + TOL) (cf ??= []).push(conflict(w, 'constraint', i, bp, bt, sb()));
          start = lim;
        }
      }
      start = snap(cal, start, span);
      moved = true;
    } else if (Number.isFinite(bound)) {
      const sb = snap(cal, bound, span);
      if (sb > start + TOL) {
        if (ctx.validateManual && ctx.autoSchedule) {
          start = sb;
          moved = true;
        } else (cf ??= []).push(conflict(w, 'dependency', i, bp, bt, sb));
      }
    }
    let end: number;
    if (p.segOff) end = placeSegments(w, i, start);
    else {
      w.segs[i] = null;
      end = !moved && start === p.dStart ? p.dEnd : span ? cal.addWork(start, span) : start;
    }
    const g = w.g;
    for (let d = g.depStart[i] as number, e = g.depStart[i + 1] as number; d < e; d++)
      if (g.depDropped[d]) (cf ??= []).push(conflict(w, 'dependency', i, g.depPred[d] as number, g.depType[d] as number, start));
    w.conf[i] = cf;
    st[o + S] = st[o + ES] = start;
    st[o + E] = st[o + EE] = end;
    st[o + W] = p.w;
    const weight = p.milestone ? 0 : p.w;
    st[o + SW] = weight;
    st[o + SWP] = weight * p.progress;
    st[o + WK] = p.w * p.units;
    st[o + UN] = 0;
    return !(same(oS, start) && same(oE, end) && oSW === weight && oSWP === weight * p.progress && oUN === 0 && oWK === p.w * p.units);
  }

  function computeGate(w: World, i: number): boolean {
    const st = w.st;
    const o = i * K;
    const p = w.prep[i] as Prep;
    save(w, i);
    touch(w, i);
    const og = st[o + G] as number;
    let g = -Infinity;
    let gp = -1;
    let gt = 0;
    const par = w.parentOf[i] as number;
    if (par >= 0) {
      g = st[par * K + G] as number;
      gp = st[par * K + GP] as number;
      gt = st[par * K + GT] as number;
    }
    if (p.auto) {
      const b = depBound(w, i, (st[o + W] as number) || 0, scratch);
      if (b > g) {
        g = b;
        gp = scratch[0] as number;
        gt = scratch[1] as number;
      }
    }
    let cf: ScheduleConflict[] | null = null;
    const gr = w.g;
    for (let d = gr.depStart[i] as number, e = gr.depStart[i + 1] as number; d < e; d++)
      if (gr.depDropped[d]) (cf ??= []).push(conflict(w, 'dependency', i, gr.depPred[d] as number, gr.depType[d] as number, st[o + S] as number));
    w.conf[i] = cf;
    st[o + G] = g;
    st[o + GP] = gp;
    st[o + GT] = gt;
    return !same(og, g);
  }

  function computeRollup(w: World, i: number): boolean {
    const st = w.st;
    const o = i * K;
    const p = w.prep[i] as Prep;
    save(w, i);
    touch(w, i);
    const old = st.slice(o, o + 10);
    const oUN = st[o + UN] as number;
    const oWK = st[o + WK] as number;
    let mn = Infinity;
    let mx = -Infinity;
    let sw = 0;
    let swp = 0;
    let wk = 0;
    let any = false;
    for (let k = w.childStart[i] as number, e = w.childStart[i + 1] as number; k < e; k++) {
      const c = w.childList[k] as number;
      const co = c * K;
      if (st[co + UN]) continue;
      any = true;
      if ((st[co + S] as number) < mn) mn = st[co + S] as number;
      if ((st[co + E] as number) > mx) mx = st[co + E] as number;
      sw += st[co + SW] as number;
      swp += st[co + SWP] as number;
      wk += st[co + WK] as number;
    }
    let s: number;
    let e: number;
    if (!any) {
      if (p.unscheduled) {
        st[o + S] = st[o + E] = st[o + ES] = st[o + EE] = st[o + RS] = st[o + RE] = NaN;
        st[o + W] = st[o + SW] = st[o + SWP] = st[o + WK] = 0;
        st[o + PR] = p.progress;
        st[o + UN] = 1;
        return oUN !== 1;
      }
      s = p.dStart;
      e = p.dEnd;
      sw = p.w;
      swp = p.w * p.progress;
      wk = p.w * p.units;
      mn = mx = NaN;
    } else if (p.manual && p.hasDates) {
      s = p.dStart;
      e = p.dEnd;
    } else {
      s = mn;
      e = mx;
    }
    st[o + S] = st[o + ES] = s;
    st[o + E] = st[o + EE] = e;
    st[o + W] = any ? Math.max(0, p.cal.workBetween(s, e)) : p.w;
    st[o + SW] = sw;
    st[o + SWP] = swp;
    st[o + PR] = sw > 0 ? swp / sw : p.progress;
    st[o + RS] = mn;
    st[o + RE] = mx;
    st[o + WK] = wk;
    st[o + UN] = 0;
    for (let k = 0; k < 10; k++) if (!same(old[k] as number, st[o + k] as number)) return true;
    return oUN !== 0 || oWK !== wk;
  }

  /** As-late-as-possible tasks: after the forward pass, move to the latest start their successors and the project finish allow. */
  function applyAlap(w: World): void {
    if (!ctx.autoSchedule) return;
    if (!w.alap) {
      const list: number[] = [];
      for (let i = 0; i < w.n; i++) {
        const p = w.prep[i] as Prep;
        if (p.cType === 1 && p.auto && !w.isParent[i] && !p.unscheduled) list.push(i);
      }
      list.sort((a, b) => (w.g.pos[b] as number) - (w.g.pos[a] as number));
      w.alap = Int32Array.from(list);
    }
    if (!w.alap.length) return;
    const st = w.st;
    let finish = finite(ctx.opt.projectEnd) ? ctx.opt.projectEnd : -Infinity;
    if (!finite(ctx.opt.projectEnd)) for (let i = 0; i < w.n; i++) if (!w.isParent[i] && !st[i * K + UN] && (st[i * K + EE] as number) > finish) finish = st[i * K + EE] as number;
    if (!Number.isFinite(finish)) return;
    const g = w.g;
    const parents = new Set<number>();
    for (const i of w.alap) {
      const p = w.prep[i] as Prep;
      const cal = p.cal;
      const span = p.span;
      let lf = finish;
      for (let x = i; x >= 0; x = w.parentOf[x] as number) {
        for (let e = g.outStart[x] as number; e < (g.outStart[x + 1] as number); e++) {
          const d = g.outDep[e] as number;
          if (d < 0 || g.depDropped[d]) continue;
          const so = (g.depSucc[d] as number) * K;
          if (st[so + UN]) continue;
          const lag = g.depLag[d] as number;
          const t = g.depType[d] as number;
          const base = (t === 0 || t === 1 ? st[so + S] : st[so + E]) as number;
          const lim = lag ? cal.addWork(base, -lag) : base;
          const b = t === 0 || t === 2 ? lim : span ? cal.addWork(lim, span) : lim;
          if (b < lf) lf = b;
        }
      }
      const o = i * K;
      let start = span ? cal.addWork(lf, -span) : lf;
      start = snap(cal, start, span);
      if (start < (st[o + ES] as number)) start = st[o + ES] as number;
      if (same(start, st[o + S] as number)) continue;
      save(w, i);
      touch(w, i);
      st[o + S] = start;
      st[o + E] = p.segOff ? placeSegments(w, i, start) : span ? cal.addWork(start, span) : start;
      for (let x = w.parentOf[i] as number; x >= 0; x = w.parentOf[x] as number) parents.add(x);
    }
    if (parents.size) {
      const order = [...parents].sort((a, b) => (g.pos[a] as number) - (g.pos[b] as number));
      for (const pIdx of order) computeRollup(w, pIdx);
    }
  }

  // ---- schedules -----------------------------------------------------------

  function sameConflicts(a: readonly ScheduleConflict[], b: readonly ScheduleConflict[]): boolean {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let k = 0; k < a.length; k++) {
      const x = a[k] as ScheduleConflict;
      const y = b[k] as ScheduleConflict;
      if (x.kind !== y.kind || x.predecessorId !== y.predecessorId || x.type !== y.type || x.earliestStart !== y.earliestStart || x.taskId !== y.taskId) return false;
    }
    return true;
  }

  function sameSegments(a: readonly ScheduleSegment[] | null, b: readonly ScheduleSegment[] | null): boolean {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (let k = 0; k < a.length; k++) if ((a[k] as ScheduleSegment).start !== (b[k] as ScheduleSegment).start || (a[k] as ScheduleSegment).end !== (b[k] as ScheduleSegment).end) return false;
    return true;
  }

  function makeSchedule(w: World, i: number, old: TaskSchedule | undefined, crit?: { critical: boolean; totalFloat: number; freeFloat: number }): TaskSchedule {
    const p = w.prep[i] as Prep;
    const st = w.st;
    const o = i * K;
    const parent = w.isParent[i] === 1;
    const unscheduled = st[o + UN] === 1;
    const num = (v: number): number | null => (unscheduled || !Number.isFinite(v) ? null : v);
    const workMs = st[o + W] as number;
    const next: TaskSchedule = {
      id: p.input.id,
      parentId: w.parentOf[i]! >= 0 ? (w.list[w.parentOf[i] as number] as ProjectTaskInput).id : null,
      level: w.level[i] as number,
      index: i,
      start: num(st[o + S] as number),
      end: num(st[o + E] as number),
      duration: round4(p.cal.fromWorkMs(workMs, p.unit)),
      durationUnit: p.unit,
      workMs,
      progress: Math.round((parent ? (st[o + PR] as number) : p.progress) * 100) / 100,
      milestone: p.milestone,
      parent,
      manual: p.manual,
      unscheduled,
      work: round4((st[o + WK] as number) / p.cal.unitMs(ctx.workUnit)),
      taskType: p.taskType,
      segments: w.segs[i] ?? null,
      rollupStart: parent ? num(st[o + RS] as number) : null,
      rollupEnd: parent ? num(st[o + RE] as number) : null,
      wbs: w.wbs[i] as string,
      critical: crit ? crit.critical : (old?.critical ?? false),
      totalFloat: crit ? crit.totalFloat : (old?.totalFloat ?? 0),
      freeFloat: crit ? crit.freeFloat : (old?.freeFloat ?? 0),
      conflicts: w.conf[i] ?? EMPTY,
    };
    if (
      old &&
      old.id === next.id &&
      old.parentId === next.parentId &&
      old.level === next.level &&
      old.index === next.index &&
      old.start === next.start &&
      old.end === next.end &&
      old.duration === next.duration &&
      old.durationUnit === next.durationUnit &&
      old.workMs === next.workMs &&
      old.progress === next.progress &&
      old.milestone === next.milestone &&
      old.parent === next.parent &&
      old.manual === next.manual &&
      old.unscheduled === next.unscheduled &&
      old.work === next.work &&
      old.taskType === next.taskType &&
      sameSegments(old.segments, next.segments) &&
      old.rollupStart === next.rollupStart &&
      old.rollupEnd === next.rollupEnd &&
      old.wbs === next.wbs &&
      old.critical === next.critical &&
      old.totalFloat === next.totalFloat &&
      old.freeFloat === next.freeFloat &&
      sameConflicts(old.conflicts, next.conflicts)
    )
      return old;
    return Object.freeze(next);
  }

  // ---- incremental propagation ---------------------------------------------

  function markNode(w: World, v: number): void {
    if (w.dirty[v]) return;
    w.dirty[v] = 1;
    w.pending++;
    const p = w.g.pos[v] as number;
    if (p < w.minPos) w.minPos = p;
  }

  function propagate(w: World): void {
    const g = w.g;
    const N = 2 * w.n;
    for (let pos = w.minPos; pos < N && w.pending > 0; pos++) {
      const v = g.topo[pos] as number;
      if (!w.dirty[v]) continue;
      w.dirty[v] = 0;
      w.pending--;
      if (!computeNode(w, v)) continue;
      for (let e = g.outStart[v] as number, end = g.outStart[v + 1] as number; e < end; e++) {
        const d = g.outDep[e] as number;
        if (d >= 0 && g.depDropped[d]) continue;
        const t = g.outTo[e] as number;
        if (!w.dirty[t]) {
          w.dirty[t] = 1;
          w.pending++;
        }
      }
    }
    w.minPos = N;
    w.pending = 0;
  }

  // ---- transactions ----------------------------------------------------------

  interface Tx {
    readonly oldWorld: World;
    readonly structural: boolean;
    readonly oldList: ProjectTaskInput[];
    readonly oldPrep: Map<number, Prep>;
    oldGraph: Graph | null;
  }

  function isStructural(a: readonly ProjectTaskInput[], b: readonly ProjectTaskInput[]): boolean {
    if (a.length !== b.length) return true;
    for (let i = 0; i < a.length; i++) {
      const x = a[i] as ProjectTaskInput;
      const y = b[i] as ProjectTaskInput;
      if (x === y) continue;
      if (x.id !== y.id || (x.parentId ?? null) !== (y.parentId ?? null)) return true;
    }
    return false;
  }

  function sameLinks(a: readonly Dependency[] | undefined, b: readonly Dependency[] | undefined): 'same' | 'lag' | 'links' {
    if (a === b) return 'same';
    const x = a ?? [];
    const y = b ?? [];
    if (x.length !== y.length) return 'links';
    let lag = false;
    for (let k = 0; k < x.length; k++) {
      const p = x[k] as Dependency;
      const q = y[k] as Dependency;
      if (p.id !== q.id || p.type !== q.type) return 'links';
      if (p.lag !== q.lag || p.lagUnit !== q.lagUnit) lag = true;
    }
    return lag ? 'lag' : 'same';
  }

  /** Applies `next` (tree order) to the world, tentatively. */
  function begin(next: ProjectTaskInput[]): Tx {
    const w = world;
    if (isStructural(w.list, next)) {
      const tx: Tx = { oldWorld: w, structural: true, oldList: w.list, oldPrep: new Map(), oldGraph: null };
      world = buildWorld(next, w, false);
      return tx;
    }
    const tx: Tx = { oldWorld: w, structural: false, oldList: w.list, oldPrep: new Map(), oldGraph: null };
    w.journal = new Map();
    w.list = next.slice();
    let rebuild = false;
    const lagOnly: number[] = [];
    let alapDirty = false;
    for (let i = 0; i < w.n; i++) {
      const before = tx.oldList[i] as ProjectTaskInput;
      const after = w.list[i] as ProjectTaskInput;
      if (before === after) continue;
      const oldPrep = w.prep[i] as Prep;
      tx.oldPrep.set(i, oldPrep);
      const p = prepare(after, w.isParent[i] === 1, ctx, w.defaultStart);
      w.prep[i] = p;
      const links = sameLinks(before.predecessors, after.predecessors);
      if (links === 'links' || p.cal !== oldPrep.cal) rebuild = true;
      else if (links === 'lag') lagOnly.push(i);
      if (p.cType !== oldPrep.cType || p.auto !== oldPrep.auto) alapDirty = true;
      markNode(w, i);
      if (w.isParent[i]) markNode(w, w.n + i);
    }
    if (rebuild) {
      const oldG = w.g;
      tx.oldGraph = oldG;
      w.g = buildGraph(w, ctx);
      w.alap = null;
      // Positions changed: re-mark the dirty nodes against the new order and every task touched by a cycle change.
      w.minPos = 2 * w.n;
      for (let v = 0; v < 2 * w.n; v++) if (w.dirty[v]) w.minPos = Math.min(w.minPos, w.g.pos[v] as number);
      if (oldG.droppedCount || w.g.droppedCount) for (let d = 0; d < w.g.depDropped.length; d++) markNode(w, w.g.depSucc[d] as number);
      for (let d = 0; d < oldG.depDropped.length; d++) if (oldG.depDropped[d]) markNode(w, oldG.depSucc[d] as number);
    } else if (lagOnly.length) {
      tx.oldGraph = w.g;
      const depLag = w.g.depLag.slice();
      for (const i of lagOnly) {
        const p = w.prep[i] as Prep;
        const deps = p.input.predecessors ?? [];
        for (let d = w.g.depStart[i] as number; d < (w.g.depStart[i + 1] as number); d++) {
          const dep = deps[w.g.depIndex[d] as number] as Dependency;
          depLag[d] = finite(dep.lag) ? Math.round(p.cal.toWorkMs(dep.lag, dep.lagUnit ?? 'day')) : 0;
        }
      }
      w.g = { ...w.g, depLag };
    }
    if (alapDirty) w.alap = null;
    propagate(w);
    applyAlap(w);
    for (const i of w.touched) {
      w.touchMark[i] = 0;
      w.sched[i] = makeSchedule(w, i, w.sched[i]);
    }
    w.touched = [];
    return tx;
  }

  function changedOf(tx: Tx): Set<TaskId> {
    const out = new Set<TaskId>();
    if (tx.structural) {
      const old = tx.oldWorld;
      for (let i = 0; i < world.n; i++) {
        const s = world.sched[i] as TaskSchedule;
        const j = old.ids.get(s.id);
        if (j === undefined || old.sched[j] !== s) out.add(s.id);
      }
      return out;
    }
    const j = world.journal;
    if (j) for (const [i, saved] of j) if (world.sched[i] !== saved.sched) out.add((world.sched[i] as TaskSchedule).id);
    return out;
  }

  function rollback(tx: Tx): void {
    if (tx.structural) {
      world = tx.oldWorld;
      return;
    }
    const w = world;
    const j = w.journal;
    if (j)
      for (const [i, s] of j) {
        w.st.set(s.st, i * K);
        w.conf[i] = s.conf;
        w.segs[i] = s.segs;
        w.sched[i] = s.sched;
      }
    for (const [i, p] of tx.oldPrep) w.prep[i] = p;
    w.list = tx.oldList;
    if (tx.oldGraph) {
      if (tx.oldGraph.topo !== w.g.topo) w.alap = null;
      w.g = tx.oldGraph;
    }
    w.alap = null;
    w.journal = null;
  }

  function finish(tx: Tx): void {
    if (!tx.structural) world.journal = null;
  }

  function snapshots(list: readonly ProjectTaskInput[], ids: ReadonlySet<TaskId>): TaskSnapshot[] {
    const out: TaskSnapshot[] = [];
    list.forEach((task, index) => {
      if (ids.has(task.id)) out.push(Object.freeze({ id: task.id, index, task }));
    });
    return out;
  }

  function emit(action: string, before: readonly ProjectTaskInput[], after: readonly ProjectTaskInput[], touched: ReadonlySet<TaskId>, changed: Set<TaskId> | null): void {
    version++;
    if (depth > 0) {
      for (const id of touched) batchTouched.add(id);
      if (changed && batchChanged) for (const id of changed) batchChanged.add(id);
      else batchChanged = null;
      batchNotify = true;
      return;
    }
    if (recording && touched.size && recorders.size) {
      const record: ChangeRecord = Object.freeze({ action, before: snapshots(before, touched), after: snapshots(after, touched) });
      for (const r of recorders) r(record);
    }
    for (const l of listeners) l(changed);
  }

  interface CommitOptions {
    readonly validateId?: number;
    readonly validate?: boolean;
    readonly cycleCheck?: boolean;
    readonly preview?: boolean;
  }

  type Committed = UpdateResult & { schedules: Map<TaskId, TaskSchedule> };

  /** Applies a new list, validates, then commits (records and notifies) or rolls back. */
  function commit(action: string, next: ProjectTaskInput[], touched: ReadonlySet<TaskId>, opts: CommitOptions = {}): Committed {
    const before = world.list;
    const tx = begin(next);
    const reject = (conflicts: readonly ScheduleConflict[]): Committed => {
      rollback(tx);
      return { changed: new Set(), conflicts, schedules: new Map() };
    };
    if (opts.cycleCheck && !tx.structural && world.g.droppedCount > (tx.oldGraph ?? world.g).droppedCount) {
      const w = world;
      const found: ScheduleConflict[] = [];
      for (let d = 0; d < w.g.depDropped.length; d++) if (w.g.depDropped[d]) found.push(conflict(w, 'dependency', w.g.depSucc[d] as number, w.g.depPred[d] as number, w.g.depType[d] as number, NaN));
      return reject(found);
    }
    if (opts.validateId !== undefined && opts.validate) {
      const id = (tx.oldList[opts.validateId] as ProjectTaskInput | undefined)?.id;
      const i = id === undefined ? undefined : world.ids.get(id);
      if (i !== undefined) {
        const w = world;
        const p = w.prep[i] as Prep;
        const o = i * K;
        const bound = w.st[o + B] as number;
        if (p.auto && !w.isParent[i] && Number.isFinite(bound)) {
          const allowed = snap(p.cal, bound, p.span);
          if (allowed > p.dStart + TOL) return reject([conflict(w, 'dependency', i, w.st[o + BP] as number, w.st[o + BT] as number, allowed)]);
        }
      }
    }
    const changed = changedOf(tx);
    const schedules = new Map<TaskId, TaskSchedule>();
    const conflicts: ScheduleConflict[] = [];
    for (const id of changed) {
      const s = world.sched[world.ids.get(id) as number] as TaskSchedule;
      schedules.set(id, s);
      for (const c of s.conflicts) conflicts.push(c);
    }
    if (opts.preview) {
      rollback(tx);
      return { changed, conflicts, schedules };
    }
    finish(tx);
    emit(action, before, world.list, touched, tx.structural ? null : changed);
    return { changed, conflicts, schedules };
  }

  // ---- edits -----------------------------------------------------------------

  const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

  /** The inputs an update writes (normalized for taskbar semantics and the task type). */
  function normalize(i: number, changes: TaskChanges, source: UpdateOptions['source']): Map<TaskId, ProjectTaskInput> {
    const w = world;
    const old = w.list[i] as ProjectTaskInput;
    const sch = w.sched[i] as TaskSchedule;
    const p = w.prep[i] as Prep;
    const out = new Map<TaskId, ProjectTaskInput>();
    const next: Record<string, unknown> = { ...old, ...changes };
    const hasS = has(changes, 'start');
    const hasE = has(changes, 'end');
    const hasD = has(changes, 'duration');
    const dates = hasS || hasE || hasD;
    if (w.isParent[i]) {
      if (hasS && finite(changes.start) && sch.start !== null && !p.manual) {
        // Moving an auto parent shifts its descendants by the same working time.
        const delta = p.cal.workBetween(sch.start, changes.start);
        if (delta)
          for (let d = i + 1; d < (w.subEnd[i] as number); d++) {
            if (w.isParent[d]) continue;
            const sd = w.sched[d] as TaskSchedule;
            if (sd.start === null) continue;
            const pd = w.prep[d] as Prep;
            const input = w.list[d] as ProjectTaskInput;
            out.set(input.id, { ...input, start: pd.cal.addWork(sd.start, delta), end: null, duration: sd.duration, durationUnit: sd.durationUnit });
          }
      }
      out.set(old.id, next as unknown as ProjectTaskInput);
      return out;
    }
    if (dates) {
      if (hasS && !hasE && !hasD) {
        next['duration'] = sch.duration;
        next['durationUnit'] = sch.durationUnit;
        next['end'] = null;
      } else if (hasE && !hasS && !hasD) {
        if (p.segOff && sch.segments && finite(changes.end)) {
          const segs: SegmentInput[] = sch.segments.map((s) => ({ start: s.start, end: s.end }));
          const last = segs[segs.length - 1] as SegmentInput;
          segs[segs.length - 1] = { start: last.start ?? null, end: Math.max(last.start ?? changes.end, changes.end) };
          next['segments'] = segs;
          next['end'] = null;
          next['duration'] = null;
        } else {
          next['start'] = sch.start;
          next['duration'] = null;
        }
      } else if (hasD && !hasS && !hasE) {
        next['end'] = null;
        if (!finite(next['start'])) next['start'] = sch.start;
      } else if (hasS && hasE && !hasD) next['duration'] = null;
      else if (hasS && hasD) next['end'] = null;
      else if (hasE && hasD) next['start'] = null;
      if (hasD && finite(changes.duration) && changes.duration > 0 && !has(changes, 'milestone')) next['milestone'] = false;
    }
    // Task types: which of duration, work and units follows an edit.
    const tt = (next['taskType'] as TaskType | undefined) ?? ctx.taskType;
    const unitMs = p.cal.unitMs(ctx.workUnit);
    const oldWork = p.w * p.units;
    const scale = (factor: number): void => {
      const res = next['resources'] as readonly ResourceAssignment[] | undefined;
      if (res && res.length && Number.isFinite(factor) && factor > 0) next['resources'] = res.map((r) => ({ ...r, unit: round4((finite(r.unit) ? r.unit : 100) * factor) }));
    };
    if (has(changes, 'work') && finite(changes.work) && !dates) {
      const workMs = changes.work * unitMs;
      if (tt === 'fixedDuration') scale(oldWork > 0 ? workMs / oldWork : NaN);
      else {
        next['duration'] = p.cal.fromWorkMs(workMs / p.units, p.unit);
        next['end'] = null;
        if (!finite(next['start'])) next['start'] = sch.start;
      }
    } else if (dates && tt === 'fixedWork' && !has(changes, 'work')) {
      const np = prepare(next as unknown as ProjectTaskInput, false, ctx, w.defaultStart);
      if (np.w > 0 && p.w > 0) scale(p.w / np.w);
    } else if (has(changes, 'resources') && !dates && !has(changes, 'work') && tt !== 'fixedDuration') {
      const units = unitsOf(next['resources'] as readonly ResourceAssignment[] | undefined);
      if (oldWork > 0 && units > 0) {
        next['duration'] = p.cal.fromWorkMs(oldWork / units, p.unit);
        next['end'] = null;
        if (!finite(next['start'])) next['start'] = sch.start;
      }
    }
    // Taskbar edits rewrite the lags of the task's links to the new gap.
    if (source === 'taskbar' && dates && ctx.opt.dependencyLag?.updateOnTaskbarEdit && old.predecessors?.length) {
      const np = prepare(next as unknown as ProjectTaskInput, false, ctx, w.defaultStart);
      const start = np.dStart;
      const end = np.span ? np.cal.addWork(start, np.span) : start;
      next['predecessors'] = old.predecessors.map((d) => {
        const q = w.ids.get(d.id);
        if (q === undefined) return d;
        const qs = w.sched[q] as TaskSchedule;
        if (qs.start === null || qs.end === null) return d;
        const from = d.type === 'fs' || d.type === 'ff' ? qs.end : qs.start;
        const gap = np.cal.workBetween(from, d.type === 'fs' || d.type === 'ss' ? start : end);
        return { ...d, lag: np.cal.fromWorkMs(gap, d.lagUnit ?? 'day') };
      });
    }
    out.set(old.id, next as unknown as ProjectTaskInput);
    return out;
  }

  function replaced(inputs: ReadonlyMap<TaskId, ProjectTaskInput>): ProjectTaskInput[] {
    return world.list.map((t) => inputs.get(t.id) ?? t);
  }

  function runUpdate(action: string, id: TaskId, changes: TaskChanges, options: UpdateOptions | undefined, opts: { preview?: boolean; raw?: boolean; cycleCheck?: boolean }): Committed {
    const i = world.ids.get(id);
    if (i === undefined) return { changed: new Set(), conflicts: [], schedules: new Map() };
    const source = options?.source ?? 'api';
    const inputs = opts.raw ? new Map([[id, { ...(world.list[i] as ProjectTaskInput), ...changes } as ProjectTaskInput]]) : normalize(i, changes, source);
    // Only a new start can be earlier than the dependencies allow; duration and end edits keep the scheduled start.
    const dates = has(changes, 'start') && changes.start !== null;
    const validate = options?.validate ?? ((source === 'taskbar' || source === 'edit') && ctx.opt.validateDependencies !== false);
    const commitOpts: CommitOptions = {
      ...(dates && validate ? { validateId: i, validate: true } : {}),
      ...(opts.preview ? { preview: true } : {}),
      ...(opts.cycleCheck ? { cycleCheck: true } : {}),
    };
    return commit(action, replaced(inputs), new Set(inputs.keys()), commitOpts);
  }

  const strip = (r: Committed): UpdateResult => ({ changed: r.changed, conflicts: r.conflicts });

  function subtreeIds(i: number): TaskId[] {
    const out: TaskId[] = [];
    for (let k = i; k < (world.subEnd[i] as number); k++) out.push((world.list[k] as ProjectTaskInput).id);
    return out;
  }

  /** Top-most selected tasks (a selected descendant moves with its ancestor), in tree order. */
  function roots(ids: readonly TaskId[]): number[] {
    const set = new Set<number>();
    for (const id of ids) {
      const i = world.ids.get(id);
      if (i !== undefined) set.add(i);
    }
    const out: number[] = [];
    for (const i of [...set].sort((a, b) => a - b)) {
      let covered = false;
      for (let p = world.parentOf[i] as number; p >= 0; p = world.parentOf[p] as number) if (set.has(p)) covered = true;
      if (!covered) out.push(i);
    }
    return out;
  }

  /** Moves blocks of a tree-order list (pure list surgery). */
  function moveBlocks(list: readonly ProjectTaskInput[], blockIds: readonly TaskId[][], targetId: TaskId, position: MovePosition, touched: Set<TaskId>): ProjectTaskInput[] | null {
    const moving = new Set(blockIds.flat());
    if (moving.has(targetId)) return null;
    const rest = list.filter((t) => !moving.has(t.id));
    const ti = rest.findIndex((t) => t.id === targetId);
    if (ti < 0) return null;
    const target = rest[ti] as ProjectTaskInput;
    // End of the target's subtree in `rest`.
    const byId = new Map(rest.map((t) => [t.id, t] as const));
    const inside = (t: ProjectTaskInput): boolean => {
      for (let p = t.parentId; p !== null && p !== undefined; p = byId.get(p)?.parentId ?? null) if (p === targetId) return true;
      return false;
    };
    let end = ti + 1;
    while (end < rest.length && inside(rest[end] as ProjectTaskInput)) end++;
    const at = position === 'above' ? ti : end;
    const parentId = position === 'child' ? targetId : (target.parentId ?? null);
    const insert: ProjectTaskInput[] = [];
    const firstIds = new Set(blockIds.map((b) => b[0]));
    const byOld = new Map(list.map((t) => [t.id, t] as const));
    for (const block of blockIds)
      for (const id of block) {
        const t = byOld.get(id) as ProjectTaskInput;
        insert.push(firstIds.has(id) && (t.parentId ?? null) !== parentId ? { ...t, parentId } : t);
        touched.add(id);
      }
    return [...rest.slice(0, at), ...insert, ...rest.slice(at)];
  }

  function structuralCommit(action: string, next: ProjectTaskInput[] | null, touched: Set<TaskId>): void {
    if (!next) return;
    commit(action, next, touched);
  }

  // ---- API -------------------------------------------------------------------

  const engine: ProjectEngine = {
    load(tasks) {
      world = buildWorld(tasks, null, ctx.opt.dependencyLag?.normalizeOnLoad === true);
      critical = new Set();
      version++;
      for (const l of listeners) l(null);
    },
    setOptions(options) {
      ctx = makeCtx(options);
      world = buildWorld(world.list, world, false);
      version++;
      for (const l of listeners) l(null);
    },
    get options() {
      return ctx.opt;
    },
    getTask: (id) => {
      const i = world.ids.get(id);
      return i === undefined ? undefined : world.list[i];
    },
    getSchedule: (id) => {
      const i = world.ids.get(id);
      return i === undefined ? undefined : world.sched[i];
    },
    getTasks: () => world.list,
    getSchedules: () => world.sched,
    get version() {
      return version;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    update(id, changes, options) {
      return strip(runUpdate(options?.source === 'taskbar' ? 'taskbarEdit' : 'edit', id, changes, options, {}));
    },
    preview(id, changes, options) {
      const r = runUpdate('edit', id, changes, options, { preview: true });
      return { changed: r.changed, conflicts: r.conflicts, schedules: r.schedules };
    },
    add(task, at) {
      if (world.ids.has(task.id)) return;
      const list = world.list.slice();
      let index = at?.index;
      if (index === undefined) {
        const p = task.parentId === null || task.parentId === undefined ? undefined : world.ids.get(task.parentId);
        index = p === undefined ? list.length : (world.subEnd[p] as number);
      }
      list.splice(Math.max(0, Math.min(list.length, index)), 0, task);
      commit('add', list, new Set([task.id]));
    },
    remove(ids) {
      const gone = new Set<TaskId>();
      for (const i of roots(ids)) for (const id of subtreeIds(i)) gone.add(id);
      if (!gone.size) return;
      const touched = new Set(gone);
      const next: ProjectTaskInput[] = [];
      for (const t of world.list) {
        if (gone.has(t.id)) continue;
        if (t.predecessors?.some((d) => gone.has(d.id))) {
          next.push({ ...t, predecessors: t.predecessors.filter((d) => !gone.has(d.id)) });
          touched.add(t.id);
        } else next.push(t);
      }
      commit('delete', next, touched);
    },
    changeId(id, newId) {
      if (id === newId || !world.ids.has(id) || world.ids.has(newId)) return;
      const touched = new Set<TaskId>([id, newId]);
      const next = world.list.map((t) => {
        let r = t;
        if (t.id === id) r = { ...r, id: newId };
        if (t.parentId === id) r = { ...r, parentId: newId };
        if (t.predecessors?.some((d) => d.id === id)) r = { ...r, predecessors: t.predecessors.map((d) => (d.id === id ? { ...d, id: newId } : d)) };
        if (r !== t) touched.add(t.id).add(r.id);
        return r;
      });
      commit('changeId', next, touched);
    },
    move(ids, targetId, position) {
      const blocks = roots(ids).map(subtreeIds);
      const touched = new Set<TaskId>();
      structuralCommit('move', moveBlocks(world.list, blocks, targetId, position, touched), touched);
    },
    indent(ids) {
      const w = world;
      const newParent = new Map<TaskId, TaskId>();
      const touched = new Set<TaskId>();
      for (const i of roots(ids)) {
        let j = i - 1;
        while (j >= 0 && (w.level[j] as number) > (w.level[i] as number)) j--;
        if (j < 0 || w.parentOf[j] !== w.parentOf[i]) continue;
        const sib = (w.list[j] as ProjectTaskInput).id;
        newParent.set((w.list[i] as ProjectTaskInput).id, newParent.get(sib) ?? sib);
      }
      if (!newParent.size) return;
      const next = w.list.map((t) => {
        const p = newParent.get(t.id);
        if (p === undefined) return t;
        touched.add(t.id);
        return { ...t, parentId: p };
      });
      commit('indent', next, touched);
    },
    outdent(ids) {
      let list: ProjectTaskInput[] = world.list;
      const touched = new Set<TaskId>();
      const sel = roots(ids).filter((i) => (world.parentOf[i] as number) >= 0);
      for (let k = sel.length - 1; k >= 0; k--) {
        const i = sel[k] as number;
        const parentId = (world.list[world.parentOf[i] as number] as ProjectTaskInput).id;
        const moved = moveBlocks(list, [subtreeIdsIn(list, (world.list[i] as ProjectTaskInput).id)], parentId, 'below', touched);
        if (moved) list = moved;
      }
      if (touched.size) commit('outdent', list, touched);
    },
    addDependency(taskId, dep) {
      const t = engine.getTask(taskId);
      if (!t) return { changed: new Set(), conflicts: [] };
      const deps = (t.predecessors ?? []).filter((d) => d.id !== dep.id);
      return strip(runUpdate('dependency', taskId, { predecessors: [...deps, dep] }, undefined, { raw: true, cycleCheck: true }));
    },
    removeDependency(taskId, predecessorId) {
      const t = engine.getTask(taskId);
      if (!t || !t.predecessors?.some((d) => d.id === predecessorId)) return { changed: new Set(), conflicts: [] };
      return strip(runUpdate('dependency', taskId, { predecessors: t.predecessors.filter((d) => d.id !== predecessorId) }, undefined, { raw: true }));
    },
    setDependencies(taskId, deps) {
      return strip(runUpdate('dependency', taskId, { predecessors: deps.slice() }, undefined, { raw: true, cycleCheck: true }));
    },
    splitTask(id, at, gapWorkMs) {
      const i = world.ids.get(id);
      if (i === undefined || world.isParent[i]) return { changed: new Set(), conflicts: [] };
      const s = world.sched[i] as TaskSchedule;
      const p = world.prep[i] as Prep;
      if (s.start === null || s.end === null) return { changed: new Set(), conflicts: [] };
      const gap = gapWorkMs ?? p.cal.unitMs('day');
      const segs = (s.segments ?? [{ start: s.start, end: s.end }]).map((x) => ({ start: x.start, end: x.end }));
      const k = segs.findIndex((x) => at > x.start && at < x.end);
      if (k < 0 || gap <= 0) return { changed: new Set(), conflicts: [] };
      const cut = segs[k] as { start: number; end: number };
      const restWork = p.cal.workBetween(at, cut.end);
      const nextStart = p.cal.nextWorkingStart(p.cal.addWork(at, gap));
      const out: SegmentInput[] = [];
      for (let j = 0; j < segs.length; j++) {
        const x = segs[j] as { start: number; end: number };
        if (j < k) out.push(x);
        else if (j === k) {
          out.push({ start: x.start, end: at });
          out.push({ start: nextStart, end: p.cal.addWork(nextStart, restWork) });
        } else {
          const shifted = p.cal.nextWorkingStart(p.cal.addWork(x.start, gap));
          out.push({ start: shifted, end: p.cal.addWork(shifted, p.cal.workBetween(x.start, x.end)) });
        }
      }
      return strip(runUpdate('split', id, { segments: out, start: s.start, end: null, duration: null }, undefined, { raw: true }));
    },
    mergeSegments(id, indexes) {
      const i = world.ids.get(id);
      const s = i === undefined ? undefined : world.sched[i];
      if (!s || !s.segments || indexes.length < 2) return { changed: new Set(), conflicts: [] };
      const lo = Math.max(0, Math.min(...indexes));
      const hi = Math.min(s.segments.length - 1, Math.max(...indexes));
      if (hi <= lo) return { changed: new Set(), conflicts: [] };
      const segs: SegmentInput[] = [];
      s.segments.forEach((x, j) => {
        if (j < lo || j > hi) segs.push({ start: x.start, end: x.end });
        else if (j === lo) segs.push({ start: x.start, end: (s.segments as readonly ScheduleSegment[])[hi]!.end });
      });
      if (segs.length === 1) return strip(runUpdate('merge', id, { segments: null, start: s.start, end: segs[0]!.end ?? null, duration: null }, undefined, { raw: true }));
      return strip(runUpdate('merge', id, { segments: segs, start: s.start, end: null, duration: null }, undefined, { raw: true }));
    },
    setTaskMode(id, manual) {
      const s = engine.getSchedule(id);
      const changes: TaskChanges = s && s.start !== null && manual ? { manual, start: s.start, end: s.end } : { manual };
      return strip(runUpdate('taskMode', id, changes, undefined, { raw: true }));
    },
    convertToMilestone(id) {
      const s = engine.getSchedule(id);
      if (!s || s.parent) return { changed: new Set(), conflicts: [] };
      return strip(runUpdate('convertToMilestone', id, { milestone: true, duration: 0, end: null, start: s.start, segments: null }, undefined, { raw: true }));
    },
    convertToTask(id) {
      const s = engine.getSchedule(id);
      if (!s || s.parent) return { changed: new Set(), conflicts: [] };
      const unit = s.durationUnit;
      const cal = engine.calendarOf(id);
      return strip(runUpdate('convertToTask', id, { milestone: false, duration: cal.fromWorkMs(cal.unitMs('day'), unit), end: null, start: s.start }, undefined, { raw: true }));
    },
    projectRange() {
      let start = finite(ctx.opt.projectStart) ? ctx.opt.projectStart : Infinity;
      let end = finite(ctx.opt.projectEnd) ? ctx.opt.projectEnd : -Infinity;
      const fixedStart = finite(ctx.opt.projectStart);
      const fixedEnd = finite(ctx.opt.projectEnd);
      if (!fixedStart || !fixedEnd)
        for (const s of world.sched) {
          if (s.start === null || s.end === null) continue;
          if (!fixedStart && s.start < start) start = s.start;
          if (!fixedEnd && s.end > end) end = s.end;
        }
      return Number.isFinite(start) && Number.isFinite(end) ? { start, end: Math.max(start, end) } : null;
    },
    setProjectDates(start, end) {
      engine.setOptions({ ...ctx.opt, projectStart: start, projectEnd: end });
    },
    computeCriticalPath(computeCritical) {
      const w = world;
      const n = w.n;
      const start = new Float64Array(n);
      const end = new Float64Array(n);
      const span = new Float64Array(n);
      const unscheduled = new Uint8Array(n);
      const calendars = new Array<WorkCalendar>(n);
      for (let i = 0; i < n; i++) {
        const o = i * K;
        start[i] = w.st[o + S] as number;
        end[i] = w.st[o + E] as number;
        unscheduled[i] = w.st[o + UN] ? 1 : 0;
        const p = w.prep[i] as Prep;
        span[i] = w.isParent[i] ? (w.st[o + W] as number) : p.span;
        calendars[i] = p.cal;
      }
      const r = computeCritical({
        n,
        topo: w.g.topo,
        parentOf: w.parentOf,
        isParent: w.isParent,
        childStart: w.childStart,
        childList: w.childList,
        depStart: w.g.depStart,
        depPred: w.g.depPred,
        depType: w.g.depType,
        depLag: w.g.depLag,
        depDropped: w.g.depDropped,
        start,
        end,
        span,
        unscheduled,
        calendars,
        finish: finite(ctx.opt.projectEnd) ? ctx.opt.projectEnd : null,
      });
      const set = new Set<TaskId>();
      const changed = new Set<TaskId>();
      for (let i = 0; i < n; i++) {
        const old = w.sched[i] as TaskSchedule;
        const crit = !unscheduled[i] && r.critical[i] === 1;
        if (crit) set.add(old.id);
        const next = makeSchedule(w, i, old, { critical: crit, totalFloat: Math.round(r.totalFloat[i] as number), freeFloat: Math.round(r.freeFloat[i] as number) });
        if (next !== old) {
          w.sched[i] = next;
          changed.add(old.id);
        }
      }
      critical = set;
      if (changed.size) {
        version++;
        for (const l of listeners) l(changed);
      }
      return { critical, finish: r.finish };
    },
    formatDuration(task, text) {
      const s = typeof task === 'string' ? engine.getSchedule(task) : task;
      return s ? formatDurationValue(s.duration, s.durationUnit, text) : '';
    },
    parseDuration: (text, unit, words) => parseDurationText(text, unit, words),
    formatWork(task, text) {
      const s = typeof task === 'string' ? engine.getSchedule(task) : task;
      return s ? formatDurationValue(s.work, ctx.workUnit, text) : '';
    },
    formatWbsPredecessors(id) {
      const t = engine.getTask(id);
      if (!t?.predecessors) return '';
      const out: string[] = [];
      for (const d of t.predecessors) {
        const q = world.ids.get(d.id);
        if (q !== undefined) out.push(formatDependency(d, world.wbs[q]));
      }
      return out.join(',');
    },
    successorsOf(id) {
      const out: TaskId[] = [];
      for (const t of world.list) if (t.predecessors?.some((d) => d.id === id)) out.push(t.id);
      return out;
    },
    calendarOf(id) {
      const i = id === null ? undefined : world.ids.get(id);
      return i === undefined ? ctx.project : (world.prep[i] as Prep).cal;
    },
    batch(action, fn) {
      if (depth === 0) {
        batchAction = action;
        batchList = world.list;
        batchTouched = new Set();
        batchChanged = new Set();
        batchNotify = false;
      }
      depth++;
      try {
        return fn();
      } finally {
        depth--;
        if (depth === 0) {
          if (recording && batchTouched.size && recorders.size) {
            const record: ChangeRecord = Object.freeze({ action: batchAction, before: snapshots(batchList, batchTouched), after: snapshots(world.list, batchTouched) });
            for (const r of recorders) r(record);
          }
          if (batchNotify) for (const l of listeners) l(batchChanged);
        }
      }
    },
    onCommit(listener) {
      recorders.add(listener);
      return () => void recorders.delete(listener);
    },
    applyRecord(record, side) {
      const to = side === 'before' ? record.before : record.after;
      const drop = new Set<TaskId>();
      for (const s of record.before) drop.add(s.id);
      for (const s of record.after) drop.add(s.id);
      const next = world.list.filter((t) => !drop.has(t.id));
      for (const s of [...to].sort((a, b) => a.index - b.index)) next.splice(Math.min(next.length, s.index), 0, s.task);
      const was = recording;
      recording = false;
      try {
        return strip(commit(record.action, next, drop));
      } finally {
        recording = was;
      }
    },
  };

  function subtreeIdsIn(list: readonly ProjectTaskInput[], id: TaskId): TaskId[] {
    const i = list.findIndex((t) => t.id === id);
    if (i < 0) return [];
    const inSub = new Set([id]);
    const out = [id];
    for (let k = i + 1; k < list.length; k++) {
      const t = list[k] as ProjectTaskInput;
      if (t.parentId !== null && t.parentId !== undefined && inSub.has(t.parentId)) {
        inSub.add(t.id);
        out.push(t.id);
      } else break;
    }
    return out;
  }

  return engine;
}
