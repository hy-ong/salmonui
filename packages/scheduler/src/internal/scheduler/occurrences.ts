// Occurrences of a visible range:
// plain events that overlap the range, and occurrences of recurring series
// expanded by the `#dates` RRULE engine in the event's zone (wall time kept
// across DST). Exception dates are skipped; an edited occurrence is its own
// event with `recurrenceId` (the series lists its original start as an
// exception), so it replaces the generated instance.

import { expandRecurrence } from '@salmonui/core/internal/dates/index';
import { DAY_MS, type ZoneConverter } from './time.js';
import type { EventId, EventRecord, Occurrence, TimeRange } from './types.js';

export interface ExpandContext {
  readonly zone: ZoneConverter;
  readonly zoneFor: (name: string) => ZoneConverter;
  /** Upper bound of occurrences per series and range. */
  readonly maxPerSeries?: number;
}

const occ = <Row>(event: EventRecord<Row>, start: number, end: number, generated: boolean): Occurrence<Row> => ({
  key: generated ? `${event.id}@${start}` : String(event.id),
  eventId: event.id,
  start,
  end,
  allDay: event.allDay,
  generated,
  seriesId: generated ? event.id : event.recurrenceId,
  event,
});

/** Occurrence starts of one series inside a range (instants). */
export function seriesStarts<Row>(event: EventRecord<Row>, range: TimeRange, ctx: ExpandContext): number[] {
  if (!event.recurrenceRule) return [];
  const z = event.allDay || !event.startTimeZone ? ctx.zone : ctx.zoneFor(event.startTimeZone);
  const w = new Date(z.wall(event.start));
  return expandRecurrence(event.recurrenceRule, {
    startWall: { year: w.getUTCFullYear(), month: w.getUTCMonth() + 1, day: w.getUTCDate(), hour: w.getUTCHours(), minute: w.getUTCMinutes(), second: w.getUTCSeconds() },
    timeZone: z.zone === 'UTC' ? undefined : z.zone,
    rangeStartMs: range.start,
    rangeEndMs: range.end,
    durationMs: Math.max(1, event.end - event.start),
    exceptionsMs: event.recurrenceExceptions,
    maxCount: ctx.maxPerSeries ?? 5000,
  });
}

/** The occurrence of a series that starts at `start` (wall duration kept across DST). */
export function occurrenceAt<Row>(event: EventRecord<Row>, start: number, ctx: ExpandContext): Occurrence<Row> {
  if (event.allDay) {
    const days = Math.max(1, Math.round((ctx.zone.wall(event.end) - ctx.zone.wall(event.start)) / DAY_MS));
    const d = ctx.zone.day(start);
    return occ(event, ctx.zone.dayStart(d), ctx.zone.dayStart(d + days), true);
  }
  const z = event.startTimeZone ? ctx.zoneFor(event.startTimeZone) : ctx.zone;
  const wallDur = z.wall(event.end) - z.wall(event.start);
  return occ(event, start, z.instant(z.wall(start) + wallDur), true);
}

/** Every occurrence overlapping `range`, sorted by start then longer first. */
export function occurrencesIn<Row>(events: Iterable<EventRecord<Row>>, range: TimeRange, ctx: ExpandContext): Occurrence<Row>[] {
  const out: Occurrence<Row>[] = [];
  for (const e of events) {
    if (e.recurrenceRule && e.recurrenceId === undefined) {
      for (const s of seriesStarts(e, range, ctx)) {
        const o = occurrenceAt(e, s, ctx);
        if (o.start < range.end && (o.end > range.start || (o.end === o.start && o.start >= range.start))) out.push(o);
      }
    } else if (e.start < range.end && (e.end > range.start || (e.end === e.start && e.start >= range.start))) out.push(occ(e, e.start, e.end, false));
  }
  out.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  return out;
}

/** Exception starts of a series that no edited occurrence replaces: the deleted occurrences. */
export function deletedOccurrences<Row>(series: EventRecord<Row>, children: Iterable<EventRecord<Row>>, zone: ZoneConverter): number[] {
  // An exception is an edited occurrence when a child of the series starts on the same
  // wall day; every other exception is a deleted occurrence.
  const editedDays = new Set<number>();
  for (const c of children) if (c.recurrenceId === series.id) editedDays.add(zone.day(c.start));
  return series.recurrenceExceptions.filter((t) => !editedDays.has(zone.day(t)));
}

/** Events keyed by id, and edited occurrences grouped by series. */
export function indexEvents<Row>(events: readonly EventRecord<Row>[]): { readonly byId: ReadonlyMap<EventId, EventRecord<Row>>; readonly children: ReadonlyMap<EventId, EventRecord<Row>[]> } {
  const byId = new Map<EventId, EventRecord<Row>>();
  const children = new Map<EventId, EventRecord<Row>[]>();
  for (const e of events) {
    byId.set(e.id, e);
    if (e.recurrenceId !== undefined) {
      const list = children.get(e.recurrenceId);
      if (list) list.push(e);
      else children.set(e.recurrenceId, [e]);
    }
  }
  return { byId, children };
}
