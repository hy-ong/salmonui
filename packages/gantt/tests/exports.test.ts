// @salmonui/gantt export surface: the exports map follows the package manifest and
// every entry exports the names its docs list.
import { describeExportSurface } from '../../core/tests/export-surface.ts';

describeExportSurface('@salmonui/gantt', {
  '.': ['Gantt', 'parseDependencies', 'GANTT_DEFAULT_LOCALE_TEXT'],
});
