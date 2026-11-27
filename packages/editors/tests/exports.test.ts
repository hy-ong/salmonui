// @salmonui/editors export surface: the exports map follows the package manifest and
// every entry exports the names its docs list.
import { describeExportSurface } from '../../core/tests/export-surface.ts';

describeExportSurface('@salmonui/editors', {
  './inline-edit': ['InlineEdit', 'INLINE_EDIT_DEFAULT_LOCALE_TEXT'],
  './markdown-editor': ['MarkdownEditor', 'MARKDOWN_DEFAULT_LOCALE_TEXT', 'MARKDOWN_DEFAULT_TOOLBAR'],
  './image-editor': ['ImageEditor', 'IMAGE_EDITOR_DEFAULT_LOCALE_TEXT', 'IMAGE_EDITOR_DEFAULT_TOOLBAR'],
});
