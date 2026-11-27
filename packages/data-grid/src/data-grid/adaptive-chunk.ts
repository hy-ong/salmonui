// The lazy adaptive chunk: loaded
// with dynamic `import()` by `loadAdaptiveChunk()` (adaptive-controller.ts)
// when a grid with `adaptive` is created on the client.

export { DataGridAdaptiveInteraction } from './adaptive-interaction.js';
export { FilterColumnsSheet, SortSheet } from './AdaptiveSheets.js';

/** Chunking hub: keeps the static graph in one chunk. Never called. */
export { DataGrid as hub } from './DataGrid.js';
