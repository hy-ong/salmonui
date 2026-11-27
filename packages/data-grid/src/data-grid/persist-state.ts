// The `persistState` storage binding of the
// `persistState` render feature (features/feature-persist-state.ts): it binds
// the core storage binding (`bindDataGridPersistence`, the body of
// `createDataGridPersistence` with the state API functions passed in by the
// static `state-api.ts`, so this chunk imports no static module) to an
// injected storage, defaulting to `localStorage`. Storage is touched only in the mount effect (never during
// render), so server markup and the hydrating client render are the
// definition state: the stored state is restored right after hydration, in
// the same task, before the browser paints. The synchronous state API
// (`getState` / `restoreState` / `resetState`) is static (`state-api.ts`).

import {
  bindDataGridPersistence,
  type DataGridState,
  type DataGridStateApi,
  type DataGridStatePart,
  type DataGridStateStorageAdapter,
} from '@salmonui/data-grid/engine/persistence';
import type { DataGridInstance } from './instance.js';

/** `persistState` settings. */
export interface DataGridPersistState {
  /** Storage key. Default `salmon-data-grid:<id>` (the grid `id` prop is then required). */
  readonly key?: string;
  /**
   * Storage with `load` / `save` / `remove` (sync or async), for example
   * `@salmonui/data` `createKeyValueStateStorage`. Default: `localStorage`,
   * read only in the browser after mount.
   */
  readonly storage?: DataGridStateStorageAdapter;
  /** State parts that are not saved or restored. */
  readonly exclude?: readonly DataGridStatePart[];
  /**
   * Application state version. A stored state saved under another
   * version is discarded unless `migrate` upgrades it.
   */
  readonly version?: number;
  /** Upgrades a stored state of another schema or application version; return null to discard it. */
  readonly migrate?: (state: Record<string, unknown>, version: number) => DataGridState | null;
}

/** Instance state methods (`ref`, `useDataGridApi()`). */
export type DataGridStateMethods = Omit<DataGridStateApi, 'initialState'>;

const APP_VERSION = 'appVersion';

/** `localStorage` as a state storage, or null when unavailable (private mode, server). Call in effects only. */
export function localStateStorage(): DataGridStateStorageAdapter | null {
  let storage: Storage | undefined;
  try {
    storage = (globalThis as { localStorage?: Storage }).localStorage;
  } catch {
    return null;
  }
  if (!storage) return null;
  const ls = storage;
  return {
    load: (key) => ls.getItem(key),
    save: (key, state) => ls.setItem(key, JSON.stringify(state)),
    remove: (key) => ls.removeItem(key),
  };
}

/** Tags saved states with the application version and discards (or migrates) others on load. */
function versioned(storage: DataGridStateStorageAdapter, version: number, migrate: DataGridPersistState['migrate']): DataGridStateStorageAdapter {
  const check = (raw: unknown): unknown => {
    if (raw == null) return raw;
    let value: unknown = raw;
    if (typeof raw === 'string') {
      try {
        value = JSON.parse(raw);
      } catch {
        return raw; // serialized (base64url) states carry no application version
      }
    }
    if (typeof value !== 'object' || value === null) return null;
    const saved = (value as Record<string, unknown>)[APP_VERSION];
    if (saved === version) return value;
    if (!migrate) return null;
    const next = migrate(value as Record<string, unknown>, typeof saved === 'number' ? saved : 0);
    return next ?? null;
  };
  return {
    load: (key) => {
      const raw = storage.load(key);
      return raw instanceof Promise ? raw.then(check) : check(raw);
    },
    save: (key, state) => storage.save(key, { ...state, [APP_VERSION]: version } as DataGridState),
    ...(storage.remove ? { remove: (key: string) => storage.remove?.(key) } : {}),
  };
}

/** Client-only (the instance mount effect): binds the storage and restores the stored state. Returns the teardown. */
export function mountPersistState<Row>(instance: DataGridInstance<Row>): () => void {
  const option = instance.props.persistState;
  if (!option) return () => {};
  const settings: DataGridPersistState = option === true ? {} : option;
  const id = instance.props.id;
  const key = settings.key ?? (id ? `salmon-data-grid:${id}` : null);
  if (key === null) {
    instance.persistence.warnNoKey();
    return () => {};
  }
  const base = settings.storage ?? localStateStorage();
  if (!base) return () => {};
  const storage = settings.version === undefined ? base : versioned(base, settings.version, settings.migrate);
  const state = instance.persistence;
  const binding = bindDataGridPersistence(instance.engine, {
    storage,
    key,
    ...(settings.exclude ? { exclude: settings.exclude } : {}),
    ...(settings.migrate ? { migrate: settings.migrate } : {}),
    onError: (error) => state.reportError(error),
  }, state.fns);
  state.binding = binding;
  void binding.load().then((result) => {
    if (result && state.binding === binding) state.applyScroll(result);
  });
  return () => {
    binding.dispose();
    if (state.binding === binding) state.binding = null;
  };
}
