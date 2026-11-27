// `persistState` render feature: the storage
// binding, which restores the stored state in the instance mount effect,
// after hydration and before the first paint. The state API stays static
// (`state-api.ts`). Imported only by the registries and the public features
// entry.

import { mountPersistState } from '../persist-state.js';
import { DataGrid } from '../DataGrid.js';
import type { DataGridFeature } from './types.js';

export const persistState: DataGridFeature = Object.freeze({
  name: 'persistState',
  hub: () => DataGrid,
  createUi: (instance) => ({ mount: () => mountPersistState(instance) }),
} satisfies DataGridFeature);
