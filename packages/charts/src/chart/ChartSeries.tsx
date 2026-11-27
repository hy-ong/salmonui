// JSX children forms of the `series` and `axes` arrays. They render
// nothing; `Chart` reads their props from its direct children (pure, so the
// server renders the same series as the array form) and compiles them into
// the same id-keyed model.

import type { ReactNode } from 'react';
import type { ChartAxisOptions, ChartSeriesOptions } from './types.js';

export type ChartSeriesProps = ChartSeriesOptions;

/** One chart series as a child of `Chart` (same fields as a `series` entry). */
export function ChartSeries(_props: ChartSeriesProps): ReactNode {
  return null;
}

export interface ChartAxisProps extends ChartAxisOptions {
  /** `'x'` (category / value axis along the data) or `'y'` (value axis). */
  readonly direction: 'x' | 'y';
  /** Required except for the primary axes (`'x'`, `'y'`). */
  readonly id?: string | undefined;
}

/** An axis as a child of `Chart`; `id="x"` / `id="y"` configure the primary axes. */
export function ChartAxis(_props: ChartAxisProps): ReactNode {
  return null;
}
