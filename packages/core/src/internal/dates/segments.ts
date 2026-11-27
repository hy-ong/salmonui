// Field segments of a date or time format: the editable segments (year,
// month, day, hour, minute, second, day period) and literals in the order of
// `Intl.DateTimeFormat#formatToParts` for the locale and options, or of a
// pattern string; segment limits, display text, digit entry and increments.

import { dateFormat, intlSpaces, isSkeleton, numberFormat, partOf, skeletonOptions, tokenizePattern } from './format.js';
import { daysInMonth } from './plain.js';

export type SegmentType = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second' | 'dayPeriod';

/** Deepest field of a date or date-time value. */
export type Granularity = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second';

export type HourCycle = 'h12' | 'h23';

/** A segment of a field format: an editable field or a literal. */
export type SegmentSpec =
  | { readonly type: SegmentType; readonly style: 'numeric' | '2-digit' | 'short' | 'long' | 'narrow' }
  | { readonly type: 'literal'; readonly text: string };

/** A display format: `Intl` options or a pattern / skeleton string. */
export type DateFormat = Intl.DateTimeFormatOptions | string;

const ORDER: readonly SegmentType[] = ['year', 'month', 'day', 'hour', 'minute', 'second'];

/** True when a segment type is at or above the granularity (`dayPeriod` follows `hour`). */
const within = (type: SegmentType, g: Granularity): boolean => (type === 'dayPeriod' ? ORDER.indexOf(g) >= 3 : ORDER.indexOf(type) <= ORDER.indexOf(g));

/** Segment of a pattern field letter. */
export const PATTERN_FIELDS: Readonly<Record<string, SegmentType>> = { y: 'year', M: 'month', L: 'month', d: 'day', H: 'hour', h: 'hour', m: 'minute', s: 'second', a: 'dayPeriod' };

export interface FieldFormat {
  readonly segments: readonly SegmentSpec[];
  /** 12-hour clock with a day period segment. */
  readonly h12: boolean;
}

/**
 * The segments of a field: `format` (options, skeleton or pattern) when
 * given, else the locale's numeric order down to `granularity`. `time`
 * fields (TimeField) drop the date part. `hourCycle` overrides the locale.
 */
export function fieldFormat(locale: string, granularity: Granularity, opts: { readonly format?: DateFormat | undefined; readonly hourCycle?: HourCycle | undefined; readonly time?: boolean } = {}): FieldFormat {
  const { format, hourCycle, time } = opts;
  const keep = (t: SegmentType): boolean => within(t, granularity) && (!time || ORDER.indexOf(t) >= 3 || t === 'dayPeriod');
  if (typeof format === 'string' && !isSkeleton(format)) {
    const segments: SegmentSpec[] = [];
    let h12 = false;
    let lit = '';
    for (const tok of tokenizePattern(format)) {
      const type = 'field' in tok ? PATTERN_FIELDS[tok.field[0] as string] : undefined;
      if (!type || !('field' in tok) || !keep(type)) {
        lit += 'literal' in tok ? tok.literal : '';
        continue;
      }
      if (lit) segments.push({ type: 'literal', text: lit }), (lit = '');
      const n = tok.field.length;
      if (tok.field[0] === 'h') h12 = true;
      segments.push({ type, style: type === 'dayPeriod' ? 'short' : type === 'month' && n > 2 ? (n === 3 ? 'short' : n === 4 ? 'long' : 'narrow') : n === 2 ? '2-digit' : 'numeric' });
    }
    if (lit && segments.length) segments.push({ type: 'literal', text: lit });
    if (hourCycle) h12 = hourCycle === 'h12';
    return { segments: trim(segments, h12), h12 };
  }
  const options: Intl.DateTimeFormatOptions & Record<string, unknown> = {
    ...(typeof format === 'string' ? skeletonOptions(format) : format ?? { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    calendar: 'gregory',
  };
  for (const t of ORDER) if (!keep(t)) delete options[t];
  if (hourCycle) (options.hourCycle = hourCycle), delete options.hour12;
  const f = dateFormat(locale, options);
  const h12 = /h1[12]/.test(f.resolvedOptions().hourCycle ?? '');
  const segments: SegmentSpec[] = [];
  // 2026-01-05 03:04:05 UTC: single-digit fields tell `numeric` from `2-digit`; styles (`dateStyle`) resolve the same way.
  for (const p of f.formatToParts(Date.UTC(2026, 0, 5, 3, 4, 5))) {
    const type = p.type === 'dayPeriod' || (ORDER as readonly string[]).includes(p.type) ? (p.type as SegmentType) : null;
    if (type && keep(type)) segments.push({ type, style: type === 'dayPeriod' ? 'short' : /\p{Nd}/u.test(p.value) ? (p.value.length === 2 ? '2-digit' : 'numeric') : p.value.length > 4 ? 'long' : 'short' });
    else if (p.type === 'literal') segments.push({ type: 'literal', text: intlSpaces(p.value) });
  }
  return { segments: trim(segments, h12), h12 };
}

/** Removes a day period without a 12-hour clock, adds one for a 12-hour clock, and merges and trims literals. */
function trim(segments: SegmentSpec[], h12: boolean): SegmentSpec[] {
  const s = segments.filter((x) => x.type !== 'dayPeriod' || h12);
  if (h12 && s.some((x) => x.type === 'hour') && !s.some((x) => x.type === 'dayPeriod')) s.push({ type: 'literal', text: ' ' }, { type: 'dayPeriod', style: 'short' });
  const out: SegmentSpec[] = [];
  for (const x of s) {
    const prev = out[out.length - 1];
    if (x.type === 'literal' && prev?.type === 'literal') out[out.length - 1] = { type: 'literal', text: prev.text + x.text };
    else out.push(x);
  }
  while (out[0]?.type === 'literal') out.shift();
  while (out[out.length - 1]?.type === 'literal') out.pop();
  return out;
}

/** Values of the editable segments; `undefined` is an empty segment. `hour` is 0-23; `dayPeriod` is 0 (AM) or 1 (PM). */
export type SegmentValues = Partial<Record<SegmentType, number>>;

/** Minimum and maximum of a segment for the other values (day depends on year and month; 12-hour hours are 1-12). */
export function segmentLimits(type: SegmentType, v: SegmentValues, h12: boolean): readonly [number, number] {
  switch (type) {
    case 'year':
      return [1, 9999];
    case 'month':
      return [1, 12];
    case 'day':
      return [1, v.month === undefined ? 31 : daysInMonth(v.year ?? 2000, v.month)];
    case 'hour':
      return h12 ? [1, 12] : [0, 23];
    case 'dayPeriod':
      return [0, 1];
    default:
      return [0, 59];
  }
}

/** The displayed number of an hour segment (1-12 on a 12-hour clock). */
export const displayHour = (hour: number, h12: boolean): number => (h12 ? hour % 12 || 12 : hour);

/** Text of a segment value in the locale (digits, month names, day period). */
export function segmentText(locale: string, spec: Extract<SegmentSpec, { style: string }>, v: SegmentValues, h12: boolean): string {
  const value = v[spec.type];
  if (value === undefined) return '';
  if (spec.type === 'month' && spec.style !== 'numeric' && spec.style !== '2-digit') return partOf(dateFormat(locale, { calendar: 'gregory', month: spec.style, day: 'numeric' }), Date.UTC(2001, value - 1, 15) / 86_400_000, 'month');
  if (spec.type === 'dayPeriod') return dayPeriods(locale)[value] ?? '';
  const n = spec.type === 'hour' ? displayHour(value, h12) : value;
  return numberFormat(locale, spec.style === '2-digit' ? 2 : spec.type === 'year' ? 4 : 1).format(n);
}

/** AM and PM text of the locale. */
export function dayPeriods(locale: string): readonly [string, string] {
  const f = dateFormat(locale, { hour: 'numeric', hourCycle: 'h12' });
  return [partOf(f, 0.125, 'dayPeriod') || 'AM', partOf(f, 0.625, 'dayPeriod') || 'PM'];
}

/** Month names of the locale (index 0 is January) in a style. */
export function monthNames(locale: string, style: 'short' | 'long' | 'narrow'): string[] {
  const f = dateFormat(locale, { calendar: 'gregory', month: style, day: 'numeric' });
  return Array.from({ length: 12 }, (_, i) => partOf(f, Date.UTC(2001, i, 15) / 86_400_000, 'month'));
}

/**
 * Typing a digit into a numeric segment: appends to the pending entry and
 * returns the new value and whether the segment is complete (no further
 * digit could keep it within the maximum), the auto-advance rule.
 */
export function typeDigit(pending: string, digit: number, max: number, width: number): { value: number; text: string; done: boolean } {
  let text = pending + digit;
  if (Number(text) > max || text.length > width) text = String(digit);
  const value = Number(text);
  return { value, text, done: text.length >= width || value * 10 > max };
}
