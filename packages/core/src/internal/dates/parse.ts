// Paste and typed-text parsing: ISO 8601 always, then the field's own segment
// order (digit groups in the locale's order, month names, day period), then
// `inputFormats` patterns in the pattern grammar, then the `parse`
// callback. Locale digits are accepted next to Latin digits.

import { latinDigits, localeDigits, tokenizePattern } from './format.js';
import { isValidDate, isValidTime, parseIso, type PlainDateLike, type PlainTimeLike } from './plain.js';
import { dayPeriods, monthNames, PATTERN_FIELDS, type FieldFormat, type SegmentType, type SegmentValues } from './segments.js';

/** Context of the `parse` callback. */
export interface ParseContext {
  readonly locale: string;
}

/** A `parse` callback: text to fields, or null when it cannot parse. */
export type ParseFn = (text: string, ctx: ParseContext) => (Partial<PlainDateLike> & Partial<PlainTimeLike>) | null | undefined;

export interface ParseOptions {
  readonly locale: string;
  readonly field: FieldFormat;
  readonly inputFormats?: readonly string[] | undefined;
  readonly parse?: ParseFn | undefined;
}

const editable = (field: FieldFormat): SegmentType[] => field.segments.flatMap((s) => (s.type === 'literal' ? [] : [s.type]));

/** Keeps the values of the field's segments when all of them are present and valid. */
function complete(v: SegmentValues, field: FieldFormat): SegmentValues | null {
  const types = editable(field);
  const out: SegmentValues = {};
  for (const t of types) {
    const x = t === 'dayPeriod' ? (v.hour === undefined ? undefined : +(v.hour >= 12)) : t === 'month' || t === 'day' ? (v[t] ?? (types.includes('day') ? undefined : 1)) : v[t];
    if (x === undefined) return null;
    out[t] = x;
  }
  if (out.year !== undefined && !isValidDate(out.year, out.month ?? 1, out.day ?? 1)) return null;
  if (out.hour !== undefined && !isValidTime(out.hour, out.minute ?? 0, out.second ?? 0)) return null;
  return out;
}

const fromFields = (f: Partial<PlainDateLike> & Partial<PlainTimeLike>): SegmentValues => ({ year: f.year, month: f.month, day: f.day, hour: f.hour, minute: f.minute, second: f.second }) as SegmentValues;

/** Month (1-12) of a full or abbreviated month name (a prefix of 3+ letters), else undefined. */
function monthOf(locale: string, word: string): number | undefined {
  const w = word.toLocaleLowerCase().replace(/\.$/, '');
  for (const style of ['long', 'short'] as const) {
    const names = monthNames(locale, style).map((n) => n.toLocaleLowerCase().replace(/\.$/, ''));
    const i = names.findIndex((n) => n === w || (w.length >= 3 && n.startsWith(w)));
    if (i >= 0) return i + 1;
  }
  return undefined;
}

/** Applies a 12-hour day period found in the text (`pm`, `p.m.`, the locale's text). */
function period(text: string, locale: string, v: SegmentValues): SegmentValues {
  if (v.hour === undefined) return v;
  const t = text.toLocaleLowerCase();
  const [am, pm] = dayPeriods(locale).map((p) => t.includes(p.toLocaleLowerCase()));
  const isPm = pm || /\bp\.?\s*m/.test(t);
  if (!isPm && !am && !/\ba\.?\s*m/.test(t)) return v;
  return { ...v, hour: v.hour < 1 || v.hour > 12 ? -1 : (v.hour % 12) + (isPm ? 12 : 0) };
}

/** Digit groups and month names of the text in the field's segment order. */
function byFieldOrder(text: string, locale: string, field: FieldFormat): SegmentValues {
  const types = editable(field).filter((t) => t !== 'dayPeriod');
  const v: SegmentValues = {};
  let i = 0;
  for (const tok of text.match(/\d+|[^\d\s.,/:\-–]+\.?/gu) ?? []) {
    if (/^\d/.test(tok)) {
      const t = types[i++];
      if (t) v[t] = Number(tok) + (t === 'year' && tok.length <= 2 ? 2000 : 0);
    } else if (v.month === undefined && types.includes('month')) {
      const m = monthOf(locale, tok);
      // The month's digit slot is taken by the name.
      if (m) (v.month = m), types.indexOf('month') >= i && types.splice(types.indexOf('month'), 1);
    }
  }
  return period(text, locale, v);
}

/** Text matched against a pattern of the pattern grammar (`'dd.MM.yyyy'`, `'d MMM yyyy'`, `'hh:mm a'`). */
function byPattern(text: string, locale: string, pattern: string): SegmentValues | null {
  const fields: string[] = [];
  let re = '';
  for (const tok of tokenizePattern(pattern)) {
    if ('literal' in tok) re += `\\s*${tok.literal.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`;
    else {
      const f = tok.field;
      const c = f[0] as string;
      const name = (c === 'M' || c === 'L') && f.length > 2;
      if (c === 'E') re += '\\S+';
      else (fields.push(name ? 'N' : c), (re += name || c === 'a' ? '(\\S+?)' : `(\\d{1,${c === 'y' ? (f.length === 2 ? 2 : 4) : 2}})`));
    }
  }
  const m = new RegExp(`^\\s*${re}\\s*$`, 'iu').exec(text);
  if (!m) return null;
  const v: SegmentValues = {};
  let p = '';
  fields.forEach((c, i) => {
    const s = m[i + 1] as string;
    if (c === 'a') p = s;
    else if (c === 'N') {
      const month = monthOf(locale, s);
      if (month) v.month = month;
    } else {
      const t = PATTERN_FIELDS[c];
      if (t) v[t] = Number(s) + (c === 'y' && s.length === 2 ? 2000 : 0);
    }
  });
  return p ? period(p, locale, v) : v;
}

/**
 * Parses pasted or typed text into the values of a field's segments, or
 * null when no rule produces a complete, valid value.
 */
export function parseFieldText(raw: string, options: ParseOptions): SegmentValues | null {
  const { locale, field } = options;
  const text = latinDigits(raw.trim(), localeDigits(locale));
  if (!text) return null;
  const iso = parseIso(text);
  if (iso) {
    const v = complete({ ...(iso.date ? fromFields(iso.date) : {}), ...(iso.time ? { hour: iso.time.hour, minute: iso.time.minute, second: iso.time.second } : {}) }, field);
    if (v) return v;
  }
  const own = complete(byFieldOrder(text, locale, field), field);
  if (own) return own;
  for (const p of options.inputFormats ?? []) {
    const v = byPattern(text, locale, p);
    const c = v && complete(v, field);
    if (c) return c;
  }
  const custom = options.parse?.(raw, { locale });
  return custom ? complete(fromFields(custom), field) : null;
}
