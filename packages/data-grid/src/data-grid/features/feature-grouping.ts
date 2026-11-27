// `grouping` render feature: the core
// grouping module (lazy groups included), the initial grouping, the group
// panel, the group caption rows, the grouping keys, the reactive grouping
// options and the group events. Imported only by the registries and the
// public features entry.

import { createGroupingUi, groupingDefaultQuery, groupingEngineOptions, groupingModules } from '../group-config.js';
import { DataGridGroupCaptionRow, DataGridGroupPanel } from '../Group.js';
import { DataGrid } from '../DataGrid.js';
import type { DataGridFeature } from './types.js';

export const grouping: DataGridFeature = Object.freeze({
  name: 'grouping',
  hub: () => DataGrid,
  modules: groupingModules,
  engineOptions: (props) => groupingEngineOptions(props),
  defaultQuery: groupingDefaultQuery,
  createUi: createGroupingUi,
  parts: Object.freeze({ GroupPanel: DataGridGroupPanel, GroupCaptionRow: DataGridGroupCaptionRow }),
} satisfies DataGridFeature);
