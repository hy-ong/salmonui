// Scheduler engine types. No React, no DOM globals.

export type EventId = string | number;

export type SchedulerViewType = 'day' | 'week' | 'workWeek' | 'month' | 'year' | 'agenda' | 'monthAgenda' | 'timelineDay' | 'timelineWeek' | 'timelineWorkWeek' | 'timelineMonth' | 'timelineYear';

/** Field roles of an event row: the property name of each role in the application's rows. */
export interface SchedulerEventFieldMap {
  readonly id: string;
  readonly title: string;
  readonly start: string;
  readonly end: string;
  readonly allDay: string;
  readonly location: string;
  readonly description: string;
  readonly block: string;
  readonly readOnly: string;
  readonly startTimeZone: string;
  readonly endTimeZone: string;
  readonly recurrenceRule: string;
  readonly recurrenceId: string;
  readonly recurrenceExceptions: string;
  readonly followingId: string;
}

export const DEFAULT_EVENT_FIELDS: SchedulerEventFieldMap = Object.freeze({
  id: 'id',
  title: 'title',
  start: 'start',
  end: 'end',
  allDay: 'allDay',
  location: 'location',
  description: 'description',
  block: 'block',
  readOnly: 'readOnly',
  startTimeZone: 'startTimeZone',
  endTimeZone: 'endTimeZone',
  recurrenceRule: 'recurrenceRule',
  recurrenceId: 'recurrenceId',
  recurrenceExceptions: 'recurrenceExceptions',
  followingId: 'followingId',
});

/** A normalized event (internal; payloads carry the application row). */
export interface EventRecord<Row = unknown> {
  readonly id: EventId;
  readonly title: string;
  /** Instants (epoch ms); all-day events start at midnight of their first day and end at midnight after the last. */
  readonly start: number;
  readonly end: number;
  readonly allDay: boolean;
  readonly location: string;
  readonly description: string;
  readonly block: boolean;
  readonly readOnly: boolean;
  readonly startTimeZone: string | undefined;
  readonly endTimeZone: string | undefined;
  readonly recurrenceRule: string | undefined;
  readonly recurrenceId: EventId | undefined;
  /** Excluded occurrence starts (epoch ms). */
  readonly recurrenceExceptions: readonly number[];
  readonly followingId: EventId | undefined;
  /** Resource ids per resource `field`. */
  readonly resources: Readonly<Record<string, readonly unknown[]>>;
  readonly row: Row;
}

/** One rendered instance of an event (a plain event, or an occurrence of a series). */
export interface Occurrence<Row = unknown> {
  /** Stable key: the event id, plus `@start` for generated occurrences. */
  readonly key: string;
  readonly eventId: EventId;
  readonly start: number;
  readonly end: number;
  readonly allDay: boolean;
  /** True for an occurrence generated from a recurrence rule. */
  readonly generated: boolean;
  /** For occurrences of a series (generated or edited): the series event id. */
  readonly seriesId: EventId | undefined;
  readonly event: EventRecord<Row>;
}

export interface TimeRange {
  readonly start: number;
  readonly end: number;
}
