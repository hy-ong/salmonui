'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/charts/pie-chart`:
// PieChart and FunnelChart. No axes, ticks or cartesian series code.
// CSS: `@salmonui/charts/pie-chart/styles.css`.
export { PieChart } from './pie-chart/PieChart.js';
export { FunnelChart } from './pie-chart/FunnelChart.js';
export type {
  AccumulationAnnotation,
  AccumulationApi,
  AccumulationBaseProps,
  AccumulationChangeEvent,
  AccumulationExportOptions,
  AccumulationLegendOptions,
  AccumulationPoint,
  AccumulationPointRef,
  AccumulationPointStyle,
  AccumulationSeries,
  AccumulationTooltipOptions,
  FunnelChartApi,
  FunnelChartProps,
  FunnelChartText,
  PieChartApi,
  PieChartProps,
  PieChartText,
  PieLabelPosition,
} from './pie-chart/types.js';
// Several visualizations as one image or PDF page; the combine code is a lazy chunk.
export { exportVisualizations } from './internal/viz/export-all.js';
export type { ExportableVisualization, ExportVisualizationsOptions } from './internal/viz/export-all.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/charts/pie-chart', 'salmon-pie-chart');
