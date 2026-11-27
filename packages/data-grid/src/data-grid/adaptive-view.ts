// Adaptive mode of a grid render, on every grid: the prop
// normalization, the mode projection, the card height and the view context.
// Tiny and feature-free: the controller (`adaptive-controller.ts`), the card
// rows, the adaptive bar and the sheet slot are the `adaptive` render feature
// (features/feature-adaptive.tsx), which sets `instance.adaptive`; without it
// `useAdaptiveView` returns null and no adaptive markup renders.

import { createContext, use, useLayoutEffect, useSyncExternalStore } from 'react';
import type { DataGridAdaptive, DataGridAdaptiveRowLayout, DataGridAdaptiveTarget } from './adaptive-types.js';
import type { DataGridInstance } from './instance.js';

export const DEFAULT_ADAPTIVE_BREAKPOINT = 640;
/** Card block padding (each side) and the gap below each card, in px (CSS mirrors these). */
export const CARD_PADDING = 8;
export const CARD_GAP = 8;

export interface ResolvedAdaptive {
  readonly target: DataGridAdaptiveTarget;
  readonly rowLayout: DataGridAdaptiveRowLayout;
  readonly breakpoint: number;
  readonly defaultActive: boolean;
}

/** Normalized `adaptive` prop; null when adaptive UI is off. */
export function resolveAdaptive(value: boolean | DataGridAdaptive | undefined): ResolvedAdaptive | null {
  if (!value) return null;
  const o: DataGridAdaptive = value === true ? {} : value;
  return {
    target: o.target ?? 'both',
    rowLayout: o.rowLayout ?? 'horizontal',
    breakpoint: o.breakpoint ?? DEFAULT_ADAPTIVE_BREAKPOINT,
    defaultActive: o.defaultActive ?? false,
  };
}

/** Mode for a container width; `width <= 0` means not measured yet (server and hydration). */
export function adaptiveActiveFor(config: ResolvedAdaptive | null, width: number): boolean {
  if (!config) return false;
  if (config.target === 'both') return true;
  if (width <= 0) return config.defaultActive;
  return config.target === 'mobile' ? width < config.breakpoint : width >= config.breakpoint;
}

/** Card height for vertical rows: one field line per visible column. */
export function cardHeight(columnCount: number, rowHeight: number): number {
  return Math.max(1, columnCount) * rowHeight + 2 * CARD_PADDING + CARD_GAP;
}

/** What the renderer draws for the current mode (identity-stable per value). */
export interface AdaptiveView {
  readonly active: boolean;
  readonly vertical: boolean;
  /** Popover sheet mode (DataGridPopover): non-null while adaptive is active. */
  readonly sheet: { readonly closeLabel: string } | null;
}

/** `api.isAdaptive()`: the adaptive layout applies now (false without the `adaptive` render feature). */
export function isAdaptiveActive<Row>(instance: DataGridInstance<Row>): boolean {
  const adaptive = instance.adaptive;
  return adaptive ? adaptiveActiveFor(resolveAdaptive(instance.props.adaptive), adaptive.getWidth()) : false;
}

/** Current adaptive view of the enclosing DataGrid (null when the `adaptive` prop is off). */
export const DataGridAdaptiveContext = createContext<AdaptiveView | null>(null);

export function useAdaptive(): AdaptiveView | null {
  return use(DataGridAdaptiveContext);
}

const noop = (): void => {};
const subscribeNever = (): (() => void) => noop;
const off = (): boolean => false;

/**
 * Adaptive mode of a DataGrid render. Reads the derived boolean only (the
 * measured width stays in the controller); the server and hydration render
 * use the prop alone (`target: 'both'` or `defaultActive`), so markup matches.
 * Null without the `adaptive` render feature or with the prop off.
 */
export function useAdaptiveView<Row>(instance: DataGridInstance<Row>, prop: boolean | DataGridAdaptive | undefined): AdaptiveView | null {
  const adaptive = instance.adaptive;
  const config = adaptive ? resolveAdaptive(prop) : null;
  const active = useSyncExternalStore(
    adaptive ? adaptive.subscribe : subscribeNever,
    adaptive ? () => adaptiveActiveFor(config, adaptive.getWidth()) : off,
    // Server and hydration: no measurement.
    adaptive ? () => adaptiveActiveFor(config, 0) : off,
  );
  const enabled = config !== null;
  useLayoutEffect(() => (enabled && adaptive ? adaptive.mount() : undefined), [adaptive, enabled]);
  if (!config || !adaptive) return null;
  return adaptive.viewOf(active, config.rowLayout === 'vertical', adaptive.text('adaptiveClose'));
}
