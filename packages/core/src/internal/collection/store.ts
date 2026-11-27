// Per-instance collection store: the transient listbox state that must not
// live in React state (active entry, mounted window). React reads it through
// `useSyncExternalStore` with narrow selectors: each option selects "am I
// active", so moving the active option re-renders two options; the list
// selects the mounted window, which moves about once per overscan of
// scrolling. Framework-agnostic.

/** Internal. */
export interface CollectionState {
  /** Active entry index, or -1. */
  readonly active: number;
  /** Mounted entry range `[first, last)`. */
  readonly first: number;
  readonly last: number;
  /** Measured entry height in px. */
  readonly itemHeight: number;
  /** Group of the first visible entry (sticky header), or null. */
  readonly sticky: string | null;
}

/** Internal. */
export interface CollectionStore {
  getState(): CollectionState;
  subscribe(listener: () => void): () => void;
  /** Applies a partial update; listeners run only when a field changed. */
  set(patch: Partial<CollectionState>): void;
}

/** Internal. */
export function createCollectionStore(initial: CollectionState): CollectionStore {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    set: (patch) => {
      let changed = false;
      for (const key of Object.keys(patch) as (keyof CollectionState)[]) {
        if (patch[key] !== undefined && patch[key] !== state[key]) changed = true;
      }
      if (!changed) return;
      state = { ...state, ...patch };
      for (const l of listeners) l();
    },
  };
}
