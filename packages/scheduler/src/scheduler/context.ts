'use client';

// Per-instance context of one Scheduler (never module state): the store,
// the resolved options, formatters and the action handlers the view parts
// call. View parts read store slices through `useSchedulerSelector`.

import { createContext, useContext, useSyncExternalStore } from 'react';
import type { GroupModel, GroupNode } from '../internal/scheduler/resources.js';
import type { SchedulerState, SchedulerStore } from '../internal/scheduler/store.js';
import type { ZoneConverter } from '../internal/scheduler/time.js';
import type { Occurrence, SchedulerViewType } from '../internal/scheduler/types.js';
import type { SchedulerLocaleText } from './locale.js';
import type { ResolvedOptions } from './model.js';
import type { SchedulerCellContext, SchedulerCellProps, SchedulerEventSource, SchedulerProps } from './types.js';

export interface Formatters {
  /** Time of a wall-clock ms (`9:00 AM`). */
  time(wallMs: number): string;
  /** Hour label of a slot. */
  slot(wallMs: number): string;
  /** Weekday short name of a day number. */
  weekday(day: number): string;
  /** Day of month digits of a day number. */
  dayNumber(day: number): string;
  /** Full date of a day number (accessible names). */
  fullDate(day: number): string;
  /** Month and day (`Nov 23`). */
  monthDay(day: number): string;
  /** Range text of an occurrence. */
  range(o: Occurrence<unknown>): string;
}

export interface SchedulerActions {
  cellClick(start: number, end: number, allDay: boolean, element: Element | null, source: SchedulerEventSource, double: boolean, res?: GroupNode | null): void;
  cellSelect(start: number, end: number, allDay: boolean, extend: boolean, res?: GroupNode | null): void;
  eventClick(o: Occurrence<unknown>, element: Element | null, source: SchedulerEventSource, double: boolean, additive: boolean | 'range', selKey?: string): void;
  moreClick(day: number, element: Element | null, source: SchedulerEventSource): void;
  goToDay(day: number, source: SchedulerEventSource): void;
  toggleAllDay(): void;
  hover(part: 'cell' | 'event' | 'header', o: Occurrence<unknown> | null, start: number | null, element: Element): void;
  /** Inline editing: false when `editing.inline` is off or the target is not editable. */
  inlineStart(target: { readonly key: string } | { readonly cells: { readonly start: number; readonly end: number; readonly allDay: boolean } }, text: string): boolean;
  inlineCommit(text: string, element: Element | null): void;
  inlineCancel(element: Element | null): void;
}

export interface SchedulerContextValue {
  readonly store: SchedulerStore<unknown>;
  readonly props: SchedulerProps<unknown>;
  readonly opts: ResolvedOptions<unknown>;
  readonly zone: ZoneConverter;
  /** The resolved `locale` (the prop, else the nearest LocaleProvider's, else `'en-US'`). */
  readonly locale: string;
  readonly text: SchedulerLocaleText;
  readonly t: (key: keyof SchedulerLocaleText, params?: Record<string, string | number>) => string;
  readonly fmt: Formatters;
  readonly actions: SchedulerActions;
  readonly view: SchedulerViewType;
  /** Today's day number in the Scheduler zone, client only (null on the server and during hydration). */
  readonly today: number | null;
  readonly editable: boolean;
  readonly cellProps: (ctx: SchedulerCellContext) => SchedulerCellProps | undefined;
  readonly id: (part: string) => string;
  /** Resource model of the rendered view (set by the resources chunk). */
  readonly group?: GroupModel | null | undefined;
  /** The adaptive layout applies. */
  readonly adaptive?: boolean;
  /** Imperative hooks the rendered view registers (`api.scrollToResource`). */
  readonly handle: { current: ViewHandle };
  /** The Scheduler root element (read in effects and handlers only): the popups portal to its theme scope. */
  readonly root: { readonly current: HTMLDivElement | null };
  /** Scrolls the time grid to `scrollTime`; called by the grid itself, which may mount from a lazy chunk (resources, adaptive). */
  readonly scrollStart: (el: HTMLElement | null) => void;
}

export interface ViewHandle {
  /** Scrolls the row (timeline) or column (grouped views) of a resource group key into view. */
  scrollToResource?(key: string): void;
}

export const SchedulerContext = createContext<SchedulerContextValue | null>(null);

export function useScheduler(): SchedulerContextValue {
  const ctx = useContext(SchedulerContext);
  if (!ctx) throw new Error('Scheduler parts must render inside <Scheduler>.');
  return ctx;
}

/** A narrow store selector; `select` must return a primitive or a stable reference. */
export function useSchedulerSelector<T>(store: SchedulerStore<unknown>, select: (s: SchedulerState<unknown>) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.getSnapshot()),
    () => select(store.getSnapshot()),
  );
}
