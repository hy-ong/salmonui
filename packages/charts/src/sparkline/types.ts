import type { CSSProperties, KeyboardEvent, MouseEvent, ReactElement, ReactNode, Ref } from 'react';

export type SparklineType = 'line' | 'area' | 'column' | 'winLoss';
export type SparklinePointKind = 'high' | 'low' | 'first' | 'last' | 'negative';

/** A highlight: `true` uses the semantic seed color, a string is a data color. */
export type SparklineHighlight = boolean | string;

export interface SparklinePoint {
  readonly index: number;
  /** The x value (index, category position or epoch ms). */
  readonly x: number;
  readonly y: number;
  /** The record (or the number) at this index. */
  readonly datum: unknown;
  /** Highlight kinds this point carries. */
  readonly kinds: readonly SparklinePointKind[];
}

export interface SparklinePointStyle {
  /** Data color of the point (column, win-loss bar or marker). */
  readonly color?: string | undefined;
  readonly hidden?: boolean | undefined;
}

export interface SparklineTooltipOptions {
  readonly format?: ((point: SparklinePoint) => string) | undefined;
  readonly render?: ((point: SparklinePoint) => ReactNode) | undefined;
  /** Vertical track line at the hovered point. Default true. */
  readonly trackLine?: boolean | undefined;
}

export interface SparklineBand {
  readonly from: number;
  readonly to: number;
  /** Data color; default the neutral band color. */
  readonly color?: string | undefined;
}

export interface SparklinePointEvent {
  readonly point: SparklinePoint;
  readonly source: 'pointer' | 'keyboard';
  readonly nativeEvent: MouseEvent | KeyboardEvent | PointerEvent;
}

/** Draws the mark elements (`<path>`, `<rect>`, `<circle>`) on a canvas of `width` x `height` drawing px. */
export type SparklineCanvasRenderer = (canvas: HTMLCanvasElement, marks: readonly ReactElement[], width: number, height: number) => void;

export interface SparklineProps {
  /** Numbers, or records read through `xField` / `yField`. */
  readonly data: readonly unknown[];
  readonly xField?: string | undefined;
  readonly yField?: string | undefined;
  /** How x values are read: data index / category order (`linear` without `xField`, `category`) or epoch ms (`time`). */
  readonly scale?: 'linear' | 'category' | 'time' | undefined;
  readonly type?: SparklineType | undefined;
  /** Drawing size in px; the SVG scales to its box through `viewBox`. Default 100 x 24. */
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  /** Series data color. Default the primary seed. */
  readonly color?: string | undefined;
  /** Data colors for column and win-loss bars, by index. */
  readonly palette?: readonly string[] | undefined;
  /** Win-loss tie color (data color). */
  readonly tieColor?: string | undefined;
  readonly highlights?: Partial<Record<SparklinePointKind, SparklineHighlight>> | undefined;
  readonly markers?: 'all' | readonly SparklinePointKind[] | undefined;
  readonly labels?: 'all' | readonly SparklinePointKind[] | undefined;
  /** Label and tooltip number format. */
  readonly format?: Intl.NumberFormatOptions | ((value: number) => string) | undefined;
  readonly locale?: string | undefined;
  readonly bands?: readonly SparklineBand[] | undefined;
  readonly domain?: { readonly x?: readonly [number, number] | undefined; readonly y?: readonly [number, number] | undefined } | undefined;
  /** Value of the axis line (and the column / area base). Default 0 when the data crosses it, else none. */
  readonly baseline?: number | undefined;
  /** Range padding around the y extent. Default `normal` (half a marker). */
  readonly padding?: 'none' | 'normal' | 'additional' | undefined;
  readonly tooltip?: boolean | SparklineTooltipOptions | undefined;
  readonly getPointStyle?: ((point: SparklinePoint) => SparklinePointStyle | undefined) | undefined;
  readonly onPointClick?: ((event: SparklinePointEvent) => void) | undefined;
  readonly onPointHover?: ((event: SparklinePointEvent | null) => void) | undefined;
  /**
   * Entrance transition, default `true`: set on commit (never in
   * server markup), off under `prefers-reduced-motion`; the CSS is the opt-in
   * `@salmonui/charts/viz-animations.css`.
   */
  readonly animated?: boolean | undefined;
  /**
   * Mark renderer, default `'svg'`. `'canvas'` draws the line, area,
   * bars and markers on a canvas (bands, the axis line and labels stay SVG);
   * `'auto'` switches at 20,000 points. Canvas needs `canvasRenderer`, else
   * the marks stay SVG.
   */
  readonly renderer?: 'svg' | 'canvas' | 'auto' | undefined;
  /** The canvas mark layer: `sparklineCanvas` from `@salmonui/charts/sparkline/canvas` (opt-in, so `/sparkline` stays small). */
  readonly canvasRenderer?: SparklineCanvasRenderer | undefined;
  /** Accessible name; default the automatic summary. */
  readonly label?: string | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  /** The root `<svg>`. */
  readonly ref?: Ref<SVGSVGElement> | undefined;
  readonly id?: string | undefined;
}
