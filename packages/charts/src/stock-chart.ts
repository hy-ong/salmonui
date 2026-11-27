'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/charts/stock-chart`:
// StockChart over `/chart`, `/range-selector` and `/menu`. CSS: the chart,
// range-selector, menu and button stylesheets plus
// `@salmonui/charts/stock-chart/styles.css`.

export { indicatorSeries, StockChart } from './stock-chart/StockChart.js';
export type { IndicatorKind, StockChangeEvent, StockChartProps, StockEvent, StockExportFormat, StockSeriesType, TrendlineKind } from './stock-chart/StockChart.js';
// Several visualizations as one image or PDF page, through the public /chart entry.

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/charts/stock-chart', 'salmon-stock-chart');
