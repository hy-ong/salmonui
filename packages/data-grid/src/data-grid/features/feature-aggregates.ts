// `aggregates` render feature: the core
// aggregates module, the initial aggregates, the footer aggregate rows, the
// group footer rows, the group caption aggregates and the reactive
// `aggregates` / `aggregateScope` sync. Imported only by the registries and
// the public features entry.

import { aggregatesDefaultQuery, aggregatesEngineOptions, aggregatesModules, createAggregatesUi } from '../aggregate-config.js';
import { DataGridFooter, DataGridGroupCaptionAggregates, DataGridGroupFooterRow } from '../aggregate-rows.js';
import { DataGrid } from '../DataGrid.js';
import type { DataGridFeature } from './types.js';

export const aggregates: DataGridFeature = Object.freeze({
  name: 'aggregates',
  hub: () => DataGrid,
  modules: aggregatesModules,
  engineOptions: aggregatesEngineOptions,
  defaultQuery: aggregatesDefaultQuery,
  createUi: createAggregatesUi,
  parts: Object.freeze({ FooterRows: DataGridFooter, GroupFooterRow: DataGridGroupFooterRow, GroupCaptionAggregates: DataGridGroupCaptionAggregates }),
} satisfies DataGridFeature);
