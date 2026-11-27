// Undo / redo history of committed edits: pure, no React. Entries
// are whole edit snapshots; `push` records the state before the edit, so an
// edit made outside the editor (a controlled prop) is never lost by undo.

export interface History<T> {
  readonly past: readonly T[];
  readonly future: readonly T[];
  /** Coalescing key of the last push (keyboard nudges of one annotation). */
  readonly key: string | undefined;
  readonly at: number;
}

export const emptyHistory = <T>(): History<T> => ({ past: [], future: [], key: undefined, at: 0 });

/**
 * Records `before` as an undo step and drops the redo stack. With a `key`
 * equal to the previous push's within `window` ms the step merges into the
 * previous one. `limit` caps the undo steps (oldest dropped); 0 disables history.
 */
export function pushHistory<T>(h: History<T>, before: T, limit: number, key?: string, now = 0, window = 800): History<T> {
  if (limit <= 0) return emptyHistory();
  if (key !== undefined && key === h.key && now - h.at <= window && h.past.length) return { past: h.past, future: [], key, at: now };
  const past = h.past.length >= limit ? [...h.past.slice(h.past.length - limit + 1), before] : [...h.past, before];
  return { past, future: [], key, at: now };
}

/** The state to restore and the history after it; `null` when there is nothing to undo. */
export function undoHistory<T>(h: History<T>, current: T): { readonly state: T; readonly history: History<T> } | null {
  const state = h.past[h.past.length - 1];
  if (state === undefined) return null;
  return { state, history: { past: h.past.slice(0, -1), future: [...h.future, current], key: undefined, at: 0 } };
}

export function redoHistory<T>(h: History<T>, current: T): { readonly state: T; readonly history: History<T> } | null {
  const state = h.future[h.future.length - 1];
  if (state === undefined) return null;
  return { state, history: { past: [...h.past, current], future: h.future.slice(0, -1), key: undefined, at: 0 } };
}
