'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/charts/heat-map`:
// HeatMap. Cells move to a lazy canvas chunk from 10,000 cells.
// CSS: `@salmonui/charts/heat-map/styles.css`.
export { HeatMap, HEAT_MAP_CANVAS_THRESHOLD } from './heat-map/HeatMap.js';
export type {
  HeatMapApi,
  HeatMapAxis,
  HeatMapCell,
  HeatMapCellRef,
  HeatMapCellsOptions,
  HeatMapChangeEvent,
  HeatMapColorScale,
  HeatMapLabelGroup,
  HeatMapLegendOptions,
  HeatMapProps,
  HeatMapStop,
  HeatMapText,
} from './heat-map/types.js';
// Several visualizations as one image or PDF page; the combine code is a lazy chunk.
export { exportVisualizations } from './internal/viz/export-all.js';
export type { ExportableVisualization, ExportVisualizationsOptions } from './internal/viz/export-all.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/charts/heat-map', 'salmon-heat-map');
