'use client';

// `PivotChart`: routes a pivot chart type to the family that draws
// it. Cartesian types render `Chart`, polar and radar render `Chart` with
// `features={[polar]}`, pie and doughnut render `PieChart`, funnel and
// pyramid render `FunnelChart`. Each family is a lazy chunk.

import { lazy, Suspense, useMemo, type CSSProperties, type ReactNode, type Ref } from 'react';
import type { ChartApi, ChartPointContext, ChartProps } from '@salmonui/charts/chart';
import type { AccumulationApi, AccumulationPoint, AccumulationSeries, FunnelChartProps, PieChartProps } from '@salmonui/charts/pie-chart';
import { drillChartPoint, pivotChartPropsOf, usePivotChartData, type PivotChartData, type PivotChartPropsOptions, type PivotChartSeriesType } from './chart.js';
import type { PivotController } from './controller.js';
import { defined } from './grid-model.js';

const LazyChart = lazy(() => import('@salmonui/charts/chart').then((m) => ({ default: m.Chart })));
const LazyPolarChart = lazy(async () => {
  const [{ Chart }, { polar }] = await Promise.all([import('@salmonui/charts/chart'), import('@salmonui/charts/chart/features')]);
  const features = [polar];
  return { default: (props: ChartProps) => <Chart {...props} features={features} /> };
});
const LazyPieChart = lazy(() => import('@salmonui/charts/pie-chart').then((m) => ({ default: m.PieChart })));
const LazyFunnelChart = lazy(() => import('@salmonui/charts/pie-chart').then((m) => ({ default: m.FunnelChart })));

export type PivotChartFamily = 'cartesian' | 'polar' | 'pie' | 'funnel';

/** The chart family that draws a pivot chart type. */
export function pivotChartFamily(type: PivotChartSeriesType): PivotChartFamily {
  if (type === 'polar' || type === 'radar') return 'polar';
  if (type === 'pie' || type === 'doughnut') return 'pie';
  if (type === 'funnel' || type === 'pyramid') return 'funnel';
  return 'cartesian';
}

export interface PivotAccumulationProps {
  readonly data?: PieChartProps['data'];
  readonly valueField?: string;
  readonly labelField?: string;
  /** One ring per pivot series (pie and doughnut with more than one series). */
  readonly series?: readonly AccumulationSeries[];
  readonly innerRadius?: string;
  readonly shape?: 'funnel' | 'pyramid';
  readonly onPointClick: NonNullable<PieChartProps['onPointClick']>;
}

/**
 * `PieChart` / `FunnelChart` props of pivot chart data. Pie and doughnut draw
 * one ring per series (or only `seriesId`); funnel and pyramid draw `seriesId`,
 * default the first series. A click drills the pivot like a `Chart` point.
 */
export function pivotAccumulationProps<Row>(pivot: PivotController<Row>, chart: PivotChartData, type: PivotChartSeriesType, options: PivotChartPropsOptions & { readonly seriesId?: string | undefined } = {}): PivotAccumulationProps {
  const family = pivotChartFamily(type);
  const chosen = options.seriesId === undefined ? chart.series : chart.series.filter((s) => s.id === options.seriesId);
  const list = family === 'funnel' ? chosen.slice(0, 1) : chosen;
  const drill = options.drill ?? 'auto';
  const onPointClick: PivotAccumulationProps['onPointClick'] = (point: AccumulationPoint, event) => {
    const series = list[point.series];
    // The grouped "Others" slice (index -1) has no pivot cell.
    if (!series || point.index < 0) return;
    if (drill !== false) drillChartPoint(pivot, chart, series.id, point.index, drill);
    const ctx: ChartPointContext = {
      seriesId: series.id,
      seriesName: series.name,
      index: point.index,
      datum: point.datum as ChartPointContext['datum'],
      x: point.label,
      y: point.value,
      xText: point.label,
      yText: String(point.value),
      color: point.color,
    };
    options.onPointClick?.(ctx, chart.pointAt(series.id, point.index), event as unknown as Parameters<NonNullable<PivotChartPropsOptions['onPointClick']>>[2]);
  };
  const shape = family === 'funnel' ? { shape: type === 'pyramid' ? ('pyramid' as const) : ('funnel' as const) } : type === 'doughnut' ? { innerRadius: '50%' } : {};
  if (list.length > 1) return { ...shape, series: list.map((s) => ({ data: chart.data, valueField: s.yField, labelField: 'category', name: s.name })), onPointClick };
  return { ...shape, data: chart.data, labelField: 'category', ...(list[0] ? { valueField: list[0].yField } : {}), onPointClick };
}

export interface PivotChartViewProps<Row> extends PivotChartPropsOptions {
  readonly pivot: PivotController<Row>;
  /** Pie, doughnut, funnel, pyramid: the series to draw (`s0`, ...). */
  readonly seriesId?: string | undefined;
  readonly title?: string | undefined;
  readonly legend?: boolean | undefined;
  readonly tooltip?: boolean | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  /** Shown while the chart family loads. Default none. */
  readonly fallback?: ReactNode;
  /** Extra `Chart` props (cartesian, polar and radar types). */
  readonly chartProps?: Partial<ChartProps> | undefined;
  /** Extra `PieChart` / `FunnelChart` props. */
  readonly accumulationProps?: Partial<PieChartProps & FunnelChartProps> | undefined;
  readonly ref?: Ref<ChartApi | AccumulationApi> | undefined;
}

/** A pivot chart of any type, drawn by the family of that type. */
export function PivotChart<Row>(props: PivotChartViewProps<Row>): ReactNode {
  const { pivot, type = 'column', measure, seriesBy, includeTotals, labelSeparator, drill, onPointClick, xAxis, yAxis, seriesId, title, legend, tooltip, width, height, className, style, fallback = null, chartProps, accumulationProps, ref } = props;
  const chart = usePivotChartData(pivot, defined({ type, measure, seriesBy, includeTotals, labelSeparator }));
  const family = pivotChartFamily(type);
  const adapted = useMemo(() => {
    const options = defined({ drill, onPointClick, xAxis, yAxis, seriesId });
    return family === 'pie' || family === 'funnel' ? pivotAccumulationProps(pivot, chart, type, options) : pivotChartPropsOf(pivot, chart, options);
  }, [pivot, chart, family, type, drill, onPointClick, xAxis, yAxis, seriesId]);
  const common = defined({ title, legend, tooltip, width, height, className, style });
  let content: ReactNode;
  if (family === 'pie') content = <LazyPieChart {...(adapted as PivotAccumulationProps)} {...common} {...accumulationProps} ref={ref as Ref<AccumulationApi>} />;
  else if (family === 'funnel') content = <LazyFunnelChart {...(adapted as PivotAccumulationProps)} {...common} {...(accumulationProps as Partial<FunnelChartProps>)} ref={ref as Ref<AccumulationApi>} />;
  else if (family === 'polar') content = <LazyPolarChart {...(adapted as ChartProps)} {...common} {...chartProps} ref={ref as Ref<ChartApi>} />;
  else content = <LazyChart {...(adapted as ChartProps)} {...common} {...chartProps} ref={ref as Ref<ChartApi>} />;
  return <Suspense fallback={fallback}>{content}</Suspense>;
}
