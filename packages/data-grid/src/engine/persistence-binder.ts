// The body of the state storage binding (`createDataGridPersistence`,
// `persistence-binding.ts`) with the state API functions passed in instead of
// imported: it has no runtime import, so a renderer that loads the binding as
// a lazy chunk next to a static state API shares no module with its static
// graph (a shared module would be split into a chunk of its own by the
// consumer's bundler). Not for apps: they call `createDataGridPersistence`.

import type { DataGridPersistence, DataGridPersistenceOptions } from './persistence-binding.js';
import type { DataGridPersistenceFns, DataGridState, DataGridStateOptions, DataGridStatePart, RestoreResult } from './state-api.js';
import type { DataGridEngine } from './types.js';

const TRACKED: readonly [string, DataGridStatePart][] = [
  ['columns.setFreeze', 'pinning'],
  ['columns.setFrozenCount', 'pinning'],
  ['columns.setPinning', 'pinning'],
  ['columns.', 'columns'],
  ['sort.', 'sorting'],
  ['filter.', 'filters'],
  ['search.', 'search'],
  ['grouping.', 'grouping'],
  ['paging.', 'paging'],
  ['rowPinning.', 'pinnedRows'],
  ['selection.', 'selection'],
  // Tree mode: the part comes from `withTreePersistence` functions, which honor `exclude`; it is not in `partSet`.
  ['tree.', 'tree'],
];

/** Not for apps (use `createDataGridPersistence`): `createDataGridPersistence` over injected state API functions (`DATA_GRID_PERSISTENCE_FNS`). */
export function bindDataGridPersistence<Row>(engine: DataGridEngine<Row>, options: DataGridPersistenceOptions, fns: DataGridPersistenceFns): DataGridPersistence {
  const { getDataGridState, restoreDataGridState, deserializeDataGridState, normalizeDataGridState, partSet, stableStringify } = fns;
  const key = options.key ?? engine.id;
  const stateOptions: DataGridStateOptions = options.exclude ? { exclude: options.exclude } : {};
  const parts = partSet(options.exclude);
  const schedule = options.schedule ?? ((flush: () => void) => void Promise.resolve().then(flush));
  const report = (error: unknown): void => options.onError?.(error);
  const read = (): DataGridState => getDataGridState(engine, stateOptions);
  const initialState = read();
  let lastSaved = stableStringify(initialState);
  let scheduled = false;
  let restoring = false;
  let disposed = false;

  async function save(): Promise<void> {
    if (disposed) return;
    const state = read();
    const text = stableStringify(state);
    if (text === lastSaved) return;
    lastSaved = text;
    try {
      await options.storage.save(key, state);
    } catch (error) {
      report(error);
    }
  }

  const unsubscribe = engine.onCommand((event) => {
    if (restoring || disposed || scheduled || event.result.status !== 'applied') return;
    const type = event.command.type;
    if (!TRACKED.some(([prefix, part]) => type.startsWith(prefix) && (parts.has(part) || part === 'tree'))) return;
    scheduled = true;
    schedule(() => {
      scheduled = false;
      void save();
    });
  });

  async function clear(): Promise<void> {
    try {
      await options.storage.remove?.(key);
    } catch (error) {
      report(error);
    }
  }

  function restore(state: DataGridState): RestoreResult {
    restoring = true;
    try {
      return restoreDataGridState(engine, state, stateOptions);
    } finally {
      restoring = false;
      lastSaved = stableStringify(read());
    }
  }

  return {
    key,
    initialState,
    async load() {
      if (disposed) return null;
      let raw: unknown;
      try {
        raw = await options.storage.load(key);
      } catch (error) {
        report(error);
        return null;
      }
      if (raw == null || disposed) return null;
      let state: DataGridState;
      try {
        state = typeof raw === 'string' ? deserializeDataGridState(raw, options) : normalizeDataGridState(raw, options);
      } catch (error) {
        report(error);
        return null;
      }
      return restore(state);
    },
    save,
    restore,
    clear,
    async reset() {
      const result = restore(initialState);
      await clear();
      return result;
    },
    dispose() {
      disposed = true;
      unsubscribe();
    },
  };
}
