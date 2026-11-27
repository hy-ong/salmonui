// Locale-aware number parsing: the inverse of
// `Intl.NumberFormat`. Symbols come from `formatToParts`, cached per
// (locale, options).

export interface ParseNumberOptions {
  /** BCP 47 locale. Default `en-US`. */
  readonly locale?: string | undefined;
  /** The options the text was formatted with (percent formats divide by 100). */
  readonly formatOptions?: Intl.NumberFormatOptions | undefined;
}

interface Symbols {
  readonly group: string;
  readonly decimal: string;
  readonly minus: string;
  readonly percent: boolean;
  readonly digits: ReadonlyMap<string, string>;
  readonly strip: RegExp;
}

const cache = new Map<string, Symbols>();
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function symbolsOf(locale: string, options: Intl.NumberFormatOptions | undefined): Symbols {
  const key = `${locale}|${options ? JSON.stringify(options) : ''}`;
  let found = cache.get(key);
  if (found) return found;
  const nf = new Intl.NumberFormat(locale, { ...options, useGrouping: true });
  const parts = nf.formatToParts(-12345.6);
  const value = (type: string, fallback: string): string => parts.find((p) => p.type === type)?.value ?? fallback;
  const group = value('group', ',');
  const decimal = value('decimal', '.');
  const minus = value('minusSign', '-');
  // Currency, percent and literal text to drop before parsing.
  const extras = new Set<string>();
  for (const p of nf.formatToParts(1)) if (p.type === 'currency' || p.type === 'percentSign' || p.type === 'literal' || p.type === 'unit') extras.add(p.value.trim());
  extras.delete('');
  const digits = new Map<string, string>();
  const plain = new Intl.NumberFormat(locale, { useGrouping: false });
  for (let d = 0; d <= 9; d++) {
    const local = plain.format(d);
    if (local !== String(d)) digits.set(local, String(d));
  }
  const removable = [...extras].sort((a, b) => b.length - a.length).map(escape);
  const strip = new RegExp(`${removable.length ? `${removable.join('|')}|` : ''}[\\s\\u00a0\\u202f\\u200e\\u200f\\u061c]`, 'g');
  found = { group, decimal, minus, percent: options?.style === 'percent', digits, strip };
  if (cache.size > 64) cache.clear();
  cache.set(key, found);
  return found;
}

/**
 * Parses localized number text: `'1.234,5'` in `de-DE` is `1234.5`. Accepts
 * the locale's digits, group, decimal and minus symbols (and ASCII `-`, and
 * `.` when it is not the group symbol), currency and percent signs, and
 * parentheses for accounting negatives. Returns `null` for empty text and
 * `NaN` when the text is not a number.
 */
export function parseNumber(text: string, options: ParseNumberOptions = {}): number | null {
  const s = symbolsOf(options.locale ?? 'en-US', options.formatOptions);
  let t = text.trim();
  if (t === '') return null;
  let negative = false;
  if (t.startsWith('(') && t.endsWith(')')) {
    negative = true;
    t = t.slice(1, -1);
  }
  t = t.replace(s.strip, '');
  if (s.digits.size) t = t.replace(/./gu, (c) => s.digits.get(c) ?? c);
  if (t.includes(s.minus) || t.includes('-') || t.includes('−')) {
    negative = !negative;
    t = t.split(s.minus).join('').replace(/[-−]/g, '');
  }
  const groupLike = s.group.trim() === '' ? /[\s  ]/g : new RegExp(escape(s.group), 'g');
  t = t.replace(groupLike, '');
  // The locale decimal symbol; an ASCII `.` left over (not the group symbol) is a decimal point too.
  if (s.decimal !== '.') t = t.split(s.decimal).join('.');
  if (t === '' || !/^\d*\.?\d*$/.test(t) || t === '.') return Number.NaN;
  let n = Number(t);
  if (s.percent) n /= 100;
  return negative ? -n : n;
}
