// Sizing: the first render (server and client) uses the
// given `width` / `height` or the nominal size; after hydration one
// `ResizeObserver` per component writes the measured size into the store
// (never React state), and the component relays out once if it differs.

import { useLayoutEffect, useRef, type RefObject } from 'react';
import { NOMINAL_HEIGHT, NOMINAL_WIDTH } from '#viz';
import { warnLowContrastDataColors } from '../data-colors.js';
import { useVizSelector, type VizStore } from './store.js';

// Read inline (not internal/dev.ts `DEV`): bundlers replace it textually, so the branch folds away in production
// builds even when dev.ts lands in a chunk shared with lazy chunks (an imported binding does not fold).
declare const process: { readonly env: { readonly NODE_ENV?: string } };

export interface SizeState {
  readonly width: number;
  readonly height: number;
}

export interface SizeOptions {
  readonly width?: number | undefined;
  readonly height?: number | undefined;
}

/** Initial size of a sized component (given size, else nominal). */
export function initialSize(options: SizeOptions, nominalHeight = NOMINAL_HEIGHT): SizeState {
  return { width: options.width ?? NOMINAL_WIDTH, height: options.height ?? nominalHeight };
}

/**
 * Observes `ref` and writes its content-box size into `store` unless both
 * dimensions are fixed. `onResize` is called after a committed change.
 */
export function useMeasuredSize<S extends SizeState>(ref: RefObject<HTMLElement | null>, store: VizStore<S>, options: SizeOptions, onResize?: (size: SizeState) => void): void {
  const fixedW = options.width;
  const fixedH = options.height;
  const cb = useRef(onResize);
  useLayoutEffect(() => {
    cb.current = onResize;
  });
  useLayoutEffect(() => {
    const el = ref.current;
    // the development-only data-color contrast check of the measured families, on mount (dropped from
    // production builds).
    if (process.env.NODE_ENV !== 'production') warnLowContrastDataColors(el?.closest('.salmon-viz'));
    if (!el || (fixedW !== undefined && fixedH !== undefined)) return;
    const apply = (w: number, h: number) => {
      const width = fixedW ?? Math.max(1, Math.round(w));
      const height = fixedH ?? Math.max(1, Math.round(h || store.get().height));
      const prev = store.get();
      if (prev.width === width && prev.height === height) return;
      store.set({ width, height } as Partial<S>);
      cb.current?.({ width, height });
    };
    const rect = el.getBoundingClientRect();
    if (rect.width > 0) apply(rect.width, rect.height);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box && box.width > 0) apply(box.width, box.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, store, fixedW, fixedH]);
}

/** The current layout size: the store's measured size. */
export function useSize<S extends SizeState>(store: VizStore<S>): SizeState {
  const width = useVizSelector(store, (s) => s.width);
  const height = useVizSelector(store, (s) => s.height);
  return { width, height };
}
