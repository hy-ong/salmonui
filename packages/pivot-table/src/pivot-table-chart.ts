'use client';

// `@salmonui/pivot-table/chart`: `PivotChart` draws every pivot
// chart type with the real chart family, loaded on demand. It is a separate
// entry so `@salmonui/pivot-table` stays free of chart code.
// CSS: `chart/styles.css` for cartesian, polar and radar types,
// `pie-chart/styles.css` for pie, doughnut, funnel and pyramid.
export { PivotChart, pivotAccumulationProps, pivotChartFamily } from './pivot-table/chart-view.js';
export type { PivotAccumulationProps, PivotChartFamily, PivotChartViewProps } from './pivot-table/chart-view.js';
