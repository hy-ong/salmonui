// Named saved views (additive). A view is a
// named `DataGridState` (Data Grid `api.getState()`), stored per grid as one
// versioned document in any `KeyValueStore`. Applying a view is
// `api.restoreState(view.state)`; nothing here touches the grid.

import { stableStringify } from './canonical.js';
import type { KeyValueStore } from './storage.js';
import type { DataGridState } from './types.js';

/** Schema version of the stored view record (not of the grid state, which carries its own `version`). */
export const SAVED_VIEW_SCHEMA_VERSION = 1;

export interface SavedView<State extends DataGridState = DataGridState> {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly state: State;
  /** Epoch milliseconds. */
  readonly createdAt: number;
  /** Epoch milliseconds. */
  readonly updatedAt: number;
  /** `SAVED_VIEW_SCHEMA_VERSION` the record was written with. */
  readonly schemaVersion: number;
}

/** `save()` input: without `id` a view is created, with an existing `id` it is replaced (keeping `createdAt`). */
export interface SavedViewInput<State extends DataGridState = DataGridState> {
  readonly id?: string;
  readonly name: string;
  readonly description?: string;
  readonly state: State;
}

export interface SavedViewsOptions<State extends DataGridState = DataGridState> {
  /** The grid whose views these are (`DataGrid` `id`). */
  readonly gridId: string;
  /** Storage key prefix. Default `salmonui:grid-views:`. */
  readonly prefix?: string;
  /** Clock in epoch milliseconds. Default `Date.now`. */
  readonly now?: () => number;
  /** Id for a new view. Default `crypto.randomUUID()` when available, else a time-based counter. */
  readonly createId?: () => string;
  /**
   * Upgrades a stored record of an older (or unknown) record schema, or whose
   * grid state needs upgrading; return null to drop it. Records of the current
   * schema are passed through unchanged without calling it.
   */
  readonly migrate?: (record: Readonly<Record<string, unknown>>, schemaVersion: number) => SavedView<State> | null;
}

export interface SavedViews<State extends DataGridState = DataGridState> {
  /** Every view, oldest first (creation order). */
  list(): Promise<readonly SavedView<State>[]>;
  get(id: string): Promise<SavedView<State> | null>;
  /** Creates or replaces a view and returns the stored record. */
  save(input: SavedViewInput<State>): Promise<SavedView<State>>;
  /** Changes the name (and, when given, the description) of a view; null when it does not exist. */
  rename(id: string, name: string, description?: string): Promise<SavedView<State> | null>;
  /** Removes a view; false when it did not exist. */
  remove(id: string): Promise<boolean>;
  /** Removes every view of the grid. */
  clear(): Promise<void>;
  /** Called after every change made through this object. Returns the unsubscribe function. */
  subscribe(listener: (views: readonly SavedView<State>[]) => void): () => void;
}

interface Document<State extends DataGridState> {
  readonly v: 1;
  readonly views: readonly SavedView<State>[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isView(value: Record<string, unknown>): boolean {
  return (
    typeof value['id'] === 'string' &&
    typeof value['name'] === 'string' &&
    isRecord(value['state']) &&
    typeof (value['state'] as Record<string, unknown>)['version'] === 'number' &&
    typeof value['createdAt'] === 'number' &&
    typeof value['updatedAt'] === 'number'
  );
}

let fallbackCounter = 0;

function defaultId(now: number): string {
  const crypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (crypto?.randomUUID) return crypto.randomUUID();
  fallbackCounter++;
  return `view-${now.toString(36)}-${fallbackCounter.toString(36)}`;
}

/**
 * Named saved views of one grid over an injected key-value store
 * (`localStorage`, IndexedDB wrappers, a server-backed store, `createMemoryStore()`).
 * Writes through one object are serialized, so concurrent `save` calls never
 * lose each other's views; unreadable or invalid records are skipped.
 */
export function createSavedViews<State extends DataGridState = DataGridState>(store: KeyValueStore, options: SavedViewsOptions<State>): SavedViews<State> {
  const key = (options.prefix ?? 'salmonui:grid-views:') + options.gridId;
  const now = options.now ?? (() => Date.now());
  const listeners = new Set<(views: readonly SavedView<State>[]) => void>();
  let queue: Promise<unknown> = Promise.resolve();

  const read = async (): Promise<SavedView<State>[]> => {
    const text = await store.getItem(key);
    if (!text) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return [];
    }
    if (!isRecord(parsed) || !Array.isArray(parsed['views'])) return [];
    const out: SavedView<State>[] = [];
    const seen = new Set<string>();
    for (const raw of parsed['views'] as unknown[]) {
      if (!isRecord(raw)) continue;
      const schemaVersion = typeof raw['schemaVersion'] === 'number' ? raw['schemaVersion'] : 0;
      let view: SavedView<State> | null;
      if (schemaVersion === SAVED_VIEW_SCHEMA_VERSION && isView(raw)) view = raw as unknown as SavedView<State>;
      else view = options.migrate ? options.migrate(raw, schemaVersion) : null;
      if (!view || seen.has(view.id)) continue;
      seen.add(view.id);
      out.push(view);
    }
    return out;
  };

  const write = async (views: readonly SavedView<State>[]): Promise<void> => {
    if (views.length === 0) await store.removeItem(key);
    else await store.setItem(key, stableStringify({ v: 1, views } satisfies Document<State>));
    for (const listener of [...listeners]) listener(views);
  };

  /** Runs read-modify-write steps one after another. */
  const exclusive = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };

  const record = (input: SavedViewInput<State>, id: string, createdAt: number, at: number): SavedView<State> => ({
    id,
    name: input.name,
    ...(input.description === undefined ? {} : { description: input.description }),
    state: input.state,
    createdAt,
    updatedAt: at,
    schemaVersion: SAVED_VIEW_SCHEMA_VERSION,
  });

  return {
    list: () => exclusive(read),
    get: (id) => exclusive(async () => (await read()).find((v) => v.id === id) ?? null),
    save: (input) =>
      exclusive(async () => {
        const views = await read();
        const at = now();
        const index = input.id === undefined ? -1 : views.findIndex((v) => v.id === input.id);
        const existing = index >= 0 ? views[index] : undefined;
        const view = record(input, input.id ?? (options.createId ? options.createId() : defaultId(at)), existing?.createdAt ?? at, at);
        if (index >= 0) views[index] = view;
        else views.push(view);
        await write(views);
        return view;
      }),
    rename: (id, name, description) =>
      exclusive(async () => {
        const views = await read();
        const index = views.findIndex((v) => v.id === id);
        const existing = views[index];
        if (!existing) return null;
        const text = description ?? existing.description;
        const view = record(text === undefined ? { name, state: existing.state } : { name, description: text, state: existing.state }, id, existing.createdAt, now());
        views[index] = view;
        await write(views);
        return view;
      }),
    remove: (id) =>
      exclusive(async () => {
        const views = await read();
        const next = views.filter((v) => v.id !== id);
        if (next.length === views.length) return false;
        await write(next);
        return true;
      }),
    clear: () => exclusive(() => write([])),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
