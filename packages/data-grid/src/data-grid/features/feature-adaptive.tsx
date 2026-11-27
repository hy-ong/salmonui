// `adaptive` render feature: the adaptive
// controller (`instance.adaptive`), the vertical card rows, the adaptive bar
// and the slot of the adaptive sheets (the sheets and the touch long-press
// stay the lazy adaptive chunk). The mode hook and the view context are static
// (`adaptive-view.ts`). Imported only by the registries and the public
// features entry.

import { DataGridAdaptiveBar, DataGridAdaptiveOverlays, DataGridCardRow } from '../Adaptive.js';
import { DataGridAdaptiveController } from '../adaptive-controller.js';
import { DataGrid } from '../DataGrid.js';
import type { DataGridFeature, DataGridFeatureParts } from './types.js';

export const adaptive: DataGridFeature = Object.freeze({
  name: 'adaptive',
  hub: () => DataGrid,
  createUi: (instance) => {
    instance.adaptive = new DataGridAdaptiveController(instance);
    return {};
  },
  parts: Object.freeze({
    CardRow: DataGridCardRow as DataGridFeatureParts['CardRow'],
    AdaptiveBar: DataGridAdaptiveBar,
    AdaptiveOverlays: DataGridAdaptiveOverlays,
  }),
} satisfies DataGridFeature);
