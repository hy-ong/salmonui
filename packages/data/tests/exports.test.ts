// @salmonui/data export surface: the exports map follows the package manifest and
// every entry exports the names its docs list.
import { describeExportSurface } from '../../core/tests/export-surface.ts';

describeExportSurface('@salmonui/data', {
  '.': ['createJsonDataSource', 'createFetchTransport', 'createLiveDataSource', 'createOfflineDataSource', 'createSavedViews', 'createLookup', 'ProtocolError', 'PROTOCOL_VERSION'],
  './json': ['createJsonDataSource', 'createJsonPivotSource', 'createFetchTransport', 'createBatchingFetchTransport', 'toWireQuery', 'PROTOCOL_VERSION'],
  './local': ['createOfflineDataSource'],
  './stream': ['createLiveDataSource'],
  './storage': ['createJsonStateStorage', 'createKeyValueStateStorage', 'createMemoryStore'],
  './views': ['createSavedViews', 'SAVED_VIEW_SCHEMA_VERSION'],
  './lookup': ['createLookup', 'createJsonLookup'],
  './server': ['createJsonQueryHandler', 'createPivotQueryHandler'],
}, { unlistedEntries: ['.', './json', './local', './stream', './storage', './views', './lookup', './server'] });
