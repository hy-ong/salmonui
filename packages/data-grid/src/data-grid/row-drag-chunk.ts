// The lazy row drag chunk: loaded with
// dynamic `import()` by `loadRowDragChunk()` (row-drag.tsx) when a grid with
// `rowDrag` is created on the client. It carries the core `rowDragDrop`
// module and the drag controller.

export { createRowDragDropModule } from '@salmonui/data-grid/engine/row-drag-drop';
export { RowDragController } from './row-drag-controller.js';

/** Chunking hub: keeps the static graph in one chunk. Never called. */
export { DataGrid as hub } from './DataGrid.js';
