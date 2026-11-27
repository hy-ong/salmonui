// `@salmonui/core/format`: number and date formatting on the platform `Intl`
// API (column formats, presets, skeletons, patterns), locale messages, text
// direction and locale-aware number parsing. No React, no DOM.

/** Development warning sink: `(code, message)`. */
export type Warn = (code: string, message: string) => void;

/** `selection`: the row selection checkbox column; `rowNumber`: the 1-based row number column (no value, rendered from the row position). */
export type ColumnType = 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'selection' | 'rowNumber';

/** Number presets (`N2`, `C`, `P1`), custom number patterns (`#,##0.00`), date skeletons (`yMMMd`, `short`), or custom date patterns (`dd/MM/yyyy HH:mm`). */
export interface FormatOptions {
  readonly type?: 'number' | 'date' | 'datetime';
  /** Preset or custom pattern. */
  readonly format?: string;
  /** Date skeleton such as `yMd`, `yMMMEd`, `Hm`, or a style: `short` | `medium` | `long` | `full`. */
  readonly skeleton?: string;
  /** ISO 4217 code for currency formats. Defaults to the grid `currency` option. */
  readonly currency?: string;
  readonly minimumFractionDigits?: number;
  readonly maximumFractionDigits?: number;
  readonly useGrouping?: boolean;
  /** IANA time zone. Defaults to the grid `timeZone` option. Set it for deterministic SSR output. */
  readonly timeZone?: string;
}

/** Normalized `column.format`. */
export type FormatDescriptor =
  | { readonly kind: 'number'; readonly style: 'decimal' | 'currency' | 'percent'; readonly pattern: string | null; readonly options: FormatOptions }
  | { readonly kind: 'date'; readonly skeleton: string | null; readonly pattern: string | null; readonly options: FormatOptions };


/**
 * Value formatting backed by the platform `Intl` API. Formatter instances are
 * created once per (locale, options) pair and cached per engine.
 */
export interface FormatEnvironment {
  getLocale(): string;
  readonly timeZone: string | undefined;
  readonly currency: string;
  readonly cache: Map<string, Intl.NumberFormat | Intl.DateTimeFormat | Intl.Collator>;
  readonly warn: Warn;
}

const NUMBER_PRESET = /^([NCP])(\d{0,2})$/i;
const DATE_STYLES = new Set(['short', 'medium', 'long', 'full']);
const SKELETON = /^[GyMLdEhHms]+$/;

function cached<T extends Intl.NumberFormat | Intl.DateTimeFormat | Intl.Collator>(
  env: FormatEnvironment,
  key: string,
  create: () => T,
): T {
  let value = env.cache.get(key) as T | undefined;
  if (!value) {
    value = create();
    env.cache.set(key, value);
  }
  return value;
}

/** Normalizes `column.format` for a column of the given type. Returns null for no format. */
export function describeFormat(
  format: string | FormatOptions | undefined,
  type: ColumnType,
  warn: Warn,
  columnId: string,
): FormatDescriptor | null {
  if (format === undefined || format === '') return null;
  const options: FormatOptions = typeof format === 'string' ? {} : format;
  const text = typeof format === 'string' ? format : (format.format ?? null);
  const kind: 'number' | 'date' =
    options.type === 'date' || options.type === 'datetime'
      ? 'date'
      : options.type === 'number'
        ? 'number'
        : type === 'date' || type === 'datetime'
          ? 'date'
          : 'number';

  if (kind === 'date') {
    const skeleton = options.skeleton ?? (text !== null && (DATE_STYLES.has(text) || SKELETON.test(text)) ? text : null);
    const pattern = skeleton === null ? text : null;
    return Object.freeze({ kind, skeleton, pattern, options });
  }

  if (text === null) return Object.freeze({ kind, style: 'decimal', pattern: null, options });
  const preset = NUMBER_PRESET.exec(text);
  if (preset) {
    const letter = (preset[1] ?? 'N').toUpperCase();
    const style = letter === 'C' ? 'currency' : letter === 'P' ? 'percent' : 'decimal';
    const digits = preset[2] ? Number(preset[2]) : undefined;
    const merged: FormatOptions =
      digits === undefined ? options : { ...options, minimumFractionDigits: digits, maximumFractionDigits: digits };
    return Object.freeze({ kind, style, pattern: null, options: merged });
  }
  if (/[#0]/.test(text)) return Object.freeze({ kind, style: 'decimal', pattern: text, options });
  warn('format-unknown', `Column "${columnId}": unrecognized number format "${text}"; values render unformatted.`);
  return null;
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

interface NumberPattern {
  prefix: string;
  suffix: string;
  percent: boolean;
  /** False for a literal-only section (e.g. a zero section `'nil'`): no number is written. */
  digits: boolean;
  options: Intl.NumberFormatOptions;
}

/**
 * Sections of a custom number pattern: `positive;negative;zero`.
 * The negative section formats the absolute value with its own literals (no
 * minus sign is added, e.g. `#,##0;(#,##0)`); an empty or missing section
 * falls back to the positive one (with the minus sign for negatives).
 */
interface NumberSections {
  positive: NumberPattern;
  negative: NumberPattern | null;
  zero: NumberPattern | null;
}

function splitSections(pattern: string): string[] {
  // `;` inside quoted literals does not separate sections.
  const out: string[] = [];
  let current = '';
  let quoted = false;
  for (const ch of pattern) {
    if (ch === "'") quoted = !quoted;
    if (ch === ';' && !quoted) {
      out.push(current);
      current = '';
    } else current += ch;
  }
  out.push(current);
  return out;
}

function parseNumberSections(pattern: string): NumberSections {
  const [positive = pattern, negative, zero] = splitSections(pattern);
  return {
    positive: parseNumberPattern(positive),
    negative: negative ? parseNumberPattern(negative) : null,
    zero: zero ? parseNumberPattern(zero) : null,
  };
}

/** Stands in for an unquoted `$` (the currency symbol) in a parsed literal. */
const CURRENCY_MARK = '\uE000';

/**
 * Literal text of a number pattern prefix or suffix: quotes are removed (`''`
 * is an escaped quote) and an unquoted `$` becomes {@link CURRENCY_MARK}.
 */
function patternLiteral(text: string): string {
  let out = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? '';
    if (ch === "'") {
      if (text[i + 1] === "'") {
        out += "'";
        i++;
      } else quoted = !quoted;
    } else out += ch === '$' && !quoted ? CURRENCY_MARK : ch;
  }
  return out;
}

function parseNumberPattern(section: string): NumberPattern {
  const first = section.search(/[#0,.]/);
  let last = -1;
  for (let i = section.length - 1; i >= 0; i--) {
    if ('#0'.includes(section[i] ?? '')) {
      last = i;
      break;
    }
  }
  const prefix = first < 0 ? section : section.slice(0, first);
  const body = first < 0 ? '' : section.slice(first, last + 1);
  const suffix = last < 0 ? '' : section.slice(last + 1);
  const [intPart = '', fracPart = ''] = body.split('.');
  const minInt = (intPart.match(/0/g) ?? []).length;
  const minFrac = (fracPart.match(/0/g) ?? []).length;
  const maxFrac = minFrac + (fracPart.match(/#/g) ?? []).length;
  return {
    prefix: patternLiteral(prefix),
    suffix: patternLiteral(suffix),
    percent: prefix.includes('%') || suffix.includes('%'),
    digits: first >= 0,
    options: {
      useGrouping: intPart.includes(','),
      minimumIntegerDigits: Math.min(Math.max(minInt, 1), 21),
      minimumFractionDigits: minFrac,
      maximumFractionDigits: Math.max(minFrac, maxFrac),
    },
  };
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isNaN(value) ? null : value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function numberFormatter(descriptor: Extract<FormatDescriptor, { kind: 'number' }>, env: FormatEnvironment): (value: unknown) => string {
  const o = descriptor.options;
  if (descriptor.pattern !== null) {
    const sections = parseNumberSections(descriptor.pattern);
    const section = (p: NumberPattern): ((n: number) => string) => {
      const intlOptions: Intl.NumberFormatOptions = { ...p.options };
      if (o.useGrouping !== undefined) intlOptions.useGrouping = o.useGrouping;
      const optionsKey = JSON.stringify(intlOptions);
      const withCurrency = (p.prefix + p.suffix).includes(CURRENCY_MARK);
      let lastLocale = '';
      let fmt: Intl.NumberFormat | null = null;
      let prefix = p.prefix;
      let suffix = p.suffix;
      return (n) => {
        const locale = env.getLocale();
        if (fmt === null || locale !== lastLocale) {
          lastLocale = locale;
          fmt = cached(env, `n|${locale}|${optionsKey}`, () => new Intl.NumberFormat(locale, intlOptions));
          if (withCurrency) {
            // An unquoted `$` is the currency symbol of `currency` in the grid locale.
            const currency = o.currency ?? env.currency;
            const symbolFormat = cached(env, `n|${locale}|currency|${currency}`, () => new Intl.NumberFormat(locale, { style: 'currency', currency }));
            const symbol = symbolFormat.formatToParts(0).find((part) => part.type === 'currency')?.value ?? currency;
            prefix = p.prefix.split(CURRENCY_MARK).join(symbol);
            suffix = p.suffix.split(CURRENCY_MARK).join(symbol);
          }
        }
        return p.digits ? prefix + fmt.format(p.percent ? n * 100 : n) + suffix : prefix;
      };
    };
    const positive = section(sections.positive);
    const negative = sections.negative ? section(sections.negative) : null;
    const zero = sections.zero ? section(sections.zero) : null;
    return (value) => {
      const n = toNumber(value);
      if (n === null) return value == null ? '' : String(value);
      if (zero !== null && n === 0) return zero(0);
      if (negative !== null && n < 0) return negative(-n);
      return positive(n);
    };
  }
  const intlOptions: Intl.NumberFormatOptions = { style: descriptor.style };
  if (descriptor.style === 'currency') intlOptions.currency = o.currency ?? env.currency;
  if (o.minimumFractionDigits !== undefined) intlOptions.minimumFractionDigits = o.minimumFractionDigits;
  if (o.maximumFractionDigits !== undefined) intlOptions.maximumFractionDigits = o.maximumFractionDigits;
  if (o.useGrouping !== undefined) intlOptions.useGrouping = o.useGrouping;
  const optionsKey = JSON.stringify(intlOptions);
  let lastLocale = '';
  let fmt: Intl.NumberFormat | null = null;
  return (value) => {
    const n = toNumber(value);
    if (n === null) return value == null ? '' : String(value);
    const locale = env.getLocale();
    if (fmt === null || locale !== lastLocale) {
      lastLocale = locale;
      fmt = cached(env, `n|${locale}|${optionsKey}`, () => new Intl.NumberFormat(locale, intlOptions));
    }
    return fmt.format(n);
  };
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

export function toDate(value: unknown): Date | null {
  let d: Date;
  if (value instanceof Date) d = value;
  else if (typeof value === 'number') d = new Date(value);
  else if (typeof value === 'string' && value !== '') d = new Date(value);
  else return null;
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Converts a CLDR skeleton (`yMMMd`, `Hm`, `EEEE`) into `Intl.DateTimeFormat` options. */
export function skeletonToOptions(skeleton: string): Intl.DateTimeFormatOptions {
  const options: Intl.DateTimeFormatOptions = {};
  const runs = skeleton.match(/(.)\1*/g) ?? [];
  for (const run of runs) {
    const n = run.length;
    switch (run[0]) {
      case 'G':
        options.era = n === 5 ? 'narrow' : n === 4 ? 'long' : 'short';
        break;
      case 'y':
        options.year = n === 2 ? '2-digit' : 'numeric';
        break;
      case 'M':
      case 'L':
        options.month = n === 1 ? 'numeric' : n === 2 ? '2-digit' : n === 3 ? 'short' : n === 4 ? 'long' : 'narrow';
        break;
      case 'd':
        options.day = n === 2 ? '2-digit' : 'numeric';
        break;
      case 'E':
        options.weekday = n <= 3 ? 'short' : n === 4 ? 'long' : 'narrow';
        break;
      case 'h':
        options.hour = n === 2 ? '2-digit' : 'numeric';
        options.hour12 = true;
        break;
      case 'H':
        options.hour = n === 2 ? '2-digit' : 'numeric';
        options.hourCycle = 'h23';
        break;
      case 'm':
        options.minute = n === 2 ? '2-digit' : 'numeric';
        break;
      case 's':
        options.second = n === 2 ? '2-digit' : 'numeric';
        break;
      default:
        break;
    }
  }
  return options;
}

const PATTERN_TOKEN = /'((?:[^']|'')*)'|(G+|y+|M+|L+|d+|E+|c+|h+|H+|m+|s+|f+|a+|z+)/g;

const firstDays = new Map<string, number>();

/** First day of the week of a locale (1 = Monday .. 7 = Sunday, `Intl.Locale` week info); Sunday when unavailable. */
function firstDayOfWeek(locale: string): number {
  let day = firstDays.get(locale);
  if (day !== undefined) return day;
  day = 7;
  try {
    const l = new Intl.Locale(locale) as Intl.Locale & { getWeekInfo?(): { firstDay: number }; weekInfo?: { firstDay: number } };
    day = (l.getWeekInfo ? l.getWeekInfo() : l.weekInfo)?.firstDay ?? 7;
  } catch {
    // Invalid locale: keep Sunday.
  }
  if (firstDays.size < 64) firstDays.set(locale, day);
  return day;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

function patternFormatter(pattern: string, timeZone: string | undefined, env: FormatEnvironment): (date: Date) => string {
  const numericOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  };
  if (timeZone) numericOptions.timeZone = timeZone;
  interface Token {
    literal: string | null;
    token: string;
    /** For name tokens: Intl options and the part to extract. */
    text: { options: Intl.DateTimeFormatOptions; key: string; part: Intl.DateTimeFormatPartTypes } | null;
  }
  const textToken = (options: Intl.DateTimeFormatOptions, part: Intl.DateTimeFormatPartTypes): Token['text'] => {
    const opts = timeZone ? { ...options, timeZone } : options;
    return { options: opts, key: JSON.stringify(opts), part };
  };
  const tokens: Token[] = [];
  let last = 0;
  for (const match of pattern.matchAll(PATTERN_TOKEN)) {
    const index = match.index;
    if (index > last) tokens.push({ literal: pattern.slice(last, index), token: '', text: null });
    if (match[1] !== undefined) {
      // `''` alone is a quote; inside a quoted literal `''` is an escaped quote (`'o''clock'`).
      tokens.push({ literal: match[1] === '' ? "'" : match[1].replace(/''/g, "'"), token: '', text: null });
    } else {
      const token = match[2] ?? '';
      const n = token.length;
      let text: Token['text'] = null;
      // `MMM`+: the month in its format (in-date) form, extracted from a date with a day (genitive
      // in e.g. `ru`); `LLL`+: the standalone form (the month formatted on its own).
      if (token[0] === 'M' && n > 2) text = textToken({ month: n === 3 ? 'short' : n === 4 ? 'long' : 'narrow', day: 'numeric' }, 'month');
      else if (token[0] === 'L' && n > 2) text = textToken({ month: n === 3 ? 'short' : n === 4 ? 'long' : 'narrow' }, 'month');
      else if (token[0] === 'E') text = textToken({ weekday: n <= 3 ? 'short' : n === 4 ? 'long' : 'narrow' }, 'weekday');
      // `ccc`+: standalone weekday (the weekday formatted on its own); `c` / `cc` are numeric (below).
      else if (token[0] === 'c' && n >= 3) text = textToken({ weekday: n === 3 ? 'short' : n === 4 ? 'long' : 'narrow' }, 'weekday');
      // `z`..`zzz`: short time zone name (`UTC`, `PST`, `GMT+8`); `zzzz`: long name.
      else if (token[0] === 'z') text = textToken({ timeZoneName: n >= 4 ? 'long' : 'short' }, 'timeZoneName');
      else if (token[0] === 'G') text = textToken({ era: n === 5 ? 'narrow' : n === 4 ? 'long' : 'short' }, 'era');
      else if (token[0] === 'a') text = textToken({ hour: 'numeric', hour12: true }, 'dayPeriod');
      tokens.push({ literal: null, token, text });
    }
    last = index + match[0].length;
  }
  if (last < pattern.length) tokens.push({ literal: pattern.slice(last), token: '', text: null });

  return (date) => {
    const locale = env.getLocale();
    const numeric = cached(env, `d|en-US|${timeZone ?? ''}|numeric`, () => new Intl.DateTimeFormat('en-US', numericOptions));
    let year = 0, month = 0, day = 0, hour = 0, minute = 0, second = 0;
    for (const part of numeric.formatToParts(date)) {
      switch (part.type) {
        case 'year': year = Number(part.value); break;
        case 'month': month = Number(part.value); break;
        case 'day': day = Number(part.value); break;
        case 'hour': hour = Number(part.value) % 24; break;
        case 'minute': minute = Number(part.value); break;
        case 'second': second = Number(part.value); break;
        default: break;
      }
    }
    let out = '';
    for (const { literal, token, text } of tokens) {
      if (literal !== null) {
        out += literal;
        continue;
      }
      if (text !== null) {
        const fmt = cached(env, `d|${locale}|${text.key}`, () => new Intl.DateTimeFormat(locale, text.options));
        out += fmt.formatToParts(date).find((p) => p.type === text.part)?.value ?? '';
        continue;
      }
      const n = token.length;
      switch (token[0]) {
        case 'y':
          out += n === 2 ? pad(year % 100, 2) : pad(year, n);
          break;
        case 'M':
        case 'L':
          out += pad(month, n);
          break;
        case 'd':
          out += pad(day, n);
          break;
        case 'H':
          out += pad(hour, n);
          break;
        case 'h': {
          const h = hour % 12;
          out += pad(h === 0 ? 12 : h, n);
          break;
        }
        case 'm':
          out += pad(minute, n);
          break;
        case 's':
          out += pad(second, n);
          break;
        case 'f':
          // Fraction of the second truncated to n digits (`f` tenths, `fff` milliseconds); zero-padded past 3.
          out += pad(date.getUTCMilliseconds(), 3).padEnd(n, '0').slice(0, n);
          break;
        case 'c': {
          // Numeric day of the week, 1 = the locale's first day of the week.
          const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday
          const firstDay = firstDayOfWeek(locale) % 7;
          out += pad(((weekday - firstDay + 7) % 7) + 1, n);
          break;
        }
        default:
          out += token;
      }
    }
    return out;
  };
}

function dateFormatter(
  descriptor: Extract<FormatDescriptor, { kind: 'date' }> | null,
  type: ColumnType,
  env: FormatEnvironment,
): (value: unknown) => string {
  const timeZone = descriptor?.options.timeZone ?? env.timeZone;
  if (descriptor?.pattern) {
    const format = patternFormatter(descriptor.pattern, timeZone, env);
    return (value) => {
      const d = toDate(value);
      return d === null ? (value == null ? '' : String(value)) : format(d);
    };
  }
  // An explicit `{ type: 'date' }` keeps a style skeleton date-only even on a datetime column.
  const formatType = descriptor?.options.type;
  const withTime = formatType === 'date' ? false : type === 'datetime' || formatType === 'datetime';
  let intlOptions: Intl.DateTimeFormatOptions;
  const skeleton = descriptor?.skeleton ?? null;
  if (skeleton !== null && DATE_STYLES.has(skeleton)) {
    const style = skeleton as 'short' | 'medium' | 'long' | 'full';
    intlOptions = withTime ? { dateStyle: style, timeStyle: style } : { dateStyle: style };
  } else if (skeleton !== null) {
    intlOptions = skeletonToOptions(skeleton);
  } else {
    intlOptions = withTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' };
  }
  if (timeZone) intlOptions = { ...intlOptions, timeZone };
  const optionsKey = JSON.stringify(intlOptions);
  let lastLocale = '';
  let fmt: Intl.DateTimeFormat | null = null;
  return (value) => {
    const d = toDate(value);
    if (d === null) return value == null ? '' : String(value);
    const locale = env.getLocale();
    if (fmt === null || locale !== lastLocale) {
      lastLocale = locale;
      fmt = cached(env, `d|${locale}|${optionsKey}`, () => new Intl.DateTimeFormat(locale, intlOptions));
    }
    return fmt.format(d);
  };
}

/** Builds the value → display string function for a column. */
export function createValueFormatter(
  descriptor: FormatDescriptor | null,
  type: ColumnType,
  env: FormatEnvironment,
): (value: unknown) => string {
  if (descriptor?.kind === 'number') return numberFormatter(descriptor, env);
  if (descriptor?.kind === 'date' || type === 'date' || type === 'datetime') {
    return dateFormatter(descriptor?.kind === 'date' ? descriptor : null, type, env);
  }
  return (value) => (value == null ? '' : String(value));
}

/** Locale-aware comparer used as the default `sortComparer` for string columns. */
export function getCollator(env: FormatEnvironment): Intl.Collator {
  const locale = env.getLocale();
  return cached(env, `c|${locale}`, () => new Intl.Collator(locale));
}

/** A message: a `{param}` template, or plural forms chosen by `Intl.PluralRules` for `count` (`other` is required). */
export type LocaleMessage =
  | string
  | { readonly zero?: string; readonly one?: string; readonly two?: string; readonly few?: string; readonly many?: string; readonly other: string };

// ---------------------------------------------------------------------------
// Formatters with an injected locale
// ---------------------------------------------------------------------------

export interface FormatterOptions {
  /** BCP 47 locale. Default `en-US`. */
  readonly locale?: string;
  /** ISO 4217 code for currency formats. Default `USD`. */
  readonly currency?: string;
  /** IANA time zone for dates. Default: the runtime zone (set it for deterministic SSR output). */
  readonly timeZone?: string;
}

export interface Formatter {
  readonly locale: string;
  readonly currency: string;
  readonly timeZone: string | undefined;
  /**
   * Formats like a column `format`: number presets (`N2`, `C`, `P1`),
   * number patterns (`#,##0.00`), date skeletons (`yMMMd`) and styles
   * (`short`), date patterns (`dd/MM/yyyy HH:mm`), or `FormatOptions`. `type`
   * defaults to `date` for `Date` values and `number` for numbers.
   */
  format(value: unknown, format?: string | FormatOptions, type?: ColumnType): string;
  number(value: unknown, format?: string | FormatOptions): string;
  date(value: unknown, format?: string | FormatOptions): string;
  dateTime(value: unknown, format?: string | FormatOptions): string;
  money(value: unknown, fractionDigits?: number, currency?: string): string;
  percent(value: unknown, fractionDigits?: number): string;
}

const MAX_CACHED = 256;

/** A formatter for one locale; compiled formats and `Intl` objects are cached on the instance. */
export function createFormatter(options: FormatterOptions = {}): Formatter {
  const locale = options.locale ?? 'en-US';
  const currency = options.currency ?? 'USD';
  const env: FormatEnvironment = { getLocale: () => locale, timeZone: options.timeZone, currency, cache: new Map(), warn: () => {} };
  const compiled = new Map<string, (value: unknown) => string>();
  const format = (value: unknown, fmt?: string | FormatOptions, type?: ColumnType): string => {
    const t: ColumnType = type ?? (value instanceof Date ? 'date' : typeof value === 'number' ? 'number' : 'string');
    const key = `${t}|${typeof fmt === 'string' ? fmt : fmt === undefined ? '' : JSON.stringify(fmt)}`;
    let fn = compiled.get(key);
    if (!fn) {
      if (compiled.size >= MAX_CACHED) compiled.clear();
      fn = createValueFormatter(describeFormat(fmt, t, env.warn, 'format'), t, env);
      compiled.set(key, fn);
    }
    return fn(value);
  };
  return Object.freeze({
    locale,
    currency,
    timeZone: options.timeZone,
    format,
    number: (value: unknown, fmt?: string | FormatOptions) => format(value, fmt ?? 'N', 'number'),
    date: (value: unknown, fmt?: string | FormatOptions) => format(value, fmt ?? 'yMd', 'date'),
    dateTime: (value: unknown, fmt?: string | FormatOptions) => format(value, fmt ?? 'short', 'datetime'),
    money: (value: unknown, digits = 2, code?: string) => format(value, code ? { format: `C${digits}`, currency: code } : `C${digits}`, 'number'),
    percent: (value: unknown, digits = 0) => format(value, `P${digits}`, 'number'),
  });
}

const sharedFormatters = new Map<string, Formatter>();

/** Formats a value like a column format would (template helper). Formatters are shared per (locale, currency, time zone). */
export function formatValue(value: unknown, format?: string | FormatOptions, options: FormatterOptions & { readonly type?: ColumnType } = {}): string {
  const key = `${options.locale ?? 'en-US'}|${options.currency ?? 'USD'}|${options.timeZone ?? ''}`;
  let formatter = sharedFormatters.get(key);
  if (!formatter) {
    if (sharedFormatters.size >= MAX_CACHED) sharedFormatters.clear();
    formatter = createFormatter(options);
    sharedFormatters.set(key, formatter);
  }
  return formatter.format(value, format, options.type);
}

// ---------------------------------------------------------------------------
// Direction
// ---------------------------------------------------------------------------

const RTL_SCRIPTS = new Set(['Arab', 'Hebr', 'Thaa', 'Syrc', 'Nkoo', 'Adlm', 'Rohg', 'Mand', 'Samr', 'Mend', 'Yezi']);
const RTL_LANGUAGES = new Set(['ar', 'arc', 'ckb', 'dv', 'fa', 'he', 'iw', 'ks', 'lrc', 'mzn', 'pnb', 'ps', 'sd', 'syr', 'ug', 'ur', 'yi']);

interface LocaleInfo {
  readonly language: string;
  readonly script?: string;
  maximize(): LocaleInfo;
  getTextInfo?(): { readonly direction?: string };
  readonly textInfo?: { readonly direction?: string };
}

/** True for right-to-left locales (`ar`, `he-IL`, `fa`, `ur-PK`, `az-Arab`, ...). Invalid locales are LTR. */
export function isRtlLocale(locale: string): boolean {
  const LocaleCtor = (Intl as unknown as { Locale?: new (tag: string) => LocaleInfo }).Locale;
  if (LocaleCtor) {
    try {
      const info = new LocaleCtor(locale);
      const text = typeof info.getTextInfo === 'function' ? info.getTextInfo() : info.textInfo;
      if (text?.direction === 'rtl' || text?.direction === 'ltr') return text.direction === 'rtl';
      const script = info.script ?? info.maximize().script;
      if (script) return RTL_SCRIPTS.has(script);
      return RTL_LANGUAGES.has(info.language);
    } catch {
      return false;
    }
  }
  return RTL_LANGUAGES.has(locale.split(/[-_]/)[0]?.toLowerCase() ?? '');
}

// Locale-aware parsing.
export { parseNumber } from './number-parse.js';
export type { ParseNumberOptions } from './number-parse.js';
