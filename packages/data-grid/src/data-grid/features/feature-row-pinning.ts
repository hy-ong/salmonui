// `rowPinning` render feature: the core
// `rowPinning` module and its engine options. Pinned rows render through the
// static body (sticky top rowgroup) and the API methods are static
// (`row-pinning-api.ts`), so the feature adds no part. Imported only by the
// registries and the public features entry.

import { rowPinningEngineOptions, rowPinningModules } from '../row-pinning.js';
import { DataGrid } from '../DataGrid.js';
import type { DataGridFeature } from './types.js';

export const rowPinning: DataGridFeature = Object.freeze({
  name: 'rowPinning',
  hub: () => DataGrid,
  modules: (props, ctx) => rowPinningModules(props, ctx.modules),
  engineOptions: (props) => rowPinningEngineOptions(props),
} satisfies DataGridFeature);
