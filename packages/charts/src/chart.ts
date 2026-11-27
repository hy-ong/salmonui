'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/charts/chart`: Chart,
// its JSX children forms and ChartSyncGroup (BulletChart is the
// `@salmonui/charts/chart/bullet` subpath). CSS:
// `@salmonui/charts/chart/styles.css`.

export { Chart } from './chart/Chart.js';
export { ChartAxis, ChartSeries } from './chart/ChartSeries.js';
export type { ChartAxisProps, ChartSeriesProps } from './chart/ChartSeries.js';
export { ChartSyncGroup } from './chart/ChartSyncGroup.js';
export type { ChartSyncGroupProps } from './chart/ChartSyncGroup.js';
export type {
  ChartAnnotation,
  ChartApi,
  ChartAxisBand,
  ChartAxisLabelContext,
  ChartAxisLabelGroup,
  ChartAxisLine,
  ChartAxisOptions,
  ChartChangeEvent,
  ChartColorRange,
  ChartCrosshairOptions,
  ChartCurve,
  ChartDataLabels,
  ChartDatum,
  ChartErrorBars,
  ChartExportOptions,
  ChartExportWriters,
  ChartFeature,
  ChartFormat,
  ChartIndicator,
  ChartLabelOverlap,
  ChartLegendItem,
  ChartLegendOptions,
  ChartLegendShape,
  ChartLineStyle,
  ChartMarkerShape,
  ChartMarkers,
  ChartPaneSize,
  ChartPlotPoint,
  ChartPointContext,
  ChartPointRef,
  ChartProps,
  ChartScale,
  ChartSegment,
  ChartSeriesOptions,
  ChartSeriesType,
  ChartText,
  ChartTooltipContext,
  ChartTooltipOptions,
  ChartTrendline,
  ChartZoomOptions,
  ChartZoomRange,
  ChartZoomTool,
} from './chart/types.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/charts/chart', 'salmon-chart');
