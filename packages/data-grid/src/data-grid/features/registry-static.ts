// Static render feature registry (`#data-grid-features` under the `default`,
// `workerd`, `worker` and `edge-light` conditions and for TypeScript).
// Imports every feature statically and
// always answers synchronously: the server never suspends and never renders
// the placeholder. Each feature has its import and entry here and its
// loader in registry-lazy.ts.

import { mergeFeatures } from './inert.js';
import { paging } from './feature-paging.js';
import { grouping } from './feature-grouping.js';
import { aggregates } from './feature-aggregates.js';
import { detail } from './feature-detail.js';
import { search } from './feature-search.js';
import { toolbar } from './feature-toolbar.js';
import { rowPinning } from './feature-row-pinning.js';
import { lookup } from './feature-lookup.js';
import { persistState } from './feature-persist-state.js';
import { adaptive } from './feature-adaptive.js';
import { infiniteScroll } from './feature-infinite-scroll.js';
import { spans } from './feature-spans.js';
import { editing } from './feature-editing.js';
import { rowDrag } from './feature-row-drag.js';
import { tree } from './feature-tree.js';
import type { DataGridFeature, DataGridFeatureName, ReadFeatures } from './types.js';

/**
 * Built on the first read, not at module evaluation: a feature module that
 * renders a `DataGrid` (`detail`, child grids) or imports its chunking hub
 * (`DataGridFeature.hub`) reaches this registry back through `DataGrid.tsx`,
 * so when the public features entry is evaluated first its bindings are not
 * initialized yet while this module runs.
 */
let FEATURES: Readonly<Partial<Record<DataGridFeatureName, DataGridFeature>>> | null = null;
const all = (): Readonly<Partial<Record<DataGridFeatureName, DataGridFeature>>> =>
  (FEATURES ??= Object.freeze({
    grouping,
    aggregates,
    paging,
    detail,
    spans,
    editing,
    rowDrag,
    search,
    toolbar,
    rowPinning,
    lookup,
    persistState,
    adaptive,
    infiniteScroll,
    tree,
  }));

/** The features for `needed`, with `provided` merged in (the provided object wins). Never a thenable. */
export const readFeatures: ReadFeatures = (needed, provided) => mergeFeatures(needed, provided, (name) => all()[name]);
