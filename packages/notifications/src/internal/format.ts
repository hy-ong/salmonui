// Locale number formatting for the Notifications components (`format`). Server-safe and pure: formatters
// are created per call from `Intl` (a module-level cache would be module
// state), so server and client output match for the same `locale`. The Data
// Grid's formatter (`@salmonui/data-grid/engine` `createFormatter`) is a column
// formatter with date and pattern support; these components only need the
// two `Intl.NumberFormat` cases below, so they do not pull it in.

/** @internal `0.42` → `"42%"` in `locale` (default `'en-US'`, so server and client agree). */
export function formatPercent(fraction: number, locale?: string): string {
  return new Intl.NumberFormat(locale ?? 'en-US', { style: 'percent', maximumFractionDigits: 0 }).format(fraction);
}

/** @internal A count with locale digits, capped: `formatCount(120, 99)` → `"99+"`. */
export function formatCount(value: number, max?: number, locale?: string): string {
  const nf = new Intl.NumberFormat(locale ?? 'en-US');
  return max !== undefined && value > max ? `${nf.format(max)}+` : nf.format(value);
}
