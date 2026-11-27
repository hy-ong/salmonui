// `lookup` render feature: the core `lookup`
// module, which rewrites lookup columns to their display values at column
// compile time, so the server render and the first client render show
// display values. The header load status is static (`lookup-status.ts`).
// Imported only by the registries and the public features entry.

import { lookupModules } from '../lookup-ui.js';
import { DataGrid } from '../DataGrid.js';
import type { DataGridFeature } from './types.js';

export const lookup: DataGridFeature = Object.freeze({
  name: 'lookup',
  hub: () => DataGrid,
  modules: (props, ctx) => lookupModules(props, ctx.modules),
} satisfies DataGridFeature);
