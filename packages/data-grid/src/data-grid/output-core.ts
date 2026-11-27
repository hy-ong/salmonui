// The core export model (`@salmonui/data-grid/engine/export`) as a lazy chunk
// of this package, loaded by the output facade (`output.ts`) on the first
// export or print. Loading the core subpath directly would make it a dynamic
// entry without the chunking hub, so the core modules it shares with the
// static graph would split out of the main chunk.

export * from '@salmonui/data-grid/engine/export';

/** Chunking hub: keeps the static graph in one chunk. Never called. */
export { DataGrid as hub } from './DataGrid.js';
