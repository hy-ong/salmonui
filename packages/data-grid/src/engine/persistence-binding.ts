// DataGrid state storage binding: binds an engine to an injected
// storage (`load` / `save` / `remove`, sync or async). It never touches
// globals: applied state-changing commands schedule one coalesced save, and
// `load()` restores. Split from the synchronous state API (`state-api.ts`)
// so a grid that does not persist does not carry it; `./persistence`
// re-exports both. The binding body is `persistence-binder.ts` (state API
// functions injected).

import { bindDataGridPersistence } from './persistence-binder.js';
import { DATA_GRID_PERSISTENCE_FNS, type DataGridState, type DataGridStateOptions, type DeserializeDataGridStateOptions, type RestoreResult } from './state-api.js';
import type { DataGridEngine } from './types.js';

/** Injected storage, sync or async. `@salmonui/data` `createKeyValueStateStorage` and `createJsonStateStorage` fit structurally. */
export interface DataGridStateStorageAdapter {
  load(key: string): unknown;
  save(key: string, state: DataGridState): unknown;
  remove?(key: string): unknown;
}

export interface DataGridPersistenceOptions extends DataGridStateOptions, DeserializeDataGridStateOptions {
  readonly storage: DataGridStateStorageAdapter;
  /** Storage key. Default `engine.id`. */
  readonly key?: string;
  /** Schedules a coalesced save. Default: one microtask. */
  readonly schedule?: (flush: () => void) => void;
  /** Load and save failures (storage errors, invalid stored state). */
  readonly onError?: (error: unknown) => void;
}

export interface DataGridPersistence {
  readonly key: string;
  /** State captured when the binding was created (what `reset()` restores). */
  readonly initialState: DataGridState;
  /** Loads and restores the stored state; null when nothing is stored or it is invalid. */
  load(): Promise<RestoreResult | null>;
  /** Saves now (skipped when unchanged since the last save or load). */
  save(): Promise<void>;
  /** Restores `initialState` and removes the stored entry. */
  reset(): Promise<RestoreResult>;
  /** Restores a state now without saving it (the stored entry is unchanged until the next tracked change). */
  restore(state: DataGridState): RestoreResult;
  /** Removes the stored entry. */
  clear(): Promise<void>;
  dispose(): void;
}

/** Binds an engine to an injected storage: applied state-changing commands schedule one coalesced save; `load()` restores. */
export function createDataGridPersistence<Row>(engine: DataGridEngine<Row>, options: DataGridPersistenceOptions): DataGridPersistence {
  return bindDataGridPersistence(engine, options, DATA_GRID_PERSISTENCE_FNS);
}
