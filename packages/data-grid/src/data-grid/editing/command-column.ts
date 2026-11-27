// Command column defaults, static: column compilation applies them
// on every grid, while the buttons render only with the `editing` feature.

import type { DataGridColumn } from '../types.js';

const noValue = (): null => null;

/** Command column defaults: a utility column without a value, never sorted, filtered, grouped, searched, or edited. */
export function commandColumnDefaults<Row>(column: DataGridColumn<Row>): DataGridColumn<Row> {
  return { type: 'string', sortable: false, filterable: false, searchable: false, groupable: false, editable: false, valueGetter: noValue, ...column };
}
