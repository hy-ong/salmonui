// The lazy editing chunk: loaded with
// dynamic `import()` by `loadEditChunk()` (edit-host.ts) when a grid with
// `editing` is created on the client. It carries the core `edit`,
// `validation` and `clipboard` modules and the React editing UI.

export { createEditApi, createEditModule } from '@salmonui/data-grid/engine/edit';
export { createClipboardModule } from '@salmonui/data-grid/engine/clipboard';
export { DataGridEditController } from './edit-ui.js';
export { DataGridCellEditor } from './editors.js';
export { DataGridAddedRows, DataGridEditOverlays } from './EditOverlays.js';
export { DataGridClipboardController } from './clipboard-ui.js';
export { DataGridFillHandle } from './fill-handle.js';

/** Chunking hub: keeps the static graph in one chunk. Never called. */
export { DataGrid as hub } from '../DataGrid.js';
