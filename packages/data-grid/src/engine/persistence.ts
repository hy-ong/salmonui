// `./persistence.js`. The subpath re-exports the
// synchronous state API (`state-api.ts`, carried by every grid instance) and
// the storage binding (`persistence-binding.ts`, which a renderer loads only
// when state persistence is on). The split keeps the binding out of grids
// that do not persist; the public surface is unchanged.

export {
  createDataGridStateApi,
  DATA_GRID_STATE_PARTS,
  DATA_GRID_STATE_VERSION,
  deserializeDataGridState,
  getDataGridState,
  normalizeDataGridState,
  restoreDataGridState,
  serializeDataGridState,
} from './state-api.js';
export type {
  DataGridState,
  DataGridStateApi,
  DataGridStateOptions,
  DataGridStatePart,
  DeserializeDataGridStateOptions,
  PersistedColumn,
  PersistedFilter,
  PersistedFilterCondition,
  PersistedFilterGroup,
  PersistedPinning,
  RestoreResult,
} from './state-api.js';
export { createDataGridPersistence } from './persistence-binding.js';
// Renderer seam, not for apps: the binding body with injected state API functions.
export { bindDataGridPersistence } from './persistence-binder.js';
export { DATA_GRID_PERSISTENCE_FNS, type DataGridPersistenceFns } from './state-api.js';
export type { DataGridPersistence, DataGridPersistenceOptions, DataGridStateStorageAdapter } from './persistence-binding.js';
