// Scheduler store: the user-changeable state
// of one Scheduler instance (view, date, the local row copy, selection,
// popups, loading and pending writes, work-hour overrides) in one immutable
// snapshot. The React layer reads it through narrow `useSyncExternalStore`
// selectors; drag, resize, scroll and pointer transients never enter it.
// One store per Scheduler instance (never module state).

import type { EventId } from './types.js';

export interface CellSelection {
  readonly start: number;
  readonly end: number;
  readonly allDay: boolean;
  readonly resources?: Readonly<Record<string, readonly unknown[]>> | undefined;
  /** Key of the resource group the cells belong to (grouped views). */
  readonly group?: string | undefined;
}

export type SchedulerPopupKind = 'quickInfo' | 'editor' | 'moreEvents' | 'recurrenceAlert' | 'deleteAlert' | 'validationAlert' | 'overlapAlert';

export interface SchedulerPopupState {
  readonly kind: SchedulerPopupKind;
  /** Occurrence key of the event the popup is about (event popups). */
  readonly key?: string | undefined;
  /** Cell range (cell popups and new events). */
  readonly cells?: CellSelection | undefined;
  /** Day number of a "+N more" popover. */
  readonly day?: number | undefined;
  /** Editor mode. */
  readonly mode?: 'add' | 'edit' | 'editOccurrence' | 'editSeries' | undefined;
  /** Pending action of an alert (what the user is asked about). */
  readonly action?: 'edit' | 'delete' | 'save' | undefined;
  readonly message?: string | undefined;
  /** Element to anchor a popover to; the element that gets focus back on close. */
  readonly anchor?: Element | null | undefined;
  readonly returnFocus?: Element | null | undefined;
  /** Payload carried by an alert (the change waiting for a scope). */
  readonly payload?: unknown;
}

export interface WorkHoursOverride {
  readonly day: number;
  readonly start: number;
  readonly end: number;
  readonly resourceId?: unknown;
}

export interface SchedulerState<Row> {
  readonly view: string;
  readonly date: number;
  readonly rows: readonly Row[];
  readonly rowsVersion: number;
  readonly selectedCells: CellSelection | null;
  readonly selectedEventKeys: readonly string[];
  readonly popup: SchedulerPopupState | null;
  readonly loading: boolean;
  readonly pending: readonly EventId[];
  readonly workHours: readonly WorkHoursOverride[];
  readonly allDayExpanded: boolean;
  readonly expandedResources: readonly unknown[] | null;
  /** Inline editing: a new event in a cell range or the title of an event, with the text it starts with. */
  readonly inline: InlineEditState | null;
  /** Adaptive layout below the breakpoint: set by the container width observer, crossing the breakpoint only. */
  readonly compact?: boolean | undefined;
  /** Item id of the one resource the adaptive layout shows. */
  readonly resourceId?: unknown;
  /** Rendered resource rows of a virtualized timeline: updated when the window changes, not per scroll pixel. */
  readonly rendered?: RenderedRows | null | undefined;
}

export interface RenderedRows {
  readonly start: number;
  readonly end: number;
  /** Ids of the rendered rows' resources (`lazyLoad`), and their joined key. */
  readonly ids: readonly unknown[];
  readonly key: string;
}

export interface InlineEditState {
  readonly key?: string | undefined;
  readonly cells?: CellSelection | undefined;
  readonly text: string;
}

export interface SchedulerStore<Row> {
  getSnapshot(): SchedulerState<Row>;
  subscribe(listener: () => void): () => void;
  set(patch: Partial<SchedulerState<Row>> | ((s: SchedulerState<Row>) => Partial<SchedulerState<Row>>)): void;
}

export function createSchedulerStore<Row>(initial: SchedulerState<Row>): SchedulerStore<Row> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(patch) {
      const p = typeof patch === 'function' ? patch(state) : patch;
      let changed = false;
      for (const k of Object.keys(p) as (keyof SchedulerState<Row>)[]) {
        if (!Object.is(state[k], p[k])) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      state = Object.freeze({ ...state, ...p });
      for (const l of [...listeners]) l();
    },
  };
}
