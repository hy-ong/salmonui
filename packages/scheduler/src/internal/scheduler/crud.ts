// Event writes over application rows: add, save and delete with the recurrence scopes
// `'occurrence'` (an exception on the series plus an edited child with
// `recurrenceId`), `'following'` (the series ends before the occurrence and a
// new series linked by `followingId` starts there) and `'series'`. Pure:
// every function returns the new row array and the affected rows.

import { formatRecurrenceRule, parseRecurrenceRule, plainDate } from '@salmonui/core/internal/dates/index';
import { writeRow, type EventChanges, type NormalizeContext, type ResourceFieldInfo } from './fields.js';
import { seriesStarts, type ExpandContext } from './occurrences.js';
import type { EventId, EventRecord } from './types.js';

export type EditScope = 'occurrence' | 'following' | 'series';

export interface WriteSet<Row> {
  readonly rows: readonly Row[];
  readonly added: readonly Row[];
  readonly changed: readonly { readonly row: Row; readonly previous: Row }[];
  readonly deleted: readonly Row[];
}

export interface CrudContext<Row> extends NormalizeContext, ExpandContext {
  readonly resourceInfo: readonly ResourceFieldInfo[];
  readonly createId: (row: Row) => EventId;
  readonly idOf: (row: Row) => EventId;
}

/** Target of a save or delete: an event, or one occurrence of a series (its original start). */
export interface EventTarget<Row> {
  readonly event: EventRecord<Row>;
  /** Original start of the occurrence (for generated occurrences of a series). */
  readonly occurrenceStart?: number | undefined;
}

const replace = <Row>(rows: readonly Row[], idOf: (r: Row) => EventId, map: ReadonlyMap<EventId, Row | null>): Row[] => {
  const out: Row[] = [];
  for (const r of rows) {
    const id = idOf(r);
    if (!map.has(id)) out.push(r);
    else {
      const next = map.get(id);
      if (next) out.push(next);
    }
  }
  return out;
};

/** The rule of a series ending just before `occurrenceStart` (UNTIL one second earlier, UTC), or null when no occurrence remains. */
function endRuleBefore(rule: string, series: EventRecord<unknown>, occurrenceStart: number, ctx: ExpandContext): string | null {
  const p = parseRecurrenceRule(rule);
  if (!p.ok) return rule;
  const before = seriesStarts(series, { start: series.start, end: occurrenceStart }, ctx);
  if (!before.length) return null;
  const until = new Date(occurrenceStart - 1000);
  const { count: _count, ...rest } = p.rule;
  return formatRecurrenceRule({ ...rest, until: { date: plainDate(until.getUTCFullYear(), until.getUTCMonth() + 1, until.getUTCDate()), time: { hour: until.getUTCHours(), minute: until.getUTCMinutes(), second: until.getUTCSeconds() }, utc: true } });
}

/** The remaining COUNT of a series split at `occurrenceStart` (null keeps the rule). */
function remainingRule(rule: string, series: EventRecord<unknown>, occurrenceStart: number, ctx: ExpandContext): string {
  const p = parseRecurrenceRule(rule);
  if (!p.ok || p.rule.count === undefined) return rule;
  const before = seriesStarts({ ...series, recurrenceExceptions: [] }, { start: series.start, end: occurrenceStart }, ctx).length;
  return formatRecurrenceRule({ ...p.rule, count: Math.max(1, p.rule.count - before) });
}

export function addEvents<Row>(rows: readonly Row[], newRows: readonly Row[], ctx: CrudContext<Row>): WriteSet<Row> {
  const added = newRows.map((r) => {
    const id = ctx.idOf(r);
    return id === undefined || id === null || (id as unknown) === '' ? writeRow(r, { id: ctx.createId(r) }, ctx, ctx.resourceInfo) : r;
  });
  return { rows: [...rows, ...added], added, changed: [], deleted: [] };
}

/** Saves changes to an event, or to an occurrence of a series in `scope`. */
export function saveEvent<Row>(rows: readonly Row[], target: EventTarget<Row>, changes: EventChanges, scope: EditScope, children: readonly EventRecord<Row>[], ctx: CrudContext<Row>): WriteSet<Row> {
  const e = target.event;
  const isSeries = !!e.recurrenceRule && e.recurrenceId === undefined;
  if (!isSeries || target.occurrenceStart === undefined) {
    // A plain event, an edited occurrence, or the series itself.
    if (isSeries && scope === 'series') return saveSeries(rows, e, e.start, changes, children, ctx);
    const row = writeRow(e.row, changes, ctx, ctx.resourceInfo);
    return { rows: replace(rows, ctx.idOf, new Map([[e.id, row]])), added: [], changed: [{ row, previous: e.row }], deleted: [] };
  }
  const occ = target.occurrenceStart;
  if (scope === 'series') return saveSeries(rows, e, occ, changes, children, ctx);
  if (scope === 'occurrence') {
    const parent = writeRow(e.row, { recurrenceExceptions: [...e.recurrenceExceptions, occ] }, ctx, ctx.resourceInfo);
    const base = writeRow(e.row, { recurrenceRule: null, recurrenceExceptions: [], recurrenceId: e.id }, ctx, ctx.resourceInfo);
    const draft = writeRow(base, { ...changes, recurrenceRule: null }, ctx, ctx.resourceInfo);
    const child = writeRow(draft, { id: ctx.createId(draft) }, ctx, ctx.resourceInfo);
    return { rows: [...replace(rows, ctx.idOf, new Map([[e.id, parent]])), child], added: [child], changed: [{ row: parent, previous: e.row }], deleted: [] };
  }
  // 'following': end the series before the occurrence, start a new one there.
  const ended = endRuleBefore(e.recurrenceRule as string, e, occ, ctx);
  const map = new Map<EventId, Row | null>();
  const deleted: Row[] = [];
  const changed: { row: Row; previous: Row }[] = [];
  if (ended === null) {
    map.set(e.id, null);
    deleted.push(e.row);
  } else {
    const parent = writeRow(e.row, { recurrenceRule: ended }, ctx, ctx.resourceInfo);
    map.set(e.id, parent);
    changed.push({ row: parent, previous: e.row });
  }
  for (const c of children) {
    if (c.start >= occ) {
      map.set(c.id, null);
      deleted.push(c.row);
    }
  }
  const rule = changes.recurrenceRule ?? remainingRule(e.recurrenceRule as string, e, occ, ctx);
  const duration = e.end - e.start;
  const draft = writeRow(e.row, { start: occ, end: occ + duration, recurrenceExceptions: e.recurrenceExceptions.filter((t) => t >= occ), followingId: e.id, ...changes, recurrenceRule: rule }, ctx, ctx.resourceInfo);
  const next = writeRow(draft, { id: ctx.createId(draft) }, ctx, ctx.resourceInfo);
  return { rows: [...replace(rows, ctx.idOf, map), next], added: [next], changed, deleted };
}

function saveSeries<Row>(rows: readonly Row[], e: EventRecord<Row>, occurrenceStart: number, changes: EventChanges, children: readonly EventRecord<Row>[], ctx: CrudContext<Row>): WriteSet<Row> {
  // Time changes made on an occurrence move the whole series by the same delta.
  const shifted: { -readonly [K in keyof EventChanges]: EventChanges[K] } = { ...changes };
  if (changes.start !== undefined) shifted.start = e.start + (changes.start - occurrenceStart);
  if (changes.end !== undefined) shifted.end = e.end + (changes.end - (occurrenceStart + (e.end - e.start)));
  const reset = changes.start !== undefined || changes.end !== undefined || changes.recurrenceRule !== undefined;
  const map = new Map<EventId, Row | null>();
  const deleted: Row[] = [];
  if (reset) {
    // A changed rule or time drops the edited occurrences and the exceptions.
    shifted.recurrenceExceptions = [];
    for (const c of children) {
      map.set(c.id, null);
      deleted.push(c.row);
    }
  }
  const row = writeRow(e.row, shifted, ctx, ctx.resourceInfo);
  map.set(e.id, row);
  return { rows: replace(rows, ctx.idOf, map), added: [], changed: [{ row, previous: e.row }], deleted };
}

/** Deletes an event, or an occurrence of a series in `scope`. */
export function deleteEvent<Row>(rows: readonly Row[], target: EventTarget<Row>, scope: EditScope, children: readonly EventRecord<Row>[], series: EventRecord<Row> | undefined, ctx: CrudContext<Row>): WriteSet<Row> {
  const e = target.event;
  const map = new Map<EventId, Row | null>();
  const deleted: Row[] = [];
  const changed: { row: Row; previous: Row }[] = [];
  // An edited occurrence: delete it; scope 'series' / 'following' act on its series.
  if (e.recurrenceId !== undefined && series && scope !== 'occurrence') return deleteEvent(rows, { event: series, occurrenceStart: scope === 'following' ? e.start : undefined }, scope, children, undefined, ctx);
  const isSeries = !!e.recurrenceRule && e.recurrenceId === undefined;
  if (!isSeries || scope === 'series' || target.occurrenceStart === undefined) {
    map.set(e.id, null);
    deleted.push(e.row);
    if (isSeries) for (const c of children) {
      map.set(c.id, null);
      deleted.push(c.row);
    }
    return { rows: replace(rows, ctx.idOf, map), added: [], changed, deleted };
  }
  const occ = target.occurrenceStart;
  if (scope === 'occurrence') {
    const parent = writeRow(e.row, { recurrenceExceptions: [...e.recurrenceExceptions, occ] }, ctx, ctx.resourceInfo);
    map.set(e.id, parent);
    changed.push({ row: parent, previous: e.row });
  } else {
    const ended = endRuleBefore(e.recurrenceRule as string, e, occ, ctx);
    if (ended === null) {
      map.set(e.id, null);
      deleted.push(e.row);
    } else {
      const parent = writeRow(e.row, { recurrenceRule: ended }, ctx, ctx.resourceInfo);
      map.set(e.id, parent);
      changed.push({ row: parent, previous: e.row });
    }
    for (const c of children) {
      if (c.start >= occ) {
        map.set(c.id, null);
        deleted.push(c.row);
      }
    }
  }
  return { rows: replace(rows, ctx.idOf, map), added: [], changed, deleted };
}
