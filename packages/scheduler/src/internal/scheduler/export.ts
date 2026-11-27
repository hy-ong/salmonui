// Scheduler export and import. Pure: no React, no DOM.
//
// - `buildExportTable` turns event records (raw rows, or the occurrences of
//   a range) into a table of typed cells: one column per exported field (a
//   field role such as `title`, a mapped property such as `Subject`, or any
//   other row property).
// - `writeSchedulerCsv` writes that table as RFC 4180 CSV.
// - `schedulerExportModel` wraps it as a `@salmonui/core/export-model` export
//   model, the input of @salmonui/export XLSX writer (`exportXlsx` /
//   `writeXlsx`), which the React layer loads through `exportWriters.excel`.
//   This module never imports `@salmonui/export`.
// - `toICalendarEvents` / `fromICalendarEvents` map records to and from the
//   plain event shape of `@salmonui/export/ics` (declared here
//   structurally, `SchedulerICalendarEvent`).

import type { ExportCell, ExportColumn, ExportDataRow, ExportHeaderCell, ExportModel, ExportRow } from '@salmonui/core/export-model';
import { escapeCsvFormula } from '@salmonui/core/export-model';
import { offsetAt } from '@salmonui/core/internal/dates/index';
import { exceptionStamp, normalizeEvent, type NormalizeContext } from './fields.js';
import { deletedOccurrences, indexEvents, occurrencesIn, type ExpandContext } from './occurrences.js';
import { DAY_MS, type ZoneConverter } from './time.js';
import { DEFAULT_EVENT_FIELDS, type EventId, type EventRecord, type SchedulerEventFieldMap, type TimeRange } from './types.js';

export type SchedulerExportRole = keyof SchedulerEventFieldMap;

/** An exported field: a role (`title`), a mapped property (`Subject`) or another row property; objects set the header and width. */
export type SchedulerExportField = string | { readonly field: string; readonly headerText?: string | undefined; readonly width?: number | undefined };

export type SchedulerExportValue = string | number | boolean | Date | null;

export interface SchedulerExportColumn {
  /** The field as requested. */
  readonly key: string;
  /** The role it resolves to, or null for a plain row property. */
  readonly role: SchedulerExportRole | null;
  /** Row property name. */
  readonly field: string;
  readonly headerText: string;
  readonly type: 'string' | 'number' | 'boolean' | 'datetime';
  /** CSS px. */
  readonly width: number;
}

export interface SchedulerExportTable {
  readonly columns: readonly SchedulerExportColumn[];
  /** One array of cells per exported event or occurrence, in column order. */
  readonly rows: readonly (readonly SchedulerExportValue[])[];
}

export interface SchedulerExportContext extends NormalizeContext, ExpandContext {}

export interface SchedulerExportTableOptions<Row> {
  /** Exported fields in order. Default: every role whose mapped property occurs in a row, then the resource fields. */
  readonly fields?: readonly SchedulerExportField[] | undefined;
  /** Header text by role, mapped property or field (`fieldsInfo`). Default: the row property name. */
  readonly headerTexts?: Readonly<Record<string, string>> | undefined;
  /** One row per occurrence inside `range` (series expanded, edited occurrences in place) instead of one per stored row. */
  readonly includeOccurrences?: boolean | undefined;
  /** The range of `includeOccurrences` (normally the visible range); required with it. */
  readonly range?: TimeRange | undefined;
  /** Rows to export instead of the Scheduler's events (`customData`); normalized through the same field map. */
  readonly rows?: readonly Row[] | undefined;
}

const BOOLEAN_ROLES: ReadonlySet<string> = new Set(['allDay', 'block', 'readOnly']);
const ROLES = Object.keys(DEFAULT_EVENT_FIELDS) as SchedulerExportRole[];

/** Value of a role for an event (an occurrence's own start and end). */
function roleValue<Row>(role: SchedulerExportRole, e: EventRecord<Row>, start: number, end: number): SchedulerExportValue {
  switch (role) {
    case 'id':
      return e.id;
    case 'start':
      return new Date(start);
    case 'end':
      return new Date(end);
    case 'recurrenceExceptions':
      return e.recurrenceExceptions.length ? e.recurrenceExceptions.map(exceptionStamp).join(',') : null;
    case 'startTimeZone':
    case 'endTimeZone':
    case 'recurrenceRule':
    case 'recurrenceId':
    case 'followingId':
      return e[role] ?? null;
    default:
      return e[role];
  }
}

/** A raw property value as a cell. */
function cellOf(v: unknown): SchedulerExportValue {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.map((x) => (x instanceof Date ? x.toISOString() : String(x))).join(',');
  try {
    return JSON.stringify(v) ?? null;
  } catch {
    return String(v);
  }
}

/**
 * The export table. Rows are the stored events in source order,
 * or with `includeOccurrences` every occurrence overlapping `range` sorted by
 * start (a generated occurrence copies its series' cells with its own start
 * and end). Rows of `rows` that do not normalize (no id or start) export
 * their raw property values.
 */
export function buildExportTable<Row>(events: readonly EventRecord<Row>[], ctx: SchedulerExportContext, options: SchedulerExportTableOptions<Row> = {}): SchedulerExportTable {
  const f = ctx.fields;
  const byProperty = new Map<string, SchedulerExportRole>();
  for (const role of ROLES) if (!byProperty.has(f[role])) byProperty.set(f[role], role);
  const records: EventRecord<Row>[] = [];
  const rawRows = new Set<Row>();
  if (options.rows) {
    for (const row of options.rows) {
      const rec = normalizeEvent(row, ctx);
      if (rec) records.push(rec);
      else if (!options.includeOccurrences && row && typeof row === 'object') rawRows.add(row);
    }
  } else records.push(...events);

  // Entries: [record or null, start, end, row] in export order.
  type Entry = { readonly event: EventRecord<Row> | null; readonly start: number; readonly end: number; readonly row: Row };
  const entries: Entry[] = [];
  if (options.includeOccurrences) {
    if (!options.range) throw new Error('Scheduler export: includeOccurrences needs a range.');
    for (const o of occurrencesIn(records, options.range, ctx)) entries.push({ event: o.event, start: o.start, end: o.end, row: o.event.row });
  } else if (options.rows) {
    // Keep the source order of normalized and raw rows.
    const normalized = new Map(records.map((r) => [r.row as unknown, r]));
    for (const row of options.rows) {
      const rec = normalized.get(row);
      if (rec) entries.push({ event: rec, start: rec.start, end: rec.end, row });
      else if (rawRows.has(row)) entries.push({ event: null, start: 0, end: 0, row });
    }
  } else for (const e of records) entries.push({ event: e, start: e.start, end: e.end, row: e.row });

  const props = (row: Row): Record<string, unknown> => (row && typeof row === 'object' ? (row as unknown as Record<string, unknown>) : {});
  let specs: readonly SchedulerExportField[] | undefined = options.fields;
  if (!specs) {
    const present = new Set<string>();
    for (const en of entries) for (const k of Object.keys(props(en.row))) present.add(k);
    const list: string[] = ROLES.filter((role) => present.has(f[role]));
    for (const res of ctx.resources) if (present.has(res.field) && !list.includes(res.field) && !byProperty.has(res.field)) list.push(res.field);
    specs = list;
  }

  const columns: SchedulerExportColumn[] = [];
  const getters: ((en: Entry) => SchedulerExportValue)[] = [];
  for (const spec of specs) {
    const key = typeof spec === 'string' ? spec : spec.field;
    const role: SchedulerExportRole | null = (ROLES as string[]).includes(key) ? (key as SchedulerExportRole) : (byProperty.get(key) ?? null);
    const field = role ? f[role] : key;
    const headerText = (typeof spec === 'object' ? spec.headerText : undefined) ?? options.headerTexts?.[key] ?? (role ? (options.headerTexts?.[role] ?? options.headerTexts?.[field]) : undefined) ?? field;
    const get = role
      ? (en: Entry): SchedulerExportValue => (en.event ? roleValue(role, en.event, en.start, en.end) : cellOf(props(en.row)[field]))
      : (en: Entry): SchedulerExportValue => cellOf(props(en.row)[field]);
    let type: SchedulerExportColumn['type'] = role === 'start' || role === 'end' ? 'datetime' : role && BOOLEAN_ROLES.has(role) ? 'boolean' : 'string';
    if (!role) {
      for (const en of entries) {
        const v = get(en);
        if (v === null) continue;
        type = v instanceof Date ? 'datetime' : typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : 'string';
        break;
      }
    }
    const width = (typeof spec === 'object' ? spec.width : undefined) ?? (role === 'title' || role === 'description' ? 200 : 150);
    columns.push({ key, role, field, headerText, type, width });
    getters.push(get);
  }
  return { columns, rows: entries.map((en) => getters.map((g) => g(en))) };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** ISO 8601 wall time of an instant in a zone, with its offset (`2026-11-24T09:00:00-05:00`). */
export function zonedIso(epochMs: number, zone: ZoneConverter): string {
  const off = zone.offset(epochMs);
  const wall = new Date(epochMs + off).toISOString().slice(0, 19);
  if (off === 0) return `${wall}Z`;
  const m = Math.round(Math.abs(off) / 60_000);
  return `${wall}${off < 0 ? '-' : '+'}${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Display text of a cell: dates as zoned ISO 8601, `null` as empty. */
export function exportCellText(value: SchedulerExportValue, zone: ZoneConverter): string {
  if (value === null) return '';
  if (value instanceof Date) return zonedIso(value.getTime(), zone);
  return String(value);
}

export interface SchedulerCsvOptions {
  /** Field separator (`separator`). Default `,`. */
  readonly separator?: string | undefined;
  /** Default `\r\n` (RFC 4180). */
  readonly lineBreak?: string | undefined;
  /** Header line. Default true. */
  readonly includeHeaders?: boolean | undefined;
  /** Prefix a UTF-8 byte order mark (Excel detects UTF-8). Default false. */
  readonly bom?: boolean | undefined;
  /** Neutralize spreadsheet formulas in text cells (`=`, `+`, `-`, `@`, tab, CR prefixes get a leading `'`), as Data Grid CSV. Default true; `false` writes raw text. */
  readonly escapeFormulas?: boolean | undefined;
  /** Quote every field. Default false. */
  readonly quoteAll?: boolean | undefined;
}

/** RFC 4180 CSV of an export table; dates are ISO 8601 wall times in `zone` with the offset. */
export function writeSchedulerCsv(table: SchedulerExportTable, zone: ZoneConverter, options: SchedulerCsvOptions = {}): string {
  const sep = options.separator ?? ',';
  if (sep.length === 0 || /["\r\n]/.test(sep)) throw new Error('CSV separator must be non-empty and contain no quote or line break.');
  const lineBreak = options.lineBreak ?? '\r\n';
  const special = new RegExp(`["\\r\\n]|${sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  const field = (text: string, value?: unknown): string => {
    const t = options.escapeFormulas === false ? text : escapeCsvFormula(text, value);
    return options.quoteAll || special.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const lines: string[] = [];
  if (options.includeHeaders !== false) lines.push(table.columns.map((c) => field(c.headerText)).join(sep));
  for (const row of table.rows) lines.push(row.map((v) => field(exportCellText(v, zone), v)).join(sep));
  return (options.bom ? '﻿' : '') + lines.join(lineBreak) + (lines.length ? lineBreak : '');
}

// ---------------------------------------------------------------------------
// XLSX: an export model for the @salmonui/export writer
// ---------------------------------------------------------------------------

export type SchedulerExportRow = readonly SchedulerExportValue[];

export interface SchedulerExportModelOptions {
  /** Zone of date cells (Excel serials are wall time); also the text of dates in `values: 'text'` mode. */
  readonly zone: ZoneConverter;
  readonly locale?: string | undefined;
  readonly direction?: 'ltr' | 'rtl' | undefined;
}

/**
 * The export table as a `@salmonui/core/export-model` `ExportModel`, ready for
 * `exportXlsx(model, options)` / `writeXlsx(model, options)` of
 * `@salmonui/export/xlsx`: one header row, one data row per table
 * row, typed cells (dates as `Date`, written as Excel date-times in `zone`).
 */
export function schedulerExportModel(table: SchedulerExportTable, options: SchedulerExportModelOptions): ExportModel<SchedulerExportRow> {
  const zone = options.zone;
  const columns: ExportColumn<SchedulerExportRow>[] = table.columns.map((c, index) => ({
    index,
    columnId: c.key,
    field: c.field,
    headerText: c.headerText,
    type: c.type,
    width: c.width,
    textAlign: 'start',
    format: null,
    freeze: null,
    visible: true,
    // The writers read no compiled column of a model built outside a grid.
    column: null as unknown as ExportColumn<SchedulerExportRow>['column'],
    value: (row) => row[index] ?? null,
    text: (row) => exportCellText(row[index] ?? null, zone),
  }));
  const header: ExportHeaderCell[] = columns.map((c) => ({ text: c.headerText, columnId: c.columnId, colIndex: c.index, colSpan: 1, rowSpan: 1, leaf: true, textAlign: 'start' }));
  const rows: ExportDataRow<SchedulerExportRow>[] = table.rows.map((row, index) => ({ kind: 'data', index, id: String(index), row, depth: 0 }));
  return {
    scope: 'all',
    columns,
    headerRows: [header],
    rowCount: rows.length,
    dataRowCount: rows.length,
    detailRowCount: 0,
    groupDepth: 0,
    footerRows: [],
    frozen: { left: 0, right: 0, top: 0 },
    locale: options.locale ?? 'en-US',
    direction: options.direction ?? 'ltr',
    timeZone: zone.zone,
    hasCellHook: false,
    getRow: (i: number): ExportRow<SchedulerExportRow> => {
      const r = rows[i];
      if (!r) throw new RangeError(`Scheduler export model: no row ${i}.`);
      return r;
    },
    rows: () => rows[Symbol.iterator]() as IterableIterator<ExportRow<SchedulerExportRow>>,
    cell: (row, column): ExportCell => ({ value: column.value(row.row), text: column.text(row.row), type: column.type }),
  };
}

// ---------------------------------------------------------------------------
// iCalendar mapping
// ---------------------------------------------------------------------------

/** The time forms of `@salmonui/export/ics` (`ICalendarTime`). */
export type SchedulerICalendarTime = { readonly epochMs: number } | { readonly date: string } | { readonly wall: string; readonly timeZone?: string | undefined };

/** The event shape of `@salmonui/export/ics` (`ICalendarEvent`), declared structurally. */
export interface SchedulerICalendarEvent {
  readonly uid: string;
  readonly summary?: string | undefined;
  readonly location?: string | undefined;
  readonly description?: string | undefined;
  readonly start: SchedulerICalendarTime;
  readonly end?: SchedulerICalendarTime | undefined;
  readonly rrule?: string | undefined;
  readonly exdates?: readonly SchedulerICalendarTime[] | undefined;
  readonly recurrenceId?: SchedulerICalendarTime | undefined;
  readonly dtstamp?: number | undefined;
  readonly extra?: Readonly<Record<string, string>> | undefined;
}

export interface SchedulerICalendarExportOptions<Row> {
  /** UID of an event (a series and its edited occurrences share the series' UID). Default `String(id)`. */
  readonly uid?: ((event: EventRecord<Row>) => string) | undefined;
  /** Additional properties of an event (`X-...` names). */
  readonly extra?: ((event: EventRecord<Row>) => Readonly<Record<string, string>> | undefined) | undefined;
  /** Write timed events as UTC instants instead of TZID wall times. Default false. */
  readonly utc?: boolean | undefined;
}

const isUtcZone = (zone: string): boolean => zone === 'UTC' || zone === 'Etc/UTC' || zone === 'GMT';
const wallIso = (epochMs: number, z: ZoneConverter): string => new Date(z.wall(epochMs)).toISOString().slice(0, 19);
const dateIso = (day: number): string => new Date(day * DAY_MS).toISOString().slice(0, 10);

/**
 * iCalendar events of Scheduler records. All-day events are
 * DATE values in the Scheduler zone; timed events are TZID wall times in
 * the event's zone (else the Scheduler zone), or UTC instants when that zone
 * is UTC or `utc` is set, so series keep their wall time across DST. A
 * series lists its deleted occurrences as EXDATE; each edited occurrence (a
 * record with `recurrenceId`) is a VEVENT with the series' UID and a
 * RECURRENCE-ID of its original start (the series exception on the same
 * day, as the Scheduler pairs them). An edited occurrence whose series is
 * missing exports as a standalone event.
 */
export function toICalendarEvents<Row>(events: readonly EventRecord<Row>[], ctx: ExpandContext, options: SchedulerICalendarExportOptions<Row> = {}): SchedulerICalendarEvent[] {
  const { byId, children } = indexEvents(events);
  const uidOf = options.uid ?? ((e: EventRecord<Row>) => String(e.id));
  const zoneName = (e: EventRecord<Row>, end: boolean): string => (end ? (e.endTimeZone ?? e.startTimeZone) : e.startTimeZone) ?? ctx.zone.zone;
  /** A time of `e` in the form of `form`'s start. */
  const timeOf = (form: EventRecord<Row>, t: number, end = false): SchedulerICalendarTime => {
    if (form.allDay) return { date: dateIso(ctx.zone.day(t)) };
    const zone = zoneName(form, end);
    if (options.utc || isUtcZone(zone)) return { epochMs: t };
    return { wall: wallIso(t, zone === ctx.zone.zone ? ctx.zone : ctx.zoneFor(zone)), timeZone: zone };
  };
  const out: SchedulerICalendarEvent[] = [];
  for (const e of events) {
    const series = e.recurrenceId !== undefined ? byId.get(e.recurrenceId) : undefined;
    const isChild = series !== undefined && series.recurrenceRule !== undefined && series.recurrenceId === undefined;
    const item: Record<string, unknown> = { uid: isChild ? uidOf(series) : uidOf(e), start: timeOf(e, e.start), end: timeOf(e, e.end, true) };
    if (e.title) item['summary'] = e.title;
    if (e.location) item['location'] = e.location;
    if (e.description) item['description'] = e.description;
    if (isChild) {
      const day = ctx.zone.day(e.start);
      const original = series.recurrenceExceptions.find((t) => ctx.zone.day(t) === day) ?? e.start;
      item['recurrenceId'] = timeOf(series, original);
    } else if (e.recurrenceRule && e.recurrenceId === undefined) {
      item['rrule'] = e.recurrenceRule.replace(/^RRULE:/i, '').replace(/;+$/, '');
      const deleted = deletedOccurrences(e, children.get(e.id) ?? [], ctx.zone);
      if (deleted.length) item['exdates'] = deleted.map((t) => timeOf(e, t));
    }
    const extra = options.extra?.(e);
    if (extra && Object.keys(extra).length) item['extra'] = extra;
    out.push(item as unknown as SchedulerICalendarEvent);
  }
  return out;
}

export interface SchedulerICalendarImportContext {
  readonly fields: SchedulerEventFieldMap;
  readonly zone: ZoneConverter;
  readonly zoneFor: (name: string) => ZoneConverter;
}

export interface SchedulerICalendarImportOptions<Row> {
  /**
   * Id of an imported event. Default: the UID (`ics-<index>` without one,
   * `<uid>-<index>` for a repeated UID); edited occurrences
   * `<series id>@<original start stamp>`.
   */
  readonly createId?: ((event: SchedulerICalendarEvent, index: number) => EventId) | undefined;
  /** Final say over each row (copy `extra` properties, set resources). */
  readonly map?: ((row: Record<string, unknown>, event: SchedulerICalendarEvent) => Row) | undefined;
}

const knownZone = (zone: string): boolean => isUtcZone(zone) || offsetAt(0, zone) !== null;

/**
 * Scheduler rows of parsed iCalendar events, written through the
 * field map: start and end as `Date`s, all-day for DATE values (midnight
 * in the Scheduler zone, end exclusive), the event zone in
 * `startTimeZone` / `endTimeZone` for TZID values the platform knows (other
 * TZIDs and floating times are wall time in the Scheduler zone), the RRULE
 * in `recurrenceRule`, EXDATE plus the RECURRENCE-ID of every edited
 * occurrence in `recurrenceExceptions` (comma separated UTC stamps), and
 * edited occurrences linked by `recurrenceId`. A
 * RECURRENCE-ID whose series is not in the list imports as a plain event.
 */
export function fromICalendarEvents<Row = Record<string, unknown>>(events: readonly SchedulerICalendarEvent[], ctx: SchedulerICalendarImportContext, options: SchedulerICalendarImportOptions<Row> = {}): Row[] {
  const f = ctx.fields;
  const instant = (t: SchedulerICalendarTime): { readonly ms: number; readonly zone: string | undefined } => {
    if ('epochMs' in t) return { ms: t.epochMs, zone: undefined };
    if ('date' in t) return { ms: ctx.zone.dayStart(Math.floor(Date.parse(`${t.date}T00:00:00Z`) / DAY_MS)), zone: undefined };
    const wall = Date.parse(`${t.wall}Z`);
    if (t.timeZone && knownZone(t.timeZone)) return { ms: ctx.zoneFor(t.timeZone).instant(wall), zone: t.timeZone };
    return { ms: ctx.zone.instant(wall), zone: undefined };
  };
  const rows: (Record<string, unknown> | null)[] = events.map(() => null);
  const seriesByUid = new Map<string, Record<string, unknown>>();
  const exceptions = new Map<Record<string, unknown>, number[]>();
  const used = new Set<EventId>();
  const build = (e: SchedulerICalendarEvent): Record<string, unknown> => {
    const r: Record<string, unknown> = {};
    const allDay = 'date' in e.start;
    const s = instant(e.start);
    const en = e.end ? instant(e.end) : { ms: allDay ? ctx.zone.dayStart(ctx.zone.day(s.ms) + 1) : s.ms, zone: s.zone };
    r[f.title] = e.summary ?? '';
    r[f.start] = new Date(s.ms);
    r[f.end] = new Date(Math.max(s.ms, en.ms));
    r[f.allDay] = allDay;
    if (e.location) r[f.location] = e.location;
    if (e.description) r[f.description] = e.description;
    if (!allDay && s.zone) r[f.startTimeZone] = s.zone;
    if (!allDay && en.zone && en.zone !== s.zone) r[f.endTimeZone] = en.zone;
    return r;
  };
  // Series and plain events first, so edited occurrences can find their series.
  events.forEach((e, i) => {
    if (e.recurrenceId) return;
    const r = build(e);
    let id: EventId = options.createId?.(e, i) ?? (e.uid || `ics-${i}`);
    if (!options.createId && used.has(id)) id = `${id}-${i}`;
    used.add(id);
    r[f.id] = id;
    if (e.rrule) {
      r[f.recurrenceRule] = e.rrule.replace(/^RRULE:/i, '');
      const ex = (e.exdates ?? []).map((t) => instant(t).ms);
      exceptions.set(r, ex);
      if (e.uid && !seriesByUid.has(e.uid)) seriesByUid.set(e.uid, r);
    }
    rows[i] = r;
  });
  events.forEach((e, i) => {
    if (!e.recurrenceId) return;
    const r = build(e);
    const series = e.uid ? seriesByUid.get(e.uid) : undefined;
    const original = instant(e.recurrenceId).ms;
    let id: EventId = options.createId?.(e, i) ?? (series ? `${String(series[f.id])}@${exceptionStamp(original)}` : e.uid || `ics-${i}`);
    if (!options.createId && used.has(id)) id = `${id}-${i}`;
    used.add(id);
    r[f.id] = id;
    if (series) {
      r[f.recurrenceId] = series[f.id];
      const ex = exceptions.get(series) as number[];
      if (!ex.includes(original)) ex.push(original);
    }
    rows[i] = r;
  });
  for (const [r, ex] of exceptions) if (ex.length) r[f.recurrenceExceptions] = [...ex].sort((a, b) => a - b).map(exceptionStamp).join(',');
  const map = options.map;
  return rows.map((r, i) => (map ? map(r as Record<string, unknown>, events[i] as SchedulerICalendarEvent) : (r as unknown as Row)));
}
