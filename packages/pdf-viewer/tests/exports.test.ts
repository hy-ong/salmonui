// @salmonui/pdf-viewer export surface: the exports map follows the package manifest and
// every entry exports the names its docs list.
import { describeExportSurface } from '../../core/tests/export-surface.ts';

describeExportSurface('@salmonui/pdf-viewer', {
  '.': ['PdfViewer', 'PDF_VIEWER_DEFAULT_LOCALE_TEXT', 'PDF_VIEWER_DEFAULT_TOOLBAR'],
});
