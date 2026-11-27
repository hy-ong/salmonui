import type { CSSProperties, ReactNode, Ref } from 'react';
import type { VizChangeEvent } from '../internal/viz/frame.js';
import type { VizInstance } from '../internal/viz/instance.js';

export type HeatMapApi = VizInstance;
export type HeatMapChangeEvent = VizChangeEvent<'click' | 'keyboard' | 'legend'>;

export interface HeatMapLabelGroup {
  /** First and last category index covered (inclusive). */
  readonly from: number;
  readonly to: number;
  readonly text: string;
}

export interface HeatMapAxis {
  /** How keys are ordered and formatted. Default `category` (first seen order). */
  readonly scale?: 'category' | 'linear' | 'time' | undefined;
  /** Explicit category labels (table data), in order. */
  readonly labels?: readonly string[] | undefined;
  /** Numeric / time axes: keep keys in [min, max]. */
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  /** Show every `interval`-th label. */
  readonly interval?: number | undefined;
  /** Label format for numeric and time keys. */
  readonly format?: Intl.NumberFormatOptions | Intl.DateTimeFormatOptions | ((value: string) => string) | undefined;
  readonly labelOverlap?: 'none' | 'hide' | 'trim' | 'wrap' | 'rotate45' | 'rotate90' | undefined;
  readonly maxLabelWidth?: number | undefined;
  /** x: `bottom` | `top`; y: `start` | `end`. */
  readonly position?: 'bottom' | 'top' | 'start' | 'end' | undefined;
  readonly reversed?: boolean | undefined;
  readonly title?: string | undefined;
  /** Multi-level labels below (x) or beside (y) the axis labels. */
  readonly labelGroups?: readonly HeatMapLabelGroup[] | undefined;
}

export interface HeatMapStop {
  readonly value: number;
  /** Data color. */
  readonly color: string;
  readonly label?: string | undefined;
}

export interface HeatMapColorScale {
  readonly kind?: 'gradient' | 'steps' | undefined;
  /** Data values (domain `all`) or positions 0..1 (domain `row` / `column`). */
  readonly stops?: readonly HeatMapStop[] | undefined;
  /** Normalize per table, row or column. Default `all`. */
  readonly domain?: 'all' | 'row' | 'column' | undefined;
  /** Color of values outside the stop range (steps); default the end stops. */
  readonly outOfRange?: string | undefined;
}

export interface HeatMapCell {
  readonly x: number;
  readonly y: number;
  readonly xKey: string;
  readonly yKey: string;
  /** NaN for an empty cell. */
  readonly value: number;
  readonly size: number | null;
  readonly color: string;
}

export interface HeatMapCellRef {
  readonly x: number;
  readonly y: number;
}

export interface HeatMapCellsOptions {
  readonly labels?: boolean | undefined;
  readonly format?: Intl.NumberFormatOptions | ((value: number) => string) | undefined;
  readonly shape?: 'rect' | 'bubble' | undefined;
  readonly bubble?: 'size' | 'color' | 'sizeAndColor' | 'sector' | undefined;
  /** Dim other cells on hover. Default true. */
  readonly highlight?: boolean | undefined;
}

export interface HeatMapLegendOptions {
  readonly position?: 'top' | 'bottom' | 'start' | 'end' | undefined;
  readonly title?: string | undefined;
  readonly labels?: 'all' | 'edge' | 'none' | undefined;
  readonly format?: ((value: number) => string) | undefined;
  /** Steps legend items toggle cells of that step. Default true. */
  readonly toggle?: boolean | undefined;
}

/** Built-in text of a HeatMap (`text` prop; the `heatMap` entry of a `LocaleProvider` catalog). */
export interface HeatMapText {
  /** Name and role description of the cell grid when there is no `title`. Default `"Heat map"`. */
  readonly heatMap: string;
  readonly legend: string;
  /** Data table headers without axis titles, and the value column. */
  readonly column: string;
  readonly row: string;
  readonly value: string;
  /** A cell without a value. */
  readonly noValue: string;
}

export interface HeatMapProps {
  /** A 2D table (`data[row][column]`) or records with `xField` / `yField` / `valueField`. */
  readonly data: readonly unknown[];
  readonly xField?: string | undefined;
  readonly yField?: string | undefined;
  readonly valueField?: string | undefined;
  /** Bubble size value. */
  readonly sizeField?: string | undefined;
  readonly xAxis?: HeatMapAxis | undefined;
  readonly yAxis?: HeatMapAxis | undefined;
  readonly colorScale?: HeatMapColorScale | undefined;
  readonly cells?: HeatMapCellsOptions | undefined;
  readonly legend?: boolean | HeatMapLegendOptions | undefined;
  readonly tooltip?: boolean | { readonly render?: ((cell: HeatMapCell) => ReactNode) | undefined } | undefined;
  readonly selection?: boolean | { readonly multiple?: boolean | undefined } | undefined;
  readonly selectedCells?: readonly HeatMapCellRef[] | undefined;
  readonly defaultSelectedCells?: readonly HeatMapCellRef[] | undefined;
  readonly onSelectedCellsChange?: ((cells: readonly HeatMapCellRef[], event: HeatMapChangeEvent) => void) | undefined;
  /** Indices of `steps` stops whose cells are hidden (legend toggles). */
  readonly hiddenItems?: readonly number[] | undefined;
  readonly defaultHiddenItems?: readonly number[] | undefined;
  readonly onHiddenItemsChange?: ((hidden: readonly number[], event: HeatMapChangeEvent) => void) | undefined;
  readonly onCellClick?: ((cell: HeatMapCell, event: HeatMapChangeEvent) => void) | undefined;
  readonly onCellDoubleClick?: ((cell: HeatMapCell) => void) | undefined;
  readonly onCellHover?: ((cell: HeatMapCell | null) => void) | undefined;
  /** Cell label text. */
  readonly formatCell?: ((cell: HeatMapCell) => string) | undefined;
  /** Cell data color override. */
  readonly getCellStyle?: ((cell: HeatMapCell) => { readonly color?: string | undefined } | undefined) | undefined;
  /** `auto` draws marks on canvas from 10,000 cells. Default `auto`. */
  readonly renderer?: 'svg' | 'canvas' | 'auto' | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly title?: string | undefined;
  readonly subtitle?: string | undefined;
  readonly description?: string | undefined;
  readonly locale?: string | undefined;
  /** Built-in text (over the nearest `LocaleProvider`'s `heatMap` entry). */
  readonly text?: Partial<HeatMapText> | undefined;
  readonly timeZone?: string | undefined;
  readonly showDataTable?: boolean | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly id?: string | undefined;
  readonly ref?: Ref<HeatMapApi> | undefined;
  readonly onResize?: ((size: { readonly width: number; readonly height: number }) => void) | undefined;
  /**
   * Entrance and update transitions, default `true`: client only
   * (never in server markup), off under `prefers-reduced-motion`. The CSS is
   * the opt-in `@salmonui/charts/viz-animations.css`.
   */
  readonly animated?: boolean | undefined;
}
