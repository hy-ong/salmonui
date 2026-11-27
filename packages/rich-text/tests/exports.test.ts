// @salmonui/rich-text export surface: the exports map follows the package manifest and
// every entry exports the names its docs list.
import { describeExportSurface } from '../../core/tests/export-surface.ts';

describeExportSurface('@salmonui/rich-text', {
  '.': ['RichTextEditor', 'BlockEditor', 'RichTextContent', 'parseHtml', 'RICH_TEXT_EDITOR_DEFAULT_LOCALE_TEXT', 'BLOCK_EDITOR_DEFAULT_LOCALE_TEXT'],
  './collab': ['createCollaboration'],
});
