// Per-column card window: variable card heights in the internal
// virtual-list Fenwick metrics, measured heights keyed by card so they
// survive reorders, and a snapshot store for `useSyncExternalStore`. Scroll
// positions and measurements never enter React state; the column re-renders
// only when its rendered range changes.

import { createFixedRowMetrics, createVariableRowMetrics, type RowMetrics, type VariableRowMetrics } from '@salmonui/core/internal/virtual-list';

export interface CardWindow {
  readonly start: number;
  readonly end: number;
  /** Spacer heights above and below the rendered cards. */
  readonly top: number;
  readonly bottom: number;
}

export interface CardWindowStore {
  readonly initial: CardWindow;
  get(): CardWindow;
  subscribe(listener: () => void): () => void;
  /** New card keys (after a data change) and the viewport. */
  sync(keys: readonly string[], scrollTop: number, viewport: number): void;
  scroll(scrollTop: number, viewport: number): void;
  /** Measured outer height of a rendered card. */
  measure(key: string, height: number): void;
  offsetOf(index: number): number;
}

const OVERSCAN = 4;

export function createCardWindow(count: number, estimate: number, fixed: boolean, initialRows: number): CardWindowStore {
  const heights = new Map<string, number>();
  let index = new Map<string, number>();
  let metrics: RowMetrics | VariableRowMetrics = fixed ? createFixedRowMetrics(count, estimate) : createVariableRowMetrics(count, () => estimate);
  let scrollTop = 0;
  let viewport = 0;
  const end0 = Math.min(count, initialRows);
  const initial: CardWindow = { start: 0, end: end0, top: 0, bottom: Math.max(0, (count - end0) * estimate) };
  let snap = initial;
  const listeners = new Set<() => void>();

  const compute = (): void => {
    const n = metrics.count;
    if (viewport <= 0) return;
    const first = metrics.indexAt(scrollTop);
    const last = metrics.indexAt(scrollTop + viewport);
    const start = Math.max(0, first - OVERSCAN);
    const end = n === 0 ? 0 : Math.min(n, last + 1 + OVERSCAN);
    const top = metrics.offsetOf(start);
    const bottom = Math.max(0, metrics.totalHeight - metrics.offsetOf(end));
    if (start === snap.start && end === snap.end && Math.abs(top - snap.top) < 0.5 && Math.abs(bottom - snap.bottom) < 0.5) return;
    snap = { start, end, top, bottom };
    for (const l of listeners) l();
  };

  return {
    initial,
    get: () => snap,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    sync(next, top, height) {
      index = new Map(next.map((k, i) => [k, i]));
      metrics = fixed ? createFixedRowMetrics(next.length, estimate) : createVariableRowMetrics(next.length, (i) => heights.get(next[i] as string) ?? estimate);
      scrollTop = top;
      viewport = height;
      compute();
    },
    scroll(top, height) {
      scrollTop = top;
      viewport = height;
      compute();
    },
    measure(key, height) {
      if (fixed || heights.get(key) === height) return;
      heights.set(key, height);
      const i = index.get(key);
      if (i !== undefined && (metrics as VariableRowMetrics).setHeight(i, height) !== 0) compute();
    },
    offsetOf: (index) => metrics.offsetOf(index),
  };
}
