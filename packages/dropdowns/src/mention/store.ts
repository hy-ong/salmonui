// Per-instance suggestion store: the popup and
// its options read it through useSyncExternalStore with narrow selectors, so
// moving the active option re-renders the old and the new option only.
// No React, no DOM globals.
import type { MentionDataSource } from './types.js';

export interface MentionSnapshot<T> {
  readonly open: boolean;
  readonly items: readonly T[];
  readonly active: number;
  readonly status: 'idle' | 'loading' | 'error';
  readonly error: unknown;
  readonly text: string;
  readonly trigger: number;
  /** Portal container while open (an Element; typed opaquely so this module stays DOM-free). */
  readonly container: object | null;
  /** Direction of the field, read when the list opens. */
  readonly dir: 'ltr' | 'rtl';
}

export interface MentionStore<T> {
  get(): MentionSnapshot<T>;
  set(patch: Partial<MentionSnapshot<T>>): void;
  subscribe(listener: () => void): () => void;
}

export function createMentionStore<T>(): MentionStore<T> {
  let state: MentionSnapshot<T> = { open: false, items: [], active: -1, status: 'idle', error: null, text: '', trigger: -1, container: null, dir: 'ltr' };
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch) {
      let changed = false;
      for (const key in patch) {
        if (!Object.is(patch[key as keyof MentionSnapshot<T>], state[key as keyof MentionSnapshot<T>])) changed = true;
      }
      if (!changed) return;
      state = { ...state, ...patch };
      for (const l of listeners) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const isRemote = <T>(data: unknown): data is MentionDataSource<T> => data != null && !Array.isArray(data) && typeof (data as { read?: unknown }).read === 'function';
