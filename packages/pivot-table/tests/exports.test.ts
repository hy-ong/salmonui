// @salmonui/pivot-table export surface: the exports map follows the package manifest and
// every entry exports the names its docs list.
import { describeExportSurface } from '../../core/tests/export-surface.ts';

describeExportSurface('@salmonui/pivot-table', {
  '.': ['PivotTable', 'PivotFieldList', 'PivotToolbar', 'usePivot', 'usePivotState', 'PIVOT_DEFAULT_LOCALE_TEXT'],
  './chart': ['PivotChart'],
  './engine': ['createPivotEngine', 'createPivotWorkerEngine', 'createPivotJob', 'parseCsv', 'DEFAULT_PIVOT_MODEL', 'PivotFormulaError', 'PivotWorkerError'],
  './engine/formula': ['compileFormula', 'PivotFormulaError'],
  './engine/worker': ['attachPivotWorker'],
});
