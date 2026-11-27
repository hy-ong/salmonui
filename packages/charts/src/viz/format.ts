// Formatting seam:
// `#viz` takes formatters as injected functions. The family subpaths build
// them from `@salmonui/data-grid/engine` `format.ts` (the Data Grid
// `column.format` presets); the defaults here are plain `Intl`
// formatters for code that has no format prop.

import { stepPrecision } from './ticks.js';
import { timeLabelOptions, type TimeUnit } from './time-ticks.js';

export type ValueFormatter = (value: number) => string;

// Pure memo of Intl instances keyed by options (not render state).
const numberCache = new Map<string, Intl.NumberFormat>();
const dateCache = new Map<string, Intl.DateTimeFormat>();

function memo<T>(cache: Map<string, T>, key: string, create: () => T): T {
  let v = cache.get(key);
  if (!v) {
    if (cache.size > 64) cache.clear();
    v = create();
    cache.set(key, v);
  }
  return v;
}

/** Number labels with the decimals of the tick step (0.25 -> 2 decimals). */
export function numberFormatter(locale: string | undefined, step = 1, options?: Intl.NumberFormatOptions): ValueFormatter {
  const digits = Math.min(20, stepPrecision(step));
  const opts: Intl.NumberFormatOptions = options ?? { minimumFractionDigits: digits, maximumFractionDigits: digits };
  const fmt = memo(numberCache, `${locale ?? ''}|${JSON.stringify(opts)}`, () => new Intl.NumberFormat(locale, opts));
  return (v) => (Number.isFinite(v) ? fmt.format(v) : '');
}

/** Compact number labels (1.2K, 3.4M) for dense axes and sparkline summaries. */
export function compactFormatter(locale: string | undefined): ValueFormatter {
  const fmt = memo(numberCache, `${locale ?? ''}|compact`, () => new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }));
  return (v) => (Number.isFinite(v) ? fmt.format(v) : '');
}

/** Date labels for ticks of `unit` in `timeZone` (UTC when omitted, the SSR rule). */
export function timeFormatter(locale: string | undefined, unit: TimeUnit, timeZone?: string, options?: Intl.DateTimeFormatOptions): ValueFormatter {
  const opts: Intl.DateTimeFormatOptions = { ...(options ?? timeLabelOptions(unit)), timeZone: timeZone ?? 'UTC' };
  const fmt = memo(dateCache, `${locale ?? ''}|${JSON.stringify(opts)}`, () => new Intl.DateTimeFormat(locale, opts));
  return (v) => (Number.isFinite(v) ? fmt.format(v) : '');
}

/** Full date and time for tooltips and the accessible table. */
export function dateTimeFormatter(locale: string | undefined, timeZone?: string): ValueFormatter {
  const opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short', timeZone: timeZone ?? 'UTC' };
  const fmt = memo(dateCache, `${locale ?? ''}|${JSON.stringify(opts)}`, () => new Intl.DateTimeFormat(locale, opts));
  return (v) => (Number.isFinite(v) ? fmt.format(v) : '');
}
