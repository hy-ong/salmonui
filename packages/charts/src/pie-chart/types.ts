import type { CSSProperties, ReactNode, Ref } from 'react';
import type { VizChangeEvent } from '../internal/viz/frame.js';
import type { VizExportOptions, VizInstance } from '../internal/viz/instance.js';

/** Instance passed to `ref`. */
export type AccumulationApi = VizInstance;
export type PieChartApi = AccumulationApi;
export type FunnelChartApi = AccumulationApi;
export type { VizExportOptions as AccumulationExportOptions };

export type AccumulationChangeEvent = VizChangeEvent<'click' | 'legend' | 'keyboard'>;

export interface AccumulationPoint {
  /** Ring (series) index; 0 without `series`. */
  readonly series: number;
  /** Index in the series data (`-1` for the grouped "Others" slice). */
  readonly index: number;
  readonly label: string;
  readonly value: number;
  /** Share of the visible total of its ring, 0..1. */
  readonly fraction: number;
  readonly color: string;
  /** The record, or null for "Others". */
  readonly datum: unknown;
}

export interface AccumulationPointRef {
  readonly series: number;
  readonly index: number;
}

export interface AccumulationPointStyle {
  /** Data color. */
  readonly color?: string | undefined;
}

export interface AccumulationTooltipOptions {
  readonly format?: ((point: AccumulationPoint) => string) | undefined;
  readonly render?: ((point: AccumulationPoint) => ReactNode) | undefined;
}

export interface AccumulationLegendOptions {
  readonly position?: 'top' | 'bottom' | 'start' | 'end' | undefined;
  readonly title?: string | undefined;
  /** Clicking a legend item hides its points (`hiddenPoints`). Default true. */
  readonly toggle?: boolean | undefined;
}

export interface AccumulationAnnotation {
  /** Drawing px or a percent of the width / height (`'50%'`). */
  readonly x: number | string;
  readonly y: number | string;
  readonly content: ReactNode;
}

export interface AccumulationSeries {
  readonly data?: readonly unknown[] | undefined;
  readonly valueField?: string | undefined;
  readonly labelField?: string | undefined;
  readonly name?: string | undefined;
}

export interface AccumulationBaseProps {
  /** Records, or numbers (labels then default to "1", "2", ...). */
  readonly data?: readonly unknown[] | undefined;
  readonly valueField?: string | undefined;
  readonly labelField?: string | undefined;
  /** Record field holding a data color (`pointColorMapping`). */
  readonly colorField?: string | undefined;
  /** Data colors by point index; default the derived `--salmon-chart-*` palette. */
  readonly palette?: readonly string[] | undefined;
  /** Overlay one system fill pattern per palette slot (non-color encoding). */
  readonly patterns?: boolean | undefined;
  readonly emptyPoints?: 'drop' | 'zero' | 'average' | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly title?: string | undefined;
  readonly subtitle?: string | undefined;
  /** Accessible description; default the automatic summary. */
  readonly description?: string | undefined;
  readonly locale?: string | undefined;
  readonly format?: Intl.NumberFormatOptions | ((value: number) => string) | undefined;
  readonly legend?: boolean | AccumulationLegendOptions | undefined;
  readonly tooltip?: boolean | AccumulationTooltipOptions | undefined;
  /** Dim the other points while one is hovered or focused. Default true. */
  readonly highlight?: boolean | undefined;
  /** Click and Enter select points. */
  readonly selection?: boolean | { readonly multiple?: boolean | undefined } | undefined;
  readonly hiddenPoints?: readonly number[] | undefined;
  readonly defaultHiddenPoints?: readonly number[] | undefined;
  readonly onHiddenPointsChange?: ((hidden: readonly number[], event: AccumulationChangeEvent) => void) | undefined;
  readonly selectedPoints?: readonly AccumulationPointRef[] | undefined;
  readonly defaultSelectedPoints?: readonly AccumulationPointRef[] | undefined;
  readonly onSelectedPointsChange?: ((selected: readonly AccumulationPointRef[], event: AccumulationChangeEvent) => void) | undefined;
  readonly annotations?: readonly AccumulationAnnotation[] | undefined;
  readonly getPointStyle?: ((point: AccumulationPoint) => AccumulationPointStyle | undefined) | undefined;
  readonly formatLabel?: ((point: AccumulationPoint) => string) | undefined;
  readonly onPointClick?: ((point: AccumulationPoint, event: AccumulationChangeEvent) => void) | undefined;
  readonly onPointHover?: ((point: AccumulationPoint | null) => void) | undefined;
  /** Visible accessible data table (`showDataTable`). */
  readonly showDataTable?: boolean | undefined;
  /** `false` leaves the visually hidden data table out. */
  readonly accessibleTable?: boolean | undefined;
  readonly renderEmpty?: (() => ReactNode) | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly id?: string | undefined;
  readonly ref?: Ref<AccumulationApi> | undefined;
  readonly onResize?: ((size: { readonly width: number; readonly height: number }) => void) | undefined;
  /**
   * Entrance and update transitions, default `true`: client only
   * (never in server markup), off under `prefers-reduced-motion`. The CSS is
   * the opt-in `@salmonui/charts/viz-animations.css`.
   */
  readonly animated?: boolean | undefined;
}

export type PieLabelPosition = 'inside' | 'outside' | 'auto';

/** Built-in text of a PieChart (`text` prop; the `pieChart` entry of a `LocaleProvider` catalog). */
export interface PieChartText {
  /** Kind named in the role description, the summary and the default name. */
  readonly pieChart: string;
  /** The kind with `innerRadius`. */
  readonly doughnutChart: string;
  /** Label of the `groupSmall` slice. */
  readonly others: string;
  readonly legend: string;
}

export interface PieChartProps extends AccumulationBaseProps {
  /** Built-in text (over the nearest `LocaleProvider`'s `pieChart` entry). */
  readonly text?: Partial<PieChartText> | undefined;
  /** Concentric rings, inner to outer; overrides `data` / `valueField` / `labelField`. */
  readonly series?: readonly AccumulationSeries[] | undefined;
  /** Outer radius: px or a percent of the half of the shorter side (`'80%'`). Default `'80%'`. */
  readonly radius?: number | string | undefined;
  /** Doughnut hole: px, or a percent of the radius (`'50%'`). Default 0. */
  readonly innerRadius?: number | string | undefined;
  /** Center as percents of the plot (`{ x: '50%', y: '50%' }`) or px. */
  readonly center?: { readonly x?: number | string | undefined; readonly y?: number | string | undefined } | undefined;
  /** Degrees clockwise from 12 o'clock. Default 0 and 360. */
  readonly startAngle?: number | undefined;
  readonly endAngle?: number | undefined;
  /** Gap between slices, degrees. */
  readonly padAngle?: number | undefined;
  /** Explosion: offset px (default 10) and `all`; click toggles when set. */
  readonly explode?: boolean | { readonly offset?: number | undefined; readonly all?: boolean | undefined } | undefined;
  readonly explodedPoints?: readonly number[] | undefined;
  readonly defaultExplodedPoints?: readonly number[] | undefined;
  readonly onExplodedPointsChange?: ((exploded: readonly number[], event: AccumulationChangeEvent) => void) | undefined;
  /** Merge small slices into one "Others" slice. */
  readonly groupSmall?: { readonly threshold: number; readonly by?: 'value' | 'count' | undefined; readonly label?: string | undefined } | undefined;
  readonly labels?: boolean | { readonly position?: PieLabelPosition | undefined; readonly connector?: 'line' | 'curve' | undefined; readonly maxWidth?: number | undefined } | undefined;
  /** Doughnut center content; a function receives the hovered or focused point (null at rest). */
  readonly centerLabel?: ReactNode | ((context: { readonly point: AccumulationPoint | null; readonly total: number }) => ReactNode);
  /** `small`: no legend, no labels, no title (the pie sparkline). */
  readonly size?: 'small' | 'default' | undefined;
}

/** Built-in text of a FunnelChart (`text` prop; the `funnelChart` entry of a `LocaleProvider` catalog). */
export interface FunnelChartText {
  /** Kind named in the role description, the summary and the default name. */
  readonly funnelChart: string;
  /** The kind with `shape="pyramid"`. */
  readonly pyramidChart: string;
  readonly legend: string;
}

export interface FunnelChartProps extends AccumulationBaseProps {
  /** Built-in text (over the nearest `LocaleProvider`'s `funnelChart` entry). */
  readonly text?: Partial<FunnelChartText> | undefined;
  readonly shape?: 'funnel' | 'pyramid' | undefined;
  /** Funnel neck size, px or a percent of the width / height. Defaults `'20%'`. */
  readonly neckWidth?: number | string | undefined;
  readonly neckHeight?: number | string | undefined;
  /** Gap between segments, px. Default 2 (10 with `variant="trapezoidal"`). */
  readonly gap?: number | undefined;
  /**
   * Funnel drawing: `standard` (default) is a cone
   * with a neck; `trapezoidal` draws equal-height bars as wide as value /
   * max, joined by translucent trapezoids, and ignores the neck. Funnel only.
   */
  readonly variant?: 'standard' | 'trapezoidal' | undefined;
  /** Pyramid `linear` (height by value) or `area` (area by value). */
  readonly mode?: 'linear' | 'area' | undefined;
  /** Segment labels: inside (default) or outside to the end side, or none. */
  readonly labels?: boolean | { readonly position?: 'inside' | 'outside' | undefined } | undefined;
}
