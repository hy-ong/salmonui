// Lazy engine entry: the only module that
// reaches ProseMirror. RichTextEditor loads it with dynamic import() from an
// effect; `loadRichTextEngine()` exposes it for headless use.
export { RichTextEngine, createEngine, createEngineSync, engineSchema } from './core.js';
export type { EngineOptions, PasteMode, UploadHandler, UploadResult } from './core.js';
export { createSchema, hostAllowed } from './schema.js';
export { serializeHtml as serializeDoc, serializeText } from './serialize.js';
export { DEFAULT_KEY_BINDINGS } from './keymap.js';
export { markActive, markValue, ancestor, safeHref } from './commands.js';
export { characterCount, findMatches } from './plugins.js';
export { toolbarState } from './snapshot.js';
export type { HighlightFn, HighlightRange, SuggestState, SuggestTrigger } from './plugins.js';
