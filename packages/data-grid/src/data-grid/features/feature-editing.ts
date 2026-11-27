// `editing` render feature: the edit host
// (`edit` / `clipboard` stand-ins, keys, UI commands, the editing API), the
// always-visible add row and the edit slots, and the per-row and
// per-cell edit marks. The editing behavior is the lazy `edit-chunk`,
// warmed in parallel with this feature. Imported only by the registries and
// the public features entry.

import type { DataGridModule } from '@salmonui/data-grid/engine';
import { DataGridEditUi, editModules, loadEditChunk } from '../editing/edit-host.js';
import { DataGridEditSlot, editCellView, editRowAttrs } from '../editing/edit-view.js';
import { DataGrid } from '../DataGrid.js';
import type { DataGridFeature } from './types.js';

export const editing: DataGridFeature = Object.freeze({
  name: 'editing',
  hub: () => DataGrid,
  modules: (props, ctx) => editModules(props, ctx.modules as readonly DataGridModule<unknown, never, never>[], ctx.deferred) as readonly DataGridModule<unknown>[],
  engineOptions: (props, latest) => DataGridEditUi.engineOptions(props, latest),
  createUi: (instance, ctx) => new DataGridEditUi(instance, ctx.deferred),
  parts: Object.freeze({ EditSlot: DataGridEditSlot }),
  selectors: Object.freeze({ editCellView, editRowAttrs }),
  warm: Object.freeze([loadEditChunk]),
} satisfies DataGridFeature);
