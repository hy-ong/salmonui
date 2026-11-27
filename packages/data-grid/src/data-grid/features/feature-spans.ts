// `spans` render feature: column and row span
// planning (`span-plans.ts`) and the span resolver of focus, selection and
// editing (`span-resolver.ts`). The cheap `spanFlags` check stays static
// (`spans.ts`). Enabled late too: spans that appear after creation (a column
// change) load this module on the client ("Late enable"). Imported only by
// the registries and the public features entry.

import { computeRowSpans, planZone } from '../span-plans.js';
import { spanBlockOf } from '../span-resolver.js';
import { DataGrid } from '../DataGrid.js';
import type { DataGridFeature } from './types.js';

export const spans: DataGridFeature = Object.freeze({
  name: 'spans',
  hub: () => DataGrid,
  parts: Object.freeze({ spans: Object.freeze({ rowSpans: computeRowSpans, planZone, block: spanBlockOf }) }),
} satisfies DataGridFeature);
