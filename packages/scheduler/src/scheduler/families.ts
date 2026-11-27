// View family modules of the Scheduler: Day / Week / WorkWeek / Month are in
// the initial JS; the timeline views, the list views (Year, Agenda, Month
// Agenda) and the resources and grouping layer are one module each, read
// through `#scheduler-views` (static on the server, lazy in the browser).

import type { ReactNode } from 'react';
import type { DayLayout, MonthLayout } from '../internal/scheduler/layout.js';
import type { ResourceItemInfo } from '../internal/scheduler/resources.js';
import type { SchedulerStore } from '../internal/scheduler/store.js';
import type { Occurrence, SchedulerViewType } from '../internal/scheduler/types.js';
import type { ViewHandle } from './context.js';
import type { SchedulerProps, SchedulerRenderedRange } from './types.js';

export type ViewFamily = 'timeline' | 'list' | 'resources';

/** What the Scheduler hands a family view: the page and its occurrences. */
export interface GateProps {
  readonly type: SchedulerViewType;
  readonly days: readonly number[];
  readonly weeks: readonly (readonly number[])[] | null;
  readonly anchor: number;
  readonly occurrences: readonly Occurrence<unknown>[];
  /** The ungrouped Day / Month layout the Scheduler computed. */
  readonly layout: { readonly day: DayLayout<unknown> | null; readonly month: MonthLayout<unknown> | null } | null;
  readonly allDayExpanded: boolean;
  /** Occurrences of another range (agenda virtual scrolling). */
  readonly occurrencesIn: (start: number, end: number) => readonly Occurrence<unknown>[];
}

export interface ViewModule {
  readonly View: (props: GateProps) => ReactNode;
}

/** What the API forwarders hand the resources module. */
export interface ApiContext {
  readonly store: SchedulerStore<unknown>;
  readonly props: SchedulerProps<unknown>;
  readonly handle: { current: ViewHandle };
}

export interface ResourcesModule {
  /** Provides the resource model to the view below and renders it (grouped Day / Month itself). */
  readonly Grouped: (props: GateProps & { readonly View: ViewModule['View'] | null }) => ReactNode;
  getResource(c: ApiContext, id: unknown, resource?: string): ResourceItemInfo | null;
  getResources(c: ApiContext): ResourceItemInfo[];
  expandResource(c: ApiContext, id: unknown): void;
  collapseResource(c: ApiContext, id: unknown): void;
  scrollToResource(c: ApiContext, id: unknown): void;
  getRenderedRange(c: ApiContext): SchedulerRenderedRange | null;
}

export interface ViewModules {
  readonly timeline?: ViewModule;
  readonly list?: ViewModule;
  readonly resources?: ResourcesModule;
}

/** A status-tagged thenable (the convention React's `use` reads). */
export type ViewModulesThenable = Promise<ViewModules> & { status?: 'pending' | 'fulfilled' | 'rejected'; value?: ViewModules; reason?: unknown };

export type ReadViews = (needed: readonly ViewFamily[]) => ViewModules | ViewModulesThenable;
export type PeekViews = () => ViewModules;

/** The family of a view type (null: Day / Week / WorkWeek / Month, in the initial JS). */
export const familyOf = (t: SchedulerViewType): 'timeline' | 'list' | null => (t.startsWith('timeline') ? 'timeline' : t === 'year' || t === 'agenda' || t === 'monthAgenda' ? 'list' : null);
