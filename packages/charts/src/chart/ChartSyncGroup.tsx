// Synchronized charts: charts inside a `ChartSyncGroup` share the
// hovered x value (tooltip and crosshair), the x zoom range and the selected
// point indices through one
// store per group instance (no module-level state). Pointer moves write the
// store; each chart's overlay subscribes to it, so no React state changes per
// move.

import { createContext, use, type ReactNode } from 'react';
import { useVizStore, type VizStore } from '../internal/viz/store.js';

export interface SyncState {
  /** Hovered x data value, or null. */
  readonly x: number | null;
  /** Chart instance that owns the hover. */
  readonly source: string | null;
  /** Shared x zoom range in data units. */
  readonly zoom: readonly [number, number] | null;
  /** Point indices selected in the chart `source` (shared selection). */
  readonly selection?: { readonly source: string; readonly indices: readonly number[] } | null | undefined;
}

export interface SyncContextValue {
  readonly store: VizStore<SyncState>;
  readonly tooltip: boolean;
  readonly crosshair: boolean;
  readonly zoom: boolean;
  readonly selection: boolean;
}

export const SyncContext = createContext<SyncContextValue | null>(null);

export function useChartSync(): SyncContextValue | null {
  return use(SyncContext);
}

export interface ChartSyncGroupProps {
  /** Share the tooltip position. Default true. */
  readonly tooltip?: boolean | undefined;
  /** Share the crosshair position. Default true. */
  readonly crosshair?: boolean | undefined;
  /** Share the x zoom range. Default true. */
  readonly zoom?: boolean | undefined;
  /** Share the selected point indices between charts that have `selection`. Default true. */
  readonly selection?: boolean | undefined;
  readonly children?: ReactNode;
}

export function ChartSyncGroup(props: ChartSyncGroupProps): ReactNode {
  const store = useVizStore<SyncState>(() => ({ x: null, source: null, zoom: null }));
  const value: SyncContextValue = { store, tooltip: props.tooltip !== false, crosshair: props.crosshair !== false, zoom: props.zoom !== false, selection: props.selection !== false };
  return <SyncContext value={value}>{props.children}</SyncContext>;
}
