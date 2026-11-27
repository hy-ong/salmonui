// Stacking:
// normal and percent stacks per stack group, positive and negative values
// stacked separately (diverging stacks), and per-index totals for stack
// labels. Inputs are aligned value columns (one per series, same length).

export type StackMode = 'normal' | 'percent';

export interface StackInput {
  readonly id: string;
  readonly values: ArrayLike<number>;
  /** Series with the same group stack together. */
  readonly group?: string | undefined;
  readonly mode: StackMode;
}

export interface StackedSeries {
  readonly id: string;
  /** Lower edge per index (NaN where the value is missing). */
  readonly y0: Float64Array;
  /** Upper edge per index. */
  readonly y1: Float64Array;
}

export interface StackResult {
  readonly series: ReadonlyMap<string, StackedSeries>;
  /** Positive and negative totals per group and index (before percent scaling). */
  readonly totals: ReadonlyMap<string, { readonly positive: Float64Array; readonly negative: Float64Array }>;
}

export function stack(inputs: readonly StackInput[], length: number): StackResult {
  const groups = new Map<string, StackInput[]>();
  for (const input of inputs) {
    const key = `${input.group ?? ''}\u0000${input.mode}`;
    let list = groups.get(key);
    if (!list) groups.set(key, (list = []));
    list.push(input);
  }
  const series = new Map<string, StackedSeries>();
  const totals = new Map<string, { positive: Float64Array; negative: Float64Array }>();
  for (const [key, list] of groups) {
    const positive = new Float64Array(length);
    const negative = new Float64Array(length);
    for (const s of list) {
      for (let i = 0; i < length; i++) {
        const v = s.values[i] as number;
        if (!Number.isFinite(v)) continue;
        if (v >= 0) positive[i] = (positive[i] as number) + v;
        else negative[i] = (negative[i] as number) + v;
      }
    }
    const percent = list[0]?.mode === 'percent';
    const upPos = new Float64Array(length);
    const upNeg = new Float64Array(length);
    for (const s of list) {
      const y0 = new Float64Array(length);
      const y1 = new Float64Array(length);
      for (let i = 0; i < length; i++) {
        const raw = s.values[i] as number;
        if (!Number.isFinite(raw)) {
          y0[i] = Number.NaN;
          y1[i] = Number.NaN;
          continue;
        }
        const total = (positive[i] as number) - (negative[i] as number);
        const v = percent ? (total === 0 ? 0 : (raw / total) * 100) : raw;
        if (v >= 0) {
          y0[i] = upPos[i] as number;
          upPos[i] = (upPos[i] as number) + v;
          y1[i] = upPos[i] as number;
        } else {
          y0[i] = upNeg[i] as number;
          upNeg[i] = (upNeg[i] as number) + v;
          y1[i] = upNeg[i] as number;
        }
      }
      series.set(s.id, { id: s.id, y0, y1 });
    }
    totals.set(key.split('\u0000')[0] as string, { positive, negative });
  }
  return { series, totals };
}
