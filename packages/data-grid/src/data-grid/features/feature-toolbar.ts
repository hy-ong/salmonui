// `toolbar` render feature: the toolbar, its
// search box and its edit state; the overflow menu stays an overlay
// chunk. Late enable: a toolbar turned on after creation loads this feature
// on the client (instance.ts `enableToolbarLate`). Imported only by the
// registries and the public features entry.

import { DataGridToolbar } from '../Toolbar.js';
import { DataGrid } from '../DataGrid.js';
import type { DataGridFeature } from './types.js';

export const toolbar: DataGridFeature = Object.freeze({
  name: 'toolbar',
  hub: () => DataGrid,
  parts: Object.freeze({ Toolbar: DataGridToolbar }),
} satisfies DataGridFeature);
