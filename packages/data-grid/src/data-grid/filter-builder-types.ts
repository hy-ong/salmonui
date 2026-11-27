// Public types of the advanced filter builder: a dialog over the same filter state as every other filter UI.
// The rule is the nested `DataGridFilter` groups of `filtering.filters`; there is
// no second rule model. `DataGridProps` and `DataGridApi` extend the interfaces here.

import type { DataGridEvent } from '@salmonui/core/internal/events';
import type { DataGridFilter } from './query-types.js';

/**
 * `onBeforeFilterBuilderOpen` (`type: 'beforeFilterBuilderOpen'`,
 * cancellable: the dialog stays closed).
 */
export interface DataGridFilterBuilderOpenEvent extends DataGridEvent {
  /** The applied filters the dialog opens with. */
  readonly filters: readonly DataGridFilter[];
}

export interface DataGridFilterBuilderProps {
  onBeforeFilterBuilderOpen?: (event: DataGridFilterBuilderOpenEvent) => void;
}

export interface DataGridFilterBuilderApi {
  /**
   * Opens the filter builder dialog.
   * Ignored unless `filtering.builder` is set.
   */
  openFilterBuilder(): void;
  /** Closes the filter builder dialog without applying. */
  closeFilterBuilder(): void;
}
