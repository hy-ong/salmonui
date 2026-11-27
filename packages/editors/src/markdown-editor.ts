'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/editors/markdown-editor`: MarkdownEditor, a Markdown editor as its
// own component.
// Styles: `@salmonui/editors/markdown-editor/styles.css` (self-contained: it
// carries the Button and Menu rules the toolbar composes).
export { MarkdownEditor, shortcutCommand } from './markdown-editor/MarkdownEditor.js';
export { MARKDOWN_DEFAULT_LOCALE_TEXT, MARKDOWN_DEFAULT_TOOLBAR } from './markdown-editor/items.js';
export {
  applyCommand as applyMarkdownCommand,
  continueList as continueMarkdownList,
  DEFAULT_MARKDOWN_SYNTAX,
  imageMarkdown,
  linkMarkdown,
  tableMarkdown,
} from './markdown-editor/commands.js';
export type { MarkdownSyntax, MarkdownTextCommand, TextState as MarkdownTextState } from './markdown-editor/commands.js';
export type {
  MarkdownBeforeCommandEvent,
  MarkdownCommandEvent,
  MarkdownEditorApi,
  MarkdownEditorLocaleText,
  MarkdownEditorPart,
  MarkdownEditorProps,
  MarkdownEditorSource,
  MarkdownPreviewMode,
  MarkdownToggleEvent,
  MarkdownToolbarCustomItem,
  MarkdownToolbarItem,
  MarkdownToolbarItemId,
  MarkdownUploadResult,
  MarkdownValueChangeEvent,
} from './markdown-editor/types.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/editors/markdown-editor', 'salmon-markdown-editor');
