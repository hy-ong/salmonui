// `rowDrag` render feature: the row drag
// host (`rowDragDrop` stand-in, keys, `moveRows`), the drag handle column
// (its handles render on the server) and the drag layer. The drag
// controller and the core module are the lazy `row-drag-chunk`, warmed in
// parallel with this feature. Imported only by the registries and the
// public features entry.

import { DataGridRowDragLayer, DataGridRowDragUi, loadRowDragChunk, rowDragColumn, rowDragEngineOptions, rowDragModules } from '../row-drag.js';
import { DataGrid } from '../DataGrid.js';
import type { DataGridFeature } from './types.js';

export const rowDrag: DataGridFeature = Object.freeze({
  name: 'rowDrag',
  hub: () => DataGrid,
  modules: (props, ctx) => rowDragModules(props, ctx.modules, ctx.deferred),
  engineOptions: (props) => rowDragEngineOptions(props),
  createUi: (instance, ctx) => new DataGridRowDragUi(instance, ctx.deferred),
  parts: Object.freeze({ RowDragLayer: DataGridRowDragLayer, rowDragColumn }),
  warm: Object.freeze([loadRowDragChunk]),
} satisfies DataGridFeature);
