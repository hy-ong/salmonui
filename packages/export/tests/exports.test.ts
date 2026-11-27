// @salmonui/export export surface: the exports map follows the package manifest and
// every entry exports the names its docs list.
import { describeExportSurface } from '../../core/tests/export-surface.ts';

describeExportSurface('@salmonui/export', {
  './blob': ['toBlob'],
  './xlsx': ['writeXlsx', 'exportXlsx', 'XLSX_MIME_TYPE'],
  './pdf': ['writePdf', 'exportPdf', 'PDF_MIME_TYPE'],
  './graphics': ['writeGraphicsPdf', 'parseSvgXml', 'parseColor'],
  './image': ['ImageStore'],
  './ics': ['writeICalendar', 'parseICalendar', 'exportICalendar', 'ICS_MIME_TYPE'],
  './pivot': ['exportPivot', 'streamPivotCsv', 'createPivotExportModel'],
  './gantt': ['exportGanttPdf'],
});
