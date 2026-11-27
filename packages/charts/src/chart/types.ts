// Public types of `@salmonui/charts/chart`. Declared here, not
// in `#viz`, so the engine can move to its own package without a public
// import change.

import type { CSSProperties, DOMAttributes, MouseEvent, PointerEvent, ReactNode, Ref } from 'react';
import type { VizExportWriters } from '../internal/viz/instance.js';

export type ChartSeriesType =
  | 'line'
  | 'area'
  | 'column'
  | 'bar'
  | 'scatter'
  | 'bubble'
  | 'hilo'
  | 'ohlc'
  | 'candle'
  | 'waterfall'
  | 'histogram'
  | 'boxPlot'
  | 'pareto'
  | 'bullet';

export type ChartCurve = 'linear' | 'natural' | 'monotone' | 'cardinal' | 'clamped' | 'step';
export type ChartLineStyle = 'solid' | 'dashed' | 'dotted';
export type ChartMarkerShape =
  | 'circle'
  | 'rectangle'
  | 'triangle'
  | 'invertedTriangle'
  | 'diamond'
  | 'cross'
  | 'plus'
  | 'multiply'
  | 'horizontalLine'
  | 'verticalLine'
  | 'pentagon'
  | 'star'
  | 'none';
export type ChartLegendShape = ChartMarkerShape | 'seriesType';

/** A number preset (`'n2'`, `'c0'`, `'p1'`), a `{value}` template (`'{value} °C'`), or `Intl` options. */
export type ChartFormat = string | Intl.NumberFormatOptions | Intl.DateTimeFormatOptions;

/** A datum: a plain record read by field names (nested paths allowed, `'price.close'`). */
export type ChartDatum = Readonly<Record<string, unknown>>;

export interface ChartPointContext {
  readonly seriesId: string;
  readonly seriesName: string;
  readonly index: number;
  readonly datum: ChartDatum;
  readonly x: unknown;
  readonly y: number;
  /** Formatted x and y as shown in tooltips and the table. */
  readonly xText: string;
  readonly yText: string;
  readonly color: string;
}

export interface ChartMarkers {
  readonly shape?: ChartMarkerShape | undefined;
  readonly size?: number | undefined;
  readonly filled?: boolean | undefined;
}

export interface ChartDataLabels {
  readonly position?: 'outside' | 'top' | 'bottom' | 'middle' | 'auto' | undefined;
  readonly format?: ChartFormat | ((ctx: ChartPointContext) => string) | undefined;
  readonly angle?: number | undefined;
  readonly showZero?: boolean | undefined;
  /** Smart labels: what a label that collides with an earlier one does (series order is priority). */
  readonly overlap?: 'none' | 'hide' | 'rotate90' | 'shiftY' | 'shiftX' | undefined;
  /** Drops a label whose text repeats the previous label of the series. */
  readonly dedupe?: boolean | undefined;
  /** SVG content in place of the label text, placed at the label anchor. */
  readonly render?: ((ctx: ChartPointContext) => ReactNode) | undefined;
}

export interface ChartErrorBars {
  readonly kind: 'fixed' | 'percent' | 'standardDeviation' | 'standardError' | 'custom';
  readonly amount?: number | undefined;
  readonly plusField?: string | undefined;
  readonly minusField?: string | undefined;
  readonly direction?: 'both' | 'plus' | 'minus' | undefined;
  readonly caps?: boolean | undefined;
  /** Error along y (default), x (continuous x axes) or both, with the same kind and amount. */
  readonly axis?: 'y' | 'x' | 'both' | undefined;
}

export interface ChartSegment {
  /** Segment applies to values (x or y per `segmentAxis`) up to and including `until`; the last segment has none. */
  readonly until?: number | undefined;
  readonly color: string;
  readonly lineStyle?: ChartLineStyle | undefined;
}

export interface ChartTrendline {
  readonly kind: 'linear' | 'exponential' | 'logarithmic' | 'polynomial' | 'power' | 'movingAverage';
  readonly order?: number | undefined;
  readonly period?: number | undefined;
  readonly forecast?: { readonly forward?: number | undefined; readonly backward?: number | undefined } | undefined;
  readonly intercept?: number | undefined;
  readonly name?: string | undefined;
  readonly color?: string | undefined;
  /** Markers on the fitted line (default off); a fitted line then samples one point per data point, up to 256. */
  readonly markers?: boolean | ChartMarkers | undefined;
  /** Tooltip and keyboard focus on the line (default: the series' `tooltip`). */
  readonly tooltip?: boolean | undefined;
}

export interface ChartSeriesOptions {
  /** Stable id (default: `name`, then `yField`, then the index). */
  readonly id?: string | undefined;
  readonly type?: ChartSeriesType | undefined;
  readonly name?: string | undefined;
  /** Per-series data (default: the chart `data`). */
  readonly data?: readonly ChartDatum[] | undefined;
  readonly xField?: string | undefined;
  readonly yField?: string | undefined;
  readonly lowField?: string | undefined;
  readonly highField?: string | undefined;
  readonly openField?: string | undefined;
  readonly closeField?: string | undefined;
  readonly volumeField?: string | undefined;
  readonly sizeField?: string | undefined;
  readonly colorField?: string | undefined;
  readonly tooltipField?: string | undefined;
  /** Bullet target field(s). */
  readonly targetField?: string | readonly string[] | undefined;
  /** Bullet target glyphs per target field. */
  readonly targetShapes?: readonly ('line' | 'circle' | 'cross')[] | undefined;
  /** Bullet target data color. */
  readonly targetColor?: string | undefined;
  /** Bullet feature glyph: a bar from zero (default) or a dot at the value. */
  readonly valueShape?: 'bar' | 'dot' | undefined;
  readonly xAxis?: string | undefined;
  readonly yAxis?: string | undefined;
  readonly curve?: ChartCurve | undefined;
  readonly tension?: number | undefined;
  readonly stepPosition?: 'start' | 'center' | 'end' | undefined;
  readonly risers?: boolean | undefined;
  readonly stack?: boolean | 'percent' | undefined;
  readonly stackGroup?: string | undefined;
  /** Band width as a fraction (0..1) of the category or as px (> 1). */
  readonly bandWidth?: number | undefined;
  readonly gap?: number | undefined;
  /** Columns with the same group share a slot (overlap). */
  readonly group?: string | undefined;
  readonly radius?: readonly [number, number] | undefined;
  readonly closed?: boolean | undefined;
  readonly upColor?: string | undefined;
  readonly downColor?: string | undefined;
  readonly hollow?: boolean | undefined;
  readonly totals?: readonly number[] | ((index: number) => boolean) | undefined;
  readonly subtotals?: readonly number[] | ((index: number) => boolean) | undefined;
  readonly connectors?: boolean | undefined;
  readonly binWidth?: number | undefined;
  readonly normalCurve?: boolean | undefined;
  readonly quartileMethod?: 'exclusive' | 'inclusive' | 'normal' | undefined;
  readonly mean?: boolean | undefined;
  readonly outliers?: boolean | undefined;
  readonly errorBars?: ChartErrorBars | undefined;
  /** Pareto cumulative line options (`type: 'pareto'`). */
  readonly pareto?: { readonly line?: boolean | undefined; readonly markers?: boolean | undefined; readonly color?: string | undefined } | undefined;
  readonly segments?: readonly ChartSegment[] | undefined;
  readonly segmentAxis?: 'x' | 'y' | undefined;
  readonly trendlines?: readonly ChartTrendline[] | undefined;
  readonly hidden?: boolean | undefined;
  readonly order?: number | undefined;
  readonly opacity?: number | undefined;
  /** Data color (not a theme token); default: the palette slot. */
  readonly color?: string | undefined;
  readonly lineStyle?: ChartLineStyle | undefined;
  readonly markers?: boolean | ChartMarkers | undefined;
  /** SVG content in place of each marker, centered on the point (`<image>`, any shape). */
  readonly renderMarker?: ((ctx: ChartPointContext) => ReactNode) | undefined;
  readonly labels?: boolean | ChartDataLabels | undefined;
  readonly legendShape?: ChartLegendShape | undefined;
  readonly tooltip?: boolean | undefined;
  /** Point drag and keyboard editing of y values; the change is reported, the application updates `data`. */
  readonly editable?: boolean | { readonly min?: number | undefined; readonly max?: number | undefined; readonly step?: number | undefined } | undefined;
  readonly description?: string | undefined;
  readonly emptyPoints?: 'gap' | 'zero' | 'drop' | 'average' | undefined;
  readonly lastValue?: boolean | { readonly format?: ChartFormat | undefined } | undefined;
  readonly inlineLabel?: boolean | undefined;
  /** Per-point style: data color or hidden. Called only for drawn points. */
  readonly getPointStyle?: ((ctx: ChartPointContext) => { readonly color?: string; readonly hidden?: boolean } | undefined) | undefined;
}

/** A pane row height or column width: px, `'n%'` of the plot, or `{ size }`; unsized panes share the rest. */
export type ChartPaneSize = number | string | { readonly size?: number | string | undefined };

export type ChartScale = 'linear' | 'log' | 'time' | 'category' | 'timeCategory';
export type ChartLabelOverlap = 'none' | 'hide' | 'trim' | 'wrap' | 'stagger' | 'rotate45' | 'rotate90';

export interface ChartAxisBand {
  readonly from: number;
  readonly to: number;
  readonly every?: number | undefined;
  readonly until?: number | undefined;
  readonly layer?: 'behind' | 'over' | undefined;
  readonly label?: string | undefined;
  readonly color?: string | undefined;
  /** Limits the band to a segment of the crossing axis (values on it). */
  readonly crossFrom?: number | undefined;
  readonly crossTo?: number | undefined;
}

export interface ChartAxisLine {
  readonly value: number;
  readonly label?: string | undefined;
  readonly lineStyle?: ChartLineStyle | undefined;
  readonly color?: string | undefined;
}

export interface ChartAxisOptions {
  readonly id?: string | undefined;
  readonly scale?: ChartScale | undefined;
  readonly title?: string | undefined;
  readonly min?: number | Date | undefined;
  readonly max?: number | Date | undefined;
  /** Numeric step, or a calendar interval on time axes. */
  readonly interval?: number | { readonly unit: 'millisecond' | 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'; readonly step: number } | undefined;
  readonly tickCount?: number | undefined;
  readonly includeZero?: boolean | undefined;
  readonly padding?: 'auto' | 'none' | 'normal' | 'additional' | 'round' | undefined;
  readonly base?: number | undefined;
  /** `'start'` (left / bottom) or `'end'` (right / top). */
  readonly position?: 'start' | 'end' | undefined;
  readonly reversed?: boolean | undefined;
  readonly hidden?: boolean | undefined;
  readonly gridLines?: boolean | 'major' | 'both' | undefined;
  readonly minorTicks?: number | undefined;
  readonly labelOverlap?: ChartLabelOverlap | undefined;
  readonly labelAngle?: number | undefined;
  readonly maxLabelWidth?: number | undefined;
  readonly labelPlacement?: 'between' | 'on' | undefined;
  readonly edgeLabels?: 'none' | 'hide' | 'shift' | undefined;
  readonly labelPosition?: 'inside' | 'outside' | undefined;
  readonly tickPosition?: 'inside' | 'outside' | undefined;
  /** Padding in px between the axis ends and the first and last data positions. */
  readonly plotOffset?: number | undefined;
  /** Category axis by point index: duplicate categories stay separate. */
  readonly indexed?: boolean | undefined;
  /** `false` hides the tick marks. */
  readonly ticks?: boolean | undefined;
  /** `false` hides the axis line. */
  readonly line?: boolean | undefined;
  /** Title rotation in degrees (default 0 on horizontal axes, -90 / 90 on vertical ones). */
  readonly titleAngle?: number | undefined;
  readonly format?: ChartFormat | undefined;
  readonly formatLabel?: ((value: unknown) => string) | undefined;
  /** SVG text content for a tick label (a string or `<tspan>`s). */
  readonly renderLabel?: ((ctx: ChartAxisLabelContext) => ReactNode) | undefined;
  /** Grouped labels below the tick labels (multi-level labels). */
  readonly labelGroups?: readonly ChartAxisLabelGroup[] | undefined;
  readonly bands?: readonly ChartAxisBand[] | undefined;
  readonly lines?: readonly ChartAxisLine[] | undefined;
  /** Adjust the computed numeric domain (pure). */
  readonly domain?: ((computed: readonly [number, number]) => readonly [number, number]) | undefined;
  readonly pane?: { readonly row?: number; readonly column?: number; readonly span?: number } | undefined;
  /** Polar and radar x axis: the angle of the first category or value, in degrees clockwise from 12 o'clock. */
  readonly startAngle?: number | undefined;
  /** Draws the axis line where the crossing axis (default: the primary one) has `value`. */
  readonly crossAt?: { readonly value: number | Date; readonly axis?: string | undefined } | undefined;
  /** With `crossAt`, the labels move with the line (default: they stay at the plot edge). */
  readonly labelsAtCross?: boolean | undefined;
}

export interface ChartAxisLabelContext {
  readonly axisId: string;
  readonly value: unknown;
  readonly text: string;
  readonly index: number;
}

export interface ChartAxisLabelGroup {
  readonly levels: readonly { readonly from: number | string; readonly to: number | string; readonly label: string }[];
  readonly border?: 'rectangle' | 'brace' | 'curlyBrace' | 'none' | 'noTop' | 'noTopBottom' | undefined;
}

export interface ChartLegendOptions {
  readonly position?: 'auto' | 'top' | 'bottom' | 'start' | 'end' | undefined;
  readonly title?: string | undefined;
  readonly toggle?: boolean | undefined;
  readonly highlight?: boolean | undefined;
  readonly maxLabelWidth?: number | undefined;
  readonly overflow?: 'wrap' | 'page' | undefined;
  readonly columns?: number | undefined;
  readonly reverse?: boolean | undefined;
  /** Placement along the legend's edge (default `'center'`). */
  readonly align?: 'start' | 'center' | 'end' | undefined;
  /** `'vertical'` lays a top or bottom legend out in one column; side legends are always one column. */
  readonly orientation?: 'horizontal' | 'vertical' | undefined;
  /** `'series'` (default, toggles series), `'point'` (the points of the first series, named by its `tooltipField`, else its x value), `'range'` / `'gradient'` (`colorRanges`); the last three are keys, not toggles. */
  readonly mode?: 'series' | 'point' | 'range' | 'gradient' | undefined;
  /** Custom item content (HTML over the drawing; not part of the exported SVG). */
  readonly renderItem?: ((item: ChartLegendItem) => ReactNode) | undefined;
}

export interface ChartLegendItem {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly hidden: boolean;
  /** The series of a series or point item. */
  readonly seriesId?: string | undefined;
  readonly index?: number | undefined;
}

/** A y value range with its data colors: one color, or several spread across the range. */
export interface ChartColorRange {
  readonly from: number;
  readonly to: number;
  readonly colors: readonly string[];
  readonly label?: string | undefined;
}

export interface ChartTooltipContext {
  readonly header: string;
  readonly points: readonly ChartPointContext[];
}

export interface ChartTooltipOptions {
  /** `'shared'`: one box for every series at the x; `'split'`: one box per series at its own point. */
  readonly mode?: 'point' | 'shared' | 'split' | undefined;
  /** `'nearest'` (default): above the nearest point; `'pointer'`: follows the pointer; `{ x, y }`: fixed drawing px. */
  readonly position?: 'nearest' | 'pointer' | { readonly x: number; readonly y: number } | undefined;
  /** Gap between the anchor and the box, px (default 10). */
  readonly offset?: number | undefined;
  readonly format?: ((ctx: ChartPointContext) => string) | undefined;
  readonly header?: string | ((ctx: ChartTooltipContext) => string) | undefined;
  readonly render?: ((ctx: ChartTooltipContext) => ReactNode) | undefined;
}

export interface ChartCrosshairOptions {
  readonly lines?: 'both' | 'x' | 'y' | undefined;
  readonly snap?: boolean | undefined;
  /** Shades the hovered category band of a category x axis. */
  readonly highlightCategory?: boolean | undefined;
  /** Value labels on the axes at the crosshair lines. */
  readonly axisLabels?: boolean | undefined;
  /** Axis label text; the axis format otherwise. */
  readonly formatLabel?: ((value: unknown, axisId: string) => string) | undefined;
}

export type ChartZoomTool = 'zoom' | 'zoomIn' | 'zoomOut' | 'pan' | 'reset';

export interface ChartZoomOptions {
  readonly wheel?: boolean | undefined;
  readonly selection?: boolean | undefined;
  readonly pan?: boolean | undefined;
  /** Two-finger pinch on touch screens. */
  readonly pinch?: boolean | undefined;
  readonly mode?: 'x' | 'y' | 'xy' | undefined;
  /** Pan moves the drawn series and commits on release instead of laying out every frame. */
  readonly deferred?: boolean | undefined;
  /** Zoom toolbar: `true` for every tool, or the tools to show. */
  readonly toolbar?: boolean | readonly ChartZoomTool[] | undefined;
  readonly toolbarPosition?: 'topEnd' | 'topStart' | 'bottomEnd' | 'bottomStart' | undefined;
}

export type ChartZoomRange = Readonly<Record<string, readonly [number, number]>>;

export interface ChartPointRef {
  readonly seriesId: string;
  readonly index: number;
}

/** A plot position in drawing px with its data values on the x axis and the first y axis. */
export interface ChartPlotPoint {
  readonly x: number;
  readonly y: number;
  /** A category, a `Date` (time axes) or a number; undefined before the chart is interactive. */
  readonly xValue: unknown;
  readonly yValue: unknown;
}

export interface ChartChangeEvent<R extends string = string> {
  readonly source: 'pointer' | 'keyboard' | 'touch' | 'api';
  readonly reason: R;
}

export interface ChartAnnotation {
  readonly x: number | string | Date;
  readonly y: number;
  readonly units?: 'data' | 'pixel' | undefined;
  readonly xAxis?: string | undefined;
  readonly yAxis?: string | undefined;
  readonly content: ReactNode;
}

/** A technical indicator over a series, drawn by the analysis layer. */
export interface ChartIndicator {
  readonly id?: string | undefined;
  readonly kind: 'sma' | 'ema' | 'tma' | 'momentum' | 'rsi' | 'atr' | 'accumulationDistribution' | 'bollinger' | 'macd' | 'stochastic';
  /** The source series (its id, name or yField). */
  readonly seriesId: string;
  /** Default 14 (Bollinger 20). */
  readonly period?: number | undefined;
  /** Value column of an OHLC series; default `'close'` (the y values of other series). */
  readonly field?: 'close' | 'open' | 'high' | 'low' | undefined;
  /** Bollinger band width in standard deviations (default 2). */
  readonly deviations?: number | undefined;
  readonly fastPeriod?: number | undefined;
  readonly slowPeriod?: number | undefined;
  readonly signalPeriod?: number | undefined;
  readonly kPeriod?: number | undefined;
  readonly dPeriod?: number | undefined;
  /** MACD parts (default `'both'`). */
  readonly display?: 'line' | 'histogram' | 'both' | undefined;
  /** RSI and Stochastic overbought / oversold lines and band (default 70 / 30 and 80 / 20). */
  readonly zones?: boolean | { readonly upper?: number | undefined; readonly lower?: number | undefined } | undefined;
  /** Axis for the values: an `axes` entry, usually in its own pane. Oscillators get a secondary axis otherwise. */
  readonly yAxis?: string | undefined;
  readonly name?: string | undefined;
  /** Data color, not a theme token. */
  readonly color?: string | undefined;
}

export interface ChartExportOptions {
  /** Image, table (`csv`; `xlsx` through `exportWriters.xlsx`) or vector PDF (through `exportWriters.pdf`). */
  readonly format?: 'png' | 'jpeg' | 'svg' | 'csv' | 'xlsx' | 'pdf' | undefined;
  readonly fileName?: string | undefined;
  readonly scale?: number | undefined;
  /** PDF page orientation; default landscape when the drawing is wider than tall. */
  readonly orientation?: 'portrait' | 'landscape' | undefined;
  /** PDF page size (`a4`, `letter`, ...). Default `a4`. */
  readonly pageSize?: string | undefined;
  /** CSV: neutralize spreadsheet formulas in text cells. Default true; `false` writes raw text. */
  readonly escapeFormulas?: boolean | undefined;
}

/** Writer loaders of `api.export`: dynamic imports of `@salmonui/export` subpaths. */
export type ChartExportWriters = VizExportWriters;

/** A feature value from `@salmonui/charts/chart/features`. */
export interface ChartFeature {
  readonly name: string;
}

export interface ChartApi {
  readonly element: HTMLElement | null;
  export(options?: ChartExportOptions): Promise<void>;
  toBlob(format?: 'png' | 'jpeg' | 'svg'): Promise<Blob>;
  toDataURL(format?: 'png' | 'jpeg' | 'svg'): Promise<string>;
  toSVGString(): string;
  print(): Promise<void>;
  focus(): void;
  resetZoom(): void;
  showTooltip(point: ChartPointRef): void;
  hideTooltip(): void;
  /** Shows the crosshair at a point, or at data values (`x` an axis value, `y` a y value). */
  showCrosshair(at: ChartPointRef | { readonly x: unknown; readonly y?: number | undefined }): void;
  hideCrosshair(): void;
  /** Streams points into a series without a React render (`maxPoints` keeps a window). */
  appendPoints(seriesId: string, points: readonly ChartDatum[], options?: { readonly maxPoints?: number }): void;
}

export interface ChartText {
  readonly chart: string;
  readonly noData: string;
  readonly legend: string;
  readonly table: string;
  readonly moreRows: (count: number) => string;
  /** Zoom toolbar names. */
  readonly zoomToolbar: string;
  readonly zoomTool: string;
  readonly zoomIn: string;
  readonly zoomOut: string;
  readonly pan: string;
  readonly resetZoom: string;
  /** Legend page buttons. */
  readonly previousLegendPage: string;
  readonly nextLegendPage: string;
}

/** DOM handlers passed to the `<figure>` root. */
export type ChartRootHandlers = Pick<DOMAttributes<HTMLElement>, 'onClick' | 'onDoubleClick' | 'onContextMenu' | 'onPointerDown' | 'onPointerUp' | 'onPointerMove' | 'onPointerLeave'>;

export interface ChartProps extends ChartRootHandlers {
  /** Accessible name of the chart; wins over `title` and the generated summary. */
  readonly 'aria-label'?: string | undefined;
  /** Id of the element naming the chart; wins over `aria-label`. */
  readonly 'aria-labelledby'?: string | undefined;
  readonly data?: readonly ChartDatum[] | undefined;
  readonly series?: readonly ChartSeriesOptions[] | undefined;
  readonly xAxis?: ChartAxisOptions | undefined;
  readonly yAxis?: ChartAxisOptions | undefined;
  /** Additional axes referenced by `series.xAxis` / `series.yAxis` (id required). */
  readonly axes?: readonly (ChartAxisOptions & { readonly id: string; readonly direction: 'x' | 'y' })[] | undefined;
  readonly panes?: { readonly rows?: readonly ChartPaneSize[]; readonly columns?: readonly ChartPaneSize[] } | undefined;
  readonly orientation?: 'vertical' | 'horizontal' | undefined;
  /** Polar (circles) or radar (polygons) coordinates; x is the angle, y the radius. */
  readonly coordinate?: 'cartesian' | 'polar' | 'radar' | undefined;
  /** Polar radius as a fraction (0..1) of the largest circle that fits. */
  readonly radius?: number | undefined;
  /** Preloaded features from `@salmonui/charts/chart/features`: `polar` renders polar charts on the server. */
  readonly features?: readonly ChartFeature[] | undefined;
  readonly grouping?: 'sideBySide' | 'overlap' | undefined;
  readonly title?: string | undefined;
  readonly subtitle?: string | undefined;
  readonly description?: string | undefined;
  readonly legend?: boolean | ChartLegendOptions | undefined;
  readonly tooltip?: boolean | ChartTooltipOptions | undefined;
  readonly crosshair?: boolean | ChartCrosshairOptions | undefined;
  readonly zoom?: boolean | ChartZoomOptions | undefined;
  readonly zoomRange?: ChartZoomRange | undefined;
  readonly defaultZoomRange?: ChartZoomRange | undefined;
  readonly onZoomRangeChange?: ((range: ChartZoomRange, event: ChartChangeEvent<'wheel' | 'selection' | 'pan' | 'pinch' | 'keyboard' | 'toolbar' | 'scrollbar' | 'reset'>) => void) | undefined;
  /** The committed visible range of a continuous axis changed: fetch data for it. Fires on commit, never per frame. */
  readonly onVisibleRangeChange?: ((change: { readonly axisId: string; readonly range: readonly [number, number] }) => void) | undefined;
  readonly hiddenSeries?: readonly string[] | undefined;
  readonly defaultHiddenSeries?: readonly string[] | undefined;
  readonly onHiddenSeriesChange?: ((ids: readonly string[], event: ChartChangeEvent<'legend'>) => void) | undefined;
  readonly selection?: boolean | { readonly mode?: 'point' | 'series' | 'cluster' | 'range' | 'lasso'; readonly multiple?: boolean; readonly axis?: 'x' | 'y' | 'xy' } | undefined;
  /** Range and lasso selection finished: `ranges` per axis id (range mode) and the enclosed points. */
  readonly onRangeSelect?: ((selection: { readonly ranges: ChartZoomRange; readonly points: readonly ChartPointRef[] }, event: ChartChangeEvent<'range' | 'lasso'>) => void) | undefined;
  readonly selectedPoints?: readonly ChartPointRef[] | undefined;
  readonly defaultSelectedPoints?: readonly ChartPointRef[] | undefined;
  readonly onSelectedPointsChange?: ((points: readonly ChartPointRef[], event: ChartChangeEvent<'click' | 'keyboard' | 'range' | 'lasso' | 'sync'>) => void) | undefined;
  readonly highlight?: 'series' | 'point' | 'cluster' | false | undefined;
  readonly onPointClick?: ((ctx: ChartPointContext, event: MouseEvent) => void) | undefined;
  /** Any click on the plot, with data coordinates. */
  readonly onPlotClick?: ((point: ChartPlotPoint, event: MouseEvent) => void) | undefined;
  /** Pointer moves over the plot, with data coordinates; called per move (keep it cheap). */
  readonly onPlotPointerMove?: ((point: ChartPlotPoint, event: PointerEvent) => void) | undefined;
  readonly onPointHover?: ((ctx: ChartPointContext | null) => void) | undefined;
  /** An editable point was dragged or moved by keyboard. */
  readonly onPointChange?: ((change: { readonly seriesId: string; readonly index: number; readonly value: number }, event: ChartChangeEvent<'drag' | 'keyboard'>) => void) | undefined;
  readonly onPointDoubleClick?: ((ctx: ChartPointContext, event: MouseEvent) => void) | undefined;
  /** A tick label was clicked. */
  readonly onAxisLabelClick?: ((ctx: ChartAxisLabelContext, event: MouseEvent) => void) | undefined;
  /** A multi-level label cell was clicked. */
  readonly onAxisLabelGroupClick?: ((ctx: { readonly axisId: string; readonly group: number; readonly level: number; readonly label: string }, event: MouseEvent) => void) | undefined;
  readonly onResize?: ((size: { readonly width: number; readonly height: number }) => void) | undefined;
  readonly annotations?: readonly ChartAnnotation[] | undefined;
  /** Technical indicators; needs `features={[technicalIndicators]}` from `@salmonui/charts/chart/indicators`. */
  readonly indicators?: readonly ChartIndicator[] | undefined;
  readonly stackLabels?: boolean | { readonly format?: ChartFormat | undefined } | undefined;
  readonly palette?: readonly string[] | undefined;
  /** Point colors by y value range, shared with `legend.mode: 'range' | 'gradient'`. */
  readonly colorRanges?: readonly ChartColorRange[] | undefined;
  readonly renderer?: 'svg' | 'canvas' | 'auto' | undefined;
  readonly decimation?: 'auto' | 'lttb' | 'minMax' | false | undefined;
  readonly accessibleTable?: boolean | undefined;
  readonly showDataTable?: boolean | undefined;
  readonly renderEmpty?: (() => ReactNode) | undefined;
  readonly animated?: boolean | undefined;
  readonly locale?: string | undefined;
  readonly timeZone?: string | undefined;
  readonly text?: Partial<ChartText> | undefined;
  readonly width?: number | undefined;
  /** Drawing height in px (default 300). */
  readonly height?: number | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  /** Loaders of the PDF and XLSX writers: dynamic imports of @salmonui/export `graphics` and `xlsx` subpaths. */
  readonly exportWriters?: ChartExportWriters | undefined;
  readonly ref?: Ref<ChartApi> | undefined;
  readonly children?: ReactNode;
}
