'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/charts/sankey-chart`:
// SankeyChart. CSS: `@salmonui/charts/sankey-chart/styles.css`.
export { SankeyChart } from './sankey-chart/SankeyChart.js';
export type { SankeyChartApi, SankeyChartProps, SankeyChartText, SankeyEvent, SankeyLink, SankeyLinkInfo, SankeyNode, SankeyNodeInfo } from './sankey-chart/types.js';
// Several visualizations as one image or PDF page; the combine code is a lazy chunk.
export { exportVisualizations } from './internal/viz/export-all.js';
export type { ExportableVisualization, ExportVisualizationsOptions } from './internal/viz/export-all.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/charts/sankey-chart', 'salmon-sankey-chart');
