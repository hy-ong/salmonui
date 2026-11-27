// The synchronous state API of every grid:
// `getState` / `restoreState` / `resetState` over the core
// `createDataGridStateApi` (core `state-api.ts`, not the storage binding).
// The `persistState` storage binding is the `persistState` render feature
// (`persist-state.ts`); while it is bound, `resetState()` also drops the
// stored entry.

import {
  createDataGridStateApi,
  DATA_GRID_PERSISTENCE_FNS,
  type DataGridPersistenceFns,
  type DataGridState,
  type DataGridStateApi,
  type DataGridStateOptions,
  type DeserializeDataGridStateOptions,
  type RestoreResult,
} from '@salmonui/data-grid/engine/persistence';
import { DEV, warnOnce } from '@salmonui/core/internal/dev';
import { gridEvent, type DataGridEventSource } from '@salmonui/core/internal/events';
import type { DataGridInstance } from './instance.js';
import type { DataGridStateMethods } from './persist-state.js';
import type { DataGridErrorEvent } from './query-types.js';

/** The part of a storage binding `resetState()` uses. */
export interface DataGridStateBinding {
  restore(state: DataGridState): RestoreResult;
  clear(): unknown;
}

export class DataGridStatePersistence<Row> {
  private readonly instance: DataGridInstance<Row>;
  private readonly state: DataGridStateApi;
  /** @internal The bound storage (`persistState`), set by the binding after mount. */
  binding: DataGridStateBinding | null = null;
  /**
   * @internal The state API functions for the storage binding: passed in, so
   * the lazy binding chunk shares no module with the static graph.
   */
  readonly fns: DataGridPersistenceFns = DATA_GRID_PERSISTENCE_FNS;

  constructor(instance: DataGridInstance<Row>) {
    this.instance = instance;
    // Captured at construction: `resetState()` returns to the definition state.
    this.state = createDataGridStateApi(instance.engine);
  }

  /** The instance methods. */
  methods(): DataGridStateMethods {
    return {
      getState: (options?: DataGridStateOptions) => this.state.getState(options),
      restoreState: (input: DataGridState | string, options?: DataGridStateOptions & DeserializeDataGridStateOptions) => this.applyScroll(this.state.restoreState(input, options)),
      resetState: () => this.reset(),
    };
  }

  private reset(): RestoreResult {
    const binding = this.binding;
    if (!binding) return this.applyScroll(this.state.resetState());
    // Restore without saving, then drop the stored entry.
    const result = binding.restore(this.state.initialState);
    void binding.clear();
    return this.applyScroll(result);
  }

  /** @internal `onError` of a storage load or save failure (`action: 'persistState'`). */
  reportError(error: unknown): void {
    const onError = this.instance.props.onError;
    if (!onError) return;
    onError(gridEvent<DataGridErrorEvent>('error', 'api' as DataGridEventSource, { error: error instanceof Error ? error : new Error(String(error)), action: 'persistState' }));
  }

  /** @internal Development warning of a `persistState` without a storage key. */
  warnNoKey(): void {
    if (DEV) warnOnce(`${this.instance.gridId}:persistState`, `DataGrid "${this.instance.gridId}": persistState needs an \`id\` (or persistState.key) for a stable storage key; nothing is persisted.`);
  }

  /** @internal Applies a restored scroll position (also after the restored rows commit). */
  applyScroll(result: RestoreResult): RestoreResult {
    const scroll = result.scroll;
    const viewport = this.instance.getViewport();
    if (!scroll || !viewport) return result;
    const apply = (): void => {
      viewport.scrollTop = scroll.top;
      viewport.scrollLeft = this.instance.rtl ? -scroll.left : scroll.left;
    };
    apply();
    // The restored rows may grow the scroll height after the next commit.
    const raf = (globalThis as { requestAnimationFrame?: (cb: () => void) => number }).requestAnimationFrame;
    if (raf) raf(apply);
    return result;
  }
}
