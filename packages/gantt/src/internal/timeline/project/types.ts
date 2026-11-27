// Project engine types (project
// subsystem of `internal/timeline`): task inputs as the React layer normalizes them
// (ids stringified, dates as floating wall-clock ms), dependencies, and the
// frozen per-task schedule the engine computes. Pure types, no runtime.

export type TaskId = string;
export type DurationUnit = 'minute' | 'hour' | 'day';
export type WorkUnit = 'minute' | 'hour' | 'day';
export type DependencyType = 'fs' | 'ss' | 'ff' | 'sf';
export type TaskMode = 'auto' | 'manual' | 'custom';
export type TaskType = 'fixedUnit' | 'fixedWork' | 'fixedDuration';
export type ConstraintType =
  | 'asSoonAsPossible'
  | 'asLateAsPossible'
  | 'startNoEarlierThan'
  | 'startNoLaterThan'
  | 'finishNoEarlierThan'
  | 'finishNoLaterThan'
  | 'mustStartOn'
  | 'mustFinishOn';

/** A link from a predecessor (`id`) to the task that owns it; `lag` in `lagUnit` of working time (negative = lead). */
export interface Dependency {
  readonly id: TaskId;
  readonly type: DependencyType;
  readonly lag: number;
  readonly lagUnit: DurationUnit;
}

/** A resource assigned to a task; `unit` is a percentage (default 100). */
export interface ResourceAssignment {
  readonly id: string;
  readonly unit: number;
}

/** One segment of a split task (wall ms); `end` or `duration` (in the task's duration unit). */
export interface SegmentInput {
  readonly start?: number | null;
  readonly end?: number | null;
  readonly duration?: number | null;
}

export interface ProjectTaskInput {
  readonly id: TaskId;
  readonly parentId: TaskId | null;
  readonly start?: number | null;
  readonly end?: number | null;
  readonly duration?: number | null;
  readonly durationUnit?: DurationUnit;
  /** 0..100. */
  readonly progress?: number;
  readonly milestone?: boolean;
  readonly manual?: boolean;
  readonly taskType?: TaskType;
  readonly work?: number | null;
  readonly predecessors?: readonly Dependency[];
  readonly resources?: readonly ResourceAssignment[];
  readonly constraintType?: ConstraintType;
  readonly constraintDate?: number | null;
  readonly calendar?: string | null;
  readonly segments?: readonly SegmentInput[] | null;
  readonly baselineStart?: number | null;
  readonly baselineEnd?: number | null;
}

/** A dependency or constraint the schedule could not honour (or a cycle-closing link that was ignored). */
export interface ScheduleConflict {
  readonly kind: 'dependency' | 'constraint';
  readonly taskId: TaskId;
  readonly predecessorId: TaskId | null;
  readonly type: DependencyType | null;
  /** The earliest start the dependencies allow (wall ms). */
  readonly earliestStart: number;
}

export interface ScheduleSegment {
  readonly start: number;
  readonly end: number;
}

/** The computed schedule of one task: frozen, replaced by a new object only when a field changes. */
export interface TaskSchedule {
  readonly id: TaskId;
  readonly parentId: TaskId | null;
  readonly level: number;
  /** Position in tree order. */
  readonly index: number;
  /** null = unscheduled. */
  readonly start: number | null;
  readonly end: number | null;
  /** In `durationUnit` (segment gaps excluded). */
  readonly duration: number;
  readonly durationUnit: DurationUnit;
  /** Working ms of the duration. */
  readonly workMs: number;
  readonly progress: number;
  readonly milestone: boolean;
  readonly parent: boolean;
  readonly manual: boolean;
  readonly unscheduled: boolean;
  /** In the engine `workUnit`. */
  readonly work: number;
  readonly taskType: TaskType;
  readonly segments: readonly ScheduleSegment[] | null;
  /** Parents: the range of their scheduled children (for manual parents it differs from start/end). */
  readonly rollupStart: number | null;
  readonly rollupEnd: number | null;
  readonly wbs: string;
  /** Valid after `computeCriticalPath()`; floats in working ms. */
  readonly critical: boolean;
  readonly totalFloat: number;
  readonly freeFloat: number;
  readonly conflicts: readonly ScheduleConflict[];
}

export interface UpdateResult {
  readonly changed: ReadonlySet<TaskId>;
  readonly conflicts: readonly ScheduleConflict[];
}
