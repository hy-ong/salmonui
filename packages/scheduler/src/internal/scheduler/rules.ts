// Availability and validation: block events reject creates, moves and resizes;
// with `overlap={false}` other events of the same resource do too; field
// validation uses the Data Grid rule names; recurrence validation rejects a
// duration longer than the frequency and occurrence edits that land on, or
// cross, another occurrence of the series.

import { parseRecurrenceRule } from '@salmonui/core/internal/dates/index';
import { occurrencesIn, seriesStarts, type ExpandContext } from './occurrences.js';
import { DAY_MS } from './time.js';
import type { EventId, EventRecord, Occurrence } from './types.js';

export interface SlotQuery {
  readonly start: number;
  readonly end: number;
  /** Resource ids per resource field; empty or absent matches every event. */
  readonly resources?: Readonly<Record<string, readonly unknown[]>> | undefined;
  /** Event (and its occurrences) to ignore, e.g. the event being moved. */
  readonly excludeId?: EventId | undefined;
  /** Original start of the occurrence being moved (only that occurrence is ignored). */
  readonly excludeOccurrenceStart?: number | undefined;
}

const sharesResource = (a: Readonly<Record<string, readonly unknown[]>>, b: Readonly<Record<string, readonly unknown[]>> | undefined): boolean => {
  if (!b) return true;
  const keys = Object.keys(b).filter((k) => (b[k]?.length ?? 0) > 0);
  if (!keys.length) return true;
  // A block or event without resource ids applies to every resource.
  return keys.every((k) => {
    const mine = a[k];
    if (!mine?.length) return true;
    return mine.some((id) => (b[k] as readonly unknown[]).includes(id));
  });
};

/** Events and blocks that collide with a slot. */
export function collisions<Row>(events: Iterable<EventRecord<Row>>, q: SlotQuery, ctx: ExpandContext, includeEvents: boolean): Occurrence<Row>[] {
  const hits: Occurrence<Row>[] = [];
  for (const o of occurrencesIn(events, { start: q.start, end: q.end }, ctx)) {
    if (q.excludeId !== undefined) {
      if (o.eventId === q.excludeId && (q.excludeOccurrenceStart === undefined || o.start === q.excludeOccurrenceStart || !o.generated)) continue;
      if (o.seriesId === q.excludeId && q.excludeOccurrenceStart === undefined) continue;
    }
    if (!o.event.block && !includeEvents) continue;
    if (!(o.start < q.end && o.end > q.start)) continue;
    if (!sharesResource(o.event.resources, q.resources)) continue;
    hits.push(o);
  }
  return hits;
}

/** `api.isSlotAvailable`: no block, and with `overlap={false}` no event, in the slot. */
export function isSlotAvailable<Row>(events: Iterable<EventRecord<Row>>, q: SlotQuery, ctx: ExpandContext, overlap: boolean): boolean {
  return collisions(events, q, ctx, !overlap).length === 0;
}

// Field validation lives in the editor chunk's own module.
export { validateFields, type FieldValidation, type ValidationMessages } from './field-rules.js';

// ---------------------------------------------------------------------------
// Recurrence validation
// ---------------------------------------------------------------------------

export type RecurrenceProblem = 'durationTooLong' | 'sameDay' | 'occurrenceOverlap' | 'invalidRule';

const SPAN: Readonly<Record<string, number>> = { daily: 1, weekly: 7, monthly: 28, yearly: 365 };

/** A problem with a series' rule and duration (`durationTooLong`), or null. */
export function validateSeries(rule: string, start: number, end: number): RecurrenceProblem | null {
  const p = parseRecurrenceRule(rule);
  if (!p.ok) return 'invalidRule';
  const span = (SPAN[p.rule.frequency] ?? 1) * p.rule.interval * DAY_MS;
  // Weekly rules with several days: the shortest gap between two of them.
  let gap = span;
  if (p.rule.frequency === 'weekly' && (p.rule.byDay?.length ?? 0) > 1) {
    const days = [...new Set((p.rule.byDay ?? []).map((d) => d.weekday))].sort((a, b) => a - b);
    for (let i = 0; i < days.length; i++) gap = Math.min(gap, (((days[(i + 1) % days.length] as number) - (days[i] as number) + 7) % 7 || 7) * DAY_MS);
  }
  return end - start > gap ? 'durationTooLong' : null;
}

/** A problem with moving one occurrence of `series` from `originalStart` to [start, end), or null. */
export function validateOccurrenceMove<Row>(series: EventRecord<Row>, originalStart: number, start: number, end: number, ctx: ExpandContext): RecurrenceProblem | null {
  const window = { start: Math.min(originalStart, start) - 400 * DAY_MS, end: Math.max(originalStart, end) + 400 * DAY_MS };
  const starts = seriesStarts({ ...series, recurrenceExceptions: [] }, window, ctx);
  const i = starts.indexOf(originalStart);
  if (i < 0) return null;
  const day = ctx.zone.day(start);
  const prev = starts[i - 1];
  const next = starts[i + 1];
  if ((prev !== undefined && ctx.zone.day(prev) === day) || (next !== undefined && ctx.zone.day(next) === day)) return 'sameDay';
  if ((prev !== undefined && start < prev) || (next !== undefined && start > next)) return 'occurrenceOverlap';
  return null;
}
