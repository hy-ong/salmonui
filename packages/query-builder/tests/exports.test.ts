// @salmonui/query-builder export surface: the exports map follows the package manifest and
// every entry exports the names its docs list.
import { describeExportSurface } from '../../core/tests/export-surface.ts';

describeExportSurface('@salmonui/query-builder', {
  '.': ['QueryBuilder', 'QUERY_BUILDER_DEFAULT_LOCALE_TEXT'],
  './sql': ['toSql', 'SqlParseError'],
  './mongo': ['toMongo'],
});
