// Single grid-state persistence (named saved views: ./views.ts).

import { stableStringify } from './canonical.js';
import { createAbortController } from './scheduler.js';
import { postJson, type FetchTransportOptions } from './transport.js';
import type { AbortSignalLike, DataGridState } from './types.js';

export type SaveResult = { readonly status: 'saved'; readonly version?: string } | { readonly status: 'conflict'; readonly server: DataGridState };

export interface DataGridStateStorage {
  load(gridId: string, signal?: AbortSignalLike): Promise<DataGridState | null>;
  save(gridId: string, state: DataGridState, expectedVersion?: string): Promise<SaveResult>;
  remove(gridId: string): Promise<void>;
}

/** Any sync or async key-value store (`localStorage`, `sessionStorage`, IndexedDB wrappers, Redis clients, Maps). */
export interface KeyValueStore {
  getItem(key: string): string | null | undefined | Promise<string | null | undefined>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

/** Wraps a `Map` as a `KeyValueStore` (tests, SSR). */
export function createMemoryStore(map: Map<string, string> = new Map()): KeyValueStore {
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

interface Envelope {
  readonly version: string;
  readonly state: DataGridState;
}

/**
 * Key-value storage. The store is injected (never `localStorage` directly).
 * Versions are a counter kept beside the state, so `expectedVersion` detects
 * a concurrent save from another tab.
 */
export function createKeyValueStateStorage(store: KeyValueStore, options: { readonly prefix?: string } = {}): DataGridStateStorage {
  const prefix = options.prefix ?? 'salmonui:grid-state:';
  const read = async (gridId: string): Promise<Envelope | null> => {
    const text = await store.getItem(prefix + gridId);
    if (!text) return null;
    try {
      const parsed = JSON.parse(text) as Envelope;
      return parsed && typeof parsed === 'object' && parsed.state ? parsed : null;
    } catch {
      return null;
    }
  };
  return {
    async load(gridId) {
      return (await read(gridId))?.state ?? null;
    },
    async save(gridId, state, expectedVersion) {
      const current = await read(gridId);
      if (expectedVersion !== undefined && current && current.version !== expectedVersion) return { status: 'conflict', server: current.state };
      const version = String((current ? Number(current.version) || 0 : 0) + 1);
      await store.setItem(prefix + gridId, stableStringify({ version, state }));
      return { status: 'saved', version };
    },
    async remove(gridId) {
      await store.removeItem(prefix + gridId);
    },
  };
}

/**
 * State storage over the JSON protocol endpoint:
 * `{ v: 1, state: { op: 'load' | 'save' | 'remove', gridId, state?, expectedVersion? } }`
 * -> `{ v: 1, state: DataGridState | null, version?, status?: 'saved' | 'conflict' }`.
 */
export function createJsonStateStorage(options: FetchTransportOptions): DataGridStateStorage {
  const call = async (body: unknown, signal?: AbortSignalLike): Promise<{ state?: DataGridState | null; version?: string; status?: 'saved' | 'conflict' }> =>
    (await postJson(options, { v: 1, state: body }, signal ?? createAbortController().signal)) as { state?: DataGridState | null; version?: string; status?: 'saved' | 'conflict' };
  return {
    async load(gridId, signal) {
      return (await call({ op: 'load', gridId }, signal)).state ?? null;
    },
    async save(gridId, state, expectedVersion) {
      const res = await call(expectedVersion === undefined ? { op: 'save', gridId, state } : { op: 'save', gridId, state, expectedVersion });
      if (res.status === 'conflict' && res.state) return { status: 'conflict', server: res.state };
      return res.version === undefined ? { status: 'saved' } : { status: 'saved', version: res.version };
    },
    async remove(gridId) {
      await call({ op: 'remove', gridId });
    },
  };
}
