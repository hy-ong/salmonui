'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/charts/tree-map`: TreeMap.
// CSS: `@salmonui/charts/tree-map/styles.css`.
export { TreeMap } from './tree-map/TreeMap.js';
export type {
  TreeMapApi,
  TreeMapChangeEvent,
  TreeMapColorScale,
  TreeMapColorStop,
  TreeMapHeaderOptions,
  TreeMapItem,
  TreeMapLabelPosition,
  TreeMapLeaves,
  TreeMapLevel,
  TreeMapPath,
  TreeMapProps,
  TreeMapText,
} from './tree-map/types.js';
// Several visualizations as one image or PDF page; the combine code is a lazy chunk.
export { exportVisualizations } from './internal/viz/export-all.js';
export type { ExportableVisualization, ExportVisualizationsOptions } from './internal/viz/export-all.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/charts/tree-map', 'salmon-tree-map');
