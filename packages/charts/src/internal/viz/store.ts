// Per-instance visualization store: everything that changes per frame (measured size, hover target,
// focused point, tooltip anchor, zoom and pan frames, drag preview) lives
// here, never in React state. React reads it through narrow selectors over
// `useSyncExternalStore`; the server snapshot returns the nominal state.

import { useRef, useState, useSyncExternalStore } from 'react';

export interface VizStore<S> {
  get(): S;
  /** Shallow-merges a patch; listeners run only when a field changed (Object.is). */
  set(patch: Partial<S> | ((state: S) => Partial<S>)): void;
  subscribe(listener: () => void): () => void;
  /** The state the server rendered with (selectors use it for `getServerSnapshot`). */
  readonly initial: S;
}

export function createVizStore<S extends object>(initial: S): VizStore<S> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    initial,
    get: () => state,
    set(patch) {
      const p = typeof patch === 'function' ? patch(state) : patch;
      let changed = false;
      for (const key in p) {
        if (!Object.is(p[key], state[key])) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      state = { ...state, ...p };
      for (const l of [...listeners]) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** One store per component instance, created at mount. */
export function useVizStore<S extends object>(init: () => S): VizStore<S> {
  return useState(() => createVizStore(init()))[0];
}

/**
 * Subscribes to a slice of the store. `isEqual` keeps object slices stable
 * (the previous slice is returned while equal), so a pointer move that does
 * not change the slice re-renders nothing.
 */
export function useVizSelector<S extends object, T>(store: VizStore<S>, selector: (state: S) => T, isEqual: (a: T, b: T) => boolean = Object.is): T {
  const last = useRef<{ state: S; value: T } | null>(null);
  const read = (state: S): T => {
    const prev = last.current;
    if (prev && prev.state === state) return prev.value;
    const value = selector(state);
    if (prev && isEqual(prev.value, value)) {
      last.current = { state, value: prev.value };
      return prev.value;
    }
    last.current = { state, value };
    return value;
  };
  return useSyncExternalStore(
    store.subscribe,
    () => read(store.get()),
    () => selector(store.initial),
  );
}

/** Shallow equality for flat slice objects and arrays. */
export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  return true;
}
