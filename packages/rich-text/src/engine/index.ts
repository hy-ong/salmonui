// Barrel of src/engine (see ../index.ts): engine types and the lazy loader.
// Nothing here loads ProseMirror at module scope.
export type * from './types.js';
export type { EngineOptions, RichTextEngine, PasteMode, UploadHandler, UploadResult } from './core.js';
export type { HighlightFn, HighlightRange } from './plugins.js';

/** Loads the headless ProseMirror engine on demand: `const { createEngine } = await loadRichTextEngine()`. */
export function loadRichTextEngine(): Promise<typeof import('./load.js')> {
  return import('./load.js');
}
