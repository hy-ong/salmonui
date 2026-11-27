// Event rows <-> normalized records: field
// roles map application property names; times are `Date`s, ISO strings
// (an offset or `Z` makes an instant, otherwise wall time in the event's or
// the Scheduler's zone) or plain date-time objects (wall time). Writes keep
// the row's own value style: a `Date` stays a `Date`, an ISO string stays a
// string (an instant with `Z`), a plain object stays a plain object.

import { parseIso, plainDateTime, utc } from '@salmonui/core/internal/dates/index';
import { DAY_MS, type ZoneConverter } from './time.js';
import { DEFAULT_EVENT_FIELDS, type EventId, type EventRecord, type SchedulerEventFieldMap } from './types.js';

export interface ResourceFieldInfo {
  readonly field: string;
  readonly multiple: boolean;
}

/** Instant of a time value; `null` when it cannot be read. Floating values are wall time through `zone`. */
export function instantOf(value: unknown, zone: ZoneConverter, eventZone?: ZoneConverter): number | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const z = eventZone ?? zone;
  if (typeof value === 'string') {
    const p = parseIso(value);
    if (!p?.date) return null;
    const t = p.time;
    const w = utc(p.date.year, p.date.month, p.date.day, t?.hour ?? 0, t?.minute ?? 0, t?.second ?? 0, t?.millisecond ?? 0);
    return p.offset === null ? z.instant(w) : w - p.offset * 60_000;
  }
  if (value && typeof value === 'object') {
    const o = value as { year?: number; month?: number; day?: number; hour?: number; minute?: number; second?: number; millisecond?: number };
    if (typeof o.year !== 'number' || typeof o.month !== 'number' || typeof o.day !== 'number') return null;
    return z.instant(utc(o.year, o.month, o.day, o.hour ?? 0, o.minute ?? 0, o.second ?? 0, o.millisecond ?? 0));
  }
  return null;
}

/** Writes an instant in the style of `previous` (a `Date`, an ISO instant string, a plain object or epoch ms). */
export function writeTime(epochMs: number, previous: unknown, zone: ZoneConverter): unknown {
  if (previous instanceof Date || previous === undefined || previous === null) return new Date(epochMs);
  if (typeof previous === 'number') return epochMs;
  if (typeof previous === 'string') {
    const p = parseIso(previous);
    if (p && p.offset === null) {
      const d = new Date(zone.wall(epochMs));
      const iso = d.toISOString().slice(0, 19);
      return p.time ? iso : iso.slice(0, 10);
    }
    return new Date(epochMs).toISOString();
  }
  const d = new Date(zone.wall(epochMs));
  return plainDateTime({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }, { hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds() });
}

const str = (v: unknown): string => (v == null ? '' : String(v));
const bool = (v: unknown): boolean => v === true || v === 'true' || v === 1;
const optStr = (v: unknown): string | undefined => (v == null || v === '' ? undefined : String(v));
const optId = (v: unknown): EventId | undefined => (v == null || v === '' ? undefined : typeof v === 'number' ? v : String(v));

export function resolveFields(fields: Partial<Record<keyof SchedulerEventFieldMap, string | { readonly field?: string }>> | undefined): SchedulerEventFieldMap {
  if (!fields) return DEFAULT_EVENT_FIELDS;
  const out: Record<string, string> = { ...DEFAULT_EVENT_FIELDS };
  for (const [k, v] of Object.entries(fields)) {
    const name = typeof v === 'string' ? v : v?.field;
    if (name) out[k] = name;
  }
  return out as unknown as SchedulerEventFieldMap;
}

/** Exception list: a comma separated string of ISO / iCalendar stamps (`20261124T090000Z`), or an array of time values. */
function exceptionsOf(value: unknown, zone: ZoneConverter, eventZone: ZoneConverter | undefined): number[] {
  if (value == null || value === '') return [];
  const list: unknown[] = Array.isArray(value) ? value : String(value).split(',');
  const out: number[] = [];
  for (const item of list) {
    let v = item;
    if (typeof v === 'string') {
      const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(v.trim());
      if (m) v = `${m[1]}-${m[2]}-${m[3]}${m[4] ? `T${m[4]}:${m[5]}:${m[6]}${m[7] ?? ''}` : ''}`;
    }
    const t = instantOf(v, zone, eventZone);
    if (t !== null) out.push(t);
  }
  return out;
}

export interface NormalizeContext {
  readonly fields: SchedulerEventFieldMap;
  readonly zone: ZoneConverter;
  readonly zoneFor: (name: string) => ZoneConverter;
  readonly resources: readonly ResourceFieldInfo[];
}

/** A normalized record of a row, or null when it has no id or no valid start. */
export function normalizeEvent<Row>(row: Row, ctx: NormalizeContext): EventRecord<Row> | null {
  const r = row as unknown as Record<string, unknown>;
  if (!r || typeof r !== 'object') return null;
  const f = ctx.fields;
  const id = optId(r[f.id]);
  if (id === undefined) return null;
  const startTimeZone = optStr(r[f.startTimeZone]);
  const endTimeZone = optStr(r[f.endTimeZone]) ?? startTimeZone;
  const sz = startTimeZone ? ctx.zoneFor(startTimeZone) : undefined;
  const ez = endTimeZone ? ctx.zoneFor(endTimeZone) : undefined;
  const allDay = bool(r[f.allDay]);
  let start = instantOf(r[f.start], ctx.zone, allDay ? undefined : sz);
  if (start === null) return null;
  let end = instantOf(r[f.end], ctx.zone, allDay ? undefined : ez) ?? start;
  if (allDay) {
    // All-day events are whole wall days in the Scheduler zone; an end at midnight is exclusive.
    const sd = ctx.zone.day(start);
    let ed = ctx.zone.day(end);
    if (ctx.zone.dayStart(ed) !== end || ed <= sd) ed += 1;
    if (ed <= sd) ed = sd + 1;
    start = ctx.zone.dayStart(sd);
    end = ctx.zone.dayStart(ed);
  }
  if (end < start) end = start;
  const resources: Record<string, readonly unknown[]> = {};
  for (const res of ctx.resources) {
    const v = r[res.field];
    if (v === undefined || v === null) continue;
    resources[res.field] = Array.isArray(v) ? v : [v];
  }
  return Object.freeze({
    id,
    title: str(r[f.title]),
    start,
    end,
    allDay,
    location: str(r[f.location]),
    description: str(r[f.description]),
    block: bool(r[f.block]),
    readOnly: bool(r[f.readOnly]),
    startTimeZone,
    endTimeZone,
    recurrenceRule: optStr(r[f.recurrenceRule]),
    recurrenceId: optId(r[f.recurrenceId]),
    recurrenceExceptions: exceptionsOf(r[f.recurrenceExceptions], ctx.zone, sz),
    followingId: optId(r[f.followingId]),
    resources: Object.freeze(resources),
    row,
  });
}

/** Stamp of an exception date for a row (`20261124T080000Z`), the iCalendar UTC form stored in `recurrenceExceptions`. */
export const exceptionStamp = (epochMs: number): string => new Date(epochMs).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export interface EventChanges {
  readonly title?: string;
  readonly start?: number;
  readonly end?: number;
  readonly allDay?: boolean;
  readonly location?: string;
  readonly description?: string;
  readonly recurrenceRule?: string | null;
  readonly recurrenceId?: EventId | null;
  readonly recurrenceExceptions?: readonly number[];
  readonly followingId?: EventId | null;
  readonly startTimeZone?: string | null;
  readonly endTimeZone?: string | null;
  readonly resources?: Readonly<Record<string, readonly unknown[]>>;
  readonly id?: EventId;
  /** Row properties outside the roles, written as given (a custom editor's own fields). */
  readonly extra?: Readonly<Record<string, unknown>> | undefined;
}

/** A new row: `base` with the changed roles written in the base's value styles. */
export function writeRow<Row>(base: Row, changes: EventChanges, ctx: NormalizeContext, resourceInfo: readonly ResourceFieldInfo[]): Row {
  const f = ctx.fields;
  // Properties outside the roles (`extra`) are written as given.
  const r: Record<string, unknown> = { ...(base as unknown as Record<string, unknown>), ...changes.extra };
  // `undefined` keeps the property, `null` removes it.
  const set = (k: string, v: unknown): void => {
    if (v === null) delete r[k];
    else if (v !== undefined) r[k] = v;
  };
  set(f.id, changes.id);
  set(f.title, changes.title);
  set(f.location, changes.location);
  set(f.description, changes.description);
  set(f.allDay, changes.allDay);
  const allDay = bool(r[f.allDay]);
  if (changes.start !== undefined) r[f.start] = writeTime(changes.start, r[f.start], ctx.zone);
  if (changes.end !== undefined) {
    // All-day ends are written as the exclusive midnight, as they are read.
    r[f.end] = writeTime(allDay ? ctx.zone.dayStart(Math.ceil((ctx.zone.wall(changes.end) - 1) / DAY_MS)) : changes.end, r[f.end] ?? r[f.start], ctx.zone);
  }
  set(f.recurrenceRule, changes.recurrenceRule);
  set(f.recurrenceId, changes.recurrenceId);
  set(f.followingId, changes.followingId);
  set(f.startTimeZone, changes.startTimeZone);
  set(f.endTimeZone, changes.endTimeZone);
  if (changes.recurrenceExceptions !== undefined) {
    const prev = r[f.recurrenceExceptions];
    r[f.recurrenceExceptions] = Array.isArray(prev) ? changes.recurrenceExceptions.map((t) => new Date(t)) : changes.recurrenceExceptions.map(exceptionStamp).join(',');
    if (!changes.recurrenceExceptions.length) delete r[f.recurrenceExceptions];
  }
  if (changes.resources) {
    for (const res of resourceInfo) {
      const ids = changes.resources[res.field];
      if (ids === undefined) continue;
      r[res.field] = res.multiple ? [...ids] : (ids[0] ?? null);
    }
  }
  return r as unknown as Row;
}
