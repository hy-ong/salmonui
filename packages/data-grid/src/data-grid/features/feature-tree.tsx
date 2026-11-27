// `tree` render feature: the core tree module (or the remote tree adapter), the flattened
// nested source, the tree cell content (toggle, checkbox, indentation), the
// treegrid row view, child summary rows, the tree keys, events, live
// messages, toolbar items, state wrappers and API. Imported only by the
// registries and the public features entry.

import { createTreeUi, DataGridTreeFooterRow, TREE_CELL, treeEngineOptions, treeModules, treeRowView } from '../tree-ui.js';
import { DataGrid } from '../DataGrid.js';
import type { DataGridFeature } from './types.js';

export const tree: DataGridFeature = Object.freeze({
  name: 'tree',
  hub: () => DataGrid,
  modules: (props, ctx) => treeModules(props, ctx.modules, ctx.deferred),
  engineOptions: (props, latest) => treeEngineOptions(props, latest),
  createUi: (instance, ctx) => createTreeUi(instance, ctx.deferred),
  // Tree wins over grouping: group footer rows never exist in tree mode; child summary rows take the slot.
  parts: Object.freeze({ treeCell: TREE_CELL, GroupFooterRow: DataGridTreeFooterRow }),
  selectors: Object.freeze({ treeRow: treeRowView }),
} satisfies DataGridFeature);
