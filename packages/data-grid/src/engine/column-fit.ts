// Column fit for `resizeMode: 'auto'`. Pure px math, no DOM: the
// renderer passes the resolved widths and the available width and gets back
// the rendered widths.

/** One visible leaf column as seen by `fitColumnWidths`. */
export interface FitColumn {
  /** Resolved (declared or user) width in px. */
  readonly width: number;
  /** `maxWidth` in px (`Infinity` when unset). */
  readonly max: number;
  /** False for columns that never stretch (fixed-size columns such as the selection column). */
  readonly flexible: boolean;
}

/**
 * Expands column widths proportionally so that their sum reaches `target`.
 * Columns are never shrunk: when
 * the widths already reach `target` the input widths are returned unchanged
 * and the grid scrolls horizontally. Flexible columns grow in proportion to
 * their width, capped at `max`; the result is whole px and sums to `target`
 * unless every flexible column is capped. Returns `null` when nothing changes.
 */
export function fitColumnWidths(columns: readonly FitColumn[], target: number): number[] | null {
  let total = 0;
  for (const c of columns) total += c.width;
  if (!(target > total)) return null;
  const out = columns.map((c) => c.width);
  let extra = target - total;
  let active: number[] = [];
  for (let i = 0; i < columns.length; i++) if (columns[i]!.flexible && columns[i]!.width < columns[i]!.max) active.push(i);
  // Proportional pass, repeated while columns hit their max.
  const grown = new Float64Array(columns.length);
  while (active.length > 0 && extra > 1e-6) {
    let base = 0;
    for (const i of active) base += out[i]! + grown[i]!;
    const capped: number[] = [];
    let used = 0;
    for (const i of active) {
      const w = out[i]! + grown[i]!;
      const share = base > 0 ? (extra * w) / base : extra / active.length;
      const room = columns[i]!.max - w;
      if (share >= room) {
        grown[i] = grown[i]! + room;
        used += room;
        capped.push(i);
      }
    }
    if (capped.length === 0) {
      for (const i of active) {
        const w = out[i]! + grown[i]!;
        grown[i] = grown[i]! + (base > 0 ? (extra * w) / base : extra / active.length);
      }
      extra = 0;
      break;
    }
    extra -= used;
    active = active.filter((i) => !capped.includes(i));
  }
  let changed = false;
  let sum = 0;
  const fractions: { i: number; f: number }[] = [];
  for (let i = 0; i < columns.length; i++) {
    const g = grown[i]!;
    if (g <= 0) {
      sum += out[i]!;
      continue;
    }
    const exact = out[i]! + g;
    const whole = Math.floor(exact);
    if (whole !== out[i]) changed = true;
    out[i] = whole;
    sum += whole;
    fractions.push({ i, f: exact - whole });
  }
  // Whole-px rounding: hand the remaining px to the largest fractions.
  // Floor of target: a fractional viewport never overflows by a sub-px.
  let remainder = Math.floor(target) - sum;
  fractions.sort((a, b) => b.f - a.f);
  for (const { i } of fractions) {
    if (remainder <= 0) break;
    if (out[i]! + 1 > columns[i]!.max) continue;
    out[i] = out[i]! + 1;
    remainder--;
    changed = true;
  }
  return changed ? out : null;
}
