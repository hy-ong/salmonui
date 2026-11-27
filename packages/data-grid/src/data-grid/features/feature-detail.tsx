// `detail` render feature: the core detail
// module (and `hierarchy` with `childGrid`), the detail toggle column, the
// detail rows, the child grids (default-expanded ones render on the server),
// the detail keys, events and API. Imported only by the registries and the
// public features entry.

import { createDetailUi, detailEngineOptions, detailModules } from '../detail-config.js';
import { DataGridDetailRow, detailExpanded, detailToggleColumn } from '../detail.js';
import { DataGrid } from '../DataGrid.js';
import type { DataGridFeature } from './types.js';

export const detail: DataGridFeature = Object.freeze({
  name: 'detail',
  hub: () => DataGrid,
  modules: (props, ctx) => detailModules(props, ctx.modules),
  engineOptions: (props, latest) => detailEngineOptions(props, latest),
  createUi: createDetailUi,
  parts: Object.freeze({ DetailRow: DataGridDetailRow, detailToggleColumn }),
  selectors: Object.freeze({ detailExpanded }),
} satisfies DataGridFeature);
