// Chart value formatting: number presets (`'n2'`, `'c0'`, `'p1'`,
// the Data Grid `column.format` preset letters), `{value}` templates,
// `Intl.NumberFormatOptions` and `Intl.DateTimeFormatOptions` (or date
// skeleton strings such as `'yMMMd'`). Formatters are built once per
// option set and locale.

import { numberFormatter, timeFormatter, type TimeUnit, type ValueFormatter } from '#viz';
/** Same shape as `ChartFormat` in chart/types.ts (shared by chart and range-selector). */
type ChartFormat = string | Intl.NumberFormatOptions | Intl.DateTimeFormatOptions;

const PRESET = /^([NCP])(\d{0,2})$/i;

const isDateOptions = (o: object): boolean =>
  ['year', 'month', 'day', 'hour', 'minute', 'second', 'weekday', 'dateStyle', 'timeStyle', 'era', 'fractionalSecondDigits'].some((k) => k in o);

/** `'yMMMd'`-style skeleton to Intl options (subset used by axes and tooltips). */
export function skeletonOptions(skeleton: string): Intl.DateTimeFormatOptions {
  const o: Record<string, string> = {};
  const runs = skeleton.match(/(.)\1*/g) ?? [];
  for (const run of runs) {
    const c = run[0];
    const n = run.length;
    if (c === 'y') o.year = n === 2 ? '2-digit' : 'numeric';
    else if (c === 'M' || c === 'L') o.month = n >= 4 ? 'long' : n === 3 ? 'short' : n === 2 ? '2-digit' : 'numeric';
    else if (c === 'd') o.day = n === 2 ? '2-digit' : 'numeric';
    else if (c === 'E') o.weekday = n >= 4 ? 'long' : 'short';
    else if (c === 'h' || c === 'H') {
      o.hour = n === 2 ? '2-digit' : 'numeric';
      o.hourCycle = c === 'H' ? 'h23' : 'h12';
    } else if (c === 'm') o.minute = '2-digit';
    else if (c === 's') o.second = '2-digit';
  }
  return o as Intl.DateTimeFormatOptions;
}

export interface FormatContext {
  readonly locale?: string | undefined;
  readonly timeZone?: string | undefined;
  /** Default currency for `'c'` presets. */
  readonly currency?: string | undefined;
}

/**
 * Number formatter for a chart format; `step` picks default decimals. `step`
 * 0 formats data values (labels, tooltips, the table): up to two decimals
 * without trailing zeros ("12", "12.5", "12.35").
 */
export function makeNumberFormat(format: ChartFormat | undefined, ctx: FormatContext, step = 1): ValueFormatter {
  const plain = numberFormatter(ctx.locale, step, step ? undefined : { maximumFractionDigits: 2 });
  if (format === undefined) return plain;
  if (typeof format === 'string') {
    const m = PRESET.exec(format);
    if (m) {
      const kind = (m[1] as string).toLowerCase();
      const digits = m[2] ? Number(m[2]) : kind === 'p' ? 0 : 2;
      const opts: Intl.NumberFormatOptions =
        kind === 'c'
          ? { style: 'currency', currency: ctx.currency ?? 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits }
          : kind === 'p'
            ? { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }
            : { minimumFractionDigits: digits, maximumFractionDigits: digits };
      return numberFormatter(ctx.locale, step, opts);
    }
    if (format.includes('{value}')) return (v) => format.replaceAll('{value}', plain(v));
    return plain;
  }
  if (isDateOptions(format)) return timeFormatter(ctx.locale, 'day', ctx.timeZone, format as Intl.DateTimeFormatOptions);
  return numberFormatter(ctx.locale, step, format as Intl.NumberFormatOptions);
}

/** Date formatter for a time axis tick unit or an explicit format. */
export function makeTimeFormat(format: ChartFormat | undefined, ctx: FormatContext, unit: TimeUnit): ValueFormatter {
  if (format === undefined) return timeFormatter(ctx.locale, unit, ctx.timeZone);
  if (typeof format === 'string') {
    if (/^[GyMLdEhHms]+$/.test(format)) return timeFormatter(ctx.locale, unit, ctx.timeZone, skeletonOptions(format));
    if (['short', 'medium', 'long', 'full'].includes(format)) return timeFormatter(ctx.locale, unit, ctx.timeZone, { dateStyle: format as 'short' });
    return timeFormatter(ctx.locale, unit, ctx.timeZone);
  }
  return timeFormatter(ctx.locale, unit, ctx.timeZone, format as Intl.DateTimeFormatOptions);
}
