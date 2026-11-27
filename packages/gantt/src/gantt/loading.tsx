'use client';

// Loading placeholders of the Gantt chart (shimmer
// placeholders and skeleton rows): the chart pane
// mirrors the grid pane's skeleton. With `loadingIndicator: 'skeleton'` the
// chart shows the Data Grid skeleton overlay (same markup and classes, so the
// Gantt stylesheet adds no CSS) while the grid loads or `setLoading(true)`;
// under a lazy parent whose children load, the grid opens a one-row gap with
// a skeleton row (`virtualization.skeletonRows`, default on) and the
// chart opens the same gap with a shimmer bar under the parent's bar. A
// `#gantt-modules` module, loaded with `loadingIndicator: 'skeleton'` or
// `loadChildren`.

import { useCallback, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import type { TimeScale } from '../internal/timeline/scale.js';
import type { GanttInstance } from './instance.js';
import type { GanttProps } from './types.js';
import { barOf, type ChartWindow } from './chart.js';

type LoadChildren<Row> = NonNullable<GanttProps<Row>['loadChildren']>;

/** `loadChildren` as the grid calls it: the parent is loading until the result settles. */
export function trackChildren<Row>(g: GanttInstance<Row>, ctx: Parameters<LoadChildren<Row>>[0]): ReturnType<LoadChildren<Row>> {
  const id = String(ctx.rowId);
  const mark = (on: boolean): void => {
    const next = new Set(g.loadingParents);
    if (on) next.add(id);
    else next.delete(id);
    g.loadingParents = next;
    g.emit();
  };
  mark(true);
  const off = (): void => mark(false);
  try {
    const out = (g.props.loadChildren as LoadChildren<Row>)(ctx);
    Promise.resolve(out).then(off, off);
    return out;
  } catch (e) {
    off();
    throw e;
  }
}

/** Skeleton rows of the rendered window: the offset each row moves down and the placeholder rows. */
export function skeletonRows<Row>(g: GanttInstance<Row>, w: ChartWindow<Row>, scale: TimeScale): { readonly shift: (index: number) => number; readonly nodes: ReactNode } | null {
  const v = g.props.virtualization;
  if (!g.loadingParents.size || (typeof v === 'object' && v !== null && v.skeletonRows === false)) return null;
  const rh = g.props.rowHeight ?? 36;
  const base = w.metrics.offsetOf(w.start);
  const at: number[] = [];
  const nodes: ReactNode[] = [];
  for (let i = w.start; i < w.end; i++) {
    const row = w.rows[i];
    if (row === undefined) continue;
    const key = g.keyOf(row);
    if (!g.loadingParents.has(key)) continue;
    const s = g.engine.getSchedule(g.taskIdOf(row) ?? key);
    const box = s ? barOf(scale, s) : null;
    const top = w.metrics.offsetOf(i + 1) - base + at.length * rh;
    at.push(i);
    nodes.push(
      <div key={key} className="salmon-gantt__skeleton-row" data-loading-parent={key} aria-hidden="true" style={{ position: 'absolute', insetInline: 0, top, height: rh }}>
        <span className="salmon-data-grid-skeleton-bar" style={{ position: 'absolute', insetInlineStart: box?.x ?? 0, inlineSize: Math.max(48, box?.width ?? 96), maxInlineSize: 'none', top: '35%' }} />
      </div>,
    );
  }
  if (!at.length) return null;
  return { shift: (index) => at.filter((p) => p < index).length * rh, nodes };
}

const noop = (): (() => void) => () => {};
/** The grid sizes its parts border-box; the chart pane is outside its scope. */
const BOX: CSSProperties = { boxSizing: 'border-box' };

/** The skeleton overlay of the chart pane while the grid loads (`loadingIndicator: 'skeleton'`). */
export function ChartLoading<Row>({ g, ready, headerHeight }: { g: GanttInstance<Row>; ready: boolean; headerHeight: number }): ReactNode {
  const engine = ready ? g.gridApi?.engine : undefined;
  const subscribe = useCallback((l: () => void) => engine?.subscribe(l) ?? noop(), [engine]);
  const loading = useSyncExternalStore(subscribe, () => engine?.getSnapshot().data.status === 'loading', () => false);
  if (!loading && !g.loading) return null;
  const bars: ReactNode[] = [];
  for (let i = 0; i < (g.props.initialRows ?? 20); i++) bars.push(<span key={i} className="salmon-data-grid-loading__bar" style={BOX} />);
  const style = { paddingBlockStart: headerHeight, '--salmon-data-grid-row-height': `${g.props.rowHeight ?? 36}px`, '--salmon-data-grid-cell-padding-inline': '8px' } as CSSProperties;
  return (
    <div className="salmon-data-grid-loading salmon-gantt__loading" data-indicator="skeleton" aria-hidden="true" style={style}>
      <span className="salmon-data-grid-loading__skeleton">{bars}</span>
    </div>
  );
}
