// The toolbar state store: the engine pushes a derived snapshot after each
// transaction; components read narrow slices with useSyncExternalStore. The
// server snapshot is the initial one, so server and hydration markup match.
import { useSyncExternalStore } from 'react';
import type { RichTextToolbarState } from '../engine/types.js';

export interface EditorSnapshot extends RichTextToolbarState {
  readonly ready: boolean;
  readonly focused: boolean;
}

function equal(a: EditorSnapshot, b: EditorSnapshot): boolean {
  for (const key of Object.keys(a) as (keyof EditorSnapshot)[]) {
    const x = a[key];
    const y = b[key];
    if (x === y) continue;
    if (x && y && typeof x === 'object' && typeof y === 'object') {
      if (JSON.stringify(x) !== JSON.stringify(y)) return false;
    } else return false;
  }
  return true;
}

export class EditorStore {
  #snapshot: EditorSnapshot;
  readonly #initial: EditorSnapshot;
  readonly #listeners = new Set<() => void>();
  constructor(initial: EditorSnapshot) {
    this.#snapshot = initial;
    this.#initial = initial;
  }
  get = (): EditorSnapshot => this.#snapshot;
  server = (): EditorSnapshot => this.#initial;
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };
  /** Returns whether the snapshot changed. */
  set(patch: Partial<EditorSnapshot>): boolean {
    const next = { ...this.#snapshot, ...patch };
    if (equal(next, this.#snapshot)) return false;
    this.#snapshot = next;
    for (const listener of this.#listeners) listener();
    return true;
  }
}

export function initialSnapshot(count: number, empty: boolean): EditorSnapshot {
  return {
    ready: false,
    focused: false,
    marks: { bold: false, italic: false, underline: false, strike: false, subscript: false, superscript: false, code: false },
    fontFamily: null,
    fontSize: null,
    color: null,
    backgroundColor: null,
    block: 'p',
    textAlign: null,
    lineHeight: null,
    list: null,
    link: null,
    inTable: false,
    node: null,
    canUndo: false,
    canRedo: false,
    count,
    empty,
    selectionEmpty: true,
    painter: false,
    findCount: 0,
    findIndex: -1,
    suggest: null,
  };
}

/** A narrow slice of the snapshot; `select` must return a primitive or a stable value. */
export function useEditorState<T>(store: EditorStore, select: (snapshot: EditorSnapshot) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.get()),
    () => select(store.server()),
  );
}

/** Fires a cancellable event (`preventDefault`, `defaultPrevented`); returns whether it was not prevented. */
export function fire<T extends object>(callback: ((event: T & { preventDefault(): void; readonly defaultPrevented: boolean }) => void) | undefined, payload: T): boolean {
  if (!callback) return true;
  let prevented = false;
  callback({ ...payload, preventDefault: () => void (prevented = true), get defaultPrevented() { return prevented; } });
  return !prevented;
}
