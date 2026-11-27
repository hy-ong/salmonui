// formatFileSize: binary
// multiples (1 KB = 1024 bytes) with Intl.NumberFormat unit names, so the
// number and the unit follow the locale. No DOM; safe on the server.

const UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte', 'petabyte'] as const;
const cache = new Map<string, Intl.NumberFormat>();

/**
 * Formats a byte count for people: `formatFileSize(1536, 'en-US')` is
 * `"1.5 kB"`, `formatFileSize(1, 'de-DE')` is `"1 Byte"`. Uses 1024 steps,
 * at most one fraction digit above bytes, and `locale` (default `'en-US'`,
 * never the host locale, so server and client agree).
 */
export function formatFileSize(bytes: number, locale: string = 'en-US'): string {
  let value = Math.max(0, Number.isFinite(bytes) ? bytes : 0);
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const key = `${locale}|${unit}`;
  let format = cache.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, { style: 'unit', unit: UNITS[unit]!, unitDisplay: unit === 0 ? 'long' : 'short', maximumFractionDigits: unit === 0 ? 0 : 1 });
    cache.set(key, format);
  }
  return format.format(value);
}
