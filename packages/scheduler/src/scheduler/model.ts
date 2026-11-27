// Derived view model of a Scheduler render: the resolved view entry, the
// visible days and range, normalized records, occurrences and layout. Pure
// functions over props and the store snapshot; the component memoizes them
// per input so a selection change never re-runs the layout.

import { localeFirstDay } from '@salmonui/core/internal/dates/index';
import { normalizeEvent, resolveFields, type ResourceFieldInfo } from '../internal/scheduler/fields.js';
import { layoutDays, layoutMonth, type DayLayout, type DayLayoutOptions, type EventOrder, type MonthLayout } from '../internal/scheduler/layout.js';
import { indexEvents, occurrencesIn } from '../internal/scheduler/occurrences.js';
import { createZoneConverter, DAY_MS, minutesOf, type ZoneConverter } from '../internal/scheduler/time.js';
import type { EventId, EventRecord, Occurrence, SchedulerEventFieldMap, SchedulerViewType, TimeRange } from '../internal/scheduler/types.js';
import { isDayView, isMonthView, monthWeeks, visibleDays, type ResolvedView } from '../internal/scheduler/views.js';
import type { SchedulerEventFields, SchedulerProps, SchedulerViewConfig, SchedulerViewEntry } from './types.js';

export const DEFAULT_VIEWS: readonly SchedulerViewType[] = ['day', 'week', 'workWeek', 'month'];
const DEFAULT_WORK_DAYS: readonly number[] = [1, 2, 3, 4, 5];

export interface ViewEntry<Row> extends SchedulerViewConfig<Row> {
  readonly name: string;
}

export function viewEntries<Row>(views: readonly SchedulerViewEntry<Row>[] | undefined): ViewEntry<Row>[] {
  return (views?.length ? views : DEFAULT_VIEWS).map((v) => (typeof v === 'string' ? { type: v, name: v } : { ...v, name: v.name ?? v.type }));
}

export interface ResolvedOptions<Row> {
  readonly entry: ViewEntry<Row>;
  readonly view: ResolvedView;
  readonly startMinute: number;
  readonly endMinute: number;
  readonly workStart: number;
  readonly workEnd: number;
  readonly slotMinutes: number;
  readonly slotCount: number;
  readonly timeScale: boolean;
  readonly readOnly: boolean;
}

export function resolveOptions<Row>(props: SchedulerProps<Row>, entry: ViewEntry<Row>, locale: string): ResolvedOptions<Row> {
  const workDays = entry.workDays ?? props.workDays ?? DEFAULT_WORK_DAYS;
  const view: ResolvedView = {
    type: entry.type,
    interval: Math.max(1, entry.interval ?? 1),
    agendaDayCount: Math.max(1, entry.agendaDayCount ?? props.agendaDayCount ?? 7),
    firstDayOfWeek: props.firstDayOfWeek ?? localeFirstDay(locale),
    workDays,
    showWeekend: entry.showWeekend ?? props.showWeekend ?? true,
    monthCount: Math.max(1, entry.monthCount ?? props.monthCount ?? 12),
    firstMonthOfYear: entry.firstMonthOfYear ?? props.firstMonthOfYear ?? 1,
  };
  const startMinute = minutesOf(entry.startHour ?? props.startHour, 0);
  const endMinute = Math.max(startMinute + 30, minutesOf(entry.endHour ?? props.endHour, 1440));
  const ts = entry.timeScale ?? props.timeScale;
  return {
    entry,
    view,
    startMinute,
    endMinute,
    workStart: minutesOf(props.workHours?.start, 9 * 60),
    workEnd: minutesOf(props.workHours?.end, 18 * 60),
    slotMinutes: Math.max(5, ts?.interval ?? 60),
    slotCount: Math.max(1, ts?.slotCount ?? 2),
    timeScale: ts?.enabled ?? true,
    readOnly: props.readOnly === true || entry.readOnly === true,
  };
}

export interface RecordSet<Row> {
  readonly records: readonly EventRecord<Row>[];
  readonly byId: ReadonlyMap<EventId, EventRecord<Row>>;
  readonly children: ReadonlyMap<EventId, EventRecord<Row>[]>;
}

export interface RecordContext {
  readonly fields: SchedulerEventFieldMap;
  readonly zone: ZoneConverter;
  readonly zoneFor: (name: string) => ZoneConverter;
  readonly resources: readonly ResourceFieldInfo[];
}

export function recordContext(eventFields: SchedulerEventFields | undefined, zone: ZoneConverter, zones: Map<string, ZoneConverter>, resources: readonly ResourceFieldInfo[] = []): RecordContext {
  return {
    fields: resolveFields(eventFields),
    zone,
    zoneFor: (name) => {
      let z = zones.get(name);
      if (!z) {
        z = createZoneConverter(name);
        zones.set(name, z);
      }
      return z;
    },
    resources,
  };
}

export function buildRecords<Row>(rows: readonly Row[], ctx: RecordContext): RecordSet<Row> {
  const records: EventRecord<Row>[] = [];
  for (const r of rows) {
    const rec = normalizeEvent(r, ctx);
    if (rec) records.push(rec);
  }
  const { byId, children } = indexEvents(records);
  return { records, byId, children };
}

export interface PageModel {
  readonly days: readonly number[];
  readonly weeks: readonly (readonly number[])[] | null;
  readonly range: TimeRange;
}

export function pageModel(opts: ResolvedOptions<unknown>, anchor: number, zone: ZoneConverter): PageModel {
  const weeks = isMonthView(opts.view.type) ? monthWeeks(opts.view, anchor) : null;
  const days = weeks ? weeks.flat() : visibleDays(opts.view, anchor);
  const first = weeks ? (weeks[0]?.[0] ?? anchor) : (days[0] ?? anchor);
  const lastRow = weeks ? weeks[weeks.length - 1] : null;
  const last = weeks ? (lastRow?.[lastRow.length - 1] ?? anchor) : (days[days.length - 1] ?? anchor);
  // Month pages include the hidden weekend days of the first and last week in the range.
  const rangeFirst = weeks ? Math.min(first, ...weeks.map((w) => w[0] ?? first)) : first;
  return { days, weeks, range: { start: zone.dayStart(rangeFirst), end: zone.dayStart(last + 1) } };
}

/** Options of the day-view layout (shared with the grouped layout of the resources chunk). */
export function dayLayoutOptions<Row>(opts: ResolvedOptions<Row>, zone: ZoneConverter, props: SchedulerProps<Row>, allDayExpanded: boolean): Omit<DayLayoutOptions<Row>, 'days'> {
  const layout = opts.entry.eventLayout ?? props.eventLayout;
  return {
    zone,
    startMinute: opts.startMinute,
    endMinute: opts.endMinute,
    minimumDuration: layout?.minimumDuration ?? 0,
    spannedPlacement: layout?.spannedPlacement ?? 'allDayRow',
    order: eventOrderOf(props),
    allDayMaxLanes: allDayExpanded ? null : (layout?.maxHeight ?? 2),
  };
}

export const eventOrderOf = <Row,>(props: SchedulerProps<Row>): EventOrder<Row> | undefined => (props.eventOrder ? (a, b) => (props.eventOrder as (a: Row, b: Row) => number)(a.event.row, b.event.row) : undefined);

/** Lanes per month row before "+N more" (null with `autoRowHeight`). */
export const monthLanes = <Row,>(opts: ResolvedOptions<Row>, props: SchedulerProps<Row>, fallback = 3): number | null => (props.autoRowHeight ? null : ((opts.entry.eventLayout ?? props.eventLayout)?.maxHeight ?? fallback));

export function layoutPage<Row>(occs: readonly Occurrence<Row>[], opts: ResolvedOptions<Row>, page: PageModel, zone: ZoneConverter, props: SchedulerProps<Row>, allDayExpanded: boolean): { day: DayLayout<Row> | null; month: MonthLayout<Row> | null } {
  if (isDayView(opts.view.type)) return { day: layoutDays(occs, { ...dayLayoutOptions(opts, zone, props, allDayExpanded), days: page.days }), month: null };
  if (opts.view.type === 'month' && page.weeks) return { day: null, month: layoutMonth(occs, page.weeks, zone, monthLanes(opts, props), eventOrderOf(props)) };
  return { day: null, month: null };
}

export function occurrencesOf<Row>(set: RecordSet<Row>, range: TimeRange, zone: ZoneConverter, zoneFor: (n: string) => ZoneConverter): Occurrence<Row>[] {
  return occurrencesIn(set.records, range, { zone, zoneFor });
}

/** Day number of a plain date. */
export const dayOf = (d: { readonly year: number; readonly month: number; readonly day: number }): number => Math.floor(Date.UTC(d.year, d.month - 1, d.day) / DAY_MS);
