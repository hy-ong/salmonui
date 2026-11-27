'use client';

// The segmented date and time field behind DateField and TimeField:
// one APG spinbutton per segment inside a `role="group"`, literals
// `aria-hidden`. Segments are focusable spans (no contentEditable): Up /
// Down step and wrap, PageUp / PageDown step further, Home / End go to the
// limits, digits type with auto-advance, Backspace / Delete clear, Left /
// Right (mirrored in RTL) and the separator move, letters pick month names
// and the day period by prefix, and paste parses a whole value. While any
// segment is empty the value is null. The typed digit buffer lives in a ref.

import { useId, useRef, useState, type ClipboardEvent, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react';
import {
  compare,
  dayPeriods,
  displayHour,
  fieldFormat,
  isInstant,
  isValidDate,
  isoDate,
  isoTime,
  localeDigits,
  monthNames,
  offsetAt,
  parseFieldText,
  plainDate,
  plainDateTime,
  plainTime,
  segmentLimits,
  segmentText,
  toEpoch,
  toPlainDateTime,
  toPlainTime,
  typeDigit,
  wallOf,
  type FieldFormat,
  type Granularity,
  type PlainDate,
  type PlainDateTime,
  type PlainTime,
  type SegmentSpec,
  type SegmentType,
  type SegmentValues,
} from '@salmonui/core/internal/dates/index';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { useLocale, useLocaleText } from '@salmonui/core/internal/locale';
import { formatText } from '../internal/text.js';
import { useHydrated } from '@salmonui/core/internal/hydrated';
import type { FieldBaseProps, FieldChangeDetails, FieldLocaleText } from './types.js';

export const FIELD_TEXT: FieldLocaleText = {
  yearPlaceholder: 'yyyy',
  monthPlaceholder: 'mm',
  dayPlaceholder: 'dd',
  hourPlaceholder: '––',
  minutePlaceholder: '––',
  secondPlaceholder: '––',
  dayPeriodPlaceholder: 'AM',
  yearLabel: 'year',
  monthLabel: 'month',
  dayLabel: 'day',
  hourLabel: 'hour',
  minuteLabel: 'minute',
  secondLabel: 'second',
  dayPeriodLabel: 'AM/PM',
  empty: 'Empty',
};

type Value = PlainDate | PlainDateTime | PlainTime;
type Edit = Extract<SegmentSpec, { style: string }>;

export interface SegmentedFieldProps extends FieldBaseProps {
  readonly kind: 'date' | 'time';
  readonly granularity: Granularity;
  readonly value?: unknown;
  readonly defaultValue?: unknown;
  readonly onValueChange?: (value: never, details: FieldChangeDetails) => void;
  readonly min?: unknown;
  readonly max?: unknown;
  readonly isDisabled?: ((value: never) => boolean) | undefined;
  readonly placeholderValue?: unknown;
  readonly className: string;
}

const TIME_TYPES = new Set<SegmentType>(['hour', 'minute', 'second', 'dayPeriod']);
const STEP: Partial<Record<SegmentType, number>> = { year: 10, month: 3, day: 7, hour: 2, minute: 15, second: 15 };

/** Segment values of a value (12-hour hours as 1-12 plus the day period). */
function segsOf(v: Value | null, h12: boolean): SegmentValues {
  if (!v) return {};
  const o = v as Partial<PlainDateTime>;
  const s: SegmentValues = { year: o.year, month: o.month, day: o.day, minute: o.minute, second: o.second } as SegmentValues;
  if (o.hour !== undefined) {
    s.hour = displayHour(o.hour, h12);
    s.dayPeriod = +(o.hour >= 12);
  }
  return s;
}

const hour24 = (s: SegmentValues, h12: boolean): number | undefined => (s.hour === undefined ? undefined : h12 ? (s.hour % 12) + (s.dayPeriod ? 12 : 0) : s.hour);

/** The value of complete segments (null while any segment is empty or the date does not exist). */
function valueOf(s: SegmentValues, field: FieldFormat, kind: 'date' | 'time', g: Granularity): Value | null {
  for (const seg of field.segments) if (seg.type !== 'literal' && s[seg.type] === undefined) return null;
  const h = hour24(s, field.h12) ?? 0;
  const time = plainTime(h, s.minute ?? 0, g === 'second' ? (s.second ?? 0) : 0);
  if (kind === 'time') return time;
  const y = s.year ?? 2000;
  const m = g === 'year' ? 1 : (s.month ?? 1);
  const d = g === 'year' || g === 'month' ? 1 : (s.day ?? 1);
  if (!isValidDate(y, m, d)) return null;
  return TIME_TYPES.has(g as SegmentType) ? plainDateTime({ year: y, month: m, day: d }, time) : plainDate(y, m, d);
}

function isoOf(v: Value | null, kind: 'date' | 'time', g: Granularity): string {
  if (!v) return '';
  const o = v as PlainDateTime;
  const t = kind === 'time' || TIME_TYPES.has(g as SegmentType) ? isoTime({ hour: o.hour, minute: o.minute, second: g === 'second' ? o.second : 0 }).slice(0, g === 'second' ? 8 : 5) : '';
  if (kind === 'time') return t;
  const date = isoDate(o).slice(0, g === 'year' ? 4 : g === 'month' ? 7 : 10);
  return t ? `${date}T${t}` : date;
}

const pad = (n: number): string => String(Math.abs(n)).padStart(2, '0');

export function SegmentedField(props: SegmentedFieldProps) {
  const {
    kind,
    granularity,
    value: valueProp,
    defaultValue,
    onValueChange,
    min: minProp,
    max: maxProp,
    isDisabled,
    placeholderValue,
    label,
    description,
    errorMessage,
    format,
    hourCycle,
    locale: ownLocale,
    timeZone,
    inputFormats,
    parse,
    strict = false,
    disabled = false,
    readOnly = false,
    required = false,
    invalid: invalidProp = false,
    autoFocus,
    name,
    form,
    onFocus,
    onBlur,
    localeText: ownText,
    className,
    style,
    ref,
    ...rest
  } = props;
  const locale = useLocale(ownLocale) ?? 'en-US';
  const localeText = useLocaleText('dateField', ownText);
  const id = useId();
  const hydrated = useHydrated();
  const zoneReady = timeZone !== undefined || hydrated;
  const field = fieldFormat(locale, granularity, { format, hourCycle, time: kind === 'time' });
  const text = (key: keyof FieldLocaleText): string => formatText(localeText?.[key] ?? FIELD_TEXT[key], undefined, locale);
  const segName = (t: SegmentType): string => {
    const own = text(`${t}Label`);
    if (localeText?.[`${t}Label`] !== undefined || t === 'dayPeriod') return own;
    try {
      return new Intl.DisplayNames(locale, { type: 'dateTimeField' }).of(t) ?? own;
    } catch {
      return own;
    }
  };

  const normalize = (input: unknown): Value | null => {
    if (input === null || input === undefined || input === '' || (!zoneReady && isInstant(input))) return null;
    if (kind === 'time') return toPlainTime(input, timeZone);
    const dt = toPlainDateTime(input, timeZone);
    return dt && valueOf(segsOf(dt, false), fieldFormat('en-US', granularity, { hourCycle: 'h23' }), 'date', granularity);
  };

  const [raw, setRaw] = useControllableState<unknown>(valueProp, () => defaultValue ?? null, undefined, 'field value');
  const value = normalize(raw);
  const valueIso = isoOf(value, kind, granularity);
  const min = normalize(minProp);
  const max = normalize(maxProp);

  // Typed segments and the value they were synced with.
  const [state, setState] = useState(() => ({ segs: segsOf(value, field.h12), key: valueIso, valid: valueIso, h12: field.h12 }));
  let segs = state.segs;
  if (state.key !== valueIso || state.h12 !== field.h12) {
    segs = segsOf(value, field.h12);
    setState({ segs, key: valueIso, valid: valueIso || state.valid, h12: field.h12 });
  }

  const current = valueOf(segs, field, kind, granularity);
  const cmp = (a: Value, b: Value): number => (kind === 'time' ? compare({ year: 2000, month: 1, day: 1, ...(a as PlainTime) }, { year: 2000, month: 1, day: 1, ...(b as PlainTime) }) : compare(a as PlainDate, b as PlainDate));
  const outOfRange = (v: Value): boolean => (min !== null && cmp(v, min) < 0) || (max !== null && cmp(v, max) > 0);
  const rejected = (v: Value): boolean => outOfRange(v) || ((isDisabled as ((v: Value) => boolean) | undefined)?.(v) ?? false);
  const invalid = invalidProp || (current !== null && rejected(current));

  const pending = useRef({ type: '' as SegmentType | '', text: '' });
  const groupRef = useRef<HTMLDivElement | null>(null);

  const details = (source: FieldChangeDetails['source'], reason: FieldChangeDetails['reason'], v: Value | null): FieldChangeDetails => {
    const iso = isoOf(v, kind, granularity);
    if (v && timeZone && kind === 'date' && 'hour' in v) {
      const epoch = toEpoch(v as PlainDateTime, timeZone);
      if (epoch !== null) {
        const off = offsetAt(epoch, timeZone) ?? 0;
        return Object.freeze({ source, reason, iso: `${isoOf(wallOf(epoch, timeZone), kind, granularity)}${off < 0 ? '-' : '+'}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`, epochMilliseconds: epoch });
      }
    }
    return Object.freeze({ source, reason, iso });
  };

  const commit = (next: SegmentValues, source: FieldChangeDetails['source'], reason: FieldChangeDetails['reason']): void => {
    const v = valueOf(next, field, kind, granularity);
    const iso = isoOf(v, kind, granularity);
    setState({ segs: next, key: iso, valid: v && !rejected(v) ? iso : state.valid, h12: field.h12 });
    if (iso !== state.key) {
      setRaw(v);
      (onValueChange as ((v: Value | null, d: FieldChangeDetails) => void) | undefined)?.(v, details(source, reason, v));
    }
  };

  const editable = field.segments.filter((s): s is Edit => s.type !== 'literal');
  const focusSegment = (index: number): void => {
    const el = groupRef.current?.querySelectorAll<HTMLElement>('[role="spinbutton"]')[index];
    el?.focus();
  };

  /** Seed of an empty segment: `placeholderValue`, else now (in an event handler, never in render). */
  const seed = (t: SegmentType): number => {
    const p = placeholderValue === undefined ? null : kind === 'time' ? toPlainTime(placeholderValue, timeZone) : toPlainDateTime(placeholderValue, timeZone);
    const base = segsOf((p as Value | null) ?? (wallOf(Date.now(), timeZone) as Value | null), field.h12);
    if (p === null && (t === 'minute' || t === 'second')) return 0;
    return base[t] ?? segmentLimits(t, segs, field.h12)[0];
  };

  const onSegmentKey = (event: KeyboardEvent<HTMLElement>, spec: Edit, index: number): void => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const t = spec.type;
    const [lo, hi] = segmentLimits(t, segs, field.h12);
    const set = (v: number | undefined, reason: FieldChangeDetails['reason'] = 'input'): void => {
      const next = { ...segs, [t]: v };
      // Keep the day valid when the month or year changes.
      if ((t === 'month' || t === 'year') && next.day !== undefined && next.month !== undefined) next.day = Math.min(next.day, segmentLimits('day', next, field.h12)[1]);
      commit(next, 'keyboard', reason);
    };
    const rtl = groupRef.current ? getComputedStyle(groupRef.current).direction === 'rtl' : false;
    const step = (d: number): void => {
      const cur = segs[t];
      if (cur === undefined) return set(seed(t));
      const span = hi - lo + 1;
      set(((((cur - lo + d) % span) + span) % span) + lo);
    };
    const key = event.key;
    let handled = true;
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const dir = (key === 'ArrowRight') !== rtl ? 1 : -1;
      if (index + dir >= 0 && index + dir < editable.length) focusSegment(index + dir);
    } else if (readOnly || disabled) handled = key === 'ArrowUp' || key === 'ArrowDown';
    else if (key === 'ArrowUp') step(1);
    else if (key === 'ArrowDown') step(-1);
    else if (key === 'PageUp') step(STEP[t] ?? 1);
    else if (key === 'PageDown') step(-(STEP[t] ?? 1));
    else if (key === 'Home') set(lo);
    else if (key === 'End') set(hi);
    else if (key === 'Backspace' || key === 'Delete') {
      const p = pending.current;
      if (p.type === t && p.text.length > 1) {
        p.text = p.text.slice(0, -1);
        set(Number(p.text), 'clear');
      } else {
        pending.current = { type: '', text: '' };
        set(undefined, 'clear');
      }
    } else {
      const digit = localeDigits(locale).get(key);
      if (digit !== undefined && t !== 'dayPeriod') {
        const p = pending.current.type === t ? pending.current.text : '';
        const width = t === 'year' ? 4 : 2;
        const r = typeDigit(p, digit, hi, width);
        pending.current = { type: t, text: r.text };
        if (r.done) pending.current = { type: '', text: '' };
        set(r.value === 0 && lo > 0 && !r.done ? undefined : r.value);
        if (r.done && r.value >= lo && index + 1 < editable.length) focusSegment(index + 1);
      } else if (key.length === 1 && /\p{L}/u.test(key) && (t === 'dayPeriod' || t === 'month')) {
        const k = key.toLocaleLowerCase(locale);
        if (t === 'dayPeriod') {
          const [am, pm] = dayPeriods(locale).map((x) => x.toLocaleLowerCase(locale));
          if (k === 'a' || am?.startsWith(k)) set(0);
          else if (k === 'p' || pm?.startsWith(k)) set(1);
        } else {
          const p = (pending.current.type === t ? pending.current.text : '') + k;
          const names = monthNames(locale, 'long').map((x) => x.toLocaleLowerCase(locale));
          let i = names.findIndex((n) => n.startsWith(p));
          pending.current = { type: t, text: i >= 0 ? p : k };
          if (i < 0) i = names.findIndex((n) => n.startsWith(k));
          if (i >= 0) set(i + 1);
        }
      } else if (key.length === 1 && index + 1 < editable.length) {
        // The separator after this segment (or any common one) moves on.
        const after = field.segments[field.segments.indexOf(spec) + 1];
        const sep = after?.type === 'literal' ? after.text.trim() : '';
        if ((sep && sep.includes(key)) || '/-.:, '.includes(key)) focusSegment(index + 1);
        else handled = false;
      } else handled = false;
    }
    if (handled && key !== 'Tab') event.preventDefault();
  };

  const onPaste = (event: ClipboardEvent<HTMLDivElement>): void => {
    if (readOnly || disabled) return;
    event.preventDefault();
    const parsed = parseFieldText(event.clipboardData.getData('text'), { locale, field, inputFormats, parse });
    if (!parsed) return;
    const next: SegmentValues = { ...parsed };
    if (parsed.hour !== undefined) {
      next.hour = displayHour(parsed.hour, field.h12);
      next.dayPeriod = +(parsed.hour >= 12);
    }
    commit(next, 'keyboard', 'paste');
  };

  // Group focus and blur fire once; `strict` applies on blur.
  const onGroupBlur = (event: FocusEvent<HTMLDivElement>): void => {
    if (groupRef.current?.contains(event.relatedTarget as Node | null)) return;
    pending.current = { type: '', text: '' };
    onBlur?.(event);
    if (!strict || readOnly || disabled) return;
    const valid = state.valid;
    if (current && outOfRange(current)) {
      const bound = min !== null && cmp(current, min) < 0 ? min : (max as Value);
      return commit(segsOf(bound, field.h12), 'api', 'blur');
    }
    const complete = editable.every((s) => segs[s.type] !== undefined);
    const bad = (complete && !current) || (current && rejected(current)) || (!complete && editable.some((s) => segs[s.type] !== undefined));
    if (bad) {
      const back = normalize(valid || null);
      commit(segsOf(back, field.h12), 'api', 'blur');
    }
  };

  const labelId = `${id}l`;
  const descId = `${id}d`;
  const errId = `${id}e`;
  const ariaDescribedBy = [description ? descId : '', invalid && errorMessage ? errId : '', rest['aria-describedby'] ?? ''].filter(Boolean).join(' ') || undefined;
  const deferred = !zoneReady && isInstant(raw);
  let editIndex = -1;
  const parts: ReactNode[] = field.segments.map((spec, i) => {
    if (spec.type === 'literal') {
      return (
        <span key={i} className="salmon-date-field__literal" aria-hidden="true">
          {spec.text}
        </span>
      );
    }
    const index = ++editIndex;
    const t = spec.type;
    const v = segs[t];
    const [lo, hi] = segmentLimits(t, segs, field.h12);
    const shown = v === undefined ? '' : segmentText(locale, spec, segs, field.h12);
    const numeric = t !== 'dayPeriod' && !(t === 'month' && (spec.style === 'short' || spec.style === 'long' || spec.style === 'narrow'));
    return (
      <span
        key={i}
        role="spinbutton"
        className="salmon-date-field__segment"
        data-type={t}
        data-placeholder={v === undefined || undefined}
        tabIndex={disabled ? -1 : 0}
        inputMode={numeric ? 'numeric' : undefined}
        aria-label={segName(t)}
        aria-valuenow={v}
        aria-valuemin={lo}
        aria-valuemax={hi}
        aria-valuetext={v === undefined ? text('empty') : shown}
        aria-disabled={disabled || undefined}
        aria-readonly={readOnly || undefined}
        aria-invalid={invalid || undefined}
        aria-required={required || undefined}
        autoFocus={(autoFocus && index === 0) || undefined}
        onKeyDown={(e) => onSegmentKey(e, spec, index)}
        onFocus={() => {
          if (pending.current.type !== t) pending.current = { type: '', text: '' };
        }}
      >
        {deferred ? '' : v === undefined ? text(`${t}Placeholder`) : shown}
      </span>
    );
  });

  return (
    <div className={className} style={style} data-disabled={disabled || undefined} data-invalid={invalid || undefined} data-readonly={readOnly || undefined}>
      {label ? (
        <span id={labelId} className="salmon-date-field__label">
          {label}
        </span>
      ) : null}
      <div
        {...rest}
        ref={(el) => {
          groupRef.current = el;
          if (typeof ref === 'function') return ref(el);
          if (ref) ref.current = el;
          return undefined;
        }}
        role="group"
        className="salmon-date-field__group"
        aria-labelledby={label ? [labelId, rest['aria-labelledby']].filter(Boolean).join(' ') : rest['aria-labelledby']}
        aria-describedby={ariaDescribedBy}
        aria-invalid={invalid || undefined}
        aria-disabled={disabled || undefined}
        data-salmon-deferred={deferred || undefined}
        onPaste={onPaste}
        onFocus={(e) => {
          if (!groupRef.current?.contains(e.relatedTarget as Node | null)) onFocus?.(e);
        }}
        onBlur={onGroupBlur}
      >
        {parts}
      </div>
      {description ? (
        <span id={descId} className="salmon-date-field__description">
          {description}
        </span>
      ) : null}
      {invalid && errorMessage ? (
        <span id={errId} className="salmon-date-field__error">
          {errorMessage}
        </span>
      ) : null}
      {name ? <input className="salmon-date-field__input" name={name} form={form} value={isoOf(current, kind, granularity)} required={required} disabled={disabled} readOnly tabIndex={-1} aria-hidden="true" /> : null}
    </div>
  );
}

