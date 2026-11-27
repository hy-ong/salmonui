// Barrel of src/html (see ../index.ts): the server-safe, DOM-free HTML layer
// (parser, serializer, sanitizer, paste cleanup, text conversion).
export { parseHtml, type HtmlElement, type HtmlText, type HtmlComment, type HtmlNode } from './parse.js';
export { serializeHtml, escapeHtml, escapeAttribute, type SerializeHtmlOptions } from './serialize.js';
export {
  sanitizeHtml,
  sanitizeNodes,
  type SanitizeHtmlOptions,
  type SanitizeHook,
  type SanitizeHookResult,
  type SanitizeElement,
} from './sanitize.js';
export { cleanUrl as sanitizeUrl, embedAllowed, type SanitizeAllow, type UrlUse } from './policy.js';
export { htmlToText, plainTextToHtml, type HtmlToTextOptions } from './text.js';
export {
  cleanPastedHtml,
  detectPasteSource,
  pasteNeedsPrompt,
  type PasteCleanupMode,
  type ResolvedPasteCleanupMode,
  type PasteCleanupOptions,
  type PasteSource,
} from './paste.js';
