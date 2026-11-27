// @salmonui/core export surface: the exports map follows the package manifest and
// every entry exports the names its docs list.
import { describeExportSurface } from './export-surface.ts';

describeExportSurface('@salmonui/core', {
  './theme': ['ThemeProvider', 'defaultSalmonTheme'],
  './server': ['ThemeStyle', 'createThemeCss'],
  './format': ['createFormatter', 'createValueFormatter', 'formatValue', 'parseNumber'],
  './validation': ['compileValidationRules', 'DEFAULT_VALIDATION_MESSAGES', 'NO_ERRORS'],
  './data': ['stableStringify', 'normalizeFilterOperator', 'compilePattern'],
  './virtual': ['createFixedRowMetrics', 'createVariableRowMetrics', 'createColumnMetrics', 'createScrollMapping'],
  './dates': ['toDate', 'toPlainDate', 'toPlainDateTime', 'toPlainTime'],
  './export-model': ['createExportModel', 'exportCsv', 'streamCsv', 'writeCsv', 'exportFileName', 'toExportModelOptions'],
  './locale': ['LocaleProvider', 'useLocale'],
  './locale/zh-TW': ['zhTW', 'locale', 'pager', 'dataGrid', 'validation', 'dialog'],
});
